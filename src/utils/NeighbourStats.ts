// Shared formatting for the two neighbour figures, so the map overlay and the Heard
// list can never drift apart again (they used to show different things under the same
// label "Neighbours" - one showed the relay/heard-via count, the other the firmware one).
//
// Three DISTINCT data points per node, deliberately never merged into one number:
//   direct neighbours - what WE inferred from route-path adjacency (consecutive calls in
//                       a path are direct RF neighbours). Works for remote nodes too.
//   advertised        - what the node itself last reported (its own Mheard size, from the
//                       position "/N" field or the Mheard NCNT). Overwritten by every
//                       fresh packet, so it follows a reboot, but can be stale until we
//                       hear the node again.
//   heard via         - unique nodes that reached US through this node as the last hop.
//                       Only meaningful for our OWN direct neighbours.

// "N (max M)" - the all-time value is shown even when it equals the session count.
// Without it "2" next to "advertised 9" is not comparable: you cannot tell whether the 2
// is just this session or everything we ever saw.
export const fmtCount = (session: number, max: number): string =>
    session + " (max " + Math.max(session, max) + ")";

// "5 (max 8) · advertised 12" - null when we know nothing at all about this node
export const fmtNeighbours = (session: number, max: number, advertised: number): string | null => {
    const parts: string[] = [];
    if (session > 0 || max > 0) parts.push(fmtCount(session, max));
    if (advertised > 0) parts.push("advertised " + advertised);
    return parts.length > 0 ? parts.join(" · ") : null;
};

// "19 (max 45) stations" - how many DIFFERENT stations reached us through this node. The
// unit is spelled out because the traffic line below counts packets in a similar shape, and
// a bare "n (max m)" next to another bare "n (max m)" is exactly how one gets read as the
// other (field test C5, and again on the gateway line 2026-08-24).
export const fmtHeardVia = (session: number, max: number): string | null =>
    (session > 0 || max > 0) ? fmtCount(session, max) + " stations" : null;

// "128 pkts (12 from internet)" - how much traffic this node carried for us, and how much of
// it did not come off the air at all. The second figure is a SUBSET of the first, which is
// why it sits in brackets: with a comma it read like a second, separate quantity (asked in
// the field, DL9SAU 2026-08-24). Both count the same event - one packet that reached us
// through this node.
//   pkts     - everything it forwarded towards us, gateway or not. This is the figure a
//              PLAIN REPEATER has, and it used to exist nowhere: the gateway count only ever
//              fires on a set gw bit, which a normal node never sets. Positions count too,
//              hence "pkts" and not "msgs".
//   internet - of those, the ones this node fed in: the sender was not confirmed on our air,
//              which is the same judgement the globe marker makes on a single message.
// Both figures count THIS app run. The registry also keeps an all-time injected count for
// the map, but mixing it in here would put two time bases in one line.
//
// Duplicates do NOT inflate this: the node drops a repeated msg_id before the app ever sees
// it (firmware dedup ring, 60-100 ids). So the same packet arriving over a second path, or
// a sender's retransmission, counts once - credited to the relays of the copy that arrived
// FIRST. A relay that carried the same packet but lost the race gets nothing, which makes
// this "how much did this node deliver to me first", not "how much did it carry".
//
// What is deliberately NOT shown any more is the count of packets carrying the gw bit (was:
// "gatewayed 45"). It looks like a third quantity but is an artefact of how we detect
// gateways: the firmware sets that bit BOTH when a gateway injects and when it merely
// repeats air traffic, so the number mixes the two and cannot be explained to anyone in one
// sentence - which is exactly the test it failed (DL9SAU, 2026-08-24). The registry still
// counts it internally; it decides the map colour, it just is not a figure to read.
export const fmtRelayed = (pkts: number, injected: number): string | null => {
    if (pkts <= 0) return null;
    return pkts + " pkts" + (injected > 0 ? " (" + injected + " from internet)" : "");
};
