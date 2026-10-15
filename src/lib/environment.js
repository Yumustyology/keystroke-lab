// What the page can learn about the machine and network it runs on: a device snapshot, the
// IP addresses WebRTC reveals (public via a STUN server, local interfaces), and the clients
// connected to the lab's own server (server/net-plugin.js).

export const STUN_URL = 'stun:stun.l.google.com:19302';

let clientId = null;
export function getClientId() {
  if (clientId) return clientId;
  try { clientId = sessionStorage.getItem('kslab.client'); } catch { /* per-load id is fine */ }
  if (!clientId) {
    clientId = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
    try { sessionStorage.setItem('kslab.client', clientId); } catch { /* ignore */ }
  }
  return clientId;
}

export function deviceInfo() {
  const n = navigator, s = window.screen || {};
  const c = n.connection || {};
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* ignore */ }
  return {
    webdriver: n.webdriver === true,
    screen: { w: s.width, h: s.height, availW: s.availWidth, availH: s.availHeight, depth: s.colorDepth, dpr: window.devicePixelRatio || 1 },
    screensExtended: typeof s.isExtended === 'boolean' ? s.isExtended : null,
    window: { w: window.innerWidth, h: window.innerHeight, outerW: window.outerWidth, outerH: window.outerHeight },
    connection: c.effectiveType ? { type: c.type || null, effectiveType: c.effectiveType, downlinkMbps: c.downlink, rttMs: c.rtt, saveData: !!c.saveData } : null,
    cores: n.hardwareConcurrency || null,
    memoryGb: n.deviceMemory || null,
    touchPoints: n.maxTouchPoints || 0,
    languages: [...(n.languages || [n.language])].filter(Boolean),
    timezone: tz,
    utcOffsetMin: -new Date().getTimezoneOffset(),
    online: n.onLine,
    cookies: n.cookieEnabled
  };
}

// Gathers ICE candidates. host candidates are local interfaces (often hidden as random
// "<uuid>.local" names by the browser); srflx candidates are the public IP the STUN server saw.
export function webrtcIps({ stun = true, timeoutMs = 3500 } = {}) {
  return new Promise((resolve) => {
    const out = { stun: stun ? STUN_URL : null, public: [], local: [], hiddenLocal: 0, relay: [], error: null, at: new Date().toISOString() };
    if (typeof RTCPeerConnection === 'undefined') { out.error = 'WebRTC not available'; resolve(out); return; }
    let pc;
    const seen = new Set();
    const done = () => {
      try { pc && pc.close(); } catch { /* ignore */ }
      out.public = [...new Set(out.public)];
      out.local = [...new Set(out.local)];
      resolve(out);
    };
    try {
      pc = new RTCPeerConnection({ iceServers: stun ? [{ urls: STUN_URL }] : [] });
      pc.createDataChannel('probe');
      pc.onicecandidate = (e) => {
        if (!e.candidate) { clearTimeout(timer); done(); return; }
        const c = e.candidate.candidate;
        if (!c || seen.has(c)) return;
        seen.add(c);
        const parts = c.split(' ');
        const addr = e.candidate.address || parts[4];
        const type = e.candidate.type || parts[parts.indexOf('typ') + 1];
        if (!addr) return;
        if (type === 'srflx') out.public.push(addr);
        else if (type === 'relay') out.relay.push(addr);
        else if (/\.local$/.test(addr)) out.hiddenLocal++;
        else out.local.push(addr);
      };
      const timer = setTimeout(done, timeoutMs);
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch((err) => { out.error = String(err && err.message || err); clearTimeout(timer); done(); });
    } catch (err) {
      out.error = String(err && err.message || err);
      done();
    }
  });
}

// One ping to the lab server; null when the endpoint isn't there (e.g. a static build).
export async function pingServer(sessionId = null) {
  try {
    const r = await fetch('/api/net/ping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: getClientId(), ua: navigator.userAgent, sessionId })
    });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Folds one ping reply into a session's running server summary.
export function mergeServerPing(summary, ping) {
  const s = summary || { you: null, samples: 0, peakClients: 0, peakDistinctIps: 0, ipsSeen: [], lastClients: [] };
  if (!ping) return s;
  s.you = ping.you.ip;
  s.samples++;
  s.peakClients = Math.max(s.peakClients, ping.connectedClients);
  s.peakDistinctIps = Math.max(s.peakDistinctIps, ping.distinctIps);
  for (const c of ping.clients) {
    const known = s.ipsSeen.find((x) => x.ip === c.ip);
    if (known) { known.lastSeen = c.lastSeen; if (!known.uas.includes(c.ua)) known.uas.push(c.ua); }
    else s.ipsSeen.push({ ip: c.ip, uas: [c.ua], firstSeen: c.firstSeen, lastSeen: c.lastSeen, isYou: c.ip === ping.you.ip });
  }
  s.lastClients = ping.clients.map((c) => ({ ip: c.ip, ua: c.ua, you: c.clientId === ping.you.clientId }));
  return s;
}
