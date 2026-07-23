import { IonButton, IonActionSheet, IonContent, IonFooter, IonGrid, IonHeader, IonIcon, IonInput, IonItem, IonPage, IonText, IonTitle, IonToolbar, useIonViewDidEnter, useIonViewWillEnter, IonAlert, useIonViewWillLeave, IonButtons, IonModal, IonCheckbox, IonSegmentButton, IonLabel, IonSegment, IonTextarea, IonToast } from '@ionic/react';
import React,{ useEffect, useRef, useState, createRef } from 'react';
import {ConfType, MsgType, InfoData} from '../utils/AppInterfaces';
import {useBLE} from '../hooks/BleHandler';
import './Chat.css';
import { useStoreState } from 'pullstate';
import { DevIDStore } from '../store';
import { getConfigStore, getDevID, getMsgStore, getPlatformStore } from '../store/Selectors';
import MsgStore from '../store/MsgStore';
import ConfigStore from '../store/ConfStore';
import { checkmark, cloudDoneOutline, cloudOutline, caretForwardCircle, settings, notificationsOutline, eyeOutline} from 'ionicons/icons';
import { LocalNotifications } from '@capacitor/local-notifications';
import PlatformStore from '../store/PlatformStore';
import { Keyboard } from '@capacitor/keyboard';
import { Clipboard } from '@capacitor/clipboard';
import type { OverlayEventDetail } from '@ionic/core';
import AppActiveState  from '../store/AppActive';
import {MsgTxtLink} from '../components/MsgTxtLink';
import ConfigObject from '../utils/ConfigObject';
import BLEconnStore from '../store/BLEconnected';
import {getBLEconnStore} from '../store/Selectors';
import DMfrmMapStore from '../store/DMfrmMap';
import NotifyMsgState from '../store/NotifyMsg';
import MsgFilterStore from '../store/MsgFilterStore';
import AppPrefsStore from '../store/AppPrefsStore';
import { parseTGset, alertsForMsg, msgDiscarded } from '../utils/NotifyPrefs';
import { useHistory } from "react-router";
import LogS from '../utils/LogService';
import DatabaseService from '../DBservices/DataBaseService';
import { set } from 'date-fns';
import AlertCard from '../components/AlertCard';
import NodeInfoStore from '../store/NodeInfoStore';


const Tab3: React.FC = () => {


  const MAX_CHAR_TEXTINPUT = 150;
  const MAX_CHAR_CALLSIGN = 11;
  const MIN_CHAR_CALLSIGN = 1;


  const {sendDV, updateDevID, sendTxtCmdNode} = useBLE();


  // devid from store
  const devID_s = useStoreState(DevIDStore, getDevID);
  
  // msgs from store
  const msgArr_s:MsgType[] = useStoreState(MsgStore, getMsgStore);

  // get config for node callsign. need to know if the message in store is ours
  const config_s:ConfType = useStoreState(ConfigStore, getConfigStore);

  // get current AppState
  const isAppActive = AppActiveState.useState(s => s.active);

  // BLE connected from store
  const ble_connected:boolean = useStoreState(BLEconnStore, getBLEconnStore);

  // reference to text input field
  const textInputRef = useRef<HTMLIonInputElement>(null);

  // reference to the textarea input field
  const textAreaInputRef = useRef<HTMLIonTextareaElement>(null);

  // get platform info
  const thisPlatform = useStoreState(PlatformStore, getPlatformStore);

  // store notifypermission
  const canNotify = useRef<boolean>(false);

  // flag we got a new message to fire notification - has full new message object
  const notifyMsg_s = useStoreState(NotifyMsgState, s => s.notifyMsg);

  // state to show callsign on DMs at Textinput
  const [shCallsign, setShCallsign] = useState<boolean>(false);
  // inputref for to callsign
  const callsignInputRef = useRef<HTMLIonInputElement>(null);
  // remember last dm to callsign
  const toCallsign_ = useRef<string>("");
  // last callsign when DM segment was active
  const lastDMcallsign = useRef<string>("");

  // longpress event: the menu now opens WHILE the finger is held (native
  // long-press feel), so this can be shorter than the old release-based value.
  const MIN_PRESS_TIME = 500; //ms
  //actionsheet
  const [isOpenAS, setIsOpenAS] = useState(false);
  // message number from long press event
  const [msgNrAS, setMsgNrAS] = useState<number>();

  // handle keyboard events and place chat accordingly
  const [chatBoxPadding, setchatBoxPadding] = useState("3px");

  // remember that keyboard is already open on rerenders
  const keyBopen = useRef<boolean>(false);

  // reference to bottom of chat
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // DM callsign trigger from Map
  const dmFrmMap_ = DMfrmMapStore.useState(s => s.dmfDMfrmMap);

  // stores the last timestamp of a message in chat to insert date panel
  const lastMsgTime = useRef<number>(Date.now());

  // alert card params
  const [shDiscoCard, setShDiscoCard] = useState<boolean>(false);

  //const navigation = useIonRouter();
  const history = useHistory();

  // remember if this page is active
  const thisPageActive = useRef<boolean>(false);

  // alertcard handling
  const [shAlertCard, setShAlertCard] = useState<boolean>(false);
  const [alHeader, setAlHeader] = useState<string>("");
  const [alMsg, setAlMsg] = useState<string>("");

  // Nodeinfostore to get the groups subscribed on the node
  const nodeInfo_s:InfoData = useStoreState(NodeInfoStore, s => s.infoData);
  // current block-filter rules (raw lines), for quick-filter from the action sheet
  const msgFilter_s = useStoreState(MsgFilterStore, s => s);
  // compact one-line message header vs legacy multi-line
  const compactHeader = useStoreState(AppPrefsStore, s => s.compactHeader);

  // per-scope notification ("alert = beeps") + discard (hide) state, for the tab
  // bell/eye icons, dimming and the menu
  const alertAll = useStoreState(AppPrefsStore, s => s.alertAll);
  const alertTGs = useStoreState(AppPrefsStore, s => s.alertTGs);
  const dmAlert = useStoreState(AppPrefsStore, s => s.dmAlert);
  const discardAll = useStoreState(AppPrefsStore, s => s.discardAll);
  const discardTGs = useStoreState(AppPrefsStore, s => s.discardTGs);
  const dmShowAll = useStoreState(AppPrefsStore, s => s.dmShowAll);
  // is the bell (notifications) on for a given tab value ("ALL" | "DM" | "<TG>")
  const tabBellOn = (val: string): boolean => {
    if (val === "ALL") return alertAll;
    if (val === "DM") return dmAlert !== "none";
    const tg = parseInt(val);
    return !isNaN(tg) && parseTGset(alertTGs).has(tg);
  };
  // is the tab discarded (hidden)? DM is never fully discarded (only "not-for-me")
  const tabDiscarded = (val: string): boolean => {
    if (val === "ALL") return discardAll;
    if (val === "DM") return false;
    const tg = parseInt(val);
    return !isNaN(tg) && parseTGset(discardTGs).has(tg);
  };

  // Segment chat filter state
  const [segmentFilter, setSegmentFilter] = useState<string>("ALL");

  // long-press on a channel tab -> mute/unmute menu (Etappe 1). Refs like the
  // message long-press; a finger move cancels it (the segment bar is scrollable).
  const [tabMenuOpen, setTabMenuOpen] = useState<boolean>(false);
  const [tabMenuFor, setTabMenuFor] = useState<string>("");
  const tabPressX = useRef<number>(0);
  const tabPressY = useRef<number>(0);
  const tabPressMoved = useRef<boolean>(false);
  const tabPressTimer = useRef<any>(null);

  const handleTabPress = (e: any, val: string) => {
    tabPressMoved.current = false;
    const t = e?.touches?.[0];
    if (t) { tabPressX.current = t.clientX; tabPressY.current = t.clientY; }
    if (tabPressTimer.current) clearTimeout(tabPressTimer.current);
    tabPressTimer.current = setTimeout(() => {
      tabPressTimer.current = null;
      if (tabPressMoved.current) return; // was a scroll of the tab bar
      setTabMenuFor(val);
      setTabMenuOpen(true);
    }, 500);
  };
  const handleTabMove = (e: any) => {
    const t = e?.touches?.[0];
    if (!t) return;
    if (Math.abs(t.clientX - tabPressX.current) > 10 || Math.abs(t.clientY - tabPressY.current) > 10) {
      tabPressMoved.current = true;
      if (tabPressTimer.current) { clearTimeout(tabPressTimer.current); tabPressTimer.current = null; }
    }
  };
  const handleTabRelease = () => {
    if (tabPressTimer.current) { clearTimeout(tabPressTimer.current); tabPressTimer.current = null; }
  };

  // toggle notifications (mute) for the ALL / a TG tab. DM uses setDmAlertPref.
  const toggleTabMute = async (val: string) => {
    const s = AppPrefsStore.getRawState();
    if (val === "ALL") {
      const nv = !s.alertAll;
      AppPrefsStore.update(x => { x.alertAll = nv; });
      await DatabaseService.setPref('alertAll', nv ? '1' : '0');
    } else {
      const tg = parseInt(val);
      if (isNaN(tg)) return;
      const set = parseTGset(s.alertTGs);
      if (set.has(tg)) set.delete(tg); else set.add(tg);
      const csv = Array.from(set).join(",");
      AppPrefsStore.update(x => { x.alertTGs = csv; });
      await DatabaseService.setPref('alertTGs', csv);
    }
  };

  // toggle discard (hide messages) for the ALL / a TG tab, then refresh the view
  const toggleTabDiscard = async (val: string) => {
    const s = AppPrefsStore.getRawState();
    if (val === "ALL") {
      const nv = !s.discardAll;
      AppPrefsStore.update(x => { x.discardAll = nv; });
      await DatabaseService.setPref('discardAll', nv ? '1' : '0');
    } else {
      const tg = parseInt(val);
      if (isNaN(tg)) return;
      const set = parseTGset(s.discardTGs);
      if (set.has(tg)) set.delete(tg); else set.add(tg);
      const csv = Array.from(set).join(",");
      AppPrefsStore.update(x => { x.discardTGs = csv; });
      await DatabaseService.setPref('discardTGs', csv);
    }
    await DatabaseService.reapplyChatFilters();
  };

  // DM notifications tri-state: "none" | "mine" | "all"
  const setDmAlertPref = async (level: string) => {
    AppPrefsStore.update(x => { x.dmAlert = level; });
    await DatabaseService.setPref('dmAlert', level);
  };

  // DM "discard not-for-me": show/hide overheard foreign DMs (monitoring)
  const toggleDmShowAll = async () => {
    const nv = !AppPrefsStore.getRawState().dmShowAll;
    AppPrefsStore.update(x => { x.dmShowAll = nv; });
    await DatabaseService.setPref('dmShowAll', nv ? '1' : '0');
    await DatabaseService.reapplyChatFilters();
  };

  // a readable header for the tab menu
  const tabMenuHeader = (val: string): string => {
    if (val === "ALL") return "All / Public";
    if (val === "DM") return "Direct messages";
    return "TG " + val;
  };

  // buttons for the tab menu, depending on the tab. DM has the notification
  // tri-state (none / mine / all) + the "show others' DMs" monitoring toggle;
  // ALL and talk groups have mute + discard.
  const tabMenuButtons = (): any[] => {
    const val = tabMenuFor;
    if (val === "DM") {
      const mark = (lvl: string) => (dmAlert === lvl ? "✓ " : "");
      return [
        { text: mark("none") + "Notify: none", handler: () => { setDmAlertPref("none"); } },
        { text: mark("mine") + "Notify: my DMs only", handler: () => { setDmAlertPref("mine"); } },
        { text: mark("all") + "Notify: all DMs", handler: () => { setDmAlertPref("all"); } },
        { text: dmShowAll ? "Hide others' DMs" : "Show others' DMs (monitor)", handler: () => { toggleDmShowAll(); } },
        { text: "Cancel", role: "cancel" }
      ];
    }
    return [
      { text: tabBellOn(val) ? "Mute notifications" : "Enable notifications", handler: () => { toggleTabMute(val); } },
      { text: tabDiscarded(val) ? "Show messages" : "Hide messages (discard)", handler: () => { toggleTabDiscard(val); } },
      { text: "Cancel", role: "cancel" }
    ];
  };

  // render one segment tab: tap selects it, long-press opens the tab menu. Markers
  // (bell = beeps, eye = DM monitoring) sit in reserved padding inside the label
  // and are absolutely centered via inline styles, so they can't shift the label
  // height (class-based positioning didn't apply reliably through the shadow DOM).
  const markStyle = (side: "left" | "right"): any => ({
    position: "absolute", [side]: 0, top: "50%", transform: "translateY(-50%)",
    fontSize: "0.7em", opacity: 0.85
  });
  const renderTab = (val: string, label: string, isGroup: boolean) => {
    const bell = tabBellOn(val);
    const eye = val === "DM" && dmShowAll;
    return (
      <IonSegmentButton key={val} value={val} id={val}
        className={tabDiscarded(val) ? 'tab-dimmed' : undefined}
        onClick={() => handleSegmentChange(val, isGroup)}
        onTouchStart={(e) => handleTabPress(e, val)}
        onTouchMove={handleTabMove}
        onTouchEnd={handleTabRelease}>
        <IonLabel>
          <span style={{ position: "relative", display: "inline-block",
                         paddingRight: bell ? "0.95em" : undefined,
                         paddingLeft: eye ? "0.95em" : undefined }}>
            {label}
            {bell && <IonIcon icon={notificationsOutline} style={markStyle("right")} />}
            {eye && <IonIcon icon={eyeOutline} style={markStyle("left")} />}
          </span>
        </IonLabel>
      </IonSegmentButton>
    );
  };

  // one-time onboarding hint about the long-press gesture
  const [shTabHint, setShTabHint] = useState<boolean>(false);
  useEffect(() => {
    if (!AppPrefsStore.getRawState().tabHintSeen) {
      setShTabHint(true);
      AppPrefsStore.update(x => { x.tabHintSeen = true; });
      DatabaseService.setPref('tabHintSeen', '1');
    }
  }, []);

  // Flag that we send an DM. This should be active when we are in DM segment and in a group segment
  const [sendDMGrpFlag, setSendDMGrpFlag] = useState<boolean>(false);




  // Tasks we do when we entered the screen.
  useIonViewDidEnter (()=>{
    LogS.log(0,"Chat window did enter");
    thisPageActive.current = true;
    // set the bottom reference
    if(bottomRef.current === null) bottomRef.current = document.getElementById('bottomRefID') as HTMLDivElement;

    // check if we have segmentbuttons to set from initialChatSegmentMarkers
    const initSegs: string[] = ConfigObject.getInitChatSegmentMarkers();
    if(initSegs.length > 0){
      initSegs.forEach(seg => {
        // discarded channels get no green indicator (mute keeps it, discard hides it)
        if(seg !== segmentFilter && !tabDiscarded(seg)){
          const Seqgmentbutton = document.getElementById(seg) as HTMLIonSegmentButtonElement;
          if(Seqgmentbutton){
            Seqgmentbutton.classList.add('segmentbutton_green');
          }
        }
      });
      ConfigObject.clearInitChatSegmentMarkers();
    }

    //const devid = devID_s;
    //updateDevID(devid);
    scrollToBottom();
  });


  // do everything we need to do before entering the screen
  useIonViewWillEnter(()=>{
    // on android we need to create a channel to play custom sound
    if(thisPlatform){
      console.log("Platform at chat: " + thisPlatform);
      hasNotifyPermission();
    }

  });

  // remember that we left the page
  useIonViewWillLeave(()=>{
    thisPageActive.current = false;
  });


  // actions when app goes or comes from background
  useEffect(() => {
    LogS.log(0,"Chat - App active: " + isAppActive);
    // update BLE Hook
    LogS.log(0,"Chat - BLE Connected: " + ble_connected);
    console.log("Chat - BLE DevID: " + devID_s);
    // scroll down if Chat screen gets active again
    if (isAppActive) {

      scrollToBottom();
    } 
  }, [isAppActive]);


  // show discocard if BLE disconnects
  useEffect(() => {
    if(!ble_connected && thisPageActive.current){
      setShDiscoCard(true);
    }
  }, [ble_connected]);



  // always show last message in chat
  const scrollToBottom= async () => {
    if(bottomRef.current === null)
    bottomRef.current = document.getElementById('bottomRefID') as HTMLDivElement;
    if (bottomRef.current) {
      for (let i = 0; i < 3; i++) {
        await new Promise(r => setTimeout(r, 200));
        if (bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }

  

  // sending a textmessage
  // encode + send a fully assembled on-air message string ("{TOCALL}text" for
  // DMs, plain text for channel) to the node. Returns true on success.
  // Shared by sendMsg (normal send) and the direct Resend action.
  const sendFinalMessage = async (final_msg_str: string): Promise<boolean> => {

    LogS.log(0, "CHAT SendMsg: " + final_msg_str);

    const txt_enc = new TextEncoder(); // always utf-8
    const enc_txt_msg = txt_enc.encode(final_msg_str);
    const txt_len = enc_txt_msg.length;
    if (txt_len === 0) return false;

    const txt_buffer = new ArrayBuffer(txt_len + 2);
    const view1 = new DataView(txt_buffer);
    view1.setUint8(0, txt_len + 2);
    view1.setUint8(1, 0xA0);

    for (let i = 0; i < txt_len; i++)
      view1.setUint8(i + 2, enc_txt_msg[i]);

    try {
      await sendDV(view1, ConfigObject.getBleDevId());
    } catch (error) {
      LogS.log(1, "CHAT - Error sending message to node: " + error);
      setAlHeader("Error sending message");
      setAlMsg("Error sending message to node: " + error);
      setShAlertCard(true);
      return false;
    }
    return true;
  };


  const sendMsg = async () => {

    if(!ble_connected){
      console.log("BLE not connected");
      setShDiscoCard(true);
      return;
    }
    console.log("Sending Message");
    console.log("shCallsign: " + shCallsign);
    console.log("sendDMGrpFlag: " + sendDMGrpFlag);
    let isDM = false;
    let toCallsign_str_u = "";

    // only active when we are in the DM segment
    if (shCallsign) {
      // check if we have a DM and remember callsign. we only send the DM when the DM button is active
      if (callsignInputRef !== null) {

        const toCallsign_ref = callsignInputRef.current!.value;

        if (toCallsign_ref !== null) {

          if (toCallsign_ref) {

            let toCallsign_str = toCallsign_ref.toString();
            toCallsign_str = toCallsign_str.trim();

            console.log("ToCall: " + toCallsign_str);

            if (toCallsign_str.length >= MIN_CHAR_CALLSIGN) {

              toCallsign_str_u = toCallsign_str.toUpperCase();
              toCallsign_.current = toCallsign_str_u;
              lastDMcallsign.current = toCallsign_str_u;
              isDM = true;

              console.log("To Callsign: " + toCallsign_str_u);
              console.log("isDM: " + isDM);
            }
          }
        }
      }
    }

    // sending of group message when in group segment as DM
    if(sendDMGrpFlag){
      isDM = true;
      toCallsign_str_u = toCallsign_.current;
      console.log("Group Message to Group: " + toCallsign_str_u);
    }
    

    if(textAreaInputRef !== null){
      
      const txMsg = textAreaInputRef.current!.value;

      if(txMsg){

        if(txMsg !== null ){

          let txMsg_str = txMsg.toString();

          let final_msg_str = "";

          if(txMsg_str.length > 0){

            //console.log("DM Message state: " + shCallsign);
            if(isDM){
              final_msg_str = "{" + toCallsign_str_u + "}" + txMsg_str;
            } else {
              final_msg_str = txMsg_str;
            }

            const sent_ok = await sendFinalMessage(final_msg_str);
            if (!sent_ok) return;

            // clear input
            textAreaInputRef.current!.value = "";

            // close keyboard
            Keyboard.hide();

          }
        }
      }
    }
  }



  // run once at mount - setup listeners and handle CSS id change of chatbox
  useEffect(() => {
    // check if keyboard hides
    Keyboard.addListener('keyboardDidHide', () => {

      console.log('keyboard did hide');
      const newPading = "3px";
      console.log("new Padding: " + newPading)
      setchatBoxPadding(newPading);
      scrollToBottom();
      keyBopen.current = false;
    });

    Keyboard.addListener('keyboardDidShow', info => {

      console.log('keyboard open with height:', info.keyboardHeight);
      console.log("Keybopen: " + keyBopen.current);

      if (!keyBopen.current) {
        
        keyBopen.current = true;
        let newPading = info.keyboardHeight;

        if (shCallsign) newPading = newPading + 50;
        const newPadding_str = newPading + "px";
        console.log("new Padding: " + newPadding_str);
        setchatBoxPadding(newPadding_str);

        scrollToBottom();
        const newPading1 = "3px";
        setchatBoxPadding(newPading1);
      }
    });
    LogS.log(0,"Chat - Mounted Page");
  }, []);




  // check if we have permission for notifications
  const hasNotifyPermission = async () => {

    if((await LocalNotifications.checkPermissions()).display === 'granted'){
      console.log("Local Notification are granted");
      canNotify.current = true;

      //create a channel for notify on adroid
      if (thisPlatform === "android") {
        await LocalNotifications.createChannel({
          id: '1',
          name: 'channel1',
          importance: 4,
          visibility: 1,
          vibration: true,
          sound: 'morse_r.wav'
        });
        // sound: "android.resource://io.ionic.meshcom/raw/morse_r.wav"
        const channels = await LocalNotifications.listChannels();
        console.log("Channels:");
        for (let ch of channels.channels) {
          console.log("id: " + ch.id);
          console.log("importance " + ch.importance);
          console.log("sound " + ch.sound);
          console.log("visibility " + ch.visibility);
        }
      }
    } else {
      // TODO action when no permission for notifies is set
      console.log("No Notify Permission set!");
      
    }
  }


  // scroll to bottom if new message arrives
  useEffect(() => {

    if (msgArr_s && msgArr_s.length > 0) {
      console.log("Chat - New Message Arrived");          

      scrollToBottom();
    }

  }, [msgArr_s]);


  // Trigger that we fire a notification on new message
  useEffect(() => {
    console.log("CHAT - New Message to Notify: ");
    console.log(notifyMsg_s);
    const notify_title = "New Message from " + notifyMsg_s.fromCall;
    // beep only if this scope's notifications are on (mute); discarded -> never
    if (alertsForMsg(notifyMsg_s, config_s.callSign)) {
      notifyMsgUser(notify_title, notifyMsg_s.msgTXT);
    }

    // if a message arrives in another segment than the current one set the background color class to indicate new message
    // (skip when the channel is discarded: mute keeps the green marker, discard hides it)
    if (notifyMsg_s.isDM !== undefined && notifyMsg_s.isGrpMsg !== undefined && !msgDiscarded(notifyMsg_s, config_s.callSign)) {

      let msgType = "ALL";

      if (notifyMsg_s.isDM === 0 && notifyMsg_s.isGrpMsg === 0) {
        msgType = "ALL";
      }
      else if (notifyMsg_s.isDM === 1 && notifyMsg_s.isGrpMsg === 0) {
        msgType = "DM";
      }
      else if (notifyMsg_s.isGrpMsg === 1 && notifyMsg_s.isDM === 1) {
        msgType = notifyMsg_s.grpNum.toString();
      }

      console.log("Message Type: " + msgType);

      if (msgType !== segmentFilter) {
        const Seqgmentbutton = document.getElementById(msgType) as HTMLIonSegmentButtonElement;
        if (Seqgmentbutton) {
          Seqgmentbutton.classList.add('segmentbutton_green');
        }
      }
    }

  }, [notifyMsg_s.msgNr]);


  // local notification method
  const notifyMsgUser = async (title_:string, body_:string) => {
    if(canNotify.current === true){
      if(thisPlatform === "ios"){
        LocalNotifications.schedule({
          notifications: [
            {
              title:title_,
              body: body_,
              id: Math.floor(Math.random() * 600000),
              schedule: {
                at: new Date(Date.now() + 1000 * 1), // in 1 secs
                repeats: false
              },
              sound:''
            }]
        });
      }

      if(thisPlatform === "android"){
        LocalNotifications.schedule({
          notifications: [
            {
              title: title_,
              body: body_,
              id: Math.floor(Math.random() * 600000),
              schedule: {
                at: new Date(Date.now() + 1000 * 1), // in 1 secs
                repeats: false
              },
              channelId: '1',
              smallIcon: 'res://drawable/meshcom_logo_32x32_transp_gray',
              largeIcon: 'res://drawable/meshcom_logo_64x64',
              sound: 'morse_r.wav'
            }]
        });
      }
    }
  }


  // switch message type - own - own/dm - other
  const msgType = (msg_:MsgType) =>{

    if(msg_.fromCall === config_s.callSign) return "own-message";

    if(msg_.fromCall !== config_s.callSign) {
      if(msg_.isDM) {
        return "dm-message"
      } else {
        return "other-message"
      }
    }
  }


  // handle the Direct Message Button from the map
  useEffect(() => {
    if(dmFrmMap_.shDMfrmMap){
      console.log("Chat - DM from Map to Call: " + dmFrmMap_.dmCallMap);
      toCallsign_.current = dmFrmMap_.dmCallMap;
      setShCallsign(true);
      DMfrmMapStore.update(s => {
        s.dmfDMfrmMap.shDMfrmMap = false;
      });
    }
  }, [dmFrmMap_]);



  // Long-press / tap detection on messages. Refs (not a re-created `let`) survive
  // re-renders. The action sheet opens on a TIMER while the finger is still held
  // (like a native long-press), instead of waiting for release - the old
  // release-based feel was confusing (nothing happened until you let go). A
  // finger move cancels the gesture so scrolling never fires the context menu.
  const PRESS_MOVE_THRESHOLD = 10; // px
  const pressStartX = useRef<number>(0);
  const pressStartY = useRef<number>(0);
  const pressMoved = useRef<boolean>(false);
  const pressTimer = useRef<any>(null);

  const clearPressTimer = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  const handleButtonPress = (e: any, msgNr: number) => {
    pressMoved.current = false;
    const t = e?.touches?.[0];
    if (t) { pressStartX.current = t.clientX; pressStartY.current = t.clientY; }
    clearPressTimer();
    // open the menu mid-hold; move/end cancels it before it fires
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      if (pressMoved.current) return; // scrolling, not a press
      setMsgNrAS(msgNr);
      setIsOpenAS(true);
    }, MIN_PRESS_TIME);
  }

  // a movement beyond the threshold means the user is scrolling, not pressing
  const handleButtonMove = (e: any) => {
    const t = e?.touches?.[0];
    if (!t) return;
    if (Math.abs(t.clientX - pressStartX.current) > PRESS_MOVE_THRESHOLD ||
        Math.abs(t.clientY - pressStartY.current) > PRESS_MOVE_THRESHOLD) {
      pressMoved.current = true;
      clearPressTimer();
    }
  }

  // release: if the long-press timer already fired, the menu is open - do nothing.
  // Otherwise it was a short tap (cancel the pending timer and treat as tap).
  const handleButtonRelease = (msgNr: number) => {
    const longPressFired = pressTimer.current === null;
    clearPressTimer();
    if (pressMoved.current) return; // was a scroll, not a press
    if (longPressFired) return;     // long press already handled while holding

    // short press/tap on a DM -> prefill To-Callsign with the conversation partner
    // (their call if they wrote it; the recipient if I wrote it)
    const m = msgArr_s.find(x => x.msgNr === msgNr);
    if (m && m.isDM === 1 && m.isGrpMsg !== 1) {
      const partner = m.fromCall === config_s.callSign ? m.toCall : m.fromCall;
      if (partner) {
        toCallsign_.current = partner;
        lastDMcallsign.current = partner;
        setShCallsign(true);
        if (callsignInputRef.current) callsignInputRef.current.value = partner;
      }
    }
  }



  // handle actionsheet result copy text / send DM for specific message
  // exact pattern that "Filter Message" stores for a message text (^...$).
  // Newlines are replaced by the wildcard "*" so a multi-line message stays a
  // single-line filter rule (the rule list / Settings textarea is line-based).
  const messagePattern = (msgTxt: string): string =>
    "^" + (msgTxt || "").trim().replace(/\r?\n/g, "*") + "$";

  // "via" path with the leading origin dropped: via_str[0] is always the sender
  // (== fromCall, shown separately), so "via: SENDER > A > B" is redundant -
  // show only the intermediate hops "A > B".
  const viaRelays = (via: string, fromCall: string): string => {
    const parts = via.split(" > ").map(p => p.trim()).filter(p => p !== "");
    if (parts.length > 0 && parts[0].toUpperCase() === (fromCall || "").toUpperCase()) {
      parts.shift();
    }
    return parts.join(" > ");
  };

  // reply time reference "[HH:MM] " from a message's msgTime ("HH:MM:SS")
  const timeRef = (msgTime: string): string => {
    const t = (msgTime || "").slice(0, 5);
    return t ? "[" + t + "] " : "";
  };

  // append a line to a newline-separated rule list (dedup); returns new raw text
  const appendFilterLine = (raw: string, line: string): string => {
    const val = (line || "").trim();
    if (val === "") return raw;
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
    if (lines.includes(val)) return raw;
    lines.push(val);
    return lines.join("\n");
  };

  const handleActionSheet = async (detailAS: OverlayEventDetail) => {

    console.log("AS Detail: ");
    console.log(detailAS);

    if (detailAS.data) {

      const asActionDetail = detailAS.data.action;
      const selMsg = msgArr_s.filter(msgs => msgs.msgNr === msgNrAS);
      console.log(asActionDetail);

      if (asActionDetail === "copy") {
        console.log("Copy pressed");
        const copyTxt = selMsg[0].msgTXT;
        console.log(copyTxt);
        writeToClipboard(copyTxt);
      }

      if (asActionDetail === "resend") {
        console.log("Resend pressed");
        const m = selMsg[0];
        if (m) {
          if (!ble_connected) {
            setShDiscoCard(true);
          } else {
            // rebuild the on-air string ({TOCALL} prefix for DMs) and send
            // directly, without copying into the input / extra confirmation
            const final_msg_str = m.isDM === 1 ? "{" + m.toCall + "}" + m.msgTXT : m.msgTXT;
            await sendFinalMessage(final_msg_str);
          }
        }
      }

      if (asActionDetail === "reply") {
        console.log("Reply pressed");
        const m = selMsg[0];
        if (textAreaInputRef.current && m) {
          const existing = textAreaInputRef.current.value?.toString() ?? "";
          const isDMmsg = m.isDM === 1 && m.isGrpMsg !== 1;
          if (isDMmsg || m.fromCall === config_s.callSign) {
            // own message, or a DM (single partner): reference by time only, no
            // @self / no mention list. Don't stack the SAME timestamp twice
            // (double-tapping one message adds no benefit); a different time is
            // fine as a real multi-reference.
            const ref = timeRef(m.msgTime);
            if (ref && !existing.startsWith(ref)) {
              textAreaInputRef.current.value = ref + existing;
            }
          } else {
            // others' message: build/extend an "@call1, @call2: " mention list (dedup).
            // A SINGLE reference keeps the message's time ("@call: [HH:MM] "); as
            // soon as 2+ people are referenced the time is dropped (one shared
            // timestamp across time-distinct messages is meaningless).
            const mention = "@" + m.fromCall;
            const mm = existing.match(/^((?:@[^\s,:]+)(?:, @[^\s,:]+)*): (.*)$/s);
            if (mm) {
              const mentions = mm[1].split(", ");
              if (!mentions.includes(mention)) mentions.push(mention);
              let body = mm[2];
              if (mentions.length >= 2) body = body.replace(/^\[\d{1,2}:\d{2}\] /, ""); // drop the single-ref time
              textAreaInputRef.current.value = mentions.join(", ") + ": " + body;
            } else {
              textAreaInputRef.current.value = mention + ": " + timeRef(m.msgTime) + existing;
            }
          }
          textAreaInputRef.current.setFocus();
        }
      }

      if (asActionDetail === "filterCall") {
        // add the sender's callsign to the block list (dedup); message hides at once.
        // removal is done in Settings - a hidden message can't be long-pressed.
        const newCallRaw = appendFilterLine(msgFilter_s.callRaw, selMsg[0].fromCall);
        await DatabaseService.saveMsgFilters(newCallRaw, msgFilter_s.textRaw);
      }

      if (asActionDetail === "filterMessage") {
        // add an exact "^message$" text rule (refine later in Settings, e.g. "Test *")
        const pat = messagePattern(selMsg[0].msgTXT);
        const newTextRaw = appendFilterLine(msgFilter_s.textRaw, pat);
        await DatabaseService.saveMsgFilters(msgFilter_s.callRaw, newTextRaw);
      }

      if (asActionDetail === "replyTo") {
        console.log("Reply To pressed");
        const replyToCall = selMsg[0].fromCall;
        toCallsign_.current = replyToCall;
        lastDMcallsign.current = replyToCall;
        setShCallsign(true);
        if (callsignInputRef.current) {
          callsignInputRef.current.value = replyToCall;
        }
        // DM: recipient is clear, so only reference which message by time
        // (don't stack the same timestamp twice on repeated taps)
        if (textAreaInputRef.current) {
          const existing = textAreaInputRef.current.value?.toString() ?? "";
          const ref = timeRef(selMsg[0].msgTime);
          if (ref && !existing.startsWith(ref)) {
            textAreaInputRef.current.value = ref + existing;
          }
        }
      }

      if (asActionDetail === "sendDM") {
        console.log("DM pressed");
        let selCall = "";

        if(selMsg[0].fromCall === config_s.callSign){
          selCall = selMsg[0].toCall;
        } else {
          selCall = selMsg[0].fromCall;
        }
        
        console.log("DM to Callsign: " + selCall);
        toCallsign_.current = selCall;
        lastDMcallsign.current = selCall;
        setIsOpenAS(false);

        if(segmentFilter !== "DM"){
          handleSegmentChange("DM", false);
        }

        setShCallsign(true);
        
      }
    }
    setIsOpenAS(false);
  }
  


  // write to clipboard - msg text copy
  const writeToClipboard = async (copytext:string) => {
    await Clipboard.write({
      string: copytext
    });
  };



  // handle dm to callsign input
  const handleInput = (ev:Event) =>{

    let inp = '';
    const target = ev.target as HTMLIonInputElement;
    if (target) inp = target.value!.toString();

    console.log("Input: " + inp);
    toCallsign_.current = inp;
  }


  // check if timestamps of two text messages have midnight in between to show date
  const checkMidnight = (msg:MsgType) => {

    const day_msg = new Date(msg.timestamp);
    const day_last = new Date(lastMsgTime.current);

    if(day_msg.getDate() !== day_last.getDate()){
      lastMsgTime.current = msg.timestamp;
      return true;
    } else {
      return false;
    }
  }


  // return the date panel
  const getLocalDate = (msg:MsgType) : string => {
    const localDateString:string = new Date(msg.timestamp).toLocaleDateString();
    return localDateString;
  }


  // redirect to connect page if unset node
  const redirectConnect = () => {
    setShDiscoCard(false);
    if (isAppActive)
      history.push("/connect");
  }


  // handle no Db connection in offline mode - no node connected
  const handleNoDbConnFilter = () => {
    setAlHeader("No Database Connection");
    setAlMsg("Filtering is only available if a node is connected!");
    setShAlertCard(true);
  }


  const modalDidDismiss = () => {
    scrollToBottom();
  }

  // CHAT FIlterING with Segment Buttons
  // handle the Seqgmentbutton for chat filtering and set filtering in the database-service
  const handleSegmentChange = (val: string, isGrp: boolean) => {
    console.log("Chat Filter Change to: " + val);
    setSegmentFilter(val);

    DatabaseService.setChatFilters(val);

    // if we are in ALL segment close the to callsign input field and reset DM flag
    if (val === "ALL") {
      setShCallsign(false);
      setSendDMGrpFlag(false);
    }

    // show the to callsign input only if we are in DM segment
    if (val === "DM") {
      // remember the last DM callsign
      toCallsign_.current = lastDMcallsign.current;
      setShCallsign(true);
    } else {
      setShCallsign(false);
    }

    // if we are in a group segment set the DM flag and set the destination call to the group number
    if (isGrp) {
      setSendDMGrpFlag(true);
      toCallsign_.current = val;
    } else {
      setSendDMGrpFlag(false);
    }

    // remove the green background class from the segment button as we are now in this segment
    const Seqgmentbutton = document.getElementById(val) as HTMLIonSegmentButtonElement;
    if(Seqgmentbutton){
      Seqgmentbutton.classList.remove('segmentbutton_green');
    }
  }
  


  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
            <IonSegment value={segmentFilter} scrollable={true} swipeGesture={false}>
              {renderTab("ALL", "All", false)}
              {renderTab("DM", "DM", false)}
              {[nodeInfo_s.GCB0, nodeInfo_s.GCB1, nodeInfo_s.GCB2, nodeInfo_s.GCB3, nodeInfo_s.GCB4, nodeInfo_s.GCB5]
                .filter(g => g !== 0)
                .map(g => renderTab(g.toString(), g.toString(), true))}
            </IonSegment>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">

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

        <AlertCard
          isOpen={shAlertCard}
          header={alHeader}
          message={alMsg}
          onDismiss={() => setShAlertCard(false)}
        />        

        <IonActionSheet
          isOpen={isOpenAS}
          buttons={[
            ...(segmentFilter !== "DM" || msgArr_s.some(m => m.msgNr === msgNrAS && m.fromCall === nodeInfo_s.CALL) ? [{
              text: 'Reply',
              data: {
                action: 'reply',
              },
            }] : []),
            {
              text: 'Copy Text',
              data: {
                action: 'copy',
              },
            },
            ...(msgArr_s.some(m => m.msgNr === msgNrAS && m.fromCall === nodeInfo_s.CALL && m.ack === 0) ? [{
              text: 'Resend Message',
              data: {
                action: 'resend',
              },
            }] : []),
            ...(segmentFilter !== "DM" ? [{
              text: 'Direct Message',
              data: {
                action: 'sendDM',
              },
            }] : []),
            ...(segmentFilter === "DM" && msgArr_s.some(m => m.msgNr === msgNrAS && m.fromCall !== nodeInfo_s.CALL) ? [{
              text: 'Reply To',
              data: {
                action: 'replyTo',
              },
            }] : []),
            ...(segmentFilter !== "DM" && msgArr_s.some(m => m.msgNr === msgNrAS && m.fromCall !== nodeInfo_s.CALL) ? [{
              text: 'Filter Call',
              data: {
                action: 'filterCall',
              },
            }, {
              text: 'Filter Message',
              data: {
                action: 'filterMessage',
              },
            }] : []),
            {
              text: 'Cancel',
              role: 'cancel',
              data: {
                action: 'cancel',
              },
            },
          ]}
          onDidDismiss={({ detail }) => handleActionSheet(detail)}
        ></IonActionSheet>

        {/* per-tab notification menu (long-press a channel tab) */}
        <IonActionSheet
          isOpen={tabMenuOpen}
          header={tabMenuHeader(tabMenuFor)}
          buttons={tabMenuButtons()}
          onDidDismiss={() => setTabMenuOpen(false)}
        ></IonActionSheet>

        {/* one-time hint about the long-press gesture on tabs */}
        <IonToast
          isOpen={shTabHint}
          message="Tip: long-press a channel tab (All, DM, a TG) to mute its notifications or hide the channel."
          duration={6000}
          position="top"
          onDidDismiss={() => setShTabHint(false)}
        ></IonToast>


        <div id="spacer-top"></div>
        <div id="msg-box" >

          {msgArr_s.map((msg, i) => (
            <>
              {checkMidnight(msg) &&
                <div className="date-panel">
                  <IonText id="msg-time">{getLocalDate(msg)}</IonText>
                </div>}

              {msg.msgNr !== 0 ? <>

                <div key={i} onTouchStart={(e) => handleButtonPress(e, msg.msgNr)} onTouchMove={handleButtonMove} onTouchEnd={() => handleButtonRelease(msg.msgNr)} className={msgType(msg)}>

                  {compactHeader ? (
                    /* COMPACT: one header line - sender (bold), (via ...), time.
                       DMs also show the recipient, same fix as the legacy header. */
                    <div className="ion-text-start">
                      <IonText id="from-call">{(msg.isDM && !msg.isGrpMsg) ? (msg.fromCall === config_s.callSign ? "To " + msg.toCall : msg.fromCall + " → " + msg.toCall) : msg.fromCall}</IonText>
                      {(() => {
                        const relays = viaRelays(msg.via, msg.fromCall);
                        const viaTxt = relays.length > 0 ? (msg.gw === 1 ? "🌐 via " : "via ") + relays : (msg.gw === 1 ? "🌐 via Gateway" : "");
                        return viaTxt ? <IonText id="msg-via"> ({viaTxt})</IonText> : null;
                      })()}
                      <IonText id="msg-time"> ·{msg.msgTime?.slice(0, 5)}</IonText>
                    </div>
                  ) : (
                    <>
                  {msg.isDM ? <>
                    {(!isNaN(+msg.toCall) || msg.isGrpMsg) ? <>
                      <div className="ion-text-start">
                      <IonText id="msg-dm">GROUP-MESSAGE {msg.toCall}</IonText>
                    </div>
                    </>:<>
                    <div className="ion-text-start">
                      <IonText id="msg-dm">DIRECT-MESSAGE</IonText>
                    </div>
                    </>}
                  </> : <></>}

                  <div className="ion-text-start">
                    <IonText id="msg-time">{msg.msgTime}</IonText>
                  </div>
                  {(() => {
                    const relays = viaRelays(msg.via, msg.fromCall);
                    if (relays.length > 0) {
                      return (
                        <div className="ion-text-start">
                          <IonText id="msg-via">{msg.gw === 1 ? "🌐 " : ""}via:{relays}</IonText>
                        </div>
                      );
                    }
                    if (msg.gw === 1) {
                      return (
                        <div className="ion-text-start">
                          <IonText id="msg-via">🌐 via Gateway</IonText>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="ion-text-start">
                    {msg.isDM ? <>
                      {msg.fromCall === config_s.callSign ? <>
                        <div className="ion-text-start">
                        <IonText id="from-call">To: {msg.toCall}</IonText>
                        </div>
                      </>:<>
                      {msg.isGrpMsg ? <>
                        {/* group: recipient is the group (already in the GROUP-MESSAGE badge) */}
                        <IonText id="from-call" >{msg.fromCall}: </IonText>
                      </>:<>
                        {/* received DM: show sender AND recipient, so you can tell
                            whether it was actually addressed to you or overheard */}
                        <IonText id="from-call" >{msg.fromCall} → {msg.toCall}: </IonText>
                      </>}
                      </>}
                    </> : <>
                    <IonText id="from-call" >{msg.fromCall}: </IonText>
                    </>}

                  </div>
                    </>
                  )}

                  <div id="spacer-txtbox"></div>

                  <div className="msg_text">
                    
                    <MsgTxtLink msgTxt={msg.msgTXT} />
                    
                  </div>
                  <div className='chkIcon'>

                    {msg.fromCall === config_s.callSign ? <>
                      {msg.ack === 0 ? <>
                        <IonIcon icon={checkmark} id="chkIcon" size='small' slot='end' />
                      </> : <></>}
                      {msg.ack === 1 ? <>
                        <IonIcon icon={cloudOutline} id="chkIcon" size='small' slot='end' />
                      </> : <></>}
                      {msg.ack === 2 ? <>
                        <IonIcon icon={cloudDoneOutline} id="chkIcon" size='small' slot='end' />
                      </> : <></>}
                    </> : <></>}
                  </div>
                </div>

              </> : <></>}

            </>
          ))}

        </div>
        <div id="bottom" style={{ height: chatBoxPadding }}/>
        <div ref={bottomRef} id="bottomRefID"/>
      </IonContent>

      <IonFooter>
        <div className="send-text">

          <div className='input_bar'>
            {shCallsign &&
              <div className="textarea_field">
                <IonItem>
                  <IonInput
                    className='custominput'
                    ref={callsignInputRef}
                    placeholder='To Callsign'
                    type='text'
                    maxlength={MAX_CHAR_CALLSIGN}
                    onIonInput={(ev) => handleInput(ev)}
                    disabled={!ble_connected}
                    value={toCallsign_.current}>
                  </IonInput>
                </IonItem>
              </div>}

            <div className="textarea_field">
              <IonItem>
                <IonTextarea 
                  className='customTextAreaInput'
                  ref={textAreaInputRef}
                  autoCorrect='on' 
                  spellcheck={true} 
                  autoGrow={true} 
                  maxlength={MAX_CHAR_TEXTINPUT} 
                  rows={1}
                  placeholder='Type Message'
                  disabled={!ble_connected}>
                </IonTextarea>
              </IonItem>
            </div>
          </div>

          <div className='send_btn'>
            <IonIcon slot='end' icon={caretForwardCircle} onClick={() => sendMsg()} {...{ color: ble_connected ? "primary" : "danger" }} size='large'></IonIcon>
          </div>
        </div>
      </IonFooter>
      
    </IonPage>
  );
};

export default Tab3;
