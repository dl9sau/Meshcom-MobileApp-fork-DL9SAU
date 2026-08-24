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
    // How many PACKETS this node forwarded towards us - the other half of the question.
    // `counts` says how many different stations it carried, this says how much traffic.
    // Session only: the database keeps one row per station, not one per packet, so there
    // is no packet history to replay - a seeded "(max)" would be a made-up number.
    // Counted for EVERY relay in a path, gateway or not, which is what makes it the figure
    // for a plain repeater (asked in the field, DL9SAU 2026-08-24).
    pkts: { [neighbour: string]: number };
}

const RelayCountStore = new Store<RelayCountState>({
    counts: {},
    max: {},
    pkts: {}
});

export default RelayCountStore;
