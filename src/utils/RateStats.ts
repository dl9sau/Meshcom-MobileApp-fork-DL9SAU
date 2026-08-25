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
// "irregular (30-180 min apart)" - the word plus the reason for it. Without the range a
// reader has to ask what "irregular" measured (asked in the field, DL9SAU 2026-08-25).
const fmtSpread = (r: RateInfo): string => {
    const lo = r.spreadLow ?? 0, hi = r.spreadHigh ?? 0;
    if (lo <= 0 || hi <= 0) return "";
    const m = (ms: number) => Math.round(ms / 60000);
    return m(hi) > m(lo) ? " (" + m(lo) + "-" + m(hi) + " min apart)" : " (~" + m(lo) + " min apart)";
};

export const fmtRate = (r: RateInfo | undefined, showInterval?: boolean): string | null => {
    if (!r || r.got <= 0) return null;
    if (r.irregular) return r.got + " heard, irregular" + fmtSpread(r);
    if (r.expected <= 0) return null;
    const pct = Math.round((r.got / r.expected) * 100);
    return r.got + "/" + r.expected + " (" + pct + "%" +
        (showInterval ? ", " + fmtInterval(r.intervalMs) : "") + ")";
};

// HEY carries a second figure: foreign beacons this node forwarded for others - how much it
// carries for the mesh, next to how well WE hear it. A node we only ever caught relaying
// has no rate of its own, but the relay count is still worth showing.
//
// A single own beacon is NOT enough for a quota - but saying nothing about it while printing
// "relayed 1" next to it reads as "this node only forwards", which is wrong. So an own
// beacon we cannot yet judge is still counted out loud: "1 heard".
export const fmtHeyRate = (r: RateInfo | undefined): string | null => {
    const base = fmtRate(r) ?? ((r && r.got > 0) ? r.got + " heard" : null);
    const rel = r?.relayed ?? 0;
    if (base === null) return rel > 0 ? "relayed " + rel : null;
    return rel > 0 ? base + " · relayed " + rel : base;
};

// "100% (~30 min)" - the compact form for places that already show the raw count next to it
// (the Heard list and the map overlay both print #pos), so the "8 of 10" would only repeat
// what is already on screen. null / "irregular" behave exactly as in fmtRate.
export const fmtRateShort = (r: RateInfo | undefined): string | null => {
    if (!r || r.got <= 0) return null;
    if (r.irregular) return "irregular" + fmtSpread(r);
    if (r.expected <= 0) return null;
    return Math.round((r.got / r.expected) * 100) + "% (" + fmtInterval(r.intervalMs) + ")";
};
