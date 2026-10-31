'use strict';
/* Bots: enxergam só o que o personagem enxerga (sim.sees), têm memória própria e usam a mesma API de entrada que os humanos. */
(function () {
  const M = typeof require !== 'undefined' ? require('./map.js') : window.MAP;
  const DIFF = { facil: { obs: 0.7, mem: 25, acc: 0.5, doT: 1.5, kill: 0.5 }, normal: { obs: 0.4, mem: 50, acc: 0.75, doT: 1, kill: 0.8 }, dificil: { obs: 0.25, mem: 100, acc: 0.9, doT: 0.8, kill: 1 }, avancado: { obs: 0.15, mem: 200, acc: 1, doT: 0.65, kill: 1.2 } };
  const PERS = ['cautelosa', 'investigativa', 'impulsiva', 'desconfiada', 'comunicativa', 'estratégica'];
  const pick = (a, r) => a[Math.floor(r() * a.length)];
  const THR = { cautelosa: 3, investigativa: 2, impulsiva: 0.8, desconfiada: 1.2, comunicativa: 1.8, 'estratégica': 2.2 };
  const ACC = /(impostor|impostora|suspeit|matou|matar|\bvi\b|duto|vent|culpad|\bsus\b|mentiros|mentindo)/i;

  function init(p, sim) { return { pers: pick(PERS, sim.rnd), mem: { seen: {}, kills: [], vents: [], bodies: {}, susp: {}, acc: {}, own: [] }, path: null, pi: 0, goal: null, obsT: 0, doT: 0, stuck: 0, lastPos: [p.x, p.y], flee: 0, hunt: null, say: [], mt: 0, saidDef: -99, tm: 0, rep: null, tryN: 0, spoke: {} }; }
  function reset(p) { const b = p.bot; if (!b) return; b.path = null; b.goal = null; b.hunt = null; b.rep = null; b.flee = 0; b.stuck = 0; b.say = []; b.mt = 0; }
  const nameOf = (sim, id) => { const q = sim.players.get(id); return q ? q.name : '?'; };
  const ago = (sim, t) => Math.max(1, Math.round(sim.t - t));
  function witness(sim, b, kind, d) { const m = b.bot.mem; if (kind === 'kill') { m.kills.push({ who: d.who, victim: d.victim, t: sim.t, room: M.roomName(d.x, d.y) }); m.susp[d.who] = (m.susp[d.who] || 0) + 100; } else { m.vents.push({ who: d.who, t: sim.t, room: M.roomName(d.x, d.y) }); m.susp[d.who] = (m.susp[d.who] || 0) + 40; } }

  function walkTo(sim, p, x, y) { const b = p.bot; b.goal = [x, y]; b.path = M.path(p.x, p.y, x, y, sim.closed); b.pi = 0; if (!b.path) { b.goal = null; } }
  function follow(sim, p, dt) {
    const b = p.bot; if (!b.path) { p.mv = [0, 0]; return true; } const w = b.path[Math.min(b.pi, b.path.length - 1)], dx = w[0] - p.x, dy = w[1] - p.y, d = Math.hypot(dx, dy);
    if (d < 0.25) { b.pi++; if (b.pi >= b.path.length) { b.path = null; p.mv = [0, 0]; return true; } return false; }
    p.mv = [dx / d, dy / d]; b.stuck += Math.hypot(p.x - b.lastPos[0], p.y - b.lastPos[1]) < 0.01 * dt * 60 ? dt : -b.stuck; if (b.stuck < 0) b.stuck = 0; b.lastPos = [p.x, p.y];
    if (b.stuck > 1.2) { b.stuck = 0; if (b.goal) walkTo(sim, p, b.goal[0], b.goal[1]); } return false;
  }
  const randPoint = (sim) => { const r = M.ROOMS[Math.floor(sim.rnd() * M.ROOMS.length)]; return [r[1] + 1 + sim.rnd() * (r[3] - 2), r[2] + 1 + sim.rnd() * (r[4] - 2)]; };

  function observe(sim, p) {
    const b = p.bot, m = b.mem, now = sim.t; b.vis = []; if (!p.alive) return;
    for (const q of sim.visiblePlayers(p)) { const a = sim.appear(q); b.vis.push({ id: a.id, real: q, x: q.x, y: q.y }); m.seen[a.id] = { x: q.x, y: q.y, t: now, room: M.roomName(q.x, q.y) }; }
    m.own.push({ t: now, room: M.roomName(p.x, p.y) }); if (m.own.length > 80) m.own.shift();
    for (const bd of sim.visibleBodies(p)) if (!m.bodies[bd.id]) { m.bodies[bd.id] = { x: bd.x, y: bd.y, t: now, room: M.roomName(bd.x, bd.y) }; for (const v of b.vis) if (v.id !== p.id && Math.hypot(v.x - bd.x, v.y - bd.y) < 8) m.susp[v.id] = (m.susp[v.id] || 0) + 2; if (!b.rep) b.rep = bd; }
  }
  function think(sim, p, dt) {
    const b = p.bot; if (!b) return; const D = DIFF[sim.s.diff] || DIFF.normal; b.tm += dt; b.obsT -= dt; if (b.flee > 0) b.flee -= dt;
    if (p.doing) { b.doT -= dt; p.mv = [0, 0]; const d = p.doing;
      if (d.type === 'hold') { if (!sim.sab.reactor) sim.input(p.id, { t: 'cancel' }); return; }
      if (b.doT <= 0) { const ans = d.type === 'code' ? M.codeFor(d.seed) : d.type === 'seq' ? M.seqFor(d.seed) : null; sim.input(p.id, { t: d.sid === 'lights' || d.sid === 'comms' ? 'fixdone' : 'taskdone', sid: d.sid, ans }); if (p.doing) sim.input(p.id, { t: 'cancel' }); b.goal = null; }
      return; }
    if (b.obsT <= 0) { b.obsT = D.obs; observe(sim, p); }
    if (!p.alive) return ghost(sim, p, dt, D); if (p.vent != null) { if (b.flee <= 0) sim.input(p.id, { t: 'vent' }); return; }
    // corpo encontrado: denunciar (tripulantes) — impostores só às vezes
    if (b.rep && !sim.bodies.some((x) => x.id === b.rep.id)) b.rep = null;
    if (b.rep) { if (p.role === 'crew' || (sim.rnd() < 0.002 && !b.vis.some((v) => v.id !== p.id && Math.hypot(v.x - b.rep.x, v.y - b.rep.y) < 4))) { if (Math.hypot(p.x - b.rep.x, p.y - b.rep.y) < 2.2) { sim.input(p.id, { t: 'report' }); b.rep = null; return; } if (!b.path || b.goal === null || Math.hypot(b.goal[0] - b.rep.x, b.goal[1] - b.rep.y) > 1) walkTo(sim, p, b.rep.x, b.rep.y); follow(sim, p, dt); return; } else b.rep = null; }
    if (p.role === 'imp') return impostor(sim, p, dt, D); crew(sim, p, dt, D);
  }
  function needFix(sim, p) {
    const S = sim.sab; const crew = sim.alive('crew').filter((q) => q.isBot && !q.doing || q === p);
    const rank = (pt, list) => list.slice().sort((a, c) => Math.hypot(a.x - pt.x, a.y - pt.y) - Math.hypot(c.x - pt.x, c.y - pt.y));
    if (S.reactor) { const l0 = rank(M.FIX.r0, crew), first = l0[0]; if (first === p) return M.FIX.r0; const l1 = rank(M.FIX.r1, crew.filter((q) => q !== first)); if (l1[0] === p) return M.FIX.r1; return null; }
    if (S.lights) { const l = rank(M.FIX.lights, crew); if (l[0] === p) return M.FIX.lights; }
    if (S.comms) { const l = rank(M.FIX.comms, crew); if (l[0] === p) return M.FIX.comms; }
    return null;
  }
  function startUse(sim, p, D) { sim.input(p.id, { t: 'use' }); if (p.doing) { p.bot.doT = (p.doing.type === 'hold' ? 1e9 : 2.5 + sim.rnd() * 3) * D.doT + (M.MIN[p.doing.type] || 2); p.bot.tryN = 0; return true; } p.bot.tryN++; return false; }
  function crew(sim, p, dt, D) {
    const b = p.bot; const fx = needFix(sim, p);
    if (fx) { if (!b.goal || Math.hypot(b.goal[0] - fx.x, b.goal[1] - fx.y) > 0.5) walkTo(sim, p, fx.x, fx.y); if (follow(sim, p, dt) || Math.hypot(p.x - fx.x, p.y - fx.y) < 1.3) { if (!startUse(sim, p, D)) { p.mv = [0, 0]; } } return; }
    if (!b.goal || b.tryN > 3) { b.tryN = 0; const todo = p.tasks.filter((t) => !t.done).sort((x, y) => Math.hypot(M.TASKS[x.sid].x - p.x, M.TASKS[x.sid].y - p.y) - Math.hypot(M.TASKS[y.sid].x - p.x, M.TASKS[y.sid].y - p.y)); if (todo.length) { const s = M.TASKS[todo[0].sid]; walkTo(sim, p, s.x, s.y); } else { const r = randPoint(sim); walkTo(sim, p, r[0], r[1]); } }
    const arrived = follow(sim, p, dt); if (arrived || (b.goal && Math.hypot(p.x - b.goal[0], p.y - b.goal[1]) < 1.2)) { if (p.tasks.some((t) => !t.done && Math.hypot(M.TASKS[t.sid].x - p.x, M.TASKS[t.sid].y - p.y) < 1.8)) { startUse(sim, p, D); } if (!p.doing) b.goal = null; }
  }
  function ghost(sim, p, dt, D) { const b = p.bot; if (p.role === 'imp') { p.mv = [0, 0]; return; } crew(sim, p, dt, D); }
  function impostor(sim, p, dt, D) {
    const b = p.bot, others = b.vis.filter((v) => v.real.role !== 'imp' && v.id !== p.id && v.real.alive);
    if (b.flee > 0) { follow(sim, p, dt); return; }
    // sabotagem ocasional
    if (sim.sabCd <= 0 && !sim.sab.lights && !sim.sab.comms && !sim.sab.reactor && sim.rnd() < 0.01 * dt * 60 * 0.1) { const r = sim.rnd(); if (r < 0.45) sim.input(p.id, { t: 'sab', k: 'lights' }); else if (r < 0.65) sim.input(p.id, { t: 'sab', k: 'comms' }); else if (r < 0.8 && sim.alive('crew').length >= 4) sim.input(p.id, { t: 'sab', k: 'reactor' }); else { const seen = Object.values(b.mem.seen).sort((x, y) => y.t - x.t)[0]; const rm = seen ? M.ROOMS.findIndex((x) => x[0] === seen.room) : -1; sim.input(p.id, { t: 'sab', k: 'doors', room: rm >= 0 ? rm : Math.floor(sim.rnd() * M.ROOMS.length) }); } }
    const tgt = others.sort((x, y) => Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y))[0];
    if (tgt && p.kcd <= 0 && sim.rnd() < D.kill + 0.2) { const wit = others.filter((o) => o !== tgt && !o.real.doing && Math.hypot(o.x - tgt.x, o.y - tgt.y) < 12).length; // testemunhas que EU enxergo
      if (wit === 0) { if (Math.hypot(tgt.x - p.x, tgt.y - p.y) < 1.5) { sim.input(p.id, { t: 'kill' }); b.flee = 2.5 + sim.rnd() * 2; const rp = randPoint(sim); walkTo(sim, p, rp[0], rp[1]); const vn = M.VENTS.find((v) => Math.hypot(v.x - p.x, v.y - p.y) < 1.6); if (vn && sim.rnd() < 0.35 && !others.length) { sim.input(p.id, { t: 'vent' }); b.flee = 3; } else if (D.kill >= 0.8 && p.acd <= 0 && sim.s.disguise && others.length) sim.input(p.id, { t: 'disg', as: others[0].id }); return; }
        if (!b.hunt || b.hunt.t < sim.t - 0.8) { walkTo(sim, p, tgt.x, tgt.y); b.hunt = { t: sim.t }; } follow(sim, p, dt); return; } }
    // fingir tarefas / vagar
    if (!b.goal || b.tryN > 2) { b.tryN = 0; const s = M.TASKS[Math.floor(sim.rnd() * M.TASKS.length)]; walkTo(sim, p, s.x, s.y); }
    const arrived = follow(sim, p, dt); if (arrived || (b.goal && Math.hypot(p.x - b.goal[0], p.y - b.goal[1]) < 1.2)) { const near = M.TASKS.findIndex((s) => Math.hypot(s.x - p.x, s.y - p.y) < 1.6); if (near >= 0 && p.tasks.some((t) => t.sid === near && !t.done)) { startUse(sim, p, D); b.doT = 2 + sim.rnd() * 2; } else if (!p.doing) { b.goal = null; } }
  }
  // ---------- reuniões ----------
  function sightingsLines(sim, p, D) {
    const m = p.bot.mem, out = []; const ent = Object.entries(m.seen).filter(([id, s]) => +id !== p.id && sim.t - s.t < D.mem).sort((a, c) => c[1].t - a[1].t);
    for (const [id, s] of ent.slice(0, 3)) out.push(`Vi ${nameOf(sim, +id)} em ${s.room} há uns ${ago(sim, s.t)}s.`); return out;
  }
  function meetingStart(sim, p) {
    const b = p.bot, D = DIFF[sim.s.diff] || DIFF.normal, mt = sim.meeting, m = b.mem, r = sim.rnd; b.say = []; b.mt = 0; b.voted = false; b.votePlan = 2 + r() * Math.max(2, sim.s.vote * 0.6);
    const add = (at, text) => b.say.push({ at, text }); const talk = b.pers === 'comunicativa' ? 1.6 : b.pers === 'cautelosa' ? 0.7 : 1; const first = 0.8 + r() * 3 / talk;
    const victim = mt.victim != null ? nameOf(sim, mt.victim) : null; if (!p.alive) { b.say = []; return; }
    if (mt.caller === p.id) add(0.5, victim ? `Encontrei ${victim} em ${mt.room}!` : 'Chamei a reunião: precisamos conversar.');
    else if (victim && r() < 0.5) add(first, `Quem encontrou ${victim}? Onde foi?`);
    const myRoom = [...m.own].reverse().find((o) => sim.t - o.t > 3); const recent = m.own.length ? m.own[Math.max(0, m.own.length - 10)].room : null;
    if (p.role === 'crew') {
      const k = m.kills.slice(-1)[0], vn = m.vents.slice(-1)[0];
      if (k) add(first, `EU VI ${nameOf(sim, k.who)} matando ${nameOf(sim, k.victim)} em ${k.room}! Votem nele!`);
      else if (vn) add(first, `Vi ${nameOf(sim, vn.who)} saindo de um duto em ${vn.room}. Isso é suspeito.`);
      else { if (recent) add(first, `Eu estava em ${recent} fazendo tarefas.`); for (const l of sightingsLines(sim, p, D).slice(0, b.pers === 'investigativa' ? 3 : 1)) add(first + 2 + r() * 4, l); }
      const top = Object.entries(m.susp).filter(([id]) => sim.players.get(+id) && sim.players.get(+id).alive && +id !== p.id).sort((a, c) => c[1] - a[1])[0];
      if (top && top[1] >= THR[b.pers] && !k) add(first + 4 + r() * 4, b.pers === 'impulsiva' ? `Foi ${nameOf(sim, +top[0])}, tenho certeza!` : `Acho ${nameOf(sim, +top[0])} suspeito: estava perto do corpo.`);
      if (b.pers === 'investigativa' || b.pers === 'desconfiada') { const al = sim.alive().filter((q) => q.id !== p.id); if (al.length) add(first + 3 + r() * 5, `${pick(al, r).name}, onde você estava?`); }
    } else { // impostor: álibi verdadeiro + acusação a um inocente
      if (recent) add(first, `Eu estava em ${recent} fazendo tarefa.`);
      const cand = sim.alive().filter((q) => q.role !== 'imp' && q.id !== p.id); const near = cand.filter((q) => m.seen[q.id] && m.bodies && Object.values(m.bodies)[0] && Math.hypot(m.seen[q.id].x - Object.values(m.bodies)[0].x, m.seen[q.id].y - Object.values(m.bodies)[0].y) < 10);
      const tg = near.length ? pick(near, r) : cand.length ? pick(cand, r) : null; if (tg) { b.frame = tg.id; add(first + 3 + r() * 4, r() < 0.5 ? `${tg.name} estava rondando por aqui, acho suspeito.` : `Desconfio de ${tg.name}. Não vi essa pessoa fazendo tarefa.`); }
    }
    b.say.sort((x, y) => x.at - y.at);
  }
  function heard(sim, p, msg) {
    const b = p.bot; if (!b || !p.alive || sim.phase !== 'meeting' || msg.from === p.id || msg.ghost) return; const text = msg.text.toLowerCase(), D = DIFF[sim.s.diff] || DIFF.normal;
    if (!ACC.test(text)) return; let mentioned = null;
    for (const q of sim.players.values()) if (q.id !== msg.from && text.includes(q.name.toLowerCase())) { mentioned = q; break; } if (!mentioned) return;
    const m = b.mem; const r = sim.rnd, now = b.mt;
    if (mentioned.id === p.id) { if (now - b.saidDef > 8) { b.saidDef = now; const rm = m.own.length ? m.own[m.own.length - 1].room : 'algum lugar'; b.say.push({ at: now + 1 + r() * 2, text: p.role === 'imp' && r() < 0.3 ? `${msg.name}, você está me acusando sem provas!` : `Não fui eu! Eu estava em ${rm}.` }); b.say.sort((x, y) => x.at - y.at); } m.susp[msg.from] = (m.susp[msg.from] || 0) + (p.role === 'crew' ? 0.4 : 0); return; }
    m.acc[mentioned.id] = (m.acc[mentioned.id] || 0) + 1;
    if (p.role === 'crew') { const s = m.seen[mentioned.id]; const bd = Object.values(m.bodies)[0]; let line = null;
      if (s && sim.t - s.t < D.mem && bd && Math.hypot(s.x - bd.x, s.y - bd.y) > 14 && r() < D.acc) { m.susp[mentioned.id] = (m.susp[mentioned.id] || 0) - 3; line = `${msg.name}, não pode ser: vi ${mentioned.name} em ${s.room} há ${ago(sim, s.t)}s.`; }
      else { m.susp[mentioned.id] = (m.susp[mentioned.id] || 0) + (b.pers === 'desconfiada' || b.pers === 'impulsiva' ? 1 : 0.5); if (r() < 0.45 && (m.susp[mentioned.id] || 0) > 1) line = `Concordo com ${msg.name}, ${mentioned.name} está estranho.`; else if (r() < 0.3) line = `${msg.name}, o que você viu exatamente?`; }
      if (line && !b.spoke[msg.n]) { b.spoke[msg.n] = 1; b.say.push({ at: now + 1.2 + r() * 3, text: line }); b.say.sort((x, y) => x.at - y.at); }
    } else if (r() < 0.5 && mentioned.role !== 'imp' && !b.spoke[msg.n]) { b.spoke[msg.n] = 1; b.say.push({ at: now + 1 + r() * 3, text: `Também acho. Votem em ${mentioned.name}.` }); b.say.sort((x, y) => x.at - y.at); }
  }
  function meetingTick(sim, p, dt) {
    const b = p.bot, mt = sim.meeting; b.mt += dt; if (mt.ph === 'result') return;
    while (b.say.length && b.say[0].at <= b.mt) { const l = b.say.shift(); if (p.alive) sim.chat(p, l.text); }
    if (mt.ph === 'vote' && !b.voted && b.mt >= b.votePlan + sim.s.discuss) { b.voted = true; sim.vote(p, choose(sim, p)); }
  }
  function choose(sim, p) {
    const b = p.bot, m = b.mem, D = DIFF[sim.s.diff] || DIFF.normal, r = sim.rnd, alive = sim.alive().filter((q) => q.id !== p.id);
    if (p.role === 'imp') { const inn = alive.filter((q) => q.role !== 'imp'); if (!inn.length) return 'skip'; const top = inn.sort((x, y) => (m.acc[y.id] || 0) - (m.acc[x.id] || 0))[0]; if (m.acc[top.id] >= 1 || (b.frame && alive.some((q) => q.id === b.frame))) return m.acc[top.id] >= 1 ? top.id : b.frame; return r() < 0.5 ? 'skip' : pick(inn, r).id; }
    const sc = alive.map((q) => [q, (m.susp[q.id] || 0) + 0.3 * (m.acc[q.id] || 0)]).sort((x, y) => y[1] - x[1])[0];
    if (sc && sc[1] >= THR[b.pers] && r() < 0.35 + D.acc * 0.6) return sc[0].id; return b.pers === 'impulsiva' && sc && sc[1] > 0.4 ? sc[0].id : 'skip';
  }
  const B = { init, reset, think, witness, meetingStart, meetingTick, heard, DIFF, PERS };
  if (typeof module !== 'undefined') module.exports = B; else window.BOTS = B;
})();
