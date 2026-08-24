// Human-readable durations, shared so the same span never appears in two different
// spellings. Used for "Age" in the map overlay and for how long MY STATS has been counting.

// ms timestamp -> "1d 23h 3min" (days and hours only once they are non-zero).
// A DURATION on purpose, not a clock time: a reader can judge "how much is that" without
// working out the difference to now in their head (DL9SAU).
export const formatAge = (ts: number): string => {
    if (!ts || ts <= 0) return "n.a.";
    let diff = Date.now() - ts;
    if (diff < 0) diff = 0;

    const totalMin = Math.floor(diff / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;

    let out = "";
    if (days > 0) out += days + "d ";
    if (days > 0 || hours > 0) out += hours + "h ";
    out += mins + "min";
    return out;
};
