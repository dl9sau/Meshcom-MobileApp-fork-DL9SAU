import { MsgType } from "./AppInterfaces";
import MheardStore from "../store/MheardStore";
import PosiStore from "../store/PosiStore";
import HfHeardService from "./HfHeardService";

// Gateway/HF-origin verdict for a chat message ("globe" marker). The gw bit (0x80)
// only says "ran through an MQTT gateway SOMEWHERE" - a local HF message that a
// gateway also relayed carries it too. So we look at whether the path is provably
// local to decide how the message reached US:
//   'none'  -> no gw bit (definitely local HF)                 -> no globe
//   'dim'   -> gw bit BUT the ORIGINAL SENDER is provably local -> no globe
//              (heard on RF <24h, or a position <24h) - the whole path incl. origin
//              is local, so it reached us via HF despite the bit
//   'faint' -> gw bit, sender UNKNOWN, but every VIA relay is provably local (heard
//              or positioned <24h) -> reached us over an HF last mile, but we can't
//              tell if the origin was HF or injected via a gateway upstream (e.g. the
//              sender just powered on, no beacon yet) -> a DIMMED globe (undecidable)
//   'solid' -> gw bit and not even the delivery relays are confidently local -> globe
//
// "Local" = HF evidence within 24h: we HEARD the node on RF (mheard - which for a
// relayed frame includes the LAST HOP we received) OR it beaconed a position we hold.
// mheard is the fresher/stronger signal. Computed ONCE at receive and PERSISTED
// (msg.gwState) so the marker doesn't drift as the 24h window slides. ('faint' is new
// - older messages that predate it were frozen as 'solid'/'dim' and render as before.)

export type GlobeState = 'none' | 'solid' | 'dim' | 'faint';

// "recently heard on RF" window: aligned to the firmware, which purges its mheard
// list after 12h (mheard_functions.cpp) - so an app mheard entry means "the node was
// a direct RF neighbour within the last 12h". Positions get their own, longer window:
// a position beacon from the last day still places the node locally (covers "I'm
// travelling"), and there's no firmware retention to match there.
const HEARD_WINDOW = 12 * 3600 * 1000;
const POS_WINDOW = 24 * 3600 * 1000;
const norm = (c: string) => (c || "").replace(/[[\]]/g, "").trim().toUpperCase();

export function computeGlobeState(msg: MsgType): GlobeState {
    if (msg.gw !== 1) return 'none';

    const now = Date.now();
    // last time we heard each call on RF (mheard) and last position we hold for it
    const mhArr = MheardStore.getRawState().mhArr;
    const heardTime: { [k: string]: number } = {};
    mhArr.forEach(m => { const c = (m.mh_callSign || "").trim().toUpperCase(); if (c) heardTime[c] = Math.max(heardTime[c] || 0, m.mh_timestamp || 0); });
    const posArr = PosiStore.getRawState().posArr;
    const posTime: { [k: string]: number } = {};
    posArr.forEach(p => { const c = (p.callSign || "").trim().toUpperCase(); if (c) posTime[c] = Math.max(posTime[c] || 0, p.timestamp || 0); });

    // 3rd source: seen as a relay in an HF position packet (positions are HF-only,
    // so any node in a position's path is HF-local - even without its own beacon)
    const hfSeen = (n: string) => {
        const t = HfHeardService.lastHeard(n);
        return t !== undefined && (now - t) < POS_WINDOW;
    };
    const local = (n: string) =>
        (heardTime[n] !== undefined && (now - heardTime[n]) < HEARD_WINDOW) ||
        (posTime[n] !== undefined && (now - posTime[n]) < POS_WINDOW) ||
        hfSeen(n);

    const sf = norm(msg.fromCall);

    // heard DIRECTLY (hop 0 - no relays in the path): we received the sender's own RF,
    // so it's HF regardless of whether we hold its beacon/position yet.
    const directHeard = (msg.via || "").split(" > ").map(norm).filter(Boolean).length === 0;

    // ONLY the sender's own HF-locality decides. Local RELAYS do NOT imply an HF
    // origin: a local gateway injects internet traffic and relays it locally on HF -
    // field-confirmed (distant senders from Dortmund/Sauerland, several 100 km, all
    // arriving via the SAME local relay chain, and we never heard THEIR position on
    // HF). So the old dimmed 'faint' hedge for "relays local, sender unknown" was
    // ~99% wrong (internet) and is dropped: no confirmed-local sender -> full globe.
    const senderLocal = sf !== "" && (directHeard || local(sf));
    return senderLocal ? 'dim' : 'solid';
}
