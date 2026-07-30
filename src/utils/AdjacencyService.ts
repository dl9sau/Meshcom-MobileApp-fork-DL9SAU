import AdjacencyStore from "../store/AdjacencyStore";

// Direct-neighbour sets per node, inferred from route-path ADJACENCY: in a path
// "ORIGIN,RELAY1,...,LASTHOP" every CONSECUTIVE pair are mutual direct RF neighbours
// (each heard the next one directly to relay it). This works for ALL nodes - including
// remote origins we never heard ourselves - because the path itself reveals who sits
// next to whom. Distinct from RelayCountService's "heard-via" (unique nodes that reached
// US through a given last-hop), which only makes sense for our OWN direct neighbours.
//
// Two sets per node, mirrored (sizes only) to AdjacencyStore:
//   sessionMap - this app run (RAM)                         -> "counts"
//   maxMap     - all-time (seeded from persisted paths + live) -> "max"  (max >= counts)
class AdjacencyService {
    private sessionMap: Map<string, Set<string>> = new Map();
    private maxMap: Map<string, Set<string>> = new Map();

    private norm(c: string): string { return (c || "").toUpperCase().trim(); }

    // add b to a's set in `map`; returns true if it was new
    private addOne(map: Map<string, Set<string>>, a: string, b: string): boolean {
        if (a === "" || b === "" || a === b) return false;
        let set = map.get(a);
        if (!set) { set = new Set<string>(); map.set(a, set); }
        if (set.has(b)) return false;
        set.add(b);
        return true;
    }

    // record every consecutive-pair adjacency in `path` into BOTH maps (live traffic)
    addPath(path: string[]) { this.apply(path, true); }
    // seed the all-time map only (from persisted position paths on startup)
    seedPath(path: string[]) { this.apply(path, false); }

    private apply(path: string[], live: boolean) {
        const p = path.map(c => this.norm(c)).filter(c => c !== "");
        const sessTouched = new Set<string>();
        const maxTouched = new Set<string>();
        for (let i = 0; i < p.length - 1; i++) {
            const a = p[i], b = p[i + 1];   // adjacent = mutual direct neighbours
            if (live) {
                if (this.addOne(this.sessionMap, a, b)) sessTouched.add(a);
                if (this.addOne(this.sessionMap, b, a)) sessTouched.add(b);
            }
            if (this.addOne(this.maxMap, a, b)) maxTouched.add(a);
            if (this.addOne(this.maxMap, b, a)) maxTouched.add(b);
        }
        if (sessTouched.size === 0 && maxTouched.size === 0) return;
        AdjacencyStore.update(s => {
            if (sessTouched.size) {
                const counts = { ...s.counts };
                sessTouched.forEach(c => { counts[c] = this.sessionMap.get(c)!.size; });
                s.counts = counts;
            }
            if (maxTouched.size) {
                const max = { ...s.max };
                maxTouched.forEach(c => { max[c] = this.maxMap.get(c)!.size; });
                s.max = max;
            }
        });
    }

    getCount(call: string): number { return this.sessionMap.get(this.norm(call))?.size ?? 0; }
    getMax(call: string): number { return this.maxMap.get(this.norm(call))?.size ?? 0; }

    clear() {
        this.sessionMap.clear();
        this.maxMap.clear();
        AdjacencyStore.update(s => { s.counts = {}; s.max = {}; });
    }
}

export default new AdjacencyService();
