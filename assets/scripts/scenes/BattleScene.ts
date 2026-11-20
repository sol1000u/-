// 战斗页：实时 2D 格斗，左右移动 + 拳 / 重击 / 防御 / 必杀
import app, { Scene } from '../core/App';
import CFG from '../core/Config';
import store from '../core/Store';
import { draw } from '../render/Draw';
import { Painter } from '../render/Painter';
import { Button, hpBar, toast } from '../ui/UI';
import net from '../core/Net';

const GROUND = CFG.GROUND_Y;

const OPPONENTS = ['隔壁老汪', '橘座大人', '芝士汪汪', '奶盖拳王', '布丁守护者',
  '小鱼干冲鸭', '年糕不认输', '汤圆大魔王', '喵喵拳', '肉松队长', '可乐小霸王',
  '雪球出击', '绿豆战士', '麻薯小队长', '芋圆不爱输', '哈吉米粉丝'];

const ATTACKS: Record<string, any> = {
  punch: { dur: 0.34, hitAt: 0.14, cd: 0.36, mul: 1.0, range: 66, energy: 9, cost: 0 },
  heavy: { dur: 0.52, hitAt: 0.30, cd: 0.78, mul: 1.62, range: 84, energy: 12, cost: 0 },
  special: { dur: 0.74, hitAt: 0.32, cd: 1.1, mul: 2.4, range: 124, energy: 0, cost: 100 },
};

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

class BattleScene implements Scene {
  t = 0;
  phase = 'intro';
  introT = 1.6;
  paused = false;
  hitStop = 0;
  shake = 0;
  particles: any[] = [];
  rings: any[] = [];
  texts: any[] = [];
  msg = '';
  msgT = 0;
  resultSent = false;
  overT = 0;
  pendingWin = false;
  controls = { left: false, right: false, block: false };
  touch: any = { left: null, right: null, block: null };

  player: any = null;
  npc: any = null;

  btnExit!: Button;
  btnLeft!: Button;
  btnRight!: Button;
  btnPunch!: Button;
  btnHeavy!: Button;
  btnSpecial!: Button;
  btnBlock!: Button;
  btnResume!: Button;
  btnQuit!: Button;

  enter(): void {
    this.t = 0;
    this.phase = 'intro';
    this.introT = 1.6;
    this.paused = false;
    this.hitStop = 0;
    this.shake = 0;
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.msg = '';
    this.msgT = 0;
    this.resultSent = false;
    this.overT = 0;
    this.pendingWin = false;
    this.controls = { left: false, right: false, block: false };
    this.touch = { left: null, right: null, block: null };

    const st = store.state;
    const char = store.char();
    const stats = store.stats();
    const rank = st.rankIndex;
    const rankCfg = CFG.RANKS[rank];

    this.player = this.makeFighter({
      charId: char.id, name: st.name, skin: store.skin(), weapon: store.weapon(),
      rankIndex: rank, isPlayer: true,
      x: 118, facing: 1, hp: stats.hp, dmg: stats.dmg, speed: stats.speed,
    });

    const npcChar = CFG.CHARACTERS[Math.random() < 0.5 ? 0 : 1];
    let npcName = OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
    if (npcName === st.name) npcName = '镜像' + npcChar.name;
    this.npc = this.makeFighter({
      charId: npcChar.id, name: npcName,
      skin: draw.shadeSkin(rankCfg.skin, 0.72),
      weapon: draw.shadeWeapon(rankCfg.weapon, 0.8),
      rankIndex: rank, isPlayer: false, x: 257, facing: -1,
      hp: 96 + rank * 10, dmg: 9 + rank * 1.7, speed: 136 + rank * 3,
    });

    this.buildButtons();
  }

  layout(): void { }

  makeFighter(o: any): any {
    return {
      charId: o.charId, name: o.name, skin: o.skin, weapon: o.weapon,
      rankIndex: o.rankIndex, isPlayer: o.isPlayer,
      x: o.x, y: GROUND, facing: o.facing || 1,
      hp: o.hp, maxHp: o.hp, hpTrail: o.hp,
      dmg: o.dmg, speed: o.speed,
      state: 'idle', stateT: 0, dur: 0, cooldown: 0,
      energy: 0, flash: 0, hitDone: false, pendingKind: null,
      think: 0.25, aiMode: 'approach', seed: Math.random() * 6,
    };
  }

  buildButtons(): void {
    this.btnExit = new Button({
      x: 150, y: 98, w: 75, h: 26, r: 13, label: '退 出', size: 11,
      color: 'rgba(72,54,98,0.72)', color2: 'rgba(40,28,58,0.72)',
      border: 'rgba(255,255,255,0.22)',
    });
    this.btnLeft = new Button({
      x: 18, y: 570, w: 70, h: 70, shape: 'circle', label: '←', size: 26,
      color: 'rgba(96,126,190,0.82)', color2: 'rgba(46,64,108,0.86)',
    });
    this.btnRight = new Button({
      x: 96, y: 570, w: 70, h: 70, shape: 'circle', label: '→', size: 26,
      color: 'rgba(96,126,190,0.82)', color2: 'rgba(46,64,108,0.86)',
    });
    this.btnPunch = new Button({
      x: 262, y: 570, w: 80, h: 80, shape: 'circle', label: '拳', size: 22,
      color: '#ffa14c', color2: '#dd5f28',
    });
    this.btnHeavy = new Button({
      x: 312, y: 504, w: 60, h: 60, shape: 'circle', label: '重', size: 16,
      color: '#ff7070', color2: '#c23a4c',
    });
    this.btnSpecial = new Button({
      x: 212, y: 518, w: 60, h: 60, shape: 'circle', label: '杀', size: 15,
      sub: '0%', subSize: 8, color: '#b48cff', color2: '#6b45d0',
    });
    this.btnBlock = new Button({
      x: 168, y: 584, w: 56, h: 56, shape: 'circle', label: '防', size: 14,
      color: '#6fc3ff', color2: '#2f7fc4',
    });
    this.btnResume = new Button({
      x: 62, y: 330, w: 110, h: 46, r: 23, label: '继续对战', size: 14,
      color: '#5fbf7a', color2: '#31875a',
    });
    this.btnQuit = new Button({
      x: 203, y: 330, w: 110, h: 46, r: 23, label: '放弃本局', size: 14,
      color: '#ff7070', color2: '#b93a4c',
    });
  }

  flashMsg(msg: string): void {
    this.msg = msg;
    this.msgT = 1.2;
  }

  startAttack(f: any, kind: string): void {
    const cfg = ATTACKS[kind];
    if (!cfg) return;
    if (kind === 'special' && f.energy < cfg.cost) return;
    f.state = kind;
    f.stateT = 0;
    f.dur = cfg.dur;
    f.hitDone = false;
    f.pendingKind = null;
    f.cooldown = cfg.cd;
    if (kind === 'special') {
      f.energy = 0;
      this.rings.push({
        x: f.x, y: GROUND - 60, radius: 12, grow: 70,
        life: 0.4, max: 0.4, color: '#c8b1ff',
      });
      this.shake = Math.max(this.shake, 4);
    }
    if (!f.isPlayer) f.cooldown *= Math.max(0.62, 1 - f.rankIndex * 0.035);
  }

  tryAttack(kind: string): void {
    const p = this.player;
    if (this.phase !== 'fight' || this.paused) return;
    if (p.state === 'ko' || p.state === 'hurt') return;
    if (p.state === 'punch' || p.state === 'heavy' || p.state === 'special') return;
    if (p.cooldown > 0) return;
    if (kind === 'special' && p.energy < 100) {
      this.flashMsg('必杀能量不足，请先累积能量');
      return;
    }
    this.startAttack(p, kind);
  }

  onTouchStart(x: number, y: number, id: number): void {
    if (this.paused) {
      if (this.btnResume.hit(x, y)) { this.paused = false; this.btnResume.press = 0.2; }
      else if (this.btnQuit.hit(x, y)) { this.btnQuit.press = 0.2; app.setScene('start'); }
      return;
    }
    if (this.phase === 'intro') {
      if (this.introT > 0.3) this.introT = 0.3;
      return;
    }
    if (this.btnExit.hit(x, y)) { this.paused = true; return; }
    if (this.phase !== 'fight') return;

    if (this.btnLeft.hit(x, y)) {
      this.touch.left = id;
      this.controls.left = true;
    } else if (this.btnRight.hit(x, y)) {
      this.touch.right = id;
      this.controls.right = true;
    } else if (this.btnBlock.hit(x, y)) {
      this.touch.block = id;
      this.controls.block = true;
      this.btnBlock.press = 0.2;
    } else if (this.btnPunch.hit(x, y)) {
      this.btnPunch.press = 0.2;
      this.tryAttack('punch');
    } else if (this.btnHeavy.hit(x, y)) {
      this.btnHeavy.press = 0.2;
      this.tryAttack('heavy');
    } else if (this.btnSpecial.hit(x, y)) {
      this.btnSpecial.press = 0.2;
      this.tryAttack('special');
    }
  }

  onTouchEnd(x: number, y: number, id: number): void {
    this.releaseTouch(id);
  }

  onTouchCancel(x: number, y: number, id: number): void {
    this.releaseTouch(id);
  }

  releaseTouch(id: number): void {
    if (this.touch.left === id) { this.touch.left = null; this.controls.left = false; }
    if (this.touch.right === id) { this.touch.right = null; this.controls.right = false; }
    if (this.touch.block === id) { this.touch.block = null; this.controls.block = false; }
  }

  update(dt: number): void {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;

    const buttons = [this.btnPunch, this.btnHeavy, this.btnSpecial, this.btnBlock,
      this.btnResume, this.btnQuit];
    buttons.forEach((b) => { if (b.press > 0) b.press -= dt; });

    if (this.paused) return;

    if (this.phase === 'intro') {
      this.introT -= dt;
      if (this.introT <= 0) { this.phase = 'fight'; this.introT = 0; }
      this.updateEffects(dt);
      return;
    }
    if (this.phase === 'over') {
      this.overT += dt;
      this.updateEffects(dt);
      this.updateHpTrail(dt);
      if (this.overT > 1.2 && !this.resultSent) this.finish();
      return;
    }
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.updateEffects(dt);
      return;
    }

    this.updatePlayer(dt);
    this.updateNpc(dt);
    this.updateFacing();
    this.resolveHit(this.player, this.npc);
    this.resolveHit(this.npc, this.player);
    this.separate();
    this.updateEffects(dt);
    this.updateHpTrail(dt);

    if (this.phase === 'fight' && (this.player.hp <= 0 || this.npc.hp <= 0)) {
      this.beginOver();
    }
  }

  updatePlayer(dt: number): void {
    const p = this.player;
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.flash = Math.max(0, p.flash - dt);

    if (p.state === 'punch' || p.state === 'heavy' || p.state === 'special') {
      p.stateT += dt;
      const cfg = ATTACKS[p.state];
      if (p.state === 'special' && p.stateT < 0.34) p.x += p.facing * 230 * dt;
      else if (p.stateT < 0.16) p.x += p.facing * 34 * dt;
      if (!p.hitDone && p.stateT >= cfg.hitAt) {
        p.hitDone = true;
        p.pendingKind = p.state;
      }
      if (p.stateT >= p.dur) { p.state = 'idle'; p.stateT = 0; }
      p.x = clamp(p.x, 44, 331);
      return;
    }
    if (p.state === 'hurt') {
      p.stateT += dt;
      if (p.stateT >= p.dur) { p.state = 'idle'; p.stateT = 0; }
      return;
    }
    if (p.state === 'ko') { p.stateT += dt; return; }

    if (p.state === 'idle' || p.state === 'walk' || p.state === 'block') {
      if (this.controls.block) {
        if (p.state !== 'block') { p.state = 'block'; p.stateT = 0; }
      } else {
        let dir = 0;
        if (this.controls.left) dir -= 1;
        if (this.controls.right) dir += 1;
        p.x += dir * p.speed * dt;
        p.state = dir ? 'walk' : 'idle';
      }
    }
    p.x = clamp(p.x, 44, 331);
  }

  updateNpc(dt: number): void {
    const n = this.npc;
    const p = this.player;
    n.cooldown = Math.max(0, n.cooldown - dt);
    n.flash = Math.max(0, n.flash - dt);

    if (n.state === 'punch' || n.state === 'heavy' || n.state === 'special') {
      n.stateT += dt;
      const cfg = ATTACKS[n.state];
      if (n.state === 'special' && n.stateT < 0.34) n.x += n.facing * 200 * dt;
      else if (n.stateT < 0.16) n.x += n.facing * 30 * dt;
      if (!n.hitDone && n.stateT >= cfg.hitAt) {
        n.hitDone = true;
        n.pendingKind = n.state;
      }
      if (n.stateT >= n.dur) { n.state = 'idle'; n.stateT = 0; n.think = 0.25; }
      n.x = clamp(n.x, 44, 331);
      return;
    }
    if (n.state === 'hurt') {
      n.stateT += dt;
      if (n.stateT >= n.dur) { n.state = 'idle'; n.stateT = 0; }
      return;
    }
    if (n.state === 'ko') { n.stateT += dt; return; }
    if (n.state === 'block') {
      n.stateT += dt;
      if (n.stateT >= n.dur) { n.state = 'idle'; n.stateT = 0; }
      return;
    }

    const dx = p.x - n.x;
    const dist = Math.abs(dx);
    n.facing = dx >= 0 ? 1 : -1;
    n.think -= dt;

    if (n.think > 0) {
      if (n.aiMode === 'retreat') {
        n.x -= n.facing * n.speed * 0.55 * dt;
        n.state = 'walk';
      } else if (dist > 80) {
        n.x += n.facing * n.speed * dt;
        n.state = 'walk';
      } else {
        n.state = 'idle';
      }
      n.x = clamp(n.x, 44, 331);
      return;
    }

    n.think = 0.2 + Math.random() * 0.28;
    const aggr = 0.18 + n.rankIndex * 0.03;

    if (n.energy >= 100 && dist < 132 && Math.random() < 0.5) {
      this.startAttack(n, 'special');
      return;
    }
    if (dist > 92) {
      n.aiMode = 'approach';
      n.state = 'walk';
      return;
    }
    if (dist < 58 && Math.random() < aggr) {
      n.state = 'block';
      n.stateT = 0;
      n.dur = 0.45 + Math.random() * 0.3;
      n.think += 0.25;
      return;
    }
    if (n.cooldown <= 0 && dist < 92 && Math.random() < 0.7) {
      this.startAttack(n, Math.random() < 0.68 ? 'punch' : 'heavy');
      return;
    }
    if (dist > 64) {
      n.aiMode = 'approach';
      n.state = 'walk';
      n.x += n.facing * n.speed * 0.6 * dt;
    } else {
      n.state = 'idle';
    }
    n.x = clamp(n.x, 44, 331);
  }

  updateFacing(): void {
    const p = this.player;
    const n = this.npc;
    const attacking = (f: any) => f.state === 'punch' || f.state === 'heavy' || f.state === 'special';
    if (!attacking(p)) p.facing = n.x >= p.x ? 1 : -1;
    if (!attacking(n)) n.facing = p.x >= n.x ? 1 : -1;
  }

  resolveHit(a: any, t: any): void {
    if (!a.pendingKind) return;
    const kind = a.pendingKind;
    a.pendingKind = null;
    if (a.state === 'hurt' || a.state === 'ko' || a.state === 'block') return;

    const cfg = ATTACKS[kind];
    const dx = (t.x - a.x) * a.facing;
    if (dx < -12 || dx > cfg.range) return;

    const blocked = t.state === 'block';
    let dmg = a.dmg * cfg.mul;
    if (blocked) dmg *= 0.22;
    dmg = Math.max(1, Math.round(dmg));

    t.hp = Math.max(0, t.hp - dmg);
    t.flash = 0.18;
    t.energy = Math.min(100, t.energy + 5);
    if (!blocked) a.energy = Math.min(100, a.energy + (kind === 'special' ? 0 : cfg.energy));

    const hx = t.x - a.facing * 18;
    const hy = GROUND - 78;

    if (!blocked) {
      if (t.state !== 'ko') {
        t.state = 'hurt';
        t.stateT = 0;
        t.dur = kind === 'special' ? 0.5 : 0.28;
        t.hitDone = false;
        t.pendingKind = null;
      }
      t.x += a.facing * (kind === 'special' ? 26 : 12);
    } else {
      t.x += a.facing * 4;
    }

    this.texts.push({
      x: hx, y: hy, text: String(dmg),
      size: kind === 'special' ? 26 : 18,
      color: blocked ? '#9fd8ff' : (kind === 'special' ? '#ffd166' : '#ffffff'),
      life: 0.75, max: 0.75, vy: -70, vx: 0,
    });
    this.spawnHit(hx, hy, blocked ? '#9fd8ff' : (kind === 'special' ? '#ffd166' : '#ffffff'),
      kind === 'special' ? 18 : 10);
    this.shake = Math.max(this.shake, kind === 'special' ? 10 : blocked ? 2 : 5);
    this.hitStop = Math.max(this.hitStop, kind === 'special' ? 0.09 : 0.05);

    if (kind === 'special') {
      this.rings.push({
        x: t.x, y: GROUND, radius: 14, grow: 110,
        life: 0.45, max: 0.45, color: blocked ? '#9fd8ff' : '#ffd166',
      });
    }

    if (t.hp <= 0) {
      t.state = 'ko';
      t.stateT = 0;
      t.pendingKind = null;
    }
  }

  separate(): void {
    const p = this.player;
    const n = this.npc;
    const min = 54;
    if (Math.abs(p.x - n.x) < min) {
      const mid = (p.x + n.x) / 2;
      const dir = p.x <= n.x ? -1 : 1;
      p.x = mid + dir * min / 2;
      n.x = mid - dir * min / 2;
    }
    p.x = clamp(p.x, 44, 331);
    n.x = clamp(n.x, 44, 331);
  }

  spawnHit(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * (count > 12 ? 220 : 120);
      const life = 0.28 + Math.random() * 0.32;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life, max: life, r: 2 + Math.random() * 3, color,
      });
    }
    if (this.particles.length > 120) this.particles.splice(0, this.particles.length - 120);
  }

  updateEffects(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 210 * dt;
      p.vx *= 0.96;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const d = this.texts[i];
      d.y += d.vy * dt;
      d.vy *= 0.92;
      d.life -= dt;
      if (d.life <= 0) this.texts.splice(i, 1);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 46);
  }

  updateHpTrail(dt: number): void {
    const list = [this.player, this.npc];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.hpTrail > f.hp) {
        f.hpTrail = Math.max(f.hp, f.hpTrail - dt * (f.maxHp * 0.7 + 26));
      } else {
        f.hpTrail = f.hp;
      }
    }
  }

  beginOver(): void {
    this.phase = 'over';
    this.overT = 0;
    const p = this.player;
    const n = this.npc;
    if (p.hp <= 0) { p.state = 'ko'; p.stateT = 0; }
    if (n.hp <= 0) { n.state = 'ko'; n.stateT = 0; }
    this.pendingWin = n.hp <= 0 && p.hp > 0;
    this.shake = Math.max(this.shake, 12);
    this.texts.push({
      x: 187, y: 255, text: 'K.O.', size: 46, color: '#ffd166',
      life: 1.3, max: 1.3, vy: -8, vx: 0,
    });
    this.rings.push({
      x: 187, y: GROUND, radius: 18, grow: 150,
      life: 0.55, max: 0.55, color: '#ffd166',
    });
  }

  finish(): void {
    this.resultSent = true;
    const win = this.pendingWin;
    const before = store.state.rankIndex;
    let reward = null;
    let penalty = null;
    let promote = null;

    if (win) {
      reward = store.grantItem(before);
      promote = store.addStars();
    } else {
      store.addLoss();
      penalty = store.loseItem(before);
    }
    net.submitScore();

    app.setScene('result', {
      win, reward, penalty, promote,
      beforeRank: before,
      npcName: this.npc.name,
      npcRank: before,
      playerChar: this.player.charId,
    });
  }

  render(p: Painter, time: number): void {
    const vb = app.vb;
    const rankCfg = CFG.RANKS[store.state.rankIndex];
    draw.drawArenaBg(p, vb, time, rankCfg.tag);

    const shx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const shy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.6 : 0;

    p.save();
    p.translate(shx, shy);

    this.drawSideMark(p, this.player, '#5fa8ff', time);
    this.drawSideMark(p, this.npc, '#ff6b7a', time);
    draw.drawFighter(p, this.npc, time);
    draw.drawFighter(p, this.player, time);
    draw.drawRings(p, this.rings);
    draw.drawParticles(p, this.particles);
    draw.drawTexts(p, this.texts);
    p.restore();

    this.renderHud(p, time);
    this.renderButtons(p, time);
    this.renderIntro(p, time);
    this.renderPaused(p);

    if (this.msgT > 0) {
      toast(p, this.msg, Math.min(1, this.msgT * 2), 370);
    }
  }

  // 阵营标识：脚下光环 + 头顶小三角
  drawSideMark(p: Painter, f: any, color: string, time: number): void {
    if (f.state === 'ko') return;
    const pulse = 0.42 + (0.5 + Math.sin(time * 3 + f.seed)) * 0.12;
    p.save();
    p.setAlpha(pulse);
    p.ellStroke(f.x, f.y + 4, 40, 11, 0, color, 2.5, 1, 0, Math.PI * 2, true);
    p.restore();

    const bob = Math.sin(time * 2.4 + f.seed) * 3;
    const my = f.y - 182 + bob;
    p.poly([[f.x, my + 10], [f.x - 7, my - 4], [f.x + 7, my - 4]], color);
    p.polyStroke([[f.x, my + 10], [f.x - 7, my - 4], [f.x + 7, my - 4]], 'rgba(255,255,255,0.85)', 1.2, true);
  }

  renderHud(p: Painter, time: number): void {
    const pl = this.player;
    const n = this.npc;
    const pr = CFG.RANKS[pl.rankIndex];
    const nr = CFG.RANKS[n.rankIndex];

    p.text(pl.name, 16, 31, {
      size: 13, color: '#ffffff', stroke: 'rgba(20,14,32,0.5)', strokeWidth: 2.2,
    });
    p.text(pr.name + ' 段位', 16, 47, {
      size: 9, regular: true, color: 'rgba(255,255,255,0.8)',
      stroke: 'rgba(20,14,32,0.4)', strokeWidth: 1.4,
    });
    p.text(n.name, 359, 31, {
      size: 13, align: 'right', color: '#ffffff',
      stroke: 'rgba(20,14,32,0.5)', strokeWidth: 2.2,
    });
    p.text(nr.name + ' 段位', 359, 47, {
      size: 9, regular: true, align: 'right', color: 'rgba(255,255,255,0.8)',
      stroke: 'rgba(20,14,32,0.4)', strokeWidth: 1.4,
    });

    hpBar(p, 16, 56, 152, 13, pl.hp / pl.maxHp, pl.hpTrail / pl.maxHp, false, '#7ee1a8', '#35a97a');
    hpBar(p, 207, 56, 152, 13, n.hp / n.maxHp, n.hpTrail / n.maxHp, true, '#ff8a8a', '#d2414f');

    hpBar(p, 16, 74, 152, 6, pl.energy / 100, pl.energy / 100, false, '#c8b1ff', '#7b57e0');
    hpBar(p, 207, 74, 152, 6, n.energy / 100, n.energy / 100, true, '#c8b1ff', '#7b57e0');

    // VS 徽标
    p.circle(187, 60, 15, 'rgba(24,16,38,0.75)');
    p.circleStroke(187, 60, 15, 'rgba(255,255,255,0.3)', 1.2);
    p.text('VS', 187, 60.5, { size: 9, align: 'center', color: '#ffd166' });

    if (pl.energy >= 100) {
      const a = 0.6 + Math.sin(time * 5) * 0.3;
      p.text('必杀就绪', 92, 88, {
        size: 10, align: 'center', color: 'rgba(200,177,255,' + a + ')',
        stroke: 'rgba(20,14,32,0.5)', strokeWidth: 2,
      });
    }
    if (n.energy >= 100) {
      p.text('对手能量已满', 282, 88, { size: 10, align: 'center', color: 'rgba(255,255,255,0.7)' });
    }
  }

  drawCooldown(p: Painter, btn: Button, ratio: number, color: string): void {
    if (ratio <= 0) return;
    const cx = btn.x + btn.w / 2;
    const cy = btn.y + btn.h / 2;
    const r = Math.max(8, btn.w / 2 - 6);
    p.save();
    p.setAlpha(0.55);
    p.ellStroke(cx, cy, r, r, 0, color, 4, 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ratio), false);
    p.restore();
  }

  renderButtons(p: Painter, time: number): void {
    const pl = this.player;

    this.btnLeft.draw(p);
    this.btnRight.draw(p);
    this.btnBlock.draw(p);
    this.btnPunch.draw(p);
    this.btnHeavy.draw(p);
    this.btnSpecial.draw(p);
    this.btnExit.draw(p);

    this.drawCooldown(p, this.btnPunch, pl.cooldown / ATTACKS.punch.cd, '#ffd166');
    this.drawCooldown(p, this.btnHeavy, pl.cooldown / ATTACKS.heavy.cd, '#ffd166');

    this.btnSpecial.enabled = pl.energy >= 100;
    this.btnSpecial.sub = Math.round(pl.energy) + '%';
    if (pl.energy >= 100) {
      const cx = this.btnSpecial.x + this.btnSpecial.w / 2;
      const cy = this.btnSpecial.y + this.btnSpecial.h / 2;
      p.glow(cx, cy, 46, '#c8b1ff', 0.25 + Math.sin(time * 5) * 0.1);
    }
    if (this.controls.block) {
      p.save();
      p.setAlpha(0.35);
      p.circleStroke(this.btnBlock.x + this.btnBlock.w / 2, this.btnBlock.y + this.btnBlock.h / 2,
        this.btnBlock.w / 2 + 3, '#ffffff', 3);
      p.restore();
    }
  }

  renderIntro(p: Painter, time: number): void {
    if (this.phase !== 'intro') return;
    const k = Math.max(0, Math.min(1, this.introT / 1.6));
    p.save();
    p.setAlpha(0.5 + 0.5 * k);
    p.text('V S', 187, 214, {
      size: 58, align: 'center', color: '#ffd166',
      stroke: 'rgba(60, 30, 20, 0.35)', strokeWidth: 6,
    });
    p.text(this.npc.name + ' · ' + CFG.RANKS[this.npc.rankIndex].name + ' 段位', 187, 262, {
      size: 13, align: 'center', color: '#ffffff',
      stroke: 'rgba(20,14,32,0.55)', strokeWidth: 3,
    });
    p.text('左右移动 · 拳 / 重击 / 防御 / 必杀', 187, 288, {
      size: 10, align: 'center', regular: true, color: 'rgba(255,255,255,0.8)',
      stroke: 'rgba(20,14,32,0.35)', strokeWidth: 2,
    });
    p.restore();
  }

  renderPaused(p: Painter): void {
    if (!this.paused) return;
    const vb = app.vb;
    p.save();
    p.setAlpha(0.72);
    p.rect(vb.x, vb.y, vb.w, vb.h, '#140e20');
    p.restore();
    p.text('已 暂 停', 187, 262, { size: 26, align: 'center', color: '#ffffff' });
    this.btnResume.draw(p);
    this.btnQuit.draw(p);
  }
}

export const battleScene = new BattleScene();
export default battleScene;
