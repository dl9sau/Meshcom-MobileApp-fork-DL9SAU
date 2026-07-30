import { Store } from "pullstate";

// Direct-neighbour counts per node, inferred from route-path adjacency (see
// AdjacencyService). Mirrors only the set SIZES so the UI can react.
//   counts - this app run (RAM)
//   max    - all-time (seeded from persisted position paths + grown live); max >= counts
export interface AdjacencyState {
    counts: { [call: string]: number };
    max: { [call: string]: number };
}

const AdjacencyStore = new Store<AdjacencyState>({ counts: {}, max: {} });

export default AdjacencyStore;
