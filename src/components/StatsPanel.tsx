import { useEffect } from 'react';
import StatsStore from '../store/StatsStore';
import NodeRuntimeStore from '../store/NodeRuntimeStore';
import DatabaseService from '../DBservices/DataBaseService';
import StatsService from '../utils/StatsService';
import './StatsPanel.css';

// "MY STATS" - what THIS node received since the app connected, sorted by packet type
// and by how it reached us. Shared by the map overlay (FAB) and the Info tab so both
// always show the same figures.
//
// All counts are UNIQUE packets: the firmware dedups by msg_id before handing anything
// to the app, so these are messages - not airtime. That also means the app can never
// show "packets on air" or retransmissions; those would need firmware counters.
export const StatsPanel: React.FC<{ ownCall: string, onClose?: () => void }> = ({ ownCall, onClose }) => {
    const s = StatsStore.useState(x => x);
    const nodeInfoMap = NodeRuntimeStore.useState(x => x.info);
    // "me" comes from NodeRuntimeService for our own callsign - the very same numbers as
    // our own node overlay, so the two can never disagree
    const me = nodeInfoMap[(ownCall || "").toUpperCase()];

    // distinct callsigns known to the database (retention-bounded), loaded once on open
    useEffect(() => {
        let alive = true;
        DatabaseService.getStatsDb(ownCall).then(n => { if (alive && n >= 0) StatsService.setDbCalls(n); }).catch(() => {});
        return () => { alive = false; };
    }, [ownCall]);

    const sum = (c: { direct: number, hf: number, gw: number }) => c.direct + c.hf + c.gw;
    const total = sum(s.pos) + sum(s.msg) + sum(s.dm);

    // one row: label, total, and the direct/hf/gw breakdown. `gw` is omitted for
    // positions, which are never gatewayed.
    const Row = (props: { label: string, c: { direct: number, hf: number, gw: number }, noGw?: boolean }) => (
        <div className="stats-row">
            <span className="stats-key">{props.label}</span>
            <span className="stats-num">{sum(props.c)}</span>
            <span className="stats-dim">
                direct {props.c.direct} · hf {props.c.hf}{props.noGw ? '' : ` · gw ${props.c.gw}`}
            </span>
        </div>
    );

    return (
        <div className="stats-panel" onClick={onClose}>
            <div className="stats-title">MY STATS · since connect</div>
            <div className="stats-row">
                <span className="stats-key">rx</span>
                <span className="stats-num">{total}</span>
                <span className="stats-dim">packets, deduplicated</span>
            </div>
            <Row label="#pos" c={s.pos} noGw />
            <Row label="#msg" c={s.msg} />
            <Row label="#dm" c={s.dm} />
            <div className="stats-sep" />
            <div className="stats-row">
                <span className="stats-key">calls</span>
                <span className="stats-num">{s.callsAll}</span>
                <span className="stats-dim">
                    direct {s.callsDirect} · hf {s.callsHf} · gw {s.callsGw}
                </span>
            </div>
            {s.dbCalls >= 0 &&
                <div className="stats-row">
                    <span className="stats-key"></span>
                    <span className="stats-num">{s.dbCalls}</span>
                    {/* NOT "everything ever": the database is pruned by the retention
                        settings (2 days for ALL, 7 for groups/positions, 90 for my DMs),
                        so this is "as far back as we still keep" - which is the useful
                        horizon anyway. */}
                    <span className="stats-dim">in database (retention window)</span>
                </div>}
            <div className="stats-sep" />
            <div className="stats-row">
                <span className="stats-key">me</span>
                <span className="stats-num"></span>
                <span className="stats-dim">
                    #msg {me?.msgCount ?? 0} sent · #pos {me?.posCount ?? 0} heard-back
                </span>
            </div>
        </div>
    );
};
