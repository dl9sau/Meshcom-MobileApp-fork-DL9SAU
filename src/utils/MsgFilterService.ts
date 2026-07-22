import { MsgType } from "./AppInterfaces";
import ConfigObject from "./ConfigObject";
import MsgFilterStore from "../store/MsgFilterStore";

// Configurable block filter for chat messages. Two kinds of rules:
//   - callsign block: exact match on fromCall (full, incl. SSID)
//   - text block: patterns on the message text
// Text notation (all case-insensitive):
//   Wort          -> whole word, anywhere        (\bWort\b)
//   ^Beginn       -> message starts with         (^Beginn)
//   Ende$         -> message ends with           (Ende$)
//   *Wett*hafen   -> wildcard substring          (.*Wett.*hafen)
//
// Filters apply to CHANNEL messages only. DMs and our own messages are never
// blocked (see the current TODO scope note: later a per-channel scope can be
// added to the rules so e.g. weather is blocked in ALL but allowed in a
// dedicated weather channel).
class MsgFilterService {

    private callSet: Set<string> = new Set();
    private textRegexes: RegExp[] = [];

    // turn one user pattern into a case-insensitive RegExp (or null if empty/invalid)
    private compilePattern(raw: string): RegExp | null {
        let pat = raw.trim();
        if (pat === "") return null;

        let anchorStart = false;
        let anchorEnd = false;
        if (pat.startsWith("^")) { anchorStart = true; pat = pat.slice(1); }
        if (pat.endsWith("$")) { anchorEnd = true; pat = pat.slice(0, -1); }

        const hasWildcard = pat.includes("*");
        const plainWord = !anchorStart && !anchorEnd && !hasWildcard;

        // escape regex specials, then turn the escaped "\*" back into ".*"
        const body = pat
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\\\*/g, ".*");

        let src = "";
        src += anchorStart ? "^" : (plainWord ? "\\b" : "");
        src += body;
        src += anchorEnd ? "$" : (plainWord ? "\\b" : "");

        try {
            return new RegExp(src, "i");
        } catch {
            return null;
        }
    }

    // (re)build the compiled rules from the raw multiline strings
    setRules(callRaw: string, textRaw: string) {
        this.callSet = new Set(
            callRaw.split(/\r?\n/)
                .map(l => l.trim().toUpperCase())
                .filter(l => l !== "")
        );

        this.textRegexes = [];
        for (const line of textRaw.split(/\r?\n/)) {
            const re = this.compilePattern(line);
            if (re) this.textRegexes.push(re);
        }

        MsgFilterStore.update(s => {
            s.callRaw = callRaw;
            s.textRaw = textRaw;
        });
    }

    // true if this CHANNEL message should be hidden. Never blocks DMs or own msgs.
    isChannelMsgBlocked(msg: MsgType): boolean {
        if (msg.isDM === 1) return false;

        const own = ConfigObject.getConf().CALL;
        if (own && msg.fromCall === own) return false;

        if (this.callSet.has((msg.fromCall || "").toUpperCase())) return true;

        const text = msg.msgTXT || "";
        for (const re of this.textRegexes) {
            if (re.test(text)) return true;
        }
        return false;
    }
}

export default new MsgFilterService();
