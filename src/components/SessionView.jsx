import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyze, pairKeys } from '../lib/analyze.js';
import { textIndex, timeWarp, fmtTime } from '../lib/replay.js';
import { downloadsFor } from '../lib/export.js';
import { VERDICT_COLOR } from '../lib/format.js';
import Player from './Player.jsx';
import Report from './Report.jsx';
import EventLog from './EventLog.jsx';

// Flags whose moments are worth tinting red in the replay when text appears.
const SUSPECT = new Set(['ghost-input', 'big-insert', 'paste', 'unicode-packets', 'untrusted', 'shiftless', 'zero-hold', 'inhuman-speed', 'keyup-mismatch']);

function usePlayback(warp, end) {
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const seek = useCallback((x) => {
    const v = Math.max(0, Math.min(end, x));
    tRef.current = v;
    setT(v);
  }, [end]);

  useEffect(() => {
    if (!playing) return;
    let raf;
    let last = performance.now();
    const step = (now) => {
      const p = warp.toPlay(tRef.current) + (now - last) * speed;
      last = now;
      if (p >= warp.total) { tRef.current = end; setT(end); setPlaying(false); return; }
      tRef.current = warp.toReal(p);
      setT(tRef.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, warp, end]);

  const toggle = useCallback(() => {
    if (!playing && tRef.current >= end - 1) seek(0);
    setPlaying(!playing);
  }, [playing, end, seek]);

  return { t, playing, speed, setSpeed, seek, toggle, setPlaying };
}

export default function SessionView({ session, saveError, onRename, onDelete }) {
  const report = useMemo(() => analyze(session), [session]);
  const [squeeze, setSqueeze] = useState(true);
  const warp = useMemo(() => timeWarp(session, { squeeze }), [session, squeeze]);
  const end = useMemo(() => timeWarp(session).total, [session]);
  const pb = usePlayback(warp, end);
  const { toggle, seek, setPlaying, t } = pb;
  const textAt = useMemo(() => textIndex(session), [session]);
  const playerRef = useRef(null);

  const derived = useMemo(() => {
    const events = session.events || [];
    const downs = events.filter((e) => e.k === 'd');
    const { pairs, unreleased } = pairKeys(events);
    const holdOf = new Map(pairs.map((p) => [p.down, p.hold]));
    const byDown = [...pairs].sort((a, b) => a.down.t - b.down.t);
    const flagMoments = report.flags.flatMap((f) => f.times.map((t) => ({ t, f }))).sort((a, b) => a.t - b.t);
    const suspectTimes = flagMoments.filter((m) => SUSPECT.has(m.f.id)).map((m) => m.t);
    return { events, downs, holdOf, byDown, unreleased, flagMoments, suspectTimes };
  }, [session, report]);

  const jump = useCallback((at) => {
    setPlaying(false);
    seek(at - 300);
    if (playerRef.current) playerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [setPlaying, seek]);

  // Space play/pause, ←/→ step 1 s (Shift: 5 s), Home/End — unless typing in a field.
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(t - (e.shiftKey ? 5000 : 1000)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(t + (e.shiftKey ? 5000 : 1000)); }
      else if (e.key === 'Home') seek(0);
      else if (e.key === 'End') seek(end);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seek, t, end]);

  const downloads = useMemo(() => downloadsFor(session, report), [session, report]);
  const v = report.verdict;

  return (
    <div className="session">
      <section className="session-head">
        <div className="grow">
          <input
            className="title-input"
            defaultValue={session.name}
            onBlur={(e) => { if (e.target.value.trim() && e.target.value !== session.name) onRename(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            aria-label="Session name"
          />
          <div className="muted small">
            {new Date(session.created).toLocaleString()} · {session.mode === 'code' ? 'code editor' : 'plain text'} · {fmtTime(end)} · {report.stats.keydowns} key presses
          </div>
        </div>
        <div className="verdict-pill" style={{ '--c': VERDICT_COLOR[v.level] }}><span className="dot" />{v.text}</div>
        <button className="btn ghost" onClick={onDelete}>Delete</button>
      </section>

      {saveError && <div className="banner warn">Not saved in this browser: {saveError} Use “Session (JSON)” below to keep it.</div>}

      <div ref={playerRef}>
        <Player
          session={session} pb={pb} warp={warp} end={end} squeeze={squeeze} setSqueeze={setSqueeze}
          textAt={textAt} derived={derived} flags={report.flags}
        />
      </div>

      <section className="panel">
        <h2>Downloads</h2>
        <div className="downloads">
          {downloads.map((d) => (
            <button key={d.id} className="dl" onClick={d.run}>
              <b>{d.label}</b><span>{d.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <Report session={session} report={report} onJump={jump} />

      <EventLog events={derived.events} holdOf={derived.holdOf} flagMoments={derived.flagMoments} t={t} onSeek={seek} />
    </div>
  );
}
