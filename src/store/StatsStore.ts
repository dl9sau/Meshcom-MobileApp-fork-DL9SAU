import { Store } from "pullstate";

// App-wide RECEIVE statistics (from others), mirrored from StatsService for the UI.
// Counts are unique messages/positions (the firmware dedups by msg_id) received since
// app start; own traffic is excluded (that lives per-call in NodeRuntimeService).
export interface StatsState {
    rxMsgHf: number;   // text msgs from others, globe "local" (direct + via)
    rxMsgGw: number;   // text msgs from others, globe "solid" (internet-origin)
    rxPos: number;     // positions from others (all HF - never gatewayed)
    callsHf: number;   // unique senders heard HF-local
    callsGw: number;   // unique senders classified internet-origin
}

const StatsStore = new Store<StatsState>({
    rxMsgHf: 0, rxMsgGw: 0, rxPos: 0, callsHf: 0, callsGw: 0
});

export default StatsStore;
