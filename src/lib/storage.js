// Saved sessions live in this browser's localStorage: an index plus one entry per session.
// Every read and write is guarded — storage can be full, blocked or wiped — and the UI always
// offers a download as the durable copy.
const INDEX = 'kslab.index';
const KEY = (id) => 'kslab.session.' + id;

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export function listSessions() {
  const idx = read(INDEX, []);
  return Array.isArray(idx) ? idx : [];
}

export function loadSession(id) {
  return read(KEY(id), null);
}

// Returns { ok, error }.
export function saveSession(session) {
  const meta = {
    id: session.id, name: session.name, created: session.created, durationMs: session.durationMs,
    keys: session.events.filter((e) => e.k === 'd').length, chars: (session.finalText || '').length
  };
  try {
    localStorage.setItem(KEY(session.id), JSON.stringify(session));
    const idx = listSessions().filter((m) => m.id !== session.id);
    idx.unshift(meta);
    localStorage.setItem(INDEX, JSON.stringify(idx));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: /quota/i.test(String(e && e.name) + String(e && e.message)) ? 'Browser storage is full — download the session to keep it, then delete old ones.' : String(e && e.message || e) };
  }
}

export function deleteSession(id) {
  try {
    localStorage.removeItem(KEY(id));
    localStorage.setItem(INDEX, JSON.stringify(listSessions().filter((m) => m.id !== id)));
  } catch { /* nothing to do */ }
}

export function renameSession(id, name) {
  const s = loadSession(id);
  if (!s) return;
  s.name = name;
  saveSession(s);
}

// A downloaded session file, checked enough to replay safely.
export function parseSessionFile(text) {
  return checkSession(JSON.parse(text));
}

function checkSession(data) {
  const s = data && data.session ? data.session : data;
  if (!s || !Array.isArray(s.events) || !Array.isArray(s.frames)) throw new Error('That file is not a Keystroke Lab session.');
  if (!s.id) s.id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
  if (typeof s.initialText !== 'string') s.initialText = '';
  if (typeof s.finalText !== 'string') s.finalText = s.initialText;
  return s;
}

// A session file or a bundle of them ({ sessions: [...] }) → an array of sessions.
export function parseSessionFiles(text) {
  const data = JSON.parse(text);
  const list = data && Array.isArray(data.sessions) ? data.sessions : [data];
  return list.map(checkSession);
}
