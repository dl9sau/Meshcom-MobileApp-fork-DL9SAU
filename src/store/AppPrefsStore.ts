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
    // one-time onboarding hint ("long-press a tab") already shown?
    tabHintSeen: boolean;
    // app-local cross-reference TG number -> free-text label (memory aid), as a
    // JSON map e.g. {"262":"DL"}. The firmware has no label field; rebuilt from
    // the Group Subscription fields on every save (so no orphans / mis-assigns).
    tgLabels: string;
    // own callsign, persisted so housekeeping can tell my DMs from overheard ones
    // (at app start, before a node connects, the live config call is not known yet)
    ownCall: string;
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
    tabHintSeen: false,
    tgLabels: "{}",
    ownCall: "",
    retAll: 2,
    retGroup: 7,
    retMyDM: 90,
    retForeignDM: 2,
    retPos: 7,
    retMheard: 2
});

export default AppPrefsStore;
