# Keystroke Lab

A research page for checking what a web page can see while someone — or something, like
Aperture's auto-type — types into it. It records every keystroke, lets you replay the session
like a movie, and writes a report that flags anything that doesn't look like a person at a keyboard.
Everything runs and stays in the browser.

**Live:** https://yumustyology.github.io/keystroke-lab/ (the hosted copy has no lab server, so
"IPs connected to the lab" shows as not available there — run it locally for that).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Using it

1. **Record** — name the session, pick the editor (code editor with auto-indent and bracket pairs,
   or plain text), and optionally set a task and starter text. Clicking into the editor starts
   recording (or untick *Start on click* and use the button). The side panel gives live feedback:
   verdict, speed, rhythm and flags as they fire.
2. **Stop & analyse** opens the replay and report.
3. **Replay** — play, pause, scrub the timeline, 0.25×–16×, *Skip long pauses*. The editor rebuilds
   exactly as it was; new text is highlighted (red when a flag fired there), the keys being pressed and
   held show underneath, and flags pop up as they happen. Keyboard: Space, ←/→ (Shift = 5 s), Home/End.
4. **Report** — verdict, flags with clickable timestamps, statistics (speed, key gaps, hold times,
   rhythm variation, corrections, pauses, time away, pastes) and rhythm charts. The event log follows
   the playhead; click a row to jump.
5. **Sessions** — every saved session side by side; import files (or drop them on the page), and
   export a summary CSV or a bundle of all sessions.

## Network and device details

Every session records, in its Details (and in the HTML/JSON reports and the summary CSV):

- **IPs connected to the lab** — the lab's dev server (`server/net-plugin.js`) is pinged every 5 s
  and reports the typist's IP plus every other IP/tab connected during the session. Only works via
  `npm run dev` / `npm run lab` (or `vite preview`), not a static build. By default the server only
  listens on this machine; run `npm run lab -- --host` to let other devices on the network connect.
- **Public IP** via WebRTC and Google's STUN server (can be switched off on the Record tab).
- **Local IPs** via WebRTC — modern browsers usually hide these behind random `.local` names.
- **Device**: screen size and whether more than one screen is attached, window size, connection
  type, CPU threads, memory, languages, time zone, and `navigator.webdriver` (browser automation).

Flags: browser automation (high), other IPs connected to the lab (medium), more than one screen (low).

## Downloads

| File | What it is |
| --- | --- |
| `*-report.html` | Standalone report with its own replay player, flags, stats and charts |
| `*.keystrokes.json` | The raw session — import it back to replay it |
| `*-report.json` | Stats, flags (with times) and the rhythm series, for analysis |
| `*-events.csv` | Every key, input, focus, paste, click and IME event |
| `*-text-changes.csv` | Every edit to the text, with position and timing |
| `*.txt` | The final text |
| `keystroke-lab-summary-*.csv` | One row per saved session (Sessions tab) |
| `keystroke-lab-all-*.json` | All saved sessions in one importable file (Sessions tab) |

## What gets flagged

High: keys with no physical key code (Unicode packets), script-generated events (`isTrusted = false`),
capitals/symbols without Shift, keys released instantly, text appearing with no key press, bursts of
keys under 25 ms apart, large pastes, the browser window losing focus while the page stays on screen
(another app or overlay took the keyboard). Medium: leaving the tab or minimising the browser, metronome-even rhythm or hold times, very high speed,
large blocks inserted at once, key-up not matching key-down. Low/info: no corrections at all, the
editor losing focus to something else on the page, lone modifier presses (a global hotkey such as Aperture's), shortcuts, auto-repeat, pauses.

The logic lives in `src/lib/analyze.js`; recording in `src/lib/recorder.js`; the code-editor
behaviour in `src/lib/editor.js`; downloads in `src/lib/export.js`.

Sessions are stored in this browser's `localStorage`, which holds a few MB — download anything you
want to keep.
