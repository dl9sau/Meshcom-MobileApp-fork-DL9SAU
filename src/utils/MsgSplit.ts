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

export function splitForAir(text: string, opts: SplitOpts = {}): string[] {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX;
  const prefixFirst = opts.prefixFirst ?? "";
  const prefixCont = opts.prefixCont ?? "";
  const t = text.replace(/\r\n?/g, "\n");

  // fast path: fits one packet with just the first prefix -> no marker, no tag
  if (byteLen(prefixFirst + t) <= maxBytes) return [prefixFirst + t];

  // split into word chunks, each leaving room for its prefix + the marker
  const tag = opts.tag ?? rand2();
  const chunks: string[] = [];
  let rest = t;
  let k = 0;
  while (rest.length > 0 && k <= 99) {
    const prefix = k === 0 ? prefixFirst : prefixCont;
    const budget = maxBytes - byteLen(prefix) - MARKER_RESERVE;
    if (budget <= 0) break; // pathological: prefix bigger than the packet
    if (byteLen(rest) <= budget) { chunks.push(rest); break; }

    const chars = Array.from(rest);
    const cut = fitCodePoints(chars, budget);
    const fitStr = chars.slice(0, cut).join("");
    // break between words: back up to the last whitespace inside the fitting slice;
    // if there is none (one very long word / URL) hard-cut at the byte boundary.
    const lastWs = Math.max(fitStr.lastIndexOf(" "), fitStr.lastIndexOf("\n"));
    const breakAt = lastWs > 0 ? lastWs : fitStr.length;
    chunks.push(rest.slice(0, breakAt).replace(/\s+$/, ""));
    rest = rest.slice(breakAt).replace(/^\s+/, "");
    k++;
  }

  const n = chunks.length;
  return chunks.map((c, i) => `${i === 0 ? prefixFirst : prefixCont}${c} (${i + 1}/${n} ${tag})`);
}
