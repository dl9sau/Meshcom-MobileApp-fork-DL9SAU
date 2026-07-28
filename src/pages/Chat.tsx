import { IonButton, IonActionSheet, IonContent, IonFab, IonFabButton, IonFooter, IonGrid, IonHeader, IonIcon, IonInput, IonItem, IonPage, IonText, IonTitle, IonToolbar, useIonViewDidEnter, useIonViewWillEnter, IonAlert, useIonViewWillLeave, IonButtons, IonModal, IonCheckbox, IonSegmentButton, IonLabel, IonSegment, IonTextarea, IonToast, IonSearchbar } from '@ionic/react';
import React,{ useEffect, useRef, useState, createRef } from 'react';
import {ConfType, MsgType, InfoData} from '../utils/AppInterfaces';
import {useBLE} from '../hooks/BleHandler';
import './Chat.css';
import { useStoreState } from 'pullstate';
import { DevIDStore } from '../store';
import { getConfigStore, getDevID, getMsgStore, getPlatformStore } from '../store/Selectors';
import MsgStore from '../store/MsgStore';
import { computeGlobeState, GlobeState } from '../utils/GlobeState';
import ConfigStore from '../store/ConfStore';
import { checkmark, cloudDoneOutline, cloudOutline, caretForwardCircle, settings, arrowDown, searchOutline} from 'ionicons/icons';
import { LocalNotifications } from '@capacitor/local-notifications';
import PlatformStore from '../store/PlatformStore';
import { Keyboard } from '@capacitor/keyboard';
import { Clipboard } from '@capacitor/clipboard';
import type { OverlayEventDetail } from '@ionic/core';
import AppActiveState  from '../store/AppActive';
import {MsgTxtLink} from '../components/MsgTxtLink';
import { splitForAir, splitCount, byteLen } from '../utils/MsgSplit';
import ConfigObject from '../utils/ConfigObject';
import BLEconnStore from '../store/BLEconnected';
import {getBLEconnStore} from '../store/Selectors';
import DMfrmMapStore from '../store/DMfrmMap';
import NotifyMsgState from '../store/NotifyMsg';
import MsgFilterStore from '../store/MsgFilterStore';
import AppPrefsStore from '../store/AppPrefsStore';
import { parseTGset, notifyLevelFor, msgDiscarded, isChannelMention } from '../utils/NotifyPrefs';
import { markSegmentUnread, clearSegmentUnread } from '../store/ChatUnread';
import { useHistory } from "react-router";
import LogS from '../utils/LogService';
import DatabaseService from '../DBservices/DataBaseService';
import { set } from 'date-fns';
import AlertCard from '../components/AlertCard';
import NodeInfoStore from '../store/NodeInfoStore';


const Tab3: React.FC = () => {


  // compose cap: long messages are auto-split into multiple on-air packets at send
  // (see MsgSplit), so the input may exceed one packet - allow ~4 packets' worth.
  const MAX_CHAR_TEXTINPUT = 500;
  const MAX_CHAR_CALLSIGN = 11;
  const MIN_CHAR_CALLSIGN = 1;


  const {sendDV, updateDevID, sendTxtCmdNode} = useBLE();


  // devid from store
  const devID_s = useStoreState(DevIDStore, getDevID);
  
  // msgs from store
  const msgArr_s:MsgType[] = useStoreState(MsgStore, getMsgStore);

  // for the gateway-marker nuance: directly-heard nodes + when we last saw each
  // node (position timestamp). Only consulted for messages that carry the 0x80 bit.

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
  // live DM view-filter: while a "To" callsign is typed in the DM segment, the DM
  // list is narrowed to that conversation (also a callsign-lookup helper). Transient,
  // not persisted; cleared when the To field is emptied.
  const [dmFilter, setDmFilter] = useState<string>("");
  // transient text/callsign search, kept PER SEGMENT: a search you start in one
  // channel stays there (its tab shows yellow) while other channels stay unfiltered
  // - so you can find a message in ALL, switch to a TG to paste it, switch back and
  // the search is still there. showSearch only toggles the input bar's visibility.
  const [segSearch, setSegSearch] = useState<{ [seg: string]: string }>({});
  const [showSearch, setShowSearch] = useState<boolean>(false);
  // generic transient toast (e.g. "enter a recipient" when sending a DM with no To)
  const [toastMsg, setToastMsg] = useState<string>("");
  // mirror of the compose textarea for the live byte / packet-split indicator (the
  // textarea itself stays uncontrolled; this just tracks the current value)
  const [composeText, setComposeText] = useState<string>("");

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

  // auto-scroll only when you're already at the bottom. If you've scrolled up to
  // read, a new message must NOT yank you down - instead a "jump to latest" button
  // appears (tap it, or scroll down yourself, to catch up).
  const contentRef = useRef<HTMLIonContentElement>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const atBottomRef = useRef<boolean>(true);
  const [showJump, setShowJump] = useState<boolean>(false);
  // count of new messages that arrived in THIS segment while scrolled up (shown as a
  // badge on the ↓ jump button - the "new below" signal for the channel you're viewing,
  // since the active tab never goes green). Reset on reaching the bottom / segment switch.
  const [newBelow, setNewBelow] = useState<number>(0);
  const prevMsgLenRef = useRef<number>(0); // to tell how many messages were just added
  // per-segment scroll memory: each segment (ALL/DM/TG) keeps its own scroll position,
  // saved on leaving a segment and restored on entering it (segments share one
  // IonContent, so without this the position/atBottom state leaks between them).
  const segScrollRef = useRef<{ [seg: string]: number }>({});
  // was a segment at the bottom (caught up) when we left it? If so we reopen it at
  // the bottom so messages that arrived meanwhile are fully visible, instead of
  // restoring the now-stale pixel offset (which left the new message below the fold).
  const segAtBottomRef = useRef<{ [seg: string]: boolean }>({});
  const prevSegForMsgRef = useRef<string>("ALL"); // to tell a new message from a segment switch

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
  // timestamp of the last user interaction with the chat (touch / tab switch /
  // page enter / app foreground); used to decide whether a notification for the
  // channel you're on still needs a sound (idle >= 30s) or you're clearly watching
  const lastInteractionRef = useRef<number>(Date.now());
  const stampActivity = () => { lastInteractionRef.current = Date.now(); };

  // short in-app beep (Web Audio) - used when you're viewing the very channel a
  // message arrives on and have been idle >= 30s: a sound to catch your eye WITHOUT
  // an Android shade entry (which a LocalNotification would leave). App is in the
  // foreground here, so Web Audio plays; resume() covers the autoplay policy.
  const beepCtxRef = useRef<AudioContext | null>(null);
  const playBeep = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!beepCtxRef.current) beepCtxRef.current = new Ctx();
      const ctx = beepCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch { /* ignore */ }
  };

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

  // per-channel notification level (0 off / 1 sound / 2 sound+banner) + discard
  // (hide) state, for the tab bell/eye icons, dimming and the menu
  const alertAll = useStoreState(AppPrefsStore, s => s.alertAll);
  const alertTGs = useStoreState(AppPrefsStore, s => s.alertTGs);
  const bannerAll = useStoreState(AppPrefsStore, s => s.bannerAll);
  const bannerTGs = useStoreState(AppPrefsStore, s => s.bannerTGs);
  const dmAlert = useStoreState(AppPrefsStore, s => s.dmAlert);
  const discardAll = useStoreState(AppPrefsStore, s => s.discardAll);
  const discardTGs = useStoreState(AppPrefsStore, s => s.discardTGs);
  const dmShowAll = useStoreState(AppPrefsStore, s => s.dmShowAll);
  // notification level of a tab ("ALL" | "DM" | "<TG>"): 0 off, 1 sound, 2 banner
  const tabNotifyLevel = (val: string): number => {
    if (val === "ALL") return bannerAll ? 2 : alertAll ? 1 : 0;
    if (val === "DM") return dmAlert !== "none" ? 2 : 0; // DM is always banner when on
    const tg = parseInt(val);
    if (isNaN(tg)) return 0;
    return parseTGset(bannerTGs).has(tg) ? 2 : parseTGset(alertTGs).has(tg) ? 1 : 0;
  };
  // is the bell (any notification) shown for a tab? Not on a discarded tab -
  // discard overrides notify (no beep), so a 🔔 there would be misleading.
  const tabBellOn = (val: string): boolean => !tabDiscarded(val) && tabNotifyLevel(val) > 0;
  // is the tab discarded (hidden)? DM is never fully discarded (only "not-for-me")
  const tabDiscarded = (val: string): boolean => {
    if (val === "ALL") return discardAll;
    if (val === "DM") return false;
    const tg = parseInt(val);
    return !isNaN(tg) && parseTGset(discardTGs).has(tg);
  };

  // Segment chat filter state
  const [segmentFilter, setSegmentFilter] = useState<string>("ALL");
  // stale-free mirror of the selected segment, for the lifecycle handlers below
  // (useIonViewDidEnter / app-active effect capture their closures, so read the
  // current segment via this ref instead)
  const segmentFilterRef = useRef<string>("ALL");
  useEffect(() => { segmentFilterRef.current = segmentFilter; }, [segmentFilter]);

  // the active segment's search text (derived from the per-segment map)
  const searchQuery = segSearch[segmentFilter] || "";
  const updateSearch = (v: string) => setSegSearch(s => ({ ...s, [segmentFilterRef.current]: v }));
  // toggle the search bar; closing it clears THIS channel's search
  const toggleSearch = () => setShowSearch(prev => { if (prev) updateSearch(""); return !prev; });
  // auto-hide the search bar once it has been empty for a short while, so it doesn't
  // linger after you clear it. Typing resets the timer (searchQuery changes); a
  // non-empty query keeps it open.
  useEffect(() => {
    if (!showSearch || searchQuery.trim() !== "") return;
    const t = setTimeout(() => setShowSearch(false), 10000);
    return () => clearTimeout(t);
  }, [showSearch, searchQuery]);

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

  // set a channel's notification level (0 off / 1 sound / 2 sound+banner) and
  // persist. ALL uses alertAll+bannerAll, a TG uses the alertTGs/bannerTGs CSVs.
  // DM uses setDmAlertPref instead.
  const setChannelNotifyLevel = async (val: string, level: number) => {
    const s = AppPrefsStore.getRawState();
    if (val === "ALL") {
      const alert = level >= 1, banner = level === 2;
      AppPrefsStore.update(x => { x.alertAll = alert; x.bannerAll = banner; });
      await DatabaseService.setPref('alertAll', alert ? '1' : '0');
      await DatabaseService.setPref('bannerAll', banner ? '1' : '0');
      return;
    }
    const tg = parseInt(val);
    if (isNaN(tg)) return;
    const soundSet = parseTGset(s.alertTGs);
    const bannerSet = parseTGset(s.bannerTGs);
    soundSet.delete(tg); bannerSet.delete(tg);
    if (level === 1) soundSet.add(tg);
    else if (level === 2) bannerSet.add(tg);
    const soundCsv = Array.from(soundSet).join(",");
    const bannerCsv = Array.from(bannerSet).join(",");
    AppPrefsStore.update(x => { x.alertTGs = soundCsv; x.bannerTGs = bannerCsv; });
    await DatabaseService.setPref('alertTGs', soundCsv);
    await DatabaseService.setPref('bannerTGs', bannerCsv);
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

  // buttons for the tab menu, depending on the tab. DM keeps its which-DMs
  // tri-state (all DMs -> banner); ALL and talk groups pick a notification level
  // (disabled / sound / sound+banner). "sound+banner" is Android-only (iOS has no
  // channels). ✓ marks the current choice.
  const tabMenuButtons = (): any[] => {
    const val = tabMenuFor;
    if (val === "DM") {
      const mark = (lvl: string) => (dmAlert === lvl ? "✓ " : "");
      return [
        { text: mark("none") + "Notify: disabled", handler: () => { setDmAlertPref("none"); } },
        { text: mark("mine") + "Notify: my DMs (and mentions) only", handler: () => { setDmAlertPref("mine"); } },
        { text: mark("all") + "Notify: all DMs and mentions", handler: () => { setDmAlertPref("all"); } },
        { text: dmShowAll ? "Hide others' DMs" : "Show others' DMs (monitor)", handler: () => { toggleDmShowAll(); } },
        { text: "Cancel", role: "cancel" }
      ];
    }
    const level = tabNotifyLevel(val);
    const cmark = (l: number) => (level === l ? "✓ " : "");
    return [
      { text: cmark(0) + "Notify: disabled", handler: () => { setChannelNotifyLevel(val, 0); } },
      { text: cmark(1) + "Notify: sound", handler: () => { setChannelNotifyLevel(val, 1); } },
      ...(thisPlatform === "android" ? [{ text: cmark(2) + "Notify: sound and banner", handler: () => { setChannelNotifyLevel(val, 2); } }] : []),
      { text: tabDiscarded(val) ? "Show messages" : "Hide messages (discard)", handler: () => { toggleTabDiscard(val); } },
      { text: "Cancel", role: "cancel" }
    ];
  };

  // render one segment tab: tap selects it, long-press opens the tab menu. Markers
  // (🔔 = beeps, 👁 = DM monitoring) are plain UTF-8 emoji in an absolutely
  // positioned <span> inside reserved label padding. Crucially NOT <ion-icon>:
  // IonSegmentButton does querySelector('ion-icon') across all descendants and, if
  // it finds one, switches to an icon layout that shoves the label up a line - no
  // CSS could stop that. A plain emoji span is invisible to that check, and being
  // absolute it's out of flow, so the label height never changes.
  const markStyle = (side: "left" | "right"): any => ({
    position: "absolute", [side]: 0, top: "50%", transform: "translateY(-50%)",
    fontSize: "0.62em", opacity: 0.85, pointerEvents: "none"
  });
  const renderTab = (val: string, label: string, isGroup: boolean) => {
    const bell = tabBellOn(val);
    const eye = val === "DM" && dmShowAll;
    return (
      <IonSegmentButton key={val} value={val} id={val}
        className={[
          tabDiscarded(val) ? 'tab-dimmed' : '',
          ((val === "DM" && segmentFilter === "DM" && dmFilter.trim() !== "") ||
           (segSearch[val] || "").trim() !== "") ? 'tab-filtered' : ''
        ].filter(Boolean).join(' ') || undefined}
        onClick={() => handleSegmentChange(val, isGroup)}
        onTouchStart={(e) => handleTabPress(e, val)}
        onTouchMove={handleTabMove}
        onTouchEnd={handleTabRelease}>
        <IonLabel>
          <span style={{ position: "relative", display: "inline-block",
                         paddingRight: bell ? "0.9em" : undefined,
                         paddingLeft: eye ? "0.9em" : undefined }}>
            {label}
            {bell && <span style={markStyle("right")}>🔔</span>}
            {eye && <span style={markStyle("left")}>👁</span>}
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
    stampActivity(); // entering the chat counts as looking at it
    // set the bottom reference
    if(bottomRef.current === null) bottomRef.current = document.getElementById('bottomRefID') as HTMLDivElement;
    // cache the scroll element for the "am I at the bottom?" check
    contentRef.current?.getScrollElement().then(el => { scrollElRef.current = el; }).catch(() => {});
    atBottomRef.current = true; setShowJump(false); // entering -> we scroll to bottom below

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
          markSegmentUnread(seg); // keep the Chat tab dot in sync
        }
      });
      ConfigObject.clearInitChatSegmentMarkers();
    }

    // entering the chat means you're now looking at the currently-selected segment
    // -> it counts as read (clears a Chat-tab dot that a message to this very
    // segment set while the chat was in the background / another tab was shown)
    clearSegmentUnread(segmentFilterRef.current);

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
      stampActivity(); // coming back to the app counts as looking at it
      // you're looking at the app now -> the shade entries are stale, clear them
      LocalNotifications.removeAllDeliveredNotifications().catch(() => {});
      // if the chat is the visible page, the segment you're on counts as read now
      // (a message to it while backgrounded set the tab dot -> clear it)
      if (thisPageActive.current) clearSegmentUnread(segmentFilterRef.current);
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

  // track whether we're (near) the bottom, so a new message doesn't yank you down
  // while you've scrolled up to read. Threshold ~24px (~1 line) = "at the bottom";
  // scroll up more than that and the ↓ button appears.
  const onContentScroll = () => {
    const el = scrollElRef.current;
    if (!el) return;
    const near = (el.scrollHeight - el.scrollTop - el.clientHeight) < 24;
    atBottomRef.current = near;
    setShowJump(!near); // button visible whenever you're scrolled up
    if (near) setNewBelow(0); // caught up -> clear the "new below" count
  };

  // "jump to latest" button: go to the bottom and hide it
  const jumpToLatest = () => {
    setShowJump(false);
    atBottomRef.current = true;
    setNewBelow(0); // you're going to the bottom -> seen them
    scrollToBottom();
  };

  

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

    // DM segment but the To callsign is missing/invalid -> do NOT send (and do NOT
    // clear the composed text). Jump the cursor to the To field so the user can add
    // the recipient they forgot, instead of silently losing the message.
    if (shCallsign && !isDM && !sendDMGrpFlag) {
      const hasText = !!textAreaInputRef.current?.value?.toString().trim();
      if (hasText) {
        setToastMsg("Enter a recipient callsign in the To field first.");
        callsignInputRef.current?.setFocus();
        return; // keep the text
      }
    }
    

    if(textAreaInputRef !== null){
      
      const txMsg = textAreaInputRef.current!.value;

      if(txMsg){

        if(txMsg !== null ){

          let txMsg_str = txMsg.toString();

          // clean the input: first normalise line endings (CRLF / lone CR -> LF, so
          // we don't depend on what the WebView/keyboard produces), then right-strip
          // each line (trailing spaces/tabs are noise) but KEEP leading whitespace -
          // intentional indentation like "  ^typo at pos 3" or an indented block is
          // legitimate - and drop trailing blank lines. If nothing but whitespace is
          // left there is nothing to send.
          txMsg_str = txMsg_str
            .replace(/\r\n?/g, '\n')
            .split('\n').map(l => l.replace(/\s+$/, '')).join('\n')
            .replace(/\n+$/, '');

          if(txMsg_str.length > 0){

            // long messages are auto-split into multiple on-air packets (byte-accurate,
            // word- and UTF-8-safe; a "(i/n Xx)" group marker is added only when it
            // actually splits). DM routing "{CALL}" is prepended to EACH part - and it
            // counts against the on-air budget, so shrink the per-part budget by it.
            const routing = isDM ? "{" + toCallsign_str_u + "}" : "";
            // if this is a quote (forward, or a manual "> ..."), keep the "> " marker
            // on every wrapped part, like an email client wraps quoted lines
            const quoted = txMsg_str.startsWith("> ");
            const parts = splitForAir(txMsg_str, {
              maxBytes: 150 - byteLen(routing),
              prefixCont: quoted ? "> " : "",
              method: AppPrefsStore.getRawState().splitMethod,
            });
            let allSent = true;
            for (let i = 0; i < parts.length; i++) {
              const body = routing + parts[i];
              const ok = await sendFinalMessage(body);
              if (!ok) { allSent = false; break; } // stop; unsent parts can be resent
              // small gap so the node's TX queue keeps the parts in order
              if (i < parts.length - 1) await new Promise(r => setTimeout(r, 300));
            }
            if (!allSent) return;

            // clear input
            textAreaInputRef.current!.value = "";
            setComposeText("");

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

      //create notify channels on android
      if (thisPlatform === "android") {
        // Two channels with the DEFAULT sound: 'sound' (importance DEFAULT = sound,
        // no heads-up) and 'banner' (importance HIGH = sound + heads-up). On-device
        // check confirmed both are correct. Clean up the old ids '1'/'2'.
        try { await LocalNotifications.deleteChannel({ id: '1' } as any); } catch (e) { console.log("del 1:", e); }
        try { await LocalNotifications.deleteChannel({ id: '2' } as any); } catch (e) { console.log("del 2:", e); }
        await LocalNotifications.createChannel({
          id: 'sound',
          name: 'Notifications — sound',
          description: 'Channel messages set to "sound" (ALL / talk groups). Per-channel level is chosen in the app.',
          importance: 3,   // DEFAULT: makes a sound, no heads-up pop-up
          visibility: 1,
          vibration: true
        });
        await LocalNotifications.createChannel({
          id: 'banner',
          name: 'Notifications — sound + banner',
          description: 'Direct messages, @mentions, and channels set to "sound and banner".',
          importance: 4,   // HIGH: sound + heads-up pop-up
          visibility: 1,
          vibration: true
        });
        // channel importances (dev console only): banner=4, sound=3, fg=2 confirmed
        const channels = await LocalNotifications.listChannels();
        console.log("Notify channels: " + channels.channels.map(c => c.id + "=imp" + c.importance).join(", "));
      }
    } else {
      // TODO action when no permission for notifies is set
      console.log("No Notify Permission set!");
      
    }
  }


  // new message arrived: scroll to bottom ONLY if you're already there. If you've
  // scrolled up to read, keep your place (the ↓ button is shown by onIonScroll).
  // A SEGMENT SWITCH also changes msgArr_s - don't treat that as a new message
  // (the [segmentFilter] restore effect below handles scrolling for switches).
  useEffect(() => {
    if (!msgArr_s || msgArr_s.length === 0) { prevMsgLenRef.current = 0; return; }
    const delta = msgArr_s.length - prevMsgLenRef.current;
    prevMsgLenRef.current = msgArr_s.length;
    if (prevSegForMsgRef.current !== segmentFilterRef.current) {
      prevSegForMsgRef.current = segmentFilterRef.current; // segment switch, not a new msg
      return;
    }
    if (atBottomRef.current) scrollToBottom();
    else if (delta > 0) setNewBelow(n => n + delta); // arrived below while you're scrolled up
  }, [msgArr_s]);


  // segment switched: restore THIS segment's saved scroll position (or bottom if we
  // haven't been here / it was at the bottom). Captured synchronously so a transient
  // scroll during the content swap can't corrupt it; applied after the new messages
  // render. Then recompute atBottom + button from the real position.
  useEffect(() => {
    const saved = segScrollRef.current[segmentFilter];
    const wasAtBottom = segAtBottomRef.current[segmentFilter];
    setNewBelow(0); // switching channels -> the "new below" count starts fresh
    const t = setTimeout(() => {
      const el = scrollElRef.current;
      if (!el) return;
      if (saved === undefined) {
        // never opened this segment -> bottom
        el.scrollTop = el.scrollHeight;
      } else if (wasAtBottom) {
        // You were caught up here. Reopen so the seen<->new boundary sits near the
        // TOP: the last already-seen line peeks above the messages that arrived
        // while you were away ("these I had - the rest below is new"). `saved` was
        // (scrollHeight - clientHeight) at the old bottom, so saved+clientHeight is
        // where the old content ended; back off a small peek and put that at the
        // top. If only a little arrived the browser clamps this to the real bottom,
        // so few-new just shows everything and nothing new is ever cut off; only
        // when MANY arrived does the boundary stay pinned near the top.
        const PEEK = 48; // px of already-seen context kept visible at the top
        el.scrollTop = saved + el.clientHeight - PEEK;
      } else {
        // you'd scrolled UP to read history -> restore the exact reading position
        el.scrollTop = saved;
      }
      const near = (el.scrollHeight - el.scrollTop - el.clientHeight) < 24;
      atBottomRef.current = near;
      setShowJump(!near);
    }, 80);
    return () => clearTimeout(t);
  }, [segmentFilter]);


  // Trigger that we fire a notification on new message
  useEffect(() => {
    console.log("CHAT - New Message to Notify: ");
    console.log(notifyMsg_s);
    const notify_title = "New Message from " + notifyMsg_s.fromCall;

    // which channel/segment this message belongs to
    let msgType = "ALL";
    if (notifyMsg_s.isDM === 1 && notifyMsg_s.isGrpMsg === 0) msgType = "DM";
    else if (notifyMsg_s.isGrpMsg === 1 && notifyMsg_s.isDM === 1) msgType = notifyMsg_s.grpNum.toString();

    // notification level for this message (0 none / 1 sound / 2 sound+banner);
    // mentions come through mute/discard at banner level, discarded scope -> 0
    let notifyLevel = notifyLevelFor(notifyMsg_s, config_s.callSign);
    // if you're on THIS channel (app foreground, chat page, same segment) you
    // already see the message -> never a banner. And if you interacted within the
    // last 30 s you're clearly watching -> stay silent; only if the app has just
    // been sitting open (idle >= 30 s) play a sound to catch your eye.
    if (notifyLevel > 0 && isAppActive && thisPageActive.current && msgType === segmentFilter) {
      // you're viewing this exact channel -> NO system notification (no shade entry).
      // If you've been idle >= 30s, play a short IN-APP beep to catch your eye;
      // if you've interacted within 30s you're clearly watching -> stay fully silent.
      const idleMs = Date.now() - lastInteractionRef.current;
      if (idleMs >= 30000) playBeep();
      notifyLevel = 0;
    }
    if (notifyLevel > 0) {
      notifyMsgUser(notify_title, notifyMsg_s.msgTXT, notifyLevel, msgType);
    }

    // green indicator on another segment's tab (skip when the channel is discarded:
    // mute keeps the green marker, discard hides it) - EXCEPT a mention of me,
    // which stays visible + green even in a discarded channel (see applyFilters)
    const mentionShown = dmAlert !== "none" && isChannelMention(notifyMsg_s, config_s.callSign);
    if (notifyMsg_s.isDM !== undefined && notifyMsg_s.isGrpMsg !== undefined && (!msgDiscarded(notifyMsg_s, config_s.callSign) || mentionShown)) {
      // are you actually looking at the chat right now? (chat tab on screen + app
      // in the foreground). Only THEN does "it's the selected segment" mean you've
      // seen it.
      const chatVisible = isAppActive && thisPageActive.current;
      if (msgType !== segmentFilter) {
        const Seqgmentbutton = document.getElementById(msgType) as HTMLIonSegmentButtonElement;
        if (Seqgmentbutton) {
          const wasGreen = Seqgmentbutton.classList.contains('segmentbutton_green');
          Seqgmentbutton.classList.add('segmentbutton_green');
          // reveal it: the tab strip scrolls horizontally, so a channel that just
          // lit up may be off-screen. Slide the strip to bring the new green into
          // view - the user sees both the motion and WHERE it happened. Only on the
          // read->green transition, so an already-flagged busy channel doesn't make
          // the strip jitter on every further message.
          if (chatVisible && !wasGreen) {
            Seqgmentbutton.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
          }
        }
        markSegmentUnread(msgType); // keep the Chat tab dot in sync
      } else if (!chatVisible) {
        // message for the currently-selected segment, but the chat isn't on screen
        // (you're on another tab / app backgrounded) -> you're NOT seeing it, so
        // still light the Chat tab dot. No segment-green here: the moment you open
        // chat you're viewing this very segment, and entering chat clears its marker.
        markSegmentUnread(msgType);
      }
    }

  }, [notifyMsg_s.msgNr]);


  // stable notification id per channel so a new message REPLACES the previous
  // one in the shade instead of piling up (100 stacked notifications is annoying).
  // ALL -> 1, DM -> 2, each talk group -> its own slot (10000 + TG number).
  const notifyChannelId = (msgType: string): number => {
    if (msgType === "ALL") return 1;
    if (msgType === "DM") return 2;
    const n = parseInt(msgType);
    return isNaN(n) ? 3 : 10000 + n;
  };

  // local notification method. level: 1 = sound, 2 = sound + banner (Android
  // routes to the matching OS channel; iOS has no channels -> always with sound).
  const notifyMsgUser = async (title_:string, body_:string, level: number = 1, msgType: string = "ALL") => {
    if(canNotify.current === true){
      const notifId = notifyChannelId(msgType);
      if(thisPlatform === "ios"){
        LocalNotifications.schedule({
          notifications: [
            {
              title:title_,
              body: body_,
              id: notifId,
              schedule: {
                at: new Date(Date.now() + 1000 * 1), // in 1 secs
                repeats: false
              },
              sound: 'default' // iOS has no channels -> default notification sound
            }]
        });
      }

      if(thisPlatform === "android"){
        LocalNotifications.schedule({
          notifications: [
            {
              title: title_,
              body: body_,
              id: notifId,
              schedule: {
                at: new Date(Date.now() + 1000 * 1), // in 1 secs
                repeats: false
              },
              // level 2 -> banner channel (heads-up), else the sound channel
              channelId: level === 2 ? 'banner' : 'sound',
              smallIcon: 'ic_stat_notify'
              // no sound here -> the channel's default sound is used (Android O+
              // takes the sound from the channel anyway, not per-notification)
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

  // Gateway "globe" marker. The verdict (none/solid/dim) is FROZEN at receive time
  // and stored per message (msg.gwState) — see computeGlobeState in utils/GlobeState.
  // We render the STORED value so the marker doesn't drift as the 24h HF-horizon
  // window slides past historical messages; for old messages that predate the column
  // (no stored value) we fall back to a live compute.
  const globeEl = (msg: MsgType) => {
    const st: GlobeState = (msg.gwState === 'none' || msg.gwState === 'solid' || msg.gwState === 'dim' || msg.gwState === 'faint')
      ? msg.gwState : computeGlobeState(msg);
    // 'none' = no gw bit / definitely local  -> no globe
    // 'dim'  = gw bit but the SENDER is local -> no globe (reached us via HF)
    // 'solid'= gw bit, sender not local       -> full globe (from the wider network)
    // 'faint'= LEGACY (no longer produced; local relays turned out ~99% internet) ->
    //          render as a full globe like solid
    if (st === 'none' || st === 'dim') return null;
    return <span>🌐 </span>;
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

      if (asActionDetail === "searchSender") {
        // slick shortcut: narrow the current channel to this sender via the same
        // transient search (text/callsign) - pre-fill the query + reveal the bar
        const m = selMsg[0];
        if (m && m.fromCall) {
          updateSearch(m.fromCall);
          setShowSearch(true);
        }
      }

      if (asActionDetail === "finishSearch") {
        // end the transient search from the same long-press it was started with
        updateSearch("");
        setShowSearch(false);
      }

      if (asActionDetail === "forward") {
        // quote the message into a fresh DM: switch to DM, leave the To empty (you
        // pick the recipient; our empty-To guard stops an accidental send), and drop
        // "> CALL: <text>" into the compose box. A long quote is auto-split on send.
        const m = selMsg[0];
        if (m) {
          if (segmentFilterRef.current !== "DM") handleSegmentChange("DM", false);
          toCallsign_.current = "";   // override the DM-switch's last-callsign prefill
          setDmFilter("");
          const quote = "> " + m.fromCall + ": " + m.msgTXT;
          if (textAreaInputRef.current) textAreaInputRef.current.value = quote;
          setComposeText(quote);
          callsignInputRef.current?.setFocus();
        }
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
          const isOwn = isDMmsg || m.fromCall === config_s.callSign;
          const time = timeRef(m.msgTime);
          const appendRef = (ref: string) => {
            if (!ref.trim() || existing.trimEnd().endsWith(ref.trim())) return;
            const sep = existing && !/\s$/.test(existing) ? " " : "";
            textAreaInputRef.current!.value = existing + sep + ref;
          };
          if (isOwn) {
            // DM / own message: time reference only (no @self), appended.
            appendRef(time);
          } else {
            const mention = "@" + m.fromCall;
            // "pure reference run" = what you've composed so far is ONLY @call / [time]
            // tokens, i.e. you pressed Reply repeatedly WITHOUT typing anything. That's
            // a generic multi-mention -> drop the per-message times ("@call1 @call2 ").
            // As soon as your own prose sits between replies, each reference is a
            // deliberate, distinct bezug -> keep its own time ("@call1 [t1] ack
            // @call2 [t2] answer"). @mention is matched anywhere on receive either way.
            const pureRefRun = existing.trim() !== "" && /^(\s*(@\S+|\[\d{1,2}:\d{2}\])\s*)*$/.test(existing);
            if (pureRefRun) {
              const calls: string[] = existing.match(/@\S+/g) || [];
              if (!calls.includes(mention)) calls.push(mention);
              textAreaInputRef.current.value = calls.join(" ") + " ";
            } else {
              appendRef(mention + " " + time);
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
    setDmFilter(inp.trim()); // live-narrow the DM view to this callsign (and lookup helper)
  }

  // is a message visible under the current DM view-filter? (filter only in the DM
  // segment, only when a To callsign is typed; matches sender OR recipient, case-
  // insensitive substring so a partial "DL1AA" surfaces "DL1AAB-12").
  const dmVisible = (m: MsgType): boolean => {
    if (segmentFilter !== "DM" || dmFilter.trim() === "") return true;
    const f = dmFilter.trim().toUpperCase();
    return (m.fromCall || "").toUpperCase().includes(f) || (m.toCall || "").toUpperCase().includes(f);
  };

  // transient search over the CURRENT channel's already-visible messages: match the
  // message text OR the sender/recipient callsign (case-insensitive substring).
  // Empty query = everything. Only messages already visible under the persistent
  // filters are searched (msgArr_s is pre-filtered) - matching the yellow "view
  // filter" model in the spec.
  const searchVisible = (m: MsgType): boolean => {
    const q = searchQuery.trim().toUpperCase();
    if (q === "") return true;
    return (m.msgTXT || "").toUpperCase().includes(q)
      || (m.fromCall || "").toUpperCase().includes(q)
      || (m.toCall || "").toUpperCase().includes(q);
  };


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
  // once you VIEW a channel you've seen its messages -> clear its lingering entry
  // from the notification shade (the green tab marker is cleared below too). Best
  // effort; matches on the channel's stable notification id.
  const clearChannelShade = async (val: string) => {
    try {
      const id = notifyChannelId(val);
      const delivered = await LocalNotifications.getDeliveredNotifications();
      const match = (delivered.notifications || []).filter(n => String(n.id) === String(id));
      if (match.length) await LocalNotifications.removeDeliveredNotifications({ notifications: match } as any);
    } catch (e) { /* shade cleanup is best effort */ }
  };

  const handleSegmentChange = (val: string, isGrp: boolean) => {
    console.log("Chat Filter Change to: " + val);
    stampActivity(); // switching tabs is an interaction
    // remember where we were in the segment we're LEAVING, before it swaps out:
    // the pixel offset (to restore a channel you'd scrolled up in) AND whether you
    // were caught up at the bottom (then we reopen at the bottom - see restore effect)
    if (scrollElRef.current) {
      const el = scrollElRef.current;
      segScrollRef.current[segmentFilterRef.current] = el.scrollTop;
      segAtBottomRef.current[segmentFilterRef.current] = (el.scrollHeight - el.scrollTop - el.clientHeight) < 24;
    }
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
      // To field is (re)filled -> apply the live DM view-filter to match it
      setDmFilter(lastDMcallsign.current.trim());
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
    clearSegmentUnread(val); // this channel is read now -> update the Chat tab dot
    // (the [segmentFilter] effect restores this segment's saved scroll position)

    // if this channel has a search kept from before, surface its bar so the active
    // (yellow) filter is visible; otherwise leave the bar as the user left it
    if ((segSearch[val] || "").trim() !== "") setShowSearch(true);

    // clear this channel's lingering notification from the shade (you're reading it now)
    clearChannelShade(val);
  }
  


  const visibleMsgs = msgArr_s.filter(dmVisible).filter(searchVisible);
  // the message the long-press action sheet is currently about (for context labels)
  const asMsg = msgArr_s.find(m => m.msgNr === msgNrAS);
  const asSender = asMsg?.fromCall || "";
  // is the active search exactly this sender's callsign? (then the long-press can
  // offer to finish that same search - you turned it on there, turn it off there)
  const searchIsThisSender = asSender !== "" && searchQuery.trim().toUpperCase() === asSender.toUpperCase();

  // live compose indicator: clean the draft the same way send does, then show its
  // on-air byte size and how many packets it will be split into (see MsgSplit). Lets
  // you trim a word to stay in one packet instead of accidentally sending two.
  const composeClean = composeText
    .replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
  const composeBytes = byteLen(composeClean);
  const composeParts = composeClean.length ? splitCount(composeClean) : 0;

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
            <IonButtons slot="end">
              <IonButton onClick={toggleSearch} title="Search (text or callsign)">
                <IonIcon slot="icon-only" icon={searchOutline} style={{ fontSize: "1.1rem" }} color={showSearch || searchQuery.trim() !== "" ? "primary" : undefined} />
              </IonButton>
            </IonButtons>
        </IonToolbar>
        {showSearch &&
          <IonToolbar>
            <IonSearchbar
              value={searchQuery}
              debounce={150}
              placeholder="Text or callsign"
              onIonInput={(e) => updateSearch(e.detail.value || "")}
              onIonClear={() => updateSearch("")}
            />
          </IonToolbar>}
      </IonHeader>
      <IonContent className="ion-padding" ref={contentRef} scrollEvents={true} onIonScroll={onContentScroll} onTouchStart={stampActivity}>
        {showJump &&
          <IonFab slot="fixed" vertical="bottom" horizontal="end">
            <IonFabButton size="small" color="primary" onClick={jumpToLatest} title="Neue Nachrichten">
              {/* show the count IN the button when new msgs arrived below (a corner
                  badge gets clipped by the round FAB's overflow:hidden), else the arrow */}
              {newBelow > 0
                ? <span className="jump-count">{newBelow > 99 ? "99+" : newBelow}</span>
                : <IonIcon icon={arrowDown} />}
            </IonFabButton>
          </IonFab>
        }

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
            ...(msgArr_s.some(m => m.msgNr === msgNrAS && m.fromCall === nodeInfo_s.CALL && m.ack !== 2) ? [{
              text: 'Resend Message',
              data: {
                action: 'resend',
              },
            }] : []),
            ...(segmentFilter !== "DM" ? [{
              text: 'Direct Message',
              // DMing yourself makes no sense (and on a group message it would
              // prefill the group number) -> greyed out on your own messages
              disabled: msgArr_s.some(m => m.msgNr === msgNrAS && m.fromCall === nodeInfo_s.CALL),
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
            {
              // forward: quote into a DM (recipient left for you to fill); long
              // quotes are auto-split into packets like any other message
              text: 'Forward',
              data: {
                action: 'forward',
              },
            },
            {
              text: 'Copy Text',
              data: {
                action: 'copy',
              },
            },
            {
              // pre-fill the transient search with this sender's callsign (the slick
              // shortcut into the same search engine + yellow indicator)
              text: asSender ? 'Search ' + asSender : 'Search Sender',
              data: {
                action: 'searchSender',
              },
            },
            // a search is active -> offer to end it right here (you likely started it
            // via long-press too, so you expect to stop it the same way)
            ...(searchQuery.trim() !== "" ? [{
              text: searchIsThisSender ? 'Finish search from ' + asSender : 'Finish search',
              data: {
                action: 'finishSearch',
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
        <IonToast
          isOpen={toastMsg !== ""}
          message={toastMsg}
          duration={2500}
          position="top"
          onDidDismiss={() => setToastMsg("")}
        ></IonToast>


        <div id="spacer-top"></div>
        <div id="msg-box" >

          {visibleMsgs.map((msg, i) => (
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
                        const gEl = globeEl(msg);
                        if (relays.length > 0) return <IonText id="msg-via"> ({gEl}via {relays})</IonText>;
                        if (gEl) return <IonText id="msg-via"> ({gEl}via Gateway)</IonText>;
                        return null;
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
                          <IonText id="msg-via">{globeEl(msg)}via:{relays}</IonText>
                        </div>
                      );
                    }
                    if (msg.gw === 1) {
                      return (
                        <div className="ion-text-start">
                          <IonText id="msg-via">{globeEl(msg)}via Gateway</IonText>
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

          {searchQuery.trim() !== "" && visibleMsgs.length === 0 &&
            <div className="search-empty">
              <IonText>No matches in this channel.
                {AppPrefsStore.getRawState().filtersEnabled ? " Active filters may be hiding matching messages." : ""}
              </IonText>
            </div>}

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
                    clearInput={true}
                    maxlength={MAX_CHAR_CALLSIGN}
                    onIonInput={(ev) => { stampActivity(); handleInput(ev); }}
                    onIonFocus={() => { if (showSearch && searchQuery.trim() === "") setShowSearch(false); }}
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
                  onIonInput={(e) => { stampActivity(); setComposeText((e.detail as any)?.value ?? ""); }}
                  onIonFocus={() => { if (showSearch && searchQuery.trim() === "") setShowSearch(false); }}
                  disabled={!ble_connected}>
                </IonTextarea>
              </IonItem>
              {composeParts > 0 &&
                <div className={"compose-info" + (composeParts > 1 ? " compose-split" : "")}>
                  {composeBytes} B{composeParts > 1 ? ` · ${composeParts} packets` : ""}
                </div>}
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
