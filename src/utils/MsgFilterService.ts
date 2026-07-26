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
// Optional per-channel SCOPE prefix as the FIRST field of a rule line (backward
// compatible: no prefix = all channels, as before):
//   #ALL / #* / #all  -> only the ALL/broadcast channel (case-insensitive)
//   #262              -> only talk group 262
//   #ALL,262          -> only those channels
//   #!60              -> all channels EXCEPT talk group 60 (negation)
// e.g. "#!60 *Wetterbericht*" blocks "Wetterbericht" everywhere but the weather
// TG 60. Filters apply to CHANNEL messages only; DMs and our own msgs are never
// blocked, so the scope only ever concerns ALL + talk groups.

interface Scope {
    negate: boolean;      // '!' -> all channels EXCEPT the ones below
    all: boolean;         // the ALL/broadcast channel
    tgs: Set<number>;     // talk-group numbers
}
interface CallRule { call: string; scope: Scope | null; }
interface TextRule { re: RegExp; scope: Scope | null; }

class MsgFilterService {

    private callRules: CallRule[] = [];
    private textRules: TextRule[] = [];

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

        // Unicode-aware whole-word boundaries (only for plain words, no anchors/
        // wildcards). \b is ASCII-only, so it mishandles umlauts/emoji at the
        // edges; these lookarounds treat any Unicode letter/number as a word
        // char and also work when the pattern edge is punctuation (e.g. "- . -").
        const LB = "(?<![\\p{L}\\p{N}_])";
        const RB = "(?![\\p{L}\\p{N}_])";

        let src = "";
        src += anchorStart ? "^" : (plainWord ? LB : "");
        src += body;
        src += anchorEnd ? "$" : (plainWord ? RB : "");

        try {
            // 'u' = correct code-point handling for UTF-8 / emoji;
            // 's' = '.' also matches newlines, so wildcards span multi-line messages
            return new RegExp(src, "ius");
        } catch {
            return null;
        }
    }

    // parse a "#<scope>" token: "ALL"/"*"/"all", "262", "ALL,262", "!60". null = invalid
    private parseScope(token: string): Scope | null {
        let t = token;
        const negate = t.startsWith("!");
        if (negate) t = t.slice(1);
        const scope: Scope = { negate, all: false, tgs: new Set() };
        for (const part of t.split(",")) {
            const p = part.trim();
            if (p === "") continue;
            if (p === "*" || p.toUpperCase() === "ALL") scope.all = true;
            else if (/^\d+$/.test(p)) scope.tgs.add(parseInt(p));
            else return null; // not a valid scope element
        }
        if (!scope.all && scope.tgs.size === 0) return null; // empty scope
        return scope;
    }

    // split an optional "#<scope> " prefix off a rule line. No/invalid prefix ->
    // the whole line is the rule and the scope is null (= all channels).
    private parseScopedLine(line: string): { scope: Scope | null, rest: string } {
        const m = line.match(/^#(\S+)\s+(.*)$/);
        if (!m) return { scope: null, rest: line };
        const scope = this.parseScope(m[1]);
        return scope ? { scope, rest: m[2] } : { scope: null, rest: line };
    }

    // does a rule's scope apply to this message's channel? (null scope = always)
    private scopeApplies(scope: Scope | null, msg: MsgType): boolean {
        if (!scope) return true;
        const isAll = msg.isGrpMsg !== 1;   // group msgs have isGrpMsg=1; else ALL/broadcast
        const inSet = isAll ? scope.all : scope.tgs.has(msg.grpNum ?? -1);
        return scope.negate ? !inSet : inSet;
    }

    // (re)build the compiled rules from the raw multiline strings
    setRules(callRaw: string, textRaw: string) {
        this.callRules = [];
        for (const line of callRaw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (trimmed === "") continue;
            const { scope, rest } = this.parseScopedLine(trimmed);
            const call = rest.trim().toUpperCase();
            if (call !== "") this.callRules.push({ call, scope });
        }

        this.textRules = [];
        for (const line of textRaw.split(/\r?\n/)) {
            const { scope, rest } = this.parseScopedLine(line.trim());
            const re = this.compilePattern(rest);
            if (re) this.textRules.push({ re, scope });
        }

        MsgFilterStore.update(s => {
            s.callRaw = callRaw;
            s.textRaw = textRaw;
        });
    }

    // true if this CHANNEL message should be hidden. Never blocks real DMs or
    // own msgs. NOTE: group messages carry isDM=1 too (destination is a group
    // number, not a broadcast '*'), so a real DM is isDM=1 AND isGrpMsg!=1 -
    // otherwise the filter would never touch any group-channel message.
    isChannelMsgBlocked(msg: MsgType): boolean {
        if (msg.isDM === 1 && msg.isGrpMsg !== 1) return false;

        const own = ConfigObject.getConf().CALL;
        if (own && msg.fromCall === own) return false;

        const fromUp = (msg.fromCall || "").trim().toUpperCase();
        for (const r of this.callRules) {
            if (r.call === fromUp && this.scopeApplies(r.scope, msg)) return true;
        }

        const text = msg.msgTXT || "";
        for (const r of this.textRules) {
            if (this.scopeApplies(r.scope, msg) && r.re.test(text)) return true;
        }
        return false;
    }
}

export default new MsgFilterService();
