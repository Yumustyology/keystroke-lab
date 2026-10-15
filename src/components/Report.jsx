import { memo, useMemo, useState } from 'react';
import { reportCharts } from '../lib/charts.js';
import { envRows, SEVERITY, statRows } from '../lib/format.js';
import { fmtTime } from '../lib/replay.js';

const SEV_ORDER = ['high', 'medium', 'low', 'info'];

function Report({ session, report, onJump }) {
  const charts = useMemo(() => reportCharts(report), [report]);
  const [showInfo, setShowInfo] = useState(true);
  const counts = SEV_ORDER.map((s) => [s, report.flags.filter((f) => f.severity === s).length]);
  const flags = report.flags.filter((f) => showInfo || f.severity !== 'info');

  return (
    <>
      <div className="report-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Flags</h2>
            <div className="sev-counts">
              {counts.map(([s, n]) => (
                <span key={s} className="sev-count" style={{ '--c': SEVERITY[s].color }}><span className="sev-dot" />{n} {SEVERITY[s].label.toLowerCase()}</span>
              ))}
            </div>
            <label className="check small"><input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} /> info</label>
          </div>
          {flags.length === 0 && <p className="muted">No flags were raised — this looks like ordinary human typing.</p>}
          {flags.map((f) => <FlagCard key={f.id} f={f} onJump={onJump} />)}
        </section>

        <section className="panel">
          <h2>Statistics</h2>
          <div className="stats">
            {statRows(report.stats).map((r) => (
              <div className="stat" key={r.label} title={r.hint}>
                <span>{r.label}</span><b>{r.value}</b><i>{r.hint}</i>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Rhythm</h2>
        <div className="charts">
          <figure className="wide">
            <figcaption>Gap before each key over the session <span className="muted">(dots: each key · line: rolling median · capped at 1.5 s)</span></figcaption>
            <div className="chart" dangerouslySetInnerHTML={{ __html: charts.timeline }} />
          </figure>
          <figure>
            <figcaption>Gap between keys <span className="muted">— people: a wide hump</span></figcaption>
            <div className="chart" dangerouslySetInnerHTML={{ __html: charts.ikiHist }} />
          </figure>
          <figure>
            <figcaption>Key hold time <span className="muted">— people: ~50–150 ms</span></figcaption>
            <div className="chart" dangerouslySetInnerHTML={{ __html: charts.holdHist }} />
          </figure>
        </div>
      </section>

      <div className="report-grid">
        <section className="panel">
          <h2>Final text</h2>
          <pre className="final">{session.finalText || <span className="muted">(empty)</span>}</pre>
        </section>
        <section className="panel">
          <h2>Details</h2>
          <table className="meta">
            <tbody>
              <tr><td>Session id</td><td className="mono small">{session.id}</td></tr>
              <tr><td>Recorded</td><td>{new Date(session.created).toLocaleString()}</td></tr>
              <tr><td>Editor</td><td>{session.mode === 'code' ? 'Code editor (auto-indent, bracket pairs)' : 'Plain text'}</td></tr>
              {session.prompt && <tr><td>Task</td><td style={{ whiteSpace: 'pre-wrap' }}>{session.prompt}</td></tr>}
              <tr><td>Events</td><td>{(session.events || []).length} events · {(session.frames || []).length} text changes</td></tr>
              <tr><td>Platform</td><td>{session.platform || '—'}</td></tr>
              <tr><td>Browser</td><td className="small">{session.ua || '—'}</td></tr>
              {envRows(session.env).map((r, i) => (
                <tr key={i} className={r.label.startsWith('  ·') ? 'sub' : undefined}><td>{r.label.trim()}</td><td className="small">{r.value}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function FlagCard({ f, onJump }) {
  const [all, setAll] = useState(false);
  const sev = SEVERITY[f.severity];
  const times = all ? f.times : f.times.slice(0, 14);
  return (
    <div className="flag" style={{ '--c': sev.color }}>
      <div className="flag-title">
        <span className="sev">{sev.label}</span>
        <b>{f.title}</b>
        {f.count ? <span className="muted"> ×{f.count}</span> : null}
      </div>
      <p>{f.detail}</p>
      {f.times.length > 0 && (
        <div className="chips">
          {times.map((t, i) => <button key={i} className="chip" onClick={() => onJump(t)} title="Jump the replay here">{fmtTime(t)}</button>)}
          {f.times.length > 14 && <button className="chip more" onClick={() => setAll(!all)}>{all ? 'fewer' : `+${f.times.length - 14} more`}</button>}
        </div>
      )}
    </div>
  );
}

export default memo(Report);
