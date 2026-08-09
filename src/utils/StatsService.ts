import StatsStore, { CatCounts } from "../store/StatsStore";

export type RxCat = 'direct' | 'hf' | 'gw';

// How a packet reached us. Disjoint and exhaustive, so the three add up to the total:
//   'gw'     - our globe verdict says the origin came from the wider network
//   'direct' - no relay in between (0 hops). Can never be 'gw': a 0-hop packet is heard
//              from the sender itself, which computeGlobeState always rates as local.
//   'hf'     - relayed, but the origin is a confirmed local RF station
export const rxCatOf = (hops: number, globe: string): RxCat =>
    globe === 'solid' ? 'gw' : (hops <= 0 ? 'direct' : 'hf');

// App-wide RECEIVE statistics since app start (RAM). Counts UNIQUE packets FROM OTHERS
// (the firmware dedups by msg_id before forwarding, so we never see airtime copies) and
// sorts them by packet type and by how they reached us - which is what makes "user
// messages vs. beacon load" comparable. Own traffic is excluded here; the own callsign's
// sent messages / heard-back beacons live in NodeRuntimeService.
class StatsService {
    private pos: CatCounts = { direct: 0, hf: 0, gw: 0 };
    private msg: CatCounts = { direct: 0, hf: 0, gw: 0 };
    private dm: CatCounts = { direct: 0, hf: 0, gw: 0 };
    private callsDirect = new Set<string>();
    private callsHf = new Set<string>();
    private callsGw = new Set<string>();
    private callsAll = new Set<string>();
    private dbCalls = -1;

    private norm(c: string): string { return (c || "").toUpperCase().trim(); }

    private mirror() {
        StatsStore.update(s => {
            s.pos = { ...this.pos };
            s.msg = { ...this.msg };
            s.dm = { ...this.dm };
            s.callsDirect = this.callsDirect.size;
            s.callsHf = this.callsHf.size;
            s.callsGw = this.callsGw.size;
            s.callsAll = this.callsAll.size;
            s.dbCalls = this.dbCalls;
        });
    }

    private note(from: string, cat: RxCat, bucket: CatCounts): boolean {
        const c = this.norm(from);
        if (c === "") return false;
        bucket[cat]++;
        this.callsAll.add(c);
        (cat === 'gw' ? this.callsGw : cat === 'hf' ? this.callsHf : this.callsDirect).add(c);
        return true;
    }

    // a received TEXT message. `globe` is our frozen gwState ('none'|'dim'|'solid'|
    // 'faint'; typed as string because MsgType.gwState is). `isDM` separates a real
    // direct message from a channel/talk-group message (group messages carry isDM=1 too).
    countMsg(from: string, hops: number, globe: string, isDM: boolean, ownCall: string) {
        if (this.norm(from) === this.norm(ownCall)) return;
        if (this.note(from, rxCatOf(hops, globe), isDM ? this.dm : this.msg)) this.mirror();
    }

    // a received POSITION beacon. Positions are HF-only (never gatewayed), so the globe
    // verdict does not apply - only direct vs. relayed.
    countPos(from: string, hops: number, ownCall: string) {
        if (this.norm(from) === this.norm(ownCall)) return;
        if (this.note(from, hops <= 0 ? 'direct' : 'hf', this.pos)) this.mirror();
    }

    // distinct callsigns found in the database (see DatabaseService.getStatsDb)
    setDbCalls(n: number) { this.dbCalls = n; this.mirror(); }

    reset() {
        this.pos = { direct: 0, hf: 0, gw: 0 };
        this.msg = { direct: 0, hf: 0, gw: 0 };
        this.dm = { direct: 0, hf: 0, gw: 0 };
        this.callsDirect.clear(); this.callsHf.clear(); this.callsGw.clear(); this.callsAll.clear();
        this.mirror();
    }
}

export default new StatsService();
