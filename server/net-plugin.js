// Vite plugin: a tiny endpoint that tells the lab which IP addresses are connected to it.
// Pages ping POST /api/net/ping every few seconds with a per-tab id; the reply carries the
// caller's own IP (as the server sees it) and every client seen in the last 15 seconds.
// Runs in `vite` (dev) and `vite preview`; a plain static build has no such endpoint.
const ACTIVE_MS = 15000;

export default function netPlugin() {
  const clients = new Map(); // clientId → { clientId, ip, ua, sessionId, firstSeen, lastSeen }
  const everIps = new Set();
  const started = new Date().toISOString();

  // X-Forwarded-For only counts from a proxy on this machine; anyone else could fake it.
  const ipOf = (req) => {
    const sock = ((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '');
    const loopback = sock === '::1' || sock.startsWith('127.');
    const fwd = loopback ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
    return fwd || sock || 'unknown';
  };

  function handler(req, res, next) {
    if (!req.url || !req.url.startsWith('/api/net/ping')) return next();
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let data = {};
      try { data = body ? JSON.parse(body) : {}; } catch { /* treat as empty */ }
      const now = Date.now();
      const ip = ipOf(req);
      const id = String(data.clientId || ip).slice(0, 80);
      const prev = clients.get(id);
      clients.set(id, {
        clientId: id, ip, ua: String(data.ua || req.headers['user-agent'] || '').slice(0, 300),
        sessionId: data.sessionId ? String(data.sessionId).slice(0, 80) : null,
        firstSeen: prev ? prev.firstSeen : now, lastSeen: now
      });
      everIps.add(ip);
      for (const [k, c] of clients) if (now - c.lastSeen > ACTIVE_MS * 4) clients.delete(k);
      const active = [...clients.values()].filter((c) => now - c.lastSeen <= ACTIVE_MS);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        you: { ip, clientId: id },
        clients: active.map((c) => ({ ...c, firstSeen: new Date(c.firstSeen).toISOString(), lastSeen: new Date(c.lastSeen).toISOString() })),
        connectedClients: active.length,
        distinctIps: new Set(active.map((c) => c.ip)).size,
        ipsSinceStart: everIps.size,
        serverStarted: started
      }));
    });
  }

  return {
    name: 'keystroke-lab-net',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); }
  };
}
