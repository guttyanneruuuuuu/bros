/* ============================================================
 * ai.js  -  Bot AI
 *   警察Bot: 泥棒（特にお宝持ち）を追って実弾射撃
 *   泥棒Bot: お宝回収＋警察から逃走＋牽制スタン
 * 簡易ステートマシン + 壁回避 + 視線(lineBlocked)判定
 * ============================================================ */

const AI = {
  // 1体のBotを思考・行動させる
  update(bot, dt, game){
    if(!bot.alive || bot.isHuman) return;
    if(bot.stunned) return;

    // 思考タイマー（ターゲット再選択を間引く）
    bot._think = (bot._think || 0) - dt;
    if(bot._think <= 0){
      bot._think = 0.25;
      this.decide(bot, game);
    }

    // 移動実行
    if(bot._mvx !== undefined){
      this.steer(bot, dt, game);
    }

    // 射撃判定
    this.tryShoot(bot, dt, game);
  },

  decide(bot, game){
    if(bot.team === 'cop') this.decideCop(bot, game);
    else this.decideRobber(bot, game);
  },

  /* ---------------- 警察Bot ---------------- */
  decideCop(bot, game){
    const target = this.nearestEnemy(bot, game, true);  // お宝持ち優先
    bot._target = target;
    if(target){
      const d = Utils.dist(bot.x, bot.y, target.x, target.y);
      const sight = !GameMap.lineBlocked(bot.x, bot.y, target.x, target.y);
      const range = BULLET[bot.bulletType].range;
      if(sight && d < range*0.85){
        // 射程内＆視線通る：少し距離を保ちつつ撃つ
        if(d < range*0.4) this.setMove(bot, bot.x-target.x, bot.y-target.y); // 離れる
        else this.setMove(bot, 0, 0);
        bot._aim = { x: target.x-bot.x, y: target.y-bot.y };
      } else {
        // 追跡
        this.setMove(bot, target.x-bot.x, target.y-bot.y);
        bot._aim = null;
      }
    } else {
      this.wander(bot, game);
      bot._aim = null;
    }
  },

  /* ---------------- 泥棒Bot ---------------- */
  decideRobber(bot, game){
    const threat = this.nearestEnemy(bot, game, false);
    const threatDist = threat ? Utils.dist(bot.x, bot.y, threat.x, threat.y) : 9999;

    // 近くに警察がいる → 逃げる＋牽制スタン
    if(threat && threatDist < 280){
      // 自陣方向（右側）へ逃げる
      const fleeX = (game.WORLD.w - 150) - bot.x;
      const fleeY = (game.WORLD.h/2) - bot.y;
      // 脅威から離れる方向と自陣方向を合成
      this.setMove(bot, (bot.x-threat.x)*0.7 + fleeX*0.3, (bot.y-threat.y)*0.7 + fleeY*0.3);
      // 視線が通れば牽制
      if(!GameMap.lineBlocked(bot.x, bot.y, threat.x, threat.y) && threatDist < BULLET[bot.bulletType].range)
        bot._aim = { x: threat.x-bot.x, y: threat.y-bot.y };
      else bot._aim = null;
      bot._target = threat;
      return;
    }

    // お宝を集めに行く
    const gem = this.nearestGem(bot, game);
    if(gem){
      this.setMove(bot, gem.x-bot.x, gem.y-bot.y);
    } else {
      // お宝がなければ中央付近をうろつく
      this.setMove(bot, (game.WORLD.w/2)-bot.x, (game.WORLD.h/2)-bot.y);
    }
    bot._aim = null;
    bot._target = null;
  },

  /* ---------------- 共通ヘルパ ---------------- */
  setMove(bot, dx, dy){
    const len = Math.hypot(dx, dy) || 1;
    bot._mvx = dx/len; bot._mvy = dy/len;
  },

  wander(bot, game){
    if(!bot._wanderT || bot._wanderT <= 0){
      bot._wanderT = Utils.rand(1, 2.4);
      const a = Utils.rand(0, Math.PI*2);
      bot._mvx = Math.cos(a); bot._mvy = Math.sin(a);
    }
  },

  // 壁回避しながら移動方向へ進む
  steer(bot, dt, game){
    if(bot._wanderT !== undefined) bot._wanderT -= dt;
    let mx = bot._mvx || 0, my = bot._mvy || 0;
    if(mx === 0 && my === 0) return;

    // 前方に壁がある場合、左右に逸らす（簡易回避）
    const probe = 46;
    const px = bot.x + mx*probe, py = bot.y + my*probe;
    if(GameMap.bulletHitsWall(px, py, bot.radius)){
      // 左右どちらかに回避（垂直方向）
      const altA = { x: -my, y: mx };
      const altB = { x: my, y: -mx };
      const aClear = !GameMap.bulletHitsWall(bot.x+altA.x*probe, bot.y+altA.y*probe, bot.radius);
      const chosen = aClear ? altA : altB;
      mx = mx*0.4 + chosen.x*0.8;
      my = my*0.4 + chosen.y*0.8;
      const l = Math.hypot(mx,my)||1; mx/=l; my/=l;
    }
    bot.move(mx, my, dt, game.WORLD);
  },

  tryShoot(bot, dt, game){
    if(!bot._aim) return;
    if(!bot.canFire()) return;
    // 命中率を持たせるため、たまに撃つ（連射しすぎ防止はcooldownで担保）
    const len = Math.hypot(bot._aim.x, bot._aim.y) || 1;
    // 簡易リード（移動予測）
    let aimX = bot._aim.x/len, aimY = bot._aim.y/len;
    if(bot._target){
      // ほんの少し精度を散らす
      const spread = 0.12;
      const a = Math.atan2(aimY, aimX) + Utils.rand(-spread, spread);
      aimX = Math.cos(a); aimY = Math.sin(a);
    }
    game.fire(bot, aimX, aimY);
  },

  // 最寄りの敵（cop視点はお宝持ち優先可）
  nearestEnemy(bot, game, preferGemHolder){
    let best = null, bestScore = Infinity;
    for(const p of game.players){
      if(!p.alive || p.team === bot.team) continue;
      // 茂みの中の敵は見えない（同じ茂み近接なら別）
      if(GameMap.inBush(p.x, p.y)){
        const d0 = Utils.dist(bot.x, bot.y, p.x, p.y);
        if(d0 > 110) continue;   // 茂み内は近距離でしか感知しない
      }
      let d = Utils.dist(bot.x, bot.y, p.x, p.y);
      let score = d;
      if(preferGemHolder && p.gems > 0) score -= p.gems * 60;  // お宝持ちを優先
      if(score < bestScore){ bestScore = score; best = p; }
    }
    return best;
  },

  nearestGem(bot, game){
    let best = null, bestD = Infinity;
    for(const g of game.gems){
      if(g.collected) continue;
      const d = Utils.dist(bot.x, bot.y, g.x, g.y);
      if(d < bestD){ bestD = d; best = g; }
    }
    return best;
  }
};
