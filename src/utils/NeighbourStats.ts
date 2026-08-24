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

// "128 pkts, gatewayed 45, 12 from internet" - how much traffic this node carried for us,
// and how much of it it handled AS A GATEWAY.
//
// Two figures, deliberately in one line (idea DL9SAU 2026-08-24), because the second is a
// subset of the first and reading them apart invites the wrong conclusion:
//   pkts      - everything it forwarded towards us, gateway or not. This is the figure a
//               PLAIN REPEATER has, and it used to exist nowhere: the gateway count only
//               ever fires on a set gw bit, which a normal node never sets. Positions count
//               too, hence "pkts" and not "msgs".
//   gatewayed - of those, the ones carrying the gw bit, i.e. where this node was the
//               gatewaying hop. Any number above zero PROVES the node is a gateway.
//   internet  - of those again, the ones whose origin was not HF-confirmed, so this node
//               fed them in rather than passing on air traffic. The gw bit alone does not
//               separate the two - see the gateway registry.
// "(max n)" appears on the gateway figure only when it exceeds the session count: it is
// replayed from the database on startup, while the packet count is session-only (the
// database keeps one row per station, so there is no packet history to replay).
export const fmtRelayed = (pkts: number, gwSession: number, gwMax: number,
                           injected: number): string | null => {
    const gw = Math.max(gwSession, 0);
    if (pkts <= 0 && gw <= 0 && gwMax <= 0) return null;
    const parts: string[] = [];
    if (pkts > 0) parts.push(pkts + " pkts");
    if (gw > 0 || gwMax > 0) {
        parts.push("gatewayed " + gw + (gwMax > gw ? " (max " + gwMax + ")" : ""));
        if (injected > 0) parts.push(injected + " from internet");
    }
    return parts.join(", ");
};
