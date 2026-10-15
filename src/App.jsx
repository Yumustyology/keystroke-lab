import { useState } from 'react';
import Recorder from './components/Recorder.jsx';
import SessionView from './components/SessionView.jsx';
import Library from './components/Library.jsx';
import { deleteSession, listSessions, loadSession, saveSession } from './lib/storage.js';

export default function App() {
  const [view, setView] = useState('record');
  const [items, setItems] = useState(() => listSessions());
  const [current, setCurrent] = useState(null); // { session, saveError }
  const [recording, setRecording] = useState(false);
  const refresh = () => setItems(listSessions());

  function open(id) {
    const s = loadSession(id);
    if (!s) { alert('That session could not be loaded from browser storage.'); refresh(); return; }
    setCurrent({ session: s, saveError: null });
    setView('session');
  }

  function onRecorded(s) {
    const r = saveSession(s);
    refresh();
    setCurrent({ session: s, saveError: r.ok ? null : r.error });
    setView('session');
  }

  function rename(name) {
    const s = { ...current.session, name: name.trim() || current.session.name };
    const r = saveSession(s);
    refresh();
    setCurrent({ session: s, saveError: r.ok ? null : r.error });
  }

  function remove(id) {
    if (!confirm('Delete this session from this browser? Download it first if you want to keep it.')) return;
    deleteSession(id);
    refresh();
    if (current && current.session.id === id) { setCurrent(null); setView('library'); }
  }

  const tab = (id, label, disabled = false) => (
    <button className={'tab' + (view === id ? ' active' : '')} disabled={disabled} onClick={() => setView(id)}>{label}</button>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">⌨</span>Keystroke Lab</div>
        <nav className="tabs">
          {tab('record', recording ? '● Recording' : 'Record')}
          {tab('library', `Sessions (${items.length})`, recording)}
          {current && tab('session', 'Replay & report', recording)}
        </nav>
      </header>
      <main className="main">
        {view === 'record' && <Recorder onRecorded={onRecorded} onRecordingChange={setRecording} />}
        {view === 'library' && <Library items={items} onOpen={open} onDelete={remove} onChanged={refresh} />}
        {view === 'session' && current && (
          <SessionView key={current.session.id} session={current.session} saveError={current.saveError} onRename={rename} onDelete={() => remove(current.session.id)} />
        )}
      </main>
    </div>
  );
}
