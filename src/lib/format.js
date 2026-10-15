// Labels and formatting shared by the app and the downloaded reports.
import { fmtTime } from './replay.js';
import { comboLabel, isPrintable } from './analyze.js';

export const SEVERITY = {
  high: { label: 'High', color: '#ef4444' },
  medium: { label: 'Medium', color: '#f59e0b' },
  low: { label: 'Low', color: '#3b82f6' },
  info: { label: 'Info', color: '#8b93a7' }
};
export const VERDICT_COLOR = { high: '#ef4444', medium: '#f59e0b', ok: '#22c55e' };

export const pct = (x) => Math.round((x || 0) * 100) + '%';
export const secs = (ms) => (ms >= 60000 ? fmtTime(ms) : (ms / 1000).toFixed(1) + ' s');

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const slug = (s) => (s || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'session';

export function statRows(s) {
  return [
    ['Duration', secs(s.durationMs), 'Start to stop'],
    ['Active typing', secs(s.activeTypingMs), 'Key gaps under 2 s, summed'],
    ['Speed (overall)', s.wpmOverall + ' wpm', 'Final characters ÷ 5, per minute'],
    ['Speed (while typing)', s.wpmWhileTyping + ' wpm', 'Same, pauses left out'],
    ['Key presses', s.keydowns, `${s.printableKeys} characters · ${s.typingKeys} typing keys`],
    ['Corrections', s.corrections, `${s.correctionRate}% of characters typed`],
    ['Gap between keys', s.ikiMedian + ' ms', `median · p10 ${s.ikiP10} – p90 ${s.ikiP90} ms`],
    ['Rhythm variation', pct(s.ikiCv), 'People usually 40–80%'],
    ['Key hold time', s.holdMedian + ' ms', `median · range ${s.holdMin}–${s.holdMax} ms`],
    ['Hold variation', pct(s.holdCv), 'Spread of hold times'],
    ['Pauses ≥ 2 s', s.pauses, s.pauses ? `longest ${secs(s.longestPauseMs)}` : 'none'],
    ['Time away', secs(s.awayMs), `left the page ${s.awayCount} time(s)`],
    ['Pastes', s.pastes, ''],
    ['Final text', s.finalChars + ' chars', `+${s.charsInserted} / −${s.charsDeleted} · ${s.lines} lines`]
  ].map(([label, value, hint]) => ({ label, value: String(value), hint }));
}

const keyText = (e) => (isPrintable(e) ? (e.key === ' ' ? 'Space' : e.key) : comboLabel(e));

// One line of the event log: { kind, text }.
export function describeEvent(e) {
  switch (e.k) {
    case 'd': return { kind: e.rep ? 'repeat' : 'key ↓', text: keyText(e) };
    case 'u': return { kind: 'key ↑', text: keyText(e) };
    case 'bi': return { kind: 'input', text: (e.it || '') + (e.d != null && e.d !== '' ? ` “${e.d}”` : '') };
    case 'paste': return { kind: 'paste', text: `${e.n} characters` };
    case 'copy':
    case 'cut': return { kind: e.k, text: `${e.n} characters selected` };
    case 'focus': return { kind: 'focus', text: 'editor focused' };
    case 'blur': return { kind: 'blur', text: 'editor lost focus' };
    case 'wblur': return { kind: 'window', text: 'window lost focus' };
    case 'wfocus': return { kind: 'window', text: 'window focused' };
    case 'hide': return { kind: 'page', text: 'page hidden (tab switch / minimise)' };
    case 'show': return { kind: 'page', text: 'page visible again' };
    case 'mouse': return { kind: 'click', text: (['left', 'middle', 'right'][e.b] || 'button ' + e.b) + (e.tgt ? ' in editor' : ' outside editor') };
    case 'cs': return { kind: 'IME', text: 'composition start' };
    case 'ce': return { kind: 'IME', text: `composition end “${e.d || ''}”` };
    default: return { kind: e.k, text: '' };
  }
}

// Per-event warnings visible on a single key event.
export function eventTags(e) {
  const tags = [];
  if ((e.k === 'd' || e.k === 'u') && e.tr === 0) tags.push('untrusted');
  if (e.k === 'd' && (e.kc === 231 || (e.code === '' && !['Process', 'Unidentified', 'Dead'].includes(e.key)))) tags.push('no key code');
  return tags;
}

// The device and network rows for a session's Details: [{ label, value }].
export function envRows(env) {
  if (!env) return [{ label: 'Network & device', value: 'Not recorded (session made before this was added)' }];
  const rows = [];
  const add = (label, value) => rows.push({ label, value: value == null || value === '' ? '—' : String(value) });
  const net = env.network || {};
  const srv = net.server;
  if (srv && srv.samples) {
    add('Your IP (lab server)', srv.you);
    add('IPs connected to lab', `${srv.ipsSeen.length} distinct IP(s) during the session · peak ${srv.peakDistinctIps} at once, ${srv.peakClients} tab(s)`);
    for (const ip of srv.ipsSeen) add(ip.isYou ? '  · ' + ip.ip + ' (you)' : '  · ' + ip.ip, ip.uas.join(' | '));
  } else {
    add('IPs connected to lab', net.serverAvailable === false ? 'Lab server not available (static build)' : 'No data');
  }
  const w = net.webrtc;
  if (w) {
    add('Public IP (STUN)', w.stun ? (w.public.length ? w.public.join(', ') : w.error || 'none returned') : 'lookup was off');
    add('Local IPs (WebRTC)', (w.local.length ? w.local.join(', ') : 'none visible') + (w.hiddenLocal ? ` · ${w.hiddenLocal} hidden by the browser (.local)` : ''));
    if (w.relay.length) add('Relay IPs', w.relay.join(', '));
  } else {
    add('Public / local IPs', 'Lookup had not finished');
  }
  const d = env.device;
  if (d) {
    add('Browser automation', d.webdriver ? 'YES — navigator.webdriver is true' : 'no (navigator.webdriver false)');
    add('Screen', `${d.screen.w}×${d.screen.h} @ ${d.screen.dpr}x · ${d.screensExtended == null ? 'screen count unknown' : d.screensExtended ? 'more than one screen' : 'one screen'}`);
    add('Window', `${d.window.w}×${d.window.h} (outer ${d.window.outerW}×${d.window.outerH})`);
    add('Connection', d.connection ? `${d.connection.effectiveType}${d.connection.type ? ' / ' + d.connection.type : ''} · ~${d.connection.downlinkMbps} Mbps · ~${d.connection.rttMs} ms RTT` : 'not reported by this browser');
    add('Hardware', `${d.cores || '?'} CPU threads · ${d.memoryGb ? '≥' + d.memoryGb + ' GB' : '? GB'} memory · ${d.touchPoints} touch points`);
    add('Locale', `${d.languages.join(', ')} · ${d.timezone} (UTC${d.utcOffsetMin >= 0 ? '+' : '−'}${Math.abs(d.utcOffsetMin / 60)})`);
  }
  return rows;
}
