'use strict';
/* Cliente: menus, transporte (local/online), entrada (joystick invisível + teclado), HUD, lobby, reunião, microfone. */
(function () {
  const $ = (id) => document.getElementById(id), M = window.MAP, SIMC = window.SIM, D = window.Draw, COLS = SIMC.COLORS;
  const LS = { get(k, d) { try { const v = localStorage.getItem('to_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('to_' + k, JSON.stringify(v)); } catch (e) {} } };
  const cfg = Object.assign({ sfx: 70, gfx: 1, mic: 'open', ns: 1, vol: 80, name: '', color: -1, hat: 0, token: '' }, LS.get('cfg', {}));
  if (!cfg.token) cfg.token = 'k' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const save = () => LS.set('cfg', cfg);
  const HATN = ['Antena', 'Boné', 'Coroa', 'Orelhas', 'Cartola', 'Flor', 'Auréola', 'Fone', 'Laço'];
  const TN = { wires: 'Ligar fios', seq: 'Repetir sequência', code: 'Digitar código', align: 'Alinhar sinal', levers: 'Alavancas', hold: 'Segurar', cam: 'Câmeras' };
  let T = null, V = null, myId = 0, lastPhase = '', lastEv = 0, online = false, leaving = false, roomCode = '', retry = 0, sel = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let tt = 0; function toast(s) { const e = $('toast'); e.textContent = s; e.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('on'), 2600); }
  // ---------- áudio (efeitos) ----------
  let AC = null; function ac() { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {} return AC; }
  function beep(f, d, type, g, f2) { if (!cfg.sfx) return; const a = ac(); if (!a) return; const o = a.createOscillator(), v = a.createGain(); o.type = type || 'sine'; o.frequency.value = f; if (f2) o.frequency.linearRampToValueAtTime(f2, a.currentTime + d); v.gain.value = (g || 0.15) * cfg.sfx / 100; v.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d); o.connect(v); v.connect(a.destination); o.start(); o.stop(a.currentTime + d); }
  const SFX = { task: () => { beep(660, 0.12, 'triangle'); setTimeout(() => beep(990, 0.18, 'triangle'), 110); }, kill: () => beep(140, 0.35, 'sawtooth', 0.3, 50), alarm: () => { beep(520, 0.3, 'square', 0.12); setTimeout(() => beep(420, 0.3, 'square', 0.12), 320); }, meet: () => { beep(300, 0.5, 'sawtooth', 0.2, 600); }, ok: () => beep(880, 0.08, 'sine'), end: () => { beep(440, 0.2); setTimeout(() => beep(660, 0.3), 200); } };
  // ---------- ícone de personagem em canvas pequeno ----------
  function icon(cv, color, hat, ghost, dead) { const c = cv.getContext('2d'), w = cv.width, h = cv.height; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); const k = Math.min(w / 1.1, h / 1.25); c.translate(w / 2, h - 3); c.scale(k, k); D.drawChar(c, 0, 0, COLS[color] || COLS[0], hat, 1, false, ghost, 0, dead); }
  const mkIcon = (color, hat, ghost) => { const c = document.createElement('canvas'); c.width = 68; c.height = 76; icon(c, color, hat, ghost); return c; };
  // ---------- transporte ----------
  function send(m) { if (T) T.send(m); }
  function startLocal() {
    leaveGame(true); online = false; const sim = new SIMC({ bots: 9, botsOn: true, isPublic: false }); sim.code = 'LOCAL'; const r = sim.join(cfg.token, cfg.name || 'Jogador', { color: cfg.color, hat: cfg.hat }); myId = r.id; roomCode = 'LOCAL';
    const tick = () => { try { sim.step(1 / 30); V = sim.view(myId); onView(); } catch (e) { console.error(e); } };
    const iv = setInterval(tick, 33); T = { send: (m) => sim.input(myId, m), close: () => clearInterval(iv), sim }; tick();
  }
  function server() { const s = window.AU_SERVER || location.origin; return s.replace(/\/$/, ''); }
  function connect(first) {
    leaveGame(true); online = true; leaving = false; retry = 0; let ws = null, closed = false, first0 = first;
    const open = (msg) => {
      ws = new WebSocket(server().replace(/^http/, 'ws') + '/ws');
      ws.onopen = () => { ws.send(JSON.stringify(msg)); };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (m.t === 'hi') { myId = m.id; roomCode = m.code; retry = 0; first0 = { t: 'join', code: m.code, token: cfg.token, name: cfg.name }; } else if (m.t === 'view') { V = m.v; onView(); } else if (m.t === 'err') { toast(m.msg); if (!V) { closed = true; showErr(m.msg); } } };
      ws.onclose = () => { if (closed || leaving) return; if (!V) { showErr('Não foi possível conectar ao servidor.'); return; } if (retry++ > 40) { toast('Conexão perdida.'); leaveGame(); return; } toast('Reconectando… (' + retry + ')'); setTimeout(() => { if (!closed && !leaving) open(first0); }, 1500); };
    };
    T = { send: (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'in', m })); }, close: () => { closed = true; try { ws.close(); } catch (e) {} } }; open(first);
  }
  let errEl = 'e-create'; function showErr(s) { const e = $(errEl); if (e) e.textContent = s; }
  function leaveGame(quiet) { leaving = true; if (T) { try { T.send({ t: 'leave' }); } catch (e) {} T.close(); } T = null; V = null; lastPhase = ''; lastEv = 0; Mini.close(false); closeMap(); closeModal(); screen(); if (!quiet) { toast('Você saiu da sala'); } }
  // ---------- entrada ----------
  const keys = {}; let joy = null, jx = 0, jy = 0, face = 1, lastSent = [9, 9], lastSendT = 0;
  const cv = $('cv');
  cv.addEventListener('pointerdown', (e) => { if (!V || V.phase !== 'play' || joy || e.clientX > innerWidth * 0.6) return; joy = { id: e.pointerId, x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); e.preventDefault(); });
  cv.addEventListener('pointermove', (e) => { if (!joy || e.pointerId !== joy.id) return; const dx = e.clientX - joy.x, dy = e.clientY - joy.y, l = Math.hypot(dx, dy), R = 55; if (l > R) { joy.x += dx / l * (l - R); joy.y += dy / l * (l - R); } jx = l < 8 ? 0 : dx / Math.max(l, R); jy = l < 8 ? 0 : dy / Math.max(l, R); });
  const jend = (e) => { if (joy && e.pointerId === joy.id) { joy = null; jx = jy = 0; } };
  cv.addEventListener('pointerup', jend); cv.addEventListener('pointercancel', jend); cv.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return; const k = e.key.toLowerCase(); keys[k] = 1; if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (!V || e.repeat) return; if (V.phase === 'play' && !Mini.cur) { if (k === 'e' || k === ' ') act('use'); else if (k === 'q') act('kill'); else if (k === 'r') act('rep'); else if (k === 'c') act('vent'); else if (k === 'z') act('disg'); else if (k === 'g') act('sab'); else if (k === 'm') openMap(false); }
    if (k === 'v') mic.ptt = true, micUpdate(); if (k === 'escape') { if (!$('mapov').hidden) closeMap(); else if (Mini.cur) Mini.close(true); else if (V && V.phase === 'play') pauseMenu(); }
  });
  addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); delete keys[k]; if (k === 'v') { mic.ptt = false; micUpdate(); } });
  addEventListener('blur', () => { for (const k in keys) delete keys[k]; joy = null; jx = jy = 0; });
  function inputVec() { let x = jx, y = jy; if (keys.a || keys.arrowleft) x -= 1; if (keys.d || keys.arrowright) x += 1; if (keys.w || keys.arrowup) y -= 1; if (keys.s || keys.arrowdown) y += 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } return [x, y]; }
  function pumpInput(now) {
    if (!V || V.phase !== 'play') return [0, 0]; let v = (Mini.cur || !$('mapov').hidden || modal) ? [0, 0] : inputVec(); if (V.you.vent != null) v = [0, 0];
    if (v[0] > 0.1) face = 1; else if (v[0] < -0.1) face = -1; const ch = Math.abs(v[0] - lastSent[0]) > 0.04 || Math.abs(v[1] - lastSent[1]) > 0.04;
    if (ch || (now - lastSendT > 250 && (v[0] || v[1]))) { send({ t: 'mv', x: v[0], y: v[1] }); lastSent = v; lastSendT = now; } return v;
  }
  // ---------- ações do HUD ----------
  const near = (x, y, r) => V && Math.hypot(V.you.x - x, V.you.y - y) <= r;
  function usable() { const y = V.you; if (y.vent != null) return false; for (const k of ['lights', 'comms']) if (V.sab[k] && near(M.FIX[k].x, M.FIX[k].y, 1.8)) return true; if (V.sab.reactor && (near(M.FIX.r0.x, M.FIX.r0.y, 1.8) || near(M.FIX.r1.x, M.FIX.r1.y, 1.8))) return true; if (y.tasks.some((t) => !t.done && near(M.TASKS[t.sid].x, M.TASKS[t.sid].y, 1.8))) return true; if (y.alive && y.emerg > 0 && !V.sab.reactor && near(M.EMERG.x, M.EMERG.y, 2.2)) return true; return near(M.CAMMON.x, M.CAMMON.y, 2.2); }
  const nearVent = () => M.VENTS.some((v) => near(v.x, v.y, 1.6));
  const nearBody = () => V.bodies.some((b) => near(b.x, b.y, 2.8));
  function act(k) {
    if (!V || V.phase !== 'play' || Mini.cur || modal) return; ac(); const y = V.you;
    if (k === 'use') { if (y.vent != null) { send({ t: 'vent', exit: true }); return; } if (usable()) send({ t: 'use' }); else toast('Nada para usar aqui'); } else if (k === 'rep') { if (nearBody()) send({ t: 'report' }); else toast('Nenhum corpo por perto'); }
    else if (k === 'kill' && y.role === 'imp' && y.alive) { if (y.kcd > 0) toast('Recarregando: ' + Math.ceil(y.kcd) + 's'); else send({ t: 'kill' }); }
    else if (k === 'sab' && y.role === 'imp' && y.alive) openMap(true);
    else if (k === 'vent' && y.role === 'imp' && y.alive) { if (y.vent != null) send({ t: 'vent' }); else if (nearVent()) send({ t: 'vent' }); else toast('Chegue perto de um duto'); }
    else if (k === 'disg' && y.role === 'imp' && y.alive) { if (y.acd > 0) toast('Recarregando: ' + Math.ceil(y.acd) + 's'); else disgMenu(); }
  }
  function bindBtn(id, k) { const b = $(id); b.addEventListener('pointerdown', (e) => { e.preventDefault(); act(k); }); }
  bindBtn('a-use', 'use'); bindBtn('a-kill', 'kill'); bindBtn('a-sab', 'sab'); bindBtn('a-vent', 'vent'); bindBtn('a-disg', 'disg'); bindBtn('a-rep', 'rep');
  $('b-map').addEventListener('pointerdown', (e) => { e.preventDefault(); openMap(false); }); $('b-set').addEventListener('pointerdown', (e) => { e.preventDefault(); pauseMenu(); });
  $('b-chat').addEventListener('pointerdown', (e) => { e.preventDefault(); toast('O chat abre durante as reuniões'); });
  // ---------- modal simples ----------
  let modal = null; function closeModal() { if (modal) { modal.remove(); modal = null; } }
  function openModal(html) { closeModal(); modal = document.createElement('div'); modal.className = 'pause'; modal.innerHTML = '<div>' + html + '</div>'; document.body.appendChild(modal); modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeModal(); }); send({ t: 'mv', x: 0, y: 0 }); lastSent = [0, 0]; return modal.firstChild; }
  function disgMenu() { const o = V.roster.filter((r) => r.id !== myId && !r.dead); const el = openModal('<h3>Disfarçar-se como…</h3><div class="chips" id="dl"></div>'); const l = el.querySelector('#dl'); o.forEach((r) => { const b = document.createElement('button'); b.textContent = r.name; b.style.borderLeft = '6px solid ' + COLS[r.color]; b.onclick = () => { send({ t: 'disg', as: r.id }); closeModal(); }; l.appendChild(b); }); }
  function pauseMenu() {
    const el = openModal(`<h3>Configurações</h3><label>Efeitos sonoros<input type="range" id="p-sfx" min="0" max="100" value="${cfg.sfx}"></label><label>Gráficos<select id="p-gfx"><option value="0">Baixo</option><option value="1">Médio</option><option value="2">Alto</option></select></label><label>Volume do chat de voz<input type="range" id="p-vol" min="0" max="100" value="${cfg.vol}"></label><button class="go" id="p-ok">CONTINUAR</button> <button class="go" id="p-out" style="background:var(--rd);color:#fff">SAIR DA PARTIDA</button>`);
    el.querySelector('#p-gfx').value = cfg.gfx; el.querySelector('#p-sfx').oninput = (e) => { cfg.sfx = +e.target.value; save(); }; el.querySelector('#p-gfx').onchange = (e) => { cfg.gfx = +e.target.value; save(); resize(); }; el.querySelector('#p-vol').oninput = (e) => { cfg.vol = +e.target.value; save(); voiceVol(); };
    el.querySelector('#p-ok').onclick = closeModal; el.querySelector('#p-out').onclick = () => { closeModal(); leaveGame(); };
  }
  // ---------- mapa / sabotagem ----------
  let mapIv = 0;
  function openMap(sab) {
    if (!V || V.phase !== 'play') return; $('mapov').hidden = false; const c = $('mapcv'); c.width = 768; c.height = Math.round(768 * M.H / M.W); const k = c.width / M.W; send({ t: 'mv', x: 0, y: 0 }); lastSent = [0, 0];
    const draw = () => { if (!V || V.phase !== 'play') return closeMap(); const g = c.getContext('2d'); g.globalAlpha = 1; g.drawImage(D.buildMap(), 0, 0, c.width, c.height); g.fillStyle = 'rgba(5,8,14,.35)'; g.fillRect(0, 0, c.width, c.height);
      if (!V.comms) V.you.tasks.forEach((t) => { if (t.done) return; const s = M.TASKS[t.sid]; g.fillStyle = '#ffd60a'; g.beginPath(); g.arc(s.x * k, s.y * k, 6, 0, 7); g.fill(); });
      [['lights', 'lights'], ['comms', 'comms']].forEach(([s, f]) => { if (V.sab[s]) { g.fillStyle = '#ff3b2f'; g.beginPath(); g.arc(M.FIX[f].x * k, M.FIX[f].y * k, 8, 0, 7); g.fill(); } }); if (V.sab.reactor) ['r0', 'r1'].forEach((f) => { g.fillStyle = '#ff3b2f'; g.beginPath(); g.arc(M.FIX[f].x * k, M.FIX[f].y * k, 8, 0, 7); g.fill(); });
      g.fillStyle = '#fff'; g.beginPath(); g.arc(V.you.x * k, V.you.y * k, 8, 0, 7); g.fill(); g.strokeStyle = COLS[(V.roster.find((r) => r.id === myId) || { color: 0 }).color]; g.lineWidth = 4; g.stroke(); };
    draw(); clearInterval(mapIv); mapIv = setInterval(draw, 250);
    const sm = $('sabm'); const y = V.you; if (sab && y.role === 'imp' && y.alive) { sm.hidden = false; const busy = V.sab.lights || V.sab.comms || V.sab.reactor, cd = y.sabCd > 0; let h = `<h4>SABOTAGEM${cd ? ' — espere ' + Math.ceil(y.sabCd) + 's' : ''}</h4>`; [['lights', 'Apagar luzes'], ['comms', 'Cortar rádio'], ['reactor', 'Sobrecarregar reator']].forEach(([k, n]) => { h += `<button data-k="${k}" ${cd || busy ? 'disabled' : ''}>${n}</button>`; }); h += '<h4>TRANCAR PORTAS</h4>'; [...new Set(M.DOORS.map((d) => d[4]))].forEach((r) => { h += `<button data-k="doors" data-r="${r}" ${cd ? 'disabled' : ''}>${M.ROOMS[r][0]}</button>`; }); sm.innerHTML = h; sm.onclick = (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; send({ t: 'sab', k: b.dataset.k, room: +b.dataset.r || 0 }); closeMap(); }; } else { sm.hidden = true; }
  }
  function closeMap() { clearInterval(mapIv); $('mapov').hidden = true; } $('mapx').addEventListener('pointerdown', (e) => { e.preventDefault(); closeMap(); });
  // ---------- microfone (estados: desligado, ligado, falando, sem permissão) ----------
  const mic = { on: false, deny: false, stream: null, an: null, buf: null, talk: false, speak: false, ptt: false };
  function micCls() { return mic.deny ? 'deny' : !mic.on ? 'off' : mic.speak ? 'speak' : 'on'; }
  function micUpdate() { mic.talk = mic.on && (cfg.mic === 'open' || mic.ptt); if (mic.stream) mic.stream.getAudioTracks().forEach((t) => { t.enabled = mic.talk; }); ['b-mic', 'm-mic'].forEach((id) => { const b = $(id); b.className = 'ib ' + micCls(); b.setAttribute('aria-label', 'Microfone: ' + ({ deny: 'sem permissão', off: 'desligado', on: 'ligado', speak: 'falando' }[micCls()])); }); }
  async function micToggle() {
    ac(); if (mic.deny) { toast('Sem permissão do microfone. Libere-o nas configurações do navegador.'); return; }
    if (!mic.stream) { if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { mic.deny = true; micUpdate(); toast('Microfone indisponível neste navegador (precisa de HTTPS).'); return; }
      try { mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: !!+cfg.ns, echoCancellation: true, autoGainControl: true } }); } catch (e) { mic.deny = true; micUpdate(); toast('Permissão do microfone negada.'); return; }
      const a = ac(), src = a.createMediaStreamSource(mic.stream); mic.an = a.createAnalyser(); mic.an.fftSize = 512; mic.buf = new Float32Array(512); src.connect(mic.an); voiceStart(src, a); mic.on = true; }
    else mic.on = !mic.on; micUpdate(); toast(mic.on ? (cfg.mic === 'ptt' ? 'Microfone ligado (segure V ou o botão para falar)' : 'Microfone ligado') : 'Microfone desligado');
  }
  setInterval(() => { let sp = false; if (mic.an && mic.talk) { mic.an.getFloatTimeDomainData(mic.buf); let s = 0; for (let i = 0; i < mic.buf.length; i++) s += mic.buf[i] * mic.buf[i]; sp = Math.sqrt(s / mic.buf.length) > 0.02; } if (sp !== mic.speak) { mic.speak = sp; micUpdate(); } }, 90);
  ['b-mic', 'm-mic'].forEach((id) => { const b = $(id); b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (cfg.mic === 'ptt' && mic.on) { mic.ptt = true; micUpdate(); } else micToggle(); }); const up = () => { if (mic.ptt && cfg.mic === 'ptt') { mic.ptt = false; micUpdate(); } }; b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up); });
  function voiceStart() {} function voiceVol() {} // voz por proximidade: Fase 2 (ver voice.js)
  micUpdate();
  window.AU = { cfg, save, send, toast, mic, micUpdate, icon, mkIcon, esc, SFX, get V() { return V; }, get myId() { return myId; }, set voiceStart(f) { voiceStart = f; }, set voiceVol(f) { voiceVol = f; } };
  // ---- continua em app2.js (UI, loop de render) ----
  window.AU._core = { startLocal, connect, leaveGame, pumpInput, act, usable, nearBody, nearVent, closeMap, openModal, closeModal, get online() { return online; }, get face() { return face; }, get roomCode() { return roomCode; }, setErr(id) { errEl = id; }, get T() { return T; }, get mapOpen() { return !$('mapov').hidden; }, get modal() { return modal; } };
  let onViewImpl = () => {}, screenImpl = () => {}, resize = () => {}; function onView() { onViewImpl(); } function screen() { screenImpl(); }
  window.AU._hook = (a, b, c) => { onViewImpl = a; screenImpl = b; resize = c; };
})();
