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
    // neighbour -> number of PACKETS it forwarded towards us (session only, see the store)
    private pktMap: Map<string, number> = new Map();

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

    // Credit EVERY node in a path, not just the last hop: in "ORIGIN,R1,...,LASTHOP"
    // each entry forwarded everything that sits BEFORE it towards us. For the last hop
    // this is exactly the old behaviour; for the relays further out it answers "how much
    // does this node carry for others", i.e. how important it is to the RF network -
    // which is interesting for remote repeaters too, not only for our own neighbours.
    // Bias to keep in mind: we only ever see the paths that reach US, so this is always
    // a lower bound on what a node really forwards.
    addForwardedAlongPath(path: string[]) {
        for (let i = 1; i < path.length; i++) this.addHeardVia(path[i], path.slice(0, i));
        this.countPacket(path);
    }

    // One received packet, credited to every relay that carried it. Unlike the unique-station
    // sets above this grows with every reception, which is precisely what answers "how much
    // does this node repeat" - including for nodes that are NOT gateways and therefore never
    // appear in the gateway figure.
    private countPacket(path: string[]) {
        const touched: string[] = [];
        for (let i = 1; i < path.length; i++) {
            const nb = this.norm(path[i]);
            if (nb === "") continue;
            this.pktMap.set(nb, (this.pktMap.get(nb) ?? 0) + 1);
            touched.push(nb);
        }
        if (touched.length === 0) return;
        RelayCountStore.update(s => {
            const pkts = { ...s.pkts };
            touched.forEach(nb => { pkts[nb] = this.pktMap.get(nb) ?? 0; });
            s.pkts = pkts;
        });
    }

    // same, but all-time only (startup seeding from persisted position paths)
    seedForwardedAlongPath(path: string[]) {
        for (let i = 1; i < path.length; i++) this.seedMax(path[i], path.slice(0, i));
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
        this.pktMap.clear();
        RelayCountStore.update(s => { s.counts = {}; s.max = {}; s.pkts = {}; });
    }
}

export default new RelayCountService();
