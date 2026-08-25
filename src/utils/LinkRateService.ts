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
// how many gaps before we say anything. HEY needs only ONE: its 15-min interval is a
// verified firmware constant, not an estimate, so two beacons already span a measurable
// stretch - "2 of 4 in the last 45 minutes" is a real statement. For positions the interval
// itself has to be estimated first, which needs several gaps before it means anything.
const MIN_GAPS_HEY = 1;
const MIN_GAPS_POS = 4;
// keep the recent gaps only - the estimate should follow a node that changes its beaconing
const MAX_GAPS = 64;
// HEY: gaps SHORTER than the constant mean our assumption is wrong (different firmware
// setting, duplicate records), not that the link is good -> no percentage. Longer gaps are
// exactly what loss looks like and must NOT trip this.
const HEY_MIN_SPACING = 0.6;
// positions: the interval is estimated, so the test is on SPREAD instead
const POS_SPREAD_MAX = 2.5;
// A node's OWN transmission carries either an empty path or just itself - 0 or 1, nothing
// else is possible. Capping the learned floor at 1 keeps a single forwarded beacon seen
// early from being mistaken for the floor.
const OWN_PL_MAX = 1;

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
    // The shortest HEY path length we have ever seen. -1 = nothing seen yet. See calibrate().
    private ownPl = -1;

    private norm(c: string): string { return (c || "").toUpperCase().trim(); }

    // WHICH PATH LENGTH MEANS "the node sent this itself"? The firmware source settles it:
    // `PL` is `msg_last_path_cnt`, which starts at 1 and counts up per comma while parsing
    // the source path (aprs_functions.cpp), so it counts path ENTRIES INCLUDING the sender -
    // a directly heard packet is 1, one relay is 2. It can never be 0.
    //
    // The floor is learned anyway, as a guard rather than an assumption: every Mheard record
    // is a DIRECT reception, so among all HEYs we hear the SHORTEST path is by definition one
    // its sender originated. Capped at 1, since nothing else can be a node's own transmission.
    // Read only over HEY records, never mixed with other packet types, so a per-type
    // convention could not mislead it. If a future firmware renumbers this, the app follows
    // instead of quietly counting the wrong thing.
    //
    // The floor can only ever FALL. When it does, everything counted before rested on a
    // wrong floor - forwarded beacons were filed as somebody's own - so the HEY tally starts
    // over rather than carrying a wrong figure forward. That costs minutes, not more.
    private calibrate(pathLen: number) {
        const pl = Math.min(pathLen, OWN_PL_MAX);
        if (this.ownPl >= 0 && pl >= this.ownPl) return;
        const prev = this.ownPl;
        this.ownPl = pl;
        // The expected case (1, per the firmware source) is silent - only a DROP is worth a
        // line, because it means the figures counted so far rested on a wrong floor.
        if (prev < 0) return;
        LogS.log(0, `HEY path length floor drops ${prev} -> ${pl}: ${prev} was not a node's ` +
            `own beacon after all, HEY figures restarted`);
        this.hey.clear();
        this.heyFwd.clear();
        this.heyOwnTotal = 0;
        this.heyFwdTotal = 0;
        LinkRateStore.update(s => { s.hey = {}; s.heyOwn = 0; s.heyRelayed = 0; });
    }

    // did this node send the beacon itself, or forward a foreign one? Before the first
    // record the firmware's own numbering (1 = heard directly) is the starting point.
    private isOwnBeacon(pathLen: number): boolean {
        return pathLen <= (this.ownPl < 0 ? OWN_PL_MAX : this.ownPl);
    }

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
        return { got: t.n, expected, intervalMs: interval, irregular, spreadLow: p25, spreadHigh: p75 };
    }

    // D3: one HEY seen in an Mheard record. `pathLen` decides whose beacon it was - against
    // the floor learned in calibrate(), not against a hard-coded 0.
    noteHey(call: string, ts: number, pathLen: number, ownCall: string) {
        const c = this.norm(call);
        if (c === "" || c === this.norm(ownCall) || !(pathLen >= 0)) return;
        this.calibrate(pathLen);
        if (!this.isOwnBeacon(pathLen)) {
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
        this.ownPl = -1;
        this.hey.clear();
        this.heyFwd.clear();
        this.pos.clear();
        this.heyOwnTotal = 0;
        this.heyFwdTotal = 0;
        LinkRateStore.update(s => { s.hey = {}; s.pos = {}; s.heyOwn = 0; s.heyRelayed = 0; });
    }
}

export default new LinkRateService();
