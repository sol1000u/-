// 段位介绍页：段位阶梯 + 当前段位高亮 + 点击任意段位查看皮肤/武器详情
import app, { Scene } from '../core/App';
import CFG from '../core/Config';
import store from '../core/Store';
import { draw } from '../render/Draw';
import { Painter } from '../render/Painter';
import { Button, glassCard, coinIcon, stars, rankBadge, tag } from '../ui/UI';

class RankInfoScene implements Scene {
  t = 0;
  detail = -1;
  btnBack!: Button;
  btnClose!: Button;

  layout(): void {
    this.btnBack = new Button({
      x: 18, y: 24, w: 40, h: 40, r: 20, shape: 'circle', label: '←', size: 18,
      color: 'rgba(255,255,255,0.42)', color2: 'rgba(255,255,255,0.18)',
      border: 'rgba(255,255,255,0.8)',
    });
    this.btnClose = new Button({
      x: 127, y: 500, w: 121, h: 36, r: 18, label: '关 闭', size: 13,
      color: '#ffc14d', color2: '#ff6f2e',
    });
  }

  enter(): void {
    this.t = 0;
    this.detail = -1;
    this.layout();
  }

  update(dt: number): void {
    this.t += dt;
    [this.btnBack, this.btnClose].forEach((b) => {
      if (b && b.press > 0) b.press -= dt;
    });
  }

  rowY(i: number): number {
    return 166 + i * 42;
  }

  rankIndexAt(i: number): number {
    return CFG.MAX_RANK - i;
  }

  onTouchStart(x: number, y: number): void {
    if (this.detail >= 0) {
      if (this.btnClose.hit(x, y)) {
        this.btnClose.press = 0.2;
        this.detail = -1;
        return;
      }
      if (x < 32 || x > 343 || y < 116 || y > 540) this.detail = -1;
      return;
    }
    if (this.btnBack.hit(x, y)) {
      this.btnBack.press = 0.2;
      app.setScene('start');
      return;
    }
    for (let i = 0; i <= CFG.MAX_RANK; i++) {
      const ry = this.rowY(i);
      if (x >= 18 && x <= 357 && y >= ry && y <= ry + 39) {
        this.detail = this.rankIndexAt(i);
        return;
      }
    }
  }

  renderHero(p: Painter): void {
    const st = store.state;
    const rank = store.rank();
    glassCard(p, 18, 76, 339, 80, 22, {
      fill: 'rgba(9,52,120,0.46)', border: 'rgba(255,255,255,0.72)', hlAlpha: 0.14,
    });

    rankBadge(p, 54, 116, 24, st.rankIndex, rank.name);

    p.text('当前段位', 90, 96, { size: 9, regular: true, color: 'rgba(255,255,255,0.78)' });
    p.text(rank.name, 90, 115, { size: 19, color: '#fff7d9' });
    stars(p, 90, 136, st.stars, CFG.RANK_STARS, 6, 16, '#ffd166', 'rgba(255,255,255,0.3)');

    p.text(st.rankIndex < CFG.MAX_RANK
      ? '再赢 ' + (CFG.RANK_STARS - st.stars) + ' 场即可升段'
      : '已达最高段位', 342, 96, {
      size: 9, align: 'right', regular: true, color: 'rgba(255,255,255,0.85)',
    });
    p.text('皮肤 ' + st.skins.length + '/' + CFG.RANKS.length +
      ' · 武器 ' + st.weapons.length + '/' + CFG.RANKS.length, 342, 116, {
      size: 9.5, align: 'right', color: 'rgba(255,255,255,0.9)',
    });
    coinIcon(p, 300, 140, 8);
    p.text(String(st.coins), 314, 140, { size: 11, color: '#fff3c4' });
  }

  renderRow(p: Painter, i: number): void {
    const rankIndex = this.rankIndexAt(i);
    const rank = CFG.RANKS[rankIndex];
    const st = store.state;
    const x = 18;
    const y = this.rowY(i);
    const w = 339;
    const h = 39;
    const cy = y + h / 2;
    const current = rankIndex === st.rankIndex;
    const unlocked = rankIndex <= st.rankIndex;
    const ownsSkin = st.skins.indexOf(rankIndex) >= 0;
    const ownsWeapon = st.weapons.indexOf(rankIndex) >= 0;
    const owned = ownsSkin && ownsWeapon;

    let fill = 'rgba(10,44,100,0.36)';
    let border = 'rgba(255,255,255,0.26)';
    if (current) {
      fill = 'rgba(255,209,102,0.24)';
      border = 'rgba(255,229,150,0.9)';
    } else if (owned) {
      fill = 'rgba(16,84,150,0.42)';
      border = 'rgba(255,255,255,0.55)';
    } else if (unlocked) {
      fill = 'rgba(12,58,124,0.40)';
      border = 'rgba(255,255,255,0.38)';
    }

    p.fillRR(x, y, w, h, 17, fill);
    p.strokeRR(x, y, w, h, 17, border, current ? 2.2 : 1.2);

    p.save();
    if (!unlocked) p.setAlpha(0.55);
    p.circle(42, cy, 12, 'rgba(8,30,70,0.7)');
    p.circleStroke(42, cy, 12, rank.tag, 2.4);
    p.circle(42, cy, 5, rank.tag);
    p.restore();

    p.text(rank.name, 62, cy - 6.5, {
      size: 13, color: unlocked ? '#ffffff' : 'rgba(255,255,255,0.65)',
      stroke: 'rgba(6,32,76,0.5)', strokeWidth: 2.5,
    });
    p.text(rank.skinName + ' · ' + rank.weapon.name, 62, cy + 8, {
      size: 8.5, regular: true, color: 'rgba(255,255,255,0.62)',
    });

    if (current) {
      tag(p, 340, cy - 8, '当前段位', 'rgba(255,214,102,0.95)', {
        align: 'right', size: 8, h: 16, fill: 'rgba(90,58,10,0.45)',
      });
    } else if (owned) {
      tag(p, 340, cy - 8, '已集齐', 'rgba(140,245,190,0.95)', {
        align: 'right', size: 8, h: 16, fill: 'rgba(8,70,60,0.4)',
      });
    } else if (unlocked) {
      tag(p, 340, cy - 8, '可挑战', 'rgba(190,226,255,0.95)', {
        align: 'right', size: 8, h: 16, fill: 'rgba(10,46,96,0.4)',
      });
    } else {
      tag(p, 340, cy - 8, '未解锁', 'rgba(255,255,255,0.55)', {
        align: 'right', size: 8, h: 16, fill: 'rgba(10,36,80,0.4)',
      });
    }
  }

  renderDetail(p: Painter, time: number): void {
    const idx = this.detail;
    const rank = CFG.RANKS[idx];
    if (!rank) {
      this.detail = -1;
      return;
    }
    const st = store.state;
    const unlocked = idx <= st.rankIndex;
    const ownsSkin = st.skins.indexOf(idx) >= 0;
    const ownsWeapon = st.weapons.indexOf(idx) >= 0;

    p.rect(0, 0, 375, 667, 'rgba(4,20,48,0.74)');
    glassCard(p, 32, 116, 311, 424, 26, {
      fill: 'rgba(10,46,100,0.95)', border: 'rgba(255,255,255,0.6)', hlAlpha: 0.1,
    });

    rankBadge(p, 187, 156, 24, idx, rank.name);

    p.text(rank.name, 187, 196, {
      size: 20, align: 'center', color: '#fff7d9',
      stroke: 'rgba(6,28,66,0.6)', strokeWidth: 4,
    });
    p.text(rank.skinName + '  ·  ' + rank.weapon.name, 187, 218, {
      size: 10, align: 'center', color: 'rgba(255,255,255,0.85)',
    });

    draw.drawStage(p, 187, 404, 92, 17, rank.tag, time);
    p.save();
    p.translate(187, 404);
    p.scale(1.18, 1.18);
    draw.drawFighter(p, {
      x: 0, y: 0, facing: 1, state: 'idle', stateT: 0, dur: 0, seed: 3,
      skin: rank.skin, weapon: rank.weapon, charId: st.charId,
      rankIndex: idx, flash: 0, hideShadow: true,
    }, time);
    p.restore();

    p.text('装备皮肤：生命 +' + ((idx + 1) * 9) + '　　装备武器：攻击 +' + ((idx + 1) * 1.8).toFixed(1), 187, 428, {
      size: 9, align: 'center', regular: true, color: 'rgba(255,255,255,0.82)',
    });
    p.text(ownsSkin ? '皮肤已获得' : '皮肤未获得', 187, 448, {
      size: 9, align: 'center', color: ownsSkin ? '#8cf5be' : 'rgba(255,255,255,0.5)',
    });
    p.text(ownsWeapon ? '武器已获得' : '武器未获得', 187, 466, {
      size: 9, align: 'center', color: ownsWeapon ? '#8cf5be' : 'rgba(255,255,255,0.5)',
    });
    p.text(unlocked ? '挑战该段位对手，胜利可夺取对应装备' : '达到该段位后即可挑战其对手', 187, 482, {
      size: 9, align: 'center', regular: true, color: 'rgba(255,255,255,0.62)',
    });

    this.btnClose.draw(p);
  }

  render(p: Painter, time: number): void {
    draw.drawLobbyBg(p, app.vb, time, store.rank().tag);

    this.btnBack.draw(p);
    p.text('段 位 介 绍', 187, 40, {
      size: 24, align: 'center', color: '#ffffff',
      stroke: 'rgba(8,46,112,0.9)', strokeWidth: 6,
    });
    p.text('每个段位 ' + CFG.RANK_STARS + ' 颗星 · 满星晋级 · 胜利夺取对手装备', 187, 62, {
      size: 9, align: 'center', regular: true, color: 'rgba(255,255,255,0.9)',
      stroke: 'rgba(8,46,112,0.5)', strokeWidth: 3,
    });

    this.renderHero(p);

    for (let i = 0; i <= CFG.MAX_RANK; i++) this.renderRow(p, i);

    p.text('点击任意段位，查看该段位的皮肤与武器', 187, 645, {
      size: 8.5, align: 'center', regular: true, color: 'rgba(255,255,255,0.8)',
    });

    if (this.detail >= 0) this.renderDetail(p, time);
  }
}

export const rankInfoScene = new RankInfoScene();
export default rankInfoScene;
