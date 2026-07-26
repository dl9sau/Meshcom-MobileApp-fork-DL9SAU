import NodeRuntimeStore, { NodeRuntimeInfo } from "../store/NodeRuntimeStore";

// Tracks, at app runtime, per-node routing info (hops/path) and counters
// (#position reports / #messages). The authoritative records live here in a
// Map; NodeRuntimeStore mirrors them so the UI can react.
class NodeRuntimeService {

    private info: Map<string, NodeRuntimeInfo> = new Map();

    private norm(call: string): string {
        return (call || "").toUpperCase().trim();
    }

    private ensure(call: string): NodeRuntimeInfo {
        let rec = this.info.get(call);
        if (!rec) {
            rec = { hops: -1, path: "", posCount: 0, msgCount: 0, groups: "" };
            this.info.set(call, rec);
        }
        return rec;
    }

    private mirror(call: string, rec: NodeRuntimeInfo) {
        NodeRuntimeStore.update(s => {
            s.info = { ...s.info, [call]: { ...rec } };
        });
    }

    // record hop count + route path for a node (last one wins)
    setPath(call: string, hops: number, path: string) {
        const c = this.norm(call);
        if (c === "") return;
        const rec = this.ensure(c);
        if (rec.hops === hops && rec.path === path) return; // no change
        rec.hops = hops;
        rec.path = path;
        this.mirror(c, rec);
    }

    // record the booked talk groups for a node (last one wins)
    setGroups(call: string, groups: string) {
        const c = this.norm(call);
        if (c === "") return;
        const rec = this.ensure(c);
        if (rec.groups === groups) return; // no change
        rec.groups = groups;
        this.mirror(c, rec);
    }

    incPos(call: string) {
        const c = this.norm(call);
        if (c === "") return;
        const rec = this.ensure(c);
        rec.posCount++;
        this.mirror(c, rec);
    }

    incMsg(call: string) {
        const c = this.norm(call);
        if (c === "") return;
        const rec = this.ensure(c);
        rec.msgCount++;
        this.mirror(c, rec);
    }

    get(call: string): NodeRuntimeInfo | undefined {
        return this.info.get(this.norm(call));
    }

    clear() {
        this.info.clear();
        NodeRuntimeStore.update(s => { s.info = {}; });
    }
}

export default new NodeRuntimeService();
