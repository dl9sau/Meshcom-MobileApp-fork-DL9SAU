import { Store } from "pullstate";

// App-level UI preferences, persisted in the AppPrefs key/value DB table.
export interface AppPrefsState {
    // compact one-line chat message header (default) vs the legacy multi-line one
    compactHeader: boolean;
}

const AppPrefsStore = new Store<AppPrefsState>({
    compactHeader: true
});

export default AppPrefsStore;
