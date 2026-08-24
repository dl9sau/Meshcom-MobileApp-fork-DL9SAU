import GatewayStore from "../store/GatewayStore";
import LogS from "./LogService";

// D1 - WHICH NODES ARE GATEWAYS, without any firmware change.
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
//                   nothing - D1b (advertised NCNT vs. observed senders) is meant to
//                   resolve exactly this case.
//
// One-sided by design: we only ever ADD gateways, never clear one. A node that gatewayed
// once is a gateway; the counts say how busy it is, not whether it still is one.
//
// Two figures per gateway, like RelayCountService: the session count (RAM) and an all-time
// count replayed on startup from the stored messages, so it survives a restart - bounded
// by the retention settings, like everything else that comes out of the database.
class GatewayService {
    private session = new Map<string, number>();
    private all = new Map<string, number>();
    // gw=1 with NOBODY in the path. Should not happen: the origin does not set the bit for
    // its own traffic, so somebody must have relayed it. If this ever fires, an injecting
    // gateway does NOT append itself to the path - which would also mean the globe's
    // "0 hops = heard the sender's own RF" assumption needs revisiting. Logged, not acted on.
    private noRelayAnomalies = 0;

    private norm(c: string): string { return (c || "").toUpperCase().trim(); }

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
        this.bump(this.session, call);
        this.bump(this.all, call);
        const sc = this.session.get(call) ?? 0, ac = this.all.get(call) ?? 0;
        GatewayStore.update(s => {
            s.counts = { ...s.counts, [call]: sc };
            s.max = { ...s.max, [call]: ac };
        });
    }

    // startup replay from a stored message: all-time only, so the session count stays the
    // live value while "(max N)" already reflects the history right after a restart
    seed(gw: number, gwState: string, via: string, ownCall: string) {
        const path = (via || "").split(" > ").map(c => c.trim()).filter(c => c !== "");
        const call = this.verdict(gw, gwState, path);
        if (call === "" || call === this.norm(ownCall)) return;
        this.bump(this.all, call);
    }

    // push the replayed counts to the store in ONE update (the seed runs over every stored
    // message, so updating per row would re-render the map for each of them)
    seedDone() {
        if (this.all.size === 0) return;
        const max: { [k: string]: number } = {};
        this.all.forEach((n, c) => { max[c] = n; });
        GatewayStore.update(s => { s.max = { ...max, ...s.max }; });
        LogS.log(0, `Gateway registry seeded: ${this.all.size} gateway(s) from stored messages`);
        if (this.noRelayAnomalies > 0)
            LogS.log(1, `Gateway registry: ${this.noRelayAnomalies} message(s) carried the gw bit with an empty path`);
    }

    isGateway(call: string): boolean {
        const c = this.norm(call);
        return (this.all.get(c) ?? 0) > 0 || (this.session.get(c) ?? 0) > 0;
    }

    getCount(call: string): number { return this.session.get(this.norm(call)) ?? 0; }
    getMax(call: string): number { return this.all.get(this.norm(call)) ?? 0; }

    clear() {
        this.session.clear();
        this.all.clear();
        this.noRelayAnomalies = 0;
        GatewayStore.update(s => { s.counts = {}; s.max = {}; });
    }
}

export default new GatewayService();
