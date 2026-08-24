import { RateInfo } from "../store/LinkRateStore";

// Shared formatting for the reception rates, so the Heard list, the map overlay and the
// stats panel can never drift apart - the same lesson as NeighbourStats.

// "~30 min" - only shown where the interval was ESTIMATED (positions). HEY's 15 min are a
// firmware constant and need no comment.
export const fmtInterval = (ms: number): string => {
    const min = ms / 60000;
    return min >= 1.5 ? "~" + Math.round(min) + " min" : "~" + Math.round(ms / 1000) + " s";
};

// "11/12 (92%)" - what we got against what the node should have sent while we had contact.
// null when there is not enough to say anything; "n heard, irregular" when the node keeps
// no dependable interval - a percentage against a made-up interval is worse than none.
export const fmtRate = (r: RateInfo | undefined, showInterval?: boolean): string | null => {
    if (!r || r.got <= 0) return null;
    if (r.irregular) return r.got + " heard, irregular";
    if (r.expected <= 0) return null;
    const pct = Math.round((r.got / r.expected) * 100);
    return r.got + "/" + r.expected + " (" + pct + "%" +
        (showInterval ? ", " + fmtInterval(r.intervalMs) : "") + ")";
};

// HEY carries a second figure: foreign beacons this node forwarded for others - how much it
// carries for the mesh, next to how well WE hear it. A node we only ever caught relaying
// has no rate of its own, but the relay count is still worth showing.
export const fmtHeyRate = (r: RateInfo | undefined): string | null => {
    const base = fmtRate(r);
    const rel = r?.relayed ?? 0;
    if (base === null) return rel > 0 ? "relayed " + rel : null;
    return rel > 0 ? base + " · relayed " + rel : base;
};
