import { Store } from "pullstate";

// Counts per reception category. The three are DISJOINT and cover every received
// packet, so they add up to the total:
//   direct - heard with no relay in between (0 hops)
//   hf     - relayed, but our globe verdict says the origin is local RF
//   gw     - our globe verdict says the origin came from the wider network
// Positions can never be 'gw': they are not gatewayed (bGATEWAY_NOPOS), so that
// field staying 0 is a useful sanity check.
export interface CatCounts { direct: number; hf: number; gw: number; }

// App-wide RECEIVE statistics (from others), mirrored from StatsService for the UI.
// Counts are UNIQUE packets - the firmware dedups by msg_id before handing them to us,
// so these are messages, never airtime copies. Own traffic is excluded; it lives
// per-call in NodeRuntimeService ("me" line).
export interface StatsState {
    pos: CatCounts;   // position beacons
    msg: CatCounts;   // channel messages (broadcast + talk groups)
    dm: CatCounts;    // direct messages from others (addressed to me or overheard)
    // unique senders, by the category they were heard in. A station can appear in more
    // than one (heard directly today, via a gateway yesterday), so these do NOT add up
    // to callsAll - that is the size of the union.
    callsDirect: number;
    callsHf: number;
    callsGw: number;
    callsAll: number;
    // distinct callsigns in the DATABASE (message senders + nodes we hold a position
    // for), i.e. everything we ever heard within the retention window. -1 = not loaded.
    dbCalls: number;
    // Acknowledgements for OUR OWN sent messages - the firmware only forwards an ACK to the
    // app when it matches one of our own transmissions, and only once per message. Named
    // after what the firmware actually reports (see the verified facts in the backlog):
    //   heard - state 0x00, "ONLY HEARD": somebody repeated our message on the air
    //   acked - state 0x01/0x02: a real acknowledgement came back. For a DM that IS the
    //           addressed node; for a channel message it can also be "server reached", and
    //           the firmware's own GW/Node switch is hardcoded, so the two cannot be split.
    ack: { heard: number; acked: number };
}

const zero = (): CatCounts => ({ direct: 0, hf: 0, gw: 0 });

const StatsStore = new Store<StatsState>({
    pos: zero(), msg: zero(), dm: zero(),
    callsDirect: 0, callsHf: 0, callsGw: 0, callsAll: 0,
    dbCalls: -1,
    ack: { heard: 0, acked: 0 }
});

export default StatsStore;
