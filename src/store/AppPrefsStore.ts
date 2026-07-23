import { Store } from "pullstate";

// App-level UI preferences, persisted in the AppPrefs key/value DB table.
export interface AppPrefsState {
    // compact one-line chat message header (default) vs the legacy multi-line one
    compactHeader: boolean;
    // DM tab: show all overheard DM traffic (monitoring) vs only my own DMs (default)
    dmShowAll: boolean;
    // per-scope notification ("alert = it beeps"). Defaults are quiet except DMs
    // addressed to me. Toggle via long-press on the channel tab. Mute only kills
    // the beep - the green new-message indicator stays; only Discard hides both.
    alertAll: boolean;      // ALL / broadcast beeps
    alertTGs: string;       // CSV of talk-group numbers that beep, e.g. "20,262"
    dmAlert: string;        // DM notifications: "none" | "mine" | "all" (default "mine")
    // Discard = hide a channel's messages AND suppress its green indicator/beep,
    // without de-configuring it. discardAll/discardTGs for ALL and talk groups;
    // for DMs the "discard not-for-me" is the existing dmShowAll (false = foreign
    // DMs hidden). Own DMs are always shown.
    discardAll: boolean;    // hide the ALL / broadcast channel
    discardTGs: string;     // CSV of talk-group numbers that are hidden
    // one-time onboarding hint ("long-press a tab") already shown?
    tabHintSeen: boolean;
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
    dmAlert: "mine",
    discardAll: false,
    discardTGs: "",
    tabHintSeen: false,
    ownCall: "",
    retAll: 2,
    retGroup: 7,
    retMyDM: 90,
    retForeignDM: 2,
    retPos: 7,
    retMheard: 2
});

export default AppPrefsStore;
