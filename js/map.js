/* ============================================================
 * map.js  -  マップ生成・障害物・茂み・描画・衝突
 *   - walls : 灰色ブロック（弾・キャラ通過不可）矩形
 *   - bushes: 緑エリア（中にいると敵から見えない）矩形
 *   - Brawl Stars風に左右対称マップを生成
 * ============================================================ */

const GameMap = {
  W: 1600, H: 1600,
  walls: [],
  bushes: [],

  // 左右対称になるよう、左半分を定義してミラー生成
  build(w, h){
    this.W = w; this.H = h;
    this.walls = [];
    this.bushes = [];

    const cx = w/2, cy = h/2;

    // --- 外周の角ブロック（プレイ領域を引き締める） ---
    this.addWall(0, 0, 120, 40, true);
    this.addWall(0, h-40, 120, 40, true);

    // --- 中央構造物（シンメトリの軸上） ---
    this.walls.push({ x: cx-30, y: cy-160, w: 60, h: 90 });
    this.walls.push({ x: cx-30, y: cy+70,  w: 60, h: 90 });

    // --- 左半分の壁（ミラーで右にも作る） ---
    this.addWall(360, 300, 80, 80, true);
    this.addWall(520, 560, 60, 220, true);
    this.addWall(300, 760, 200, 60, true);
    this.addWall(360, h-380, 80, 80, true);
    this.addWall(620, 220, 60, 60, true);
    this.addWall(620, h-280, 60, 60, true);

    // --- 茂み（左半分→ミラー） ---
    this.addBush(220, 420, 180, 180, true);
    this.addBush(540, 360, 140, 140, true);
    this.addBush(480, 820, 160, 200, true);
    this.addBush(700, 600, 120, 120, true);   // 中央付近寄り

    // --- 中央の大きな茂み（軸上、ミラー不要） ---
    this.bushes.push({ x: cx-110, y: cy-280, w: 220, h: 150 });
    this.bushes.push({ x: cx-110, y: cy+130, w: 220, h: 150 });
  },

  // mirror=true で右側にも対称コピーを追加
  addWall(x, y, w, h, mirror){
    this.walls.push({ x, y, w, h });
    if(mirror){
      const mx = this.W - x - w;
      this.walls.push({ x: mx, y, w, h });
    }
  },
  addBush(x, y, w, h, mirror){
    this.bushes.push({ x, y, w, h });
    if(mirror){
      const mx = this.W - x - w;
      this.bushes.push({ x: mx, y, w, h });
    }
  },

  // 円(cx,cy,r)が壁にめり込まないよう押し戻した座標を返す
  resolveCircle(cx, cy, r){
    let x = cx, y = cy;
    for(const wll of this.walls){
      if(!Utils.circleRect(x, y, r, wll)) continue;
      // 最近接点
      const nx = Utils.clamp(x, wll.x, wll.x+wll.w);
      const ny = Utils.clamp(y, wll.y, wll.y+wll.h);
      let dx = x - nx, dy = y - ny;
      let d = Math.hypot(dx, dy);
      if(d === 0){
        // 中心が矩形内部：最も近い辺へ押し出す
        const left = x - wll.x, right = wll.x+wll.w - x;
        const top = y - wll.y, bottom = wll.y+wll.h - y;
        const m = Math.min(left, right, top, bottom);
        if(m === left)      x = wll.x - r;
        else if(m === right) x = wll.x+wll.w + r;
        else if(m === top)   y = wll.y - r;
        else                 y = wll.y+wll.h + r;
      } else {
        const push = r - d;
        x += (dx/d) * push;
        y += (dy/d) * push;
      }
    }
    return { x, y };
  },

  // 弾が壁に当たっているか
  bulletHitsWall(bx, by, br){
    for(const wll of this.walls){
      if(Utils.circleRect(bx, by, br, wll)) return true;
    }
    return false;
  },

  // 点が茂みの中にあるか
  inBush(px, py){
    for(const b of this.bushes){
      if(Utils.pointInRect(px, py, b)) return true;
    }
    return false;
  },

  // 2点間に壁があるか（視線判定：簡易サンプリング）
  lineBlocked(x1, y1, x2, y2){
    const steps = Math.ceil(Utils.dist(x1,y1,x2,y2) / 16);
    for(let i=1; i<steps; i++){
      const t = i/steps;
      const px = Utils.lerp(x1, x2, t);
      const py = Utils.lerp(y1, y2, t);
      for(const wll of this.walls){
        if(Utils.pointInRect(px, py, wll)) return true;
      }
    }
    return false;
  },

  /* ---------------- 描画 ---------------- */
  drawGround(ctx, cam, view){
    ctx.fillStyle = '#2d4a36';
    ctx.fillRect(0, 0, view.w, view.h);
    // タイル模様
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    const grid = 80;
    const ox = -(cam.x % (grid*2)), oy = -(cam.y % (grid*2));
    for(let y = oy; y < view.h; y += grid){
      for(let x = ox; x < view.w; x += grid){
        if(((Math.floor((x-ox)/grid)+Math.floor((y-oy)/grid))%2)===0)
          ctx.fillRect(x, y, grid, grid);
      }
    }
  },

  drawWalls(ctx, cam){
    for(const w of this.walls){
      const sx = w.x - cam.x, sy = w.y - cam.y;
      // 影
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(sx+4, sy+6, w.w, w.h);
      // 本体
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(sx, sy, w.w, w.h);
      // ハイライト
      ctx.fillStyle = '#8b95a3';
      ctx.fillRect(sx, sy, w.w, 6);
      ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, w.w, w.h);
    }
  },

  // 茂みは「下層（地面の上）」に描く部分。中のキャラは別途半透明化
  drawBushes(ctx, cam){
    for(const b of this.bushes){
      const sx = b.x - cam.x, sy = b.y - cam.y;
      ctx.save();
      ctx.fillStyle = 'rgba(34,90,52,0.92)';
      this.roundRect(ctx, sx, sy, b.w, b.h, 18);
      ctx.fill();
      // 葉のテクスチャ（円の集合）
      ctx.fillStyle = 'rgba(46,120,68,0.9)';
      const step = 34;
      for(let yy = sy+10; yy < sy+b.h-6; yy += step){
        for(let xx = sx+10; xx < sx+b.w-6; xx += step){
          ctx.beginPath();
          ctx.arc(xx + (Math.floor(yy)%2?step/2:0), yy, 13, 0, Math.PI*2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  },

  roundRect(ctx, x, y, w, h, r){
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }
};
