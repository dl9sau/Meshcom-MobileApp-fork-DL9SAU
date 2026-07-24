import AppPrefsStore from "../store/AppPrefsStore";

// Per-scope notification ("mute") + visibility ("discard") logic, plus @mention
// detection. All in-app (Android + iOS identical, no OS notification channels).
//   - Mute only silences the beep; the green new-message indicator stays.
//   - Discard hides a channel's messages AND suppresses its beep + green marker.
//   - A channel @mention of my callsign beeps THROUGH mute/discard (unless DM
//     notifications are fully off) - see shouldNotify().

// parse a CSV of talk-group numbers, e.g. "20,262"
export const parseTGset = (csv: string): Set<number> =>
    new Set((csv || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)));

type ScopeMsg = { isDM?: number; isGrpMsg?: number; grpNum?: number; toCall?: string; fromCall?: string; msgTXT?: string };

// base callsign without the "-SSID" suffix, UPPERCASE ("DL9SAU-12" -> "DL9SAU").
// "Me" = my base call with ANY SSID: senders may not know which device/SSID I'm
// on, and I may run several - so a DM/mention to any of my SSIDs counts as mine.
export const baseCall = (c: string): string =>
    (c || "").toUpperCase().trim().split("-")[0];

const isToMe = (msg: ScopeMsg, own: string): boolean => {
    const o = baseCall(own);
    return o !== "" && baseCall(msg.toCall || "") === o;
};

// a DM "of mine" (never discarded) = addressed to me OR sent by me (any SSID)
const isMyDM = (msg: ScopeMsg, own: string): boolean => {
    const o = baseCall(own);
    return o !== "" && (baseCall(msg.toCall || "") === o || baseCall(msg.fromCall || "") === o);
};

// escape a string for use inside a RegExp
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// does a CHANNEL message (broadcast or talk group) mention my callsign? Matches
// "@DL9SAU", "@DL9SAU:", "@DL9SAU-12", case-insensitive, ANYWHERE in the text
// (incl. lists like "@dl9sau, @dl1aaa: hi"), but not "@dl9sauFooBar" (a boundary
// is required after the call). Any SSID of my base call counts.
export const isChannelMention = (msg: ScopeMsg, own: string): boolean => {
    if (msg.isDM === 1 && msg.isGrpMsg !== 1) return false; // a personal DM follows the DM rules, not this
    const base = baseCall(own);
    if (base === "") return false;
    try {
        const re = new RegExp("@" + escapeRe(base) + "(-[A-Za-z0-9]+)?(?![A-Za-z0-9])", "i");
        return re.test(msg.msgTXT || "");
    } catch {
        return false;
    }
};

// is this message's channel discarded (hidden)?
export const msgDiscarded = (msg: ScopeMsg, own: string): boolean => {
    const s = AppPrefsStore.getRawState();
    if (msg.isGrpMsg === 1) return parseTGset(s.discardTGs).has(msg.grpNum ?? -1);
    if (msg.isDM === 1) return !isMyDM(msg, own) && !s.dmShowAll; // foreign DM hidden unless monitoring
    return s.discardAll; // ALL / broadcast
};

// per-scope rule: should the message beep on its own channel settings?
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

// final beep decision: the per-scope rule, OR a channel @mention of me - which
// beeps THROUGH the channel's mute/discard, as long as DM notifications aren't
// fully off ("none"). So a mention has priority.
export const shouldNotify = (msg: ScopeMsg, own: string): boolean => {
    if (alertsForMsg(msg, own)) return true;
    if (AppPrefsStore.getRawState().dmAlert !== "none" && isChannelMention(msg, own)) return true;
    return false;
};
