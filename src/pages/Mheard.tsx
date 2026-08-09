import { IonButton, IonCard, IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonGrid, IonRow, IonCol } from '@ionic/react';
import MhStore from '../store/MheardStore';
import ConfigStore from '../store/ConfStore';
import RelayCountStore from '../store/RelayCountStore';
import AdjacencyStore from '../store/AdjacencyStore';
import { fmtNeighbours, fmtHeardVia } from '../utils/NeighbourStats';
import NodeRuntimeStore from '../store/NodeRuntimeStore';
import { getMheards, getConfigStore } from '../store/Selectors';
import {ConfType, MheardType} from '../utils/AppInterfaces';
import './Mheard.css';
import { useEffect } from 'react';
import { useStoreState } from 'pullstate';


const Mheard = () => {

    // msgs from store
    const mharr_s:MheardType[] = useStoreState(MhStore, getMheards);
    // config state to know on which node we are
    const currConfig:ConfType = useStoreState(ConfigStore, getConfigStore);
    // runtime relay counts (fallback for Neighbours when firmware reports 0)
    // TODO(persist): relayCounts and nodeInfoMap are runtime-only and reset on
    // app restart. Once Positions/Mheard persist hops/via (see AppInterfaces
    // PosType/MheardType TODOs), a persistent "Hops x" row and the neighbour
    // count could be sourced from the DB instead. Design of NodeRuntimeStore
    // already keeps this a drop-in swap (same per-callsign shape).
    const relayCounts = useStoreState(RelayCountStore, s => s.counts);
    // all-time neighbour counts (survives restart, shown as "(max N)")
    const relayMax = useStoreState(RelayCountStore, s => s.max);
    // direct neighbours we inferred from route-path adjacency (session + all-time)
    const adjCounts = useStoreState(AdjacencyStore, s => s.counts);
    const adjMax = useStoreState(AdjacencyStore, s => s.max);
    // runtime per-node counters (#pos / #msg received this session)
    const nodeInfoMap = useStoreState(NodeRuntimeStore, s => s.info);


    useEffect(()=>{
        console.log("MH - " + mharr_s.length + " Mheards in View");
    }, [mharr_s]);


    return (
        <>
            <IonPage>
                <IonHeader>
                    <IonToolbar>
                        <IonTitle>Heard Direct Nodes</IonTitle>
                    </IonToolbar>
                </IonHeader>
                <IonContent className="ion-padding">
                    <IonHeader collapse="condense">
                        <IonToolbar>
                            <IonTitle size="large">Heard Direct Nodes</IonTitle>
                        </IonToolbar>
                    </IonHeader>
                    {mharr_s.length > 0 ? <>
                        {mharr_s.map((mhs, i) => (
                            <>
                                {mhs.mh_nodecall === currConfig.callSign ? <>
                                    <IonCard key={i}>
                                        <IonCardHeader>
                                            <IonCardTitle>{mhs.mh_callSign}</IonCardTitle>
                                        </IonCardHeader>
                                        <IonCardContent>
                                            <div className='mhcont'>
                                                <div>
                                                    <div className='rowcont'>
                                                        <div>Date:</div>
                                                        <div className='value'>{mhs.mh_date}</div>
                                                    </div>
                                                    <div className='rowcont'>
                                                        <div>RSSI:</div>
                                                        <div className='value'>{mhs.mh_rssi}dBm</div>
                                                    </div>
                                                    <div className='rowcont'>
                                                        <div>Hw:</div>
                                                        <div className='value'>{mhs.mh_hw}</div>
                                                    </div>
                                                    {/* Two DIFFERENT things, previously conflated under one label (this
                                                        list showed the heard-via count while the map showed the
                                                        firmware one): the node's own direct neighbours as we inferred
                                                        them from path adjacency (+ what it advertises), and what it
                                                        relayed to US. Same wording and formatting as the map overlay. */}
                                                    {(() => {
                                                        const key = mhs.mh_callSign?.toUpperCase();
                                                        const nb = fmtNeighbours(adjCounts[key] ?? 0, adjMax[key] ?? 0,
                                                            Math.max(mhs.mh_ncnt ?? 0, nodeInfoMap[key]?.ncnt ?? 0));
                                                        const hv = fmtHeardVia(relayCounts[key] ?? 0, relayMax[key] ?? 0);
                                                        return (<>
                                                            {nb ? <div className='rowcont'><div>Neighbours:</div><div className='value'>{nb}</div></div> : <></>}
                                                            {hv ? <div className='rowcont'><div>Heard via:</div><div className='value'>{hv}</div></div> : <></>}
                                                        </>);
                                                    })()}
                                                    <div className='rowcont'>
                                                        <div>#pos:</div>
                                                        <div className='value'>{nodeInfoMap[mhs.mh_callSign?.toUpperCase()]?.posCount ?? 0}</div>
                                                    </div>
                                                    {/* booked talk groups (R= field), if the node reports any */}
                                                    {nodeInfoMap[mhs.mh_callSign?.toUpperCase()]?.groups ?
                                                        <div className='rowcont'>
                                                            <div>Grp:</div>
                                                            <div className='value'>{nodeInfoMap[mhs.mh_callSign?.toUpperCase()].groups.split(",").sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)).join(", ")}</div>
                                                        </div> : <></>}
                                                </div>
                                                <div>
                                                    <div className='rowcont'>
                                                        <div className='value_r'>Time:</div>
                                                        <div className='value'>{mhs.mh_time}</div>
                                                    </div>
                                                    <div className='rowcont'>
                                                        <div className='value_r'>SNR:</div>
                                                        <div className='value'>{mhs.mh_snr}dB</div>
                                                    </div>

                                                    <div className='rowcont'>
                                                        <div className='value_r'>Dist:</div>
                                                        <div className='value'>{mhs.mh_distance > 0 ? mhs.mh_distance + " km" : "n.a."}</div>
                                                    </div>
                                                    {/* spacer to align #msg (right) with #pos (left) */}
                                                    <div className='rowcont'>
                                                        <div className='value_r'>&nbsp;</div>
                                                        <div className='value'>&nbsp;</div>
                                                    </div>
                                                    <div className='rowcont'>
                                                        <div className='value_r'>#msg:</div>
                                                        <div className='value'>{nodeInfoMap[mhs.mh_callSign?.toUpperCase()]?.msgCount ?? 0}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                        </IonCardContent>
                                    </IonCard>
                                </> : <></>}
                            </>
                        ))}
                    </> : <></>}
                </IonContent>
            </IonPage>
        </>
    );
};

export default Mheard;