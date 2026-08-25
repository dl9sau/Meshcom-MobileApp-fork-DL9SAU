import { MsgType } from "./AppInterfaces";

// PUT THE PARTS OF A SPLIT MESSAGE BACK IN ORDER - for the DISPLAY only.
//
// A long message goes out as several packets, each ending in a marker "(i/n xx)" that
// MsgSplit appends (xx = a random 2-character group id, so two multi-part messages sent
// around the same time cannot be confused for one). On a mesh the parts can arrive out of
// order, and then they are read out of order - which is exactly what a correspondent
// reported in the field (2026-08-25).
//
// What this does: gather the parts of one group at the position of the FIRST one that
// arrived and sort them by their part number. What it deliberately does NOT do:
//   - no reassembly into one message. The parts keep their own timestamps and acks; a
//     joined text would also have to be held somewhere, and the packet budget is exactly
//     what we are working around here (decision DL9SAU).
//   - no invention. A missing part stays a visible gap - that is what the marker is for -
//     and a part that arrives later (after a resend) simply slots into its place.
//   - nothing is dropped, including a duplicate part; it just ends up next to its twin.
//
// Anchoring at the first arrival, not at part 1, keeps the message where its CONTEXT is:
// the conversation around it stays readable, instead of the whole thing jumping down among
// messages that came in ten minutes later.

// Parts are grouped only while they sit within this span OF EACH OTHER - measured against
// the group's first part, never against "now". That matters: a rule like "within the last
// hour" would silently un-sort a group once it aged out, and the same conversation would
// look different tomorrow. The tag has 36^2 = 1296 values and the sender must match too,
// so a collision needs a lot of long messages from one station in one window (DL9SAU).
const GROUP_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface PartMarker { idx: number; total: number; tag: string; }

// "text … (2/3 a7)" -> { idx: 2, total: 3, tag: "a7" }, or null when there is no marker
export const parsePartMarker = (text: string): PartMarker | null => {
    const m = /\((\d+)\/(\d+) ([0-9a-z]{2})\)\s*$/.exec(text || "");
    if (!m) return null;
    const idx = parseInt(m[1], 10), total = parseInt(m[2], 10);
    if (!(idx >= 1) || !(total >= 2) || idx > total) return null;   // 1/1 is not a split
    return { idx, total, tag: m[3] };
};

interface Group { firstAt: number; firstTs: number; members: { at: number; part: number }[]; }

// Reorder for display. Returns the same messages - same objects, none added or removed.
export const orderMultipart = (msgs: MsgType[]): MsgType[] => {
    if (!msgs || msgs.length < 2) return msgs;

    // key -> the groups seen for it, newest last (a key can repeat after the window)
    const groups = new Map<string, Group[]>();
    let anySplit = false;

    msgs.forEach((msg, at) => {
        const mk = parsePartMarker(msg.msgTXT);
        if (!mk) return;
        anySplit = true;
        const key = (msg.fromCall || "").toUpperCase() + "|" + mk.tag + "|" + mk.total;
        const list = groups.get(key) ?? [];
        const open = list[list.length - 1];
        const ts = msg.timestamp ?? 0;
        if (open && ts - open.firstTs <= GROUP_WINDOW_MS) {
            open.members.push({ at, part: mk.idx });
        } else {
            list.push({ firstAt: at, firstTs: ts, members: [{ at, part: mk.idx }] });
            groups.set(key, list);
        }
    });
    if (!anySplit) return msgs;

    // position -> the members to emit there; and the positions to skip because their
    // message has been pulled up to its group
    const emitAt = new Map<number, number[]>();
    const moved = new Set<number>();
    groups.forEach(list => list.forEach(g => {
        if (g.members.length < 2) return;                  // single part: leave it alone
        const order = g.members
            .slice()
            .sort((a, b) => (a.part - b.part) || (a.at - b.at))
            .map(m => m.at);
        emitAt.set(g.firstAt, order);
        order.forEach(at => { if (at !== g.firstAt) moved.add(at); });
    }));
    if (emitAt.size === 0) return msgs;

    const out: MsgType[] = [];
    msgs.forEach((msg, at) => {
        const order = emitAt.get(at);
        if (order) { order.forEach(i => out.push(msgs[i])); return; }
        if (!moved.has(at)) out.push(msg);
    });
    return out;
};
