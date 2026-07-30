import StatsStore from "../store/StatsStore";

// App-wide RECEIVE statistics since app start (RAM). Counts UNIQUE messages/positions
// (the firmware dedups by msg_id, so each is counted once) received FROM OTHERS,
// classified by our globe verdict. Own traffic is NOT counted here - the own callsign's
// sent-msgs / heard-back-beacons already live in NodeRuntimeService (the "me" line).
// StatsStore mirrors the sizes so the UI can react.
class StatsService {
    private rxMsgHf = 0;
    private rxMsgGw = 0;
    private rxPos = 0;
    private callsHf = new Set<string>();   // unique HF-local senders (msgs + positions)
    private callsGw = new Set<string>();   // unique internet-origin senders

    private norm(c: string): string { return (c || "").toUpperCase().trim(); }

    private mirror() {
        StatsStore.update(s => {
            s.rxMsgHf = this.rxMsgHf;
            s.rxMsgGw = this.rxMsgGw;
            s.rxPos = this.rxPos;
            s.callsHf = this.callsHf.size;
            s.callsGw = this.callsGw.size;
        });
    }

    // a received TEXT message from `from`, with our globe verdict ('none'|'dim'|'solid'|
    // 'faint'; typed as string because MsgType.gwState is). Skips own + empty.
    countMsg(from: string, globe: string, ownCall: string) {
        const c = this.norm(from);
        if (c === "" || c === this.norm(ownCall)) return;
        if (globe === 'solid') { this.rxMsgGw++; this.callsGw.add(c); }
        else { this.rxMsgHf++; this.callsHf.add(c); }   // none/dim -> HF-local
        this.mirror();
    }

    // a received POSITION from `from` (positions are HF-only). Skips own + empty.
    countPos(from: string, ownCall: string) {
        const c = this.norm(from);
        if (c === "" || c === this.norm(ownCall)) return;
        this.rxPos++;
        this.callsHf.add(c);
        this.mirror();
    }

    reset() {
        this.rxMsgHf = 0; this.rxMsgGw = 0; this.rxPos = 0;
        this.callsHf.clear(); this.callsGw.clear();
        this.mirror();
    }
}

export default new StatsService();
