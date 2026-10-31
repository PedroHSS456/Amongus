'use strict';
/* Testes do servidor: salas, limite de 25, mover/validar, reconexão, kick, sala pública, entradas inválidas. */
const WebSocket = require('ws'), http = require('http'), assert = require('assert');
const srv = require('../server/server.js'); let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('ok', n, m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function cl(port, token) { return new Promise((res) => { const ws = new WebSocket('ws://localhost:' + port + '/ws'); const c = { ws, v: null, id: 0, code: null, errs: [], token }; ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'hi') { c.id = m.id; c.code = m.code; } else if (m.t === 'view') c.v = m.v; else if (m.t === 'err') c.errs.push(m.msg); }); c.send = (o) => ws.send(JSON.stringify(o)); c.in = (m) => c.send({ t: 'in', m }); ws.on('open', () => res(c)); }); }
const get = (port, p) => new Promise((r) => http.get('http://localhost:' + port + p, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => r({ s: res.statusCode, b })); }));
(async () => {
  await new Promise((r) => srv.listen(0, r)); const port = srv.server.address().port;
  let r = await get(port, '/'); ok(r.s === 200 && /Traidor Orbital/.test(r.b), 'servidor entrega o cliente (index.html)');
  r = await get(port, '/../server/server.js'); ok(r.s !== 200 || !/WebSocketServer/.test(r.b), 'path traversal bloqueado');
  r = await get(port, '/healthz'); ok(r.b === 'ok', 'healthcheck');
  const a = await cl(port, 'tokenAAAAAAAA'); a.send({ t: 'create', name: 'Ana<b>', cosm: { color: 3 }, token: a.token, pub: true, max: 25 }); await sleep(200);
  ok(a.code && a.code.length === 5, 'sala criada com código de 5 letras'); ok(a.v && a.v.phase === 'lobby' && a.v.host === true, 'criador é administrador'); ok(!/<b>/.test(a.v.roster[0].name), 'nome sanitizado');
  r = await get(port, '/api/rooms'); ok(JSON.parse(r.b).some((x) => x.code === a.code), 'sala pública aparece na busca');
  const b = await cl(port, 'tokenBBBBBBBB'); b.send({ t: 'join', code: a.code.toLowerCase(), name: 'Beto', token: b.token }); await sleep(200); ok(b.id && b.v.roster.length === 2, 'segundo jogador entra pelo código (minúsculas aceitas)'); ok(b.v.host === false, 'quem entra não é administrador');
  const x = await cl(port, 'tokenXXXXXXXX'); x.send({ t: 'join', code: 'ZZZZZ', name: 'X', token: x.token }); await sleep(150); ok(x.errs.length === 1, 'código inexistente recusado');
  b.in({ t: 'set', k: 'bots', v: 5 }); await sleep(150); ok(a.v.s.bots === 0, 'não-admin não altera configurações');
  a.in({ t: 'set', k: 'bots', v: 99 }); await sleep(150); ok(a.v.s.bots <= 24 && a.v.roster.length <= 25, 'bots limitados pelo servidor (máx. 25 participantes)');
  a.in({ t: 'set', k: 'speed', v: 50 }); await sleep(100); ok(a.v.s.speed <= 2, 'velocidade limitada ao intervalo permitido');
  a.in({ t: 'set', k: 'bots', v: 6 }); a.in({ t: 'set', k: 'isPublic', v: false }); await sleep(150); r = await get(port, '/api/rooms'); ok(!JSON.parse(r.b).some((q) => q.code === a.code), 'sala privada some da busca');
  // 25 participantes: encher com humanos
  a.in({ t: 'set', k: 'bots', v: 0 }); const hs = []; for (let i = 0; i < 24; i++) { const c = await cl(port, 'tokenH' + String(i).padStart(7, '0')); c.send({ t: 'join', code: a.code, name: 'H' + i, token: c.token }); hs.push(c); } await sleep(500);
  const cnt = a.v.roster.length; ok(cnt === 25, '25 participantes na sala (' + cnt + ')'); const ov = await cl(port, 'tokenOVER0000'); ov.send({ t: 'join', code: a.code, name: 'Extra', token: ov.token }); await sleep(200); ok(ov.errs.some((e) => /cheia/i.test(e)) && !ov.id, '26º jogador recusado: sala cheia');
  hs.slice(2).forEach((c) => c.ws.close()); await sleep(400); ok(a.v.roster.length === 4, 'saídas no lobby removem jogadores');
  a.in({ t: 'set', k: 'bots', v: 5 }); await sleep(150);
  b.in({ t: 'start' }); await sleep(150); ok(a.v.phase === 'lobby', 'não-admin não inicia a partida');
  a.in({ t: 'start' }); await sleep(300); ok(a.v.phase === 'play' && b.v.phase === 'play', 'admin inicia a partida (online)');
  ok(a.v.you.role && b.v.you.role && JSON.stringify(a.v).indexOf('"role":"imp"') >= -1, 'cada jogador recebe sua função');
  const impView = [a, b].find((c) => c.v.you.role === 'imp'); const crewView = [a, b].find((c) => c.v.you.role === 'crew');
  if (crewView) ok(crewView.v.allies === undefined && !/"tasks":\[\{"sid"[^]*"role":"imp"/.test('') && !JSON.stringify(crewView.v).includes('"imp"'), 'tripulante não recebe informação de impostores');
  const p0 = { x: a.v.you.x, y: a.v.you.y }; a.in({ t: 'mv', x: 1, y: 0 }); await sleep(1000); a.in({ t: 'mv', x: 0, y: 0 }); await sleep(150); const dx = a.v.you.x - p0.x; ok(dx > 1 && dx < 8, 'movimento sincronizado pelo servidor (dx=' + dx.toFixed(2) + ')');
  const q0 = a.v.you.x; a.in({ t: 'mv', x: 9999, y: 0 }); await sleep(1000); a.in({ t: 'mv', x: 0, y: 0 }); await sleep(100); ok(Math.abs(a.v.you.x - q0) < 8, 'velocidade forjada (x=9999) é normalizada pelo servidor');
  const tp = { x: a.v.you.x, y: a.v.you.y }; a.in({ t: 'x', x: 5, y: 5 }); a.in({ t: 'taskdone', sid: 3, ans: 'x' }); a.in({ t: 'fixdone', sid: 'lights' }); await sleep(100); ok(Math.hypot(a.v.you.x - tp.x, a.v.you.y - tp.y) < 0.5 && a.v.progress === 0, 'teleporte/tarefa/conserto forjados são ignorados');
  a.ws.send('lixo{'); a.ws.send(JSON.stringify({ t: 'in', m: null })); a.ws.send(Buffer.alloc(5000)); await sleep(150); ok(a.v && a.ws.readyState === 1, 'mensagens malformadas não derrubam o servidor');
  // reconexão
  const bid = b.id; b.ws.close(); await sleep(300); ok(a.v.roster.find((r) => r.id === bid).on === false, 'desconexão marcada na partida em andamento'); const b2 = await cl(port, 'tokenBBBBBBBB'); b2.send({ t: 'join', code: a.code, name: 'Beto', token: b2.token }); await sleep(300); ok(b2.id === bid && b2.v.phase === 'play' && b2.v.you.role, 'reconexão com o mesmo token reassume o personagem e a função');
  const o2 = await cl(port, 'tokenNOVO0000'); o2.send({ t: 'join', code: a.code, name: 'Tarde', token: o2.token }); await sleep(200); ok(o2.errs.some((e) => /andamento/i.test(e)), 'novo jogador não entra com a partida em andamento');
  console.log('\nTODOS OS ' + n + ' TESTES DO SERVIDOR PASSARAM'); process.exit(0);
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
