'use strict';
/* Desenho 2D original: mapa pré-renderizado, personagens "Robonautas", acessórios, neblina por linha de visão. */
(function () {
  const M = window.MAP, S = window.SIM;
  const PAL = [['#3b2530', '#46303b'], ['#223a4b', '#2a4659'], ['#2b3152', '#343b61'], ['#29403d', '#324c48'], ['#3e3a2b', '#48432f'], ['#2a4130', '#334d3a']], CORR = ['#4b5262', '#545c6d'];
  const TC = { wires: '#ff7a5c', seq: '#ffd60a', code: '#7ad7ff', align: '#9aff8a', levers: '#ffd60a', hold: '#ff5c5c', cam: '#7ad7ff' };
  let mapCv = null; const TS0 = 32;
  const rr = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
  function buildMap() {
    if (mapCv) return mapCv; mapCv = document.createElement('canvas'); mapCv.width = M.W * TS0; mapCv.height = M.H * TS0; const c = mapCv.getContext('2d'); c.fillStyle = '#080b11'; c.fillRect(0, 0, mapCv.width, mapCv.height);
    const fl = (x, y) => x >= 0 && y >= 0 && x < M.W && y < M.H && !M.solid[y * M.W + x];
    for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) { const k = y * M.W + x;
      if (!M.solid[k]) { const th = M.theme[k], p = th >= 0 ? PAL[th] : CORR; c.fillStyle = (x + y) & 1 ? p[0] : p[1]; c.fillRect(x * TS0, y * TS0, TS0, TS0); c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(x * TS0, y * TS0, TS0, 1); c.fillRect(x * TS0, y * TS0, 1, TS0); }
      else if (fl(x, y + 1)) { c.fillStyle = '#2b3447'; c.fillRect(x * TS0, y * TS0, TS0, TS0); c.fillStyle = '#3a4660'; c.fillRect(x * TS0, y * TS0, TS0, 6); c.fillStyle = '#1b2232'; c.fillRect(x * TS0, y * TS0 + TS0 - 5, TS0, 5); c.fillStyle = 'rgba(122,215,255,.25)'; if ((x * 7 + y) % 5 === 0) c.fillRect(x * TS0 + 6, y * TS0 + 12, TS0 - 12, 4); }
      else if (fl(x - 1, y) || fl(x + 1, y) || fl(x, y - 1) || fl(x - 1, y - 1) || fl(x + 1, y - 1) || fl(x - 1, y + 1) || fl(x + 1, y + 1)) { c.fillStyle = '#171d2b'; c.fillRect(x * TS0, y * TS0, TS0, TS0); } }
    // portas (moldura amarela e preta)
    M.DOORS.forEach((d) => { c.fillStyle = '#e8b923'; const hz = d[2] > d[3]; if (hz) { c.fillRect(d[0] * TS0, d[1] * TS0, d[2] * TS0, 5); c.fillRect(d[0] * TS0, (d[1] + 1) * TS0 - 5, d[2] * TS0, 5); } else { c.fillRect(d[0] * TS0, d[1] * TS0, 5, d[3] * TS0); c.fillRect((d[0] + 1) * TS0 - 5, d[1] * TS0, 5, d[3] * TS0); } });
    // nomes das salas (discretos)
    c.textAlign = 'center'; c.font = 'bold 15px system-ui,sans-serif'; c.fillStyle = 'rgba(255,255,255,.16)'; M.ROOMS.forEach((r) => c.fillText(r[0].toUpperCase(), (r[1] + r[3] / 2) * TS0, (r[2] + 0.9) * TS0));
    // consoles das tarefas
    M.TASKS.forEach((t) => { const x = t.x * TS0, y = t.y * TS0; c.fillStyle = '#1a2130'; rr(c, x - 15, y - 12, 30, 22, 5); c.fill(); c.fillStyle = TC[t.type]; c.globalAlpha = 0.85; rr(c, x - 11, y - 9, 22, 11, 3); c.fill(); c.globalAlpha = 1; c.fillStyle = '#0c1018'; c.fillRect(x - 12, y + 3, 24, 4); });
    // painéis de conserto
    Object.entries(M.FIX).forEach(([k, t]) => { const x = t.x * TS0, y = t.y * TS0; c.fillStyle = '#2b1a1a'; rr(c, x - 14, y - 14, 28, 28, 6); c.fill(); c.strokeStyle = '#ff7a5c'; c.lineWidth = 2; c.stroke(); c.fillStyle = '#ff7a5c'; c.font = 'bold 11px system-ui'; c.fillText(k === 'lights' ? 'LUZ' : k === 'comms' ? 'RÁDIO' : 'REATOR', x, y + 4); });
    // dutos
    M.VENTS.forEach((v) => { const x = v.x * TS0, y = v.y * TS0; c.fillStyle = '#11151d'; rr(c, x - 15, y - 11, 30, 22, 4); c.fill(); c.strokeStyle = '#5b667a'; c.lineWidth = 2; c.stroke(); c.strokeStyle = '#2d3646'; for (let i = -9; i <= 9; i += 6) { c.beginPath(); c.moveTo(x + i, y - 8); c.lineTo(x + i, y + 8); c.stroke(); } });
    // mesa de emergência
    { const x = M.EMERG.x * TS0, y = M.EMERG.y * TS0; c.fillStyle = '#2b3a55'; c.beginPath(); c.ellipse(x, y, 62, 44, 0, 0, 7); c.fill(); c.strokeStyle = '#4a5f86'; c.lineWidth = 4; c.stroke(); c.fillStyle = '#b3261a'; c.beginPath(); c.arc(x, y, 14, 0, 7); c.fill(); c.strokeStyle = '#ffd60a'; c.lineWidth = 3; c.stroke(); c.fillStyle = '#fff'; c.font = 'bold 9px system-ui'; c.fillText('EMERGÊNCIA', x, y + 34); }
    // monitor de câmeras
    { const x = M.CAMMON.x * TS0, y = M.CAMMON.y * TS0; c.fillStyle = '#10151f'; rr(c, x - 24, y - 20, 48, 34, 5); c.fill(); c.fillStyle = '#1e5a6b'; c.fillRect(x - 20, y - 16, 18, 12); c.fillRect(x + 2, y - 16, 18, 12); c.fillRect(x - 20, y - 1, 18, 11); c.fillRect(x + 2, y - 1, 18, 11); }
    return mapCv;
  }
  function drawHat(c, h, bob) {
    const y = -0.78 + bob; c.lineWidth = 0.04; c.strokeStyle = '#10131a';
    const fill = (col) => { c.fillStyle = col; c.fill(); c.stroke(); };
    if (h === 0) { c.beginPath(); c.moveTo(0, y); c.lineTo(0, y - 0.2); c.stroke(); c.beginPath(); c.arc(0, y - 0.24, 0.06, 0, 7); fill('#ffd60a'); }
    else if (h === 1) { rr(c, -0.26, y - 0.14, 0.52, 0.16, 0.06); fill('#3e63dd'); rr(c, 0.1, y - 0.04, 0.3, 0.07, 0.03); fill('#2c47a5'); }
    else if (h === 2) { c.beginPath(); c.moveTo(-0.24, y); c.lineTo(-0.24, y - 0.22); c.lineTo(-0.12, y - 0.1); c.lineTo(0, y - 0.28); c.lineTo(0.12, y - 0.1); c.lineTo(0.24, y - 0.22); c.lineTo(0.24, y); c.closePath(); fill('#ffd60a'); }
    else if (h === 3) { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.18, y + 0.02); c.quadraticCurveTo(s * 0.34, y - 0.04, s * 0.3, y - 0.3); c.quadraticCurveTo(s * 0.22, y - 0.12, s * 0.1, y - 0.04); c.closePath(); fill('#e8e6df'); } }
    else if (h === 4) { rr(c, -0.3, y - 0.04, 0.6, 0.07, 0.03); fill('#1b1b22'); rr(c, -0.17, y - 0.34, 0.34, 0.32, 0.04); fill('#1b1b22'); c.fillStyle = '#e5484d'; c.fillRect(-0.17, y - 0.12, 0.34, 0.06); }
    else if (h === 5) { c.beginPath(); c.moveTo(0, y); c.lineTo(0, y - 0.18); c.stroke(); for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(Math.cos(i * 1.256) * 0.1, y - 0.26 + Math.sin(i * 1.256) * 0.1, 0.075, 0, 7); fill('#ff8ac0'); } c.beginPath(); c.arc(0, y - 0.26, 0.06, 0, 7); fill('#ffd60a'); }
    else if (h === 6) { c.beginPath(); c.ellipse(0, y - 0.18, 0.24, 0.07, 0, 0, 7); c.lineWidth = 0.06; c.strokeStyle = '#ffe680'; c.stroke(); }
    else if (h === 7) { c.beginPath(); c.arc(0, y + 0.18, 0.4, Math.PI * 1.1, Math.PI * 1.9); c.lineWidth = 0.07; c.strokeStyle = '#2b2f3b'; c.stroke(); for (const s of [-1, 1]) { rr(c, s * 0.4 - 0.07, y + 0.2, 0.14, 0.24, 0.05); fill('#e5484d'); } }
    else { c.beginPath(); c.moveTo(0, y - 0.04); c.lineTo(-0.2, y - 0.2); c.lineTo(-0.2, y + 0.04); c.closePath(); fill('#e93d82'); c.beginPath(); c.moveTo(0, y - 0.04); c.lineTo(0.2, y - 0.2); c.lineTo(0.2, y + 0.04); c.closePath(); fill('#e93d82'); c.beginPath(); c.arc(0, y - 0.04, 0.06, 0, 7); fill('#ffb0d6'); }
  }
  // Robonauta: corpo arredondado, viseira larga, antena/acessório e pés alternados
  function drawChar(c, x, y, col, hat, f, mv, ghost, t, dead) {
    c.save(); c.translate(x, y); if (dead) { c.rotate(Math.PI / 2 * f); c.translate(0.1, -0.05); } c.scale(f, 1); if (ghost) c.globalAlpha = 0.5;
    const bob = mv ? Math.abs(Math.sin(t * 13)) * -0.04 : 0, st = mv ? Math.sin(t * 13) * 0.11 : 0; c.lineJoin = 'round';
    if (!ghost) { c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, 0.02, 0.36, 0.1, 0, 0, 7); c.fill(); }
    c.lineWidth = 0.05; c.strokeStyle = '#10131a'; c.fillStyle = '#2b2f3b'; rr(c, -0.22 + st, -0.14, 0.19, 0.16, 0.06); c.fill(); c.stroke(); rr(c, 0.03 - st, -0.14, 0.19, 0.16, 0.06); c.fill(); c.stroke();
    c.fillStyle = col; rr(c, -0.34, -0.8 + bob, 0.68, 0.7, 0.24); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.22)'; rr(c, -0.26, -0.72 + bob, 0.2, 0.1, 0.05); c.fill(); c.fillStyle = 'rgba(0,0,0,.18)'; rr(c, -0.3, -0.26 + bob, 0.6, 0.12, 0.06); c.fill();
    c.fillStyle = '#d6f3ff'; rr(c, -0.2, -0.64 + bob, 0.54, 0.26, 0.13); c.fill(); c.stroke(); c.fillStyle = '#17202e'; for (const ex of [0.02, 0.21]) { c.beginPath(); c.ellipse(ex, -0.51 + bob, 0.04, 0.055, 0, 0, 7); c.fill(); }
    c.fillStyle = col; c.beginPath(); c.arc(-0.35, -0.38 + bob, 0.1, 0, 7); c.fill(); c.stroke();
    drawHat(c, hat | 0, bob); c.restore();
  }
  function label(c, text, x, y, ts, color) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.font = `bold ${Math.max(11, ts * 0.3)}px system-ui,sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.85)'; c.fillStyle = color || '#fff'; c.strokeText(text, x, y); c.fillText(text, x, y); c.restore(); }
  function fogPoly(x, y, R, closed, n) { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a); let d = 0.25; while (d < R) { if (M.isSolid(Math.floor(x + dx * d), Math.floor(y + dy * d), closed)) { d += 0.12; break; } d += 0.2; } d = Math.min(d, R); pts.push([x + dx * d, y + dy * d]); } return pts; }
  const COLS = S.COLORS; const roster = (v, id) => v.roster.find((r) => r.id === id);
  function renderWorld(c, W, H, v, q, t) {
    const me = v.you, mine = roster(v, me.id) || { color: 0, hat: 0 }, ts = Math.max(26, Math.min(70, Math.min(H / 12.5, W / 18))), closed = M.DOORS.map((d, i) => (v.sab.doors.includes(i) ? 1 : 0));
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#05070b'; c.fillRect(0, 0, W, H); const cam = { x: me.x, y: me.y };
    const ghost = !me.alive; c.save(); c.translate(W / 2 - cam.x * ts, H / 2 - cam.y * ts); c.scale(ts, ts);
    if (!ghost) { const pts = fogPoly(me.x, me.y, me.vis, closed, [48, 72, 112][q]); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.clip(); }
    c.imageSmoothingEnabled = true; c.drawImage(buildMap(), 0, 0, M.W, M.H);
    // portas fechadas
    closed.forEach((cl, i) => { if (!cl) return; const d = M.DOORS[i]; c.fillStyle = '#a8261c'; c.fillRect(d[0], d[1], d[2], d[3]); c.fillStyle = '#1a1010'; for (let k = 0; k < 6; k++) c.fillRect(d[0] + (d[2] > d[3] ? k / 3 : 0.2), d[1] + (d[2] > d[3] ? 0.2 : k / 3), d[2] > d[3] ? 0.12 : d[2] - 0.4, d[2] > d[3] ? d[3] - 0.4 : 0.12); });
    // marcadores das minhas tarefas e dos consertos
    const pulse = 0.5 + 0.5 * Math.sin(t * 5); c.lineWidth = 0.06;
    if (!v.comms) me.tasks.forEach((tk) => { if (tk.done) return; const s = M.TASKS[tk.sid]; c.strokeStyle = `rgba(255,214,10,${0.55 + 0.4 * pulse})`; c.beginPath(); c.arc(s.x, s.y, 0.62, 0, 7); c.stroke(); c.fillStyle = '#ffd60a'; c.font = 'bold 0.5px system-ui'; c.textAlign = 'center'; c.fillText('!', s.x, s.y - 0.7 - pulse * 0.08); });
    const fx = []; if (v.sab.lights) fx.push(M.FIX.lights); if (v.sab.comms) fx.push(M.FIX.comms); if (v.sab.reactor) fx.push(M.FIX.r0, M.FIX.r1); fx.forEach((f) => { c.strokeStyle = `rgba(255,70,50,${0.5 + 0.5 * pulse})`; c.lineWidth = 0.09; c.beginPath(); c.arc(f.x, f.y, 0.8 + pulse * 0.15, 0, 7); c.stroke(); });
    v.bodies.forEach((b) => drawChar(c, b.x, b.y, COLS[b.color], b.hat, 1, false, false, t, true));
    const list = v.players.map((p) => ({ x: p.x, y: p.y, col: COLS[p.color], hat: p.hat, f: p.f, mv: p.mv, ghost: p.ghost, name: p.name, id: p.id })); if (me.vent == null) list.push({ x: me.x, y: me.y, col: COLS[mine.color], hat: mine.hat, f: me.f || 1, mv: me.moving, ghost, name: mine.name, me: true, id: me.id });
    list.sort((a, b) => a.y - b.y).forEach((p) => drawChar(c, p.x, p.y, p.col, p.hat, p.f, p.mv, p.ghost, t + p.id));
    c.restore();
    // nomes (fora da transformação para ficarem nítidos)
    const sx = (x) => W / 2 + (x - cam.x) * ts, sy = (y) => H / 2 + (y - cam.y) * ts; list.forEach((p) => label(c, p.name, sx(p.x), sy(p.y - 0.98), ts, p.me && v.you.role === 'imp' ? '#ff7a7a' : v.allies && v.allies.includes(p.id) ? '#ff7a7a' : '#fff'));
    // escuridão suave nas bordas e queda de luz
    const R = me.vis * ts, g = c.createRadialGradient(W / 2, H / 2, R * 0.55, W / 2, H / 2, R * 1.05); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, ghost ? 'rgba(0,0,0,0)' : 'rgba(5,7,11,.75)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (v.sab.reactor) { c.fillStyle = `rgba(255,0,0,${0.06 + 0.06 * pulse})`; c.fillRect(0, 0, W, H); }
    if (ghost) { c.fillStyle = 'rgba(80,120,255,.08)'; c.fillRect(0, 0, W, H); }
    return { sx, sy, ts };
  }
  function drawCamView(c, cm, w, h) { const R = 9, k = w / (R * 2); c.fillStyle = '#05070b'; c.fillRect(0, 0, w, h); c.save(); c.scale(k, k); c.translate(R - cm.x, R * h / w - cm.y); c.drawImage(buildMap(), 0, 0, M.W, M.H); cm.it.forEach((p) => drawChar(c, p.x, p.y, COLS[p.color], p.hat, 1, false, false, 0)); c.restore(); c.fillStyle = 'rgba(0,255,120,.07)'; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1); }
  window.Draw = { buildMap, drawChar, renderWorld, TC }; window.drawCamView = drawCamView;
})();
