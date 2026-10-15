import { useEffect, useRef, useState } from 'react';
import { attachIdeBehavior } from '../lib/editor.js';
import { newSession, startRecording } from '../lib/recorder.js';
import { analyze } from '../lib/analyze.js';
import { fmtTime } from '../lib/replay.js';
import { SEVERITY, VERDICT_COLOR } from '../lib/format.js';
import { deviceInfo, mergeServerPing, pingServer, webrtcIps } from '../lib/environment.js';

const PREFS = 'kslab.prefs';
function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; }
}
function writePrefs(p) {
  try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch { /* prefs are a convenience */ }
}

export default function Recorder({ onRecorded, onRecordingChange }) {
  const prefs = useRef(readPrefs()).current;
  const taRef = useRef(null);
  const recRef = useRef(null);
  const ideRef = useRef(null);
  const sessionRef = useRef(null);
  const [mode, setMode] = useState(prefs.mode || 'code');
  const modeRef = useRef(mode);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState(prefs.prompt || '');
  const [starter, setStarter] = useState(prefs.starter || '');
  const [autoStart, setAutoStart] = useState(prefs.autoStart !== false);
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState(null);
  const [lookupPublic, setLookupPublic] = useState(prefs.lookupPublic !== false);
  const [webrtc, setWebrtc] = useState(null);
  const [ping, setPing] = useState(null);
  const webrtcRef = useRef(null);
  // After a discard, focus coming back to the editor (e.g. when the confirm dialog closes)
  // must not start a new recording; only a real click or the Start button does.
  const holdRef = useRef(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { writePrefs({ mode, prompt, starter, autoStart, lookupPublic }); }, [mode, prompt, starter, autoStart, lookupPublic]);

  // Network: WebRTC IPs once (again if the STUN choice changes); lab-server ping every 5 s,
  // folded into the session while recording.
  useEffect(() => {
    let alive = true;
    setWebrtc(null);
    webrtcIps({ stun: lookupPublic }).then((r) => {
      if (!alive) return;
      webrtcRef.current = r;
      setWebrtc(r);
      const s = sessionRef.current;
      if (recRef.current && s && s.env && !s.env.network.webrtc) s.env.network.webrtc = r;
    });
    return () => { alive = false; };
  }, [lookupPublic]);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s = recRef.current ? sessionRef.current : null;
      const r = await pingServer(s ? s.id : null);
      if (!alive) return;
      setPing(r);
      if (s && s.env) s.env.network.server = mergeServerPing(s.env.network.server, r);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [recording]);
  useEffect(() => {
    onRecordingChange(recording);
    return () => onRecordingChange(false); // stopping unmounts us before the next run
  }, [recording, onRecordingChange]);

  // Code-editor behaviour lives on the textarea for the component's lifetime; it only acts in
  // code mode and reports its own edits to the recorder.
  useEffect(() => {
    const ide = attachIdeBehavior(taRef.current, {
      enabled: () => modeRef.current === 'code',
      onEdit: () => recRef.current && recRef.current.markEdit()
    });
    ideRef.current = ide;
    return () => ide.detach();
  }, []);

  // While idle the editor shows the starter text.
  useEffect(() => { if (!recording && taRef.current) taRef.current.value = starter; }, [starter, recording]);

  // Leaving the page mid-recording drops the listeners.
  useEffect(() => () => { if (recRef.current) recRef.current.stop(); }, []);

  // Live feedback: the same analysis the report uses, once a second.
  useEffect(() => {
    if (!recording) return;
    const t0 = performance.now();
    const update = () => {
      const s = sessionRef.current;
      if (!s) return;
      const elapsed = performance.now() - t0;
      setLive({ elapsed, report: analyze({ ...s, durationMs: elapsed }) });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [recording]);

  function start() {
    if (recRef.current) return;
    const ta = taRef.current;
    ta.value = starter;
    const s = newSession({ name: name.trim() || undefined, mode, initialText: ta.value });
    s.prompt = prompt;
    s.env = {
      device: deviceInfo(),
      network: { webrtc: webrtcRef.current, server: ping ? mergeServerPing(null, ping) : null, serverAvailable: !!ping }
    };
    sessionRef.current = s;
    ideRef.current.reset();
    recRef.current = startRecording(s, ta);
    setRecording(true);
  }

  function begin() {
    holdRef.current = false;
    start();
    const ta = taRef.current;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  }

  function stop() {
    if (!recRef.current) return;
    const s = recRef.current.stop();
    recRef.current = null;
    setRecording(false);
    setLive(null);
    setName('');
    onRecorded(s);
  }

  function discard() {
    if (!recRef.current) return;
    if (!confirm('Throw away this recording?')) return;
    recRef.current.stop();
    recRef.current = null;
    sessionRef.current = null;
    setRecording(false);
    setLive(null);
    holdRef.current = true;
    taRef.current.value = starter;
    taRef.current.blur();
  }

  const r = live && live.report;
  const keepFocus = (e) => e.preventDefault(); // buttons don't steal focus from the editor

  return (
    <div className="recorder">
      <section className="panel setup">
        <div className="setup-row">
          <label className="field grow">
            <span>Session name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aperture auto-type, run 3" disabled={recording} />
          </label>
          <label className="field">
            <span>Editor</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={recording}>
              <option value="code">Code editor (auto-indent, brackets)</option>
              <option value="text">Plain text</option>
            </select>
          </label>
        </div>
        <details className="more" open={!!(prompt || starter)}>
          <summary>Task and starter text</summary>
          <div className="setup-row">
            <label className="field grow">
              <span>Task shown above the editor (optional)</span>
              <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={recording} placeholder="e.g. Write a function that reverses a linked list." />
            </label>
            <label className="field grow">
              <span>Starter text already in the editor (optional)</span>
              <textarea rows={3} className="mono" value={starter} onChange={(e) => setStarter(e.target.value)} disabled={recording} placeholder={'def solve(nums):\n    '} spellCheck={false} />
            </label>
          </div>
        </details>
      </section>

      <div className="rec-grid">
        <section className="panel editor-panel">
          <div className="editor-head">
            {recording
              ? <span className="rec-badge"><span className="rec-dot" />Recording · {fmtTime(live ? live.elapsed : 0)}</span>
              : <span className="muted">{autoStart ? 'Recording starts when you click into the editor.' : 'Press Start, then type.'}</span>}
            <div className="spacer" />
            {!recording && (
              <label className="check">
                <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} /> Start on click
              </label>
            )}
            {!recording && <button className="btn primary" onMouseDown={keepFocus} onClick={begin}>Start recording</button>}
            {recording && <button className="btn ghost" onMouseDown={keepFocus} onClick={discard}>Discard</button>}
            {recording && <button className="btn danger" onMouseDown={keepFocus} onClick={stop}>■ Stop &amp; analyse</button>}
          </div>
          {prompt && <div className="task">{prompt}</div>}
          <textarea
            ref={taRef}
            className={'editor ' + (mode === 'code' ? 'mono' : 'prose') + (recording ? ' live' : '')}
            readOnly={!recording}
            onMouseDown={() => { holdRef.current = false; if (autoStart && !recRef.current) start(); }}
            onFocus={() => { if (autoStart && !recRef.current && !holdRef.current) start(); }}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            placeholder={recording ? '' : 'Click here to start recording…'}
            aria-label="Typing editor"
          />
        </section>

        <aside className="panel live-panel">
          <h2>Live feedback</h2>
          {!r && <p className="muted small">Numbers and flags appear here as you (or Aperture) type. Nothing leaves this browser.</p>}
          {r && (
            <>
              <div className="verdict-line" style={{ '--c': VERDICT_COLOR[r.verdict.level] }}><span className="dot" />{r.verdict.text}</div>
              <div className="mini-stats">
                <div><b>{r.stats.keydowns}</b><span>keys</span></div>
                <div><b>{r.stats.finalChars}</b><span>chars</span></div>
                <div><b>{r.stats.wpmWhileTyping}</b><span>wpm</span></div>
                <div><b>{r.stats.ikiMedian}</b><span>ms gap</span></div>
                <div><b>{r.stats.holdMedian}</b><span>ms hold</span></div>
                <div><b>{r.stats.corrections}</b><span>fixes</span></div>
              </div>
              <ul className="live-flags">
                {r.flags.length === 0 && <li className="muted small">No flags yet.</li>}
                {r.flags.map((f) => (
                  <li key={f.id} title={f.detail}>
                    <span className="sev-dot" style={{ background: SEVERITY[f.severity].color }} />
                    {f.title}{f.count ? <span className="muted"> ×{f.count}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="net-box">
            <div className="net-head">
              <span className="net-title">Network</span>
              <span className={'net-status ' + (ping ? 'on' : 'off')}>{ping ? 'lab server connected' : 'no lab server'}</span>
            </div>
            <div className="net-row">
              <span className="net-label">Connected to lab</span>
              {ping ? (
                <div className="net-value">
                  <span className="net-count"><b>{ping.distinctIps}</b> IP{ping.distinctIps === 1 ? '' : 's'}</span>
                  <span className="net-count"><b>{ping.connectedClients}</b> tab{ping.connectedClients === 1 ? '' : 's'}</span>
                </div>
              ) : <span className="net-value muted">Not available in a static build</span>}
            </div>
            {ping && (
              <div className="net-row">
                <span className="net-label">Your IP</span>
                <div className="net-value"><span className="ip-chip">{ping.you.ip}</span></div>
              </div>
            )}
            <div className="net-row">
              <span className="net-label">Public IP</span>
              <div className="net-value">
                {!lookupPublic ? <span className="muted">Lookup off</span>
                  : !webrtc ? <span className="muted">Looking up…</span>
                    : webrtc.public.length ? webrtc.public.map((ip) => <span key={ip} className="ip-chip">{ip}</span>)
                      : <span className="muted">{webrtc.error || 'None returned'}</span>}
              </div>
            </div>
            <div className="net-row">
              <span className="net-label">Local IPs</span>
              <div className="net-value">
                {!webrtc ? <span className="muted">…</span>
                  : webrtc.local.length ? webrtc.local.map((ip) => <span key={ip} className="ip-chip">{ip}</span>)
                    : <span className="muted">None visible</span>}
                {webrtc && webrtc.hiddenLocal > 0 && <span className="net-note">{webrtc.hiddenLocal} hidden by the browser</span>}
              </div>
            </div>
            <label className="net-toggle">
              <input type="checkbox" checked={lookupPublic} disabled={recording} onChange={(e) => setLookupPublic(e.target.checked)} />
              <span>
                <b>Look up public IP</b>
                <span className="muted">Asks Google's STUN server</span>
              </span>
            </label>
          </div>
          <details className="tips">
            <summary>Testing Aperture</summary>
            <ol className="small">
              <li>Click into the editor — recording starts.</li>
              <li>Trigger Aperture's auto-type (its hotkey or overlay) and let it finish.</li>
              <li>Press <b>Stop &amp; analyse</b> to watch the replay and read the report.</li>
              <li>Record yourself typing the same text as a human baseline, then compare in Sessions.</li>
            </ol>
          </details>
        </aside>
      </div>
    </div>
  );
}
