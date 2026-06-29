/* ============================================================
 * game.js  -  ゲーム本体
 *   - Canvas / リサイズ / ゲームループ / 状態管理 / カメラ
 *   - プレイヤー生成・移動・描画（カメラ追従）
 * ============================================================ */

const Game = {
  // --- 設定 ---
  WORLD: { w: 1600, h: 1600 },
  TEAM_SIZE: 3,
  MATCH_TIME: 60,
  GEM_TARGET: 10,            // 泥棒がこの数を確保し続けてカウントダウン勝利 or 時間切れ時に最多で勝利
  GEM_SPAWN_INTERVAL: 1.6,   // お宝出現間隔(秒)
  GEM_MAX_FIELD: 8,          // フィールド上の同時最大数
  LOCK_TIME: 8,              // 泥棒が目標数を保持し続けると勝利するまでの秒数

  // --- 状態 ---
  state: 'menu',
  mode: 'bot',
  playerTeam: 'robber',

  canvas: null, ctx: null, DPR: 1,
  view: { w: 0, h: 0 },
  camera: { x: 0, y: 0 },

  players: [],
  bullets: [],
  gems: [],                  // フィールド上のお宝
  self: null,

  gemSpawnTimer: 0,
  robberHeld: 0,             // 泥棒チームが現在所持しているお宝合計
  lockCountdown: 0,          // 泥棒勝利カウントダウン残り（0=未発動）
  winner: null,

  lastTime: 0,
  running: false,
  timeLeft: 60,

  /* ---------------- 初期化 ---------------- */
  init(){
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(()=>this.resize(), 200));
    Input.init();
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t)=>this.loop(t));
  },

  resize(){
    this.DPR = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.view.w = w; this.view.h = h;
    this.canvas.width = Math.floor(w * this.DPR);
    this.canvas.height = Math.floor(h * this.DPR);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
  },

  /* ---------------- マッチ開始 ---------------- */
  startMatch(mode, team){
    this.mode = mode;
    this.playerTeam = team;
    this.state = 'playing';
    this.timeLeft = this.MATCH_TIME;
    this.spawnPlayers();
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
  },

  // プレイヤー生成（暫定：両チーム3人ずつ。Botは後ステップでAI付与）
  spawnPlayers(){
    GameMap.build(this.WORLD.w, this.WORLD.h);
    this.players = [];
    this.bullets = [];
    this.gems = [];
    this.gemSpawnTimer = 0.5;
    this.robberHeld = 0;
    this.lockCountdown = 0;
    this.winner = null;
    const W = this.WORLD;
    // 警察は左陣営、泥棒は右陣営に配置
    const copBase   = { x: 150, y: W.h/2 };
    const robberBase= { x: W.w - 150, y: W.h/2 };

    for(let i=0; i<this.TEAM_SIZE; i++){
      const cop = new Player({
        team:'cop', isBot:true,
        x: copBase.x, y: copBase.y - 120 + i*120,
        name:'COP'+(i+1)
      });
      const rob = new Player({
        team:'robber', isBot:true,
        x: robberBase.x, y: robberBase.y - 120 + i*120,
        name:'ROB'+(i+1)
      });
      this.players.push(cop, rob);
    }

    // スポーンが壁にめり込まないよう補正
    for(const p of this.players){
      const r = GameMap.resolveCircle(p.x, p.y, p.radius);
      p.x = r.x; p.y = r.y; p.spawnX = r.x; p.spawnY = r.y;
    }

    // 自分のキャラを選んだチームの1人目に割り当て
    this.self = this.players.find(p => p.team === this.playerTeam);
    this.self.isHuman = true; this.self.isBot = false;
    this.self.name = 'YOU';

    // カメラを自分に
    this.centerCameraOn(this.self.x, this.self.y, true);
  },

  endMatch(){ this.state = 'result'; },

  backToMenu(){
    this.state = 'menu';
    this.players = []; this.self = null;
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
  },

  /* ---------------- メインループ ---------------- */
  loop(now){
    if(!this.running) return;
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if(dt > 0.05) dt = 0.05;
    this.update(dt);
    this.render();
    requestAnimationFrame((t)=>this.loop(t));
  },

  update(dt){
    if(this.state !== 'playing') return;

    // タイマー
    this.timeLeft -= dt;
    if(this.timeLeft <= 0) this.timeLeft = 0;
    const tEl = document.getElementById('timer');
    if(tEl){
      tEl.textContent = Math.ceil(this.timeLeft);
      tEl.classList.toggle('urgent', this.timeLeft <= 10);
    }

    // --- 自プレイヤー移動入力 ---
    if(this.self && this.self.alive){
      const mv = Input.getMove();
      this.self.move(mv.x, mv.y, dt, this.WORLD);

      // エイム中は向きを射撃方向へ
      const aim = Input.getAim();
      if(aim){ this.self.facing = Math.atan2(aim.y, aim.x); }

      // 発射要求消費 → 射撃
      if(Input.consumeFire() && this.self.canFire()){
        const a = Input.lastAim || { x: Math.cos(this.self.facing), y: Math.sin(this.self.facing) };
        this.fire(this.self, a.x, a.y);
      }
    }

    // --- Bot AI 思考・行動 ---
    for(const p of this.players){
      if(p.isBot) AI.update(p, dt, this);
    }

    // --- 全プレイヤー更新 ---
    for(const p of this.players) p.update(dt);

    // --- 弾更新 & 命中判定 ---
    this.updateBullets(dt);

    // --- お宝の出現・回収・更新 ---
    this.updateGems(dt);

    // --- スコア集計 & 勝利条件 ---
    this.evaluateScore(dt);

    // --- カメラ追従 ---
    if(this.self) this.centerCameraOn(this.self.x, this.self.y, false);

    // --- HUD更新 ---
    this.updateScoreHud();
    this.updateSelfHud();
  },

  /* ---------------- お宝 ---------------- */
  updateGems(dt){
    // 出現
    this.gemSpawnTimer -= dt;
    if(this.gemSpawnTimer <= 0 && this.gems.length < this.GEM_MAX_FIELD){
      this.gemSpawnTimer = this.GEM_SPAWN_INTERVAL;
      this.spawnGem();
    }
    // 更新 & 回収（泥棒のみ）
    for(const g of this.gems){
      if(g.collected) continue;
      g.update(dt, this.WORLD);
      for(const p of this.players){
        if(!p.alive || p.team !== 'robber') continue;
        if(Utils.circleCircle(g.x, g.y, g.radius+4, p.x, p.y, p.radius)){
          g.collected = true;
          p.gems++;
          if(p.isHuman) this.feed('お宝を獲得！ ◆'+p.gems);
          break;
        }
      }
    }
    this.gems = this.gems.filter(g => !g.collected);
  },

  spawnGem(){
    // マップ中央付近のランダム位置（壁・茂みを避ける）
    const cx = this.WORLD.w/2, cy = this.WORLD.h/2;
    for(let tries=0; tries<20; tries++){
      const x = cx + Utils.rand(-360, 360);
      const y = cy + Utils.rand(-420, 420);
      if(GameMap.bulletHitsWall(x, y, 14)) continue;
      const g = new Gem(x, y);
      this.gems.push(g);
      return;
    }
  },

  // 逮捕された泥棒のお宝を地面に散らす
  dropGems(player){
    const n = player.gems;
    player.gems = 0;
    for(let i=0; i<n; i++){
      const g = new Gem(player.x, player.y);
      g.scatter();
      this.gems.push(g);
    }
  },

  /* ---------------- スコア & 勝利 ---------------- */
  evaluateScore(dt){
    // 泥棒所持合計
    let held = 0;
    for(const p of this.players){ if(p.team === 'robber') held += p.gems; }
    this.robberHeld = held;

    // 泥棒が目標数を保持し続けると勝利カウントダウン
    if(held >= this.GEM_TARGET){
      if(this.lockCountdown <= 0) this.lockCountdown = this.LOCK_TIME;
      this.lockCountdown -= dt;
      if(this.lockCountdown <= 0){ this.finish('robber', '泥棒がお宝を確保しきった！'); return; }
    } else {
      this.lockCountdown = 0;
    }

    // 時間切れ判定
    if(this.timeLeft <= 0){
      // 泥棒が目標の半分以上集めていれば泥棒勝利、そうでなければ警察勝利
      if(held >= Math.ceil(this.GEM_TARGET/2)) this.finish('robber', '時間切れ：泥棒が逃げ切った！');
      else this.finish('cop', '時間切れ：警察が阻止した！');
    }
  },

  finish(winnerTeam, reason){
    if(this.state !== 'playing') return;
    this.winner = winnerTeam;
    this.state = 'result';
    this.showResult(winnerTeam, reason);
  },

  showResult(winnerTeam, reason){
    const win = winnerTeam === this.playerTeam;
    const title = document.getElementById('resultTitle');
    const sub = document.getElementById('resultSub');
    title.textContent = win ? '勝利！' : '敗北…';
    title.className = win ? 'win' : 'lose';
    const teamName = winnerTeam === 'cop' ? '警察チーム' : '泥棒チーム';
    sub.textContent = `${teamName}の勝利 — ${reason}`;
    document.getElementById('result').classList.remove('hidden');
  },

  /* ---------------- 射撃 ---------------- */
  fire(shooter, dirX, dirY){
    if(!shooter.canFire()) return;
    const len = Math.hypot(dirX, dirY) || 1;
    const nx = dirX/len, ny = dirY/len;
    const muzzle = shooter.radius + 6;
    const bx = shooter.x + nx*muzzle;
    const by = shooter.y + ny*muzzle;
    this.bullets.push(new Bullet(shooter, bx, by, nx, ny));
    shooter.onFired();
    shooter.facing = Math.atan2(ny, nx);
  },

  updateBullets(dt){
    for(const b of this.bullets){
      if(b.dead) continue;
      b.update(dt, this.WORLD);
      // 壁衝突で消滅
      if(GameMap.bulletHitsWall(b.x, b.y, b.radius)){ b.dead = true; continue; }
      // プレイヤーへの命中判定（敵チームのみ）
      for(const p of this.players){
        if(!p.alive) continue;
        if(p.team === b.team) continue;          // 味方は貫通
        if(p === b.owner) continue;
        if(Utils.circleCircle(b.x, b.y, b.radius, p.x, p.y, p.radius)){
          this.onHit(b, p);
          b.dead = true;
          break;
        }
      }
    }
    // 死亡弾除去
    this.bullets = this.bullets.filter(b => !b.dead);
  },

  onHit(bullet, target){
    if(bullet.type === 'real'){
      const wasAlive = target.alive;
      target.takeDamage(bullet.damage);
      if(wasAlive && !target.alive){
        this.feed(`${bullet.owner.name} が ${target.name} を逮捕！`);
        if(target.team === 'robber' && target.gems > 0) this.dropGems(target);
      }
    } else if(bullet.type === 'stun'){
      target.applyStun(bullet.stun);
      this.feed(`${target.name} がスタン！`);
    }
  },

  feed(text){
    const feed = document.getElementById('msgFeed');
    if(!feed) return;
    const div = document.createElement('div');
    div.className = 'feedItem';
    div.textContent = text;
    feed.appendChild(div);
    setTimeout(()=>div.remove(), 2300);
  },

  centerCameraOn(wx, wy, instant){
    const tx = wx - this.view.w/2;
    const ty = wy - this.view.h/2;
    const maxX = Math.max(0, this.WORLD.w - this.view.w);
    const maxY = Math.max(0, this.WORLD.h - this.view.h);
    const cx = Utils.clamp(tx, 0, maxX);
    const cy = Utils.clamp(ty, 0, maxY);
    if(instant){ this.camera.x = cx; this.camera.y = cy; }
    else {
      this.camera.x = Utils.lerp(this.camera.x, cx, 0.15);
      this.camera.y = Utils.lerp(this.camera.y, cy, 0.15);
    }
  },

  updateScoreHud(){
    const robEl = document.getElementById('robberScoreVal');
    const copEl = document.getElementById('copScoreVal');
    if(robEl) robEl.textContent = this.robberHeld;
    // 警察スコア = 目標数 - 泥棒所持（残り阻止数の目安）
    if(copEl) copEl.textContent = Math.max(0, this.GEM_TARGET - this.robberHeld);

    // 泥棒勝利カウントダウン表示
    const tEl = document.getElementById('timer');
    if(tEl && this.lockCountdown > 0){
      tEl.textContent = Math.ceil(this.lockCountdown);
      tEl.classList.add('urgent');
    }
  },

  updateSelfHud(){
    if(!this.self) return;
    const fill = document.getElementById('selfHpFill');
    if(fill) fill.style.width = (this.self.hp / this.self.maxHp * 100) + '%';
    const st = document.getElementById('selfState');
    if(st){
      if(!this.self.alive) st.textContent = '逮捕中… 復活まで ' + Math.ceil(this.self.respawnTimer) + 's';
      else if(this.self.stunned) st.textContent = 'スタン中！';
      else st.textContent = '';
    }
  },

  /* ---------------- 描画 ---------------- */
  render(){
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.view.w, this.view.h);
    if(this.state === 'playing'){
      this.renderWorld(ctx);
    } else {
      ctx.fillStyle = '#0c0f18';
      ctx.fillRect(0, 0, this.view.w, this.view.h);
    }
  },

  renderWorld(ctx){
    const cam = this.camera, view = this.view;

    // 地面
    GameMap.drawGround(ctx, cam, view);

    // ワールド境界
    const o = this.worldToScreen(0, 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 6;
    ctx.strokeRect(o.x, o.y, this.WORLD.w, this.WORLD.h);

    // 陣地マーカー
    this.drawBase(ctx, 150, this.WORLD.h/2, '#ff4757');             // 警察
    this.drawBase(ctx, this.WORLD.w-150, this.WORLD.h/2, '#3498db'); // 泥棒

    // 壁（プレイヤーより下層に描画）
    GameMap.drawWalls(ctx, cam);

    // お宝
    for(const g of this.gems){
      const s = this.worldToScreen(g.x, g.y);
      if(s.x < -30 || s.x > view.w+30 || s.y < -30 || s.y > view.h+30) continue;
      g.draw(ctx, s.x, s.y);
    }

    // エイム射線
    this.drawAimLine(ctx);

    // プレイヤー描画（可視性判定込み）
    for(const p of this.players){
      const s = this.worldToScreen(p.x, p.y);
      if(s.x < -60 || s.x > view.w+60 || s.y < -60 || s.y > view.h+60) continue;
      const vis = this.visibilityOf(p);
      if(vis <= 0) continue;                 // 完全不可視
      p.draw(ctx, s.x, s.y, { alpha: (p.alive ? 1 : 0.25) * vis });
    }

    // 弾描画
    for(const b of this.bullets){
      const s = this.worldToScreen(b.x, b.y);
      if(s.x < -20 || s.x > view.w+20 || s.y < -20 || s.y > view.h+20) continue;
      b.draw(ctx, s.x, s.y);
    }

    // 茂み（最前面：中のキャラを隠す）
    GameMap.drawBushes(ctx, cam);
  },

  // プレイヤーpの可視度を返す（0=不可視, 0.4=茂み内自軍含む半透明, 1=完全表示）
  visibilityOf(p){
    // 自分・観戦対象は常に表示
    if(p === this.self) return 1;
    const inBush = GameMap.inBush(p.x, p.y);
    if(!inBush) return 1;                        // 茂みの外は見える

    // 茂みの中：味方なら半透明で見える
    if(this.self && p.team === this.self.team) return 0.5;

    // 敵が茂み内：自分も同じ茂み付近(近距離)なら薄っすら見える
    if(this.self){
      const d = Utils.dist(p.x, p.y, this.self.x, this.self.y);
      if(d < 90) return 0.35;
    }
    return 0;                                    // 完全に隠れる
  },

  drawAimLine(ctx){
    if(!this.self || !this.self.alive) return;
    const aim = Input.getAim();
    if(!aim) return;
    const s = this.worldToScreen(this.self.x, this.self.y);
    const range = BULLET[this.self.bulletType].range;
    const ex = s.x + aim.x * range;
    const ey = s.y + aim.y * range;
    const col = this.self.bulletType === 'real' ? 'rgba(255,94,87,0.5)' : 'rgba(155,89,255,0.5)';

    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    // 着弾予測マーカー
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(ex, ey, 8, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  },

  drawBase(ctx, wx, wy, color){
    const s = this.worldToScreen(wx, wy);
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(s.x, s.y, 70, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(s.x, s.y, 70, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
  },

  worldToScreen(wx, wy){
    return { x: wx - this.camera.x, y: wy - this.camera.y };
  }
};
