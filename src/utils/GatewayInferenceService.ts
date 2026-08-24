import GatewayStore from "../store/GatewayStore";
import LogS from "./LogService";

// WHICH NODES ARE GATEWAYS, without any firmware change. Two INDEPENDENT detectors,
// deliberately kept apart because only the first one is a proof:
//   D1  - the gw bit plus the route path        -> certain, counted in the registry
//   D1b - advertised neighbours vs. what we saw -> "probably", shown but not counted
//
// ---------------------------------------------------------------------------------
// D1 - THE GW BIT AND THE PATH
//
// The gw bit (byte 6, 0x80 = `msg_server`) is the network-wide loop protection. A node
// sets it only when it RELAYS as a gateway (`bGATEWAY && node_hasIPaddress`) or when it
// INJECTS a message from the internet; `initAPRS` clears it for everything a node
// generates itself. So gw=1 proves "somebody in this chain is a gateway" - and the route
// path says who:
//
//   path            verdict
//   ORIGIN,X        X. It is the only relay, so X is the one that set the bit. CERTAIN,
//                   and independent of whether the origin is local.
//   ORIGIN,X,...    X, but only when the origin is NOT confirmed HF-local (frozen
//                   gwState 'solid'): then the message came out of the internet, and the
//                   node that put it on our air is the first relay. Rests on the field
//                   observation that the server STRIPS the path, so what we see begins at
//                   the injection point.
//   ORIGIN,X,...    UNDECIDABLE while the origin IS confirmed HF-local ('dim'): the
//                   message travelled by RF, and any relay in the chain could have been
//                   the one that additionally gatewayed it. Deliberately recorded as
//                   nothing - this is the case D1b below is meant to resolve.
//
// One-sided by design: we only ever ADD gateways, never clear one. A node that gatewayed
// once is a gateway; the counts say how busy it is, not whether it still is one.
//
// Two figures per gateway, like RelayCountService: the session count (RAM) and an all-time
// count replayed on startup from the stored messages, so it survives a restart - bounded
// by the retention settings, like everything else that comes out of the database.
//
// ---------------------------------------------------------------------------------
// D1b - ADVERTISED NEIGHBOURS VS. THE SENDERS WE SAW ENTER THE AIR THROUGH A NODE
// (idea DL9SAU)
//
// Whoever stands IMMEDIATELY BEFORE X in a path was heard by X directly - X had to
// receive it in order to relay it - UNLESS X fed it in from the internet. So the set of
// senders we observe at path position 0 -> 1 for X is normally a SUBSET of X's own Mheard
// list, and the node advertises the SIZE of exactly that list itself (position "/N" field,
// Mheard NCNT). Therefore:
//
//   observed senders in front of X  >  advertised neighbour count  =>  X injects  =>  GW
//
// Sharpest at N1, where the second differing sender already gives it away. One-sided like
// D1: our view is normally the subset, so only an OVERSHOOT means anything - an undershoot
// is the everyday case and says nothing.
//
// Two caveats keep this at "probably" instead of "certainly":
//   - NCNT is a SELF-REPORT. We take the node's word for it.
//   - the firmware PURGES an Mheard entry after 12 h, so the number covers a window, not
//     the node's history.
// The window is handled honestly: a report of n neighbours made at time T covers what the
// node heard in [T-12h, T], so only senders we observed in that same interval are compared
// against it. Fresh observations simply wait for the node's next beacon. What remains is
// the trust in the self-report, which is why the result stays out of the D1 registry, does
// not colour the map, and is labelled "probably".
//
// Fed from BOTH position and message paths on purpose. Positions are never injected, so
// they contribute only genuine RF neighbours - but they fill the observed set quickly, and
// it is the SIZE of that set that has to overshoot. Restricting it to messages would need
// several injections before the same node gives itself away.

// the firmware drops an Mheard entry after 12 h -> the advertised count covers exactly
// this much history, and so does the set we compare against it
const MHEARD_WINDOW_MS = 12 * 60 * 60 * 1000;
// how far the observation has to overshoot the advertised count. 1 = the plain anomaly
// ("one sender more than the node says it can hear"), which is what makes N1 sharp. Raise
// it if field data shows the firmware leaving directly heard senders out of its own list.
const MIN_EXCESS = 1;

class GatewayInferenceService {
    private session = new Map<string, number>();
    private all = new Map<string, number>();
    // the subset that came out of the network: frozen gwState 'solid' means the ORIGIN was
    // not HF-confirmed, so this node injected it instead of passing on air traffic. The gw
    // bit alone cannot tell the two apart - it is set for both.
    private sessionInj = new Map<string, number>();
    private allInj = new Map<string, number>();
    // gw=1 with NOBODY in the path. Should not happen: the origin does not set the bit for
    // its own traffic, so somebody must have relayed it. If this ever fires, an injecting
    // gateway does NOT append itself to the path - which would also mean the globe's
    // "0 hops = heard the sender's own RF" assumption needs revisiting. Logged, not acted on.
    private noRelayAnomalies = 0;

    // --- D1b state ---
    // X -> (sender seen directly in front of X -> when we last saw it there)
    private firstHop = new Map<string, Map<string, number>>();
    // X -> the neighbour count X last advertised, and when. The larger value wins while two
    // reports fall into the same 12 h window (position "/N" and Mheard NCNT are two sources
    // for the same list): a higher advertised count is the conservative direction, it can
    // only cost us a verdict, never invent one.
    private advertised = new Map<string, { n: number, ts: number }>();
    // X -> the numbers that made us call it a probable gateway
    private probable = new Map<string, { seen: number, advertised: number }>();

    private norm(c: string): string { return (c || "").toUpperCase().trim(); }

    // "ORIGIN > RELAY1 > RELAY2" (as persisted) -> ["ORIGIN", "RELAY1", "RELAY2"]
    private splitVia(via: string): string[] {
        return (via || "").split(" > ").map(c => this.norm(c)).filter(c => c !== "");
    }

    // The node this message makes a gateway, or "" when it decides nothing.
    // `path` is "origin + every relay", i.e. path[0] is the sender itself.
    private verdict(gw: number, gwState: string, path: string[]): string {
        if (gw !== 1) return "";                    // no bit: pure HF, says nothing at all
        const relays = (path || []).slice(1).map(c => this.norm(c)).filter(c => c !== "");
        if (relays.length === 0) {
            if (gw === 1 && (path || []).length > 0) this.noRelayAnomalies++;
            return "";
        }
        if (relays.length === 1) return relays[0];  // the only relay set the bit
        return gwState === 'solid' ? relays[0] : "";
    }

    private bump(map: Map<string, number>, call: string) {
        map.set(call, (map.get(call) ?? 0) + 1);
    }

    // a live message: grows both the session and the all-time count
    note(gw: number, gwState: string, path: string[], ownCall: string) {
        const call = this.verdict(gw, gwState, path);
        if (call === "" || call === this.norm(ownCall)) return;
        // first hard proof for this node? Then say so when D1b had called it already -
        // that is the field check on the heuristic, and it costs one line in the log.
        const firstProof = !this.all.has(call) && !this.session.has(call);
        this.bump(this.session, call);
        this.bump(this.all, call);
        if (gwState === 'solid') { this.bump(this.sessionInj, call); this.bump(this.allInj, call); }
        if (firstProof && this.probable.has(call))
            LogS.log(0, `Gateway ${call}: D1b said "probably" before D1 proved it`);
        const sc = this.session.get(call) ?? 0, ac = this.all.get(call) ?? 0;
        const si = this.sessionInj.get(call) ?? 0, ai = this.allInj.get(call) ?? 0;
        GatewayStore.update(s => {
            s.counts = { ...s.counts, [call]: sc };
            s.max = { ...s.max, [call]: ac };
            s.inj = { ...s.inj, [call]: si };
            s.injMax = { ...s.injMax, [call]: ai };
        });
    }

    // startup replay from a stored message: all-time only, so the session count stays the
    // live value while "(max N)" already reflects the history right after a restart
    seed(gw: number, gwState: string, via: string, ownCall: string) {
        const call = this.verdict(gw, gwState, this.splitVia(via));
        if (call === "" || call === this.norm(ownCall)) return;
        this.bump(this.all, call);
        if (gwState === 'solid') this.bump(this.allInj, call);
    }

    // --- D1b ------------------------------------------------------------------------

    // D1b input 1: one route path we have seen (live or replayed), with the time it was
    // heard. Only position 0 -> 1 is of interest: the first relay is where an injection
    // enters our air, and it is the one whose Mheard list the sender has to be in.
    observePath(path: string[], ts: number, ownCall: string) {
        const p = (path || []).map(c => this.norm(c)).filter(c => c !== "");
        if (p.length < 2 || !(ts > 0)) return;
        const sender = p[0], hop = p[1];
        const own = this.norm(ownCall);
        if (sender === hop || hop === own || sender === own) return;
        let set = this.firstHop.get(hop);
        if (!set) { set = new Map<string, number>(); this.firstHop.set(hop, set); }
        if ((set.get(sender) ?? 0) < ts) set.set(sender, ts);
        // drop what no Mheard list would still hold, so the map cannot grow without end
        const cutoff = ts - MHEARD_WINDOW_MS;
        set.forEach((seen, call) => { if (seen < cutoff) set!.delete(call); });
        this.evaluate(hop);
    }

    // same, from a persisted "ORIGIN > RELAY1 > ..." string (messages and positions)
    observeVia(via: string, ts: number, ownCall: string) {
        this.observePath(this.splitVia(via), ts, ownCall);
    }

    // D1b input 2: the node's own statement about how many stations it hears (position
    // "/N" field, Mheard NCNT). 0 means "not reported", not "no neighbours".
    noteAdvertised(call: string, n: number, ts: number) {
        const c = this.norm(call);
        if (c === "" || n <= 0 || !(ts > 0)) return;
        const prev = this.advertised.get(c);
        if (prev && ts < prev.ts) return;                       // an older report, ignore
        const n_ = (prev && ts - prev.ts < MHEARD_WINDOW_MS) ? Math.max(n, prev.n) : n;
        this.advertised.set(c, { n: n_, ts });
        this.evaluate(c);
    }

    // compare the two for one node. Only senders inside the window the report covers count,
    // so a fresh observation is not held against a number the node gave before it.
    private evaluate(call: string) {
        const adv = this.advertised.get(call);
        const senders = this.firstHop.get(call);
        if (!adv || !senders) return;
        if (this.isGateway(call)) return;           // D1 has it - "probably" adds nothing
        const from = adv.ts - MHEARD_WINDOW_MS;
        let seen = 0;
        senders.forEach(ts => { if (ts >= from && ts <= adv.ts) seen++; });
        if (seen < adv.n + MIN_EXCESS) return;
        const prev = this.probable.get(call);
        if (prev && prev.seen === seen && prev.advertised === adv.n) return;   // unchanged
        this.probable.set(call, { seen, advertised: adv.n });
        GatewayStore.update(s => {
            s.probable = { ...s.probable, [call]: { seen, advertised: adv.n } };
        });
        if (!prev)
            LogS.log(0, `Gateway (D1b): ${call} put ${seen} different senders on our air ` +
                `within 12h but advertises only ${adv.n} neighbour(s) -> probably a gateway`);
    }

    // push the replayed counts to the store in ONE update (the seed runs over every stored
    // message, so updating per row would re-render the map for each of them), then let D1b
    // judge everything we replayed - paths and advertised counts are both in by now.
    seedDone() {
        if (this.all.size > 0) {
            const max: { [k: string]: number } = {};
            this.all.forEach((n, c) => { max[c] = n; });
            const injMax: { [k: string]: number } = {};
            this.allInj.forEach((n, c) => { injMax[c] = n; });
            GatewayStore.update(s => {
                s.max = { ...max, ...s.max };
                s.injMax = { ...injMax, ...s.injMax };
            });
            LogS.log(0, `Gateway registry seeded: ${this.all.size} gateway(s) from stored messages`);
        }
        if (this.noRelayAnomalies > 0)
            LogS.log(1, `Gateway registry: ${this.noRelayAnomalies} message(s) carried the gw bit with an empty path`);
        this.firstHop.forEach((_, call) => this.evaluate(call));
    }

    isGateway(call: string): boolean {
        const c = this.norm(call);
        return (this.all.get(c) ?? 0) > 0 || (this.session.get(c) ?? 0) > 0;
    }

    getCount(call: string): number { return this.session.get(this.norm(call)) ?? 0; }
    getMax(call: string): number { return this.all.get(this.norm(call)) ?? 0; }
    getInjected(call: string): number { return this.sessionInj.get(this.norm(call)) ?? 0; }

    // D1b verdict for one node, or undefined while it never overshot its own number
    getProbable(call: string): { seen: number, advertised: number } | undefined {
        return this.probable.get(this.norm(call));
    }

    clear() {
        this.session.clear();
        this.all.clear();
        this.sessionInj.clear();
        this.allInj.clear();
        this.noRelayAnomalies = 0;
        this.firstHop.clear();
        this.advertised.clear();
        this.probable.clear();
        GatewayStore.update(s => { s.counts = {}; s.max = {}; s.inj = {}; s.injMax = {}; s.probable = {}; });
    }
}

export default new GatewayInferenceService();
