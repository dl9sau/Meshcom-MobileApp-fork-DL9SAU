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
// reserve room for the biggest marker we'd realistically add: " (99/99 Xx)"
const MARKER_RESERVE = byteLen(" (99/99 Xx)");

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
const cutOne = (rest: string, budget: number): [string, string] => {
  const chars = Array.from(rest);
  const cut = fitCodePoints(chars, budget);
  const fitStr = chars.slice(0, cut).join("");
  // break between words: back up to the last whitespace inside the fitting slice; if
  // there is none (one very long word / URL) hard-cut at the byte boundary.
  const lastWs = Math.max(fitStr.lastIndexOf(" "), fitStr.lastIndexOf("\n"));
  const breakAt = lastWs > 0 ? lastWs : fitStr.length;
  return [rest.slice(0, breakAt).replace(/\s+$/, ""), rest.slice(breakAt).replace(/^\s+/, "")];
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
  const fullBudget = (i: number) => maxBytes - byteLen(prefixFor(i)) - MARKER_RESERVE;

  // GREEDY pass - fill each part to the max; this also fixes the minimal part count N
  const greedy: string[] = [];
  {
    let rest = t;
    while (rest.length > 0 && greedy.length <= 99) {
      const budget = fullBudget(greedy.length);
      if (budget <= 0) break; // pathological: prefix bigger than the packet
      if (byteLen(rest) <= budget) { greedy.push(rest); break; }
      const [head, tail] = cutOne(rest, budget);
      if (!head) break;
      greedy.push(head); rest = tail;
    }
  }

  let chunks = greedy;

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
      const budget = Math.min(even, fullBudget(i));
      if (budget <= 0) { ok = false; break; }
      if (byteLen(rest) <= budget) { balanced.push(rest); rest = ""; break; }
      const [head, tail] = cutOne(rest, budget);
      if (!head) { ok = false; break; }
      balanced.push(head); rest = tail;
    }
    if (ok && rest === "") chunks = balanced;
  }

  const n = chunks.length;
  return chunks.map((c, i) => `${prefixFor(i)}${c} (${i + 1}/${n} ${tag})`);
}
