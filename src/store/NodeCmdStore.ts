import { Store } from "pullstate";

// Last raw "--command" response the node sent back, for the Advanced-Settings
// command console. `seq` increments on every captured response so the UI can tell
// a fresh answer apart from an old one (even if the text is identical).
const NodeCmdStore = new Store({
    resp: "",
    seq: 0,
});

export default NodeCmdStore;
