import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow, IonText } from "@ionic/react";

import { PosType } from "../utils/AppInterfaces";
import { useState, useRef } from "react";
import { useStoreState } from "pullstate";
import DMfrmMapStore from "../store/DMfrmMap";
import MhStore from "../store/MheardStore";
import NodeRuntimeStore from "../store/NodeRuntimeStore";
import RelayCountStore from "../store/RelayCountStore";
import AdjacencyStore from "../store/AdjacencyStore";
import GatewayStore from "../store/GatewayStore";
import { fmtNeighbours, fmtHeardVia } from "../utils/NeighbourStats";
import { useHistory } from "react-router";
import ConfigObject from "../utils/ConfigObject";
import { distanceKm } from "../utils/GeoUtils";
import './MapOverlay.css';


// format the age of a position (ms timestamp -> "2h 15min", days only if > 0)
const formatAge = (ts: number): string => {
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


// build the display lines for a route path: drop the leading origin (the node
// itself, already shown as the card title) and wrap after every 2 calls, so a
// long path doesn't blow up the overlay width. Keeps the " > " notation.
// Returns [] when there is no relay path (e.g. a directly heard node).
const formatPathLines = (path: string, ownCall: string): string[] => {
    if (!path) return [];
    let parts = path.split(" > ").map(p => p.trim()).filter(p => p !== "");
    if (parts.length > 0 && parts[0].toUpperCase() === (ownCall || "").toUpperCase()) {
        parts = parts.slice(1); // drop the originating node itself
    }
    if (parts.length === 0) return [];

    const lines: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
        const pair = parts.slice(i, i + 2);
        const isLast = i + 2 >= parts.length;
        lines.push(pair.join(" > ") + (isLast ? "" : " >"));
    }
    return lines;
};


interface MapOverlayProps extends PosType {
    onCloseOverlay: () => void;
    lineMode?: boolean;   // compact card while a path line is shown (more map visible)
  }

  /*
  callSign={markerInfo.call_} lat={markerInfo.lat_} lon={markerInfo.lon_} alt={markerInfo.alt_} bat={markerInfo.bat_}
                  hw={markerInfo.hw_} pressure={markerInfo.press_} humidity={markerInfo.hum_} temperature={markerInfo.temp_} qnh={markerInfo.qnh_} timestamp={markerInfo.timestamp_} 
                  comment={markerInfo.comment_} temp_2={markerInfo.temp_2_} co2={markerInfo.co2_} gas_res={markerInfo.gas_res_} alt_press={markerInfo.alt_press_}
                  onCloseOverlay={onCloseOverlay}
   */

export const MapOverlay: React.FunctionComponent<MapOverlayProps> = ({ callSign, lat, lon, alt, bat, hw, pressure, humidity, temperature, qnh, timestamp, comment, temp_2, co2, gas_res, onCloseOverlay, lineMode }) => {

    const history = useHistory();

    // state to show more info like pressure, etc
    const [shExtInfo, setShExtInfo] = useState(false);

    // distance from our own position to this node
    const ownPos = ConfigObject.getOwnPosition();
    const dist = distanceKm(lat, lon, ownPos.LAT, ownPos.LON);

    const callUp = callSign?.toUpperCase();

    // SNR/RSSI is only available for directly heard nodes (from the Mheard list)
    const mhArr = useStoreState(MhStore, s => s.mhArr);
    const mheard = mhArr.find(m => m.mh_callSign?.toUpperCase() === callUp);

    // relay-neighbour counts (only meaningful for a directly heard node = one in
    // the Mheard list); current session + all-time "(max N)", same as Mheard
    const relayCounts = useStoreState(RelayCountStore, s => s.counts);
    const relayMax = useStoreState(RelayCountStore, s => s.max);
    // direct-neighbour counts we inferred from route-path adjacency (any node)
    const adjCounts = useStoreState(AdjacencyStore, s => s.counts);
    const adjMax = useStoreState(AdjacencyStore, s => s.max);
    // runtime per-node info (hops/path/#pos/#msg/groups/ncnt)
    const nodeInfoMap = useStoreState(NodeRuntimeStore, s => s.info);
    const nodeInfo = callUp ? nodeInfoMap[callUp] : undefined;
    // DIRECT NEIGHBOURS of this node: what WE observed from path adjacency
    // (this session `count`, all-time `max` - accumulates, grows only) plus what the
    // node itself last ADVERTISED (max of its position "N" and Mheard NCNT - the LAST
    // value, overwritten on each fresh packet, so it updates after a reboot but can be
    // stale until we hear it again). Shown for ANY node we have data for.
    const directNeighboursText = fmtNeighbours(
        (callUp ? adjCounts[callUp] : 0) ?? 0,
        (callUp ? adjMax[callUp] : 0) ?? 0,
        Math.max(mheard?.mh_ncnt ?? 0, nodeInfo?.ncnt ?? 0));
    // HEARD VIA this node: unique nodes whose traffic it forwarded towards us - counted
    // for EVERY position in a path now, not just our own direct neighbour, so it also
    // says how much a remote repeater carries for others (see addForwardedAlongPath).
    const heardViaText = fmtHeardVia(
        (callUp ? relayCounts[callUp] : 0) ?? 0,
        (callUp ? relayMax[callUp] : 0) ?? 0);

    // GATEWAY (D1): messages we could attribute to this node as the gatewaying hop.
    // Only ever grows - a node that gatewayed once is a gateway - so the figure says how
    // busy it is, not whether it still is one. null when we never saw it gateway anything.
    const gwCounts = useStoreState(GatewayStore, s => s.counts);
    const gwMax = useStoreState(GatewayStore, s => s.max);
    const gatewayText = fmtHeardVia(
        (callUp ? gwCounts[callUp] : 0) ?? 0,
        (callUp ? gwMax[callUp] : 0) ?? 0);
    // D1b: no proof, but this node put more DIFFERENT senders on our air than it claims to
    // hear itself - so at least one of them never reached it over RF. Shown with both raw
    // numbers, and only while D1 has nothing: a proof beats a heuristic.
    const gwProbable = useStoreState(GatewayStore, s => s.probable);
    const gwProb = callUp ? gwProbable[callUp] : undefined;
    const gatewayProbablyText = (gatewayText === null && gwProb)
        ? "probably (" + gwProb.seen + " senders relayed, advertises " + gwProb.advertised + ")"
        : null;

    // route path for display: origin dropped, wrapped after every 2 calls
    const pathLines = nodeInfo ? formatPathLines(nodeInfo.path, callSign) : [];


    // handle DM Button and switch to chat page
    const handleDM = (toCall:string) => {
        DMfrmMapStore.update(s => {
            s.dmfDMfrmMap.shDMfrmMap = true,
            s.dmfDMfrmMap.dmCallMap = toCall
        });
        // close the overlay
        onCloseOverlay();
        // forward to chat page
        history.push("/chat");
    }


    // Reliable tap for the overlay buttons. On a map the browser's synthesized
    // click is flaky: a few px of finger drift on a small button and the click
    // never fires (the button flashes but nothing happens). So detect the tap
    // ourselves on touchend within a small movement threshold, and preventDefault
    // so the (possibly missing) ghost click can't double-fire. onClick stays for
    // mouse/desktop; pigeon-drag-block on the container already stops map panning.
    const TAP_MOVE = 14; // px
    const tapX = useRef(0);
    const tapY = useRef(0);
    const tapMoved = useRef(false);

    const onTapStart = (e: any) => {
        const t = e?.touches?.[0];
        if (t) { tapX.current = t.clientX; tapY.current = t.clientY; }
        tapMoved.current = false;
    };
    const onTapMove = (e: any) => {
        const t = e?.touches?.[0];
        if (!t) return;
        if (Math.abs(t.clientX - tapX.current) > TAP_MOVE ||
            Math.abs(t.clientY - tapY.current) > TAP_MOVE) {
            tapMoved.current = true;
        }
    };
    const tap = (fn: () => void) => (e: any) => {
        if (tapMoved.current) return; // was a scroll/drag, not a tap
        if (e?.cancelable) e.preventDefault(); // suppress the ghost click -> no double fire
        fn();
    };

    // Path row(s) - "direct" or the wrapped relay list. Reused in the normal More
    // view and in the compact line-mode view (where it's always shown).
    const pathBlock = (nodeInfo && nodeInfo.hops === 0) ? (
        <><IonText>Path: direct</IonText><br /></>
    ) : pathLines.length > 0 ? (
        <><IonText>Path: {pathLines.map((ln, i) => (
            <span key={i}>{i > 0 ? <br /> : null}{i > 0 ? "  " : ""}{ln}</span>
        ))}</IonText><br /></>
    ) : null;



    return (
        <>
            {/* pigeon-drag-block: stop the map from treating a touch on the card
                as the start of a pan - otherwise it eats the button's click (the
                button visibly reacts but onClick never fires / needs 2-3 taps).
                pigeon-click-block: don't let the tap fall through as a map click. */}
            <div className="map-overlay-container pigeon-drag-block pigeon-click-block">
                <IonCard>
                    <IonCardHeader>
                        <IonCardTitle>{callSign}</IonCardTitle>
                    </IonCardHeader>
                    <IonCardContent>
                        <div className="info-container">
                            <div className="info">
                                <IonText>Age: {formatAge(timestamp)}</IonText><br />
                                <IonText>Dist: {dist > 0 ? dist.toFixed(2) + " km" : "n.a."}</IonText><br />
                                <IonText>Latitude: {lat}</IonText><br />
                                <IonText>Longitude: {lon}</IonText><br />
                                <IonText>Altitude: {alt}m</IonText><br />
                                {!lineMode && bat !== "N.A." ? <>
                                    <IonText>Battery: {bat}%</IonText><br />
                                </> : <></>}
                                {!lineMode ? <>
                                    <IonText>HW: {hw}</IonText><br />
                                </> : <></>}
                                {/* SNR/RSSI shown whenever available (direct nodes) - also in
                                    the compact line view, where it's relevant for a direct link */}
                                {mheard ? <>
                                    <IonText>SNR {mheard.mh_snr}dB / RSSI {mheard.mh_rssi}dBm</IonText><br />
                                </> : <></>}
                                {nodeInfo && nodeInfo.hops >= 0 ? <>
                                    <IonText>Hops: {nodeInfo.hops}</IonText><br />
                                </> : <></>}
                                {/* compact line-mode: Path right here, always visible */}
                                {lineMode ? pathBlock : null}
                            </div>
                            {!lineMode && shExtInfo && (
                                <div className="info">
                                    {pathBlock}
                                    <IonText>#pos: {nodeInfo?.posCount ?? 0}&nbsp;&nbsp;#msg: {nodeInfo?.msgCount ?? 0}</IonText><br />
                                    {/* Direct neighbours (our path-adjacency observation + what the
                                        node last advertised) - shown for any node we have data on */}
                                    {directNeighboursText !== null ? <><IonText>Neighbours: {directNeighboursText}</IonText><br /></> : <></>}
                                    {/* Heard via this node - only for our own direct neighbours */}
                                    {heardViaText !== null ? <><IonText>Heard via: {heardViaText}</IonText><br /></> : <></>}
                                    {/* Gateway (D1): shown only for nodes we could prove gatewayed
                                        something. The number is how many messages, not a confidence. */}
                                    {gatewayText !== null ? <><IonText>GW: {gatewayText}</IonText><br /></> : <></>}
                                    {/* Gateway (D1b): the weaker detector - more senders seen
                                        in front of this node than it advertises neighbours. */}
                                    {gatewayProbablyText !== null ? <><IonText>GW: {gatewayProbablyText}</IonText><br /></> : <></>}
                                    {/* booked talk groups (R= field), if the node reports any */}
                                    {nodeInfo?.groups ? <><IonText>Grp: {nodeInfo.groups.split(",").sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)).join(", ")}</IonText><br /></> : <></>}
                                    {/* sensor values: hidden when empty (0 = no sensor; temp uses 999 as n.a.) */}
                                    {pressure !== 0 ? <><IonText>Pressure: {pressure}hPa</IonText><br /></> : <></>}
                                    {temperature !== 999 ? <><IonText>Temp: {temperature}°C</IonText><br/></> : <></>}
                                    {temp_2 !== 999 ? <><IonText>Temp 2: {temp_2}°C</IonText><br/></> : <></>}
                                    {humidity !== 0 ? <><IonText>Humidity: {humidity}%</IonText><br/></> : <></>}
                                    {qnh !== 0 ? <><IonText>QNH: {qnh}hPa</IonText><br /></> : <></>}
                                    {co2 !== 0 ? <><IonText>eCO2: {co2}ppm</IonText><br /></> : <></>}
                                    {gas_res !== 0 ? <><IonText>Gas Res.: {gas_res}k&Omega;</IonText><br /></> : <></>}
                                </div>
                            )}
                        </div>
                        <div className="button-container">
                            {!lineMode && <IonButton size="small" onClick={() => handleDM(callSign)}
                                onTouchStart={onTapStart} onTouchMove={onTapMove} onTouchEnd={tap(() => handleDM(callSign))}>DM</IonButton>}
                            {!lineMode && <IonButton size="small" onClick={() => setShExtInfo(!shExtInfo)}
                                onTouchStart={onTapStart} onTouchMove={onTapMove} onTouchEnd={tap(() => setShExtInfo(!shExtInfo))}>
                                {shExtInfo ? "Less" : "More"}
                            </IonButton>}
                            <IonButton size="small" onClick={onCloseOverlay}
                                onTouchStart={onTapStart} onTouchMove={onTapMove} onTouchEnd={tap(onCloseOverlay)}>Close</IonButton>
                        </div>
                    </IonCardContent>
                </IonCard>
            </div>
        </>
    )
}