/* ============================================================
 * entities.js  -  ゲーム内エンティティ
 *   - Player : 警察/泥棒キャラ（人間/Bot共通）
 * ステータス（仮）:
 *   泥棒  : 速い / HP低 / スタンガン
 *   警察  : 普通 / HP高 / 実弾
 * ============================================================ */

const TEAM = {
  cop: {
    color: '#ff4757', dark:'#c0392b',
    speed: 150,            // px/sec
    maxHp: 140,
    radius: 18,
    bulletType: 'real',    // 実弾
    fireCooldown: 0.55,
  },
  robber: {
    color: '#3498db', dark:'#2471a3',
    speed: 195,            // 速い
    maxHp: 90,             // 低い
    radius: 17,
    bulletType: 'stun',    // スタンガン
    fireCooldown: 0.7,
  }
};

class Player {
  constructor(opts){
    this.team = opts.team;                  // 'cop' | 'robber'
    this.isBot = !!opts.isBot;
    this.isHuman = !!opts.isHuman;          // 操作対象
    this.name = opts.name || (this.team === 'cop' ? 'COP' : 'ROB');

    const st = TEAM[this.team];
    this.color = st.color; this.dark = st.dark;
    this.speed = st.speed; this.maxHp = st.maxHp;
    this.radius = st.radius;
    this.bulletType = st.bulletType;
    this.fireCooldown = st.fireCooldown;

    this.x = opts.x; this.y = opts.y;
    this.spawnX = opts.x; this.spawnY = opts.y;
    this.hp = this.maxHp;
    this.facing = 0;                        // 向き(rad)
    this.alive = true;

    this.cdTimer = 0;                       // 射撃クールダウン
    this.stunTimer = 0;                     // スタン残り(秒) ※警察が泥棒のスタン弾を食らう等
    this.respawnTimer = 0;                  // 復活待ち(秒)

    this.gems = 0;                          // 所持お宝（泥棒用、後ステップで使用）
  }

  get stunned(){ return this.stunTimer > 0; }

  // 移動（vx,vy は -1..1 正規化済み×強さ）
  move(vx, vy, dt, world){
    if(!this.alive || this.stunned) return;
    if(vx === 0 && vy === 0) return;
    const nx = this.x + vx * this.speed * dt;
    const ny = this.y + vy * this.speed * dt;
    // 壁衝突は後ステップでマップ実装時に拡張。今はワールド境界のみ
    this.x = Utils.clamp(nx, this.radius, world.w - this.radius);
    this.y = Utils.clamp(ny, this.radius, world.h - this.radius);
    if(vx !== 0 || vy !== 0) this.facing = Math.atan2(vy, vx);
  }

  update(dt){
    if(this.cdTimer > 0) this.cdTimer -= dt;
    if(this.stunTimer > 0) this.stunTimer -= dt;
    if(!this.alive){
      this.respawnTimer -= dt;
      if(this.respawnTimer <= 0) this.respawn();
    }
  }

  canFire(){ return this.alive && !this.stunned && this.cdTimer <= 0; }

  onFired(){ this.cdTimer = this.fireCooldown; }

  takeDamage(dmg){
    if(!this.alive) return;
    this.hp -= dmg;
    if(this.hp <= 0){ this.hp = 0; this.die(); }
  }

  applyStun(sec){
    if(!this.alive) return;
    this.stunTimer = Math.max(this.stunTimer, sec);
  }

  die(){
    this.alive = false;
    this.respawnTimer = 3.0;               // 数秒後に復活
    this.stunTimer = 0;
  }

  respawn(){
    this.alive = true;
    this.hp = this.maxHp;
    this.x = this.spawnX; this.y = this.spawnY;
    this.stunTimer = 0;
  }

  // 描画（スクリーン座標 sx,sy）
  draw(ctx, sx, sy, opts={}){
    const r = this.radius;
    ctx.save();
    if(opts.alpha != null) ctx.globalAlpha = opts.alpha;

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(sx, sy + r*0.8, r*0.9, r*0.45, 0, 0, Math.PI*2); ctx.fill();

    // 本体
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.dark; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    // 向きインジケータ（銃口）
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(this.facing)*r*1.15, sy + Math.sin(this.facing)*r*1.15);
    ctx.stroke();

    // スタン表現
    if(this.stunned){
      ctx.fillStyle = '#ffd32a';
      ctx.font = 'bold 16px sans-serif'; ctx.textAlign='center';
      ctx.fillText('💫', sx, sy - r - 6);
    }

    ctx.restore();

    // HPバー（生存時のみ）
    if(this.alive && opts.showHp !== false){
      const bw = r*2.2, bh = 5;
      const bx = sx - bw/2, by = sy - r - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx-1, by-1, bw+2, bh+2);
      const hpRatio = this.hp / this.maxHp;
      ctx.fillStyle = hpRatio > 0.5 ? '#2ecc71' : (hpRatio > 0.25 ? '#f1c40f' : '#e74c3c');
      ctx.fillRect(bx, by, bw*hpRatio, bh);
    }
  }
}
