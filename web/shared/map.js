'use strict';
/* Mapa original "Estação Órbita": salas, corredores, portas, tarefas, dutos e utilidades (colisão, visão, caminhos). Roda no navegador e no servidor. */
(function () {
  const W = 64, H = 38;
  const ROOMS = [ // nome, x, y, w, h, tema
    ['Núcleo', 2, 2, 10, 8, 0], ['Laboratório', 14, 2, 10, 8, 1], ['Ponte', 26, 2, 12, 8, 2], ['Rádio', 40, 2, 9, 8, 3], ['Hangar', 51, 2, 11, 8, 4],
    ['Clínica', 2, 15, 9, 8, 1], ['Oficina', 15, 15, 6, 8, 4], ['Salão Central', 23, 15, 18, 8, 2], ['Estufa', 44, 15, 9, 8, 5], ['Vigilância', 57, 15, 6, 8, 3],
    ['Propulsores', 2, 28, 12, 8, 0], ['Mapas', 16, 28, 10, 8, 3], ['Energia', 28, 28, 10, 8, 4], ['Defesa', 40, 28, 10, 8, 1], ['Cargas', 52, 28, 10, 8, 5]];
  const DOORS = [ // x, y, w, h, sala
    [6, 10, 2, 1, 0], [18, 10, 2, 1, 1], [31, 10, 2, 1, 2], [43, 10, 2, 1, 3], [55, 10, 2, 1, 4], [11, 18, 1, 2, 5], [14, 18, 1, 2, 6], [31, 14, 2, 1, 7], [31, 23, 2, 1, 7],
    [53, 18, 1, 2, 8], [56, 18, 1, 2, 9], [7, 27, 2, 1, 10], [20, 27, 2, 1, 11], [32, 27, 2, 1, 12], [44, 27, 2, 1, 13], [56, 27, 2, 1, 14]];
  const CORR = [[1, 11, 62, 3], [1, 24, 62, 3], [12, 14, 2, 10], [54, 14, 2, 10]];
  const T = (x, y, type) => ({ x: x + 0.5, y: y + 0.5, type });
  const TASKS = [T(4, 4, 'seq'), T(9, 7, 'wires'), T(17, 4, 'code'), T(21, 7, 'align'), T(31, 4, 'align'), T(42, 4, 'wires'), T(46, 7, 'code'), T(53, 4, 'seq'), T(59, 7, 'wires'),
    T(4, 17, 'code'), T(8, 20, 'seq'), T(17, 17, 'wires'), T(18, 21, 'align'), T(26, 17, 'code'), T(38, 21, 'seq'), T(47, 17, 'wires'), T(50, 21, 'align'),
    T(4, 30, 'wires'), T(11, 33, 'seq'), T(18, 30, 'align'), T(23, 33, 'code'), T(30, 30, 'wires'), T(35, 33, 'seq'), T(42, 30, 'code'), T(47, 33, 'align'), T(54, 30, 'seq'), T(59, 33, 'wires'), T(60, 21, 'code')];
  const FIX = { lights: T(33, 30, 'levers'), comms: T(44, 3, 'code'), r0: T(10, 3, 'hold'), r1: T(4, 34, 'hold') };
  const EMERG = { x: 32, y: 19 }, CAMMON = { x: 60.5, y: 17.5 };
  const CAMS = [{ n: 'Corredor Norte', x: 31, y: 12.5 }, { n: 'Corredor Sul', x: 31, y: 25.5 }, { n: 'Salão', x: 32, y: 19 }, { n: 'Corredor Oeste', x: 8, y: 12.5 }];
  const VENTS = [[3, 3, 0], [22, 3, 0], [27, 3, 1], [41, 9, 1], [60, 3, 2], [58, 22, 2], [3, 22, 3], [16, 22, 3], [3, 29, 4], [17, 34, 4], [29, 34, 4], [41, 34, 5], [53, 29, 5]].map(([x, y, g], i) => ({ id: i, x: x + 0.5, y: y + 0.5, g }));
  const solid = new Uint8Array(W * H).fill(1), theme = new Int8Array(W * H).fill(-2), doorAt = new Int8Array(W * H).fill(-1), roomAt0 = new Int8Array(W * H).fill(-1);
  const fill = (x, y, w, h, fn) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) fn(i, j); };
  ROOMS.forEach((r, k) => fill(r[1], r[2], r[3], r[4], (i, j) => { solid[j * W + i] = 0; theme[j * W + i] = r[5]; roomAt0[j * W + i] = k; }));
  CORR.forEach((c) => fill(c[0], c[1], c[2], c[3], (i, j) => { solid[j * W + i] = 0; theme[j * W + i] = -1; }));
  DOORS.forEach((d, k) => fill(d[0], d[1], d[2], d[3], (i, j) => { solid[j * W + i] = 0; theme[j * W + i] = -1; doorAt[j * W + i] = k; }));
  const isSolid = (tx, ty, closed) => { if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true; const k = ty * W + tx; return !!solid[k] || (closed && doorAt[k] >= 0 && closed[doorAt[k]]); };
  const roomName = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); if (tx < 0 || ty < 0 || tx >= W || ty >= H) return 'Corredor'; const r = roomAt0[ty * W + tx]; if (r >= 0) return ROOMS[r][0]; const d = doorAt[ty * W + tx]; return d >= 0 ? ROOMS[DOORS[d][4]][0] : 'Corredor'; };
  // colisão: caixa de raio rad
  const free = (x, y, rad, closed) => !(isSolid(Math.floor(x - rad), Math.floor(y - rad), closed) || isSolid(Math.floor(x + rad), Math.floor(y - rad), closed) || isSolid(Math.floor(x - rad), Math.floor(y + rad), closed) || isSolid(Math.floor(x + rad), Math.floor(y + rad), closed));
  const moveBy = (p, dx, dy, rad, closed) => { if (free(p.x + dx, p.y, rad, closed)) p.x += dx; if (free(p.x, p.y + dy, rad, closed)) p.y += dy; };
  // linha de visão: paredes e portas fechadas bloqueiam
  const los = (x0, y0, x1, y1, closed) => { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 0.2)); for (let i = 1; i < n; i++) { const t = i / n; if (isSolid(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t), closed)) return false; } return true; };
  const clearLine = (x0, y0, x1, y1, closed, rad) => { const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = -dy / d * rad, ny = dx / d * rad; return los(x0, y0, x1, y1, closed) && los(x0 + nx, y0 + ny, x1 + nx, y1 + ny, closed) && los(x0 - nx, y0 - ny, x1 - nx, y1 - ny, closed); };
  // caminho (BFS em tiles + simplificação)
  const path = (sx, sy, gx, gy, closed) => {
    const s = Math.floor(sy) * W + Math.floor(sx), g = Math.floor(gy) * W + Math.floor(gx); if (s === g) return [[gx, gy]];
    const prev = new Int32Array(W * H).fill(-1); prev[s] = s; const q = [s]; let h = 0;
    while (h < q.length) { const c = q[h++]; if (c === g) break; const cx = c % W, cy = (c / W) | 0; for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + ax, ny = cy + ay; if (isSolid(nx, ny, closed)) continue; const k = ny * W + nx; if (prev[k] < 0) { prev[k] = c; q.push(k); } } }
    if (prev[g] < 0) return null;
    const pts = []; for (let c = g; c !== s; c = prev[c]) pts.push([(c % W) + 0.5, ((c / W) | 0) + 0.5]); pts.reverse();
    const out = []; let ax = sx, ay = sy, i = 0;
    while (i < pts.length) { let j = pts.length - 1; while (j > i && !clearLine(ax, ay, pts[j][0], pts[j][1], closed, 0.3)) j--; out.push(pts[j]); ax = pts[j][0]; ay = pts[j][1]; i = j + 1; }
    return out;
  };
  const rng32 = (s) => { s = (s >>> 0) || 1; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; return s >>> 0; };
  const codeFor = (seed) => { let s = rng32(seed), o = ''; for (let i = 0; i < 4; i++) { s = rng32(s); o += s % 10; } return o; };
  const seqFor = (seed) => { let s = rng32(seed ^ 0x9e37), o = []; for (let i = 0; i < 4; i++) { s = rng32(s); o.push(s % 4); } return o; };
  const MIN = { wires: 2.5, seq: 4, code: 3, align: 3, levers: 2, hold: 2, cam: 0.5 };
  const M = { W, H, ROOMS, DOORS, CORR, TASKS, FIX, EMERG, CAMMON, CAMS, VENTS, solid, theme, doorAt, isSolid, roomName, free, moveBy, los, clearLine, path, codeFor, seqFor, MIN };
  if (typeof module !== 'undefined') module.exports = M; else window.MAP = M;
})();
