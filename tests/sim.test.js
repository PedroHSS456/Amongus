// Testes headless da simulação: limites, visão, validação do servidor, bots, reuniões, vitória, reconexão.
const Sim = require('../web/shared/sim.js'), M = require('../web/shared/map.js');
let ok = 0, bad = 0; const T = (n, c, x) => { if (c) ok++; else { bad++; console.log('FALHOU:', n, x === undefined ? '' : x); } };
const seeded = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
// 1) limite de 25 (humanos + bots) aplicado pelo servidor
{ const s = new Sim({ max: 25, bots: 5 }, seeded(1)); for (let i = 0; i < 20; i++) s.join('t' + i, 'H' + i); T('20 humanos + 5 bots = 25', s.count() === 25 && [...s.players.values()].filter((p) => p.isBot).length === 5);
  const r = s.join('novo', 'Extra'); T('21º humano desloca um bot', !r.err && s.count() === 25 && [...s.players.values()].filter((p) => p.isBot).length === 4);
  for (let i = 0; i < 4; i++) s.join('x' + i, 'X' + i); const r2 = s.join('y', 'Y'); T('26º é recusado', !!r2.err && s.count() === 25, r2);
  const s2 = new Sim({ bots: 24 }, seeded(2)); s2.join('a', 'A'); T('1 humano + 24 bots', s2.count() === 25); s2.setting(s2.host, 'bots', 10); T('admin reduz bots', s2.count() === 11);
  s2.input(99, { t: 'set', k: 'bots', v: 3 }); T('não-admin não muda config', s2.count() === 11); }
// 2) visão: paredes e portas fechadas bloqueiam
{ const s = new Sim({}, seeded(3)); const a = { x: 6.5, y: 5, role: 'crew', alive: true }; T('vê dentro da sala', s.sees(a, 9, 5)); T('não vê através da parede (Núcleo→Laboratório)', !s.sees(a, 16, 5)); T('não vê além do alcance', !s.sees({ x: 15, y: 12.5, role: 'crew', alive: true }, 40, 12.5));
  const d = { x: 7, y: 12.5, role: 'crew', alive: true }; T('porta aberta deixa ver', s.sees(d, 7, 8)); s.closed = M.DOORS.map((x, i) => (i === 0 ? 1 : 0)); T('porta fechada bloqueia', !s.sees(d, 7, 8)); }
// 3) jogo completo só com bots + validação do servidor + segredos
{ const s = new Sim({ bots: 9, impostors: 2, diff: 'normal', tasks: 4, discuss: 6, vote: 12 }, seeded(7)); const h = s.join('h', 'Humano').id; const r = s.start(h); T('inicia', !r.err, r);
  const imps = [...s.players.values()].filter((p) => p.role === 'imp'); T('2 impostores', imps.length === 2);
  const v = s.view(h); const me = s.players.get(h); T('view não revela papéis alheios', !JSON.stringify(v).includes('"role":"imp"') || me.role === 'imp');
  T('view só mostra quem está visível', v.players.every((q) => s.sees(me, q.x, q.y)));
  s.input(h, { t: 'kill' }); T('tripulante não mata', s.alive().length === 10 || me.role === 'imp');
  me.x = 3.5; me.y = 3.5; s.input(h, { t: 'use' }); const doing = me.doing; s.input(h, { t: 'taskdone', sid: doing && doing.sid, ans: '0000' }); T('conclusão instantânea é rejeitada', !doing || !me.tasks.find((t) => t.sid === doing.sid).done);
  me.x = 50; me.y = 33; s.input(h, { t: 'taskdone', sid: 0 }); T('tarefa longe é rejeitada', s.done === 0);
  const said = [], rooms = new Set(M.ROOMS.map((r) => r[0])); let meets = 0, kills = 0, liarVI = 0, lines = 0, ctx = 0; const oc = s.chat.bind(s);
  s.chat = (p, t) => { oc(p, t); if (p.isBot) { lines++; if (/EU VI/.test(t) && !(p.bot.mem.kills.length)) liarVI++; if ([...rooms].some((r) => t.includes(r))) ctx++; said.push(t); } };
  let prevAlive = s.alive().length, prevPh = s.phase, t = 0; const hv = (ph) => { if (ph === 'meeting' && s.phase === 'meeting') {} };
  while (s.phase !== 'end' && t < 3600) { s.step(0.1); t += 0.1; if (s.phase === 'meeting' && prevPh !== 'meeting') { meets++; if (s.meeting.ph) { } } prevPh = s.phase; if (s.alive().length < prevAlive) { kills += prevAlive - s.alive().length; prevAlive = s.alive().length; } if (s.phase === 'meeting' && me.alive && !(h in s.meeting.votes) && s.meeting.ph === 'vote') s.vote(me, 'skip'); }
  T('a partida termina com vencedor', s.phase === 'end' && !!s.end, s.phase); console.log('   fim:', s.end && s.end.winner, '|', s.end && s.end.reason, '| tempo', Math.round(t) + 's | mortes', kills, '| reuniões', meets, '| tarefas', s.done + '/' + s.total, '| falas', lines, '| com sala citada', ctx);
  T('houve mortes (impostores agem)', kills > 0); T('houve reuniões', meets > 0); T('bots conversam', lines > 3); T('conversas citam locais reais', ctx > 0); T('nenhum bot afirma ter visto matar sem ter testemunhado', liarVI === 0, liarVI);
  T('papéis só aparecem no fim', JSON.stringify(s.view(h).end).includes('"role"')); }
// 4) várias sementes: nenhuma partida trava
{ let end = 0, crew = 0, imp = 0; for (let k = 0; k < 6; k++) { const s = new Sim({ bots: 11, impostors: k % 3 + 1, diff: ['facil', 'normal', 'dificil', 'avancado'][k % 4], tasks: 3, discuss: 4, vote: 8 }, seeded(100 + k)); const h = s.join('h', 'H').id; s.start(h); let t = 0; const hum = s.players.get(h); while (s.phase !== 'end' && t < 5400) { s.step(0.1); t += 0.1; if (s.phase === 'meeting' && hum.alive && s.meeting.ph === 'vote' && !(h in s.meeting.votes)) s.vote(hum, 'skip'); } if (s.phase === 'end') { end++; s.end.winner === 'crew' ? crew++ : imp++; } }
  console.log('   6 partidas: terminaram', end, '| tripulação', crew, '| impostores', imp); T('todas terminam', end === 6); }
// 5) reconexão e preenchimento de vaga
{ const s = new Sim({ bots: 5, fill: true }, seeded(9)); const a = s.join('tokA', 'A').id; s.join('tokB', 'B'); s.start(a); const b = [...s.players.values()].find((p) => p.token === 'tokB'); s.leave(b.id); T('desconectado fica marcado', !b.connected);
  const r = s.join('tokB', 'B'); T('reconecta no mesmo personagem', r.id === b.id && b.connected);
  s.leave(b.id); for (let i = 0; i < 100; i++) s.step(0.1); T('vaga vira bot após desconexão', b.isBot && b.wasHuman);
  const r2 = s.join('tokB', 'B'); T('volta ao controle do jogador', !b.isBot && r2.id === b.id); }
console.log(bad === 0 ? 'TODOS OS ' + ok + ' TESTES PASSARAM' : bad + ' FALHAS de ' + (ok + bad)); process.exit(bad ? 1 : 0);
