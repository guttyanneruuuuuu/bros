/* ============================================================
 * game.js  -  ゲーム本体（基盤バージョン）
 *   - Canvas / リサイズ
 *   - ゲームループ
 *   - 状態管理（menu / playing / result）
 *   - カメラ
 * 後続のステップでプレイヤー・射撃・マップ等を追加していく
 * ============================================================ */

const Game = {
  // --- 設定 ---
  WORLD: { w: 1600, h: 1600 },          // ワールドサイズ（後でマップに合わせ調整）
  TEAM_SIZE: 3,
  MATCH_TIME: 60,                        // 秒

  // --- 状態 ---
  state: 'menu',                         // 'menu' | 'playing' | 'result'
  mode: 'bot',                           // 'bot' | 'friend'
  playerTeam: 'robber',                  // 'cop' | 'robber'

  canvas: null,
  ctx: null,
  DPR: 1,
  view: { w: 0, h: 0 },                  // CSSピクセルでの表示サイズ
  camera: { x: 0, y: 0 },

  lastTime: 0,
  running: false,

  /* ---------------- 初期化 ---------------- */
  init(){
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(()=>this.resize(), 200));
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

  /* ---------------- マッチ開始（後で拡張） ---------------- */
  startMatch(mode, team){
    this.mode = mode;
    this.playerTeam = team;
    this.state = 'playing';
    this.timeLeft = this.MATCH_TIME;
    // 後のステップで世界・プレイヤー生成を行う
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
  },

  endMatch(){
    this.state = 'result';
  },

  backToMenu(){
    this.state = 'menu';
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
  },

  /* ---------------- メインループ ---------------- */
  loop(now){
    if(!this.running) return;
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if(dt > 0.05) dt = 0.05;               // フレーム飛び対策
    this.update(dt);
    this.render();
    requestAnimationFrame((t)=>this.loop(t));
  },

  update(dt){
    if(this.state !== 'playing') return;
    // タイマー（仮）
    this.timeLeft -= dt;
    if(this.timeLeft <= 0){ this.timeLeft = 0; }
    // HUDタイマー更新
    const tEl = document.getElementById('timer');
    if(tEl){
      tEl.textContent = Math.ceil(this.timeLeft);
      tEl.classList.toggle('urgent', this.timeLeft <= 10);
    }
  },

  render(){
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.view.w, this.view.h);

    if(this.state === 'playing'){
      this.renderWorld(ctx);
    } else {
      // メニュー背景はHTML/CSS側
      ctx.fillStyle = '#0c0f18';
      ctx.fillRect(0, 0, this.view.w, this.view.h);
    }
  },

  /* ワールド描画（基盤：背景グリッドのみ。後でマップ・エンティティ追加） */
  renderWorld(ctx){
    ctx.fillStyle = '#2d4a36';
    ctx.fillRect(0, 0, this.view.w, this.view.h);

    // 仮グリッド
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const grid = 64;
    const ox = -(this.camera.x % grid);
    const oy = -(this.camera.y % grid);
    for(let x = ox; x < this.view.w; x += grid){
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.view.h); ctx.stroke();
    }
    for(let y = oy; y < this.view.h; y += grid){
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.view.w, y); ctx.stroke();
    }

    // 中央テキスト（基盤確認用）
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '600 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('基盤構築 OK — プレイヤー実装は次ステップ', this.view.w/2, this.view.h/2);
  },

  // ワールド座標 → スクリーン座標
  worldToScreen(wx, wy){
    return { x: wx - this.camera.x, y: wy - this.camera.y };
  }
};
