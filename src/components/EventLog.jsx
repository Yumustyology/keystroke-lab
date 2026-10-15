import { useEffect, useMemo, useRef, useState } from 'react';
import { countUpTo, fmtTime } from '../lib/replay.js';
import { describeEvent, eventTags, SEVERITY } from '../lib/format.js';

const WINDOW = 60; // rows shown either side of the playhead

const FILTERS = {
  all: () => true,
  keys: (e) => e.k === 'd' || e.k === 'u',
  downs: (e) => e.k === 'd',
  other: (e) => e.k !== 'd' && e.k !== 'u' && e.k !== 'bi'
};

// Every event around the playhead, following the replay. Click a row to jump there.
export default function EventLog({ events, holdOf, flagMoments, t, onSeek }) {
  const [filter, setFilter] = useState('all');
  const list = useMemo(() => events.filter(FILTERS[filter]), [events, filter]);
  const flagsAt = useMemo(() => {
    const m = new Map();
    for (const { t: at, f } of flagMoments) {
      if (!m.has(at)) m.set(at, []);
      if (!m.get(at).includes(f)) m.get(at).push(f);
    }
    return m;
  }, [flagMoments]);

  const cur = countUpTo(list, t) - 1;
  const from = Math.max(0, cur - WINDOW);
  const rows = list.slice(from, Math.max(cur, 0) + WINDOW);
  let prevT = from > 0 ? list[from - 1].t : null;

  const boxRef = useRef(null);
  const curRef = useRef(null);
  useEffect(() => {
    const box = boxRef.current, row = curRef.current;
    if (box && row) box.scrollTop = row.offsetTop - box.clientHeight / 2;
  }, [cur, filter]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Event log</h2>
        <span className="muted small">{list.length} events · follows the replay · the full log is in the Events CSV</span>
        <div className="spacer" />
        <div className="seg">
          {[['all', 'All'], ['keys', 'Keys'], ['downs', 'Key downs'], ['other', 'Focus / paste / clicks']].map(([id, label]) => (
            <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="log" ref={boxRef}>
        <table>
          <thead>
            <tr><th>Time</th><th>+Δ ms</th><th>Event</th><th>Detail</th><th>Code</th><th>Hold</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {rows.map((e, i) => {
              const idx = from + i;
              const d = describeEvent(e);
              const delta = prevT == null ? '' : Math.round(e.t - prevT);
              prevT = e.t;
              const tags = eventTags(e);
              const fl = flagsAt.get(e.t) || [];
              const hold = holdOf.get(e);
              return (
                <tr
                  key={idx}
                  ref={idx === cur ? curRef : undefined}
                  className={(idx === cur ? 'cur ' : '') + (idx > cur ? 'future ' : '') + 'k-' + e.k}
                  onClick={() => onSeek(e.t)}
                >
                  <td className="mono">{fmtTime(e.t)}</td>
                  <td className="mono num">{delta}</td>
                  <td>{d.kind}</td>
                  <td className="mono">{d.text}</td>
                  <td className="mono muted">{e.code != null ? e.code || '∅' : ''}</td>
                  <td className="mono num">{hold != null ? Math.round(hold) : ''}</td>
                  <td>
                    {tags.map((x) => <span key={x} className="tag bad">{x}</span>)}
                    {fl.map((f) => <span key={f.id} className="tag" style={{ '--c': SEVERITY[f.severity].color }}>{f.title}</span>)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No events.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
