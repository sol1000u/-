// 结算页：战利品 / 惩罚 / 段位进度
import app, { Scene } from '../core/App';
import CFG from '../core/Config';
import store from '../core/Store';
import { draw } from '../render/Draw';
import { Painter } from '../render/Painter';
import { Button, panel, stars, rankBadge } from '../ui/UI';

function drawSkinHead(p: Painter, cx: number, cy: number, r: number, charId: string, skin: any): void {
  p.circle(cx, cy, r, 'rgba(255,255,255,0.10)');
  if (charId === 'dog') {
    for (let i = -1; i <= 1; i += 2) {
      p.poly([
        [cx + i * r * 0.30, cy - r * 0.42],
        [cx + i * r * 0.72, cy - r * 0.95],
        [cx + i * r * 0.90, cy - r * 0.30],
      ], skin.furDark);
    }
  } else {
    for (let i = -1; i <= 1; i += 2) {
      p.poly([
        [cx + i * r * 0.26, cy - r * 0.55],
        [cx + i * r * 0.56, cy - r * 1.08],
        [cx + i * r * 0.86, cy - r * 0.40],
      ], skin.fur);
    }
  }
  p.ell(cx, cy + r * 0.10, r * 0.72, r * 0.66, skin.fur);
  p.ell(cx - r * 0.24, cy - r * 0.02, r * 0.10, r * 0.12, '#3a2a3f');
  p.ell(cx + r * 0.24, cy - r * 0.02, r * 0.10, r * 0.12, '#3a2a3f');
  p.ell(cx - r * 0.42, cy + r * 0.24, r * 0.14, r * 0.08, 'rgba(255,150,170,0.55)');
  p.ell(cx + r * 0.42, cy + r * 0.24, r * 0.14, r * 0.08, 'rgba(255,150,170,0.55)');
  p.ell(cx, cy + r * 0.30, r * 0.18, r * 0.12, skin.belly);
  p.ell(cx, cy + r * 0.28, r * 0.06, r * 0.05, '#3a2a3f');
}

class ResultScene implements Scene {
  t = 0;
  data: any = {};
  btnAgain!: Button;
  btnHome!: Button;
  btnRank!: Button;

  enter(payload: any): void {
    this.data = payload || {};
    this.t = 0;
    this.layout();
  }

  layout(): void {
    this.btnAgain = new Button({
      x: 18, y: 512, w: 339, h: 64, r: 32, label: '再 战 一 场',
      size: 20, color: '#ffa14c', color2: '#e0642c',
    });
    this.btnHome = new Button({
      x: 18, y: 590, w: 163, h: 44, r: 22, label: '返回主页', size: 14,
      color: 'rgba(96,126,190,0.85)', color2: 'rgba(46,64,108,0.9)',
    });
    this.btnRank = new Button({
      x: 194, y: 590, w: 163, h: 44, r: 22, label: '查看排行榜', size: 14,
      color: 'rgba(180,140,255,0.85)', color2: 'rgba(107,69,208,0.9)',
    });
  }

  update(dt: number): void {
    this.t += dt;
    [this.btnAgain, this.btnHome, this.btnRank].forEach((b) => {
      if (b && b.press > 0) b.press -= dt;
    });
  }

  onTouchStart(x: number, y: number): void {
    if (this.btnAgain.hit(x, y)) {
      this.btnAgain.press = 0.2;
      app.setScene('battle');
    } else if (this.btnHome.hit(x, y)) {
      this.btnHome.press = 0.2;
      app.setScene('start');
    } else if (this.btnRank.hit(x, y)) {
      this.btnRank.press = 0.2;
      app.setScene('rank');
    }
  }

  renderIcon(p: Painter, cx: number, cy: number, r: number, item: any, time: number): void {
    if (!item) {
      p.circle(cx, cy, r, 'rgba(255,255,255,0.08)');
      p.text('无', cx, cy + 1, { size: 20, align: 'center', color: 'rgba(255,255,255,0.5)' });
      return;
    }
    if (item.type === 'coin') {
      p.circle(cx, cy, r * 0.78, '#ffd166');
      p.circle(cx, cy - 2, r * 0.62, '#ffe9a3');
      p.text('金', cx, cy, { size: 18, align: 'center', color: '#a06b16' });
      return;
    }
    const rank = CFG.RANKS[item.rankIndex];
    if (!rank) return;
    if (item.type === 'skin') {
      drawSkinHead(p, cx, cy, r, this.data.playerChar || store.state.charId, rank.skin);
    } else {
      p.save();
      p.translate(cx - r * 0.72, cy + r * 0.12);
      p.scale(0.92, 0.92);
      draw.drawWeaponIcon(p, 0, 0, 1, rank.weapon, item.rankIndex, time);
      p.restore();
    }
  }

  render(p: Painter, time: number): void {
    const d = this.data;
    const win = !!d.win;
    const vb = app.vb;
    const rank = store.rank();
    const accent = win ? '#ffd166' : '#ff7070';
    draw.drawMenuBg(p, vb, time, rank.tag);

    // 标题
    p.text(win ? '胜 利' : '战 败', 187, 96, {
      size: 44, align: 'center', color: win ? '#ffd166' : '#ff9a9a',
      stroke: 'rgba(20,12,34,0.6)', strokeWidth: 6,
    });
    p.text((d.npcName || '对手') + ' · ' + CFG.RANKS[d.npcRank || 0].name + ' 段位', 187, 132, {
      size: 12, align: 'center', regular: true, color: 'rgba(255,255,255,0.7)',
    });

    if (win) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + time * 0.4;
        const rr = 150 + Math.sin(time * 2 + i) * 14;
        const sx = 187 + Math.cos(a) * rr * 1.1;
        const sy = 96 + Math.sin(a) * rr * 0.45;
        p.save();
        p.setAlpha(0.35 + Math.abs(Math.sin(time * 3 + i)) * 0.5);
        draw.star(p, sx, sy, 3 + (i % 3), accent);
        p.restore();
      }
    }

    // 战利品 / 惩罚
    const item = win ? d.reward : d.penalty;
    panel(p, 18, 156, 339, 160, 20);
    p.text(win ? '战 利 品' : '损 失', 38, 180, {
      size: 11, regular: true, color: win ? '#ffd166' : '#ff9a9a',
    });

    this.renderIcon(p, 76, 252, 40, item, time);

    let title = '';
    let sub = '';
    if (win) {
      if (d.reward && d.reward.type === 'coin') {
        title = '+' + d.reward.coins + ' 金币';
        sub = '重复装备自动折算';
      } else if (d.reward) {
        title = d.reward.name || '段位装备';
        sub = (CFG.RANKS[d.reward.rankIndex].name + ' 段位装备已加入收藏');
      } else {
        title = '无';
        sub = '';
      }
    } else {
      if (d.penalty && d.penalty.type === 'star') {
        title = '星数 -1';
        sub = '本段位没有装备可扣';
      } else if (d.penalty) {
        title = d.penalty.name || '段位装备';
        sub = (CFG.RANKS[d.penalty.rankIndex].name + ' 段位装备已失去');
      } else {
        title = '无装备可扣';
        sub = '星数也未变化，下次再战';
      }
    }

    p.text(title, 128, 236, {
      size: 18, color: win ? '#ffffff' : '#ffd0d0',
      stroke: 'rgba(20,12,34,0.4)', strokeWidth: 3,
    });
    p.text(sub, 128, 262, { size: 10, regular: true, color: 'rgba(255,255,255,0.62)' });
    if (win && d.promote) {
      p.text('本局 +1 星', 128, 282, { size: 10, regular: true, color: '#7ee1a8' });
    }
    if (!win) {
      p.text('段位星数不变，装备已扣除', 128, 282, { size: 10, regular: true, color: 'rgba(255,255,255,0.45)' });
    }

    // 段位进度
    panel(p, 18, 330, 339, 122, 20);
    p.text('段 位 进 度', 38, 354, { size: 11, regular: true, color: 'rgba(255,255,255,0.6)' });
    rankBadge(p, 58, 400, 22, store.state.rankIndex, rank.name);
    p.text(rank.name, 92, 390, { size: 16, color: rank.tag });
    stars(p, 92, 412, store.state.stars, CFG.RANK_STARS, 7, 19, '#ffd166', 'rgba(255,255,255,0.2)');
    p.text(store.state.stars + ' / ' + CFG.RANK_STARS + ' 颗星', 148, 412, {
      size: 9, regular: true, color: 'rgba(255,255,255,0.55)',
    });

    const skinCount = store.state.skins.length;
    const weaponCount = store.state.weapons.length;
    p.text('皮肤 ' + skinCount + '/' + CFG.RANKS.length + '　武器 ' + weaponCount + '/' + CFG.RANKS.length, 342, 390, {
      size: 10, align: 'right', regular: true, color: 'rgba(255,255,255,0.7)',
    });
    p.text('金币 ' + store.state.coins, 342, 412, { size: 10, align: 'right', color: '#ffd166' });

    if (d.promote && d.promote.promoted) {
      const a = 0.65 + Math.sin(time * 4) * 0.35;
      p.text('段 位 晋 升 · ' + CFG.RANKS[d.promote.rankIndex].name, 187, 474, {
        size: 19, align: 'center', color: 'rgba(255,214,102,' + a + ')',
        stroke: 'rgba(60,30,20,0.55)', strokeWidth: 4,
      });
    } else {
      p.text(win ? '击败对手，继续向上攀升' : '失败不可怕，整理装备再来', 187, 474, {
        size: 11, align: 'center', regular: true, color: 'rgba(255,255,255,0.5)',
      });
    }

    this.btnAgain.draw(p);
    this.btnHome.draw(p);
    this.btnRank.draw(p);
  }
}

export const resultScene = new ResultScene();
export default resultScene;
