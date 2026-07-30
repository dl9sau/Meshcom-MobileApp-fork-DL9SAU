import { Store } from "pullstate";

// App-level UI preferences, persisted in the AppPrefs key/value DB table.
export interface AppPrefsState {
    // compact one-line chat message header (default) vs the legacy multi-line one
    compactHeader: boolean;
    // DM tab: show all overheard DM traffic (monitoring) vs only my own DMs (default)
    dmShowAll: boolean;
    // per-channel notification LEVEL: 0 = disabled, 1 = sound, 2 = sound+banner.
    // Encoded as: level 1 -> in alertAll/alertTGs, level 2 -> in bannerAll/bannerTGs
    // (banner implies sound). Toggle via long-press on the channel tab. Mute only
    // kills the beep - the green new-message indicator stays; only Discard hides both.
    // On Android, level 1 routes to a "sound" OS channel, level 2 to a "banner" one.
    alertAll: boolean;      // ALL / broadcast: level >= sound
    alertTGs: string;       // CSV of talk-group numbers at level >= sound, e.g. "20,262"
    bannerAll: boolean;     // ALL / broadcast: level = banner (sound + pop-up)
    bannerTGs: string;      // CSV of talk-group numbers at level = banner
    dmAlert: string;        // DM notifications: "none" | "mine" | "all" (default "mine"); DM/mentions -> banner
    // Discard = hide a channel's messages AND suppress its green indicator/beep,
    // without de-configuring it. discardAll/discardTGs for ALL and talk groups;
    // for DMs the "discard not-for-me" is the existing dmShowAll (false = foreign
    // DMs hidden). Own DMs are always shown.
    discardAll: boolean;    // hide the ALL / broadcast channel
    discardTGs: string;     // CSV of talk-group numbers that are hidden
    // per-channel "autoscroll to newest" (default ON). ON = a new message while you're
    // at the bottom scrolls down to follow live; OFF = it never auto-scrolls, the new
    // message is surfaced via the "new messages" divider + the down-counter so you catch
    // up at your own pace (good for a firehose channel). Even when ON, a message that
    // arrives while you were away (app asleep / >30s idle at the bottom) is NOT scrolled
    // past but surfaced too - so you never silently miss what came in while not looking.
    // autoscrollAll for ALL; autoscrollTGs is a CSV of talk groups with autoscroll OFF
    // (default = not listed = ON). DMs always autoscroll (low volume).
    autoscrollAll: boolean;
    autoscrollTGs: string;
    // one-time onboarding hint ("long-press a tab") already shown?
    tabHintSeen: boolean;
    // app-local cross-reference TG number -> free-text label (memory aid), as a
    // JSON map e.g. {"262":"DL"}. The firmware has no label field; rebuilt from
    // the Group Subscription fields on every save (so no orphans / mis-assigns).
    tgLabels: string;
    // own callsign, persisted so housekeeping can tell my DMs from overheard ones
    // (at app start, before a node connects, the live config call is not known yet)
    ownCall: string;
    // master on/off for the whole chat filter (callsign-deny + allow + text-deny).
    // OFF = nothing is filtered, without deleting any rules. Default ON.
    filtersEnabled: boolean;
    // "monitoring mode": keep the screen on while the app is in the foreground so the
    // WebView JS never gets paused -> live messages + notifications without a Doze
    // gap. Costs battery (screen stays lit). Default OFF.
    keepScreenOn: boolean;
    // how a too-long message is split into on-air packets (same packet count either
    // way): 'balanced' (default, even-sized parts -> shorter, better delivery) vs
    // 'greedy' (front-fill -> the gist lands in part 1/2). See MsgSplit.
    splitMethod: 'balanced' | 'greedy';
    // retention per category, in DAYS (0 = unlimited / never delete)
    retAll: number;        // ALL / broadcast
    retGroup: number;      // group channels
    retMyDM: number;       // my own DMs (to/from me)
    retForeignDM: number;  // overheard foreign DMs
    retPos: number;        // positions (map nodes)
    retMheard: number;     // Heard list
}

const AppPrefsStore = new Store<AppPrefsState>({
    compactHeader: true,
    dmShowAll: false,
    alertAll: false,
    alertTGs: "",
    bannerAll: false,
    bannerTGs: "",
    dmAlert: "mine",
    discardAll: false,
    discardTGs: "",
    autoscrollAll: true,
    autoscrollTGs: "",
    tabHintSeen: false,
    tgLabels: "{}",
    ownCall: "",
    filtersEnabled: true,
    keepScreenOn: false,
    splitMethod: 'balanced',
    retAll: 2,
    retGroup: 7,
    retMyDM: 90,
    retForeignDM: 2,
    retPos: 7,
    retMheard: 2
});

export default AppPrefsStore;
