import RelayCountStore from "../store/RelayCountStore";

// Counts, at app runtime only, how many unique nodes were relayed to us via a
// given direct neighbour. The actual Sets live here in memory; RelayCountStore
// mirrors only the sizes so the UI can react.
//
// A relayed packet carries a route path "ORIGIN,RELAY1,...,LASTHOP". The last
// entry is the node we heard directly (our neighbour); every entry before it is
// a node that reached us "via" that neighbour.
class RelayCountService {

    // neighbour callsign (UPPERCASE) -> set of unique callsigns heard via them
    private relayMap: Map<string, Set<string>> = new Map();

    private norm(call: string): string {
        return (call || "").toUpperCase().trim();
    }

    // register that the given calls were relayed to us via `neighbour`
    addHeardVia(neighbour: string, calls: string[]) {
        const nb = this.norm(neighbour);
        if (nb === "") return;

        let set = this.relayMap.get(nb);
        if (!set) {
            set = new Set<string>();
            this.relayMap.set(nb, set);
        }

        let changed = false;
        for (const raw of calls) {
            const c = this.norm(raw);
            if (c === "" || c === nb) continue;
            if (!set.has(c)) {
                set.add(c);
                changed = true;
            }
        }

        if (changed) {
            const size = set.size;
            RelayCountStore.update(s => {
                s.counts = { ...s.counts, [nb]: size };
            });
        }
    }

    getCount(neighbour: string): number {
        const set = this.relayMap.get(this.norm(neighbour));
        return set ? set.size : 0;
    }

    clear() {
        this.relayMap.clear();
        RelayCountStore.update(s => { s.counts = {}; });
    }
}

export default new RelayCountService();
