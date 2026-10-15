import { useMemo, useRef, useState } from 'react';
import { analyze } from '../lib/analyze.js';
import { loadSession, parseSessionFiles, saveSession } from '../lib/storage.js';
import { baseName, bundleJson, download, sessionJson, summaryCsv, reportHtml } from '../lib/export.js';
import { SEVERITY, VERDICT_COLOR } from '../lib/format.js';
import { fmtTime } from '../lib/replay.js';

// Every session saved in this browser, side by side, plus import and bulk export.
export default function Library({ items, onOpen, onDelete, onChanged }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [drag, setDrag] = useState(false);

  const rows = useMemo(() => items.map((m) => {
    const s = loadSession(m.id);
    return { m, s, r: s ? analyze(s) : null };
  }), [items]);

  async function importFiles(files) {
    let ok = 0;
    const errors = [];
    for (const file of files) {
      try {
        for (const s of parseSessionFiles(await file.text())) {
          const res = saveSession(s);
          if (res.ok) ok++;
          else errors.push(`${file.name}: ${res.error}`);
        }
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`);
      }
    }
    onChanged();
    setMsg({ kind: errors.length ? 'warn' : 'ok', text: `Imported ${ok} session(s).` + (errors.length ? ' ' + errors.join(' ') : '') });
  }

  const loaded = rows.filter((x) => x.s).map((x) => x.s);

  return (
    <div
      className={'library' + (drag ? ' dragging' : '')}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); importFiles([...e.dataTransfer.files]); }}
    >
      <section className="panel">
        <div className="panel-head">
          <h2>Sessions</h2>
          <span className="muted small">Saved in this browser only · drop session files anywhere here to import</span>
          <div className="spacer" />
          <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(e) => { importFiles([...e.target.files]); e.target.value = ''; }} />
          <button className="btn ghost" onClick={() => fileRef.current.click()}>Import…</button>
          <button className="btn ghost" disabled={!loaded.length} onClick={() => download(`keystroke-lab-summary-${new Date().toISOString().slice(0, 10)}.csv`, summaryCsv(loaded), 'text/csv')}>Summary (CSV)</button>
          <button className="btn ghost" disabled={!loaded.length} onClick={() => download(`keystroke-lab-all-${new Date().toISOString().slice(0, 10)}.json`, bundleJson(loaded), 'application/json')}>All sessions (JSON)</button>
        </div>
        {msg && <div className={'banner ' + msg.kind}>{msg.text}</div>}

        {rows.length === 0 ? (
          <div className="empty">
            <p><b>No sessions yet.</b></p>
            <p className="muted">Record one on the Record tab, or import a <code>.keystrokes.json</code> file.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="sessions">
              <thead>
                <tr>
                  <th>Session</th><th>Recorded</th><th>Length</th><th className="num">Keys</th><th className="num">WPM</th>
                  <th className="num">Gap</th><th className="num">Hold</th><th className="num">Rhythm var.</th><th>Verdict</th><th>Flags</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ m, s, r }) => (
                  <tr key={m.id}>
                    <td className="cell-name"><button className="link" onClick={() => onOpen(m.id)} disabled={!s}>{m.name}</button></td>
                    <td className="small muted cell-date">{new Date(m.created).toLocaleString()}</td>
                    <td className="mono" data-label="Length">{fmtTime(m.durationMs || 0)}</td>
                    {r ? (
                      <>
                        <td className="num" data-label="Keys">{r.stats.keydowns}</td>
                        <td className="num" data-label="WPM">{r.stats.wpmWhileTyping}</td>
                        <td className="num" data-label="Gap">{r.stats.ikiMedian} ms</td>
                        <td className="num" data-label="Hold">{r.stats.holdMedian} ms</td>
                        <td className="num" data-label="Rhythm var.">{Math.round(r.stats.ikiCv * 100)}%</td>
                        <td data-label="Verdict"><span className="verdict-tag" style={{ '--c': VERDICT_COLOR[r.verdict.level] }}><span className="dot" />{r.verdict.level === 'ok' ? 'human-like' : r.verdict.level === 'medium' ? 'check' : 'automated'}</span></td>
                        <td data-label="Flags">
                          <div className="flag-dots">
                            {r.flags.filter((f) => f.severity !== 'info').map((f) => (
                              <span key={f.id} className="sev-dot" title={f.title} style={{ background: SEVERITY[f.severity].color }} />
                            ))}
                          </div>
                        </td>
                      </>
                    ) : <td colSpan={7} className="muted">missing from storage</td>}
                    <td className="row-actions">
                      {s && <button className="btn tiny ghost" onClick={() => download(baseName(s) + '-report.html', reportHtml(s, r), 'text/html')} title="Download HTML report">Report</button>}
                      {s && <button className="btn tiny ghost" onClick={() => download(baseName(s) + '.keystrokes.json', sessionJson(s), 'application/json')} title="Download session JSON">JSON</button>}
                      <button className="btn tiny ghost" onClick={() => onDelete(m.id)} title="Delete">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
