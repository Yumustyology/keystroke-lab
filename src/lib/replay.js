// Rebuilds the editor's text at any moment of a session, for the replay "movie".
import { applyDiff } from './diff.js';

// How many items of a time-sorted array happened at or before t (binary search).
export function countUpTo(arr, t, get = (x) => x.t) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (get(arr[mid]) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const caretAfter = (f) => (f.c != null ? f.c : f.at + f.ins.length);

// The text and caret after every frame up to (and including) time t.
export function stateAt(session, t) {
  let text = session.initialText || '';
  let caret = text.length;
  let i = 0;
  const frames = session.frames || [];
  for (; i < frames.length && frames[i].t <= t; i++) {
    text = applyDiff(text, frames[i]);
    caret = caretAfter(frames[i]);
  }
  return { text, caret, frameIndex: i };
}

// stateAt for playback: keeps a checkpoint every 64 frames so any seek replays at most 63
// edits. Returns at(t) → { text, caret, frameIndex, last } (last = the newest frame applied).
const EVERY = 64;
export function textIndex(session) {
  const frames = session.frames || [];
  let text = session.initialText || '';
  let caret = text.length;
  const marks = [{ i: 0, text, caret }];
  for (let i = 0; i < frames.length; i++) {
    text = applyDiff(text, frames[i]);
    caret = caretAfter(frames[i]);
    if ((i + 1) % EVERY === 0) marks.push({ i: i + 1, text, caret });
  }
  return function at(t) {
    const n = countUpTo(frames, t);
    const m = marks[Math.min(marks.length - 1, Math.floor(n / EVERY))];
    let { text, caret } = m;
    for (let i = m.i; i < n; i++) {
      text = applyDiff(text, frames[i]);
      caret = caretAfter(frames[i]);
    }
    return { text, caret, frameIndex: n, last: n ? frames[n - 1] : null };
  };
}

// Maps real session time to playback time when long pauses are squeezed to `cap` ms, so a
// replay doesn't sit still through a 40-second think. Returns { toPlay, toReal, total }.
export function timeWarp(session, { squeeze = false, cap = 1200 } = {}) {
  const marks = [...new Set([0, ...(session.events || []).map((e) => e.t), ...(session.frames || []).map((f) => f.t)])].sort((a, b) => a - b);
  const end = Math.max(session.durationMs || 0, marks[marks.length - 1] || 0);
  if (!squeeze) return { toPlay: (t) => t, toReal: (p) => p, total: end };
  const segs = []; // [realStart, realEnd, playStart, playEnd]
  let play = 0;
  for (let i = 0; i < marks.length; i++) {
    const a = marks[i];
    const b = i + 1 < marks.length ? marks[i + 1] : end;
    const len = b - a;
    const p = len > cap ? cap : len;
    segs.push([a, b, play, play + p]);
    play += p;
  }
  // first segment whose end (real: [1], play: [3]) is at or after x; the last one past the end
  const find = (x, real) => {
    const k = real ? 1 : 3;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid][k] >= x) hi = mid;
      else lo = mid + 1;
    }
    return segs[lo];
  };
  return {
    total: play,
    toPlay: (t) => { const s = find(t, true); if (!s) return t; const f = s[1] > s[0] ? (t - s[0]) / (s[1] - s[0]) : 0; return s[2] + f * (s[3] - s[2]); },
    toReal: (p) => { const s = find(p, false); if (!s) return p; const f = s[3] > s[2] ? (p - s[2]) / (s[3] - s[2]) : 0; return s[0] + f * (s[1] - s[0]); }
  };
}

export const fmtTime = (ms) => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
