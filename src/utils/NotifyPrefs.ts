import AppPrefsStore from "../store/AppPrefsStore";

// Per-channel notification LEVEL (0 = off, 1 = sound, 2 = sound+banner) + @mention
// detection + discard. All in-app.
//   - Level decides IF and HOW loud a message notifies. On Android level 1 routes
//     to a "sound" OS channel, level 2 to a "banner" (pop-up) channel; DMs and
//     @mentions always use level 2. iOS has no channels -> everything with sound.
//   - A channel @mention of me beeps at banner level THROUGH mute/discard.
//   - Discard also hides the messages + suppresses the green indicator.

// parse a CSV of talk-group numbers, e.g. "20,262"
export const parseTGset = (csv: string): Set<number> =>
    new Set((csv || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)));

type ScopeMsg = { isDM?: number; isGrpMsg?: number; grpNum?: number; toCall?: string; fromCall?: string; msgTXT?: string };

// base callsign without the "-SSID" suffix, UPPERCASE ("DL9SAU-12" -> "DL9SAU").
// "Me" = my base call with ANY SSID (senders may not know my device/SSID, and I
// may run several) - a DM/mention to any of my SSIDs counts as mine.
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
// (incl. lists like "@dl9sau, @dl1aaa: hi"), but not "@dl9sauFooBar". Any SSID of
// my base call counts.
export const isChannelMention = (msg: ScopeMsg, own: string): boolean => {
    if (msg.isDM === 1 && msg.isGrpMsg !== 1) return false; // a personal DM follows the DM rules
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

// notification level for an incoming message: 0 = none, 1 = sound, 2 = sound+banner.
export const notifyLevelFor = (msg: ScopeMsg, own: string): number => {
    const s = AppPrefsStore.getRawState();
    // channel @mention of me -> banner, THROUGH mute/discard (unless DM notif off)
    if (s.dmAlert !== "none" && isChannelMention(msg, own)) return 2;
    if (msgDiscarded(msg, own)) return 0;
    if (msg.isGrpMsg === 1) {
        const g = msg.grpNum ?? -1;
        return parseTGset(s.bannerTGs).has(g) ? 2 : parseTGset(s.alertTGs).has(g) ? 1 : 0;
    }
    if (msg.isDM === 1) {
        // DM to me -> banner unless "none"; foreign DM -> banner only when "all"
        return isToMe(msg, own) ? (s.dmAlert !== "none" ? 2 : 0) : (s.dmAlert === "all" ? 2 : 0);
    }
    return s.bannerAll ? 2 : s.alertAll ? 1 : 0; // ALL / broadcast
};
