'use strict';
/* Cliente (parte 2): telas, HUD, lobby, reunião, fim de jogo, menus, loop de renderização. */
(function () {
  const $ = (id) => document.getElementById(id), AU = window.AU, C = AU._core, M = window.MAP, D = window.Draw, SIMC = window.SIM, COLS = SIMC.COLORS, cfg = AU.cfg, esc = AU.esc, send = AU.send, toast = AU.toast, SFX = AU.SFX, icon = AU.icon, mkIcon = AU.mkIcon;
  const TN = { wires: 'Ligar fios', seq: 'Repetir sequência', code: 'Digitar código', align: 'Alinhar sinal', levers: 'Alavancas', hold: 'Segurar', cam: 'Câmeras' };
  const HATN = ['Antena', 'Boné', 'Coroa', 'Orelhas', 'Cartola', 'Flor', 'Auréola', 'Fone', 'Laço'];
  let V = null, lastPhase = '', lastEv = 0, sel = null, sigs = {}, chatSeen = 0, doneSent = 0, doneKey = '';
  // ---------- canvas / resolução ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  function resize() { const dpr = window.devicePixelRatio || 1, sc = [Math.min(dpr, 0.65), Math.min(dpr, 1.1), Math.min(dpr, 2)][cfg.gfx | 0]; cv.width = Math.max(320, Math.round(innerWidth * sc)); cv.height = Math.max(200, Math.round(innerHeight * sc)); }
  addEventListener('resize', resize);
  // ---------- telas ----------
  function screen() {
    const vv = AU.V; if (!vv) { V = null; lastPhase = ''; lastEv = 0; } const ph = vv ? vv.phase : null; $('menu').hidden = !!vv; $('lobby').hidden = ph !== 'lobby'; $('hud').hidden = ph !== 'play'; $('meet').hidden = ph !== 'meeting'; $('endscr').hidden = ph !== 'end';
    if (ph !== 'play') { window.Mini.close(false); C.closeMap(); C.closeModal(); } if (!vv) { ctx.clearRect(0, 0, cv.width, cv.height); sigs = {}; }
  }
  function onView() {
    V = AU.V; const ph = V.phase;
    if (ph !== lastPhase) { const was = lastPhase; lastPhase = ph; sigs = {}; sel = null; screen(); if (ph === 'meeting') { SFX.meet(); $('m-chat').hidden = true; chatSeen = (V.chat || []).length; } if (ph === 'end') SFX.end(); if (ph === 'play' && was !== 'play') { chatSeen = 0; } }
    const first = lastEv === 0; V.ev.forEach((e) => { if (e.n <= lastEv) return; if (!first) events(e); }); if (V.ev.length) lastEv = Math.max(lastEv, V.ev[V.ev.length - 1].n); if (first && !V.ev.length) lastEv = 1;
    if (ph === 'lobby') lobby(); else if (ph === 'play') { hud(); minis(); } else if (ph === 'meeting') meeting(); else if (ph === 'end') endScreen();
  }
  function events(e) {
    if (e.k === 'task') SFX.task(); else if (e.k === 'killed') SFX.kill(); else if (e.k === 'sab') { SFX.alarm(); toast({ lights: 'Luzes sabotadas!', comms: 'Rádio sabotado!', reactor: 'REATOR EM PERIGO!', doors: 'Portas trancadas: ' + (e.room || '') }[e.what] || 'Sabotagem!'); } else if (e.k === 'fixed') { SFX.ok(); toast('Sabotagem consertada'); } else if (e.k === 'err') toast(e.msg); else if (e.k === 'kicked' && e.id === AU.myId) { toast('Você foi removido da sala'); C.leaveGame(true); }
  }
  // ---------- HUD ----------
  function hud() {
    const y = V.you, imp = y.role === 'imp', ghost = !y.alive; $('progb').style.width = Math.round(V.progress * 100) + '%';
    const tk = V.comms ? '<div class="r">Comunicações fora do ar</div>' : y.tasks.map((t) => { const s = M.TASKS[t.sid]; return `<div class="${t.done ? 'd' : ''}">${esc(M.roomName(s.x, s.y))}: ${TN[t.type]}</div>`; }).join('');
    const h = `<h4>${imp ? 'TAREFAS (FALSAS)' : ghost ? 'TAREFAS RESTANTES' : 'TAREFAS'}</h4>` + tk; if (sigs.tk !== h) { sigs.tk = h; $('tasks').innerHTML = h; }
    const set = (id, show, ok, em) => { const b = $(id); b.hidden = !show; b.classList.toggle('ok', !!ok); b.classList.toggle('cd', !!em); const e = b.querySelector('em'); if (e) e.textContent = em || ''; };
    const ia = imp && y.alive, inVent = y.vent != null;
    set('a-kill', ia, ia && y.kcd <= 0 && !inVent && V.players.some((p) => !p.ghost && Math.hypot(p.x - y.x, p.y - y.y) < 1.7), y.kcd > 0 ? Math.ceil(y.kcd) : '');
    set('a-sab', ia, ia && y.sabCd <= 0, y.sabCd > 0 ? Math.ceil(y.sabCd) : ''); set('a-vent', ia, ia && (inVent || C.nearVent()));
    set('a-disg', ia && V.s.disguise, ia && y.acd <= 0 && !inVent, y.acd > 0 ? Math.ceil(y.acd) : ''); $('a-vent').querySelector('span').textContent = inVent ? 'PRÓX. DUTO' : 'DUTO';
    set('a-rep', y.alive, y.alive && !inVent && C.nearBody()); set('a-use', true, inVent || C.usable()); $('a-use').querySelector('span').textContent = inVent ? 'SAIR' : 'USAR';
    const al = $('alert'); let txt = '', red = false; const sb = V.sab; if (sb.reactor) { txt = 'REATOR INSTÁVEL — ' + sb.reactor.t + 's (dois tripulantes seguram os painéis)'; red = true; } else if (sb.lights) txt = 'Luzes apagadas — conserte no painel de energia'; else if (sb.comms) txt = 'Rádio fora do ar — sem lista de tarefas'; else if (sb.doors.length) txt = 'Portas trancadas'; if (ghost) txt = txt || 'Você é um fantasma — termine as tarefas!';
    al.className = txt ? 'on' + (red ? ' red' : '') : ''; al.textContent = txt;
  }
  // abre/fecha minijogos conforme o servidor (você.doing)
  function minis() {
    const Mini = window.Mini, y = V.you, d = y.doing; document.body.classList.toggle('inmini', !!Mini.cur);
    if (!d) { if (Mini.cur) Mini.close(false); doneKey = ''; return; }
    if (!Mini.cur) { C.closeMap(); doneKey = ''; Mini.open(d.type, d.seed, { done: (ans) => { doneKey = d.sid; doneSent = 0; Mini.cur && (Mini.cur.ans = ans); sendDone(d, ans); }, cancel: () => send({ t: 'cancel' }) }); }
    else { Mini.update(V); if (doneKey === d.sid && Mini.cur && performance.now() - doneSent > 450) sendDone(d, Mini.cur.ans); }
  }
  function sendDone(d, ans) { doneSent = performance.now(); send({ t: d.sid === 'lights' || d.sid === 'comms' ? 'fixdone' : 'taskdone', sid: d.sid, ans }); }
  // ---------- voz: volume por jogador e indicador de fala ----------
  function volBtn(card, r) { if (!AU.online || r.id === AU.myId || r.bot) return; const b = document.createElement('button'); b.className = 'vb'; const st = () => { const p = window.Voice.peers[r.id]; b.textContent = p && p.mute ? '🔇' : p && p.vol < 1 ? '🔉' : '🔊'; }; st(); b.setAttribute('aria-label', 'Volume de ' + r.name); b.onclick = (e) => { e.stopPropagation(); const lv = window.Voice.cycle(r.id); st(); toast(r.name + ': ' + lv); }; card.appendChild(b); }
  setInterval(() => { document.querySelectorAll('[data-id]').forEach((el) => { const id = +el.dataset.id, sp = id === AU.myId ? AU.mic.speak : window.Voice.isSpeaking(id); el.classList.toggle('sp', !!sp); }); }, 200);
  // ---------- lobby ----------
  const SETS = [['max', 'Máx. de participantes', 'n', 4, 25, 1], ['impostors', 'Impostores', 'n', 1, 6, 1], ['botsOn', 'Bots ativados', 'b'], ['bots', 'Quantidade de bots', 'n', 0, 24, 1], ['diff', 'Dificuldade dos bots', 's', [['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil'], ['avancado', 'Avançado']]], ['speed', 'Velocidade', 'n', 0.5, 2, 0.25], ['vision', 'Visão (tiles)', 'n', 3, 12, 1], ['tasks', 'Tarefas por jogador', 'n', 1, 10, 1], ['discuss', 'Discussão (s)', 'n', 0, 60, 5], ['vote', 'Votação (s)', 'n', 10, 120, 5], ['killCd', 'Recarga do kill (s)', 'n', 5, 60, 1], ['sabCd', 'Recarga sabotagem (s)', 'n', 10, 60, 5], ['abilityCd', 'Recarga disfarce (s)', 'n', 5, 60, 5], ['emergencies', 'Reuniões de emergência', 'n', 0, 3, 1], ['voiceRange', 'Alcance da voz (tiles)', 'n', 3, 20, 1], ['voiceMeeting', 'Voz na reunião', 'b'], ['fill', 'Completar com bots', 'b'], ['confirmEject', 'Revelar função ao ejetar', 'b'], ['disguise', 'Disfarce do impostor', 'b'], ['isPublic', 'Sala pública', 'b']];
  function lobby() {
    const host = V.host, S = V.s, hum = V.roster.filter((r) => !r.bot).length; $('l-code').textContent = V.code || C.roomCode; $('l-count').textContent = V.roster.length + '/' + S.max + ' (' + hum + ' humanos)';
    const rs = JSON.stringify([V.roster, V.hostId, host]); if (sigs.ro !== rs) { sigs.ro = rs; const el = $('l-roster'); el.innerHTML = ''; V.roster.forEach((r) => { const d = document.createElement('div'); d.className = 'pc' + (r.id === AU.myId ? ' me' : ''); d.dataset.id = r.id; d.appendChild(mkIcon(r.color, r.hat, false)); volBtn(d, r); const n = document.createElement('div'); n.textContent = r.name; d.appendChild(n); const t = document.createElement('div'); t.className = 'tg'; t.textContent = r.host ? 'ADMIN' : r.bot ? 'BOT' : r.on ? '' : 'OFFLINE'; d.appendChild(t);
        if (host && r.id !== AU.myId) { const k = document.createElement('button'); k.className = 'k'; k.textContent = '✕'; k.setAttribute('aria-label', 'Remover'); k.onclick = (e) => { e.stopPropagation(); send({ t: 'kick', id: r.id }); }; d.appendChild(k); }
        if (r.id === AU.myId) d.onclick = () => { const used = new Set(V.roster.map((q) => q.color)); let c = r.color; for (let i = 1; i <= 24; i++) { const n2 = (r.color + i) % 24; if (!used.has(n2)) { c = n2; break; } } cfg.color = c; AU.save(); send({ t: 'cosm', color: c, hat: r.hat }); }; el.appendChild(d); }); }
    if (sigs.sh !== host) { sigs.sh = host; const el = $('l-set'); el.innerHTML = ''; SETS.forEach((s) => { const row = document.createElement('div'); row.className = 'sr'; row.innerHTML = `<span>${s[1]}</span>`; let inp; if (s[2] === 'b') { inp = document.createElement('input'); inp.type = 'checkbox'; } else if (s[2] === 's') { inp = document.createElement('select'); s[3].forEach((o) => { const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; inp.appendChild(op); }); } else { inp = document.createElement('input'); inp.type = 'number'; inp.min = s[3]; inp.max = s[4]; inp.step = s[5]; } inp.dataset.k = s[0]; inp.disabled = !host; inp.onchange = () => { send({ t: 'set', k: s[0], v: s[2] === 'b' ? inp.checked : s[2] === 's' ? inp.value : +inp.value }); }; row.appendChild(inp); el.appendChild(row); }); }
    $('l-set').querySelectorAll('[data-k]').forEach((inp) => { if (document.activeElement === inp) return; const v = S[inp.dataset.k]; if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v; });
    const ch = V.chat || [], cs = ch.length + ':' + (ch.length ? ch[ch.length - 1].n : ''); if (sigs.ch !== cs) { sigs.ch = cs; renderChat($('l-msgs'), ch); }
    $('l-start').hidden = !host; $('l-start').disabled = V.roster.length < 4; $('l-note').textContent = host ? (V.roster.length < 4 ? 'Mínimo de 4 participantes: aumente os bots.' : 'Você é o administrador.') : 'Aguardando o administrador iniciar…';
  }
  function renderChat(el, list) { const nb = el.scrollTop + el.clientHeight >= el.scrollHeight - 30; el.innerHTML = ''; list.forEach((m) => { const d = document.createElement('div'); d.className = 'cm' + (m.ghost ? ' gh' : ''); const b = document.createElement('b'); b.style.color = COLS[m.color]; b.textContent = m.name + (m.ghost ? ' (fantasma)' : '') + ':'; d.appendChild(b); d.appendChild(document.createTextNode(m.text)); el.appendChild(d); }); if (nb) el.scrollTop = el.scrollHeight; }
  $('l-form').onsubmit = (e) => { e.preventDefault(); const i = $('l-in'); if (i.value.trim()) send({ t: 'chat', text: i.value }); i.value = ''; };
  $('l-start').onclick = () => send({ t: 'start' }); $('l-leave').onclick = () => C.leaveGame();
  // ---------- reunião ----------
  function meeting() {
    const m = V.meeting; if (!m) return; const me = V.roster.find((r) => r.id === AU.myId) || {}, ph = m.ph, canVote = ph === 'vote' && me.alive && m.myVote === undefined, caller = V.roster.find((r) => r.id === m.caller);
    $('m-title').textContent = (m.kind === 'body' ? 'CORPO ENCONTRADO' : 'REUNIÃO DE EMERGÊNCIA') + ' · ' + (ph === 'discuss' ? 'DISCUSSÃO' : ph === 'vote' ? 'VOTAÇÃO' : 'RESULTADO'); $('m-time').textContent = ph === 'result' ? '' : m.t + 's';
    const sg = JSON.stringify([m.ph, m.voted, m.myVote, sel, V.roster.map((r) => r.alive), m.votesAll]); if (sigs.mg !== sg) { sigs.mg = sg; const g = $('m-grid'); g.innerHTML = '';
      V.roster.forEach((r) => { const b = document.createElement('div'); b.className = 'vc' + (r.alive === false ? ' dead' : '') + (sel === r.id ? ' sel' : ''); b.dataset.id = r.id; b.appendChild(mkIcon(r.color, r.hat, r.alive === false)); volBtn(b, r); b.insertAdjacentHTML('beforeend', `<span class="n">${esc(r.name)}${r.id === AU.myId ? ' (você)' : ''}${caller && r.id === caller.id ? ' 📣' : ''}</span>`);
        if (m.voted.includes(r.id) && ph !== 'result') b.insertAdjacentHTML('beforeend', '<span class="vd">✔ votou</span>');
        if (ph === 'result' && m.votesAll) { const ds = document.createElement('div'); ds.className = 'dots'; Object.entries(m.votesAll).forEach(([vo, tg]) => { if (+tg === r.id) { const vr = V.roster.find((q) => q.id === +vo); ds.insertAdjacentHTML('beforeend', `<i style="background:${COLS[vr ? vr.color : 0]}"></i>`); } }); b.appendChild(ds); }
        if (canVote && r.alive !== false) { b.onclick = () => { sel = sel === r.id ? null : r.id; sigs.mg = ''; meeting(); }; if (sel === r.id) { const ok = document.createElement('button'); ok.className = 'ok'; ok.textContent = '✔'; ok.onclick = (e) => { e.stopPropagation(); send({ t: 'vote', target: r.id }); sel = null; }; b.appendChild(ok); } }
        g.appendChild(b); }); }
    const sk = $('m-skip'); sk.hidden = !canVote; sk.className = sel === 'skip' ? 'sel' : ''; sk.textContent = sel === 'skip' ? 'CONFIRMAR: IGNORAR VOTAÇÃO' : 'IGNORAR VOTAÇÃO'; if (!canVote && ph === 'vote') { sk.hidden = false; sk.textContent = me.alive ? 'Voto registrado' : 'Fantasmas não votam'; sk.className = ''; }
    const ch = V.chat || [], cs = ch.length + ':' + (ch.length ? ch[ch.length - 1].n : ''); if (sigs.ch !== cs) { sigs.ch = cs; renderChat($('m-msgs'), ch); if ($('m-chat').hidden && ch.length > chatSeen) $('m-chatb').querySelector('u').classList.add('on'); }
    $('m-form').style.display = ph === 'result' || (!me.alive && false) ? 'none' : '';
    const rs = $('m-res'); if (ph === 'result' && m.result) { const r = m.result, ej = r.eject != null ? V.roster.find((q) => q.id === r.eject) : null; let h; if (ej) { h = `<div>${esc(ej.name)} foi ejetado.</div>`; if (V.s.confirmEject && r.role) h += `<small>${esc(ej.name)} ${r.role === 'imp' ? 'ERA' : 'NÃO era'} um impostor.</small>`; } else h = '<div>Ninguém foi ejetado.</div><small>Empate ou votação ignorada.</small>'; if (sigs.res !== h) { sigs.res = h; rs.innerHTML = h; if (ej) { rs.prepend(mkIcon(ej.color, ej.hat, true)); } } rs.hidden = false; } else { rs.hidden = true; sigs.res = ''; }
  }
  $('m-skip').onclick = () => { const m = V && V.meeting; if (!m || m.ph !== 'vote' || m.myVote !== undefined) return; if (sel === 'skip') { send({ t: 'vote', target: 'skip' }); sel = null; } else { sel = 'skip'; sigs.mg = ''; meeting(); } };
  $('m-chatb').onclick = () => { const c = $('m-chat'); c.hidden = !c.hidden; if (!c.hidden) { chatSeen = (V.chat || []).length; $('m-chatb').querySelector('u').classList.remove('on'); const e = $('m-msgs'); e.scrollTop = e.scrollHeight; } };
  $('m-form').onsubmit = (e) => { e.preventDefault(); const i = $('m-in'); if (i.value.trim()) send({ t: 'chat', text: i.value }); i.value = ''; };
  // ---------- fim ----------
  function endScreen() {
    const e = V.end; if (!e) return; const imp = V.you.role === 'imp', win = (e.winner === 'imp') === imp, h = `<h2 class="${win ? 'win' : 'lose'}">${win ? 'VITÓRIA' : 'DERROTA'}</h2><div>${e.winner === 'imp' ? 'Os traidores venceram' : 'A tripulação venceu'} — ${esc(e.reason)}</div><div class="rl">${e.roles.map((r) => `<span class="${r.role === 'imp' ? 'i' : ''}" style="border-left:6px solid ${COLS[r.color]}">${esc(r.name)} · ${r.role === 'imp' ? 'Impostor' : 'Tripulante'}</span>`).join('')}</div><div><button class="go" id="e-lob">${V.host ? 'VOLTAR À SALA' : 'AGUARDAR NA SALA'}</button> <button class="go" id="e-out" style="background:var(--p2);color:var(--tx)">SAIR</button></div>`;
    if (sigs.end !== h) { sigs.end = h; $('endscr').innerHTML = h; $('e-lob').onclick = () => { if (V.host) send({ t: 'lobby' }); else toast('Aguardando o administrador'); }; $('e-out').onclick = () => C.leaveGame(); }
  }
  // ---------- menus ----------
  const panels = [...document.querySelectorAll('#mright section')];
  function go(p) { panels.forEach((s) => { s.hidden = s.dataset.p !== p; }); document.querySelectorAll('#mleft .mb').forEach((b) => b.classList.toggle('sel', b.dataset.go === p || (p === 'online' || p === 'create' || p === 'code' || p === 'browse' ? b.dataset.go === 'play' : false))); if (p === 'custom') drawPrev(); if (p === 'browse') loadRooms(); ['e-create', 'e-code', 'e-browse'].forEach((i) => { $(i).textContent = ''; }); if (p === 'create' || p === 'code' || p === 'browse') C.setErr('e-' + p); }
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  const names = ['in-name', 'in-name2', 'in-name3']; names.forEach((id) => { const e = $(id); e.value = cfg.name; e.oninput = () => { cfg.name = e.value.slice(0, 14); AU.save(); names.forEach((o) => { if (o !== id) $(o).value = cfg.name; }); }; });
  const cosm = () => ({ color: cfg.color, hat: cfg.hat });
  $('c-local').onclick = () => { C.startLocal(); };
  $('do-create').onclick = () => { if (!/^https?:/.test(location.protocol) && !window.AU_SERVER) return ($('e-create').textContent = 'Abra o jogo por um servidor (http/https) para jogar online.'); C.setErr('e-create'); $('e-create').textContent = 'Conectando…'; C.connect({ t: 'create', name: cfg.name, cosm: cosm(), token: cfg.token, pub: $('in-pub').value === '1', max: Math.max(4, Math.min(25, +$('in-max').value || 25)) }); };
  $('do-join').onclick = () => { const c = $('in-code').value.trim().toUpperCase(); if (c.length < 4) return ($('e-code').textContent = 'Digite o código da sala.'); C.setErr('e-code'); $('e-code').textContent = 'Conectando…'; C.connect({ t: 'join', code: c, name: cfg.name, cosm: cosm(), token: cfg.token }); };
  async function loadRooms() { const el = $('rooms'); el.innerHTML = '<p class="note">Buscando…</p>'; try { const r = await fetch((window.AU_SERVER || '') + '/api/rooms'); const l = await r.json(); el.innerHTML = l.length ? '' : '<p class="note">Nenhuma sala pública aberta. Crie uma!</p>'; l.forEach((o) => { const b = document.createElement('button'); b.className = 'rm'; b.innerHTML = `<span><b>${esc(o.host)}</b> · ${o.count}/${o.max}</span><span>${esc(o.code)}</span>`; b.onclick = () => { C.setErr('e-browse'); C.connect({ t: 'join', code: o.code, name: cfg.name, cosm: cosm(), token: cfg.token }); }; el.appendChild(b); }); } catch (e) { el.innerHTML = ''; $('e-browse').textContent = 'Servidor online indisponível (use o modo LOCAL).'; } }
  $('do-refresh').onclick = loadRooms;
  // personalizar
  function drawPrev() { const c = $('prev'); icon(c, cfg.color < 0 ? 0 : cfg.color, cfg.hat, false); const sw = $('colors'); sw.innerHTML = ''; COLS.forEach((col, i) => { const b = document.createElement('i'); b.style.background = col; if (cfg.color === i) b.className = 'sel'; b.onclick = () => { cfg.color = i; AU.save(); drawPrev(); }; sw.appendChild(b); }); const h = $('hats'); h.innerHTML = ''; HATN.forEach((n, i) => { const b = document.createElement('button'); b.textContent = n; if (cfg.hat === i) b.className = 'sel'; b.onclick = () => { cfg.hat = i; AU.save(); drawPrev(); }; h.appendChild(b); }); }
  // definições
  $('s-sfx').value = cfg.sfx; $('s-gfx').value = cfg.gfx; $('s-mic').value = cfg.mic; $('s-ns').value = cfg.ns; $('s-vol').value = cfg.vol;
  $('s-sfx').oninput = (e) => { cfg.sfx = +e.target.value; AU.save(); }; $('s-gfx').onchange = (e) => { cfg.gfx = +e.target.value; AU.save(); resize(); }; $('s-mic').onchange = (e) => { cfg.mic = e.target.value; AU.save(); AU.micUpdate(); }; $('s-ns').onchange = (e) => { cfg.ns = e.target.value; AU.save(); }; $('s-vol').oninput = (e) => { cfg.vol = +e.target.value; AU.save(); };
  $('ver').textContent = 'v1.0 — original, sem relação com outros jogos'; go('play');
  // ---------- loop de renderização ----------
  const sm = new Map(); let last = performance.now(), sx = 0, sy = 0, inited = false;
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now; const v = V; if (!v || v.phase !== 'play') { inited = false; return; }
    const mv = C.pumpInput(now), y = v.you; if (!inited) { sx = y.x; sy = y.y; inited = true; sm.clear(); } const k = 1 - Math.exp(-dt * 16); if (Math.hypot(y.x - sx, y.y - sy) > 3) { sx = y.x; sy = y.y; } else { sx += (y.x - sx) * k; sy += (y.y - sy) * k; }
    const seen = new Set(); const pl = v.players.map((p) => { seen.add(p.id); let s = sm.get(p.id); if (!s || Math.hypot(p.x - s.x, p.y - s.y) > 3) s = { x: p.x, y: p.y }; s.x += (p.x - s.x) * k; s.y += (p.y - s.y) * k; sm.set(p.id, s); return Object.assign({}, p, { x: s.x, y: s.y, name: window.Voice.isSpeaking(p.id) ? '🔊 ' + p.name : p.name }); }); for (const id of sm.keys()) if (!seen.has(id)) sm.delete(id);
    const rv = Object.assign({}, v, { players: pl, you: Object.assign({}, y, { x: sx, y: sy, f: C.face, moving: Math.hypot(mv[0], mv[1]) > 0.1 }) });
    D.renderWorld(ctx, cv.width, cv.height, rv, cfg.gfx | 0, now / 1000);
  }
  AU._hook(onView, screen, resize); resize(); screen(); requestAnimationFrame(frame);
  window.drawCamViewHook = 1;
})();
