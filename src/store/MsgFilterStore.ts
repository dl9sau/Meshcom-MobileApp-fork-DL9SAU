import { Store } from "pullstate";

// Raw, user-entered block-filter rules (one rule per line). Mirrored here so the
// Settings UI can display/edit them reactively. The compiled forms live in
// MsgFilterService. Persisted in the MsgFilters DB table.
export interface MsgFilterState {
    callRaw: string;  // blocked callsigns, one per line (exact, incl. SSID)
    textRaw: string;  // DENY text patterns, one per line (Wort / ^start / end$ / *wild*)
    allowRaw: string; // ALLOW (whitelist) text patterns; same notation + #scope
}

const MsgFilterStore = new Store<MsgFilterState>({
    callRaw: "",
    textRaw: "",
    allowRaw: ""
});

export default MsgFilterStore;
