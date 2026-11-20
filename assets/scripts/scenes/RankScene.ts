// 排行榜：优先云开发数据，未配置时展示本地榜
import app, { Scene } from '../core/App';
import CFG from '../core/Config';
import store from '../core/Store';
import { draw } from '../render/Draw';
import { Painter } from '../render/Painter';
import { Button, avatar, tag } from '../ui/UI';
import net from '../core/Net';

class RankScene implements Scene {
  t = 0;
  list: any[] = [];
  loading = true;
  local = true;
  btnBack!: Button;
  btnRefresh!: Button;

  enter(): void {
    this.t = 0;
    this.layout();
    this.load();
  }

  layout(): void {
    this.btnBack = new Button({
      x: 18, y: 40, w: 44, h: 44, r: 22, shape: 'circle', label: '←', size: 20,
      color: 'rgba(96,126,190,0.85)', color2: 'rgba(46,64,108,0.9)',
    });
    this.btnRefresh = new Button({
      x: 313, y: 40, w: 44, h: 44, r: 22, shape: 'circle', label: '刷', size: 14,
      color: 'rgba(180,140,255,0.85)', color2: 'rgba(107,69,208,0.9)',
    });
  }

  load(): void {
    this.loading = true;
    net.fetchRanking().then((res: any) => {
      this.list = res.list || [];
      this.local = !!res.local;
      this.loading = false;
    }).catch(() => {
      this.loading = false;
      this.list = [];
    });
  }

  update(dt: number): void {
    this.t += dt;
    [this.btnBack, this.btnRefresh].forEach((b) => {
      if (b && b.press > 0) b.press -= dt;
    });
  }

  onTouchStart(x: number, y: number): void {
    if (this.btnBack.hit(x, y)) {
      this.btnBack.press = 0.2;
      app.setScene('start');
    } else if (this.btnRefresh.hit(x, y)) {
      this.btnRefresh.press = 0.2;
      this.load();
    }
  }

  renderRow(p: Painter, y: number, item: any, index: number): void {
    const x = 18;
    const w = 339;
    const h = 38;
    const cy = y + h / 2;

    if (item.isMe) {
      p.vGrad(x, y, w, h, ['rgba(255,209,102,0.28)', 'rgba(255,209,102,0.10)'], 4);
    } else {
      p.vGrad(x, y, w, h, ['rgba(28,19,44,0.62)', 'rgba(28,19,44,0.42)'], 4);
    }
    p.strokeRR(x, y, w, h, 14, item.isMe ? 'rgba(255,209,102,0.75)' : 'rgba(255,255,255,0.10)', item.isMe ? 2 : 1);

    const topColors = ['#ffd166', '#d9e6f2', '#e0a06a'];
    const idxColor = index < 3 ? topColors[index] : 'rgba(255,255,255,0.55)';
    p.text(String(index + 1), x + 18, cy, { size: 13, align: 'center', color: idxColor });

    const char = CFG.CHARACTERS.find((c) => c.id === item.charId) || CFG.CHARACTERS[0];
    avatar(p, x + 46, cy, 14, null, item.name, char.color);

    const nm = item.name.length > 8 ? item.name.slice(0, 8) + '…' : item.name;
    p.text(nm, x + 68, cy - 7, { size: 12, color: item.isMe ? '#ffe9a3' : '#ffffff' });
    const rankCfg = CFG.RANKS[item.rankIndex] || CFG.RANKS[0];
    p.text(rankCfg.name + ' · ' + item.stars + '/2 星', x + 68, cy + 8, {
      size: 9, regular: true, color: 'rgba(255,255,255,0.6)',
    });

    p.text(String(item.score) + ' 分', x + w - 14, cy, { size: 13, align: 'right', color: '#ffd166' });

    if (item.isMe) {
      tag(p, x + w - 14, cy - 22, '我', 'rgba(255,209,102,0.9)', { align: 'right', size: 8, h: 15 });
    }
  }

  render(p: Painter, time: number): void {
    const vb = app.vb;
    draw.drawMenuBg(p, vb, time, store.rank().tag);

    p.text('排 行 榜', 187, 60, {
      size: 26, align: 'center', color: '#ffffff',
      stroke: 'rgba(20,12,34,0.55)', strokeWidth: 5,
    });
    p.text(this.local ? '本地榜单 · 配置云环境后自动切换云端' : '云端榜单 · 实时同步', 187, 86, {
      size: 9, align: 'center', regular: true, color: 'rgba(255,255,255,0.55)',
    });

    this.btnBack.draw(p);
    this.btnRefresh.draw(p);

    if (this.loading) {
      p.text('排 行 榜 加 载 中 …', 187, 340, { size: 13, align: 'center', color: 'rgba(255,255,255,0.6)' });
    } else if (!this.list.length) {
      p.text('暂无排行数据，先去打一场吧', 187, 340, { size: 13, align: 'center', color: 'rgba(255,255,255,0.6)' });
    } else {
      const startY = 108;
      for (let i = 0; i < this.list.length; i++) {
        this.renderRow(p, startY + i * 41, this.list[i], i);
      }
    }

    p.text('按段位积分排序 · 头像来自微信资料', 187, 626, {
      size: 9, align: 'center', regular: true, color: 'rgba(255,255,255,0.4)',
    });
  }
}

export const rankScene = new RankScene();
export default rankScene;
