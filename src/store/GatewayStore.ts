import { Store } from "pullstate";

// Store for the gateway registry (D1). Which nodes are MQTT gateways is nowhere in the
// protocol - it is inferred from the gw bit plus the route path (see GatewayService).
// Two figures per gateway, the same shape as RelayCountStore:
//   counts: messages attributed to it THIS session (RAM, resets on restart)
//   max:    all-time, replayed on startup from the stored messages (so it is bounded by
//           the retention settings) and grown by live traffic -> shown as "(max N)"
export interface GatewayState {
    // key: gateway callsign (UPPERCASE) -> number of messages we attributed to it
    counts: { [call: string]: number };
    max: { [call: string]: number };
}

const GatewayStore = new Store<GatewayState>({
    counts: {},
    max: {}
});

export default GatewayStore;
