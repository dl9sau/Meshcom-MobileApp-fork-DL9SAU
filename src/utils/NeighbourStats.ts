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

// "19 (max 45)" - null when this node never relayed anything to us
export const fmtHeardVia = (session: number, max: number): string | null =>
    (session > 0 || max > 0) ? fmtCount(session, max) : null;
