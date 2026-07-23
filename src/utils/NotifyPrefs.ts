import AppPrefsStore from "../store/AppPrefsStore";

// Per-scope notification ("mute") and visibility ("discard") logic. All in-app,
// so it works identically on Android and iOS (no OS notification channels).
//   - Mute only silences the beep; the green new-message indicator stays.
//   - Discard hides a channel's messages AND suppresses its beep + green marker.

// parse a CSV of talk-group numbers, e.g. "20,262"
export const parseTGset = (csv: string): Set<number> =>
    new Set((csv || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)));

type ScopeMsg = { isDM?: number; isGrpMsg?: number; grpNum?: number; toCall?: string; fromCall?: string };

const isToMe = (msg: ScopeMsg, own: string): boolean =>
    (msg.toCall || "").toUpperCase() === (own || "").toUpperCase();

// a DM "of mine" (never discarded) = addressed to me OR sent by me
const isMyDM = (msg: ScopeMsg, own: string): boolean => {
    const o = (own || "").toUpperCase();
    return (msg.toCall || "").toUpperCase() === o || (msg.fromCall || "").toUpperCase() === o;
};

// is this message's channel discarded (hidden)?
export const msgDiscarded = (msg: ScopeMsg, own: string): boolean => {
    const s = AppPrefsStore.getRawState();
    if (msg.isGrpMsg === 1) return parseTGset(s.discardTGs).has(msg.grpNum ?? -1);
    if (msg.isDM === 1) return !isMyDM(msg, own) && !s.dmShowAll; // foreign DM hidden unless monitoring
    return s.discardAll; // ALL / broadcast
};

// should an incoming message raise a notification (beep)? Discarded -> never.
export const alertsForMsg = (msg: ScopeMsg, own: string): boolean => {
    const s = AppPrefsStore.getRawState();
    if (msgDiscarded(msg, own)) return false;
    if (msg.isGrpMsg === 1) return parseTGset(s.alertTGs).has(msg.grpNum ?? -1);
    if (msg.isDM === 1) {
        // DM to me -> beeps unless "none"; foreign DM -> only when "all"
        return isToMe(msg, own) ? s.dmAlert !== "none" : s.dmAlert === "all";
    }
    return s.alertAll; // ALL / broadcast
};
