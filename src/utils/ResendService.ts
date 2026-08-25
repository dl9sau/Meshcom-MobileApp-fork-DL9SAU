import AppPrefsStore from "../store/AppPrefsStore";
import LogS from "./LogService";
import { parsePartMarker } from "./MsgGroup";
import StatsService from "./StatsService";

// AUTOMATIC RESEND OF UNACKNOWLEDGED DM PARTS
//
// The firmware already retransmits a text message on its own - but only three times, 40 s
// apart, so it gives up after two minutes (MAX_RETRANSMIT in lora_functions.cpp). After
// that a part that never made it just sits there unacknowledged, and the sender has to
// notice and press Resend by hand. This picks up where the firmware stops.
//
// Deliberately narrow (decisions DL9SAU, 2026-08-25):
//   - DIRECT MESSAGES ONLY. A channel message has no recipient ack; the cloud only tells
//     us somebody repeated it, and mistaking a missed repeat for a loss would fill the
//     channel with duplicates for everyone.
//   - ONLY PARTS OF A SPLIT MESSAGE, i.e. text carrying the "(i/n xx)" marker. A short
//     message that fits one packet is left to the firmware's own retry - that is what it
//     is for, and a long message is where a single lost part hurts.
//   - NOT ACROSS A RESTART. Only messages sent during THIS app run are retried; anything
//     older stays as it is. Keeps a returning app from suddenly transmitting old traffic.
//   - SILENT. No extra line in the chat: the echo of a resend is folded into the original
//     message by the resend-collapse in DataBaseService, which also counts the attempts -
//     that is where the "resent #N" behind the timestamp comes from.
//
// Timing: minutes after the ORIGINAL send, not after the previous attempt. Three attempts
// spread over roughly an hour, on top of the firmware's three in the first two minutes.
// Wide on purpose: if nothing was acknowledged after the firmware tried three times, the
// path is bad or the station is away - neither is helped by hammering.
export const SCHEDULE_MIN = [5, 15, 40];

// what a row must look like for the decision - a subset of MsgType, so the rule can be
// tested without a database
export interface ResendCandidate {
    msgNr: number;
    fromCall: string;
    toCall: string;
    msgTXT: string;
    timestamp: number;
    ack?: number;
    isDM?: number;
    resends?: number;
}

// Is this message due for another attempt right now? Pure, so the schedule is testable.
// `ack >= 2` is the recipient's confirmation (for a DM that IS the addressed node); ack 1
// only means somebody was seen repeating it, which says nothing about arrival.
export const isResendDue = (m: ResendCandidate, ownCall: string, now: number,
                            appStart: number): boolean => {
    if (!m || (m.isDM ?? 0) !== 1) return false;
    const own = (ownCall || "").toUpperCase().trim();
    if (own === "" || (m.fromCall || "").toUpperCase().trim() !== own) return false;
    if ((m.ack ?? 0) >= 2) return false;                    // confirmed, nothing to do
    if ((m.timestamp ?? 0) < appStart) return false;        // from an earlier app run
    if (!parsePartMarker(m.msgTXT)) return false;           // not a part of a split message
    const done = m.resends ?? 0;
    if (done >= SCHEDULE_MIN.length) return false;          // budget spent, leave it be
    return (now - m.timestamp) >= SCHEDULE_MIN[done] * 60000;
};

// the on-air string for a DM, exactly as the compose path builds it
export const airString = (m: ResendCandidate): string =>
    (m.isDM ?? 0) === 1 ? "{" + m.toCall + "}" + m.msgTXT : m.msgTXT;

class ResendService {
    private running = false;

    // One pass. `load` hands us the candidate rows (the caller owns the database), `send`
    // puts one assembled string on the air. Both are injected so this stays testable and
    // free of import cycles.
    async tick(load: (sinceTs: number) => Promise<ResendCandidate[]>,
               send: (airMsg: string) => Promise<boolean>): Promise<number> {
        if (this.running) return 0;                          // a slow BLE write must not stack
        if (!AppPrefsStore.getRawState().autoResendDM) return 0;
        const ownCall = AppPrefsStore.getRawState().ownCall;
        if (!ownCall) return 0;
        const appStart = StatsService.getStartedAt();
        this.running = true;
        let sent = 0;
        try {
            const rows = await load(appStart);
            const now = Date.now();
            for (const m of rows) {
                if (!isResendDue(m, ownCall, now, appStart)) continue;
                const attempt = (m.resends ?? 0) + 1;
                const ok = await send(airString(m));
                if (!ok) break;                              // BLE gone - try again next tick
                sent++;
                LogS.log(0, `Auto-resend ${attempt}/${SCHEDULE_MIN.length} of unacknowledged ` +
                    `DM part to ${m.toCall} (msg ${m.msgNr}, ${Math.round((now - m.timestamp) / 60000)} min old)`);
            }
        } catch (err) {
            LogS.log(1, "Auto-resend failed: " + err);
        } finally {
            this.running = false;
        }
        return sent;
    }
}

export default new ResendService();
