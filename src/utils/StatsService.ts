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
    private ack = { repeatedOnly: 0, acked: 0 };

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
            s.ack = { ...this.ack };
        });
    }

    // File `call` under `cat` if that is a BETTER path than anything seen before. Never
    // demotes - a station heard directly once stays direct, however it arrives later.
    private promote(call: string, cat: RxCat): boolean {
        const c = this.norm(call);
        if (c === "") return false;
        const r = RANK[cat];
        const prev = this.callRank.get(c) ?? 0;
        if (r <= prev) return false;
        if (prev > 0) this.byRank[prev]--;
        this.byRank[r]++;
        this.callRank.set(c, r);
        return true;
    }

    private note(from: string, cat: RxCat, bucket: CatCounts): boolean {
        const c = this.norm(from);
        if (c === "") return false;
        bucket[cat]++;
        this.promote(c, cat);   // own traffic is already filtered out by the callers
        return true;
    }

    // Stations that were on the air without SENDING anything to us: the relays in a route
    // path. What `calls` answers is "how many unique stations were on the air", not "how
    // many beaconed" - a node we heard forwarding someone else's packet is proven to be on
    // HF, beacon or no beacon (DL9SAU, 2026-08-23; his db0fri sat in Last-Heard as a direct
    // neighbour while `calls direct` still read 0, because it had not beaconed yet).
    //   LAST element    - we received ITS transmission, so it is a direct neighbour. That
    //                     holds for every path, gatewayed or not: the last hop is the one
    //                     whose RF reached us. It is exactly what the firmware files under
    //                     the mheard CALL.
    //   everything else - only counted when the packet type proves the whole path is
    //                     HF-local: positions always (HF-only by firmware design), text
    //                     only with the gw bit clear. The same trust rule HfHeardService
    //                     uses - a gw=1 text may carry relays that never touched our air.
    notePath(path: string[], ownCall: string, hfTrusted: boolean) {
        if (!path || path.length < 2) return;   // no relay: countPos/countMsg has the sender
        const own = this.ownOf(ownCall);
        const take = (c: string, cat: RxCat): boolean =>
            this.norm(c) !== own && this.promote(c, cat);
        let changed = take(path[path.length - 1], 'direct');
        if (hfTrusted)
            for (let i = 0; i < path.length - 1; i++) changed = take(path[i], 'hf') || changed;
        if (changed) this.mirror();
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

    // An acknowledgement for one of OUR OWN messages. The firmware hands an ACK to the app
    // only when it matches something we transmitted (`checkOwnTx`), and only once per
    // message - so these count our sent messages getting through, not foreign traffic.
    //
    // Bucketed by the SAME mapping DatabaseService.ackTxtMsg applies to decide the icon, on
    // purpose: the counter must never tell a different story than the tick in the chat.
    //   0x00 - the firmware's "ONLY HEARD" (lora_functions.cpp): our own message came back
    //          over the air, i.e. somebody relayed it. Sent locally by our own node, once,
    //          and ONLY while no ack has been recorded yet - hence the label "repeated-only".
    //          A relay of a CHANNEL message never lands here: for '*' traffic the firmware
    //          reports it as an ack instead (verified in the field, DL9SAU 2026-08-24).
    //   0x01 - an acknowledgement: from a gateway over the air (only gateways send them, and
    //          only for '*', WLNK-1, APRS2SOTA and groups), or our own node reporting
    //          "server reached" when it is itself a gateway.
    //   0x02 - legacy; the current firmware never sets this flag byte to anything but 0x01.
    // Deliberately NOT cumulative: an ack does not imply a heard relay (the ack can arrive
    // first, which suppresses the report), and a relay does not imply an ack.
    countAck(ackState: number) {
        if (ackState === 0x00) this.ack.repeatedOnly++;
        else if (ackState === 0x01 || ackState === 0x02) this.ack.acked++;
        else return;                       // unknown state: not ours to guess
        this.mirror();
    }

    // distinct callsigns found in the database (see DatabaseService.getStatsDb)
    setDbCalls(n: number) { this.dbCalls = n; this.mirror(); }

    reset() {
        this.pos = { direct: 0, hf: 0, gw: 0 };
        this.msg = { direct: 0, hf: 0, gw: 0 };
        this.dm = { direct: 0, hf: 0, gw: 0 };
        this.callRank.clear();
        this.byRank = [0, 0, 0, 0];
        this.ack = { repeatedOnly: 0, acked: 0 };
        this.mirror();
    }
}

export default new StatsService();
