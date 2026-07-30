import {Store} from "pullstate";
import { MsgType } from "../utils/AppInterfaces";

//let msgTypeArr = <MsgType []>[];
let msgTypeArr:MsgType[] = [];

/*interface MsgType {
    msgNr:number,
    msgTime:string,
    fromCall:string,
    msgTXT:string
}*/

// resend-collapse jump signal: when writeTxtMsg folds a resend into an existing
// message, it stamps the target here (msgNr + sender + which channel) with a fresh
// nonce. Chat.tsx watches the nonce and, if that channel is on screen, scrolls up to
// the updated row and flashes it - so a resend that updated an older message in place
// doesn't go unnoticed. null = no pending jump.
interface ResendJump {
    msgNr: number,
    fromCall: string,
    isDM: number,
    isGrpMsg: number,
    grpNum: number,
    nonce: number
}

const MsgStore = new Store({
    msgArr:msgTypeArr,
    resendJump: null as ResendJump | null
});

export default MsgStore


/**
 * export interface MsgType {
    timestamp:number,
    msgNr:number,
    msgTime:string,
    fromCall:string,
    toCall:string,
    msgTXT:string,
    via:string,
    ack:number,
    isDM:number,
    isGrpMsg:number,
    grpNum:number,
    notify:number
}
 */