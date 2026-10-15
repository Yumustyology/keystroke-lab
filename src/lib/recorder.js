// Records everything a web page can observe while someone types: every key event with its
// full detail (key, code, keyCode, location, repeat, isTrusted, modifiers, Caps Lock), the
// text after every change, focus and visibility changes, paste/copy/cut, clicks and IME
// composition. Times are milliseconds since the session started (performance.now based).
import { diffText } from './diff.js';

export const SESSION_VERSION = 1;

const modBits = (e) => (e.ctrlKey ? 1 : 0) | (e.shiftKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);

export function newSession({ name, mode, initialText = '' }) {
  return {
    v: SESSION_VERSION,
    id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    name: name || 'Session ' + new Date().toLocaleString(),
    created: new Date().toISOString(),
    ua: navigator.userAgent,
    platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '',
    mode,
    initialText,
    events: [],
    frames: [],
    finalText: initialText,
    durationMs: 0
  };
}

// Starts recording into `session`. Returns { stop(), markEdit(), stats() }.
export function startRecording(session, ta, { onChange = () => {} } = {}) {
  const t0 = performance.now();
  const now = () => Math.round((performance.now() - t0) * 10) / 10;
  let prev = ta.value;
  const ev = (o) => { session.events.push({ t: now(), ...o }); onChange(); };

  const frame = () => {
    const d = diffText(prev, ta.value);
    if (!d) return;
    prev = ta.value;
    session.frames.push({ t: now(), at: d.at, del: d.del, ins: d.ins, c: ta.selectionEnd });
    session.finalText = ta.value;
    onChange();
  };

  const onKey = (e) => {
    ev({
      k: e.type === 'keydown' ? 'd' : 'u',
      key: e.key, code: e.code, kc: e.keyCode, loc: e.location, rep: e.repeat ? 1 : 0,
      tr: e.isTrusted ? 1 : 0, m: modBits(e), caps: e.getModifierState && e.getModifierState('CapsLock') ? 1 : 0,
      tgt: e.target === ta ? 1 : 0
    });
  };
  const onBefore = (e) => { if (e.target === ta) ev({ k: 'bi', it: e.inputType, d: e.data == null ? null : String(e.data).slice(0, 200) }); };
  const onInput = (e) => { if (e.target === ta) frame(); };
  const onClip = (e) => {
    const text = e.type === 'paste' ? (e.clipboardData && e.clipboardData.getData('text')) || '' : '';
    ev({ k: e.type, n: e.type === 'paste' ? text.length : ta.selectionEnd - ta.selectionStart });
  };
  const onFocus = (e) => { if (e.target === ta) ev({ k: e.type === 'focus' ? 'focus' : 'blur' }); };
  const onWin = (e) => ev({ k: e.type === 'blur' ? 'wblur' : 'wfocus' });
  const onVis = () => ev({ k: document.hidden ? 'hide' : 'show' });
  const onMouse = (e) => ev({ k: 'mouse', b: e.button, tgt: e.target === ta ? 1 : 0 });
  const onComp = (e) => ev({ k: e.type === 'compositionstart' ? 'cs' : 'ce', d: e.data || '' });

  // Capture phase on the document: logged before the editor reacts to (or cancels) a key.
  const add = [
    [document, 'keydown', onKey, true], [document, 'keyup', onKey, true],
    [document, 'beforeinput', onBefore, true], [ta, 'input', onInput, false],
    [document, 'paste', onClip, true], [document, 'copy', onClip, true], [document, 'cut', onClip, true],
    [ta, 'focus', onFocus, false], [ta, 'blur', onFocus, false],
    [window, 'blur', onWin, false], [window, 'focus', onWin, false],
    [document, 'visibilitychange', onVis, false], [document, 'mousedown', onMouse, true],
    [ta, 'compositionstart', onComp, false], [ta, 'compositionend', onComp, false]
  ];
  for (const [el, type, fn, cap] of add) el.addEventListener(type, fn, cap);

  return {
    // The code-editor behaviour edits the text itself; record that as a frame too.
    markEdit: frame,
    stop() {
      for (const [el, type, fn, cap] of add) el.removeEventListener(type, fn, cap);
      frame();
      session.durationMs = Math.round(now());
      session.finalText = ta.value;
      return session;
    }
  };
}
