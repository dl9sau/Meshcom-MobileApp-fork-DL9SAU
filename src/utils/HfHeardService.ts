// HfHeardService
// Learns HF-local nodes from the relay paths of received POSITION packets. Positions
// don't get re-injected from the internet onto RF (firmware bGATEWAY_NOPOS), so a
// position we hear on RF travelled entirely over HF - therefore EVERY node in its
// source path (left of the '>') is a local HF node, even one we hold no position or
// mheard entry for yet. This is a 3rd "local" evidence source for the globe marker
// (see GlobeState.computeGlobeState), on top of mheard (direct neighbours) and
// positions.
//
// IMPORTANT: only feed this from POSITION packets. Message/text paths can carry relays
// from the origin's far region (server may not clear the path; SHORTPATH is per-node),
// so they are NOT a reliable HF-local signal.
//
// Runtime-only (RAM): rebuilt as positions flow in. A freshly-started app just has
// less data until the next positions arrive - conservative, never wrong.

class HfHeardService {
    // callsign (UPPERCASE) -> last time it was seen as a relay in an HF position path
    private lastSeen: Map<string, number> = new Map();

    private norm(call: string): string {
        return (call || "").replace(/[[\]]/g, "").trim().toUpperCase();
    }

    // record that these calls relayed an HF position packet at time `ts` (ms epoch)
    mark(calls: string[], ts: number): void {
        for (const raw of calls) {
            const c = this.norm(raw);
            if (c === "") continue;
            const prev = this.lastSeen.get(c);
            if (prev === undefined || ts > prev) this.lastSeen.set(c, ts);
        }
    }

    // last time (ms epoch) this call was seen relaying an HF position, or undefined
    lastHeard(call: string): number | undefined {
        return this.lastSeen.get(this.norm(call));
    }
}

export default new HfHeardService();
