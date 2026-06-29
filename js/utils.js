/* ============================================================
 * utils.js  -  共通ユーティリティ
 * ============================================================ */
const Utils = {
  clamp(v, min, max){ return v < min ? min : (v > max ? max : v); },
  rand(min, max){ return min + Math.random() * (max - min); },
  randInt(min, max){ return Math.floor(Utils.rand(min, max + 1)); },
  dist(ax, ay, bx, by){ const dx = ax-bx, dy = ay-by; return Math.hypot(dx, dy); },
  dist2(ax, ay, bx, by){ const dx = ax-bx, dy = ay-by; return dx*dx + dy*dy; },
  angle(ax, ay, bx, by){ return Math.atan2(by-ay, bx-ax); },
  lerp(a, b, t){ return a + (b-a)*t; },
  // 円と矩形の衝突判定（矩形は {x,y,w,h}）
  circleRect(cx, cy, r, rect){
    const nx = Utils.clamp(cx, rect.x, rect.x+rect.w);
    const ny = Utils.clamp(cy, rect.y, rect.y+rect.h);
    return Utils.dist2(cx, cy, nx, ny) <= r*r;
  },
  // 点が矩形内にあるか
  pointInRect(px, py, rect){
    return px >= rect.x && px <= rect.x+rect.w && py >= rect.y && py <= rect.y+rect.h;
  },
  // 円同士の衝突
  circleCircle(ax, ay, ar, bx, by, br){
    const rr = ar+br;
    return Utils.dist2(ax, ay, bx, by) <= rr*rr;
  }
};
