import { Store } from "pullstate";

// App-level UI preferences, persisted in the AppPrefs key/value DB table.
export interface AppPrefsState {
    // compact one-line chat message header (default) vs the legacy multi-line one
    compactHeader: boolean;
    // DM tab: show all overheard DM traffic (monitoring) vs only my own DMs (default)
    dmShowAll: boolean;
}

const AppPrefsStore = new Store<AppPrefsState>({
    compactHeader: true,
    dmShowAll: false
});

export default AppPrefsStore;
