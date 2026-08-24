import { Store } from "pullstate";

// Store for the gateway registry (D1). Which nodes are MQTT gateways is nowhere in the
// protocol - it is inferred from the gw bit plus the route path (see GatewayInferenceService).
// Two figures per gateway, the same shape as RelayCountStore:
//   counts: messages attributed to it THIS session (RAM, resets on restart)
//   max:    all-time, replayed on startup from the stored messages (so it is bounded by
//           the retention settings) and grown by live traffic -> shown as "(max N)"
// Plus the SECOND, weaker detector (D1b), kept in its own field so a heuristic can never
// be mistaken for a proof: nodes that put more different senders on our air than they
// themselves claim to hear. Not counted, not coloured on the map - shown as "probably".
export interface GatewayState {
    // key: gateway callsign (UPPERCASE) -> number of messages we attributed to it
    counts: { [call: string]: number };
    max: { [call: string]: number };
    // key: callsign -> the two numbers behind the D1b verdict (senders seen vs. advertised)
    probable: { [call: string]: { seen: number, advertised: number } };
}

const GatewayStore = new Store<GatewayState>({
    counts: {},
    max: {},
    probable: {}
});

export default GatewayStore;
