// HfHeardService
// Learns HF-local nodes from the relay paths of received POSITION packets: a position
// that travelled over HF proves EVERY node in its source path (left of the '>') is a
// local HF node, even one we hold no position or mheard entry for yet. This is a 3rd
// "local" evidence source for the globe marker (see GlobeState.computeGlobeState), on
// top of mheard (direct neighbours) and positions.
//
// KNOWN GAP, DELIBERATELY LEFT OPEN (see B9 in the backlog). The premise used to be
// "positions are never re-injected from the internet onto RF" - that is WRONG. A gateway
// accepts 0x3A/0x21/0x40 from the server and transmits them on LoRa by default
// (udp_functions.cpp:166ff); bGATEWAY_NOPOS, which suppresses it for positions, defaults
// to FALSE (loop_functions.cpp:155) - it is an operator switch, not the normal case. So a
// position path CAN carry relays from a far region. The criterion to tell them apart
// exists (anything injected carries msg_server/gw=1), and for TEXT we already use it
// (MessageHandler, gw==0). For positions we knowingly do not: DL9SAU has never observed a
// gateway forwarding positions in the field (2026-08-29), and filtering would cost most of
// what this service knows wherever a neighbouring gateway sits. If it ever shows up, the
// fix is one condition - and the DB seeding needs a gw column first.
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
