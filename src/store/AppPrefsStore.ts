import { Store } from "pullstate";

// App-level UI preferences, persisted in the AppPrefs key/value DB table.
export interface AppPrefsState {
    // compact one-line chat message header (default) vs the legacy multi-line one
    compactHeader: boolean;
    // DM tab: show all overheard DM traffic (monitoring) vs only my own DMs (default)
    dmShowAll: boolean;
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
    ownCall: "",
    retAll: 2,
    retGroup: 7,
    retMyDM: 90,
    retForeignDM: 2,
    retPos: 3,
    retMheard: 2
});

export default AppPrefsStore;
