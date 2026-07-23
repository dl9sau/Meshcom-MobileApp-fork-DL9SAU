import { Store } from "pullstate";

// App-level UI preferences, persisted in the AppPrefs key/value DB table.
export interface AppPrefsState {
    // compact one-line chat message header (default) vs the legacy multi-line one
    compactHeader: boolean;
    // DM tab: show all overheard DM traffic (monitoring) vs only my own DMs (default)
    dmShowAll: boolean;
    // per-scope notification ("alert = it beeps"). Defaults are quiet except DMs
    // addressed to me. Foreign DMs never alert (no setting). Toggle via long-press
    // on the channel tab. alertTGs = CSV of TG numbers whose notifications are on.
    alertAll: boolean;      // ALL / broadcast beeps
    alertTGs: string;       // CSV of talk-group numbers that beep, e.g. "20,262"
    alertDMmine: boolean;   // DMs addressed to me beep
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
    alertDMmine: true,
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
