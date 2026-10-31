'use strict';
/* Servidor autoritativo: HTTP estático (web/) + WebSocket (/ws) + API de salas públicas. A simulação roda aqui; clientes só enviam entradas. */
const http = require('http'), fs = require('fs'), path = require('path'), { WebSocketServer } = require('ws');
const Sim = require('../web/shared/sim.js');
const WEB = path.join(__dirname, '..', 'web'), TICK = 50, MAXMSG = 2048, RATE = 90;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
const rooms = new Map(); // code -> { code, sim, conns: Map(id -> ws), idle }
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);
function newCode() { for (let n = 0; n < 200; n++) { let c = ''; for (let i = 0; i < 5; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]; if (!rooms.has(c)) return c; } return null; }
function listPublic() { const o = []; for (const r of rooms.values()) { const s = r.sim; if (s.s.isPublic && s.phase === 'lobby' && s.count() < s.s.max) { const h = s.players.get(s.host); o.push({ code: r.code, host: h ? h.name : '—', count: s.count(), max: s.s.max }); } } return o.slice(0, 50); }
function createRoom(opts) { const code = newCode(); if (!code) return null; const sim = new Sim({ isPublic: !!opts.pub, max: Math.max(4, Math.min(25, opts.max | 0 || 25)) }); sim.code = code; const r = { code, sim, conns: new Map(), idle: 0 }; rooms.set(code, r); return r; }
const server = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (u === '/api/rooms') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); return res.end(JSON.stringify(listPublic())); }
  let f = path.normalize(decodeURIComponent(u === '/' ? '/index.html' : u)).replace(/^(\.\.[\/\\])+/, ''); const full = path.join(WEB, f);
  if (!full.startsWith(WEB)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (e, d) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(d); });
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
const out = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
wss.on('connection', (ws) => {
  let room = null, id = 0, tokens = RATE, lastRefill = Date.now(); ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  const bind = (r, res) => { if (res.err) return out(ws, { t: 'err', msg: res.err }); room = r; id = res.id; const old = r.conns.get(id); if (old && old !== ws) { try { old.close(); } catch (e) {} } r.conns.set(id, ws); r.idle = 0; ws.pid = id; out(ws, { t: 'hi', id, code: r.code }); };
  ws.on('message', (raw) => {
    if (raw.length > MAXMSG) return; const now = Date.now(); tokens = Math.min(RATE, tokens + (now - lastRefill) / 1000 * RATE); lastRefill = now; if (tokens < 1) return; tokens--;
    let m; try { m = JSON.parse(raw); } catch (e) { return; } if (!m || typeof m !== 'object') return;
    if (!room) {
      const token = String(m.token || '').slice(0, 64); if (token.length < 8) return out(ws, { t: 'err', msg: 'Token inválido' });
      if (m.t === 'create') { if (rooms.size >= 500) return out(ws, { t: 'err', msg: 'Servidor cheio, tente mais tarde' }); const r = createRoom(m); if (!r) return out(ws, { t: 'err', msg: 'Não foi possível criar a sala' }); bind(r, r.sim.join(token, clean(m.name), m.cosm || {})); }
      else if (m.t === 'join') { const r = rooms.get(String(m.code || '').toUpperCase().slice(0, 5)); if (!r) return out(ws, { t: 'err', msg: 'Sala não encontrada' }); bind(r, r.sim.join(token, clean(m.name), m.cosm || {})); }
      return;
    }
    if (m.t !== 'in' || !m.m || typeof m.m !== 'object') return; const im = m.m;
    if (im.t === 'leave') { room.sim.leave(id); room.conns.delete(id); room = null; try { ws.close(); } catch (e) {} return; }
    room.sim.input(id, im);
  });
  ws.on('close', () => { if (room && room.conns.get(id) === ws) { room.conns.delete(id); room.sim.leave(id); } });
  ws.on('error', () => {});
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) {} } }, 20000);
setInterval(() => {
  for (const [code, r] of rooms) {
    const s = r.sim; if (r.conns.size === 0) { r.idle += TICK / 1000; if (r.idle > (s.phase === 'lobby' ? 30 : 300)) { rooms.delete(code); continue; } if (s.phase === 'lobby') continue; }
    try { s.step(TICK / 1000); } catch (e) { console.error('step', code, e); }
    for (const [pid, ws] of r.conns) { const v = s.view(pid); if (!v) { r.conns.delete(pid); try { out(ws, { t: 'err', msg: 'Você saiu da sala' }); ws.close(); } catch (e) {} continue; } out(ws, { t: 'view', v }); }
  }
}, TICK);
const PORT = process.env.PORT || 8080;
if (require.main === module) server.listen(PORT, () => console.log('Traidor Orbital em http://localhost:' + PORT)); 
module.exports = { server, rooms, listen: (p, cb) => server.listen(p, cb) };
