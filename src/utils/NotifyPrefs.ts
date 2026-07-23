import AppPrefsStore from "../store/AppPrefsStore";

// Per-scope notification ("mute") logic. "alert = it beeps". Defaults (in
// AppPrefsStore) are quiet everywhere except DMs addressed to me; the user
// toggles a scope on/off via long-press on the channel tab. All in-app, so it
// works identically on Android and iOS (no OS notification channels involved).

// parse the CSV of talk-group numbers that beep, e.g. "20,262"
export const parseTGset = (csv: string): Set<number> =>
    new Set((csv || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)));

type ScopeMsg = { isDM?: number; isGrpMsg?: number; grpNum?: number; toCall?: string };

// should an incoming message raise a notification, given the mute settings?
export const alertsForMsg = (msg: ScopeMsg, own: string): boolean => {
    const s = AppPrefsStore.getRawState();
    if (msg.isGrpMsg === 1) {
        // talk group: only if this TG is enabled
        return parseTGset(s.alertTGs).has(msg.grpNum ?? -1);
    }
    if (msg.isDM === 1) {
        // DM addressed to me -> alertDMmine; overheard foreign DM -> never
        const ownUp = (own || "").toUpperCase();
        return (msg.toCall || "").toUpperCase() === ownUp ? s.alertDMmine : false;
    }
    // ALL / broadcast
    return s.alertAll;
};

// is the bell (alert) on for a chat tab? tabValue is "ALL", "DM" or a TG number.
export const tabAlertsOn = (tabValue: string): boolean => {
    const s = AppPrefsStore.getRawState();
    if (tabValue === "ALL") return s.alertAll;
    if (tabValue === "DM") return s.alertDMmine;
    const tg = parseInt(tabValue);
    return !isNaN(tg) && parseTGset(s.alertTGs).has(tg);
};
