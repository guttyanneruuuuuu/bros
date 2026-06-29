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

  // --- 状態 ---
  state: 'menu',
  mode: 'bot',
  playerTeam: 'robber',

  canvas: null, ctx: null, DPR: 1,
  view: { w: 0, h: 0 },
  camera: { x: 0, y: 0 },

  players: [],
  self: null,

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
    this.players = [];
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
    }

    // --- 全プレイヤー更新 ---
    for(const p of this.players) p.update(dt);

    // --- カメラ追従 ---
    if(this.self) this.centerCameraOn(this.self.x, this.self.y, false);

    // --- 自分HUD更新 ---
    this.updateSelfHud();
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
    // 地面
    ctx.fillStyle = '#2d4a36';
    ctx.fillRect(0, 0, this.view.w, this.view.h);

    // グリッド
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const grid = 64;
    const ox = -(this.camera.x % grid);
    const oy = -(this.camera.y % grid);
    for(let x = ox; x < this.view.w; x += grid){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,this.view.h); ctx.stroke(); }
    for(let y = oy; y < this.view.h; y += grid){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(this.view.w,y); ctx.stroke(); }

    // ワールド境界
    const o = this.worldToScreen(0, 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 6;
    ctx.strokeRect(o.x, o.y, this.WORLD.w, this.WORLD.h);

    // 陣地マーカー
    this.drawBase(ctx, 150, this.WORLD.h/2, '#ff4757');         // 警察
    this.drawBase(ctx, this.WORLD.w-150, this.WORLD.h/2, '#3498db'); // 泥棒

    // プレイヤー描画
    for(const p of this.players){
      if(!p.alive && p.isHuman === false) {
        // 死亡中のBotは薄く拠点付近に表示しない（簡略化）。後で復活表示。
      }
      const s = this.worldToScreen(p.x, p.y);
      // 画面外カリング
      if(s.x < -50 || s.x > this.view.w+50 || s.y < -50 || s.y > this.view.h+50) continue;
      const alpha = p.alive ? 1 : 0.25;
      p.draw(ctx, s.x, s.y, { alpha });
    }
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
