import { MsgType } from "./AppInterfaces";
import ConfigObject from "./ConfigObject";
import MsgFilterStore from "../store/MsgFilterStore";
import AppPrefsStore from "../store/AppPrefsStore";

// Configurable filter for chat messages. Three kinds of rules:
//   - callsign block (DENY): exact match on fromCall (full, incl. SSID)
//   - text block (DENY): patterns on the message text
//   - text allow (WHITELIST): patterns; if a channel has any allow rule, only
//     messages matching one are kept (see check order below)
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
//
// CHECK ORDER (see isChannelMsgBlocked): callsign-deny -> allow-gate -> text-deny.
//   - ALLOW rules are a per-channel whitelist: if a channel has any allow rule,
//     only messages matching one survive (the rest are blocked). A whitelist match
//     wins over a text-deny (short-circuit), so e.g. an allow "#60 *wetter*" keeps
//     "Wetterbericht Berlin" in TG 60 even if a global deny "*etterb*" exists.
//   - callsign-deny still runs first, so it's the escape hatch to drop a spammer
//     even inside a whitelisted channel.

interface Scope {
    negate: boolean;      // '!' -> all channels EXCEPT the ones below
    all: boolean;         // the ALL/broadcast channel
    tgs: Set<number>;     // talk-group numbers
}
interface CallRule { call: string; scope: Scope | null; }
interface TextRule { re: RegExp; scope: Scope | null; }

class MsgFilterService {

    private callRules: CallRule[] = [];
    private textRules: TextRule[] = [];   // DENY text patterns
    private allowRules: TextRule[] = [];  // ALLOW (whitelist) text patterns

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

    // compile a multiline text-pattern block (deny or allow) into TextRules
    private compileTextRules(raw: string): TextRule[] {
        const rules: TextRule[] = [];
        for (const line of (raw || "").split(/\r?\n/)) {
            const { scope, rest } = this.parseScopedLine(line.trim());
            const re = this.compilePattern(rest);
            if (re) rules.push({ re, scope });
        }
        return rules;
    }

    // (re)build the compiled rules from the raw multiline strings
    setRules(callRaw: string, textRaw: string, allowRaw: string = "") {
        this.callRules = [];
        for (const line of callRaw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (trimmed === "") continue;
            const { scope, rest } = this.parseScopedLine(trimmed);
            const call = rest.trim().toUpperCase();
            if (call !== "") this.callRules.push({ call, scope });
        }

        this.textRules = this.compileTextRules(textRaw);
        this.allowRules = this.compileTextRules(allowRaw);

        MsgFilterStore.update(s => {
            s.callRaw = callRaw;
            s.textRaw = textRaw;
            s.allowRaw = allowRaw;
        });
    }

    // true if this CHANNEL message should be hidden. Never blocks real DMs or
    // own msgs. NOTE: group messages carry isDM=1 too (destination is a group
    // number, not a broadcast '*'), so a real DM is isDM=1 AND isGrpMsg!=1 -
    // otherwise the filter would never touch any group-channel message.
    isChannelMsgBlocked(msg: MsgType): boolean {
        // master off-switch: whole filter disabled -> nothing is hidden (rules kept)
        if (!AppPrefsStore.getRawState().filtersEnabled) return false;

        if (msg.isDM === 1 && msg.isGrpMsg !== 1) return false;

        const own = ConfigObject.getConf().CALL;
        if (own && msg.fromCall === own) return false;

        // 1) callsign DENY first (absolute + cheap). A blocked callsign is dropped
        //    even if the message would match an allow rule - so the callsign filter
        //    is the escape hatch for spam inside a whitelisted channel.
        const fromUp = (msg.fromCall || "").trim().toUpperCase();
        for (const r of this.callRules) {
            if (r.call === fromUp && this.scopeApplies(r.scope, msg)) return true;
        }

        const text = msg.msgTXT || "";

        // 2) ALLOW (whitelist) gate: if this channel has ANY allow rule, the message
        //    must match one to be kept. A match wins over deny (short-circuit ALLOW,
        //    so a whitelisted msg is protected from a general text-deny); no match in
        //    a whitelisted channel -> blocked.
        const allowHere = this.allowRules.filter(r => this.scopeApplies(r.scope, msg));
        if (allowHere.length > 0) {
            return !allowHere.some(r => r.re.test(text)); // matches -> keep; else block
        }

        // 3) text DENY
        for (const r of this.textRules) {
            if (this.scopeApplies(r.scope, msg) && r.re.test(text)) return true;
        }
        return false;
    }
}

export default new MsgFilterService();
