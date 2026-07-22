import { Store } from "pullstate";

// Per-node info collected at app runtime (RAM only, resets on app restart).
//
// TODO(db-persist, backwards compatible): to keep hops/path across restarts,
// add nullable columns to the Positions table via a guarded
// "ALTER TABLE Positions ADD COLUMN <col>" migration (only when the column is
// missing, so existing DBs keep working) and mirror `hops`/`via` onto PosType.
// Then seed this store from the DB on load and keep writing here. Counters
// (#pos/#msg) stay runtime-only unless we decide to persist them too.
export interface NodeRuntimeInfo {
    hops: number;      // relays between origin and us (0 = heard directly); -1 = unknown
    path: string;      // route path, e.g. "OE1KFR-2 > OE1KFR-1"; "" = unknown
    posCount: number;  // position reports received from this node this runtime
    msgCount: number;  // text messages received from this node this runtime
}

export interface NodeRuntimeState {
    // key: node callsign (UPPERCASE) -> its runtime info
    info: { [call: string]: NodeRuntimeInfo };
}

const NodeRuntimeStore = new Store<NodeRuntimeState>({
    info: {}
});

export default NodeRuntimeStore;
