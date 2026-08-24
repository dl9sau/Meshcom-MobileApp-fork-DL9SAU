import LinkRateStore, { RateInfo } from "../store/LinkRateStore";
import LogS from "./LogService";

// D3 + D4 - HOW MUCH OF WHAT A NODE SENDS DO WE ACTUALLY HEAR?
//
// Both answers rest on the same arithmetic: a node beacons at some interval, we know when
// we first and last heard it, so the number it SHOULD have sent in that span follows - and
// what is missing is loss. The two sources differ only in how trustworthy the interval is.
//
// D3 - HEY (the strong one). Every node sends a HEY announcement every 15 min, a firmware
// constant: not smart-beaconed, not tied to movement, not affected by how chatty the node
// is. That fixed interval is what makes it the honest link measure. HEY is never handed to
// the app as a packet - but the firmware writes an Mheard record for EVERY RF reception,
// and that record names the packet type (PLT 64 = '@' = HEY) and the path length. Path
// length 0 means the node we heard sent that HEY itself; anything else means it forwarded
// somebody else's, which says how much it carries rather than how well we hear it.
//
// D4 - positions (the weak one). Same arithmetic, but the interval is NOT dependable:
// POSINFO_INTERVAL is 30 min by default, yet smart beaconing and movement change the real
// spacing. So it is ESTIMATED per node from the observed gaps - and where the gaps scatter,
// no percentage is shown at all. That is the whole point of D4: a quota only where it means
// something.
//
// Estimating from the LOW end of the gaps is deliberate: a missed beacon can only ever make
// a gap LONGER, never shorter, so the short gaps are the ones closest to the true interval.
// The bias that leaves is towards a too-LONG estimate when we miss a lot, which makes the
// figure look better than reality - never worse. Said plainly: these numbers are an upper
// bound on the link, and HEY's BACKGROUND priority (a node may skip one when the channel is
// busy) pushes the same way. A shown 100% means "nothing detectably lost", not "perfect".
//
// Session-only, in RAM: the Mheard and Positions tables hold ONE row per station, so there
// is no beacon history in the database to replay after a restart.

// HEYINFO_INTERVAL - fixed for every node, see the verified firmware facts
const HEY_INTERVAL_MS = 15 * 60 * 1000;
// how many gaps before we say anything. HEY needs fewer: its interval is known, we are only
// counting. For positions the interval itself has to be estimated first.
const MIN_GAPS_HEY = 2;
const MIN_GAPS_POS = 4;
// keep the recent gaps only - the estimate should follow a node that changes its beaconing
const MAX_GAPS = 64;
// HEY: gaps SHORTER than the constant mean our assumption is wrong (different firmware
// setting, duplicate records), not that the link is good -> no percentage. Longer gaps are
// exactly what loss looks like and must NOT trip this.
const HEY_MIN_SPACING = 0.6;
// positions: the interval is estimated, so the test is on SPREAD instead
const POS_SPREAD_MAX = 2.5;
// The one thing the code cannot prove about the firmware: whether a DIRECTLY heard packet
// carries path length 0 or 1. Everything here rests on "0 = the node sent it itself", so
// the first few raw values are logged - if they turn out to be 1, every neighbour would
// show up as a pure forwarder and this line says why within a minute of a field test.
const PL_SAMPLES = 5;

interface Track {
    n: number;
    first: number;
    last: number;
    gaps: number[];
}

class LinkRateService {
    private hey = new Map<string, Track>();      // a node's OWN hey beacons
    private heyFwd = new Map<string, number>();  // foreign heys it forwarded
    private pos = new Map<string, Track>();
    private heyOwnTotal = 0;
    private heyFwdTotal = 0;
    private plSamples = 0;

    private norm(c: string): string { return (c || "").toUpperCase().trim(); }

    // record one reception at `ts`; returns false when it was not usable
    private add(map: Map<string, Track>, call: string, ts: number): boolean {
        if (call === "" || !(ts > 0)) return false;
        const t = map.get(call);
        if (!t) { map.set(call, { n: 1, first: ts, last: ts, gaps: [] }); return true; }
        // out of order, or the very same record twice (a node re-sending its stored Mheard
        // list on connect) - count neither, it would invent a gap of zero
        if (ts <= t.last) return false;
        t.gaps.push(ts - t.last);
        if (t.gaps.length > MAX_GAPS) t.gaps.shift();
        t.n++;
        t.last = ts;
        return true;
    }

    private percentile(sorted: number[], p: number): number {
        if (sorted.length === 0) return 0;
        const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
        return sorted[i];
    }

    // nominal > 0: the interval is known (HEY) and only checked for plausibility.
    // nominal == 0: estimate it from the gaps (positions) and judge the spread.
    private rate(t: Track | undefined, nominal: number, minGaps: number): RateInfo | null {
        if (!t || t.n < 2 || t.gaps.length < minGaps) return null;
        const gaps = t.gaps.slice().sort((a, b) => a - b);
        const p25 = this.percentile(gaps, 0.25);
        const p75 = this.percentile(gaps, 0.75);
        if (p25 <= 0) return null;
        const interval = nominal > 0 ? nominal : p25;
        const irregular = nominal > 0
            ? p25 < nominal * HEY_MIN_SPACING     // spacing below the constant -> assumption broken
            : p75 > p25 * POS_SPREAD_MAX;         // scattered -> no percentage
        // never report more than 100%: our own count is the floor of what was sent
        const expected = Math.max(t.n, Math.round((t.last - t.first) / interval) + 1);
        return { got: t.n, expected, intervalMs: interval, irregular };
    }

    // D3: one HEY seen in an Mheard record. `pathLen` decides whose beacon it was: 0 means
    // the node we heard sent it itself, anything else means it forwarded a foreign one.
    noteHey(call: string, ts: number, pathLen: number, ownCall: string) {
        const c = this.norm(call);
        if (c === "" || c === this.norm(ownCall)) return;
        if (this.plSamples < PL_SAMPLES) {
            this.plSamples++;
            LogS.log(0, `HEY from ${c}: path length ${pathLen} -> ${pathLen <= 0 ? "its own beacon" : "forwarded"}`);
        }
        if (pathLen > 0) {
            this.heyFwd.set(c, (this.heyFwd.get(c) ?? 0) + 1);
            this.heyFwdTotal++;
            this.mirrorHey(c);
            return;
        }
        if (!this.add(this.hey, c, ts)) return;
        this.heyOwnTotal++;
        this.mirrorHey(c);
    }

    // D4: one position beacon received from `call`
    notePos(call: string, ts: number, ownCall: string) {
        const c = this.norm(call);
        if (c === "" || c === this.norm(ownCall)) return;
        if (!this.add(this.pos, c, ts)) return;
        const r = this.rate(this.pos.get(c), 0, MIN_GAPS_POS);
        if (!r) return;
        LinkRateStore.update(s => { s.pos = { ...s.pos, [c]: r }; });
    }

    private mirrorHey(call: string) {
        const r = this.rate(this.hey.get(call), HEY_INTERVAL_MS, MIN_GAPS_HEY);
        const relayed = this.heyFwd.get(call) ?? 0;
        const own = this.hey.get(call);
        // a node we only ever caught relaying has no rate of its own - still worth a line,
        // so publish a bare record carrying just the relay count
        const info: RateInfo = r
            ? { ...r, relayed }
            : { got: own?.n ?? 0, expected: 0, intervalMs: HEY_INTERVAL_MS, irregular: false, relayed };
        LinkRateStore.update(s => {
            s.hey = { ...s.hey, [call]: info };
            s.heyOwn = this.heyOwnTotal;
            s.heyRelayed = this.heyFwdTotal;
        });
    }

    getHey(call: string): RateInfo | undefined { return LinkRateStore.getRawState().hey[this.norm(call)]; }
    getPos(call: string): RateInfo | undefined { return LinkRateStore.getRawState().pos[this.norm(call)]; }

    clear() {
        this.hey.clear();
        this.heyFwd.clear();
        this.pos.clear();
        this.heyOwnTotal = 0;
        this.heyFwdTotal = 0;
        LinkRateStore.update(s => { s.hey = {}; s.pos = {}; s.heyOwn = 0; s.heyRelayed = 0; });
    }
}

export default new LinkRateService();
