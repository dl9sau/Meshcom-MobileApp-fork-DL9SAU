import { MsgType } from "./AppInterfaces";
import MheardStore from "../store/MheardStore";
import PosiStore from "../store/PosiStore";
import LogS from "./LogService";

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

    const local = (n: string) =>
        (heardTime[n] !== undefined && (now - heardTime[n]) < HEARD_WINDOW) ||
        (posTime[n] !== undefined && (now - posTime[n]) < POS_WINDOW);

    const sf = norm(msg.fromCall);
    const relays = (msg.via || "").split(" > ").map(norm).filter(Boolean);

    const senderLocal = sf !== "" && local(sf);
    const relaysLocal = relays.length > 0 && relays.every(local);

    let verdict: GlobeState;
    // whole path incl. the original sender is provably local -> reached us via HF
    if (senderLocal && (relays.length === 0 || relaysLocal)) verdict = 'dim';
    // delivery relays all local HF but the sender is unknown -> undecidable -> dimmed
    else if (relaysLocal) verdict = 'faint';
    // not even the relays are confidently local -> treat as from the wider network
    else verdict = 'solid';

    // DIAGNOSTIC (remove once verified): show WHY. "+" = node counts as local, "-" = not.
    LogS.log(0, `GLOBE ${sf}[${senderLocal ? "+" : "-"}] via=[${relays.map(r => r + (local(r) ? "+" : "-")).join(" ")}] => ${verdict}`);

    return verdict;
}
