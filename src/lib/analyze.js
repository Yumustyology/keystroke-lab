// Turns a recorded session into a report: typing statistics and flags for anything that looks
// automated, pasted, or otherwise unlike a person at a keyboard. Pure — no DOM — so it runs the
// same in the app, in a downloaded report and in tests.
//
// Flags carry `times` (ms into the session) so the replay can jump to each one.

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS', 'CapsLock', 'Fn']);
const EDIT_KEYS = new Set(['Backspace', 'Delete', 'Enter', 'Tab']);
const CTRL = 1, SHIFT = 2, ALT = 4, META = 8;

const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : 0);
function quantile(a, q) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
}
function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}
const r1 = (x) => Math.round(x * 10) / 10;

export const isPrintable = (e) => typeof e.key === 'string' && e.key.length === 1 && !(e.m & (CTRL | ALT | META));
export function comboLabel(e) {
  const parts = [];
  if (e.m & CTRL) parts.push('Ctrl');
  if (e.m & ALT) parts.push('Alt');
  if (e.m & SHIFT && !(isPrintable(e) && e.key.length === 1)) parts.push('Shift');
  if (e.m & META) parts.push('Win/Cmd');
  const k = e.key === ' ' ? 'Space' : e.key;
  if (!MODIFIER_KEYS.has(e.key)) parts.push(k && k.length === 1 ? k.toUpperCase() : k);
  else if (!parts.length) parts.push(e.key);
  return parts.join('+');
}

// keydown ↔ keyup pairs (by physical code, falling back to key) with hold times.
export function pairKeys(events) {
  const open = new Map();
  const pairs = [];
  for (const e of events) {
    if (e.k !== 'd' && e.k !== 'u') continue;
    const id = e.code || 'key:' + e.key;
    if (e.k === 'd') {
      if (!e.rep) open.set(id, e);
    } else if (open.has(id)) {
      const d = open.get(id);
      open.delete(id);
      pairs.push({ down: d, up: e, hold: e.t - d.t });
    }
  }
  return { pairs, unreleased: [...open.values()] };
}

export function analyze(session) {
  const events = session.events || [];
  const frames = session.frames || [];
  const downs = events.filter((e) => e.k === 'd');
  const typingDowns = downs.filter((e) => !e.rep && !(e.m & (CTRL | ALT | META)) && (isPrintable(e) || EDIT_KEYS.has(e.key)));
  const printable = downs.filter((e) => !e.rep && isPrintable(e));
  const backspaces = downs.filter((e) => !e.rep && (e.key === 'Backspace' || e.key === 'Delete'));
  const { pairs, unreleased } = pairKeys(events);
  const holds = pairs.filter((p) => !MODIFIER_KEYS.has(p.down.key)).map((p) => p.hold);

  // inter-key intervals between typing keys; long gaps are pauses, not rhythm
  const gaps = [];
  for (let i = 1; i < typingDowns.length; i++) gaps.push({ ms: typingDowns[i].t - typingDowns[i - 1].t, at: typingDowns[i].t, from: typingDowns[i - 1].t });
  const rhythm = gaps.filter((g) => g.ms < 2000).map((g) => g.ms);
  const pauses = gaps.filter((g) => g.ms >= 2000).map((g) => ({ at: g.from, ms: g.ms }));

  const first = events.length ? events[0].t : 0;
  const last = events.length ? events[events.length - 1].t : 0;
  const durationMs = Math.max(session.durationMs || 0, last - first);
  const activeMs = sum(rhythm);
  const inserted = sum(frames.map((f) => f.ins.length));
  const deleted = sum(frames.map((f) => f.del));
  const finalChars = (session.finalText || '').length - (session.initialText || '').length;
  const minutes = durationMs / 60000;

  // focus: time spent away from the page / the editor
  // Each spell away is 'tab' if the page was hidden during it (tab switch, minimise), else
  // 'window': the page stayed visible but another window or app took the keyboard.
  const away = [];
  let awayFrom = null, hidden = false;
  for (const e of events) {
    if ((e.k === 'wblur' || e.k === 'hide') && awayFrom == null) awayFrom = e.t;
    if (e.k === 'hide' && awayFrom != null) hidden = true;
    if ((e.k === 'wfocus' || e.k === 'show') && awayFrom != null) { away.push({ at: awayFrom, ms: e.t - awayFrom, kind: hidden ? 'tab' : 'window' }); awayFrom = null; hidden = false; }
  }
  if (awayFrom != null) away.push({ at: awayFrom, ms: last - awayFrom, kind: hidden ? 'tab' : 'window' });

  const stats = {
    durationMs: Math.round(durationMs),
    activeTypingMs: Math.round(activeMs),
    keydowns: downs.length,
    typingKeys: typingDowns.length,
    printableKeys: printable.length,
    corrections: backspaces.length,
    correctionRate: printable.length ? r1((backspaces.length / printable.length) * 100) : 0,
    charsInserted: inserted,
    charsDeleted: deleted,
    finalChars,
    lines: (session.finalText || '').split('\n').length,
    wpmOverall: minutes > 0 ? r1(finalChars / 5 / minutes) : 0,
    wpmWhileTyping: activeMs > 0 ? r1(finalChars / 5 / (activeMs / 60000)) : 0,
    ikiMedian: Math.round(quantile(rhythm, 0.5)),
    ikiMean: Math.round(mean(rhythm)),
    ikiP10: Math.round(quantile(rhythm, 0.1)),
    ikiP90: Math.round(quantile(rhythm, 0.9)),
    ikiCv: rhythm.length > 1 ? r1(sd(rhythm) / mean(rhythm) * 100) / 100 : 0,
    holdMedian: Math.round(quantile(holds, 0.5)),
    holdMin: holds.length ? Math.round(Math.min(...holds)) : 0,
    holdMax: holds.length ? Math.round(Math.max(...holds)) : 0,
    holdCv: holds.length > 1 ? r1(sd(holds) / mean(holds) * 100) / 100 : 0,
    pauses: pauses.length,
    longestPauseMs: pauses.length ? Math.round(Math.max(...pauses.map((p) => p.ms))) : 0,
    awayCount: away.length,
    awayMs: Math.round(sum(away.map((a) => a.ms))),
    pastes: events.filter((e) => e.k === 'paste').length
  };

  const flags = [];
  const flag = (id, severity, title, detail, times = []) => flags.push({ id, severity, title, detail, times: times.slice(0, 200), count: times.length || undefined });

  // ---- signs of synthetic input ----
  const packets = downs.filter((e) => e.kc === 231 || (e.code === '' && !['Process', 'Unidentified', 'Dead'].includes(e.key) && !MODIFIER_KEYS.has(e.key)));
  if (packets.length) flag('unicode-packets', 'high', 'Keys sent as Unicode packets', `${packets.length} key press(es) had no physical key code (event.code is empty, keyCode ${packets[0].kc}). Real keyboards always report which key was pressed; this is what software that "types" characters directly produces.`, packets.map((e) => e.t));

  const untrusted = events.filter((e) => (e.k === 'd' || e.k === 'u') && e.tr === 0);
  if (untrusted.length) flag('untrusted', 'high', 'Script-generated key events', `${untrusted.length} key event(s) had isTrusted = false — they were created by JavaScript on the page, not by the operating system.`, untrusted.map((e) => e.t));

  const shiftless = printable.filter((e) => /^[A-Z]$/.test(e.key) && !(e.m & SHIFT) && !e.caps);
  const symbolNoShift = printable.filter((e) => /^[!@#$%^&*()_+{}|:"<>?~]$/.test(e.key) && !(e.m & SHIFT) && e.code && /^(Digit|Bracket|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Minus|Equal)/.test(e.code));
  if (shiftless.length + symbolNoShift.length) flag('shiftless', 'high', 'Capitals or symbols without Shift', `${shiftless.length + symbolNoShift.length} character(s) that need Shift arrived without Shift held (and Caps Lock off).`, [...shiftless, ...symbolNoShift].map((e) => e.t));

  const instant = pairs.filter((p) => !MODIFIER_KEYS.has(p.down.key) && p.hold < 8);
  if (instant.length) {
    const share = holds.length ? instant.length / holds.length : 0;
    flag('zero-hold', share > 0.1 ? 'high' : 'medium', 'Keys released instantly', `${instant.length} key(s) were held for under 8 ms (${Math.round(share * 100)}% of key presses). A finger keeps a key down for roughly 50–150 ms.`, instant.map((p) => p.down.t));
  }

  const mismatched = pairs.filter((p) => p.down.key !== p.up.key && p.down.key.toLowerCase() !== p.up.key.toLowerCase() && !MODIFIER_KEYS.has(p.down.key));
  if (mismatched.length) flag('keyup-mismatch', 'medium', 'Key-up does not match key-down', `${mismatched.length} key(s) were released as a different key than was pressed (e.g. pressed "${mismatched[0].down.key}", released "${mismatched[0].up.key}").`, mismatched.map((p) => p.down.t));

  // text that appeared with no key press just before it (and not from a paste or IME)
  const keyTimes = downs.map((e) => e.t);
  const pasteTimes = events.filter((e) => e.k === 'paste' || e.k === 'ce' || e.k === 'drop').map((e) => e.t);
  let ki = 0;
  const ghost = [];
  for (const f of frames) {
    if (!f.ins) continue;
    while (ki < keyTimes.length && keyTimes[ki] <= f.t) ki++;
    const lastKey = ki ? keyTimes[ki - 1] : -Infinity;
    const nearPaste = pasteTimes.some((t) => f.t - t >= 0 && f.t - t < 300);
    if (f.t - lastKey > 250 && !nearPaste) ghost.push(f);
  }
  if (ghost.length) flag('ghost-input', 'high', 'Text appeared without a key press', `${ghost.length} change(s) to the text had no key press in the 250 ms before them and were not a paste — e.g. "${ghost[0].ins.slice(0, 30)}". That is how scripts or autofill insert text.`, ghost.map((f) => f.t));

  // ---- rhythm ----
  if (rhythm.length >= 30 && stats.ikiCv < 0.25) flag('metronome', stats.ikiCv < 0.12 ? 'high' : 'medium', 'Unnaturally even rhythm', `The time between keys barely varies (variation ${Math.round(stats.ikiCv * 100)}%). People typically vary by 40–80%: fast on familiar letter pairs, slower around symbols and words.`);
  if (holds.length >= 30 && stats.holdCv < 0.1) flag('even-holds', 'medium', 'Every key held for the same time', `Key hold times barely vary (variation ${Math.round(stats.holdCv * 100)}%), typical of generated input.`);

  const fastRuns = [];
  let run = [];
  for (const g of gaps) {
    if (g.ms < 25) run.push(g.at);
    else { if (run.length >= 8) fastRuns.push(run[0]); run = []; }
  }
  if (run.length >= 8) fastRuns.push(run[0]);
  if (fastRuns.length) flag('inhuman-speed', 'high', 'Bursts faster than a person can type', `${fastRuns.length} stretch(es) of 8+ keys under 25 ms apart.`, fastRuns);
  if (stats.wpmWhileTyping > 160) flag('very-fast', 'medium', 'Very high typing speed', `${stats.wpmWhileTyping} words per minute while typing — beyond all but competitive typists.`);
  if (printable.length > 150 && backspaces.length === 0) flag('no-corrections', 'low', 'Not a single correction', `${printable.length} characters typed without one Backspace. Most people fix a few typos.`);

  // ---- pasting and leaving ----
  const pastes = events.filter((e) => e.k === 'paste');
  if (pastes.length) flag('paste', pastes.some((p) => p.n > 20) ? 'high' : 'medium', 'Pasted text', `${pastes.length} paste(s), ${sum(pastes.map((p) => p.n || 0))} characters in total.`, pastes.map((e) => e.t));
  const bigJumps = frames.filter((f) => f.ins.length > 8 && !pasteTimes.some((t) => f.t - t >= 0 && f.t - t < 300) && !/^\n[ \t]*(\n[ \t]*)?$/.test(f.ins));
  if (bigJumps.length) flag('big-insert', 'medium', 'Large blocks inserted at once', `${bigJumps.length} change(s) added more than 8 characters in one go (not a paste, not an auto-indent).`, bigJumps.map((f) => f.t));
  const secsAway = (list) => Math.round(sum(list.map((a) => a.ms)) / 100) / 10;
  const winAway = away.filter((a) => a.kind === 'window');
  if (winAway.length) flag('window-blur', 'high', 'Window lost focus', `The browser window lost keyboard focus ${winAway.length} time(s), ${secsAway(winAway)} s in total, while the page stayed on screen — another app, window or overlay took the keyboard.`, winAway.map((a) => a.at));
  const tabAway = away.filter((a) => a.kind === 'tab');
  if (tabAway.length) flag('left-tab', 'medium', 'Left the tab', `The page was hidden ${tabAway.length} time(s), ${secsAway(tabAway)} s in total — switched tab or minimised the browser.`, tabAway.map((a) => a.at));
  // the editor losing focus on its own (a click elsewhere on the page) — not when the whole window did
  const leaveTimes = events.filter((e) => e.k === 'wblur' || e.k === 'hide').map((e) => e.t);
  const editorBlurs = events.filter((e) => e.k === 'blur' && !leaveTimes.some((t) => Math.abs(t - e.t) < 150));
  if (editorBlurs.length) flag('editor-blur', 'low', 'Editor lost focus', `The editor lost focus ${editorBlurs.length} time(s) while the page kept it (e.g. a click elsewhere on the page).`, editorBlurs.map((e) => e.t));

  // ---- shortcuts the page could see ----
  const combos = downs.filter((e) => !MODIFIER_KEYS.has(e.key) && (e.m & (CTRL | ALT | META)));
  if (combos.length) {
    const names = [...new Set(combos.map(comboLabel))];
    flag('shortcuts', 'info', 'Keyboard shortcuts pressed in the page', `${combos.length} shortcut press(es): ${names.slice(0, 12).join(', ')}${names.length > 12 ? '…' : ''}.`, combos.map((e) => e.t));
  }
  // a modifier pressed and released with no other key while it was down: the rest of the
  // shortcut went to another app (a global hotkey) — the page only sees the modifiers
  const lonely = [];
  for (const p of pairs) {
    if (!MODIFIER_KEYS.has(p.down.key) || p.down.key === 'CapsLock') continue;
    const between = downs.some((e) => e.t > p.down.t && e.t < p.up.t && !MODIFIER_KEYS.has(e.key));
    if (!between) lonely.push(p);
  }
  if (lonely.length) {
    const kinds = [...new Set(lonely.map((p) => p.down.key))];
    flag('lone-modifiers', 'low', 'Modifier keys pressed on their own', `${lonely.length} press(es) of ${kinds.join('/')} with no other key — what a page sees when an app's global shortcut (e.g. Ctrl+Shift+B) is used: the modifiers, but not the final key.`, lonely.map((p) => p.down.t));
  }
  if (unreleased.filter((e) => !MODIFIER_KEYS.has(e.key)).length) flag('stuck-keys', 'info', 'Keys never released', `${unreleased.length} key(s) were pressed but no release was recorded (the release may have happened outside the page).`, unreleased.map((e) => e.t));
  const repeats = downs.filter((e) => e.rep);
  if (repeats.length) flag('auto-repeat', 'info', 'Keys held down to repeat', `${repeats.length} auto-repeat event(s) (a key held down).`, repeats.map((e) => e.t));

  // ---- environment ----
  const env = session.env || {};
  if (env.device && env.device.webdriver) flag('webdriver', 'high', 'Browser under automation', 'navigator.webdriver was true: the browser is being driven by Selenium, Playwright, Puppeteer or similar.');
  if (env.device && env.device.screensExtended) flag('multi-screen', 'low', 'More than one screen', 'The computer had more than one display attached during the session.');
  const srv = env.network && env.network.server;
  if (srv && srv.ipsSeen && srv.ipsSeen.length > 1) flag('other-ips', 'medium', 'Other IPs connected to the lab', `${srv.ipsSeen.length} different IP addresses were connected to the lab server during the session: ${srv.ipsSeen.map((x) => x.ip).join(', ')}.`);

  if (pauses.length) flag('pauses', 'info', 'Thinking pauses', `${pauses.length} pause(s) of 2 s or more; longest ${r1(stats.longestPauseMs / 1000)} s.`, pauses.map((p) => p.at));

  const weight = { high: 3, medium: 2, low: 1, info: 0 };
  const score = sum(flags.map((f) => weight[f.severity]));
  const verdict = flags.some((f) => f.severity === 'high') || score >= 5
    ? { level: 'high', text: flags.filter((f) => f.severity === 'high').every((f) => f.id === 'window-blur') && flags.some((f) => f.id === 'window-blur') ? 'Focus left the window during the session' : 'Strong signs of automated or pasted input' }
    : score >= 2 ? { level: 'medium', text: 'Some signs worth checking' } : { level: 'ok', text: 'Looks like a person typing' };
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  flags.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    stats, flags, verdict, pauses, away,
    series: {
      iki: gaps.map((g) => ({ t: g.at, ms: Math.min(g.ms, 3000) })),
      holds: pairs.filter((p) => !MODIFIER_KEYS.has(p.down.key)).map((p) => ({ t: p.down.t, ms: p.hold }))
    }
  };
}
