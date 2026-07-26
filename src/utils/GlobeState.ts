import { MsgType } from "./AppInterfaces";
import MheardStore from "../store/MheardStore";
import PosiStore from "../store/PosiStore";

// Gateway/HF-origin verdict for a chat message ("globe" marker):
//   'none'  -> no MQTT-gateway bit set (definitely local HF) -> no globe
//   'dim'   -> bit set BUT the whole path is in our recent HF horizon
//              (sender heard directly, or every path node in our map < 24h)
//              -> "very likely reached us via HF despite the bit"
//   'solid' -> bit set and the path is NOT confidently HF -> show the globe
//
// Computed against the CURRENT heard/positions horizon. It is meant to be called
// ONCE at receive time and PERSISTED on the message (msg.gwState), so the marker
// does not drift as the sliding 24h window ages past historical messages. Reads
// the pullstate stores directly, so it also works outside a React render.

export type GlobeState = 'none' | 'solid' | 'dim';

const DAY = 24 * 3600 * 1000;
const norm = (c: string) => (c || "").replace(/[[\]]/g, "").trim().toUpperCase();

export function computeGlobeState(msg: MsgType): GlobeState {
    if (msg.gw !== 1) return 'none';

    // sender heard directly on HF?
    const mhArr = MheardStore.getRawState().mhArr;
    const mheardSet = new Set(mhArr.map(m => (m.mh_callSign || "").trim().toUpperCase()));
    if (mheardSet.has(norm(msg.fromCall))) return 'dim';

    // whole path (sender + RF/VIA relays) provably in our map within the last 24h?
    const posArr = PosiStore.getRawState().posArr;
    const posMap: { [k: string]: number } = {};
    posArr.forEach(p => { posMap[(p.callSign || "").trim().toUpperCase()] = p.timestamp; });

    const nodes = new Set<string>();
    const sf = norm(msg.fromCall); if (sf) nodes.add(sf);
    (msg.via || "").split(" > ").forEach(p => { const n = norm(p); if (n) nodes.add(n); });

    const now = Date.now();
    const arr = [...nodes];
    const allLocal = arr.length > 0 && arr.every(n => posMap[n] !== undefined && (now - posMap[n]) < DAY);
    return allLocal ? 'dim' : 'solid';
}
