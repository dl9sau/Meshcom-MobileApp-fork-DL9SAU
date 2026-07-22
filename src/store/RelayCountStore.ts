import { Store } from "pullstate";

// Store for the Mheard "Neighbours" fallback (used when older firmware reports
// NCNT = 0). Two figures per directly heard neighbour:
//   counts: unique nodes relayed via them THIS session (live, RAM only, resets
//           on restart) -> the current activity value.
//   max:    all-time unique nodes, reconstructed on startup from the persisted
//           positions' route paths and grown by live traffic -> the overall
//           value, shown as "(max N)". Survives a restart, matches the map.
export interface RelayCountState {
    // key: neighbour callsign (UPPERCASE) -> count of unique relayed nodes
    counts: { [neighbour: string]: number };
    max: { [neighbour: string]: number };
}

const RelayCountStore = new Store<RelayCountState>({
    counts: {},
    max: {}
});

export default RelayCountStore;
