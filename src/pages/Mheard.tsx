import { IonButton, IonCard, IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonGrid, IonRow, IonCol } from '@ionic/react';
import MhStore from '../store/MheardStore';
import ConfigStore from '../store/ConfStore';
import RelayCountStore from '../store/RelayCountStore';
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
    const relayCounts = useStoreState(RelayCountStore, s => s.counts);


    useEffect(()=>{
        console.log("MH - " + mharr_s.length + " Mheards in View");
    }, [mharr_s]);


    return (
        <>
            <IonPage>
                <IonHeader>
                    <IonToolbar>
                        <IonTitle>Heard Nodes</IonTitle>
                    </IonToolbar>
                </IonHeader>
                <IonContent className="ion-padding">
                    <IonHeader collapse="condense">
                        <IonToolbar>
                            <IonTitle size="large">Heard Nodes</IonTitle>
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
                                                    <div className='rowcont'>
                                                        <div>Neighbours:</div>
                                                        <div className='value'>{(() => {
                                                            // firmware reported a value -> use it
                                                            if (mhs.mh_ncnt > 0) return mhs.mh_ncnt;
                                                            // older firmware reports 0 -> fall back to our
                                                            // runtime count of nodes relayed via this neighbour
                                                            const counted = relayCounts[mhs.mh_callSign?.toUpperCase()] ?? 0;
                                                            return counted > 0 ? "≈" + counted : mhs.mh_ncnt;
                                                        })()}</div>
                                                    </div>
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