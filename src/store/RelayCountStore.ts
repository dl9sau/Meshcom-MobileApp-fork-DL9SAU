import { Store } from "pullstate";

// Runtime-only store (RAM, not persisted): for each directly heard neighbour
// it holds the number of unique nodes that were relayed to us via that neighbour.
// Used as a fallback for the Mheard "Neighbours" value when older firmware
// reports NCNT = 0.
export interface RelayCountState {
    // key: neighbour callsign (UPPERCASE) -> count of unique relayed nodes
    counts: { [neighbour: string]: number };
}

const RelayCountStore = new Store<RelayCountState>({
    counts: {}
});

export default RelayCountStore;
