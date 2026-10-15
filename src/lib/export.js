// Everything the lab lets you download: the raw session (re-importable), the report as JSON and
// as a standalone HTML page with its own replay player, the events and text changes as CSV,
// the final text, and a bundle / summary of every saved session.
import { analyze } from './analyze.js';
import { reportCharts } from './charts.js';
import { describeEvent, envRows, esc, SEVERITY, slug, statRows, VERDICT_COLOR } from './format.js';
import { fmtTime } from './replay.js';

export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const baseName = (s) => `${slug(s.name)}-${(s.created || '').slice(0, 10) || 'session'}`;

const csvCell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function sessionJson(session) {
  return JSON.stringify({ format: 'keystroke-lab-session', version: session.v || 1, session }, null, 1);
}

export function bundleJson(sessions) {
  return JSON.stringify({ format: 'keystroke-lab-bundle', exported: new Date().toISOString(), sessions });
}

export function reportJson(session, report = analyze(session)) {
  const { series, ...rest } = report;
  return JSON.stringify({
    format: 'keystroke-lab-report',
    session: { id: session.id, name: session.name, created: session.created, mode: session.mode, ua: session.ua, platform: session.platform, prompt: session.prompt || '', env: session.env || null },
    ...rest,
    series,
    finalText: session.finalText
  }, null, 2);
}

export function eventsCsv(session) {
  const rows = [['t_ms', 'time', 'type', 'description', 'key', 'code', 'keyCode', 'location', 'repeat', 'trusted', 'ctrl', 'shift', 'alt', 'meta', 'capsLock', 'in_editor', 'input_type', 'data', 'count']];
  for (const e of session.events || []) {
    const d = describeEvent(e);
    const m = e.m || 0;
    const isKey = e.k === 'd' || e.k === 'u';
    rows.push([
      e.t, fmtTime(e.t), d.kind, d.text, e.key, e.code, e.kc, e.loc, isKey ? e.rep : '', isKey ? e.tr : '',
      isKey ? m & 1 ? 1 : 0 : '', isKey ? m & 2 ? 1 : 0 : '', isKey ? m & 4 ? 1 : 0 : '', isKey ? m & 8 ? 1 : 0 : '',
      isKey ? e.caps : '', e.tgt, e.it, e.d, e.n
    ]);
  }
  return csv(rows);
}

export function framesCsv(session) {
  const rows = [['t_ms', 'time', 'position', 'deleted_chars', 'inserted_chars', 'inserted_text', 'caret_after']];
  for (const f of session.frames || []) rows.push([f.t, fmtTime(f.t), f.at, f.del, f.ins.length, f.ins, f.c]);
  return csv(rows);
}

function envCells(env) {
  const net = (env && env.network) || {};
  const srv = net.server, w = net.webrtc, d = env && env.device;
  return [
    srv ? srv.you : '', srv ? srv.ipsSeen.map((x) => x.ip).join(' ') : '', w ? w.public.join(' ') : '', w ? w.local.join(' ') : '',
    d ? (d.webdriver ? 1 : 0) : '', d && d.screensExtended != null ? (d.screensExtended ? 1 : 0) : ''
  ];
}

export function summaryCsv(sessions) {
  const statKeys = ['durationMs', 'activeTypingMs', 'wpmOverall', 'wpmWhileTyping', 'keydowns', 'printableKeys', 'corrections', 'correctionRate', 'ikiMedian', 'ikiP10', 'ikiP90', 'ikiCv', 'holdMedian', 'holdCv', 'pauses', 'longestPauseMs', 'awayCount', 'awayMs', 'pastes', 'charsInserted', 'charsDeleted', 'finalChars'];
  const rows = [['id', 'name', 'created', 'mode', 'verdict', 'high_flags', 'medium_flags', 'flags', 'lab_ip', 'ips_connected', 'public_ip', 'local_ips', 'webdriver', 'multi_screen', ...statKeys]];
  for (const s of sessions) {
    const r = analyze(s);
    rows.push([
      s.id, s.name, s.created, s.mode, r.verdict.level,
      r.flags.filter((f) => f.severity === 'high').length, r.flags.filter((f) => f.severity === 'medium').length,
      r.flags.map((f) => f.id).join(' '), ...envCells(s.env), ...statKeys.map((k) => r.stats[k])
    ]);
  }
  return csv(rows);
}

// ---------- standalone HTML report ----------

const REPORT_CSS = `
:root{--bg:#f6f7f9;--panel:#fff;--panel2:#f1f3f7;--border:#e2e5eb;--text:#151922;--muted:#5d6475;--accent:#3b5bdb;--mono:ui-monospace,"Cascadia Code","JetBrains Mono",Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#0d1017;--panel:#151a23;--panel2:#1b212c;--border:#283040;--text:#e6e9ef;--muted:#8d95a8;--accent:#8aa4ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:28px 16px 60px}h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:0 0 12px}
.muted{color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px;margin-top:16px}
.verdict{display:flex;gap:12px;align-items:center;font-weight:600;font-size:16px}.dot{width:12px;height:12px;border-radius:50%;flex:none}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}.stat{background:var(--panel2);border-radius:8px;padding:10px 12px}
.stat b{display:block;font-size:18px}.stat span{font-size:12px;color:var(--muted)}.stat i{display:block;font-style:normal;font-size:11px;color:var(--muted)}
.flag{border-left:4px solid;padding:8px 12px;margin:10px 0;background:var(--panel2);border-radius:0 8px 8px 0}.flag h3{margin:0 0 2px;font-size:14px}
.flag p{margin:4px 0}.sev{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-right:6px}
.chip{font:12px var(--mono);border:1px solid var(--border);background:var(--panel);color:var(--text);border-radius:6px;padding:1px 6px;margin:2px 3px 0 0;cursor:pointer}
.chip:hover{border-color:var(--accent)}.charts{display:grid;grid-template-columns:1fr 1fr;gap:16px}.charts .wide{grid-column:1/-1}
.ch-grid{stroke:var(--border)}.ch-label{fill:var(--muted);font:10px system-ui,sans-serif}svg{color:var(--text);display:block}
.rp{position:relative;border:1px solid var(--border);border-radius:8px;background:var(--panel2);height:340px;overflow:auto;padding:12px 14px}
.rp pre{margin:0;font:13px/1.55 var(--mono);white-space:pre-wrap;word-break:break-word;tab-size:4}
.caret{display:inline-block;width:2px;height:1.2em;margin:0 -1px;vertical-align:text-bottom;background:var(--accent);animation:b 1s steps(1) infinite}@keyframes b{50%{opacity:.2}}
.ctl{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px}.ctl button{font:inherit;border:1px solid var(--border);background:var(--panel);color:var(--text);border-radius:8px;padding:5px 14px;cursor:pointer}
.ctl input[type=range]{flex:1;min-width:160px}.ctl select{font:inherit;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:3px}
.keys{min-height:26px;margin-top:8px;display:flex;gap:4px;flex-wrap:wrap}.keys kbd{font:12px var(--mono);border:1px solid var(--border);border-bottom-width:2px;border-radius:5px;padding:1px 6px;background:var(--panel)}
table{border-collapse:collapse;width:100%;font-size:13px}td{padding:4px 8px;border-top:1px solid var(--border);vertical-align:top}td:first-child{color:var(--muted);width:160px}
.final{font:12.5px/1.5 var(--mono);white-space:pre-wrap;word-break:break-word;background:var(--panel2);border-radius:8px;padding:12px;max-height:400px;overflow:auto;margin:0}
@media (max-width:700px){.charts{grid-template-columns:1fr}}
`;

const REPORT_JS = `
(function(){
var s=JSON.parse(document.getElementById('ks-data').textContent);
var F=s.frames||[],E=s.events||[],D=E.filter(function(e){return e.k==='d'});
var end=Math.max(s.durationMs||0,E.length?E[E.length-1].t:0,F.length?F[F.length-1].t:0)||1;
var marks=E.map(function(e){return e.t}).concat(F.map(function(f){return f.t})).sort(function(a,b){return a-b});
var $=function(id){return document.getElementById(id)};
var box=$('rp-box'),pre=$('rp-text'),bar=$('rp-bar'),lab=$('rp-time'),btn=$('rp-play'),spd=$('rp-speed'),sq=$('rp-squeeze'),keys=$('rp-keys');
var t=0,playing=false,last=0,ci=0,ct=s.initialText||'',cc=ct.length;
function fmt(ms){var x=Math.max(0,ms)/1000,m=Math.floor(x/60);return m+':'+(x-m*60).toFixed(1).padStart(4,'0')}
function advance(t){if(ci>0&&F[ci-1].t>t){ci=0;ct=s.initialText||'';cc=ct.length}
 while(ci<F.length&&F[ci].t<=t){var f=F[ci];ct=ct.slice(0,f.at)+f.ins+ct.slice(f.at+f.del);cc=f.c!=null?f.c:f.at+f.ins.length;ci++}}
function upto(a,t){var lo=0,hi=a.length;while(lo<hi){var m=(lo+hi)>>1;if(a[m].t<=t)lo=m+1;else hi=m}return lo}
function nextMark(t){var lo=0,hi=marks.length;while(lo<hi){var m=(lo+hi)>>1;if(marks[m]<=t)lo=m+1;else hi=m}return lo<marks.length?marks[lo]:null}
function label(e){var k=e.key===' '?'Space':e.key;var p=[];if(e.m&1)p.push('Ctrl');if(e.m&4)p.push('Alt');if(e.m&8)p.push('Meta');p.push(k);return p.join('+')}
function render(){advance(t);pre.textContent='';pre.appendChild(document.createTextNode(ct.slice(0,cc)));
 var c=document.createElement('span');c.className='caret';pre.appendChild(c);pre.appendChild(document.createTextNode(ct.slice(cc)));
 var top=c.offsetTop;if(top<box.scrollTop||top>box.scrollTop+box.clientHeight-30)box.scrollTop=top-box.clientHeight/2;
 bar.value=Math.round(t/end*1000);lab.textContent=fmt(t)+' / '+fmt(end);
 var i=upto(D,t),out='';for(var j=Math.max(0,i-10);j<i;j++){var e=D[j];if(t-e.t<2500)out+='<kbd style="opacity:'+(1-(t-e.t)/3000).toFixed(2)+'">'+label(e).replace(/[&<>]/g,function(x){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[x]})+'</kbd>'}
 keys.innerHTML=out;btn.textContent=playing?'Pause':'Play'}
function tick(now){if(!playing)return;var nt=t+(now-last)*parseFloat(spd.value);last=now;
 if(sq.checked){var nm=nextMark(t);if(nm!==null&&nm-t>1200)nt=Math.max(nt,nm-400)}
 if(nt>=end){t=end;playing=false;render();return}t=nt;render();requestAnimationFrame(tick)}
btn.onclick=function(){if(!playing&&t>=end)t=0;playing=!playing;last=performance.now();render();if(playing)requestAnimationFrame(tick)};
bar.oninput=function(){t=bar.value/1000*end;render()};
document.addEventListener('click',function(ev){var b=ev.target.closest&&ev.target.closest('[data-t]');if(!b)return;
 t=Math.max(0,parseFloat(b.getAttribute('data-t'))-300);render();$('replay').scrollIntoView({behavior:'smooth',block:'start'})});
render();
})();
`;

export function reportHtml(session, report = analyze(session)) {
  const charts = reportCharts(report);
  const v = report.verdict;
  const stats = statRows(report.stats)
    .map((r) => `<div class="stat"><span>${esc(r.label)}</span><b>${esc(r.value)}</b><i>${esc(r.hint)}</i></div>`).join('');
  const flags = report.flags.length
    ? report.flags.map((f) => {
      const sev = SEVERITY[f.severity];
      const chips = f.times.slice(0, 40).map((t) => `<button class="chip" data-t="${t}">${fmtTime(t)}</button>`).join('');
      const more = f.times.length > 40 ? ` <span class="muted">+${f.times.length - 40} more</span>` : '';
      return `<div class="flag" style="border-color:${sev.color}"><h3><span class="sev" style="color:${sev.color}">${sev.label}</span>${esc(f.title)}${f.count ? ` <span class="muted">×${f.count}</span>` : ''}</h3><p>${esc(f.detail)}</p>${chips ? `<div>${chips}${more}</div>` : ''}</div>`;
    }).join('')
    : '<p class="muted">No flags were raised.</p>';
  const meta = [
    ['Session', session.name], ['Recorded', new Date(session.created).toLocaleString()], ['Editor', session.mode === 'code' ? 'Code editor (auto-indent, bracket pairs)' : 'Plain text'],
    ['Session id', session.id], ['Browser', session.ua], ['Platform', session.platform], ['Events / text changes', `${(session.events || []).length} / ${(session.frames || []).length}`],
    ['Report generated', new Date().toLocaleString()]
  ].map(([k, val]) => `<tr><td>${esc(k)}</td><td>${esc(val || '—')}</td></tr>`).join('')
    + envRows(session.env).map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.value)}</td></tr>`).join('');
  const data = JSON.stringify(session).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(session.name)} · Keystroke Lab report</title><style>${REPORT_CSS}</style></head>
<body><main>
<p class="muted" style="margin:0 0 6px">Keystroke Lab · session report</p>
<h1>${esc(session.name)}</h1>
<div class="muted">${esc(new Date(session.created).toLocaleString())} · ${fmtTime(report.stats.durationMs)} · ${report.stats.keydowns} key presses</div>
<section class="panel"><div class="verdict"><span class="dot" style="background:${VERDICT_COLOR[v.level]}"></span>${esc(v.text)}</div>
<p class="muted" style="margin:6px 0 0">${report.flags.filter((f) => f.severity === 'high').length} high, ${report.flags.filter((f) => f.severity === 'medium').length} medium, ${report.flags.filter((f) => f.severity === 'low').length} low and ${report.flags.filter((f) => f.severity === 'info').length} informational flag(s).</p></section>
<section class="panel" id="replay"><h2>Replay</h2>
${session.prompt ? `<p class="muted" style="margin-top:-6px;white-space:pre-wrap">Task: ${esc(session.prompt)}</p>` : ''}
<div class="rp" id="rp-box"><pre id="rp-text"></pre></div>
<div class="keys" id="rp-keys"></div>
<div class="ctl"><button id="rp-play">Play</button><input id="rp-bar" type="range" min="0" max="1000" value="0" aria-label="Position"><span id="rp-time" style="font-family:var(--mono);font-size:12px"></span>
<select id="rp-speed" aria-label="Speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select>
<label><input id="rp-squeeze" type="checkbox" checked> Skip long pauses</label></div></section>
<section class="panel"><h2>Flags</h2>${flags}</section>
<section class="panel"><h2>Statistics</h2><div class="stats">${stats}</div></section>
<section class="panel"><h2>Rhythm</h2><div class="charts">
<div class="wide"><div class="muted" style="margin-bottom:6px">Gap before each key over the session (line: rolling median)</div>${charts.timeline}</div>
<div><div class="muted" style="margin-bottom:6px">Gap between keys</div>${charts.ikiHist}</div>
<div><div class="muted" style="margin-bottom:6px">How long each key was held</div>${charts.holdHist}</div></div></section>
<section class="panel"><h2>Final text</h2><pre class="final">${esc(session.finalText || '')}</pre></section>
<section class="panel"><h2>Details</h2><table>${meta}</table></section>
</main>
<script type="application/json" id="ks-data">${data}</script>
<script>${REPORT_JS}</script>
</body></html>`;
}

// The download buttons in one place: [{ id, label, hint, run }].
export function downloadsFor(session, report) {
  const b = baseName(session);
  return [
    { id: 'html', label: 'Report (HTML)', hint: 'Standalone page with replay, flags and charts', run: () => download(b + '-report.html', reportHtml(session, report), 'text/html') },
    { id: 'session', label: 'Session (JSON)', hint: 'Raw recording — import it back here', run: () => download(b + '.keystrokes.json', sessionJson(session), 'application/json') },
    { id: 'report-json', label: 'Report (JSON)', hint: 'Stats, flags and series for analysis', run: () => download(b + '-report.json', reportJson(session, report), 'application/json') },
    { id: 'events', label: 'Events (CSV)', hint: 'Every key, input, focus and paste event', run: () => download(b + '-events.csv', eventsCsv(session), 'text/csv') },
    { id: 'frames', label: 'Text changes (CSV)', hint: 'Every edit to the text, with timing', run: () => download(b + '-text-changes.csv', framesCsv(session), 'text/csv') },
    { id: 'text', label: 'Final text (TXT)', hint: 'What was in the editor at the end', run: () => download(b + '.txt', session.finalText || '', 'text/plain') }
  ];
}
