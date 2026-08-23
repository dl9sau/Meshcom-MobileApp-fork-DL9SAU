import StatsStore, { CatCounts } from "../store/StatsStore";
import AppPrefsStore from "../store/AppPrefsStore";

export type RxCat = 'direct' | 'hf' | 'gw';

// How a packet reached us. Disjoint and exhaustive, so the three add up to the total:
//   'gw'     - our globe verdict says the origin came from the wider network
//   'direct' - no relay in between (0 hops). Can never be 'gw': a 0-hop packet is heard
//              from the sender itself, which computeGlobeState always rates as local.
//   'hf'     - relayed, but the origin is a confirmed local RF station
export const rxCatOf = (hops: number, globe: string): RxCat =>
    globe === 'solid' ? 'gw' : (hops <= 0 ? 'direct' : 'hf');

// How GOOD a path is, for filing a STATION under the best one we ever heard it on.
// Direct beats relayed-but-local beats from-the-network.
const RANK: Record<RxCat, number> = { direct: 3, hf: 2, gw: 1 };

// App-wide RECEIVE statistics since app start (RAM). Counts UNIQUE packets FROM OTHERS
// (the firmware dedups by msg_id before forwarding, so we never see airtime copies) and
// sorts them by packet type and by how they reached us - which is what makes "user
// messages vs. beacon load" comparable. Own traffic is excluded here; the own callsign's
// sent messages / heard-back beacons live in NodeRuntimeService.
class StatsService {
    private pos: CatCounts = { direct: 0, hf: 0, gw: 0 };
    private msg: CatCounts = { direct: 0, hf: 0, gw: 0 };
    private dm: CatCounts = { direct: 0, hf: 0, gw: 0 };
    // Stations are filed under the BEST path we ever heard them on, NOT under every path
    // they ever used. The question worth answering is "how many did I hear directly, how
    // many ONLY relayed, how many ONLY through the network" - a station we once heard
    // directly stays a direct one, even when the same call later arrives repeated. Nice
    // side effect: the three add up to the total instead of overlapping.
    // (PACKET counts above are per reception and stay as they are - there each packet has
    // exactly one category by definition.)
    private callRank = new Map<string, number>();  // call -> best RANK seen
    private byRank = [0, 0, 0, 0];                 // how many calls sit at each rank
    private dbCalls = -1;

    private norm(c: string): string { return (c || "").toUpperCase().trim(); }

    // Our own callsign, for skipping our own traffic. The caller reads it from the node's
    // NodeInfo packet, which only arrives a moment AFTER the connect - until then it is ""
    // and our own repeated beacons would be counted as a foreign station. Fall back to the
    // callsign persisted on the last run, which is already loaded at that point.
    // Exact match on purpose (not the base call): a SECOND node of ours is, seen from this
    // one, a foreign station on the air and should be counted.
    private ownOf(ownCall: string): string {
        const c = this.norm(ownCall);
        return c !== "" ? c : this.norm(AppPrefsStore.getRawState().ownCall);
    }

    private mirror() {
        StatsStore.update(s => {
            s.pos = { ...this.pos };
            s.msg = { ...this.msg };
            s.dm = { ...this.dm };
            s.callsDirect = this.byRank[RANK.direct];
            s.callsHf = this.byRank[RANK.hf];
            s.callsGw = this.byRank[RANK.gw];
            s.callsAll = this.callRank.size;
            s.dbCalls = this.dbCalls;
        });
    }

    private note(from: string, cat: RxCat, bucket: CatCounts): boolean {
        const c = this.norm(from);
        if (c === "") return false;
        bucket[cat]++;
        // promote the station if this reception was on a better path than anything before
        const r = RANK[cat];
        const prev = this.callRank.get(c) ?? 0;
        if (r > prev) {
            if (prev > 0) this.byRank[prev]--;
            this.byRank[r]++;
            this.callRank.set(c, r);
        }
        return true;
    }

    // a received TEXT message. `globe` is our frozen gwState ('none'|'dim'|'solid'|
    // 'faint'; typed as string because MsgType.gwState is). `isDM` separates a real
    // direct message from a channel/talk-group message (group messages carry isDM=1 too).
    countMsg(from: string, hops: number, globe: string, isDM: boolean, ownCall: string) {
        if (this.norm(from) === this.ownOf(ownCall)) return;
        if (this.note(from, rxCatOf(hops, globe), isDM ? this.dm : this.msg)) this.mirror();
    }

    // a received POSITION beacon. Positions are HF-only (never gatewayed), so the globe
    // verdict does not apply - only direct vs. relayed.
    countPos(from: string, hops: number, ownCall: string) {
        if (this.norm(from) === this.ownOf(ownCall)) return;
        if (this.note(from, hops <= 0 ? 'direct' : 'hf', this.pos)) this.mirror();
    }

    // distinct callsigns found in the database (see DatabaseService.getStatsDb)
    setDbCalls(n: number) { this.dbCalls = n; this.mirror(); }

    reset() {
        this.pos = { direct: 0, hf: 0, gw: 0 };
        this.msg = { direct: 0, hf: 0, gw: 0 };
        this.dm = { direct: 0, hf: 0, gw: 0 };
        this.callRank.clear();
        this.byRank = [0, 0, 0, 0];
        this.mirror();
    }
}

export default new StatsService();
