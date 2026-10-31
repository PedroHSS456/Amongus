'use strict';
/* Chat de voz por proximidade. Captura: PCM 16 kHz (com porta de ruído/VAD) -> servidor. Recepção: o servidor já aplicou distância e parede;
   aqui aplicamos ganho, abafamento (filtro passa-baixa), reverberação por tipo de sala, volume/mudo por jogador. */
(function () {
  const AU = window.AU, RATE = 16000, peers = {}; let proc = null, hang = 0, bus = null, ir = null, ctxA = null;
  const speaking = new Map(); // id -> instante da última fala ouvida
  const P = (id) => peers[id] || (peers[id] = { vol: 1, mute: false, next: 0 });
  function setup(a) {
    if (bus && ctxA === a) return; ctxA = a; bus = a.createGain(); bus.connect(a.destination); const len = Math.floor(a.sampleRate * 1.1), b = a.createBuffer(2, len, a.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); } ir = a.createConvolver(); ir.buffer = b; const wg = a.createGain(); wg.gain.value = 1; ir.connect(wg); wg.connect(bus); setVol();
  }
  function setVol() { if (bus) bus.gain.value = Math.pow(AU.cfg.vol / 100, 1.5) * 1.6; }
  // ---- captura ----
  function start(src, a) {
    setup(a); if (proc) return; proc = a.createScriptProcessor(2048, 1, 1); const z = a.createGain(); z.gain.value = 0; src.connect(proc); proc.connect(z); z.connect(a.destination); const ratio = a.sampleRate / RATE;
    proc.onaudioprocess = (e) => {
      if (!AU.online || !AU.mic.talk) { hang = 0; return; } const inp = e.inputBuffer.getChannelData(0); let s = 0; for (let i = 0; i < inp.length; i++) s += inp[i] * inp[i]; const rms = Math.sqrt(s / inp.length);
      if (rms > 0.012) hang = 8; else if (hang > 0) hang--; else return;
      const n = Math.floor(inp.length / ratio), out = new Uint8Array(1 + n * 2), dv = new DataView(out.buffer); out[0] = 1;
      for (let i = 0; i < n; i++) { const p = i * ratio, i0 = Math.floor(p), f = p - i0, v = inp[i0] * (1 - f) + (inp[Math.min(i0 + 1, inp.length - 1)] * f); dv.setInt16(1 + i * 2, Math.max(-1, Math.min(1, v * 1.4)) * 32767, true); }
      AU.sendBin(out);
    };
  }
  // ---- recepção ----
  function incoming(ab) {
    const a = ctxA || AU.ac(); if (!a) return; setup(a); const dv = new DataView(ab); if (ab.byteLength < 45 || dv.getUint8(0) !== 2) return;
    const id = dv.getUint16(1, true), gain = dv.getUint8(3) / 255, fl = dv.getUint8(4), muff = fl & 1, rv = (fl >> 1) & 3, pr = P(id); speaking.set(id, performance.now()); if (pr.mute || pr.vol <= 0) return;
    const n = (ab.byteLength - 5) >> 1, buf = a.createBuffer(1, n, RATE), ch = buf.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = dv.getInt16(5 + i * 2, true) / 32768;
    const src = a.createBufferSource(); src.buffer = buf; const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = muff ? 650 : 7000; const g = a.createGain(); g.gain.value = Math.min(1.5, gain * pr.vol); src.connect(lp); lp.connect(g); g.connect(bus);
    if (rv) { const w = a.createGain(); w.gain.value = [0, 0.18, 0.32, 0.5][rv]; g.connect(w); w.connect(ir); }
    const now = a.currentTime; if (pr.next < now + 0.02 || pr.next > now + 0.6) pr.next = now + 0.09; src.start(pr.next); pr.next += buf.duration;
  }
  const isSpeaking = (id) => performance.now() - (speaking.get(id) || -1e9) < 350;
  const cycle = (id) => { const p = P(id); if (p.mute) { p.mute = false; p.vol = 1; } else if (p.vol > 0.6) p.vol = 0.5; else { p.mute = true; } return p.mute ? 'mudo' : Math.round(p.vol * 100) + '%'; };
  window.Voice = { peers, isSpeaking, cycle, speaking };
  AU.voiceStart = start; AU.voiceIn = incoming; AU.voiceVol = setVol;
})();
