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

    // Distinct callsigns known to the database (retention-bounded). This is a SNAPSHOT and
    // has to be re-read: in the Info tab the panel mounts once and the effect used to fire
    // only on mount and when the NodeInfo packet fills in the callsign - i.e. seconds after
    // the connect, right after the retention purge and BEFORE this session's traffic is in
    // the database. The figure then froze on the purge leftovers while `calls` next to it
    // ran up (field test 2026-08-23: "3 in database" against "calls 10" after a 14-day gap).
    // So: re-read whenever a new station appears, debounced - the row is written to the
    // database a moment AFTER the counter, so an immediate query would be one station short,
    // and a burst of new stations would otherwise trigger a burst of queries.
    useEffect(() => {
        let alive = true;
        const t = setTimeout(() => {
            DatabaseService.getStatsDb(ownCall).then(n => { if (alive && n >= 0) StatsService.setDbCalls(n); }).catch(() => {});
        }, 1500);
        return () => { alive = false; clearTimeout(t); };
    }, [ownCall, s.callsAll]);

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
                    unique stations · direct {s.callsDirect} · hf {s.callsHf} · gw {s.callsGw}
                </span>
            </div>
            {/* Two different readings, both misread in the field test on 2026-08-23:
                (1) the rows above are TOTALS (packets), this one is UNIQUE (stations) -
                    "#pos direct 2" next to "calls direct 1" is two beacons of the same
                    station, not a contradiction. That is what "packets" up at `rx` and
                    "unique stations" here are for.
                (2) the station columns OVERLAP: whoever was heard both directly and through
                    a relay is in `direct` AND in `hf`, so their sum can exceed the total.
                    Hence the caption below. It names direct/hf because that is the case
                    that actually occurs: the category is a property of a single RECEPTION,
                    so `gw` can overlap too in principle - but only once a station's 12h/24h
                    HF evidence has lapsed WITHIN the same session, which needs the app to
                    run for half a day. Not worth the words in a panel this narrow. */}
            <div className="stats-row">
                <span className="stats-key"></span>
                <span className="stats-num"></span>
                <span className="stats-dim">direct and hf may overlap</span>
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
