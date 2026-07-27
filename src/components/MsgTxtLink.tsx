import { IonText } from "@ionic/react";
import Linkify from "linkify-react";


//<IonText id="msg-text">{msg.msgTXT}</IonText>


interface msgText {
    msgTxt:string
}

export const MsgTxtLink: React.FunctionComponent<msgText> = ({ msgTxt }) => {

    // Normalise line endings for display: a foreign client may send \r or \r\n.
    // With white-space:pre-wrap on .msg_text a bare \r is rendered inconsistently
    // across engines, so fold \r\n and lone \r to \n -> every client's line breaks
    // show the same. (Our own outgoing text is already \n-normalised on send.)
    msgTxt = msgTxt.replace(/\r\n?/g, '\n');

    if(msgTxt.includes("https") || msgTxt.includes("http") || msgTxt.includes("www")){

        const options = {
            /* … */
          };

        return (
            <>
                <Linkify options={options}>
                   {msgTxt}
                </Linkify>
            </>
        )

    } else {

        return(
            <>
                <IonText>{msgTxt}</IonText>
            </>
            )

    }
}