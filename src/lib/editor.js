// Makes a plain <textarea> behave like a code editor (VS Code, LeetCode, CodeMirror):
// auto-indent on Enter, auto-closed brackets you can type over, Backspace removing an empty
// pair, a closing bracket on a blank line snapping back one level, Tab inserting spaces.
// That is what Aperture's auto-type expects on a coding page, so it has to be here for a
// fair test. Every edit made here (rather than by the browser) is reported through onEdit.
import { diffText } from './diff.js';

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);
const INDENT = '    ';

export function attachIdeBehavior(ta, { onEdit = () => {}, enabled = () => true } = {}) {
  let autos = new Set(); // positions of closers the editor inserted itself
  let prev = ta.value;

  // Keep the auto-closer positions in step with any edit, ours or the browser's.
  function track() {
    const d = diffText(prev, ta.value);
    prev = ta.value;
    if (!d) return;
    const shifted = new Set();
    for (const pos of autos) {
      if (pos < d.at) shifted.add(pos);
      else if (pos >= d.at + d.del) shifted.add(pos - d.del + d.ins.length);
    }
    autos = shifted;
  }

  function edit(start, end, text, caret) {
    ta.setRangeText(text, start, end, 'end');
    const at = caret == null ? start + text.length : caret;
    ta.selectionStart = ta.selectionEnd = at;
    track();
    onEdit();
  }

  const lineStart = (pos) => ta.value.lastIndexOf('\n', pos - 1) + 1;
  const indentAt = (pos) => /^[ \t]*/.exec(ta.value.slice(lineStart(pos)))[0];

  function onKeyDown(e) {
    if (!enabled() || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    const { selectionStart: s, selectionEnd: t, value } = ta;
    const sel = s !== t;
    const before = value[s - 1];
    const after = value[t];

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      edit(s, t, INDENT);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const indent = indentAt(s);
      const trimmedLine = value.slice(lineStart(s), s).trimEnd();
      const opens = (before && OPEN[before]) || trimmedLine.endsWith(':');
      if (!sel && before && OPEN[before] && after === OPEN[before]) {
        // between a pair: the closer drops onto its own line below
        const mid = '\n' + indent + INDENT;
        edit(s, t, mid + '\n' + indent, s + mid.length);
      } else {
        edit(s, t, '\n' + indent + (opens ? INDENT : ''));
      }
      return;
    }
    if (sel) return; // anything else with a selection: let the browser replace it
    if (OPEN[e.key]) {
      if (after === undefined || /\s/.test(after) || CLOSE.has(after)) {
        e.preventDefault();
        edit(s, t, e.key + OPEN[e.key], s + 1);
        autos.add(s + 1);
      }
      return;
    }
    if (CLOSE.has(e.key)) {
      if (after === e.key && autos.has(s)) {
        e.preventDefault(); // type over the closer the editor already put there
        autos.delete(s);
        ta.selectionStart = ta.selectionEnd = s + 1;
        onEdit();
        return;
      }
      const ls = lineStart(s);
      if (!value.slice(ls, s).trim()) {
        e.preventDefault(); // a closer on a blank line snaps back one level
        const indent = value.slice(ls, s);
        edit(ls, s, indent.slice(0, Math.max(0, indent.length - INDENT.length)) + e.key);
      }
      return;
    }
    if (e.key === 'Backspace' && before && OPEN[before] && after === OPEN[before] && autos.has(s)) {
      e.preventDefault();
      edit(s - 1, s + 1, '');
    }
  }

  ta.addEventListener('keydown', onKeyDown);
  ta.addEventListener('input', track);
  return {
    reset() { autos = new Set(); prev = ta.value; },
    detach() { ta.removeEventListener('keydown', onKeyDown); ta.removeEventListener('input', track); }
  };
}
