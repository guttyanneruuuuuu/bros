/* ============================================================
 * input.js  -  バーチャルジョイスティック入力管理
 *   - 左半分: 移動スティック (move)
 *   - 右半分: 射撃スティック (fire) … 離すと発射
 *   - タッチ & マウス 両対応 (マルチタッチ対応)
 * Brawl Stars 同様、各スティックは「触れた位置」を中心に出現し追従する
 * ============================================================ */

const Input = {
  MAX_RADIUS: 60,           // ノブが動ける最大半径(px)
  DEAD_ZONE: 0.12,          // これ未満は無入力扱い

  move: { active:false, id:null, ox:0, oy:0, dx:0, dy:0, mag:0 },
  fire: { active:false, id:null, ox:0, oy:0, dx:0, dy:0, mag:0, justReleased:false },
  lastAim: null,            // 最後に離した射撃方向

  // UI要素
  els: {},

  init(){
    this.els.moveStick = document.getElementById('moveStick');
    this.els.fireStick = document.getElementById('fireStick');
    this.els.moveBase  = this.els.moveStick.querySelector('.stickBase');
    this.els.moveKnob  = this.els.moveStick.querySelector('.stickKnob');
    this.els.fireBase  = this.els.fireStick.querySelector('.stickBase');
    this.els.fireKnob  = this.els.fireStick.querySelector('.stickKnob');

    const wrap = document.getElementById('gameWrap');

    // --- タッチ ---
    wrap.addEventListener('touchstart', (e)=>this.onStart(e), { passive:false });
    wrap.addEventListener('touchmove',  (e)=>this.onMove(e),  { passive:false });
    wrap.addEventListener('touchend',   (e)=>this.onEnd(e),   { passive:false });
    wrap.addEventListener('touchcancel',(e)=>this.onEnd(e),   { passive:false });

    // --- マウス(PCデバッグ用) ---
    this._mouseDown = false;
    wrap.addEventListener('mousedown', (e)=>this.onMouseStart(e));
    window.addEventListener('mousemove', (e)=>this.onMouseMove(e));
    window.addEventListener('mouseup',   (e)=>this.onMouseEnd(e));
  },

  // どちらのスティック領域か（画面左半分=move / 右半分=fire）
  zoneOf(x){ return x < window.innerWidth/2 ? 'move' : 'fire'; },

  /* ---------- タッチ ---------- */
  onStart(e){
    if(Game.state !== 'playing') return;
    e.preventDefault();
    for(const t of e.changedTouches){
      const zone = this.zoneOf(t.clientX);
      const stick = this[zone];
      if(stick.active) continue;          // 既にそのスティック使用中
      this.begin(zone, t.identifier, t.clientX, t.clientY);
    }
  },
  onMove(e){
    if(Game.state !== 'playing') return;
    e.preventDefault();
    for(const t of e.changedTouches){
      if(this.move.id === t.identifier) this.drag('move', t.clientX, t.clientY);
      if(this.fire.id === t.identifier) this.drag('fire', t.clientX, t.clientY);
    }
  },
  onEnd(e){
    e.preventDefault();
    for(const t of e.changedTouches){
      if(this.move.id === t.identifier) this.release('move');
      if(this.fire.id === t.identifier) this.release('fire');
    }
  },

  /* ---------- マウス ---------- */
  onMouseStart(e){
    if(Game.state !== 'playing') return;
    const zone = this.zoneOf(e.clientX);
    if(this[zone].active) return;
    this._mouseZone = zone;
    this.begin(zone, 'mouse', e.clientX, e.clientY);
  },
  onMouseMove(e){
    if(!this._mouseZone) return;
    this.drag(this._mouseZone, e.clientX, e.clientY);
  },
  onMouseEnd(){
    if(!this._mouseZone) return;
    this.release(this._mouseZone);
    this._mouseZone = null;
  },

  /* ---------- 共通ロジック ---------- */
  begin(zone, id, x, y){
    const s = this[zone];
    s.active = true; s.id = id; s.ox = x; s.oy = y; s.dx = 0; s.dy = 0; s.mag = 0;
    // スティックUIを触れた位置に移動して表示
    const el = zone === 'move' ? this.els.moveStick : this.els.fireStick;
    el.style.left = (x - 70) + 'px';
    el.style.top  = (y - 70) + 'px';
    el.style.bottom = 'auto'; el.style.right = 'auto';
    this.updateKnob(zone, 0, 0);
  },

  drag(zone, x, y){
    const s = this[zone];
    if(!s.active) return;
    let dx = x - s.ox, dy = y - s.oy;
    const len = Math.hypot(dx, dy) || 0.0001;
    const clamped = Math.min(len, this.MAX_RADIUS);
    const nx = dx/len, ny = dy/len;
    s.mag = clamped / this.MAX_RADIUS;          // 0..1
    s.dx = nx * s.mag;                           // 正規化方向×強さ
    s.dy = ny * s.mag;
    this.updateKnob(zone, nx*clamped, ny*clamped);
  },

  release(zone){
    const s = this[zone];
    if(zone === 'fire' && s.active && s.mag > this.DEAD_ZONE){
      s.justReleased = true;                     // 発射フラグ（game側で消費）
      const len = Math.hypot(s.dx, s.dy) || 1;
      this.lastAim = { x: s.dx/len, y: s.dy/len };  // 発射方向を保存
    }
    s.active = false; s.id = null; s.mag = 0; s.dx = 0; s.dy = 0;
    // UIを元の位置へ戻す
    const el = zone === 'move' ? this.els.moveStick : this.els.fireStick;
    el.style.left = ''; el.style.top = '';
    el.style.bottom = ''; el.style.right = '';
    this.updateKnob(zone, 0, 0);
  },

  updateKnob(zone, kx, ky){
    const knob = zone === 'move' ? this.els.moveKnob : this.els.fireKnob;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  },

  // 移動ベクトル取得（デッドゾーン適用）
  getMove(){
    if(!this.move.active || this.move.mag < this.DEAD_ZONE) return { x:0, y:0, mag:0 };
    return { x:this.move.dx, y:this.move.dy, mag:this.move.mag };
  },

  // 射撃方向取得（エイム中）
  getAim(){
    if(!this.fire.active || this.fire.mag < this.DEAD_ZONE) return null;
    const len = Math.hypot(this.fire.dx, this.fire.dy) || 1;
    return { x:this.fire.dx/len, y:this.fire.dy/len, mag:this.fire.mag };
  },

  // 発射要求を消費（1回だけtrue）
  consumeFire(){
    if(this.fire.justReleased){
      this.fire.justReleased = false;
      return true;
    }
    return false;
  }
};
