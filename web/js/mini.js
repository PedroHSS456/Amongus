'use strict';
/* Minijogos: cada tarefa tem lógica e interface próprias. Mini.open(tipo, seed, {ctx, done(ans), cancel()}) */
(function () {
  const M = window.MAP, $ = (id) => document.getElementById(id);
  const COL = ['#e5484d', '#3e63dd', '#ffd60a', '#30a46c', '#e93d82'];
  const Mini = (window.Mini = { cur: null });
  const root = () => $('mini');
  function shell(title, body, hint) {
    const r = root(); r.hidden = false; r.innerHTML = `<div class="mbox"><button class="mx" aria-label="Fechar">✕</button><h3>${title}</h3><div class="mbody"></div><p class="mhint">${hint || ''}</p></div>`;
    r.querySelector('.mx').onclick = () => Mini.close(true); r.querySelector('.mbody').appendChild(body); return r.querySelector('.mbody');
  }
  Mini.close = function (cancel) { const c = Mini.cur; Mini.cur = null; root().hidden = true; root().innerHTML = ''; if (c && c.timer) clearInterval(c.timer); if (c && cancel && c.o.cancel) c.o.cancel(); };
  Mini.open = function (type, seed, o) {
    Mini.close(false); const c = (Mini.cur = { type, seed, o, timer: null }); const el = document.createElement('div'); el.className = 'mwrap';
    const fin = (ans) => { if (Mini.cur !== c) return; c.fin = true; setTimeout(() => { if (Mini.cur === c) { root().querySelector('.mhint').textContent = 'Concluído!'; } }, 0); o.done(ans); };
    ({ wires, seq, code, align, levers, hold, cam })[type](el, c, fin, seed, o);
  };
  Mini.update = function (v) { const c = Mini.cur; if (c && c.upd) c.upd(v); if (c && c.fin && v.you && !v.you.doing) Mini.close(false); };
  // ---- fios: ligue as cores iguais ----
  function wires(el, c, fin) {
    const n = 4, order = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5).slice(0, n), right = order.slice().sort(() => Math.random() - 0.5), got = {}; let sel = null;
    el.innerHTML = `<svg viewBox="0 0 300 220" class="wsvg"></svg>`; const svg = el.firstChild, ns = 'http://www.w3.org/2000/svg';
    const ly = (i) => 30 + i * 52, draw = () => { svg.innerHTML = ''; order.forEach((col, i) => { const r = document.createElementNS(ns, 'rect'); r.setAttribute('x', 10); r.setAttribute('y', ly(i) - 14); r.setAttribute('width', 30); r.setAttribute('height', 28); r.setAttribute('rx', 5); r.setAttribute('fill', COL[col]); r.setAttribute('stroke', sel === i ? '#fff' : '#000'); r.setAttribute('stroke-width', sel === i ? 4 : 2); r.style.cursor = 'pointer'; r.onpointerdown = () => { sel = i; draw(); }; svg.appendChild(r); });
      right.forEach((col, j) => { const r = document.createElementNS(ns, 'rect'); r.setAttribute('x', 260); r.setAttribute('y', ly(j) - 14); r.setAttribute('width', 30); r.setAttribute('height', 28); r.setAttribute('rx', 5); r.setAttribute('fill', COL[col]); r.setAttribute('stroke', '#000'); r.setAttribute('stroke-width', 2); r.style.cursor = 'pointer'; r.onpointerdown = () => { if (sel == null) return; if (order[sel] === col) { got[sel] = j; sel = null; draw(); if (Object.keys(got).length === n) fin(null); } else { sel = null; draw(); } }; svg.appendChild(r); });
      for (const [i, j] of Object.entries(got)) { const l = document.createElementNS(ns, 'path'); l.setAttribute('d', `M40 ${ly(+i)} C 120 ${ly(+i)}, 180 ${ly(j)}, 260 ${ly(j)}`); l.setAttribute('stroke', COL[order[i]]); l.setAttribute('stroke-width', 9); l.setAttribute('fill', 'none'); l.setAttribute('stroke-linecap', 'round'); svg.insertBefore(l, svg.firstChild); } };
    draw(); shell('Ligar os fios', el, 'Toque num fio da esquerda e depois na mesma cor à direita.');
  }
  // ---- sequência: repita o padrão ----
  function seq(el, c, fin, seed) {
    const want = M.seqFor(seed), cols = ['#e5484d', '#3e63dd', '#ffd60a', '#30a46c']; let pos = 0, showing = true; el.innerHTML = `<div class="pads">${cols.map((x, i) => `<button class="pad" data-i="${i}" style="--c:${x}"></button>`).join('')}</div><div class="lamps">${want.map(() => '<i></i>').join('')}</div>`;
    const pads = [...el.querySelectorAll('.pad')], lamps = [...el.querySelectorAll('.lamps i')], flash = (i, ms) => { pads[i].classList.add('on'); setTimeout(() => pads[i].classList.remove('on'), ms || 320); };
    const play = () => { showing = true; pos = 0; lamps.forEach((l) => l.classList.remove('ok')); want.forEach((w, k) => setTimeout(() => { if (Mini.cur === c) flash(w, 380); if (k === want.length - 1) setTimeout(() => { showing = false; }, 450); }, 700 + k * 650)); };
    pads.forEach((p) => { p.onpointerdown = () => { if (showing || c.fin) return; const i = +p.dataset.i; flash(i, 180); if (want[pos] === i) { lamps[pos].classList.add('ok'); pos++; if (pos === want.length) fin(want); } else { showing = true; setTimeout(play, 500); } }; });
    shell('Repetir a sequência', el, 'Observe as luzes e repita a ordem.'); play();
  }
  // ---- código: leia e digite ----
  function code(el, c, fin, seed) {
    const cd = M.codeFor(seed); let cur = ''; el.innerHTML = `<div class="note">CÓDIGO<b>${cd}</b></div><div class="disp" id="cdisp">----</div><div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div>`; const d = el.querySelector('#cdisp');
    const show = () => { d.textContent = (cur + '----').slice(0, 4); };
    el.querySelectorAll('.keys button').forEach((b) => { b.onpointerdown = () => { if (c.fin) return; const k = b.dataset.k; if (k === 'C') cur = ''; else if (k === 'OK') { if (cur === cd) fin(cd); else { cur = ''; d.classList.add('bad'); setTimeout(() => d.classList.remove('bad'), 350); } } else if (cur.length < 4) { cur += k; if (cur.length === 4) { if (cur === cd) { show(); fin(cd); return; } else { d.classList.add('bad'); setTimeout(() => { d.classList.remove('bad'); cur = ''; show(); }, 400); } } } show(); }; });
    shell('Digitar o código', el, 'Digite os 4 números do cartão.');
  }
  // ---- alinhar o motor: mantenha o marcador na linha ----
  function align(el, c, fin) {
    let target = 0.5 + (Math.random() - 0.5) * 0.4, y = 0.1, ok = 0, drag = false, t0 = performance.now(), ph = Math.random() * 6; el.innerHTML = `<div class="al"><div class="altrack"><i class="altg"></i><b class="alh"></b></div><div class="albar"><span></span></div></div>`;
    const tr = el.querySelector('.altrack'), tg = el.querySelector('.altg'), h = el.querySelector('.alh'), bar = el.querySelector('.albar span');
    const setY = (cy) => { const r = tr.getBoundingClientRect(); y = Math.max(0, Math.min(1, (cy - r.top) / r.height)); };
    tr.onpointerdown = (e) => { drag = true; tr.setPointerCapture(e.pointerId); setY(e.clientY); }; tr.onpointermove = (e) => { if (drag) setY(e.clientY); }; tr.onpointerup = () => { drag = false; };
    let last = performance.now(); c.timer = setInterval(() => { const now = performance.now(), dt = (now - last) / 1000; last = now; ph += dt; target = 0.5 + Math.sin(ph * 1.1) * 0.28 + Math.sin(ph * 2.3) * 0.08; tg.style.top = target * 100 + '%'; h.style.top = y * 100 + '%'; const on = Math.abs(y - target) < 0.07; ok = on ? ok + dt : Math.max(0, ok - dt * 0.8); tg.classList.toggle('hit', on); bar.style.width = Math.min(100, ok / 2.2 * 100) + '%'; if (ok >= 2.2 && !c.fin) fin(null); }, 33);
    shell('Alinhar o motor', el, 'Arraste a alça e mantenha-a sobre a linha em movimento.');
  }
  // ---- alavancas: ligue todas ----
  function levers(el, c, fin) {
    const st = [0, 1, 2, 3, 4].map(() => Math.random() < 0.7 ? 0 : 1); if (st.every((x) => x)) st[2] = 0; el.innerHTML = `<div class="lev">${st.map((s, i) => `<button class="lv" data-i="${i}"><i></i></button>`).join('')}</div>`; const bs = [...el.querySelectorAll('.lv')];
    const draw = () => bs.forEach((b, i) => b.classList.toggle('on', !!st[i])); draw(); bs.forEach((b, i) => { b.onpointerdown = () => { if (c.fin) return; st[i] ^= 1; draw(); if (st.every((x) => x)) fin(null); }; }); shell('Restaurar energia', el, 'Ligue todas as chaves.');
  }
  // ---- reator: segurar (dois pontos ao mesmo tempo) ----
  function hold(el, c, fin, seed, o) {
    el.innerHTML = `<div class="hold"><div class="hb">SEGURANDO…</div><p class="hs">Outro tripulante precisa segurar o outro ponto do reator ao mesmo tempo.</p><div class="hp"><span id="hp0">Ponto A: —</span><span id="hp1">Ponto B: —</span></div></div>`;
    c.upd = (v) => { const R = v.sab && v.sab.reactor; if (!R) return; el.querySelector('#hp0').textContent = 'Ponto A: ' + (R.h0 ? 'seguro ✔' : 'livre'); el.querySelector('#hp1').textContent = 'Ponto B: ' + (R.h1 ? 'seguro ✔' : 'livre'); };
    shell('Estabilizar o reator', el, 'Fique parado: não saia do ponto.');
  }
  // ---- câmeras de vigilância ----
  function cam(el, c, fin, seed, o) {
    el.innerHTML = '<div class="cams"></div>'; const g = el.firstChild; const cvs = M.CAMS.map((cm) => { const d = document.createElement('div'); d.className = 'cm'; d.innerHTML = `<canvas width="240" height="150"></canvas><b>${cm.n}</b>`; g.appendChild(d); return d.firstChild; });
    c.upd = (v) => { if (!v.cams) return; v.cams.forEach((cm, i) => { const x = cvs[i].getContext('2d'); window.drawCamView(x, cm, 240, 150); }); };
    shell('Câmeras de vigilância', el, 'Toque em ✕ para sair.');
  }
})();
