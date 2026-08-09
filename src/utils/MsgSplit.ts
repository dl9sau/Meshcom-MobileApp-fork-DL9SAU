// MsgSplit
// Split an outgoing message into on-air parts that each fit the LoRa text byte
// budget. The split is BYTE-accurate (UTF-8), word-boundary aware, and never cuts a
// multi-byte character (umlaut / emoji) in half. A "(i/n Xx)" marker and an optional
// per-part prefix are added ONLY when it actually splits - a message that fits one
// packet is sent verbatim, with no overhead.
//
// Xx is a short per-message tag so a reader can group parts of the SAME message even
// when several multi-part messages interleave in a lossy mesh (the (n/m) alone can't:
// "1/2" from message A and "2/2" from message B would look like one complete pair).
// There is NO auto-reassembly on receive - the marker is for the human; the sender's
// per-part ack/resend covers a lost part.

const enc = new TextEncoder();
export const byteLen = (s: string): number => enc.encode(s).length;

export interface SplitOpts {
  // on-air text budget per packet. 150 is the safe limit across firmware paths: the
  // phone path itself does no length check, extudp rejects >150, the CLI path >160.
  maxBytes?: number;
  prefixFirst?: string; // prepended to part 1 (e.g. "> DO3BOX: " for a forward)
  prefixCont?: string;  // prepended to parts 2..n (e.g. "> DO3BOX " for attribution B)
  tag?: string;         // 2-char group id; a random one is used when omitted
  // how to distribute a message that must split (same MINIMAL packet count either way):
  //  'balanced' (default) - even-sized parts, so no part sits at the risky max length
  //                         -> shorter packets, better delivery odds
  //  'greedy'             - fill front-first (part 1 packed full) -> the gist lands in
  //                         part 1/2, survives if a later part is lost
  method?: 'balanced' | 'greedy';
}

const DEFAULT_MAX = 150;

// number of leading code points of `chars` whose UTF-8 length is <= budget (never
// splits a code point). At least 1 so we always make progress.
const fitCodePoints = (chars: string[], budget: number): number => {
  let bytes = 0, i = 0;
  for (; i < chars.length; i++) {
    const cb = byteLen(chars[i]);
    if (bytes + cb > budget) break;
    bytes += cb;
  }
  return i === 0 ? 1 : i;
};

const rand2 = (): string => {
  const a = "0123456789abcdefghijklmnopqrstuvwxyz";
  // Math.random is fine in the app (only workflow scripts forbid it)
  return a[Math.floor(Math.random() * 36)] + a[Math.floor(Math.random() * 36)];
};

// how many packets a text needs - for the live compose indicator
export const splitCount = (text: string, opts: SplitOpts = {}): number =>
  splitForAir(text, opts).length;

// cut the largest word-bounded, UTF-8-safe prefix of `rest` that fits `budget` bytes.
// returns [head, tail]: head right-trimmed (keeps leading indentation), tail left-trimmed.
//
// `atomicBudget` is what a part could hold if it were NOT squeezed (the full per-part
// budget). When the fitting slice lies entirely inside ONE token - a URL, a long word -
// and that token would fit into a packet of its own, we refuse to chop it and return an
// empty head instead: the caller then gives the token the full budget. Chopping a URL
// across two packets makes it unusable, which is far worse than an uneven split.
// Only a token longer than a whole packet is hard-cut, because then there is no choice.
const cutOne = (rest: string, budget: number, atomicBudget: number): [string, string] => {
  const chars = Array.from(rest);
  const cut = fitCodePoints(chars, budget);
  const fitStr = chars.slice(0, cut).join("");
  // break between words: back up to the last whitespace inside the fitting slice
  const lastWs = Math.max(fitStr.lastIndexOf(" "), fitStr.lastIndexOf("\n"));
  if (lastWs > 0) {
    return [rest.slice(0, lastWs).replace(/\s+$/, ""), rest.slice(lastWs).replace(/^\s+/, "")];
  }
  // no whitespace in the fitting slice -> we are inside the leading token
  const wsPos = rest.search(/\s/);
  const token = wsPos < 0 ? rest : rest.slice(0, wsPos);
  if (byteLen(token) <= atomicBudget) return ["", rest];   // caller: retry with full budget
  return [fitStr.replace(/\s+$/, ""), rest.slice(fitStr.length).replace(/^\s+/, "")];
};

export function splitForAir(text: string, opts: SplitOpts = {}): string[] {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX;
  const prefixFirst = opts.prefixFirst ?? "";
  const prefixCont = opts.prefixCont ?? "";
  const method = opts.method ?? 'balanced';
  const t = text.replace(/\r\n?/g, "\n");

  // fast path: fits one packet with just the first prefix -> no marker, no tag
  if (byteLen(prefixFirst + t) <= maxBytes) return [prefixFirst + t];

  const tag = opts.tag ?? rand2();
  const prefixFor = (i: number) => (i === 0 ? prefixFirst : prefixCont);

  // EXACT marker width for a run of n parts. Reserving the worst case (" (99/99 Xx)")
  // for every message wastes 2 bytes on the ~all of them that need fewer than 10 parts -
  // and because we only break at word boundaries, those 2 bytes usually cost a whole
  // WORD, not 2 characters, and can push a tail into a packet of its own. So compute it
  // from the actual part count instead. `i` is never wider than `n`, so n/n is the widest
  // the marker can get within one run.
  const markerBytes = (n: number) => byteLen(` (${n}/${n} ${tag})`);

  const buildChunks = (reserve: number): string[] => {
    const fullBudget = (i: number) => maxBytes - byteLen(prefixFor(i)) - reserve;

    // GREEDY pass - fill each part to the max; this also fixes the minimal part count N
    const greedy: string[] = [];
    {
      let rest = t;
      while (rest.length > 0 && greedy.length <= 99) {
        const budget = fullBudget(greedy.length);
        if (budget <= 0) break; // pathological: prefix bigger than the packet
        if (byteLen(rest) <= budget) { greedy.push(rest); break; }
        // greedy already uses the full budget, so atomicBudget == budget: a token that
        // doesn't fit here fits nowhere and is hard-cut.
        const [head, tail] = cutOne(rest, budget, budget);
        if (!head) break;
        greedy.push(head); rest = tail;
      }
    }

    // BALANCED pass - spread the content evenly over the SAME number of parts, so no
    // part sits at the risky maximum. Each part takes an even share of what's left
    // (capped at its hard budget). Only accepted if it still fits in <= N parts;
    // otherwise (word boundaries pile up on the tail) we keep the greedy result.
    if (method === 'balanced' && greedy.length > 1) {
      const N = greedy.length;
      const balanced: string[] = [];
      let rest = t;
      let ok = true;
      while (rest.length > 0) {
        const i = balanced.length;
        if (i >= N) { ok = false; break; } // needed more than N parts -> give up
        const even = Math.ceil(byteLen(rest) / (N - i));
        const full = fullBudget(i);
        const budget = Math.min(even, full);
        if (budget <= 0) { ok = false; break; }
        if (byteLen(rest) <= budget) { balanced.push(rest); rest = ""; break; }
        // the even share may be smaller than a leading URL/long word - cutOne then hands
        // back an empty head rather than chopping it, and we give that part the full budget
        let [head, tail] = cutOne(rest, budget, full);
        if (!head) [head, tail] = cutOne(rest, full, full);
        if (!head) { ok = false; break; }
        balanced.push(head); rest = tail;
      }
      if (ok && rest === "") return balanced;
    }
    return greedy;
  };

  // The reserve depends on the part count and the part count depends on the reserve, so
  // start optimistic (a 2-part run) and only widen if the result actually needs more
  // digits. Monotone - the reserve only grows - so this settles after a pass or two.
  let reserve = markerBytes(2);
  let chunks = buildChunks(reserve);
  for (let pass = 0; pass < 4; pass++) {
    const need = markerBytes(chunks.length);
    if (need <= reserve) break;
    reserve = need;
    chunks = buildChunks(reserve);
  }

  const n = chunks.length;
  return chunks.map((c, i) => `${prefixFor(i)}${c} (${i + 1}/${n} ${tag})`);
}
