import { Store } from "pullstate";

// Drives the small green "unread" dot on the Chat tab icon (App.tsx).
//
// It mirrors the per-segment green markers inside the chat page: a segment id is
// added here at exactly the same spots Chat.tsx colours a segment button green
// (a new live message for a non-active, non-discarded channel; the initial
// markers applied on entering the chat), and removed when that segment is opened
// (read). The tab dot is shown while this set is non-empty, i.e. as long as ANY
// channel is still unread - it only turns off once every channel has been read
// (no green segment left). Because it tracks the segment markers, the startup /
// DB-fill never sets it (those don't colour segments either) - only genuinely new
// messages do.
const ChatUnreadStore = new Store<{ segments: Record<string, true> }>({
    segments: {}
});

export const markSegmentUnread = (seg: string) =>
    ChatUnreadStore.update(s => { s.segments[seg] = true; });

export const clearSegmentUnread = (seg: string) =>
    ChatUnreadStore.update(s => { delete s.segments[seg]; });

export default ChatUnreadStore;
