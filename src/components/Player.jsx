import { useEffect, useMemo, useRef } from 'react';
import { comboLabel, isPrintable } from '../lib/analyze.js';
import { countUpTo, fmtTime } from '../lib/replay.js';
import { SEVERITY } from '../lib/format.js';

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];
const keyText = (e) => (isPrintable(e) ? (e.key === ' ' ? '␣' : e.key) : comboLabel(e));

// The replay "movie": the editor as it was at time t, the keys being pressed, flags firing,
// and a timeline you can scrub.
export default function Player({ session, pb, warp, end, squeeze, setSqueeze, textAt, derived, flags }) {
  const { t, playing, speed, setSpeed, seek, toggle } = pb;
  const { downs, byDown, unreleased, flagMoments, suspectTimes } = derived;
  const state = textAt(t);
  const code = session.mode === 'code';

  // highlight the text the newest change added, red if a flag fired around it
  let hl = null;
  const last = state.last;
  if (last && last.ins.length && t - last.t < 700) {
    const i = countUpTo(suspectTimes, last.t, (x) => x);
    const near = i > 0 && last.t - suspectTimes[i - 1] < 300;
    hl = { from: last.at, to: last.at + last.ins.length, kind: near ? 'bad' : 'new' };
  }

  // keys pressed in the last 2.5 s, and keys held down right now
  const di = countUpTo(downs, t);
  const recent = downs.slice(Math.max(0, di - 12), di).filter((e) => t - e.t < 2500);
  const held = [];
  for (let i = countUpTo(byDown, t, (p) => p.down.t) - 1; i >= 0 && t - byDown[i].down.t < 15000; i--) {
    if (byDown[i].up.t > t) held.push(byDown[i].down);
  }
  for (const e of unreleased) if (e.t <= t) held.push(e);

  // flags that fired in the last moment
  const fi = countUpTo(flagMoments, t);
  const firing = [];
  for (let i = fi - 1; i >= 0 && t - flagMoments[i].t < 900; i--) {
    if (!firing.some((m) => m.f.id === flagMoments[i].f.id)) firing.push(flagMoments[i]);
  }

  const lines = state.text.split('\n');
  const caretLine = state.text.slice(0, state.caret).split('\n');
  const keysSoFar = di;

  const scrollRef = useRef(null);
  const caretRef = useRef(null);
  useEffect(() => {
    const box = scrollRef.current, c = caretRef.current;
    if (!box || !c) return;
    const top = c.offsetTop, left = c.offsetLeft;
    if (top < box.scrollTop + 10 || top > box.scrollTop + box.clientHeight - 40) box.scrollTop = Math.max(0, top - box.clientHeight / 2);
    if (left < box.scrollLeft + 10 || left > box.scrollLeft + box.clientWidth - 40) box.scrollLeft = Math.max(0, left - box.clientWidth / 2);
  });

  return (
    <section className="panel player">
      <div className="player-head">
        <h2>Replay</h2>
        <div className="firing">
          {firing.map((m) => (
            <span key={m.f.id} className="fire" style={{ '--c': SEVERITY[m.f.severity].color }}>⚑ {m.f.title}</span>
          ))}
        </div>
      </div>
      {session.prompt && <div className="task small">{session.prompt}</div>}

      <div className={'screen' + (code ? ' code' : ' prose')} ref={scrollRef}>
        <div className="screen-inner">
          {code && <pre className="gutter" aria-hidden="true">{lines.map((_, i) => i + 1).join('\n')}</pre>}
          <pre className="screen-text">{renderText(state.text, state.caret, hl, caretRef)}</pre>
        </div>
      </div>

      <div className="hud">
        <div className="hud-keys">
          {recent.map((e, i) => (
            <kbd key={e.t + ':' + i} className={e.tr === 0 || e.code === '' ? 'odd' : ''} style={{ opacity: Math.max(0.15, 1 - (t - e.t) / 2500) }}>{keyText(e)}</kbd>
          ))}
        </div>
        <div className="hud-held">
          {held.length > 0 && <span className="muted small">held</span>}
          {held.map((e, i) => <kbd key={'h' + e.t + i} className="held">{keyText(e)}</kbd>)}
        </div>
        <div className="hud-pos muted small">
          Ln {caretLine.length}, Col {caretLine[caretLine.length - 1].length + 1} · {state.text.length} chars · {keysSoFar} keys
        </div>
      </div>

      <Timeline warp={warp} downs={downs} flags={flags} t={t} onSeek={seek} />

      <div className="controls">
        <button className="btn primary play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button className="btn ghost" onClick={() => seek(0)} title="Back to start (Home)">⏮</button>
        <button className="btn ghost" onClick={() => seek(t - 5000)} title="Back 5 s (Shift+←)">−5s</button>
        <button className="btn ghost" onClick={() => seek(t + 5000)} title="Forward 5 s (Shift+→)">+5s</button>
        <span className="time">{fmtTime(t)} <span className="muted">/ {fmtTime(end)}</span></span>
        <div className="spacer" />
        <div className="speeds" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} className={'speed' + (s === speed ? ' on' : '')} onClick={() => setSpeed(s)}>{s}×</button>
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={squeeze} onChange={(e) => setSqueeze(e.target.checked)} /> Skip long pauses</label>
      </div>
    </section>
  );
}

// Text with the caret and an optional highlighted range, as React nodes.
function renderText(text, caret, hl, caretRef) {
  const cuts = new Set([0, text.length, caret]);
  if (hl) { cuts.add(hl.from); cuts.add(hl.to); }
  const pts = [...cuts].filter((x) => x >= 0 && x <= text.length).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p === caret) out.push(<span key="caret" className="caret" ref={caretRef} />);
    const q = pts[i + 1];
    if (q === undefined) break;
    const inHl = hl && p >= hl.from && q <= hl.to;
    out.push(<span key={p} className={inHl ? 'hl ' + hl.kind : undefined}>{text.slice(p, q)}</span>);
  }
  return out;
}

function Timeline({ warp, downs, flags, t, onSeek }) {
  const total = warp.total || 1;
  const BINS = 240;
  const bins = useMemo(() => {
    const arr = new Array(BINS).fill(0);
    for (const e of downs) arr[Math.min(BINS - 1, Math.floor((warp.toPlay(e.t) / total) * BINS))]++;
    return arr;
  }, [downs, warp, total]);
  const peak = Math.max(1, ...bins);
  const markers = useMemo(() => {
    const order = { info: 0, low: 1, medium: 2, high: 3 };
    const px = new Map(); // one marker per ~2px, the most severe wins
    for (const f of flags) {
      for (const at of f.times) {
        const x = Math.round((warp.toPlay(at) / total) * 500) * 2;
        const cur = px.get(x);
        if (!cur || order[f.severity] > order[cur.severity]) px.set(x, { x, severity: f.severity, title: f.title, at });
      }
    }
    return [...px.values()];
  }, [flags, warp, total]);

  const ref = useRef(null);
  const seekFrom = (e) => {
    const r = ref.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    onSeek(warp.toReal(frac * total));
  };
  const pos = (warp.toPlay(t) / total) * 100;

  return (
    <div
      className="timeline"
      ref={ref}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekFrom(e); }}
      onPointerMove={(e) => { if (e.buttons & 1) seekFrom(e); }}
      role="slider"
      aria-label="Replay position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos)}
    >
      <svg viewBox="0 0 1000 56" preserveAspectRatio="none" aria-hidden="true">
        {markers.map((m) => (
          <rect key={m.x} x={m.x - 1.5} y={2} width={3} height={12} rx={1} fill={SEVERITY[m.severity].color}>
            <title>{`${m.title} @ ${fmtTime(m.at)}`}</title>
          </rect>
        ))}
        {bins.map((c, i) => c > 0 && (
          <rect key={i} className="tl-bar" x={(i * 1000) / BINS + 0.4} width={1000 / BINS - 0.8} y={56 - (c / peak) * 36} height={(c / peak) * 36} />
        ))}
      </svg>
      <div className="tl-progress" style={{ width: pos + '%' }} />
      <div className="tl-head" style={{ left: pos + '%' }} />
    </div>
  );
}
