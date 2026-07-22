import RelayCountStore from "../store/RelayCountStore";

// Counts how many unique nodes were relayed to us via a given direct neighbour.
// Two sets per neighbour:
//   relayMap - THIS session only (RAM, resets on restart) -> "counts" (current).
//   maxMap   - all-time: seeded on startup from the persisted positions' route
//              paths (seedMax) and grown by live traffic -> "max" (overall).
// RelayCountStore mirrors only the sizes so the UI can react. relayMap is always
// a subset of maxMap, so max >= counts.
//
// A relayed packet carries a route path "ORIGIN,RELAY1,...,LASTHOP". The last
// entry is the node we heard directly (our neighbour); every entry before it is
// a node that reached us "via" that neighbour.
class RelayCountService {

    // neighbour callsign (UPPERCASE) -> set of unique callsigns heard via them
    private relayMap: Map<string, Set<string>> = new Map();   // this session
    private maxMap: Map<string, Set<string>> = new Map();      // all-time

    private norm(call: string): string {
        return (call || "").toUpperCase().trim();
    }

    // add `calls` to a neighbour's set in `map`; returns true if anything new was
    // added (so the caller knows whether to push the new size to the store)
    private addToMap(map: Map<string, Set<string>>, nb: string, calls: string[]): boolean {
        let set = map.get(nb);
        if (!set) { set = new Set<string>(); map.set(nb, set); }
        let changed = false;
        for (const raw of calls) {
            const c = this.norm(raw);
            if (c === "" || c === nb) continue;
            if (!set.has(c)) { set.add(c); changed = true; }
        }
        return changed;
    }

    // register that the given calls were relayed to us via `neighbour` (live).
    // Grows both the session set and the all-time set.
    addHeardVia(neighbour: string, calls: string[]) {
        const nb = this.norm(neighbour);
        if (nb === "") return;

        const sessionChanged = this.addToMap(this.relayMap, nb, calls);
        const maxChanged = this.addToMap(this.maxMap, nb, calls);

        if (sessionChanged || maxChanged) {
            const sessionSize = this.relayMap.get(nb)?.size ?? 0;
            const maxSize = this.maxMap.get(nb)?.size ?? 0;
            RelayCountStore.update(s => {
                if (sessionChanged) s.counts = { ...s.counts, [nb]: sessionSize };
                if (maxChanged) s.max = { ...s.max, [nb]: maxSize };
            });
        }
    }

    // seed the all-time set only (from persisted data on startup). Does NOT touch
    // the session set, so "counts" stays the live value while "max" reflects the
    // overall history right after a restart.
    seedMax(neighbour: string, calls: string[]) {
        const nb = this.norm(neighbour);
        if (nb === "") return;
        if (this.addToMap(this.maxMap, nb, calls)) {
            const maxSize = this.maxMap.get(nb)?.size ?? 0;
            RelayCountStore.update(s => { s.max = { ...s.max, [nb]: maxSize }; });
        }
    }

    getCount(neighbour: string): number {
        const set = this.relayMap.get(this.norm(neighbour));
        return set ? set.size : 0;
    }

    getMax(neighbour: string): number {
        const set = this.maxMap.get(this.norm(neighbour));
        return set ? set.size : 0;
    }

    clear() {
        this.relayMap.clear();
        this.maxMap.clear();
        RelayCountStore.update(s => { s.counts = {}; s.max = {}; });
    }
}

export default new RelayCountService();
