'use strict';
/* Simulação autoritativa do jogo (roda no servidor online ou localmente no modo solo). O cliente só recebe view(id). */
(function () {
  const M = typeof require !== 'undefined' ? require('./map.js') : window.MAP;
  const DEF = { max: 25, impostors: 1, bots: 0, botsOn: true, diff: 'normal', speed: 1, vision: 7, tasks: 4, discuss: 15, vote: 30, killCd: 25, sabCd: 25, abilityCd: 20, voiceRange: 8, voiceMeeting: true, fill: true, isPublic: false, confirmEject: true, disguise: true, emergencies: 1 };
  const LIM = { max: [4, 25], impostors: [1, 6], bots: [0, 24], speed: [0.5, 2], vision: [3, 12], tasks: [1, 10], discuss: [0, 60], vote: [10, 120], killCd: [5, 60], sabCd: [10, 60], abilityCd: [5, 60], voiceRange: [3, 20], emergencies: [0, 3] };
  const HUES = [0, 225, 145, 335, 25, 52, 220, 215, 280, 28, 175, 100];
  const COLORS = []; for (let i = 0; i < 24; i++) COLORS.push(i < 12 ? `hsl(${HUES[i]} ${i === 6 ? 6 : i === 7 ? 10 : 72}% ${i === 6 ? 38 : i === 7 ? 88 : i === 9 ? 38 : 52}%)` : `hsl(${(i - 12) * 30 + 12} 55% 72%)`);
  const BOTN = ['Astro', 'Bit', 'Cometa', 'Dino', 'Eco', 'Faísca', 'Gizmo', 'Hélio', 'Íon', 'Jade', 'Kiko', 'Lua', 'Mimi', 'Nuvem', 'Orbit', 'Pixel', 'Quark', 'Rádio', 'Sol', 'Tico', 'Urso', 'Vento', 'Wally', 'Xuxu', 'Zeca'];
  const Bots = typeof require !== 'undefined' ? require('./bots.js') : window.BOTS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  class Sim {
    constructor(settings, rng) {
      this.s = Object.assign({}, DEF, settings || {}); this.rnd = rng || Math.random; this.players = new Map(); this.nid = 1; this.host = null; this.phase = 'lobby'; this.t = 0;
      this.ev = []; this.evSeq = 0; this.chatLog = []; this.bodies = []; this.sab = this.freshSab(); this.sabCd = 0; this.meeting = null; this.end = null; this.closed = M.DOORS.map(() => 0);
      this.total = 0; this.done = 0; this.lastChat = 0;
    }
    freshSab() { return { lights: false, comms: false, reactor: null, doors: {} }; }
    humans() { return [...this.players.values()].filter((p) => !p.isBot); }
    count() { return this.players.size; }
    emit(k, d, to) { this.ev.push(Object.assign({ k, n: ++this.evSeq, t: this.t, to: to || null }, d)); if (this.ev.length > 60) this.ev.shift(); }
    // ---------- sala ----------
    join(token, name, cosm) {
      cosm = cosm || {}; let p = [...this.players.values()].find((q) => q.token === token && token);
      if (p) { p.connected = true; p.dcT = 0; if (p.isBot && p.wasHuman) { p.isBot = false; p.bot = null; } if (!this.host || !this.players.has(this.host)) this.host = p.id; return { id: p.id, re: true }; }
      if (this.phase !== 'lobby') return { err: 'Partida em andamento' };
      if (this.count() >= this.s.max) { const b = [...this.players.values()].find((q) => q.isBot); if (b) { this.players.delete(b.id); this.s.bots = Math.max(0, this.s.bots - 1); } else return { err: 'Sala cheia (máx. ' + this.s.max + ')' }; }
      p = this.mk(String(name || '').trim().slice(0, 14) || 'Jogador', cosm, false); p.token = token || ('t' + p.id); if (!this.host) this.host = p.id; this.syncBots();
      return { id: p.id };
    }
    mk(name, cosm, isBot) {
      const id = this.nid++, used = new Set([...this.players.values()].map((q) => q.color));
      let color = Number.isInteger(cosm.color) && cosm.color >= 0 && cosm.color < 24 ? cosm.color : -1; if (color < 0 || (used.has(color) && this.phase === 'lobby')) { for (let i = 0; i < 24; i++) if (!used.has(i)) { color = i; break; } if (color < 0) color = 0; }
      const p = { id, token: null, name, color, hat: clamp(cosm.hat | 0, 0, 8), isBot, connected: true, dcT: 0, x: 32, y: 19, f: 1, mvx: 0, mvy: 0, moving: false, role: 'crew', alive: true, tasks: [], kcd: 0, disg: null, disgT: 0, acd: 0, doing: null, vent: null, emerg: 0, mv: [0, 0], cam: false, muted: false };
      this.players.set(id, p); if (isBot) p.bot = Bots.init(p, this); return p;
    }
    syncBots() {
      if (this.phase !== 'lobby') return; const hum = this.humans().length; const want = this.s.botsOn ? Math.min(this.s.bots, this.s.max - hum) : 0; let bots = [...this.players.values()].filter((p) => p.isBot);
      while (bots.length > want) { this.players.delete(bots.pop().id); }
      while (bots.length < want) { const used = new Set([...this.players.values()].map((q) => q.name)); const nm = BOTN.find((n) => !used.has(n)) || 'Bot' + this.nid; bots.push(this.mk(nm, { color: -1, hat: Math.floor(this.rnd() * 9) }, true)); }
    }
    leave(id) {
      const p = this.players.get(id); if (!p || p.isBot) return;
      if (this.phase === 'lobby') { this.players.delete(id); } else { p.connected = false; p.dcT = 0; p.mv = [0, 0]; p.doing = null; }
      if (this.host === id) { const h = this.humans().find((q) => q.connected && q.id !== id); this.host = h ? h.id : null; }
      if (this.phase === 'lobby') this.syncBots();
    }
    kick(by, id) { if (by !== this.host || id === by) return; const p = this.players.get(id); if (!p) return; this.players.delete(id); this.emit('kicked', { id }); if (this.phase === 'lobby') this.syncBots(); else this.checkWin(); }
    setting(by, k, v) {
      if (by !== this.host || this.phase !== 'lobby' || !(k in DEF)) return; if (typeof DEF[k] === 'boolean') this.s[k] = !!v; else if (k === 'diff') { if (['facil', 'normal', 'dificil', 'avancado'].includes(v)) this.s.diff = v; } else if (typeof DEF[k] === 'number') { const l = LIM[k] || [0, 99]; v = +v; if (!isFinite(v)) return; this.s[k] = clamp(k === 'speed' || k === 'killCd' ? v : Math.round(v), l[0], l[1]); }
      if (k === 'max' && this.count() > this.s.max) this.s.bots = Math.max(0, this.s.bots - (this.count() - this.s.max)); this.syncBots(); if (this.s.max < this.humans().length) this.s.max = this.humans().length;
    }
    // ---------- início ----------
    start(by) {
      if (by !== this.host || this.phase !== 'lobby') return { err: 'Só o administrador inicia' }; this.syncBots(); const ps = [...this.players.values()];
      if (ps.length < 4) return { err: 'Mínimo de 4 participantes (adicione bots)' };
      const nImp = Math.min(this.s.impostors, Math.floor((ps.length - 1) / 2)), order = ps.slice().sort(() => this.rnd() - 0.5);
      this.bodies = []; this.sab = this.freshSab(); this.sabCd = 15; this.closed = M.DOORS.map(() => 0); this.meeting = null; this.end = null; this.t = 0; this.done = 0; this.total = 0; this.chatLog = [];
      order.forEach((p, i) => {
        Object.assign(p, { role: i < nImp ? 'imp' : 'crew', alive: true, kcd: 12, disg: null, acd: 0, doing: null, vent: null, emerg: this.s.emergencies, mv: [0, 0], cam: false });
        const spots = M.TASKS.map((_, k) => k).sort(() => this.rnd() - 0.5).slice(0, this.s.tasks); p.tasks = spots.map((sid) => ({ sid, type: M.TASKS[sid].type, done: false }));
        if (p.role === 'crew') this.total += p.tasks.length; p.bot = p.isBot ? Bots.init(p, this) : null;
      });
      this.gather(); this.phase = 'play'; this.emit('start', {}); return {};
    }
    gather() { const alive = [...this.players.values()]; alive.forEach((p, i) => { const a = i / alive.length * Math.PI * 2; p.x = M.EMERG.x + Math.cos(a) * 2.6; p.y = M.EMERG.y + 0.4 + Math.sin(a) * 1.7; p.doing = null; p.vent = null; p.cam = false; p.mv = [0, 0]; if (p.bot) Bots.reset(p); }); }
    // ---------- consultas ----------
    visionOf(p) { if (!p.alive) return 99; if (p.role === 'imp') return this.s.vision + 1; return this.sab.lights ? 2.3 : this.s.vision; }
    sees(p, x, y, extra) { const r = this.visionOf(p) + (extra || 0); return Math.hypot(p.x - x, p.y - y) <= r && M.los(p.x, p.y, x, y, this.closed); }
    visiblePlayers(p) { const o = []; for (const q of this.players.values()) { if (q === p || q.vent != null) continue; if (!q.alive) { if (p.alive) continue; o.push(q); continue; } if (!p.alive || this.sees(p, q.x, q.y)) o.push(q); } return o; }
    visibleBodies(p) { return this.bodies.filter((b) => this.sees(p, b.x, b.y)); }
    appear(q) { if (q.disg != null) { const d = this.players.get(q.disg); if (d) return d; } return q; }
    alive(role) { return [...this.players.values()].filter((p) => p.alive && (!role || p.role === role)); }
    // ---------- entrada ----------
    input(id, m) {
      const p = this.players.get(id); if (!p || !m) return; const t = m.t;
      if (t === 'mv') { const x = +m.x || 0, y = +m.y || 0, l = Math.hypot(x, y); p.mv = l > 1 ? [x / l, y / l] : [x, y]; return; }
      if (t === 'chat') return this.chat(p, m.text);
      if (t === 'cosm') { if (this.phase === 'lobby') { if (Number.isInteger(m.color) && m.color >= 0 && m.color < 24 && ![...this.players.values()].some((q) => q !== p && q.color === m.color)) p.color = m.color; if (Number.isInteger(m.hat)) p.hat = clamp(m.hat, 0, 8); } return; }
      if (t === 'name') { if (this.phase === 'lobby') p.name = String(m.name || '').trim().slice(0, 14) || p.name; return; }
      if (t === 'set') return this.setting(id, m.k, m.v);
      if (t === 'start') { const r = this.start(id); if (r.err) this.emit('err', { msg: r.err }, id); return; }
      if (t === 'kick') return this.kick(id, m.id | 0);
      if (t === 'lobby') { if (id === this.host && this.phase === 'end') this.toLobby(); return; }
      if (t === 'vote') return this.vote(p, m.target);
      if (this.phase !== 'play') return;
      if (t === 'cancel') { p.doing = null; p.cam = false; return; }
      if (p.doing || p.cam) { if (t === 'taskdone') this.taskDone(p, m); else if (t === 'fixdone') this.fixDone(p, m); return; }
      if (t === 'use') return this.use(p);
      if (t === 'kill') return this.kill(p);
      if (t === 'report') return this.report(p);
      if (t === 'sab') return this.sabotage(p, m);
      if (t === 'vent') return this.ventHop(p, m.exit);
      if (t === 'disg') return this.disguise(p, m.as);
    }
    toLobby() { this.phase = 'lobby'; this.end = null; this.meeting = null; this.bodies = []; this.sab = this.freshSab(); for (const p of [...this.players.values()]) { if (!p.connected && !p.isBot) this.players.delete(p.id); else if (p.isBot && p.wasHuman) this.players.delete(p.id); else { p.alive = true; p.role = 'crew'; p.tasks = []; p.doing = null; p.vent = null; } } this.syncBots(); }
    // ---------- ações ----------
    near(p, x, y, r) { return Math.hypot(p.x - x, p.y - y) <= r; }
    use(p) {
      if (p.vent != null) return;
      for (const [k, f] of [['lights', M.FIX.lights], ['comms', M.FIX.comms]]) if (this.sab[k] && this.near(p, f.x, f.y, 1.8)) { p.doing = { sid: k, type: f.type, seed: (this.rnd() * 1e9) | 0, t0: this.t }; return; }
      if (this.sab.reactor) for (const k of ['r0', 'r1']) { const f = M.FIX[k]; if (this.near(p, f.x, f.y, 1.8)) { p.doing = { sid: k, type: 'hold', seed: 1, t0: this.t }; return; } }
      let best = null, bd = 1.8;
      p.tasks.forEach((tk) => { if (tk.done) return; const s = M.TASKS[tk.sid], d = Math.hypot(p.x - s.x, p.y - s.y); if (d < bd) { bd = d; best = tk; } });
      if (best) { p.doing = { sid: best.sid, type: best.type, seed: (this.rnd() * 1e9) | 0, t0: this.t }; return; }
      if (this.near(p, M.EMERG.x, M.EMERG.y, 2.2) && p.alive && p.emerg > 0 && !this.sab.reactor && !this.sab.comms0) { p.emerg--; return this.startMeeting(p, null); }
      if (this.near(p, M.CAMMON.x, M.CAMMON.y, 2.2)) { p.cam = true; p.doing = { sid: 'cam', type: 'cam', seed: 0, t0: this.t }; }
    }
    taskDone(p, m) {
      const d = p.doing; if (!d || d.sid !== m.sid || this.t - d.t0 < (M.MIN[d.type] || 2)) return;
      if (d.type === 'code' && String(m.ans) !== M.codeFor(d.seed)) return; if (d.type === 'seq' && JSON.stringify(m.ans) !== JSON.stringify(M.seqFor(d.seed))) return;
      const tk = p.tasks.find((x) => x.sid === d.sid); p.doing = null; if (!tk || tk.done) return; tk.done = true; if (p.role === 'crew') { this.done++; this.emit('task', {}, p.id); }
      this.checkWin();
    }
    fixDone(p, m) {
      const d = p.doing; if (!d || d.sid !== m.sid || (d.sid !== 'lights' && d.sid !== 'comms') || this.t - d.t0 < (M.MIN[d.type] || 2)) return; if (d.type === 'code' && String(m.ans) !== M.codeFor(d.seed)) return;
      p.doing = null; this.sab[d.sid] = false; this.emit('fixed', { what: d.sid });
    }
    kill(p) {
      if (p.role !== 'imp' || !p.alive || p.kcd > 0 || p.vent != null) return; let best = null, bd = 1.7;
      for (const q of this.players.values()) if (q.alive && q.role !== 'imp' && !q.doing) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } } if (!best) { for (const q of this.players.values()) if (q.alive && q.role !== 'imp') { const d = dist(p, q); if (d < bd) { bd = d; best = q; } } } if (!best) return;
      best.alive = false; best.doing = null; best.cam = false; this.bodies.push({ id: best.id, x: best.x, y: best.y, color: best.color, hat: best.hat, t: this.t }); p.x = best.x; p.y = best.y; p.kcd = this.s.killCd;
      this.emit('killed', { id: best.id }, best.id);
      for (const b of this.players.values()) if (b.isBot && b.alive && b !== p && b.role !== 'imp' && b.bot && (this.sees(b, p.x, p.y) || this.sees(b, best.x, best.y))) Bots.witness(this, b, 'kill', { who: this.appear(p).id, victim: best.id, x: best.x, y: best.y });
      this.checkWin();
    }
    ventHop(p, exit) {
      if (p.role !== 'imp' || !p.alive) return; if (p.vent != null) { if (exit) { p.vent = null; return; } const g = M.VENTS.filter((v) => v.g === M.VENTS[p.vent].g); const nx = g[(g.findIndex((v) => v.id === p.vent) + 1) % g.length]; if (nx.id === p.vent) { p.vent = null; return; } p.vent = nx.id; p.x = nx.x; p.y = nx.y; return; }
      const v = M.VENTS.find((q) => this.near(p, q.x, q.y, 1.6)); if (!v) return; for (const b of this.players.values()) if (b.isBot && b.alive && b.role !== 'imp' && b !== p && this.sees(b, p.x, p.y)) Bots.witness(this, b, 'vent', { who: this.appear(p).id, x: p.x, y: p.y }); p.vent = v.id; p.x = v.x; p.y = v.y;
    }
    disguise(p, as) { if (!this.s.disguise || p.role !== 'imp' || !p.alive || p.acd > 0 || p.vent != null) return; const q = this.players.get(as | 0); if (!q || q === p || !q.alive) return; p.disg = q.id; p.disgT = 10; p.acd = this.s.abilityCd + 10; }
    sabotage(p, m) {
      if (p.role !== 'imp' || !p.alive || this.sabCd > 0) return; const k = m.k;
      if (k === 'doors') { const r = m.room | 0; if (r < 0 || r >= M.ROOMS.length) return; this.sab.doors[r] = 14; this.sabCd = this.s.sabCd; this.emit('sab', { what: 'doors', room: M.ROOMS[r][0] }); return; }
      if (this.sab.lights || this.sab.comms || this.sab.reactor) return;
      if (k === 'lights') this.sab.lights = true; else if (k === 'comms') this.sab.comms = true; else if (k === 'reactor') this.sab.reactor = { t: 45, hold: 0 }; else return;
      this.sabCd = this.s.sabCd; this.emit('sab', { what: k });
    }
    report(p) {
      if (!p.alive || p.vent != null) return; const b = this.bodies.find((q) => Math.hypot(p.x - q.x, p.y - q.y) < 2.8 && M.los(p.x, p.y, q.x, q.y, this.closed)); if (b) this.startMeeting(p, b);
    }
    // ---------- reuniões ----------
    startMeeting(p, body) {
      this.phase = 'meeting'; this.meeting = { kind: body ? 'body' : 'emerg', caller: p.id, victim: body ? body.id : null, room: body ? M.roomName(body.x, body.y) : null, t: this.s.discuss + this.s.vote, ph: this.s.discuss > 0 ? 'discuss' : 'vote', votes: {}, result: null, resT: 0 };
      this.bodies = []; this.sab.doors = {}; this.closed = M.DOORS.map(() => 0); this.gather(); for (const q of this.players.values()) { q.disg = null; }
      for (const q of this.players.values()) if (q.bot) Bots.meetingStart(this, q);
      this.emit('meeting', { kind: this.meeting.kind });
    }
    chat(p, text) {
      text = String(text || '').trim().slice(0, 120); if (!text) return; const mt = this.meeting;
      if (this.phase === 'lobby') { } else if (!(this.phase === 'meeting' && mt && mt.ph !== 'result')) return;
      if (this.t - (p.lastChat || -9) < 0.6 && !p.isBot) return; p.lastChat = this.t;
      const msg = { from: p.id, name: p.name, color: p.color, text, ghost: this.phase !== 'lobby' && !p.alive, n: this.chatLog.length }; this.chatLog.push(msg); if (this.chatLog.length > 200) this.chatLog.shift();
      for (const b of this.players.values()) if (b.bot && b !== p) Bots.heard(this, b, msg);
    }
    vote(p, target) {
      const mt = this.meeting; if (this.phase !== 'meeting' || !mt || mt.ph !== 'vote' || !p.alive || p.id in mt.votes) return;
      if (target !== 'skip') { const q = this.players.get(target | 0); if (!q || !q.alive) return; target = q.id; } mt.votes[p.id] = target;
      if (this.alive().every((q) => q.id in mt.votes)) { mt.t = Math.min(mt.t, 1); }
    }
    finishVote() {
      const mt = this.meeting, tally = {}; for (const [v, t] of Object.entries(mt.votes)) tally[t] = (tally[t] || 0) + 1;
      let top = null, n = 0, tie = false; for (const [t, c] of Object.entries(tally)) { if (c > n) { n = c; top = t; tie = false; } else if (c === n) tie = true; }
      let eject = null; if (top !== null && top !== 'skip' && !tie) eject = +top; mt.ph = 'result'; mt.resT = 6; mt.result = { tally, eject, tie: tie || top === 'skip' || top === null, role: null };
      if (eject != null) { const q = this.players.get(eject); q.alive = false; if (this.s.confirmEject) mt.result.role = q.role; }
      this.emit('result', {});
    }
    // ---------- passo ----------
    step(dt) {
      for (const p of this.players.values()) if (!p.isBot && !p.connected) { p.dcT += dt; if (this.phase !== 'lobby' && this.s.fill && p.dcT > 6 && !p.bot) { p.wasHuman = true; p.isBot = true; p.bot = Bots.init(p, this); } }
      if (this.phase === 'meeting') return this.stepMeeting(dt); if (this.phase !== 'play') return; this.t += dt;
      if (this.sabCd > 0) this.sabCd -= dt; const S = this.sab;
      for (const [r, t] of Object.entries(S.doors)) { S.doors[r] = t - dt; if (S.doors[r] <= 0) delete S.doors[r]; }
      this.closed = M.DOORS.map((d) => (S.doors[d[4]] > 0 ? 1 : 0));
      if (S.reactor) { const R = S.reactor; R.t -= dt; const h0 = [...this.players.values()].some((q) => q.doing && q.doing.sid === 'r0' && q.alive !== undefined && this.near(q, M.FIX.r0.x, M.FIX.r0.y, 2.2)), h1 = [...this.players.values()].some((q) => q.doing && q.doing.sid === 'r1' && this.near(q, M.FIX.r1.x, M.FIX.r1.y, 2.2)); R.h0 = h0; R.h1 = h1; R.hold = h0 && h1 ? R.hold + dt : 0; if (R.hold >= 2.5) { S.reactor = null; this.emit('fixed', { what: 'reactor' }); for (const q of this.players.values()) if (q.doing && (q.doing.sid === 'r0' || q.doing.sid === 'r1')) q.doing = null; } else if (R.t <= 0) return this.finish('imp', 'O reator derreteu'); }
      for (const p of this.players.values()) {
        if (p.kcd > 0) p.kcd -= dt; if (p.acd > 0) p.acd -= dt; if (p.disgT > 0) { p.disgT -= dt; if (p.disgT <= 0) p.disg = null; }
        if (p.bot && p.alive !== undefined) Bots.think(this, p, dt);
        const lock = p.doing || p.vent != null || p.cam; let mx = lock ? 0 : p.mv[0], my = lock ? 0 : p.mv[1]; p.moving = Math.hypot(mx, my) > 0.05;
        if (p.moving) { const sp = 4.3 * this.s.speed * dt; if (p.alive) M.moveBy(p, mx * sp, my * sp, 0.32, this.closed); else { p.x = clamp(p.x + mx * sp, 1, M.W - 1); p.y = clamp(p.y + my * sp, 1, M.H - 1); } if (Math.abs(mx) > 0.1) p.f = mx > 0 ? 1 : -1; }
        if (p.doing && !p.cam && p.doing.sid !== 'cam') { const t = this.spotOf(p.doing.sid); if (t && !this.near(p, t.x, t.y, 3)) p.doing = null; }
      }
      this.checkWin();
    }
    spotOf(sid) { return typeof sid === 'number' ? M.TASKS[sid] : M.FIX[sid]; }
    stepMeeting(dt) {
      const mt = this.meeting; mt.t -= dt;
      if (mt.ph === 'discuss' && mt.t <= this.s.vote) { mt.ph = 'vote'; }
      if (mt.ph === 'vote' && mt.t <= 0) this.finishVote();
      if (mt.ph === 'result') { mt.resT -= dt; if (mt.resT <= 0) { this.phase = 'play'; this.meeting = null; for (const p of this.players.values()) { p.kcd = Math.max(p.kcd, 10); p.mv = [0, 0]; } this.sabCd = Math.max(this.sabCd, 10); this.gather(); this.checkWin(); } }
      if (!this.meeting) return; for (const p of this.players.values()) if (p.bot && p.alive) Bots.meetingTick(this, p, dt);
    }
    checkWin() {
      if (this.phase === 'end' || this.phase === 'lobby') return; const ci = this.alive('imp').length, cc = this.alive('crew').length;
      if (ci === 0) return this.finish('crew', 'Todos os impostores foram eliminados'); if (cc <= ci) return this.finish('imp', 'Os impostores dominaram a estação'); if (this.total > 0 && this.done >= this.total) return this.finish('crew', 'Todas as tarefas foram concluídas');
    }
    finish(w, why) { if (this.phase === 'end') return; this.phase = 'end'; this.end = { winner: w, reason: why, roles: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, hat: p.hat, role: p.role, alive: p.alive })) }; this.meeting = null; this.emit('end', { w }); }
    // ---------- visão do jogador (nunca vaza segredos) ----------
    view(id) {
      const me = this.players.get(id); if (!me) return null; const S = this.s;
      const v = { phase: this.phase, t: Math.round(this.t * 10) / 10, host: this.host === id, hostId: this.host, s: S, ev: this.ev.filter((e) => !e.to || e.to === id).slice(-12), code: this.code || null };
      v.roster = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, hat: p.hat, host: p.id === this.host, bot: p.isBot && !p.wasHuman, on: p.connected || p.isBot, alive: this.phase === 'play' ? undefined : p.alive }));
      if (this.phase === 'lobby') { v.you = { id, x: me.x, y: me.y }; v.chat = this.chatLog.slice(-60); return v; }
      const imp = me.role === 'imp';
      v.you = { id, role: me.role, alive: me.alive, x: me.x, y: me.y, vent: me.vent, kcd: Math.max(0, me.kcd), acd: Math.max(0, me.acd), sabCd: Math.max(0, this.sabCd), emerg: me.emerg, disg: me.disg, vis: this.visionOf(me), cam: me.cam, doing: me.doing && { sid: me.doing.sid, type: me.doing.type, seed: me.doing.seed },
        tasks: me.tasks.map((t) => ({ sid: t.sid, type: t.type, done: t.done })) };
      if (imp) v.allies = this.alive().filter((p) => p.role === 'imp' && p.id !== id).map((p) => p.id);
      v.progress = this.total ? this.done / this.total : 0; v.comms = this.sab.comms;
      v.sab = { lights: this.sab.lights, comms: this.sab.comms, reactor: this.sab.reactor && { t: Math.round(this.sab.reactor.t), h0: !!this.sab.reactor.h0, h1: !!this.sab.reactor.h1 }, doors: this.closed.map((c, i) => (c ? i : -1)).filter((i) => i >= 0) };
      v.players = this.phase === 'meeting' ? [] : this.visiblePlayers(me).map((q) => { const a = this.appear(q); return { id: q.disg != null ? a.id : q.id, name: a.name, color: a.color, hat: a.hat, x: q.x, y: q.y, f: q.f, mv: q.moving, ghost: !q.alive }; });
      if (me.vent != null) v.players = []; v.bodies = this.phase === 'meeting' ? [] : (me.alive ? this.visibleBodies(me) : this.bodies).map((b) => ({ id: b.id, x: b.x, y: b.y, color: b.color, hat: b.hat }));
      if (me.cam) v.cams = M.CAMS.map((c) => ({ n: c.n, x: c.x, y: c.y, it: [...this.players.values()].filter((q) => q.alive && q.vent == null && Math.hypot(q.x - c.x, q.y - c.y) < 8).map((q) => ({ x: q.x, y: q.y, color: q.color, hat: q.hat })) }));
      if (this.phase === 'meeting') { const mt = this.meeting; v.meeting = { kind: mt.kind, caller: mt.caller, victim: mt.victim, room: mt.room, ph: mt.ph, t: Math.max(0, Math.ceil(mt.ph === 'discuss' ? mt.t - S.vote : mt.t)), voted: Object.keys(mt.votes).map(Number), myVote: mt.votes[id], result: mt.result && Object.assign({}, mt.result), votesAll: mt.ph === 'result' ? mt.votes : null }; }
      if (this.phase === 'meeting' || this.phase === 'end') v.chat = this.chatLog.filter((m) => !m.ghost || !me.alive || this.phase === 'end').slice(-80);
      if (this.phase === 'end') v.end = this.end; return v;
    }
  }
  Sim.DEF = DEF; Sim.COLORS = COLORS; Sim.LIM = LIM;
  if (typeof module !== 'undefined') module.exports = Sim; else window.SIM = Sim;
})();
