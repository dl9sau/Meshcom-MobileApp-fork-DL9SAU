
import { IonContent, IonHeader, IonPage, IonText, IonTitle, IonToolbar, IonLabel, IonInput, IonTextarea, IonItem, IonButton, IonToggle, IonRange, IonIcon, IonRow, IonCol, IonGrid, IonSelect, IonSelectOption, useIonViewWillEnter, IonAlert, IonProgressBar, useIonViewDidEnter, useIonViewWillLeave } from '@ionic/react';
import { useEffect, useRef, useState } from 'react';
import {useBLE} from '../hooks/BleHandler';

import './Settings.css';
import { useStoreState } from 'pullstate';
import { DevIDStore } from '../store';
import { getDevID, getBLEconnStore, getConfigStore, getScanResult } from '../store/Selectors';
import ConfigStore from '../store/ConfStore';
import NodeCmdStore from '../store/NodeCmdStore';
import { ConfType, InfoData, SensorSettings,WifiSettings, NodeSettings, SensorSettingsS1, WifiSettings2 } from '../utils/AppInterfaces';
import { iosTransitionAnimation, RangeValue } from '@ionic/core';
import { chevronDown, chevronForward, eyeOutline, eyeOffOutline, checkmarkCircle } from 'ionicons/icons';
import {aprs_char_table, aprs_pri_symbols} from '../store/AprsSymbols';
import AlertCard from '../components/AlertCard';
import { useHistory } from "react-router";
import ScanI2CStore from '../store/ScanI2CStore';
import SensorSettingsStore from '../store/SensorSettings';
import BLEconnStore from '../store/BLEconnected';
import DataBaseService from '../DBservices/DataBaseService';
import NodeInfoStore from '../store/NodeInfoStore';
import AppActiveState from '../store/AppActive';
import WifiSettingsStore from '../store/WifiSettings';
import NodeSettingsStore from '../store/NodeSettingsStore';
import LogS from '../utils/LogService';
import MheardStaticStore from '../utils/MheardStaticStore';
import AprsSettingsStore from '../store/AprSettingsStore';
import { usePhoneGps } from '../utils/PhoneGps';
import WxDataStore from '../store/WxData';
import SensorSettingsS1Store from '../store/SensorSettingsS1';
import WifiSettingsStore2 from '../store/WiFiSettings2';
import GpsDataStore from '../store/GpsData';
import MsgFilterStore from '../store/MsgFilterStore';
import AppPrefsStore from '../store/AppPrefsStore';




const Tab2: React.FC = () => {

  // currently settings are saved when config message comes back from phone

  // BLE TX function
  const {sendDV, sendTxtCmdNode, updateDevID, updateBLEConnected} = useBLE();

  // get the gps functions to set current position
  const {setCurrPosGPS} = usePhoneGps();

  // history forward to page
  const history = useHistory();

  // devid from store
  const devID_s = useStoreState(DevIDStore, getDevID);

  //config from sate store
  const config_s:ConfType = useStoreState(ConfigStore, getConfigStore);

  // BLE connected from store
  const ble_connected:boolean = useStoreState(BLEconnStore, getBLEconnStore);

  // wifii settings from store
  const wifiSettings_s:WifiSettings = WifiSettingsStore.useState(s => s.wifiSettings);
  const wifiSettings2_s:WifiSettings2 = WifiSettingsStore2.useState(s => s.wifiSettings2);

  // node settings
  const nodeSettings:NodeSettings = useStoreState(NodeSettingsStore, s => s.nodeSettings);

  // sensor settings from store
  const sensorSettings_s:SensorSettings = useStoreState(SensorSettingsStore, s => s.sensorSettings);

  const sensorSettingsS1_s:SensorSettingsS1 = SensorSettingsS1Store.useState(s => s.sensorSettingsS1);

  // aprs settings from store
  const aprs_settings_s = AprsSettingsStore.useState(s => s.aprsSettings);

  // get current AppState
  const isAppActive = AppActiveState.useState(s => s.active);

  // trigger if we have an unconfiuired node
  //const shouldConf = useStoreState(ShouldConfStore, s => s.shouldConf);

  // NodeInfos
  const nodeInfo_s:InfoData = NodeInfoStore.useState(s => s.infoData);

  // weatherdata
  const wxData_s = WxDataStore.useState(s => s.wxData);
  
  // Position Data from store
  const ownPosData = GpsDataStore.useState(s => s.gpsData);





  // remember which setting changed to send it to node
  const aprsSym_changed = useRef<boolean>(false);
  //const aprs_cmt_store = useStoreState(AprsCmtStore, s => s.aprsCmt);


  // references to the server userinput textfields 
  const callInputRef = useRef<HTMLIonInputElement>(null);
  const callSignInputRef = useRef<string>("");
  const ssidInputRef = useRef<HTMLIonInputElement>(null);
  const wifipwdInputRef = useRef<HTMLIonInputElement>(null);
  const aprsCmtRef = useRef<HTMLIonInputElement>(null);
  const ssidWifi_str = useRef<string>("");
  const pwdWifi_str = useRef<string>("");

  // Regex for callsign check
  const regexCallsign = /^([A-Z]{1,3}[0-9]{1,2}[A-Z]{0,3}|[0-9][A-Z][0-9][A-Z]{1,3})-[0-9]{1,2}$/;

  // switch show wifi pwd
  const [shWifiPwd, setShWifiPwd] = useState<boolean>(false);

  // show advanced settings
  const [shAdvSetting, setshAdvSetting] = useState<boolean>(false);

  // APRS primary Symbols
  const aprs_symbols_mapped = useRef<aprs_char_table []>(aprs_pri_symbols);
  const aprs_pri_sec_char = useRef<string>("/");
  const aprs_sym_char = useRef<string>("#");
  const aprs_sym_char_Input_ref = useRef<HTMLIonInputElement>(null);
  const aprs_pri_sec_char_Input_ref = useRef<HTMLIonInputElement>(null);
  const aprssym_valid = useRef<boolean>(true);
  const aprs_pri_sec_valid = useRef<boolean>(true);

  // alertcard handling
  const [shAlertCard, setShAlertCard] = useState<boolean>(false);
  const [alHeader, setAlHeader] = useState<string>("");
  const [alMsg, setAlMsg] = useState<string>("");

  // disco card params
  const [shDiscoCard, setShDiscoCard] = useState<boolean>(false);

  // remember if this page is active
  const thisPageActive = useRef<boolean>(false);
 
  // tx power settings
  const [txpower_slider, setTxpower_slider] = useState<RangeValue>();
  // SX127x MinPwr: 5, MaxPwr: 17; SX126x MinPwr: -5, MaxPwr: 22; E22 +8db PA
  const minTXpwr = useRef<number>(5);
  const maxTXpwr = useRef<number>(17);
  const tx_pwr = useRef<number>(17);
  const [tx_pwr_w, setTxPwrW] = useState<number>(17);
  const [tx_pwr_pct, setTxPwrPct] = useState<number>(100);
  const [shTxPwrSlider, setShTxPwrSlider] = useState<boolean>(false);

  // reboot node 
  const [shRebootCard, setShRebootCard] = useState<boolean>(false);
  const [shDeepSleepCard, setShDeepSleepCard] = useState<boolean>(false);

  // OTA Update Card Yes/No
  const [shOTAUpdateCard, setShOTAUpdateCard] = useState<boolean>(false);

  // onewire pin ref
  const owPinInputRef = useRef<HTMLIonInputElement>(null);
  const owPinNr = useRef<number>(0);
  let MAX_PIN_NUM = 60;

  // userbutton pin ref
  const userBtnInputRef = useRef<HTMLIonInputElement>(null);
  const userBtnNr = useRef<number>(0);
  let MAX_USER_BTN_NUM = 60;

  // Node UTC Time-Offset setting
  const node_utc_offset = useRef<number>(0);
  const node_utc_offset_ref = useRef<HTMLIonInputElement>(null);

  // custom BLE Pairing Ping
  const ble_pairing_pin = useRef<string>("000000");
  const ble_pairing_pin_ref = useRef<HTMLIonInputElement>(null);
  const [ble_pairing_pin_display, setBLEPairingPinDisplay] = useState<string>("000000");

  // show hide user buttons
  const [shUserBtns, setShUserBtns] = useState<boolean>(false);

  // color setting for some buttons
  const [bme680_color, setBme680_color] = useState<string>("primary");
  const [bme280_color, setBme280_color] = useState<string>("primary");
  const [bmp280_color, setBmp280_color] = useState<string>("primary");
  const [bmp3_color, setBmp3_color] = useState<string>("primary");
  const [s811_color, set811_color] = useState<string>("primary");
  const [onewire_color, setOnewire_color] = useState<string>("primary");
  const [aht20_color, setAht20_color] = useState<string>("primary");
  const [sht21_color, setSht21_color] = useState<string>("primary");

  // I2C Scanresult
  const scanResult = useStoreState(ScanI2CStore, getScanResult);

  // timer to count how often sendpos and sendtrackwas sent
  let now_obj = new Date();
  const txpos_last = useRef<number>(Date.now());
  const minWaitTime_txpos = 10000; // 10 sec

  // country settings 
  // {"EU", "EU8", "UK", "EA", "US", "VR2", "868", "915", "MAN"};
  const [shCtrySetting, setShCtrySetting] = useState<boolean>(false);
  const ctrySetting = NodeInfoStore.useState(s => s.infoData.CTRY);
  const ctry_setting_changed = useRef<boolean>(false);
  const ctry_setting_changed_str = useRef<string>("");
  // sets the ctry setting to the node
  const setCtryNode = (ctry_ev:string) => {
    console.log("Setting Country: " + ctry_ev);
    ctry_setting_changed.current = true;
    ctry_setting_changed_str.current = ctry_ev;
    NodeInfoStore.update(s => {
      s.infoData.CTRY = ctry_ev;
    });
  }
  const ctry_list = ["EU8", "UK", "LA", "UK8", "US", "VR2", "868", "906"];
  const ctry_list_translated: {[key: string]: string} = 
  {"EU8":"EU8 | 433.175MHz",
  "UK":"UK | 439.9125MHz",
  "UK8":"UK8 | 439.9125MHz",
  "US":"US | 433.175MHz", 
  "VR2":"VR2 | 435.775MHz", 
  "868":"868 | 869.525MHz", 
  "906":"906 | 906.875MHz",
  "LA":"LA | 433.925MHz"};
  // set the ctry setting changed string to value when recived from node
  useEffect(()=>{
    console.log("Ctry Setting set from Node: " + ctrySetting);
    ctry_setting_changed_str.current = ctrySetting;
  },[ctrySetting]);

  // Group Call Settings
  const [shGroupCallSet, setShGroupCallSet] = useState<boolean>(false);

  // "GW TGs (last 24h)" discovery hint: the merged talk groups broadcast by nodes
  // in the last 24 h (numeric, ascending). Helps esp. newcomers pick slots. Refreshed
  // whenever the group section is opened. (Read-only; never touches the user's slots.)
  const [gwGroups, setGwGroups] = useState<number[]>([]);
  useEffect(() => {
    if (shGroupCallSet) {
      DataBaseService.getRecentGroups(Date.now() - 24 * 3600 * 1000).then(setGwGroups);
    }
  }, [shGroupCallSet]);
  const setGrpCmd = useRef<string>("");
  const groupSettingChanged = useRef<boolean>(false);
  // references for the inputs
  const gcb0Ref = useRef<number>(0);
  const gcb1Ref = useRef<number>(0);
  const gcb2Ref = useRef<number>(0);
  const gcb3Ref = useRef<number>(0);
  const gcb4Ref = useRef<number>(0);
  const gcb5Ref = useRef<number>(0);
  const gcbRefs = [gcb0Ref, gcb1Ref, gcb2Ref, gcb3Ref, gcb4Ref, gcb5Ref];
  // app-local TG-number -> label memory aid (the firmware only stores the number)
  const labelRefs = [useRef<string>(""), useRef<string>(""), useRef<string>(""),
                     useRef<string>(""), useRef<string>(""), useRef<string>("")];
  const tgLabels_s = useStoreState(AppPrefsStore, s => s.tgLabels);
  let tgLabelMap: {[k: string]: string} = {};
  try { tgLabelMap = JSON.parse(tgLabels_s || "{}"); } catch { tgLabelMap = {}; }
  const labelForTG = (num: number): string => (num > 0 ? (tgLabelMap[num.toString()] || "") : "");
  // "262 DL" from a number + its label ("262" if no label, "" if slot empty)
  const grpDisplay = (num: number, label: string): string =>
    num > 0 ? (label ? num + " " + label : num.toString()) : "";

  const grp0 = gcb0Ref.current = NodeInfoStore.useState(s => s.infoData.GCB0);
  const grp1 = gcb1Ref.current = NodeInfoStore.useState(s => s.infoData.GCB1);
  const grp2 = gcb2Ref.current = NodeInfoStore.useState(s => s.infoData.GCB2);
  const grp3 = gcb3Ref.current = NodeInfoStore.useState(s => s.infoData.GCB3);
  const grp4 = gcb4Ref.current = NodeInfoStore.useState(s => s.infoData.GCB4);
  const grp5 = gcb5Ref.current = NodeInfoStore.useState(s => s.infoData.GCB5);
  // seed the label refs from the stored labels for the currently subscribed
  // numbers, so untouched fields keep their label when saved
  const grpNums = [grp0, grp1, grp2, grp3, grp4, grp5];
  labelRefs.forEach((r, i) => { r.current = labelForTG(grpNums[i]); });
  
  // reset the group call settings
  const resetGrpCall = () => {
    console.log("Reset Group Call Settings");
    // send to node
    sendTxtCmdNode("--setgrc");
    // clear the app-local labels too (all slots gone -> no orphan labels)
    AppPrefsStore.update(s => { s.tgLabels = "{}"; });
    DataBaseService.setPref('tgLabels', "{}");
  }

  // fixed ip settings
  const [shFixedIPSet, setShFixedIPSet] = useState<boolean>(false);
  const ip_addr_ref = useRef<HTMLIonInputElement>(null);
  const ip_gw_ref = useRef<HTMLIonInputElement>(null);
  const ip_snm_ref = useRef<HTMLIonInputElement>(null);
  const ip_dns_ref = useRef<HTMLIonInputElement>(null);
  const ip_addr_str =useRef<string>("");
  const ip_gw_str = useRef<string>("");
  const ip_snm_str = useRef<string>("");
  const ip_dns_str = useRef<string>("");
  // make the regex simple with 4 octets and each octet is 0-255
  const ip_regex = /^(?!0\d)(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(?!0\d)(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

  // show hide the Userbutton Pins Settings
  const [shHwPins, setShHwPins] = useState<boolean>(false);

  // Name Setting
  const name_input_ref = useRef<HTMLIonInputElement>(null);
  const name_str = useRef<string>("");
  const MAX_NAME_CHARS = 15;

  // temperature offset setting
  const temp_offset_ref = useRef<HTMLIonInputElement>(null);
  const temp_offset_str = useRef<string>("");
  const temp_ow_offset_ref = useRef<HTMLIonInputElement>(null);
  const [shTempOffset, setShTempOffset] = useState<boolean>(false);

  // ext. UDP Interface Settings
  const [shExtUdp, setShExtUdp] = useState<boolean>(false);
  const ext_udp_ip_ref = useRef<HTMLIonInputElement>(null);
  const ext_udp_IP_str = useRef<string>("");
  const ext_udp_enable_str = useRef<string>("");

  // Chat message block-filter settings
  const [shMsgFilter, setShMsgFilter] = useState<boolean>(false);
  const msgFilter_s = useStoreState(MsgFilterStore, s => s);
  const filterCallsRef = useRef<HTMLIonTextareaElement>(null);
  const filterTextRef = useRef<HTMLIonTextareaElement>(null);
  const filterAllowRef = useRef<HTMLIonTextareaElement>(null);
  // master on/off for the whole filter (rules stay, nothing is hidden when off)
  const filtersEnabled = useStoreState(AppPrefsStore, s => s.filtersEnabled);

  // persist the block-filter rules and refresh the chat view
  const saveMsgFilters = async () => {
    const callRaw = filterCallsRef.current?.value?.toString() ?? "";
    const textRaw = filterTextRef.current?.value?.toString() ?? "";
    const allowRaw = filterAllowRef.current?.value?.toString() ?? "";
    await DataBaseService.saveMsgFilters(callRaw, textRaw, allowRaw);
    LogS.log(0, "Settings: Msg filters saved");
  };

  // flip the master filter switch and re-run the chat view immediately
  const setFiltersEnabled = async (on: boolean) => {
    AppPrefsStore.update(s => { s.filtersEnabled = on; });
    await DataBaseService.setPref('filtersEnabled', on ? '1' : '0');
    await DataBaseService.reapplyChatFilters();
    LogS.log(0, "Settings: Msg filter master " + (on ? "ON" : "OFF"));
  };

  // compact vs legacy chat message header (app preference)
  const compactHeader = useStoreState(AppPrefsStore, s => s.compactHeader);
  const setCompactHeader = async (checked: boolean) => {
    AppPrefsStore.update(s => { s.compactHeader = checked; });
    await DataBaseService.setPref('compactHeader', checked ? '1' : '0');
  };

  // automatic resend of unacknowledged DM parts (see ResendService)
  const autoResendDM = useStoreState(AppPrefsStore, s => s.autoResendDM);
  const setAutoResendDM = async (checked: boolean) => {
    AppPrefsStore.update(s => { s.autoResendDM = checked; });
    await DataBaseService.setPref('autoResendDM', checked ? '1' : '0');
  };

  // monitoring mode: keep the screen on (applied centrally in App.tsx)
  const keepScreenOn = useStoreState(AppPrefsStore, s => s.keepScreenOn);
  const setKeepScreenOn = async (checked: boolean) => {
    AppPrefsStore.update(s => { s.keepScreenOn = checked; });
    await DataBaseService.setPref('keepScreenOn', checked ? '1' : '0');
  };

  // split method for long (multi-packet) messages
  const splitMethod = useStoreState(AppPrefsStore, s => s.splitMethod);
  const setSplitMethod = async (m: 'balanced' | 'greedy') => {
    AppPrefsStore.update(s => { s.splitMethod = m; });
    await DataBaseService.setPref('splitMethod', m);
  };

  // (DM "show all traffic" toggle moved to the DM tab's long-press menu)

  // Advanced Settings: raw node command console. Send a "--xxx" like the web /
  // serial CLI; the node's "--…" answer is captured in NodeCmdStore and shown.
  const cmdInputRef = useRef<HTMLIonInputElement>(null);
  const cmdSeq = useStoreState(NodeCmdStore, s => s.seq);
  const [cmdStatus, setCmdStatus] = useState<'idle' | 'waiting' | 'ok' | 'timeout'>('idle');
  const [cmdRespShown, setCmdRespShown] = useState<string>("");
  const cmdBaseSeqRef = useRef<number>(0);
  const cmdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendNodeCmd = () => {
    const raw = (cmdInputRef.current?.value?.toString() ?? "").trim();
    if (raw === "") return;
    const full = raw.startsWith("--") ? raw : "--" + raw;
    cmdBaseSeqRef.current = NodeCmdStore.getRawState().seq;
    setCmdRespShown("");
    setCmdStatus('waiting');
    sendTxtCmdNode(full);
    if (cmdTimerRef.current) clearTimeout(cmdTimerRef.current);
    // no "--…" answer within 5 s -> treat as no response
    cmdTimerRef.current = setTimeout(() => {
      if (NodeCmdStore.getRawState().seq === cmdBaseSeqRef.current) setCmdStatus('timeout');
    }, 5000);
  };

  // a fresh node response arrived after we sent -> show it + green check
  useEffect(() => {
    if (cmdStatus === 'waiting' && cmdSeq > cmdBaseSeqRef.current) {
      setCmdRespShown(NodeCmdStore.getRawState().resp);
      setCmdStatus('ok');
      if (cmdTimerRef.current) clearTimeout(cmdTimerRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmdSeq]);

  // per-category retention in days (0 = unlimited)
  const [shRetention, setShRetention] = useState<boolean>(false);
  const retAll = useStoreState(AppPrefsStore, s => s.retAll);
  const retGroup = useStoreState(AppPrefsStore, s => s.retGroup);
  const retMyDM = useStoreState(AppPrefsStore, s => s.retMyDM);
  const retForeignDM = useStoreState(AppPrefsStore, s => s.retForeignDM);
  const retPos = useStoreState(AppPrefsStore, s => s.retPos);
  const retMheard = useStoreState(AppPrefsStore, s => s.retMheard);
  const retAllRef = useRef<HTMLIonInputElement>(null);
  const retGroupRef = useRef<HTMLIonInputElement>(null);
  const retMyDMRef = useRef<HTMLIonInputElement>(null);
  const retForeignDMRef = useRef<HTMLIonInputElement>(null);
  const retPosRef = useRef<HTMLIonInputElement>(null);
  const retMheardRef = useRef<HTMLIonInputElement>(null);

  const saveRetention = async () => {
    const parse = (ref: { current: HTMLIonInputElement | null }, cur: number): number => {
      const v = parseInt(ref.current?.value?.toString() ?? '');
      return isNaN(v) || v < 0 ? cur : v;
    };
    const vals: { [k: string]: number } = {
      retAll: parse(retAllRef, retAll),
      retGroup: parse(retGroupRef, retGroup),
      retMyDM: parse(retMyDMRef, retMyDM),
      retForeignDM: parse(retForeignDMRef, retForeignDM),
      retPos: parse(retPosRef, retPos),
      retMheard: parse(retMheardRef, retMheard),
    };
    AppPrefsStore.update(s => {
      s.retAll = vals.retAll; s.retGroup = vals.retGroup; s.retMyDM = vals.retMyDM;
      s.retForeignDM = vals.retForeignDM; s.retPos = vals.retPos; s.retMheard = vals.retMheard;
    });
    for (const k of Object.keys(vals)) await DataBaseService.setPref(k, vals[k].toString());
    // apply immediately: prune now, then refresh the chat view
    await DataBaseService.housekeeping();
    await DataBaseService.reapplyChatFilters();
    setAlHeader("Retention saved");
    setAlMsg("Old data pruned according to the new retention.");
    setShAlertCard(true);
  };

  // Manual Position Settings Input Refs
  const [shManualPos, setShManualPos] = useState<boolean>(false);
  const manual_lat_ref = useRef<HTMLIonInputElement>(null);
  const manual_lon_ref = useRef<HTMLIonInputElement>(null);
  const manual_alt_ref = useRef<HTMLIonInputElement>(null);
  const manual_pos_cmd = useRef<string>("");

  // Gateway Server Settings and Selection
  const [shGwServerSet, setShGwServerSet] = useState<boolean>(false);
  const gw_srv = NodeSettingsStore.useState(s => s.nodeSettings.GWS);
  const gw_srv_str = useRef<string>("OE");
  const gw_srv_table : {[key: string]: string} = {
    "OE": "Austria-OE",
    "DL": "Germany-DL"};
  const gw_srv_list = Object.keys(gw_srv_table);
  const setGwServerNode = (gw_ev:string) => {
    console.log("Setting Gateway Server: " + gw_ev);
    gw_srv_str.current = gw_ev;
    NodeSettingsStore.update(s => {
      s.nodeSettings.GWS = gw_ev;
    });}

  



  // Tasks we need to do when we enter the page
  useIonViewDidEnter(() => {
    // Refresh the node's GPS status once on entering: the "Send Pos" label below depends on
    // the GPS FIX, and SFIX only arrives with a TYP "G" record, which the node sends on
    // request. "--pos" is a purely LOCAL query - it reads out lat/lon/sat/fix and puts them
    // on the BLE link, nothing goes on the air - so asking is free.
    if (ble_connected) sendTxtCmdNode("--pos");
    // update the ble devid from pullsate store
    thisPageActive.current = true;
    const devid = devID_s;
    updateDevID(devid);
    console.log("Settings Page: Updating DevID " + devid);
    const bleconn = ble_connected;
    console.log("Settings Page BLE connected: " + bleconn);
    updateBLEConnected(bleconn);

  });

  // Tasks we need to do when we leave the page
  useIonViewWillLeave(() => {
    thisPageActive.current = false;
  });

  // trigger the BLE disco function when we disconnect and on page
  useEffect(() => {
    if (!ble_connected && thisPageActive.current) {
      console.log("Settings Page: BLE disconnected!");
      setShDiscoCard(true);
    }
  }, [ble_connected]);




  // when config has changed update aprs symbols
  useEffect(()=>{

    console.log("Settings Config changed");
    
    console.log("Call: " + config_s.callSign);
    console.log("Lat: " + config_s.lat);
    console.log("Lon: " + config_s.lon);
    console.log("Alt: " + config_s.alt);
    console.log("Aprs Pri/Sec: " + aprs_pri_sec_char.current);
    console.log("Aprs Symbol: " + aprs_sym_char.current);

  }, [config_s]);


  // setting txpower slider and values if nodesettings arrive
  useEffect(()=>{
    LogS.log(0,"Settings Page NodeSettings updated");
    // set min max power based on hw
    if(nodeInfo_s.HWID === 5 || nodeInfo_s.HWID >= 7 && nodeInfo_s.HWID <= 9 || nodeInfo_s.HWID >= 39) {
      minTXpwr.current = 2;
      maxTXpwr.current = 22;
    }
    else {
      minTXpwr.current = 2;
      maxTXpwr.current = 20;
    }

    // 0 dBm means it was not set to flash on Node
    if(nodeSettings.TXP === 0){
      tx_pwr.current = maxTXpwr.current;
    } else {
      tx_pwr.current = nodeSettings.TXP;
    }
    
    const pwr_exp_w = (tx_pwr.current - 30) / 10;
    const pwr_w = (Math.pow(10, pwr_exp_w) * 1000).toFixed(0); //mW
    console.log("TX Pwr (mW): " + pwr_w);
    setTxPwrW(+pwr_w);
    const max_pwr_w = Math.pow(10, (maxTXpwr.current - 30) / 10) * 1000;
    setTxPwrPct(Math.round((+pwr_w) / max_pwr_w * 100));

    // set UTC ref
    console.log("Node UTC Offset: " + nodeSettings.UTCOF);
    node_utc_offset.current = nodeSettings.UTCOF;

  },[nodeSettings]);




  // adapt ble pin when nodesettings arrive
  useEffect(()=>{
    LogS.log(0,"BLE Pairing Pin updated from NodeSettings");
    // set the ble pin from info data. Comes in as INT but we need it as string for the input and sending to node
    // Use ?? 0 to handle old firmware that does not send BPIN in the info JSON
    const bpin = nodeInfo_s.BPIN ?? 0;
    let ble_pin_str = bpin.toString();
    // if the ble pin is 0 or 000000 we set it to 000000
    if(bpin === 0 || ble_pin_str === "000000"){
      ble_pairing_pin.current = "000000";
      setBLEPairingPinDisplay("000000");
    } else {
      // if the ble pin is less than 6 digits we add leading zeros
      if(ble_pin_str.length < 6){
        ble_pin_str = ble_pin_str.padStart(6, "0");
      }

      ble_pairing_pin.current = ble_pin_str;
      setBLEPairingPinDisplay(ble_pin_str);
    }
  },[nodeInfo_s.BPIN]);


  

  // set values of sensor settings when they arrive
  useEffect(()=>{
    LogS.log(0,"Settings Page SensorSettings updated");
    // set userbutton pin number from sensor settings
    userBtnNr.current = sensorSettings_s.USERPIN;
    // set onewire pin number from config
    owPinNr.current = sensorSettings_s.OWPIN;

    // set bme680 color based on sensor settings
    if(sensorSettings_s['680F'] && sensorSettings_s[680] || !sensorSettings_s[680]){
      setBme680_color("primary");
    } else {
      setBme680_color("danger");
    }
    // set bme280 color based on sensor settings
    if(sensorSettings_s.BME && sensorSettings_s.BMXF || !sensorSettings_s.BME){
      setBme280_color("primary");
    } else {
      setBme280_color("danger");
    }
    // set bmp280 color based on sensor settings
    if(sensorSettings_s.BMP && sensorSettings_s.BMXF || !sensorSettings_s.BMP){
      setBmp280_color("primary");
    } else {
      setBmp280_color("danger");
    }
    // set bmp3 color based on sensor settings
    if(sensorSettings_s.BMP3 && sensorSettings_s.BMP3F || !sensorSettings_s.BMP3){
      setBmp3_color("primary");
    } else {
      setBmp3_color("danger");
    }
    // set s811 color based on sensor settings
    if(sensorSettings_s['811F'] && sensorSettings_s['811'] || !sensorSettings_s['811']){
      set811_color("primary");
    } else {
      set811_color("danger");
    }
    // set onewire color based on sensor settings
    if(sensorSettings_s.OW && sensorSettings_s.OWF || !sensorSettings_s.OW){
      setOnewire_color("primary");
    } else {
      setOnewire_color("danger");
    } 
    // set aht20 color based on sensor settings
    if(sensorSettings_s.AHT && sensorSettings_s.AHTF || !sensorSettings_s.AHT){
      setAht20_color("primary");
    } else {
      setAht20_color("danger");
    }
    // set sht21 color based on sensor settings
    if(sensorSettingsS1_s.SHT && sensorSettingsS1_s.SHTF || !sensorSettingsS1_s.SHT){
      setSht21_color("primary");
    } else {
      setSht21_color("danger");
    }

  },[sensorSettings_s, sensorSettingsS1_s]);




  // sleep function for delay
  const sleep = (ms:number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  //send config to phone - we send a string with delimeter Config starts with "C:" 
  /**
  * 
  * Config Messages:
  * length 1B - Msg ID 1B - Data
  * 
   * Msg ID:
   * 0x10 - Hello Message (followed by 0x20, 0x30)
   * 0x20 - Timestamp from phone
   * 0x50 - Callsign - DEPRECATED
   * 0x55 - Wifi SSID and PW - DEPRECATED
   * 0x70 - Latitude - DEPRECATED
   * 0x80 - Longitude - DEPRECATED
   * 0x90 - Altitude - DEPRECATED
   * 0xA0 - Textmessage
   * 0xF0 - Save Settings at node flash
  */

  // max values
  const MAX_SSID_CHARS = 33;
  const MAX_PWD_CHARS = 64;
  const MAX_APRS_CMT_CHARS = 15;

   // clear textfield of callsign input
   const clearInput = () => {
    callInputRef.current!.value = "";
  };


  // send new callsign to node
  // returns true if regex of callsign is correct
  const setCallSign = async () => {

    const nodeCall = callInputRef.current!.value;

    if (nodeCall) {

      if (nodeCall.toString() !== "") {

        let call_s = nodeCall.toString();
        call_s = call_s.toUpperCase();
        call_s = call_s.trim();
        console.log("Callsign setting: " + call_s);

        // check if callsign is valid
        if (!regexCallsign.test(call_s)) {
          console.log("Invalid Callsign!");
          clearInput();
          setAlHeader("Invalid Callsign!");
          setAlMsg("Please enter a valid Callsign like OE1KFR-1");
          setShAlertCard(true);
          return;
        }

        let cal_len = call_s.length;
        console.log("Callsign len: " + cal_len);
        
        if (cal_len > 11) {
          console.log("Callsign too long!");
          clearInput();
          setAlHeader("Callsign too long!");
          setAlMsg("Please enter a valid Callsign with max 11 characters");
          setShAlertCard(true);
          return;
        }

        // set the callsign ref
        callSignInputRef.current = call_s;

        // send to node
        sendTxtCmd("setcall");

        // update config in store state
        ConfigStore.update(s => {
          s.config.callSign = call_s;
        });

        setAlHeader("Callsign set!");
        setAlMsg("Setting saved to node! Will reboot in 15s.");
        setShAlertCard(true);
      }
    }
    clearInput();

  }



  /**
   * send / configure position on node
   * 
   */
  const setCurrentPosGPS = async () => {
    console.log("Setting Current Position GPS");

    await setCurrPosGPS();
  };




  /**
   * send Wifi Settings to Node
   * */

  const setWifiSetting = async () =>{

    console.log("Setting Wifi Settings");

    const ssidWifi = ssidInputRef.current!.value;
    const pwdWifi = wifipwdInputRef.current!.value;
    
    if(ssidWifi && pwdWifi){

      ssidWifi_str.current = ssidWifi!.toString();
      pwdWifi_str.current = pwdWifi!.toString();

      // special case reset wifissid to none without pw
      if(ssidWifi_str.current !== "" && pwdWifi_str.current !== "" && ssidWifi_str.current.length <= MAX_SSID_CHARS && pwdWifi_str.current.length <= MAX_PWD_CHARS) {

        console.log("Wifi SSID: " + ssidWifi_str.current);
        console.log("Wifi PWD: " + pwdWifi_str.current);
        sendTxtCmd("setwifi");
        setAlHeader("Wifi Settings set!");
        setAlMsg("Setting saved to node! Will reboot in 15s.");
        setShAlertCard(true);

      }

      // reset inputs
      wifipwdInputRef.current!.value = "";
    }

  }


  // set APRS Symbol Config
  const setAprsSymbols = () => {

    if (aprs_pri_sec_valid.current && aprssym_valid.current) {

      if (aprsSym_changed.current) {

        aprsSym_changed.current = false;
        console.log("Aprs PriSec to Node: " + aprs_pri_sec_char.current);
        console.log("Aprs Symbol to Node: " + aprs_sym_char.current);

        const symbol_dec = +aprs_sym_char.current.charCodeAt(0);
        console.log("Aprs Symbol DEC: " + symbol_dec);

        const symbol_pri_sec = +aprs_pri_sec_char.current.charCodeAt(0);
        console.log("Aprs Pri/Sec DEC: " + symbol_pri_sec);

        // send the aprssym to node
        sendTxtCmd("setAprsChars");

        setAlHeader("APRS Symbol set!");
        setAlMsg("Setting saved to node!");
        setShAlertCard(true);

      }

    } else {
      console.log("Aprs Sym or Pri/Sec not valid!");
      setAlHeader("Invalid APRS Symbol!");
      setAlMsg("Group Char must be 0-9, A-Z, / and \\. Symbol Char must be ! to }");
      setShAlertCard(true);
      return;
    }

  }


  /**
   * send settings via Textmessage to phone
   * same as serial commands
   * --gateway on/off
   * 
   *  */ 
  const sendTxtCmd = (cmd: string) => {

    // final cmd string
    let cmd_ = "";

    switch (cmd) {

      case "gw": {
        if (!wifiSettings_s.AP) {
          if (config_s.gw_on) {

            cmd_ = "--gateway off";

          } else {

            // check if we have a wifi pw set
            if (config_s.hw !== "RAK4631") {
              if (config_s.wifi_ssid.length > 0 && config_s.wifi_ssid !== "none") {
                cmd_ = "--gateway on";
              } else {
                console.log("Wifi PW not set! GW Mode not possible!");
                setAlHeader("Error!");
                setAlMsg("Wifi Settings not configured!");
                setShAlertCard(true);
              }
            } else {
              cmd_ = "--gateway on";
            }
          }
        } else {
          console.log("AP Mode active! GW Mode not possible!");
          setAlHeader("AP Mode active!");
          setAlMsg("GW Mode not possible!");
          setShAlertCard(true);
        }
        break;
      }

      case "gps": {

        if (config_s.gps_on) {
          cmd_ = "--gps off";
        } else {
          cmd_ = "--gps on";
        }
        break;
      }

      case "bme": {

        if (config_s.bme_on) {
          cmd_ = "--bmx off";
        } else {
          if (config_s.bmp_on || config_s.bme680_on) {
            setAlHeader("Switch BMP280/BME680 off please!");
            setAlMsg("");
            setShAlertCard(true);
          } else {
            cmd_ = "--bme on";
          }
        }
        break;
      }

      case "bmp": {

        if (sensorSettings_s.BMP) {
          cmd_ = "--bmx off";
        } else {
          if (sensorSettings_s.BME || sensorSettings_s['680'] || sensorSettings_s.BMP3) {
            setAlHeader("Switch BME280/BMP390/BME680 off please!");
            setAlMsg("");
            setShAlertCard(true);
          } else {
            cmd_ = "--bmp on";
          }
        }
        break;
      }

      case "680": {

        if (sensorSettings_s['680']) {
          cmd_ = "--680 off";
        } else {
          if (sensorSettings_s.BME || sensorSettings_s.BMP || sensorSettings_s.BMP3) {
            setAlHeader("Please switch BME/BMP off!");
            setAlMsg("");
            setShAlertCard(true);
          } else {
            cmd_ = "--680 on";
          }
        }
        break;
      }

      case "bmp3": {

        if (sensorSettings_s.BMP3) {
          cmd_ = "--bmx off";
        } else {
          if (sensorSettings_s.BME || sensorSettings_s.BMP || sensorSettings_s['680']) {
            setAlHeader("Please switch BME280/BMP/BME680 off!");
            setAlMsg("");
            setShAlertCard(true);
          } else {
            cmd_ = "--390 on";
          }
        }
        break;
      }

      case "mcu811": {

        if (sensorSettings_s['811']) {
          cmd_ = "--811 off";
        } else {
          cmd_ = "--811 on";
        }
        break;
      }

      case "display": {

        if (config_s.display_off) {
          cmd_ = "--display on";
        } else {
          cmd_ = "--display off";
        }
        break;
      }

      case "track": {

        if (config_s.track_on) {
          cmd_ = "--track off";
        } else {
          cmd_ = "--track on";
        }
        break;
      }

      case "button": {

        if (config_s.button_on) {
          cmd_ = "--button off";
        } else {
          cmd_ = "--button on";
        }
        break;
      }

      case "posdebug": {

        cmd_ = "--pos";
        break;
      }

      case "wx": {

        cmd_ = "--wx";
        break;
      }

      case "txpwr": {

        let pwr = 0;

        cmd_ = "--txpower " + tx_pwr.current.toString();

        break;
      }

      case "reboot": {

        cmd_ = "--reboot now";
        break;
      }

      case "deepsleep": {

        cmd_ = "--deepsleep";
        break;
      }

      case "atxt": {
        console.log("APRS Comment assembled");
        const cmt_txt = aprsCmtRef.current!.value;
        if (cmt_txt) {
          const cmt_str = cmt_txt.toString();
          console.log("APRS Cmt Len: " + cmt_str.length);
          const cmt_str_ = cmt_str.trim();
          console.log("APRS Cmt Len trimmed: " + cmt_str_.length);
          console.log("APRS Comment: " + cmt_str_);
          if (cmt_str_.length > 1) {
            console.log("APRS CMD: " + cmt_str_);
            cmd_ = "--atxt " + cmt_str_;
            aprsCmtRef.current!.value = "";

            setAlHeader("APRS Comment set!");
            setAlMsg("Setting saved to node!");
            setShAlertCard(true);
          }
        }
        break;
      }

      case "txpos": {
        // check if txpos was sent in the last 10 seconds
        const now = Date.now();
        console.log("TX POS pressed at: " + now);
        const diff = now - txpos_last.current;
        console.log("TX POS Diff: " + diff);

        if (diff >= minWaitTime_txpos) {
          cmd_ = "--sendpos";
          txpos_last.current = Date.now();
        } else {
          setAlHeader("TXPOS already sent!");
          setAlMsg("TX POS only every " + minWaitTime_txpos / 1000 + " sec possible!");
          setShAlertCard(true);
        }
        break;
      }

      case "txtrack": {
        // check if txpos was sent in the last 10 seconds and track is on
        const now = Date.now();
        const diff = now - txpos_last.current;
        console.log("TXTRACK Diff: " + diff);

        if (diff >= minWaitTime_txpos) {
          cmd_ = "--sendtrack";
          txpos_last.current = Date.now();
        }
        else {
          setAlHeader("TXTRACK already sent!");
          setAlMsg("TXTRACK only every " + minWaitTime_txpos / 1000 + " sec possible!");
          setShAlertCard(true);
        }
        break;
      }

      // onewire on / off
      case "owon": {
        if (config_s.onewire_on) {
          cmd_ = "--onewire off";
        } else {
          cmd_ = "--onewire on";
        }
        break;
      }

      // set one wire pin
      case "owpin": {
        console.log("Setting Onewire Pin!");

        // if the client is RAK4631 check if pin is in range 0-7 except pin 2 which is powering the sensor baords
        if (config_s.hw === "RAK4631") {
          if (owPinNr.current >= 1 && owPinNr.current <= MAX_PIN_NUM && owPinNr.current !== 2) {
            // set pin
            cmd_ = "--onewire gpio " + owPinNr.current.toString();
          } else {
            owPinNr.current = 4;
            // show alert card
            setAlHeader("Wrong Onewire Pin Number!");
            setAlMsg("Setting Pin to 4!");
            setShAlertCard(true);
          }
        } else {
          // ESP32 check if pin nr is in range and set it if ok
          if (owPinNr.current >= 0 && owPinNr.current <= MAX_PIN_NUM) {
            // set pin
            cmd_ = "--onewire gpio " + owPinNr.current.toString();
          } else {
            // show alert card
            setAlHeader("Wrong Onewire Pin Number!");
            setAlMsg("Pin Nr not in Range!");
            setShAlertCard(true);
          }
        }
        break;
      }

      // LPS33 sensor on / off
      case "lps33": {
        if (config_s.hw === "RAK4631") {
          if (config_s.lps33_on) {
            cmd_ = "--lps33 off";
          } else {
            cmd_ = "--lps33 on";
          }
        } else {
          setAlHeader("LPS33 not supported!");
          setAlMsg("Only on RAK4631 available!");
          setShAlertCard(true);
        }
        break;
      }

      // UTC Offset
      case "utcoffset": {
        console.log("UTC Offset: " + node_utc_offset.current);
        cmd_ = "--utcoff " + node_utc_offset.current.toString();
        break;
      }

      // scan i2c bus
      case "scani2c": {
        cmd_ = "--showi2c";
        break;
      }

      // mesh on/off if off the node sends no msgs in the mesh back
      case "mesh_retrx": {
        
        if (config_s.mesh_on) {
          cmd_ = "--mesh off";
        } else {
          cmd_ = "--mesh on";
        }
        
        break;
      }

      //webserver on/off
      case "websrv": {
        if (nodeSettings.WS) {
          cmd_ = "--webserver off";
        } else {
          // check if wifi ssid is longer than 0 and not none
          if(nodeInfo_s.HWID !== 9){ // ESP32 only check
            if (config_s.wifi_ssid.length > 0 && config_s.wifi_ssid !== "none") {
              cmd_ = "--webserver on";
            } else {
              setAlHeader("Wifi Settings not set!");
              setAlMsg("Please set a valid Wifi SSID and PW!");
              setShAlertCard(true);
            }
          } else {
            cmd_ = "--webserver on";
          }
        }
        break;
      }

      // country setting
      case "ctry": {
        if (ctry_setting_changed_str.current !== "" && ctry_setting_changed_str.current !== " ") {
          cmd_ = "--setctry " + ctry_setting_changed_str.current;
        }
        break;
      }

      // group settings
      case "setGroup": {
        if (setGrpCmd.current !== "") {
          cmd_ = setGrpCmd.current;
        }
        break;
      }

      // set Wifi-AP Mode
      case "wifi_ap": {
        if (!nodeSettings.GW) {
          if (wifiSettings_s.AP) {
            cmd_ = "--wifiap off";
          }
          else {
            cmd_ = "--wifiap on";
          }
        } else {
          setAlHeader("Gateway Mode active!");
          setAlMsg("Wifi AP Mode not possible!");
          setShAlertCard(true);
        }
        break;
      }

      // gateway no-pos mode
      case "gw_nopos": {
        if(nodeSettings.GWNPOS){
          cmd_ = "--gateway pos";
        }
        else {
          cmd_ = "--gateway nopos";
        }
        break;
      }

      // change into safeboot OTA mode
      case "otaupdate": {
        if(nodeInfo_s.HWID !== 9 && nodeInfo_s.HWID !== 7 && nodeInfo_s.HWID !== 54){ // ESP32 only check
          cmd_ = "--ota-update";
          setAlHeader("Booting into OTA Mode!");
          setAlMsg("On active Wifi connection access it after reboot via Web-Browser with " + nodeInfo_s.CALL + ".local or "+ wifiSettings_s.IP +" if in AP Mode: IP:192.168.4.1 or Meshcom-OTA.local");
          setShAlertCard(true);
        } else {
          setAlHeader("Wifi OTA Update not supported!");
          setAlMsg("Only on ESP32 based boards available!");
          setShAlertCard(true);
        }
        break;
      }

      case "no_allmsg_rx": {
        if(nodeSettings.NOALL){
          cmd_ = "--nomsgall off";
        } else {
          cmd_ = "--nomsgall on";
        }
        break;
      }

      case "userButtonPin": {
        cmd_ = "--button gpio " + userBtnNr.current.toString();
        break;
      }

      // custom ble paring pin
      case "btcode": {
        cmd_ = "--btcode " + ble_pairing_pin.current;
        break;
      }

      // reset BLE PIN to 000000 (disables BLE security)
      case "RST_BT_CODE": {
        console.log("Resetting BLE PIN to 000000 (security disabled)");
        ble_pairing_pin.current = "000000";
        cmd_ = "--btcode 000000";
        break;
      }

      // rx boost is only available on boards with a SX126x chip
      case "rxboost": {
        if (nodeInfo_s.HWID === 5 || nodeInfo_s.HWID >= 7 && nodeInfo_s.HWID <= 9 || nodeInfo_s.HWID >= 39) {
          if (nodeInfo_s.BOOST) {
            cmd_ = "--setboostedgain off";
          } else {
            cmd_ = "--setboostedgain on";
          }
        } else {
          setAlHeader("RX Boost not supported!");
          setAlMsg("Only on SX126x Lora chip boards available!");
          setShAlertCard(true);
        }
        break;
      }

      // aht20 sensor on / off
      case "aht20": {
        if (sensorSettings_s.AHT) {
          cmd_ = "--aht20 off";
        } else {
          cmd_ = "--aht20 on";
        }
        break;
      }

      // set callsign
      case "setcall": {
        let call_s = callSignInputRef.current;
        if (call_s && call_s !== "") {
          console.log("Setting Callsign to node: " + call_s);
          cmd_ = "--setcall " + call_s;
          call_s = ""; // clear callsign input
        }
        break;
      }

      // set fixed IP setting all at once
      case "setFixedIP": {
        cmd_ = "--setownip " + ip_addr_str.current + " --setownms " + ip_snm_str.current + " --setowngw " + ip_gw_str.current + " --setowndns " + ip_dns_str.current;
        console.log("IP CMD to node: " + cmd_);
        break;
      }

      // set the wifi settings
      case "setwifi": {
        cmd_ = "--setssid " + ssidWifi_str.current + " --setpwd " + pwdWifi_str.current;
        console.log("Wifi CMD to node: " + cmd_);
        break;
      }

      // set aprs id (table) and symbol
      case "setAprsChars": {
        console.log("Setting APRS Symbol and Pri/Sec Char to node");
        cmd_ = "--symid " + aprs_pri_sec_char.current + " --symcd " + aprs_sym_char.current;
        console.log("APRS CMD to node: " + cmd_);
        break;
      }

      // set the name 
      case "name": {
        cmd_ = "--setname " + name_str.current;
        console.log("Name CMD to node: " + cmd_);
        break;
      }

      // temp offests
      case "setTempOffset": {
        cmd_ = temp_offset_str.current;
        console.log("Temp Offset CMD to node: " + cmd_);
        break;
      }

      // ext udp setting toggle
      case "extUdpToggle": {
        cmd_ = ext_udp_enable_str.current;
        console.log("Ext UDP CMD to node: " + cmd_);
        break;
      }

      // ext udp ip setting
      case "extUdpIP": {
        cmd_ = ext_udp_IP_str.current;
        console.log("Ext UDP IP CMD to node: " + cmd_);
        break;
      }

      // rest wifi ssid and pwd
      case "RST_WIFI_SSID_PW": {
        console.log("Resetting Wifi SSID and PW to none");
        cmd_ = "--setssid none --setpwd none";
        setAlHeader("Wifi Settings reset!");
        setAlMsg("Wifi Settings reset to none! Will reboot in 15s.");
        setShAlertCard(true);
        break;
      }

      // reset aprs name
      case "RST_APRS_NAME": {
        console.log("Resetting APRS Name to none");
        cmd_ = "--setname none";
        break;
      }

      // reset aprs comment
      case "RST_APRS_COMMENT": {
        console.log("Resetting APRS Comment to none");
        cmd_ = "--atxt none";
        break;
      }

      // reset fixed ip settings
      case "RST_FIXED_IP": {
        console.log("Resetting Fixed IP Settings to none");
        cmd_ = "--setownip none --setownms none --setowngw none --setowndns none";
        setAlHeader("Fixed IP Settings reset!");
        setAlMsg("Fixed IP Settings reset to none! Will reboot in 15s.");
        setShAlertCard(true);
        break;  
      }

      // sht-21 sensor on off
      case "sht21": {
        if(sensorSettingsS1_s.SHT){
          cmd_ = "--sht21 off";
        } else {
          cmd_ = "--sht21 on";
        }
        break;
      }

      // manual position setting
      case "setManualPos": {
        console.log("Setting Manual Position to node: " + manual_pos_cmd.current);
        cmd_ = manual_pos_cmd.current;
        break;
      }

      // Gw Server setting
      case "setGWsrv": {
        cmd_ = "--gateway srv " + gw_srv_str.current;
        console.log("Gateway Server CMD to node: " + cmd_);
        break;
      }
    }

    // finally send it via textmsg
    sendTxtCmdNode(cmd_);
    LogS.log(0,"Settings Command: " + cmd_);

    // forward to info page when pos or wx info button pressed
    if (cmd === "posdebug" || cmd === "wx") {
      history.push('/info');
    }
  }



  /////// APRS Symbol Settings ///////
  // create a function to get the value of the APRS Symbol IonSelect. Event is Symbol Preset Name
  const aprsSymChanged = (event: string) => {
    console.log("Aprs Sym changed");
    console.log("Aprs Sym Name: " + event);
    // get the symbol char and group char from the aprs symbol table
    aprs_symbols_mapped.current.find((item) => {
      if(item.s_name === event){
        console.log("Aprs Sym Char: " + item.s_char);
        console.log("Aprs Sym Group: " + item.s_group);
        aprs_sym_char.current = item.s_char;
        aprs_pri_sec_char.current = item.s_group;
      }});

    AprsSettingsStore.update(s => {
      s.aprsSettings.SYMCD = aprs_sym_char.current;
      s.aprsSettings.SYMID = aprs_pri_sec_char.current;
    });
    
    aprsSym_changed.current = true;
    aprs_pri_sec_valid.current = true;
    aprssym_valid.current = true;
  }


  // set the aprsSym changed flag when characters manual changed
  const aprsSymChangedManual = (event: any) => {
    console.log("Aprs Sym manual changed");

    if(event.target.value != null && event.target.value !== undefined && event.target.value !== "" && event.target.value !== " " && event.target.value.length === 1){
      const char:string = event.target.value;
      console.log("Aprs Sym Char: " + char);
      aprsSym_changed.current = true;
      // allowed values are from ! to }
      if(char.charCodeAt(0) >= 33 && char.charCodeAt(0) <= 125){
        console.log("Aprs Sym Char allowed: " + char);
        aprs_sym_char.current = char;
        aprssym_valid.current = true;
      } else {
        console.log("Aprs Sym Char not allowed!");
        aprssym_valid.current = false;
        return;
      }
    }
  }

  // set the aprsPriSec changed flag when characters manual changed
  const aprsPriSecChangedManual = (event: any) => {
    console.log("Aprs Pri/Sec manual changed");

    if(event.target.value != null && event.target.value !== undefined && event.target.value !== "" && event.target.value !== " " && event.target.value.length === 1){
      const char:string = event.target.value;
      console.log("Aprs Pri/Sec Char: " + char);
      aprsSym_changed.current = true;
      // allowed values are 0-9, A-Z, / and \
      if(char.charCodeAt(0) >= 48 && char.charCodeAt(0) <= 57 || char.charCodeAt(0) >= 65 && char.charCodeAt(0) <= 90 || char.charCodeAt(0) === 47 || char.charCodeAt(0) === 92){
        console.log("Aprs Pri/Sec Char allowed: " + char);
        aprs_pri_sec_char.current = char;
        aprs_pri_sec_valid.current = true;
      } else {
        console.log("Aprs Pri/Sec Char not allowed!");
        aprs_pri_sec_valid.current = false;
        return;
      }
    }
  }


  

  ////// Setter for Settings Buttons //////
  // set the APRS comment
  const setAPRScomment = () => {
    
    if(aprsCmtRef.current!.value !== null && aprsCmtRef.current!.value !== undefined && aprsCmtRef.current!.value !== "" && aprsCmtRef.current!.value !== " "){
      const cmt_txt = aprsCmtRef.current!.value;
      LogS.log(0, "Setting APRS Comment: " + cmt_txt);
      sendTxtCmd("atxt");
      // clear input field
      aprsCmtRef.current!.value = "";
    }
  }
  
    
  // set the UTC Time Offset
  const setUTCOffset = () => {

    if (node_utc_offset_ref.current!.value !== undefined && node_utc_offset_ref.current!.value !== null) {

      const offset_str = node_utc_offset_ref.current!.value.toString();
      const offset_nr = +offset_str;

      // check if the offset is +/-14 max or > 28 and fire alert card if needed
      if (offset_nr >= -15 && offset_nr <= 28) {
          node_utc_offset.current = offset_nr;
          console.log("Setting UTC Offset: " + node_utc_offset.current);
          sendTxtCmd("utcoffset");
          setAlHeader("UTC Offset set!");
          setAlMsg("Setting saved to node!");
          setShAlertCard(true);
      } else {
        console.log("UTC Offset not set!");
        setAlHeader("UTC Offset not set!");
        setAlMsg("Please enter a valid UTC Offset!");
        setShAlertCard(true);
      }
    }
  }


  // Derive the UTC offset from the PHONE's time zone instead of typing it by
  // hand. getTimezoneOffset() is minutes behind UTC and already accounts for the
  // current position's zone AND daylight saving (summer/winter) - so this can't
  // drift 1 h out of date like a manual value does. Fill the field and send.
  const setUTCOffsetFromPhone = () => {
    const offsetH = -new Date().getTimezoneOffset() / 60; // e.g. CEST -> 2, CET -> 1
    // clean number string: integer -> "2", fractional (e.g. India 5.5) -> "5.5"
    const clean = Number.isInteger(offsetH)
      ? offsetH.toString()
      : offsetH.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    if (node_utc_offset_ref.current) node_utc_offset_ref.current.value = clean;
    node_utc_offset.current = offsetH;
    setUTCOffset(); // reuse the existing validate + send-to-node path
  }


  // set the onewire pin number
  const setOnewirePin = () => {

    if (owPinInputRef.current!.value !== undefined && owPinInputRef.current!.value !== null) {
      const pin_str = owPinInputRef.current!.value.toString();
      const pin_nr = +pin_str;

      console.log("Setting Onewire Pin: " + pin_nr);

      if (pin_nr >= 0 && pin_nr <= MAX_PIN_NUM) {
          owPinNr.current = pin_nr;
          sendTxtCmd("owpin");
          setAlHeader("Onewire Pin set!");
          setAlMsg("Setting saved to node!");
          setShAlertCard(true);
      } else {
        console.log("Onewire Pin not set!");
        setAlHeader("Onewire Pin not set!");
        setAlMsg("Please enter a valid Onewire Pin Number!");
        setShAlertCard(true);
      }
    }
  }



  // set the user button pin number
  const setUserButtonPin = async () => {

    if (userBtnInputRef.current!.value !== undefined && userBtnInputRef.current!.value !== null) {
      const pin_str = userBtnInputRef.current!.value.toString();
      const pin_nr = +pin_str;

      console.log("Setting Userbutton Pin: " + pin_nr);

      if (pin_nr >= 0 && pin_nr <= MAX_USER_BTN_NUM) {
          userBtnNr.current = pin_nr;
          sendTxtCmd("userButtonPin");
          setAlHeader("User Button Pin set!");
          setAlMsg("Setting saved to node!");
          setShAlertCard(true);
      } else {
        setAlHeader("Wrong Userbutton Pin Number!");
        setAlMsg("Pin Nr not in Range!");
        setShAlertCard(true);
      }
    } 
  } 



  // set the country setting
  const setCountrySetting = async () => {
    if (ctry_setting_changed_str.current !== "" && ctry_setting_changed_str.current !== " ") {
      console.log("Setting Country: " + ctry_setting_changed_str.current);
      sendTxtCmd("ctry");
    } else {
      console.log("Country setting not set!");
      setAlHeader("Country setting not set!");
      setAlMsg("Please enter a valid Country Code!");
      setShAlertCard(true);
    }
  }


  // set the fixed IP adresses 
  const setFixedIP = () => {
    console.log("Setting Fixed IP Adresses");
    // check if the IP adresses are valid
    if(ip_addr_ref.current !== null && ip_addr_ref.current !== undefined &&
       ip_snm_ref.current !== null && ip_snm_ref.current !== undefined &&
       ip_gw_ref.current !== null && ip_gw_ref.current !== undefined &&
       ip_dns_ref.current !== null && ip_dns_ref.current !== undefined) {

      ip_addr_str.current = ip_addr_ref.current!.value!.toString();
      ip_snm_str.current = ip_snm_ref.current!.value!.toString();
      ip_gw_str.current = ip_gw_ref.current!.value!.toString();
      ip_dns_str.current = ip_dns_ref.current!.value!.toString();
      console.log("IP Address: " + ip_addr_str.current);
      console.log("IP Subnet Mask: " + ip_snm_str.current);
      console.log("IP Gateway: " + ip_gw_str.current);
      console.log("IP DNS: " + ip_dns_str.current);

      // check if the IP adresses are valid
      if(ip_addr_str && ip_snm_str && ip_gw_str && ip_dns_str) {
        if(ip_regex.test(ip_addr_str.current) && ip_regex.test(ip_snm_str.current) && ip_regex.test(ip_gw_str.current) && ip_regex.test(ip_dns_str.current)) {
          // all IP adresses are valid
          console.log("IP Adresses are valid");
          // send the IP adresses to the node
          sendTxtCmd("setFixedIP");
        } else {
          console.log("IP Adresses not valid!");
          setAlHeader("IP Adresses not valid!");
          setAlMsg("Please enter a valid IP Address, Subnet Mask Gateway and DNS!");
          setShAlertCard(true);
        }
      }
    }
  }


  // set the name setting from namesetting ref
  const setNameSetting = () => {
    if (name_input_ref.current !== null && name_input_ref.current !== undefined) {
      name_str.current = name_input_ref.current.value!.toString();
      if(name_str.current !== "" && name_str.current !== " " && name_str.current.length <= MAX_NAME_CHARS) {
        name_str.current = name_str.current.trim();
        console.log("Setting Name: " + name_str.current);
        sendTxtCmd("name");
        setAlHeader("Name set!");
        setAlMsg("Setting saved to node!");
        setShAlertCard(true);
      } else {
        console.log("Name setting not set!");
        setAlHeader("Name setting not set!");
        setAlMsg("Please enter a valid Name!");
        setShAlertCard(true);
      }
    }
  }


    // set the temperature offset 
  const setTempOffset = () => {
    if (temp_offset_ref.current !== null && temp_offset_ref.current !== undefined && temp_ow_offset_ref.current !== null && temp_ow_offset_ref.current !== undefined) {
      const temp_offset_ = temp_offset_ref.current.value!.toString();
      const temp_offset_ow_ = temp_ow_offset_ref.current.value!.toString();
      // check if the offset is a number
      const temp_offset_nr = +temp_offset_;
      const temp_offset_ow_nr = +temp_offset_ow_;
      if (!isNaN(temp_offset_nr) && !isNaN(temp_offset_ow_nr)) {
        console.log("Setting Temperature Offset: " + temp_offset_nr + " and Onewire Offset: " + temp_offset_ow_nr);
        // check if the offset is in range -50 to 50
        if (temp_offset_nr >= -50 && temp_offset_nr <= 50 && temp_offset_ow_nr >= -50 && temp_offset_ow_nr <= 50) {
          // set the offsets
          temp_offset_str.current = "--tempoff in " + temp_offset_ + " --tempoff out " + temp_offset_ow_;
          sendTxtCmd("setTempOffset");
          setAlHeader("Temperature Offset set!");
          setAlMsg("Setting saved to node!");
          setShAlertCard(true);
        } else {
          console.log("Temperature Offset not set!");
          setAlHeader("Temperature Offset not set!");
          setAlMsg("Please enter a valid Temperature Offset between -50 and 50!");
          setShAlertCard(true);
        }
      } else {
        console.log("Temperature Offset not set!");
        setAlHeader("Temperature Offset not set!");
        setAlMsg("Please enter a valid Temperature Offset!");
        setShAlertCard(true);
      }
    }
  }


  // set the external UDP Settings
  const setExtUdpIP = () => {
    if (ext_udp_ip_ref.current !== null && ext_udp_ip_ref.current !== undefined) {
      const ext_udp_ip = ext_udp_ip_ref.current.value!.toString();
      console.log("Ext UDP IP: " + ext_udp_ip);
      // check if the IP is valid with regex
      if (ip_regex.test(ext_udp_ip) && ext_udp_ip !== "" && ext_udp_ip !== " " && ext_udp_ip !== "0.0.0.0") {
        // set the ext UDP IP in the store
        console.log("Ext UDP IP is valid");
        ext_udp_IP_str.current = "--extudpip " + ext_udp_ip;
        sendTxtCmd("extUdpIP");
        setAlHeader("Ext UDP IP set!");
        setAlMsg("Ext UDP IP Address set: " + ext_udp_ip);
        setShAlertCard(true);
      } else {
        console.log("Ext UDP IP is not valid");
        setAlHeader("Ext UDP IP not valid!");
        setAlMsg("Please enter a valid IP Address for the Ext UDP IF!");
        setShAlertCard(true);
        return;
      }
    }
  }

  // enabling the ext UDP IF with toggle. Getting Ion-Event
  const enableExtUDP = (ev:any) => {
    console.log("Enable Ext UDP: " + ev.detail.checked);
    if (ev.detail.checked) {
      // check if the ext UDP IP is set correctly with regex
      if (ext_udp_ip_ref.current !== null && ext_udp_ip_ref.current !== undefined) {
        const ext_udp_ip = ext_udp_ip_ref.current.value!.toString();
        console.log("Ext UDP IP: " + ext_udp_ip);
        // check if the IP is valid with regex
        if (ip_regex.test(ext_udp_ip) && ext_udp_ip !== "" && ext_udp_ip !== " " && ext_udp_ip !== "0.0.0.0") {
          // set the ext UDP IP in the store
          console.log("Ext UDP IP is valid");
          ext_udp_enable_str.current = "--extudp on";
          sendTxtCmd("extUdpToggle");
          setAlHeader("Ext UDP IF enabled!");
          setAlMsg("Ext UDP Interface enabled!");
          setShAlertCard(true);
        } else {
          console.log("Ext UDP IP is not valid");
          setAlHeader("Ext UDP IP not valid!");
          setAlMsg("Please enter a valid IP Address for the Ext UDP IF!");
          setShAlertCard(true);
          // set the toggle back to false
          WifiSettingsStore2.update(s => {
            s.wifiSettings2.EUDP = false;
          });
          return;
        }
      }
    } else {
      // disable the ext UDP IF
      console.log("Disabling Ext UDP IF");
      ext_udp_enable_str.current = "--extudp off";
      sendTxtCmd("extUdpToggle");
      setAlHeader("Ext UDP IF disabled!");
      setAlMsg("Ext UDP Interface disabled!");
      setShAlertCard(true);
    }
  }

  // Manual Position Settings ///////
  const setManualPos = () => {
    console.log("Setting Manual Position");
    if(manual_lat_ref.current !== null && manual_lat_ref.current !== undefined &&
        manual_lon_ref.current !== null && manual_lon_ref.current !== undefined &&
        manual_alt_ref.current !== null && manual_alt_ref.current !== undefined) {

      const lat_str = manual_lat_ref.current!.value!.toString();
      const lon_str = manual_lon_ref.current!.value!.toString();
      const alt_str = manual_alt_ref.current!.value!.toString();
      console.log("Manual Lat: " + lat_str);
      console.log("Manual Lon: " + lon_str);
      console.log("Manual Alt: " + alt_str);

      // check if the lat and lon are valid numbers
      const lat_nr = +lat_str;
      const lon_nr = +lon_str;
      const alt_nr = +alt_str;

      if(!isNaN(lat_nr) && !isNaN(lon_nr) && !isNaN(alt_nr)){
        // check if the lat and lon are in valid range
        if(lat_nr >= -90 && lat_nr <= 90 && lon_nr >= -180 && lon_nr <= 180 && alt_nr >= 0){
          // all values are valid
          console.log("Manual Position is valid");
          const cmd_str = "--setlat " + lat_str + " --setlon " + lon_str + " --setalt " + alt_str;
          console.log("Manual Position CMD: " + cmd_str);
          manual_pos_cmd.current = cmd_str;
          sendTxtCmd("setManualPos");
          setAlHeader("Manual Position set!");
          setAlMsg("Manual Position saved to node!");
          setShAlertCard(true);
        } else {
          console.log("Manual Position not valid!");
          setAlHeader("Manual Position not valid!");
          setAlMsg("Please enter a valid Latitude (-90 to 90), Longitude (-180 to 180) and Altitude (>=0)!");
          setShAlertCard(true);
        }
      } else {
        console.log("Manual Position not valid!");
        setAlHeader("Manual Position not valid!");
        setAlMsg("Please enter a valid Latitude, Longitude and Altitude!");
        setShAlertCard(true);
      }

    }
  }



  // send the GW server command to the node
  const setGWsrvToNode = () => {
    console.log("Setting Gateway Server to node: " + gw_srv_str.current);
    sendTxtCmd("setGWsrv");
    setAlHeader("Gateway Server set!");
    setAlMsg("Gateway Server saved to node!");
    setShAlertCard(true);
  }


  /////// Group Settings ///////
  // If the group setting menu is not open, the Refs are not working
  // set each group and check if it is a number and maximum 5 digits
  // first make a function to check for valid number
  const checkGrpInput = (grp_value:string | number | null | undefined):number => {
    if(grp_value !== null && grp_value !== undefined && grp_value !== "" && grp_value !== " "){
      // check if the value is a number
      const grp_val_nr = +grp_value;
      if(!isNaN(grp_val_nr)){
        // check if the group number has maximum 5 digits
        if(grp_val_nr >= 0 && grp_val_nr <= 99999){
          return grp_val_nr;
        } else {
          return 0;
        }
      } else {
        return 0;
      }
    }
    return 0;
  }

  // parse a group field "262 DL" -> {num, label}. The number is the FIRST run of
  // digits (validated for the firmware - never send the label!). The label after
  // the number is interpreted at save time: "" = keep the existing label for this
  // number, "-" = clear it (e.g. "9 -"), any other text = set it.
  const parseGrpField = (text: string): {num: number; label: string} => {
    const t = (text || "");
    const m = t.match(/\d+/);
    const num = m ? checkGrpInput(m[0]) : 0;
    const label = m ? t.slice(t.indexOf(m[0]) + m[0].length).trim() : "";
    return { num, label };
  }

  // one input handler for all six group slots (index 0..5)
  const grpChanged = (i: number, event: any) => {
    const raw = event?.target?.value;
    if (raw === null || raw === undefined) return;
    const { num, label } = parseGrpField(raw.toString());
    gcbRefs[i].current = num;
    labelRefs[i].current = label;
    groupSettingChanged.current = true;
  }
  
  // set the group settings when the group settings are changed
  const setGroupSettings = async () => {

    // check if any group setting changed
    if (groupSettingChanged.current) {

      console.log("Setting Group Settings");
      groupSettingChanged.current = false;

      console.log("Group Settings changed");
      console.log("Group 0: " + gcb0Ref.current);
      console.log("Group 1: " + gcb1Ref.current);
      console.log("Group 2: " + gcb2Ref.current); 
      console.log("Group 3: " + gcb3Ref.current);
      console.log("Group 4: " + gcb4Ref.current);
      console.log("Group 5: " + gcb5Ref.current);

      // firmware command: ONLY the numbers, never the labels
      let cmd_str = "--setgrc ";
      cmd_str = cmd_str + gcb0Ref.current.toString() + ";" + gcb1Ref.current.toString() + ";" + gcb2Ref.current.toString() + ";" + gcb3Ref.current.toString() + ";" + gcb4Ref.current.toString() + ";" + gcb5Ref.current.toString() + ";";

      console.log("Group CMD: " + cmd_str);
      setGrpCmd.current = cmd_str;

      // update the app-local TG->label map (keyed by TG number). Keep existing
      // labels so a number keeps its label across slot changes and is restored on
      // re-add; per field: "" = keep, "-" = clear, text = set. (Labels are never
      // auto-pruned; clear one with "9 -" or wipe all via Reset.)
      let newLabels: {[k: string]: string} = {};
      try { newLabels = JSON.parse(AppPrefsStore.getRawState().tgLabels || "{}"); } catch { newLabels = {}; }
      gcbRefs.forEach((r, i) => {
        const num = r.current;
        if (num <= 0) return;
        const key = num.toString();
        const label = (labelRefs[i].current || "").trim();
        if (label === "-") delete newLabels[key];
        else if (label !== "") newLabels[key] = label;
        // label === "" -> keep the existing label for this number
      });
      const labelsJson = JSON.stringify(newLabels);
      AppPrefsStore.update(s => { s.tgLabels = labelsJson; });
      DataBaseService.setPref('tgLabels', labelsJson);

      // a slot repurposed to a DIFFERENT number (or cleared) makes the old TG's
      // stored messages stale -> delete them. Only for numbers gone from ALL slots
      // (a pure slot swap keeps both); a label-only change keeps the number, so its
      // messages stay.
      const oldNums = [grp0, grp1, grp2, grp3, grp4, grp5];
      const newNums = gcbRefs.map(r => r.current);
      const removed = oldNums.filter(n => n > 0 && !newNums.includes(n));
      for (const n of removed) { await DataBaseService.deleteGroupMessages(n); }
      if (removed.length > 0) await DataBaseService.reapplyChatFilters();

      console.log("Time in ms: " + Date.now());
      sendTxtCmd("setGroup");

      setAlHeader("Group Settings set!");
      setAlMsg("Group Settings saved to node!");
      setShAlertCard(true);
      
    }
  }




  // load CSS for the Action Sheet
  const customActionSheetOptions = {
    cssClass: "settings-actionsheet"
  };


  // scroll to bottom when ext settings active
  const scrollToBottom= async ()=>{
    document.getElementById('setting_bottom')!.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }


  // scroll to bottom when ext settings active
  useEffect(()=>{

    if(shAdvSetting)
      scrollToBottom();

  },[shAdvSetting]);


  // tx power setting handler
  useEffect(() => {
    if(txpower_slider){
      console.log("Tx-Power (dBm): " + txpower_slider);

      let newTxPower = +txpower_slider!.toString();
      // if we have old SX127x Chips 18 and 19 dBm are not available
      if(config_s.hw === "TLORA V2" || config_s.hw === "TLORA V2.1.6" || config_s.hw === "TBEAM V1.1" || config_s.hw === "HELTEC V2.1" || config_s.hw === "TBEAM V1.2"){
        if(newTxPower === 18 || newTxPower === 19){
          newTxPower = 17;
        }
      }

      tx_pwr.current = newTxPower; 
      const pwr_exp_w = (newTxPower - 30) / 10;
      const pwr_w = (Math.pow(10, pwr_exp_w) * 1000).toFixed(0); //mW
      console.log("TX Pwr (mW): " + pwr_w);
      setTxPwrW(+pwr_w);
      const max_pwr_w = Math.pow(10, (maxTXpwr.current - 30) / 10) * 1000;
      setTxPwrPct(Math.round((+pwr_w) / max_pwr_w * 100));
      sendTxtCmd("txpwr");
    }
  }, [txpower_slider]);






  // handle custom pairing pin input
  const handleBLEParingPinInput = (event: string) => {
    console.log("Custom BLE Pairing Pin changed!");
    console.log("Event Pin: " + event);
    ble_pairing_pin.current = event ?? "";
    setBLEPairingPinDisplay(event ?? "");
  }

  // reset BLE PIN to 000000 — clears DB entry and sends command to node
  const resetBLEPin = async () => {
    if (devID_s) {
      await DataBaseService.checkDbConn();
      await DataBaseService.clearBlePin(devID_s);
      setBLEPairingPinDisplay("000000");
      console.log("BLE PIN cleared in DB for devID: " + devID_s);
    }
    sendTxtCmd("RST_BT_CODE");
  };

  // validate and send custom pairing pin to node
  const setBLEParingPin = async () => {
    const pinRaw = ble_pairing_pin_ref.current?.value?.toString() ?? ble_pairing_pin.current ?? "";
    const pin = pinRaw.trim();

    if (!/^\d{6}$/.test(pin)) {
      setAlHeader("Invalid BLE PIN!");
      setAlMsg("BLE PIN must be exactly 6 digits (0-9).");
      setShAlertCard(true);
      return;
    }

    if (parseInt(pin, 10) < 100000) {
      setAlHeader("Invalid BLE PIN!");
      setAlMsg("BLE PIN must be between 100000 and 999999");
      setShAlertCard(true);
      return;
    }

    ble_pairing_pin.current = pin;
    sendTxtCmd("btcode");

    if (devID_s) {
      await DataBaseService.checkDbConn();
      await DataBaseService.setBlePin(devID_s, pin);
      console.log("BLE PIN saved in DB for devID: " + devID_s);
    }

    setAlHeader("BLE PIN set!");
    setAlMsg("Setting saved to node.");
    setShAlertCard(true);
  }

  // handle clear all pairing pins in DB
  const clearAllBLEPins_ = async () => {
    await DataBaseService.checkDbConn();
    await DataBaseService.clearAllBlePins();
    console.log("All BLE PINs cleared in DB");
    setAlHeader("All BLE PINs cleared!");
    setAlMsg("All BLE PINs cleared from database.");
    setShAlertCard(true);
  }




  // open an Alert Card if ScanI2C changed
  useEffect(() => {
      if (scanResult.length > 0) {
        setAlHeader("Scan I2C Bus");
        setAlMsg(scanResult);
        setShAlertCard(true);
      }
  }, [scanResult]);


  // handle Frequency Preset Selection
  const freqPresetChanged = (event: string) => {

    console.log("Freq Preset changed");
    const freq_preset = +event;
    console.log("Freq Preset: " + freq_preset);

    if (freq_preset !== 0) {
      // set frequency
      
    }
  }


  // handle Bandwidth Preset Selection
  const bwPresetChanged = (event: string) => {

    console.log("BW Preset changed");
    const bw_preset = +event;
    console.log("BW Preset: " + bw_preset);

    if (bw_preset !== 0) {
      // set bandwidth
    }
  }


  // handle clear positions - we want to get own position from node afterwords
  const deletePositions = () => {
    console.log("Delete Positions");
    DataBaseService.clearPositions().then(() => {
      console.log("Request own position from node");
      // wait a bit and request own position from node
      setTimeout(() => {
        sendTxtCmdNode("--pos");
      }, 1000);
    });
  }


  // redirect to connect page if unset node
  const redirectConnect = () => {
    setShDiscoCard(false);
    if (isAppActive)
      history.push("/connect");
  }


  // handle OTA Update Button
  const handleOTAUpdate = () => {
    setShOTAUpdateCard(true);
  }




  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Node Settings</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">Node Settings</IonTitle>
          </IonToolbar>
        </IonHeader>

        <AlertCard
          isOpen={shAlertCard}
          header={alHeader}
          message={alMsg}
          onDismiss={() => setShAlertCard(false)}
        />

        <IonAlert
          isOpen={shDiscoCard}
          onDidDismiss={() => redirectConnect()}
          header="BLE Disconnect"
          message="Node disconnected! Auto-Reconnect is disabled currently."
          buttons={[
            {
              text: "OK"
            },
          ]}
        />

        <IonAlert
          isOpen={shRebootCard}
          header="Reboot Node?"
          message="Reboot Node now?"
          buttons={[
            {
              text: 'Cancel',
              handler: () => {
                console.log('Reboot canceled');
                setShRebootCard(false);
              },
            },
            {
              text: 'YES',
              handler: () => {
                console.log('Reboot Node confirmed');
                setShRebootCard(false);
                sendTxtCmd("reboot");
              },
            },
          ]}
        />

        <IonAlert
          isOpen={shDeepSleepCard}
          header="Deep Sleep"
          message="Send node into Deep Sleep now?"
          buttons={[
            {
              text: 'Cancel',
              handler: () => {
                console.log('Deep Sleep canceled');
                setShDeepSleepCard(false);
              },
            },
            {
              text: 'YES',
              handler: () => {
                console.log('Deep Sleep confirmed');
                setShDeepSleepCard(false);
                sendTxtCmd("deepsleep");
              },
            },
          ]}
        />

        <IonAlert
          isOpen={shOTAUpdateCard}
          header="OTA Update?"
          message="Boot into OTA Mode now?"
          buttons={[
            {
              text: 'Cancel',
              handler: () => {
                console.log('Reboot canceled');
                setShOTAUpdateCard(false);
              },
            },
            {
              text: 'YES',
              handler: () => {
                console.log('Booting to OTA confirmed');
                setShOTAUpdateCard(false);
                sendTxtCmd("otaupdate");
              },
            },
          ]}
        />

        <div id="page">
          <div id="spacer-top" />
          <div className='settings_panel'>
            <div className='sp_header'>
              <div>{config_s.callSign}</div>
            </div>

            <div className='settings_cont'>
              <div className='set_val'>QRG: {config_s.frequency} MHz</div>
              <div className='set_val'>TX Pwr: {nodeSettings.TXP} dBm</div>
            </div>
            <div className='settings_cont'>
              <div>APRS Symbol ID: {aprs_settings_s.SYMID}</div>
              <div>APRS Symbol: {aprs_settings_s.SYMCD}</div>
              <div>APRS Comment: {aprs_settings_s.ATXT}</div>
              {aprs_settings_s.NAME.length > 0 && <div>APRS Name: {aprs_settings_s.NAME}</div>}
            </div>

            {(grp0 > 0 || grp1 > 0 || grp2 > 0 || grp3 > 0 || grp4 > 0 || grp5 > 0) && <div className='settings_cont'>
              <div>Call Groups:</div>
              {grp0 > 0 && <div>Group 1: {grp0}</div>}
              {grp1 > 0 && <div>Group 2: {grp1}</div>}
              {grp2 > 0 && <div>Group 3: {grp2}</div>}
              {grp3 > 0 && <div>Group 4: {grp3}</div>}
              {grp4 > 0 && <div>Group 5: {grp4}</div>}
              {grp5 > 0 && <div>Group 6: {grp5}</div>}
            </div>
            }

            <div className='settings_cont'>
              {config_s.hw != "RAK4631" ? <>
              <div>Wifi SSID: {wifiSettings_s.SSID}</div>
              <div>Wifi IP: {wifiSettings_s.IP}</div>
              <div>Wifi GW: {wifiSettings_s.GW}</div>
              <div>Wifi SNM: {wifiSettings_s.SUB}</div>
              <div>WiFi DNS: {wifiSettings_s.DNS}</div>
              </>:<> 
              <div>ETH IP: {wifiSettings_s.IP}</div>
              <div>ETH GW: {wifiSettings_s.GW}</div>
              <div>ETH SNM: {wifiSettings_s.SUB}</div>
              <div>ETH DNS: {wifiSettings_s.DNS}</div>
              </>}
              
            </div>
          </div>

          <div id="spacer-buttons" />
          <div className='setting_wrapper'>
            <div className="flex-row mb-3">
              <div>
                <IonText id="wifi-text">Callsign</IonText>
              </div>
              <div>
                <IonButton size="small" fill="outline" color='success' onClick={() => setCallSign()}>
                  <IonIcon icon={checkmarkCircle} ></IonIcon>
                </IonButton>
              </div>
            </div>
            <IonItem>
              <IonInput ref={callInputRef} label='Set Node Callsign' labelPlacement="floating" placeholder="eg. OE1KFR-1" type='text' maxlength={12}></IonInput>
            </IonItem>
          </div>

          <div id="spacer-buttons" />

          <div className='setting_wrapper'>
            <div className="flex-row mb-3">
              <div>
                <IonText id="wifi-text">WiFi Settings</IonText>
              </div>
              <div className='rst-set-btns'>
                <div>
                  <IonButton size="small" fill="outline" color='success' onClick={() => sendTxtCmd("RST_WIFI_SSID_PW")}>RST</IonButton>
                </div>
                <div>
                  <IonButton size="small" fill="outline" color='success' onClick={() => setWifiSetting()}>
                    <IonIcon icon={checkmarkCircle} ></IonIcon>
                  </IonButton>
                </div>
              </div>
            </div>
            <IonItem>
              <IonInput ref={ssidInputRef} value={wifiSettings_s.SSID} label='Set WiFi SSID' labelPlacement="floating" placeholder='SSID' type='text' maxlength={MAX_SSID_CHARS}></IonInput>
            </IonItem>
            <IonItem>
              <IonInput ref={wifipwdInputRef} label='Set WiFi Password' labelPlacement="floating" placeholder='PWD' type={shWifiPwd ? 'text' : 'password'} maxlength={MAX_PWD_CHARS}></IonInput>
              <IonIcon slot='end' icon={shWifiPwd ? eyeOffOutline : eyeOutline} onClick={() => setShWifiPwd(!shWifiPwd)}></IonIcon>
            </IonItem>
          </div>

          <div id="spacer-buttons" />

          <div className='setting_wrapper'>
            <div className="flex-row mb-3">
              <div>
                <IonText id="wifi-text">APRS Symbol</IonText>
              </div>
              <div>
                <IonButton size="small" fill="outline" color='success' onClick={() => setAprsSymbols()}>
                  <IonIcon icon={checkmarkCircle} ></IonIcon>
                </IonButton>
              </div>
            </div>

            <div className='mt-3 mb-3'>APRS Map Symbol Preset:</div>

            <div id="spacer-toggle" />
            <IonItem>
              <IonSelect interface="action-sheet" interfaceOptions={customActionSheetOptions} placeholder="APRS Symbol" onIonChange={(ev) => aprsSymChanged(ev.detail.value)}>
                {aprs_symbols_mapped.current.map((sym) => (
                  <IonSelectOption key={sym.s_name} value={sym.s_name}>
                    {sym.s_name}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
            <div className='mt-3 mb-3'>Symbol Group Char</div>
            <IonItem>
              <IonInput value={aprs_settings_s.SYMID} ref={aprs_pri_sec_char_Input_ref} onIonInput={(ev) => aprsPriSecChangedManual(ev)} label='Set Group Character' labelPlacement="floating" type='text' maxlength={1}></IonInput>
            </IonItem>
            <div className='mt-3 mb-3'>Symbol Char</div>
            <IonItem>
              <IonInput value={aprs_settings_s.SYMCD} ref={aprs_sym_char_Input_ref} onIonInput={(ev) => aprsSymChangedManual(ev)} label='Set Character' labelPlacement="floating" type='text' maxlength={1}></IonInput>
            </IonItem>
            </div>

            <div id="spacer-buttons" />

          <div className='setting_wrapper'>
            <div className="flex-row mb-3">
              <div>
                <IonText id="wifi-text">APRS Comment</IonText>
              </div>
              <div className='rst-set-btns'>
                <div>
                  <IonButton size="small" fill="outline" color='success' onClick={() => sendTxtCmd("RST_APRS_COMMENT")}>RST</IonButton>
                </div>
                <div>
                  <IonButton size="small" fill="outline" color='success' onClick={() => setAPRScomment()}>
                    <IonIcon icon={checkmarkCircle} ></IonIcon>
                  </IonButton>
                </div>
              </div>
            </div>
            <IonItem>
              <IonInput value={aprs_settings_s.ATXT} ref={aprsCmtRef} label='Set Comment' labelPlacement="floating" type='text' maxlength={MAX_APRS_CMT_CHARS}></IonInput>
            </IonItem>
          </div>

          <div id="spacer-buttons" />

          <div className='setting_wrapper'>
            <div className="flex-row mb-3">
              <div>
                <IonText id="wifi-text">APRS Name</IonText>
              </div>
              <div>
                <div className='rst-set-btns'>
                  <div>
                    <IonButton size="small" fill="outline" color='success' onClick={() => sendTxtCmd("RST_APRS_NAME")}>RST</IonButton>
                  </div>
                  <div>
                    <IonButton size="small" fill="outline" color='success' onClick={() => setNameSetting()}>
                      <IonIcon icon={checkmarkCircle} ></IonIcon>
                    </IonButton>
                  </div>
                </div>
              </div>
            </div>
            <IonItem>
              <IonInput
                ref={name_input_ref}
                value={aprs_settings_s.NAME}
                label='Set APRS Name'
                labelPlacement="floating"
                type='text'
                maxlength={MAX_NAME_CHARS}
              ></IonInput>
            </IonItem>
          </div>


          <div id="spacer-buttons" />
          <div className='setting_wrapper'>
            <div className="flex-row mb-3">
              <div>
                <IonText id="wifi-text">Custom BLE PIN 6 Digits</IonText>
              </div>
              <div className='rst-set-btns'>
                <IonButton size="small" fill="outline" color='success' onClick={() => resetBLEPin()}>RST</IonButton>
                <IonButton size="small" fill="outline" color='success' onClick={() => setBLEParingPin()}>
                  <IonIcon icon={checkmarkCircle} ></IonIcon>
                </IonButton>
              </div>
            </div>
            <IonItem>
              <IonInput value={ble_pairing_pin_display} ref={ble_pairing_pin_ref} label='Set BLE Pin' labelPlacement="floating" type='text' maxlength={6} inputmode="numeric" onIonInput={(ev) => handleBLEParingPinInput(ev.detail.value!)}></IonInput>
            </IonItem>
          </div>

          <div id="spacer-buttons" />
          <div className='setting_wrapper'>
            <div className="flex-row mb-3">
              <div>
                <IonText id="wifi-text">Node UTC-Time-Offset</IonText>
              </div>
              <div>
                <IonButton size="small" fill="outline" onClick={() => setUTCOffsetFromPhone()}>From phone</IonButton>
                <IonButton size="small" fill="outline" color='success' onClick={() => setUTCOffset()}>
                  <IonIcon icon={checkmarkCircle} ></IonIcon>
                </IonButton>
              </div>
            </div>
            <IonItem>
              <IonInput value={node_utc_offset.current} ref={node_utc_offset_ref} label='Set UTC Offset' labelPlacement="floating" type='text' maxlength={4}></IonInput>
            </IonItem>
          </div>

          <div id="spacer-buttons" />
          <div className='txt-center'>
            <IonButton id="settings_button" fill='outline' slot='start' onClick={() => setCurrentPosGPS()}>Set Location - Phone GPS</IonButton>
          </div>

          <div id="spacer-buttons" />
            {/*Manual Position Settings*/}
          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shManualPos ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShManualPos(!shManualPos)} />
              </div>
              <IonText >Manual Location</IonText>
            </div>
            {shManualPos &&
              <div className='setting_wrapper'>
                <div className="flex-row mb-3">
                  <div>
                    <IonText className='mt-3 mb-3'>Latitude</IonText>
                  </div>
                  <div>
                    <IonButton size="small" fill="outline" color='success' onClick={() => setManualPos()}>
                      <IonIcon icon={checkmarkCircle} ></IonIcon>
                    </IonButton>
                  </div>
                </div>
                <IonItem>
                  <IonInput value={ownPosData.LAT} ref={manual_lat_ref} label='Set Latitude' labelPlacement="floating" type='text' maxlength={10} inputmode="text"></IonInput>
                </IonItem>
                <div className='mt-3 mb-3'>Longitude</div>
                    <IonItem>
                      <IonInput value={ownPosData.LON} ref={manual_lon_ref} label='Set Longitude' labelPlacement="floating" type='text' maxlength={11} inputmode="text"></IonInput>
                    </IonItem>
                <div className='mt-3 mb-3'>Altitude (m)</div>
                    <IonItem>
                      <IonInput value={ownPosData.ALT} ref={manual_alt_ref} label='Set Altitude' labelPlacement="floating" type='text' maxlength={6} inputmode="text"></IonInput>
                    </IonItem>
              </div>
            }
          </div>

          <div id="spacer-buttons" />
          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shCtrySetting ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShCtrySetting(!shCtrySetting)} />
              </div>
              <IonText>Country Setting</IonText>
            </div>
            {shCtrySetting && 
              <IonItem>
              <IonSelect value={ctrySetting} interface="action-sheet" interfaceOptions={customActionSheetOptions} placeholder="Country" onIonChange={(ev) => setCtryNode(ev.detail.value)}>
                {ctry_list.map((ctry) => (
                  <IonSelectOption key={ctry} value={ctry}>
                    {ctry_list_translated[ctry]}
                  </IonSelectOption>
                ))}
                
              </IonSelect>
              <IonButton size="small" fill="solid" color='success' onClick={() => setCountrySetting()}>
                  <IonIcon icon={checkmarkCircle} ></IonIcon>
                </IonButton><br></br>
            </IonItem>
            }
          </div>

          <div id="spacer-buttons" />
          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shGroupCallSet ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShGroupCallSet(!shGroupCallSet)} />
              </div>
              <IonText>Group Subscription</IonText>
            </div>
            {shGroupCallSet &&
              <div className='setting_wrapper'>
                {/* discovery hint: talk groups other nodes broadcast (last 24h) */}
                {gwGroups.length > 0 &&
                  <div className='mb-3'><IonText color="medium">GW TGs (last 24h): {gwGroups.join(", ")}</IonText></div>}
                {/* number + optional label ("262 DL"); only the number goes to the
                    firmware. Placeholder in Group 1 shows the format. "9 -" clears a label. */}
                <div className='mt-3 mb-3'>Group 1</div>
                <IonItem>
                  <IonInput value={grpDisplay(grp0, labelRefs[0].current)} onIonInput={(ev) => grpChanged(0, ev)} label='Set Group 1' labelPlacement="floating" type='text' maxlength={32} placeholder='9 local (rf-only)'></IonInput>
                </IonItem>
                <div className='mt-3 mb-3'>Group 2</div>
                <IonItem>
                  <IonInput value={grpDisplay(grp1, labelRefs[1].current)} onIonInput={(ev) => grpChanged(1, ev)} label='Set Group 2' labelPlacement="floating" type='text' maxlength={32} placeholder='20 DACH'></IonInput>
                </IonItem>
                <div className='mt-3 mb-3'>Group 3</div>
                <IonItem>
                  <IonInput value={grpDisplay(grp2, labelRefs[2].current)} onIonInput={(ev) => grpChanged(2, ev)} label='Set Group 3' labelPlacement="floating" type='text' maxlength={32} placeholder='262 DL'></IonInput>
                </IonItem>
                <div className='mt-3 mb-3'>Group 4</div>
                <IonItem>
                  <IonInput value={grpDisplay(grp3, labelRefs[3].current)} onIonInput={(ev) => grpChanged(3, ev)} label='Set Group 4' labelPlacement="floating" type='text' maxlength={32} placeholder='232 OE'></IonInput>
                </IonItem>
                <div className='mt-3 mb-3'>Group 5</div>
                <IonItem>
                  <IonInput value={grpDisplay(grp4, labelRefs[4].current)} onIonInput={(ev) => grpChanged(4, ev)} label='Set Group 5' labelPlacement="floating" type='text' maxlength={32}></IonInput>
                </IonItem>
                <div className='mt-3 mb-3'>Group 6</div>
                <IonItem>
                  <IonInput value={grpDisplay(grp5, labelRefs[5].current)} onIonInput={(ev) => grpChanged(5, ev)} label='Set Group 6' labelPlacement="floating" type='text' maxlength={32}></IonInput>
                </IonItem>
                <div className='resetGrpBtn txt-left flex-row'>
                    <IonButton fill='outline' slot='start' size="small" color='success' onClick={() => resetGrpCall()}>RST</IonButton>
                    <IonButton size="small" fill="outline" color='success' onClick={() => setGroupSettings()}>
                      <IonIcon icon={checkmarkCircle} ></IonIcon>
                    </IonButton>
                </div>
              </div>
            }
          </div>

          
          <div id="spacer-buttons" />
          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shUserBtns ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShUserBtns(!shUserBtns)} />
              </div>
              <IonText >User Buttons</IonText>
            </div>
            {shUserBtns ? <>
              <div className='settings_btns'>
                <div className='settings_btns_l'>
                  <div>
                    <IonButton expand="block" fill={nodeSettings.GW ? 'solid' : 'outline'} slot='start' onClick={() => sendTxtCmd("gw")}>GATEWAY</IonButton>
                  </div>
                  <div >
                    <IonButton expand="block" fill={nodeSettings.DISP ? 'outline' : 'solid'} slot='start' onClick={() => sendTxtCmd("display")}>DISPLAY</IonButton>
                  </div>
                  <div >
                    <IonButton expand="block" fill={nodeInfo_s.BOOST ? 'solid' : 'outline'} slot='start' onClick={() => sendTxtCmd("rxboost")}>RX Gain Boost</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={nodeSettings.WS ? 'solid' : 'outline'} onClick={() => sendTxtCmd("websrv")}>Webserver</IonButton>
                  </div>
                </div>
                <div className='settings_btns_r'>
                  {/*<div>
                    <IonButton expand="block" fill={nodeSettings.GWNPOS ? 'solid' : 'outline'} slot='start' onClick={() => sendTxtCmd("gw_nopos")}>GW NO POS</IonButton>
                  </div>  */}
                  <div>
                    <IonButton expand="block" fill={config_s.mesh_on ? 'solid' : 'outline'} slot='start' onClick={() => sendTxtCmd("mesh_retrx")}>MESH</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={nodeSettings.NOALL ? 'solid' : 'outline'} slot='start' onClick={() => sendTxtCmd("no_allmsg_rx")}>No ALL Msgs</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={config_s.button_on ? 'solid' : 'outline'} slot='start' onClick={() => sendTxtCmd("button")}>BUTTON</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={wifiSettings_s.AP ? 'solid' : 'outline'} slot='start' onClick={() => sendTxtCmd("wifi_ap")}>Wifi AP</IonButton>
                  </div>

                </div>
              </div>

              <IonText color="primary" class='txt-center'>
                <h3>GPS - Position</h3>
              </IonText>
              <div className='settings_btns'>
                <div className='settings_btns_l'>
                  <div >
                    <IonButton expand="block" fill={config_s.gps_on ? 'solid' : 'outline'} slot='start' onClick={() => sendTxtCmd("gps")}>GPS-Chip</IonButton>
                  </div>
                  <div >
                    <IonButton expand="block" fill={config_s.track_on ? 'solid' : 'outline'} slot='start' onClick={() => sendTxtCmd("track")}>{config_s.track_on ? "SmartBeaconing (track on)" : "Fixed Pos Interval (track off)"}</IonButton>
                  </div>
                </div>
                <div className='settings_btns_r'>
                  <div>
                    {/* WHERE this position goes is not fixed - the firmware decides it from
                        TRACK and the GPS fix (loop_functions.cpp sendPosition):
                          TRACK off               -> MeshCom
                          TRACK on, no GPS fix    -> MeshCom (the block needs posinfo_fix)
                          TRACK on, GPS fix       -> LoRa-APRS, and MeshCom only if one of
                                                     two timers says so (nothing heard for
                                                     15 s, or no mesh position for
                                                     POSINFO_INTERVAL) - hence the "?", we
                                                     cannot see either of them.
                        The APRS packet itself is built in exactly one place (the
                        `if(bSendViaAPRS)` branch), and that flag is only ever set by the
                        TRACK+fix block or by `--sendtrack` - so with TRACK off no LoRa-APRS
                        packet exists at all. The manual's "sends an APRS position signal"
                        does not contradict this: a MeshCom position IS in APRS format, it
                        just travels the mesh instead of 433.775.
                        The old label said "LoRa-APRS" unconditionally, which is right in
                        exactly one of those three cases. Spelling the target out makes the
                        firmware's concept visible instead of hiding it (DL9SAU). */}
                    <IonButton expand="block" fill='outline' slot='start' onClick={() => sendTxtCmd("txpos")}>
                      <div className='btn_two_lines'>
                        <span>Send Pos</span>
                        <span className='btn_sub'>{config_s.track_on && ownPosData.SFIX ? "APRS, ?MeshCom" : "MeshCom"}</span>
                      </div>
                    </IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill='outline' slot='start' onClick={() => sendTxtCmd("posdebug")}>GPS-Status</IonButton>
                  </div>
                </div>
              </div>

              <IonText color="primary" class='txt-center'>
                <h3>Sensors</h3>
              </IonText>
              <div className='settings_btns'>
                <div className='settings_btns_l'>
                  <div>
                    <IonButton expand="block" fill={config_s.bme_on ? 'solid' : 'outline'} slot='start' color={bme280_color} onClick={() => sendTxtCmd("bme")}>BME280</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={config_s.bme680_on ? 'solid' : 'outline'} slot='start' color={bme680_color} onClick={() => sendTxtCmd("680")}>BME680</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={sensorSettings_s.AHT ? 'solid' : 'outline'} slot='start' color={aht20_color} onClick={() => sendTxtCmd("aht20")}>AHT-20</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={config_s.onewire_on ? 'solid' : 'outline'} slot='start' color={onewire_color} onClick={() => sendTxtCmd("owon")}>One Wire</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill='outline' slot='start' onClick={() => sendTxtCmd("wx")}>WX-Info</IonButton>
                  </div>
                </div>
                <div className='settings_btns_r'>
                  <div>
                    <IonButton expand="block" fill={config_s.bmp_on ? 'solid' : 'outline'} slot='start' color={bmp280_color} onClick={() => sendTxtCmd("bmp")}>BMP280</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={sensorSettings_s.BMP3 ? 'solid' : 'outline'} slot='start' color={bmp3_color} onClick={() => sendTxtCmd("bmp3")}>BMP390</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={config_s.mcu811_on ? 'solid' : 'outline'} slot='start' color={s811_color} onClick={() => sendTxtCmd("mcu811")}>MCU-811</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={config_s.lps33_on ? 'solid' : 'outline'} slot='start' onClick={() => sendTxtCmd("lps33")}>LPS33</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill={sensorSettingsS1_s.SHT ? 'solid' : 'outline'} slot='start' color={sht21_color} onClick={() => sendTxtCmd("sht21")}>SHT21</IonButton>
                  </div>
                </div>
              </div>

              <IonText color="primary" class='txt-center'>
                <h3>Utilities</h3>
              </IonText>
              <div className='settings_btns'>
                <div className='settings_btns_l'>
                  <div>
                    <IonButton expand="block" fill='outline' slot='start' onClick={() => sendTxtCmd("scani2c")}>Scan I2C</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill='outline' slot='start' onClick={() => handleOTAUpdate()}>OTA Update</IonButton>
                  </div>
                </div>
                <div className='settings_btns_r'>
                  <div>
                    <IonButton expand="block" fill='outline' slot='start' onClick={() => setShRebootCard(true)}>REBOOT</IonButton>
                  </div>
                  <div>
                    <IonButton expand="block" fill='outline' slot='start' onClick={() => setShDeepSleepCard(true)}>Deep Sleep</IonButton>
                  </div>
                </div>

              </div>
            </> : <></>}
          </div>

          

          <div id="spacer-buttons" />

          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shTxPwrSlider ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShTxPwrSlider(!shTxPwrSlider)} />
              </div>
              <IonText >TX-Power</IonText>
            </div>
            {shTxPwrSlider ? <>
              <div className='ionrange_box'>
                <IonRange value={tx_pwr.current} min={minTXpwr.current} max={maxTXpwr.current} pin={true} debounce={350} pinFormatter={(value: number) => `${value} dBm`}
                  onIonChange={({ detail }) => setTxpower_slider(detail.value)}></IonRange>
                <IonLabel>Tx-Pwr: {tx_pwr.current} dBm / {tx_pwr_w}mW ({tx_pwr_pct}%)</IonLabel>
              </div>
            </> : <></>}
          </div>

          <div id="spacer-buttons" />
          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shGwServerSet ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShGwServerSet(!shGwServerSet)} />
              </div>
              <IonText>Gateway Server</IonText>
            </div>
            {shGwServerSet && 
              <IonItem>
              <IonSelect value={gw_srv} interface="action-sheet" interfaceOptions={customActionSheetOptions} placeholder="GWSrv" onIonChange={(ev) => setGwServerNode(ev.detail.value)}>
                {gw_srv_list.map((srv) => (
                  <IonSelectOption key={srv} value={srv}>
                    {gw_srv_table[srv]}
                  </IonSelectOption>
                ))}
                
              </IonSelect>
              <IonButton size="small" fill="solid" color='success' onClick={() => setGWsrvToNode()}>
                  <IonIcon icon={checkmarkCircle} ></IonIcon>
                </IonButton><br></br>
            </IonItem>
            }
          </div>


          <div id="spacer-buttons" />
          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shHwPins ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShHwPins(!shHwPins)} />
              </div>
              <IonText>Hardware Pins</IonText>
            </div>
            {shHwPins &&
              <div className='setting_wrapper'>
                <div className="flex-row mb-3">
                  <div>
                    <IonText id="wifi-text">Userbutton Pin</IonText>
                  </div>
                  <div>
                    <IonButton size="small" fill="outline" color='success' onClick={() => setUserButtonPin()}>
                      <IonIcon icon={checkmarkCircle} ></IonIcon>
                    </IonButton>
                  </div>
                </div>
                <IonItem>
                  <IonInput value={userBtnNr.current} ref={userBtnInputRef} label='Set Userbutton Pin' labelPlacement="floating" type='number' maxlength={2} inputmode="numeric"></IonInput>
                </IonItem>
                <div className="flex-row mb-3 mt-3">
                  <div>
                    <IonText id="wifi-text">OneWire Pin</IonText>
                  </div>
                  <div>
                    <IonButton size="small" fill="outline" color='success' onClick={() => setOnewirePin()}>
                      <IonIcon icon={checkmarkCircle} ></IonIcon>
                    </IonButton>
                  </div>
                </div>
                <IonItem>
                  <IonInput value={owPinNr.current} ref={owPinInputRef} label='Set Onewire Pin' labelPlacement="floating" type='number' maxlength={2} inputmode="numeric"></IonInput>
                </IonItem>
              </div>
            }
          </div>

          <div id="spacer-buttons" />
            {/*Temperature Offset Settings*/}
          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shTempOffset ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShTempOffset(!shTempOffset)} />
              </div>
              <IonText >Temperature Offset</IonText>
            </div>
            {shTempOffset &&
              <div className='setting_wrapper'>
                <div className="flex-row mb-3">
                  <div>
                    <IonText id="wifi-text">BME/BMP Offset</IonText>
                  </div>
                  <div>
                    <IonButton size="small" fill="outline" color='success' onClick={() => setTempOffset()}>
                      <IonIcon icon={checkmarkCircle} ></IonIcon>
                    </IonButton>
                  </div>
                </div>
                <IonItem>
                  <IonInput value={wxData_s.TOFFI} ref={temp_offset_ref} label='Set BME/BMP Offset' labelPlacement="floating" type='text' maxlength={5} inputmode="text"></IonInput>
                </IonItem>
                <div className='mt-3 mb-3'>Onewire Offset</div>
                    <IonItem>
                      <IonInput value={wxData_s.TOFFO} ref={temp_ow_offset_ref} label='Set Onewire Offset' labelPlacement="floating" type='text' maxlength={5} inputmode="text"></IonInput>
                    </IonItem>
              </div>
              
            }
          </div>

          <div id="spacer-buttons" />

          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shFixedIPSet ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShFixedIPSet(!shFixedIPSet)} />
              </div>
              <IonText >Fixed IP Settings</IonText>
            </div>
            {shFixedIPSet &&
              <div className='setting_wrapper'>
                <div className="flex-row mb-3">
                  <div>
                    <IonText id="wifi-text">IP Address</IonText>
                  </div>
                  <div className='rst-set-btns'>
                    <div>
                      <IonButton size="small" fill="outline" color='success' onClick={() => sendTxtCmd("RST_FIXED_IP")}>RST</IonButton>
                    </div>
                    <div>
                      <IonButton size="small" fill="outline" color='success' onClick={() => setFixedIP()}>
                        <IonIcon icon={checkmarkCircle} ></IonIcon>
                      </IonButton>
                    </div>
                  </div>
                </div>
                <IonItem>
                  <IonInput value={wifiSettings2_s.OWNIP} ref={ip_addr_ref} label='Set IP Adress' labelPlacement="floating" type='text' maxlength={15}></IonInput>
                </IonItem>
                <div className='mt-3 mb-3'>Subnet Mask</div>
                <IonItem>
                  <IonInput value={wifiSettings2_s.OWNMS} ref={ip_snm_ref} label='Set NMS' labelPlacement="floating" type='text' maxlength={15}></IonInput>
                </IonItem>
                <div className='mt-3 mb-3'>Gateway</div>
                <IonItem>
                  <IonInput value={wifiSettings2_s.OWNGW} ref={ip_gw_ref} label='Set Gateway' labelPlacement="floating" type='text' maxlength={15}></IonInput>
                </IonItem>
                <div className='mt-3 mb-3'>Gateway</div>
                <IonItem>
                  <IonInput value={wifiSettings2_s.OWNDNS} ref={ip_dns_ref} label='Set DNS' labelPlacement="floating" type='text' maxlength={15}></IonInput>
                </IonItem>
              </div>
            }
          </div>

          <div id="spacer-buttons" />
          {/*ext. UDP Settings with one toggle to switch on/off and a text input for the ip address*/}
          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shExtUdp ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShExtUdp(!shExtUdp)} />
              </div>
              <IonText >Ext. UDP Interface</IonText>
            </div>
            {shExtUdp && <>
              <div className='setting_wrapper'>
                <div className="flex-row mb-3">
                  <div>
                    <IonText id="wifi-text">UDP Dest. Addr.</IonText>
                  </div>
                  <div>
                    <IonButton size="small" fill="outline" color='success' onClick={() => setExtUdpIP()}>
                      <IonIcon icon={checkmarkCircle} ></IonIcon>
                    </IonButton>
                  </div>
                </div>
                <IonItem>
                  <IonInput value={wifiSettings2_s.EUDPIP} ref={ext_udp_ip_ref} label='Set UDP IP' labelPlacement="floating" type='text' maxlength={15}></IonInput>
                </IonItem>
                <IonItem>
                  <IonToggle enableOnOffLabels={true} checked={wifiSettings2_s.EUDP} onIonChange={(ev) => enableExtUDP(ev)}>Enable</IonToggle>
                </IonItem>
              </div>
            </>}
          </div>

          {/* Chat display pref (compact vs legacy message header) lives in the
              Advanced Settings section below now. "DM tab: show all traffic" moved
              to the DM tab's long-press menu ("Show others' DMs"). */}

          <div id="spacer-buttons" />
          {/* Data retention per category (days; 0 = unlimited) */}
          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shRetention ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShRetention(!shRetention)} />
              </div>
              <IonText >Data Retention (days, 0 = unlimited)</IonText>
            </div>
            {shRetention &&
              <div className='setting_wrapper'>
                <div className="flex-row mb-3">
                  <div><IonText id="wifi-text">Keep messages for … days</IonText></div>
                  <div>
                    <IonButton size="small" fill="outline" color='success' onClick={() => saveRetention()}>
                      <IonIcon icon={checkmarkCircle} ></IonIcon>
                    </IonButton>
                  </div>
                </div>
                <IonItem><IonInput value={retAll} ref={retAllRef} label='ALL / broadcast' labelPlacement="floating" type='number' inputmode="numeric"></IonInput></IonItem>
                <IonItem><IonInput value={retGroup} ref={retGroupRef} label='Talk groups (TGs)' labelPlacement="floating" type='number' inputmode="numeric"></IonInput></IonItem>
                <IonItem><IonInput value={retMyDM} ref={retMyDMRef} label='DMs: for me' labelPlacement="floating" type='number' inputmode="numeric"></IonInput></IonItem>
                <IonItem><IonInput value={retForeignDM} ref={retForeignDMRef} label='DMs: others' labelPlacement="floating" type='number' inputmode="numeric"></IonInput></IonItem>
                <IonItem><IonInput value={retPos} ref={retPosRef} label='Positions (map)' labelPlacement="floating" type='number' inputmode="numeric"></IonInput></IonItem>
                <IonItem><IonInput value={retMheard} ref={retMheardRef} label='Heard list' labelPlacement="floating" type='number' inputmode="numeric"></IonInput></IonItem>
              </div>
            }
          </div>

          <div id="spacer-buttons" />
          {/* Chat message block filter */}
          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shMsgFilter ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setShMsgFilter(!shMsgFilter)} />
              </div>
              <IonText >Message Filter</IonText>
            </div>
            {shMsgFilter &&
              <div className='setting_wrapper'>
                <div className="flex-row mb-3">
                  <div>
                    <IonText id="wifi-text">Filter Rules</IonText>
                  </div>
                  <div>
                    <IonButton size="small" fill="outline" color='success' onClick={() => saveMsgFilters()}>
                      <IonIcon icon={checkmarkCircle} ></IonIcon>
                    </IonButton>
                  </div>
                </div>
                <IonItem>
                  <IonToggle enableOnOffLabels={true} checked={filtersEnabled} onIonChange={(ev) => setFiltersEnabled(ev.detail.checked)}>Filter enabled</IonToggle>
                </IonItem>
                <div className='mt-3 mb-3'>Master switch — off shows everything (rules are kept, nothing is deleted).</div>
                <div className='mt-3 mb-3'><b>Sequence: Call → Allow → Deny</b></div>
                <div className='mt-3 mb-3'>Blocked callsigns (one per line, incl. SSID)</div>
                <IonItem>
                  <IonTextarea value={msgFilter_s.callRaw} ref={filterCallsRef} label='Callsigns' labelPlacement="floating" autoGrow={true} rows={3} placeholder='OE1ABC-2'></IonTextarea>
                </IonItem>
                <div className='mt-3 mb-3'>Deny — text patterns (one per line): Wort · ^Beginn · Ende$ · *Wild*card. Optional scope as the first word: <b>#262</b> = only that channel · <b>#!60</b> = all channels except 60 · <b>#262,ALL</b> = several.</div>
                <IonItem>
                  <IonTextarea value={msgFilter_s.textRaw} ref={filterTextRef} label='Deny text' labelPlacement="floating" autoGrow={true} rows={4} placeholder='^wetter'></IonTextarea>
                </IonItem>
                <div className='mt-3 mb-3'>Allow — whitelist (one per line). <b>Needs a #channel scope</b>: in that channel only matching messages are kept, and a match wins over Deny. e.g. <b>#60 *wetter*</b> = only weather in TG 60. Use <b>*</b> as the pattern to switch content filters OFF on distinct channels: <b>#60,ALL *</b> = TGs 60 and ALL only. A line without #scope is ignored; to switch filtering off entirely use the master toggle above.</div>
                <IonItem>
                  <IonTextarea value={msgFilter_s.allowRaw} ref={filterAllowRef} label='Allow text' labelPlacement="floating" autoGrow={true} rows={3} placeholder='#60 *wetter*'></IonTextarea>
                </IonItem>
                <div className='mt-3'>Applies to channel messages only. DMs and your own messages are never blocked.</div>
              </div>
            }
          </div>

          <div id="spacer-buttons" />

          <div className='dropdown_arrow'>
            <div className='dropdown_arrow_header'>
              <div id="advIcon">
                <IonIcon icon={shAdvSetting ? chevronDown : chevronForward} id="advIcon" color="primary" onClick={() => setshAdvSetting(!shAdvSetting)} />
              </div>
              <IonText >Advanced Settings</IonText>
            </div>
            {shAdvSetting ? <>
              <div id="spacer-advTop" />
              {/* compact (default, blue/solid) vs legacy multi-line message header */}
              <IonButton id="settings_button" fill={compactHeader ? 'solid' : 'outline'} slot='start' onClick={() => setCompactHeader(!compactHeader)}>{compactHeader ? "Message header: compact" : "Message header: legacy"}</IonButton>
              {/* Auto-resend: only DM parts of a SPLIT message, only within this app run,
                  three attempts at 5/15/40 min after the original send. Silent - the echo
                  folds into the original line ("resent #N"). Default on. */}
              <IonButton id="settings_button" fill={autoResendDM ? 'solid' : 'outline'} slot='start' onClick={() => setAutoResendDM(!autoResendDM)}>{autoResendDM ? "Auto-resend DM parts: on" : "Auto-resend DM parts: off"}</IonButton>
              <div id="spacer-advTop" />
              {/* monitoring mode: keep the screen lit so the WebView JS never pauses */}
              <IonItem>
                <IonToggle enableOnOffLabels={true} checked={keepScreenOn} onIonChange={(ev) => setKeepScreenOn(ev.detail.checked)}>Keep screen on</IonToggle>
              </IonItem>
              <div className='mt-3 mb-3'>Follow messages without interruption, and reliable notifications, while MeshCom is open. The screen stays lit — uses more battery.</div>
              <div id="spacer-advTop" />
              {/* split method for a message too long for one LoRa packet */}
              <IonButton id="settings_button" fill='solid' slot='start' onClick={() => setSplitMethod(splitMethod === 'balanced' ? 'greedy' : 'balanced')}>Split long messages: {splitMethod}</IonButton>
              <div className='mt-3 mb-3'>How a message too long for one packet is divided (same number of packets either way): <b>balanced</b> = even, shorter packets (better chance to get through); <b>greedy</b> = fill the first packet, keeping the start of the message together.</div>
              <div id="spacer-advTop" />
              <IonButton id="settings_button" fill='outline' slot='start' onClick={()=>deletePositions()}>Clear received nodes</IonButton>
              <div id="spacer-advTop" />
              <IonButton id="settings_button" fill='outline' slot='start' onClick={()=>DataBaseService.clearTextMessages()}>Clear Text Msgs</IonButton>
              <div id="spacer-advTop" />
              <IonButton id="settings_button" fill='outline' slot='start' onClick={()=>{MheardStaticStore.clearMheards(); DataBaseService.clearMheardsDB();}}>Clear Mheards</IonButton>
              <div id="spacer-advTop" />
              <IonButton id="settings_button" fill='outline' slot='start' onClick={()=>clearAllBLEPins_()}>Clear All BLE PINs</IonButton>

              <div id="spacer-advTop" />
              {/* raw node command console: send a "--xxx" like the web / serial CLI.
                  input + output get a light-grey background so they read as fields */}
              <IonItem style={{ '--background': '#f2f2f2' } as any}>
                <IonInput ref={cmdInputRef} label='Node command (--…)' labelPlacement="floating" placeholder="--pos 1"></IonInput>
              </IonItem>
              <div className="flex-row mb-3">
                <div>
                  <IonButton size="small" fill="solid" color='success' onClick={() => sendNodeCmd()}>Send</IonButton>
                </div>
                <div>
                  {cmdStatus === 'ok' && <IonIcon icon={checkmarkCircle} color="success" />}
                  {cmdStatus === 'waiting' && <IonText color="medium">…</IonText>}
                  {cmdStatus === 'timeout' && <IonText color="medium">no response</IonText>}
                </div>
              </div>
              {cmdRespShown !== "" &&
                <IonItem style={{ '--background': '#f2f2f2' } as any}>
                  {/* plain (no #wifi-text bold/large), same weight/size as the input */}
                  <IonText style={{ whiteSpace: 'pre-wrap', fontWeight: 'normal', fontSize: '1rem' }}>{cmdRespShown}</IonText>
                </IonItem>
              }

            </> : <></>}
            
          </div>
          <div id="setting_bottom"/>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Tab2;
