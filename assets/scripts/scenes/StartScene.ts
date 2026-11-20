// 开始页（竖屏大厅）：参考蛋仔派对风格——高饱和天蓝、白描边玻璃卡、中央大角色、底部橙色大按钮
import app, { Scene } from '../core/App';
import CFG from '../core/Config';
import store from '../core/Store';
import { draw } from '../render/Draw';
import { Painter } from '../render/Painter';
import {
  Button, glassCard, coinIcon, arrowButton, stars, rankBadge, tag, avatar, toast,
} from '../ui/UI';
import net from '../core/Net';
import ad from '../core/Ad';

class StartScene implements Scene {
  t = 0;
  toastMsg = '';
  toastT = 0;
  logging = false;
  adBusy = false;
  avatarImg: any = null;
  avatarUrl = '';
  swL = 0;
  swR = 0;
  rankCard = { x: 18, y: 480, w: 339, h: 52 };

  btnBattle!: Button;
  btnRank!: Button;
  btnAd!: Button;
  btnName!: Button;
  btnLogin!: Button;

  layout(): void {
    this.btnBattle = new Button({
      x: 18, y: 534, w: 339, h: 70, r: 35, label: '开 始 挑 战',
      sub: '挑战 ' + store.rank().name + ' 段位对手',
      size: 25, subSize: 11, color: '#ffc14d', color2: '#ff6f2e',
      border: 'rgba(255,255,255,0.9)',
    });
    this.btnRank = new Button({
      x: 18, y: 612, w: 107, h: 34, r: 17, label: '排 行 榜',
      size: 12, color: '#5b8cff', color2: '#3a63d8',
    });
    this.btnAd = new Button({
      x: 133, y: 612, w: 107, h: 34, r: 17, label: '看 广 告',
      size: 12, color: '#ff8ab5', color2: '#d34b83',
    });
    this.btnName = new Button({
      x: 248, y: 612, w: 107, h: 34, r: 17, label: '换 昵 称',
      size: 12, color: 'rgba(255,255,255,0.46)', color2: 'rgba(255,255,255,0.24)',
      border: 'rgba(255,255,255,0.8)',
    });
    this.btnLogin = new Button({
      x: 186, y: 24, w: 66, h: 27, r: 13,
      label: store.state.openid ? '已 登 录' : '微 信 登 录',
      size: 10, color: '#5fd39a', color2: '#2f9c66',
    });
  }

  enter(): void {
    this.layout();
    this.syncAvatar();
    this.toastT = 0;
  }

  syncAvatar(): void {
    const url = store.state.avatar;
    if (!url || url === this.avatarUrl) return;
    this.avatarUrl = url;
    try {
      const wx = (globalThis as any).wx;
      if (!wx || !wx.createImage) return;
      const img = wx.createImage();
      img.onload = () => { this.avatarImg = img; };
      img.onerror = () => { this.avatarImg = null; };
      img.src = url;
    } catch (e) {
      this.avatarImg = null;
    }
  }

  showToast(msg: string): void {
    this.toastMsg = msg;
    this.toastT = 2.4;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.toastT > 0) this.toastT -= dt;
    [this.btnBattle, this.btnRank, this.btnAd, this.btnName, this.btnLogin].forEach((b) => {
      if (b && b.press > 0) b.press -= dt;
    });
    if (this.swL > 0) this.swL -= dt;
    if (this.swR > 0) this.swR -= dt;
  }

  hitCircle(cx: number, cy: number, r: number, x: number, y: number): boolean {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  }

  switchChar(dir: number): void {
    const ids = CFG.CHARACTERS.map((c) => c.id);
    let i = ids.indexOf(store.state.charId);
    if (i < 0) i = 0;
    i = (i + dir + ids.length) % ids.length;
    store.selectChar(ids[i]);
  }

  onTouchStart(x: number, y: number): void {
    if (this.btnBattle.hit(x, y)) {
      this.btnBattle.press = 0.2;
      app.setScene('battle');
      return;
    }
    if (this.btnRank.hit(x, y)) {
      this.btnRank.press = 0.2;
      app.setScene('rank');
      return;
    }
    if (this.btnAd.hit(x, y)) {
      this.btnAd.press = 0.2;
      this.watchAd();
      return;
    }
    if (this.btnName.hit(x, y)) {
      this.btnName.press = 0.2;
      store.rerollName();
      this.showToast('新昵称：' + store.state.name);
      return;
    }
    if (this.btnLogin.hit(x, y)) {
      this.btnLogin.press = 0.2;
      this.doLogin();
      return;
    }
    if (this.hitCircle(34, 360, 22, x, y)) {
      this.swL = 0.16;
      this.switchChar(-1);
      return;
    }
    if (this.hitCircle(341, 360, 22, x, y)) {
      this.swR = 0.16;
      this.switchChar(1);
      return;
    }
    const c = this.rankCard;
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
      app.setScene('rankInfo');
    }
  }

  doLogin(): void {
    if (this.logging) return;
    this.logging = true;
    this.showToast('正在获取微信资料…');
    net.login().then((res: any) => {
      this.logging = false;
      this.syncAvatar();
      this.layout();
      if (res.cloud) this.showToast('登录成功，排行榜已云端同步');
      else this.showToast('已获取资料（未配置云环境，使用本地榜）');
    }).catch(() => {
      this.logging = false;
      this.showToast('登录失败，请稍后再试');
    });
  }

  watchAd(): void {
    if (this.adBusy) return;
    this.adBusy = true;
    this.showToast('正在加载激励视频…');
    ad.showRewarded((status: string) => {
      this.adBusy = false;
      if (status === 'rewarded') {
        const r = store.grantItem(1);
        this.showToast(store.describeReward(r));
      } else if (status === 'closed') {
        this.showToast('需要完整观看广告才能领取');
      } else {
        const r = store.grantItem(1);
        this.showToast('广告未就绪，已模拟发放：' + store.describeReward(r));
      }
      this.layout();
    });
  }

  renderTopBar(p: Painter): void {
    const st = store.state;
    const rank = store.rank();
    glassCard(p, 12, 10, 351, 56, 28);
    avatar(p, 46, 38, 18, this.avatarImg, st.name, store.char().color);

    const name = st.name.length > 7 ? st.name.slice(0, 7) + '…' : st.name;
    p.text(name, 72, 29, {
      size: 15, color: '#ffffff', stroke: 'rgba(8,44,110,0.65)', strokeWidth: 3,
    });
    tag(p, 72, 40, rank.name + ' · ' + st.stars + '/' + CFG.RANK_STARS + ' 星', rank.tag, {
      size: 9, h: 16, fill: 'rgba(6,34,84,0.42)',
    });

    this.btnLogin.draw(p);

    coinIcon(p, 264, 38, 9);
    p.text(String(st.coins), 280, 38, {
      size: 14, color: '#fff7d0', stroke: 'rgba(8,44,110,0.5)', strokeWidth: 3,
    });
  }

  renderStage(p: Painter, time: number): void {
    const st = store.state;
    const char = store.char();
    const bob = Math.sin(time * 2) * 3;

    draw.drawStage(p, 187, 420, 112, 22, char.color, time);

    p.save();
    p.translate(187, 420 + bob);
    p.scale(1.46, 1.46);
    p.glow(0, -72, 88, char.color, 0.12);
    draw.drawFighter(p, {
      x: 0, y: 0, facing: 1, state: 'idle', stateT: 0, dur: 0, seed: 2,
      skin: store.skin(), weapon: store.weapon(), charId: st.charId,
      rankIndex: st.rankIndex, flash: 0, hideShadow: true,
    }, time);
    p.restore();

    arrowButton(p, 34, 360, 19, -1, this.swL);
    arrowButton(p, 341, 360, 19, 1, this.swR);

    // 角色名字牌
    const w = 190;
    p.fillRR(187 - w / 2, 446, w, 26, 13, 'rgba(8,48,110,0.44)');
    p.strokeRR(187 - w / 2, 446, w, 26, 13, 'rgba(255,255,255,0.6)', 1.4);
    p.text(char.name + '  ·  ' + char.title, 187, 459, {
      size: 12, align: 'center', color: '#ffffff',
    });
  }

  renderRankCard(p: Painter): void {
    const st = store.state;
    const rank = store.rank();
    const c = this.rankCard;
    glassCard(p, c.x, c.y, c.w, c.h, 20, {
      fill: 'rgba(9,52,120,0.40)', border: 'rgba(255,255,255,0.72)', hlAlpha: 0.14,
    });

    rankBadge(p, 52, 506, 17, st.rankIndex, rank.name);

    p.text('当前段位', 78, 492, { size: 9, regular: true, color: 'rgba(255,255,255,0.78)' });
    p.text(rank.name, 78, 509, { size: 16, color: '#fff7d9' });
    stars(p, 78, 524, st.stars, CFG.RANK_STARS, 5.5, 15, '#ffd166', 'rgba(255,255,255,0.3)');

    p.text(st.rankIndex < CFG.MAX_RANK
      ? '再赢 ' + (CFG.RANK_STARS - st.stars) + ' 场升段'
      : '已达最高段位', 342, 492, {
      size: 9, align: 'right', regular: true, color: 'rgba(255,255,255,0.82)',
    });
    p.text('查看段位介绍 ›', 342, 518, { size: 10.5, align: 'right', color: '#ffe9a3' });
  }

  render(p: Painter, time: number): void {
    const char = store.char();
    draw.drawLobbyBg(p, app.vb, time, char.color);

    this.renderTopBar(p);

    // 标题
    p.text('狗 猫 格 斗', 187, 96, {
      size: 38, align: 'center', color: '#ffffff',
      stroke: 'rgba(8,46,112,0.9)', strokeWidth: 7,
    });
    p.text('DOG  vs  CAT  ·  王者之路', 187, 124, {
      size: 10.5, align: 'center', regular: true, color: 'rgba(255,255,255,0.95)',
      stroke: 'rgba(8,46,112,0.55)', strokeWidth: 3,
    });

    this.renderStage(p, time);
    this.renderRankCard(p);

    p.glow(187, 573, 200, '#ffb14c', 0.22);
    this.btnBattle.draw(p);
    this.btnRank.draw(p);
    this.btnAd.draw(p);
    this.btnName.draw(p);

    p.text('胜利夺取对手的段位装备 · 失败扣除本段位装备', 187, 657, {
      size: 8.5, align: 'center', regular: true, color: 'rgba(255,255,255,0.8)',
    });

    toast(p, this.toastMsg, this.toastT > 0 ? Math.min(1, this.toastT * 2) : 0, 210);
  }
}

export const startScene = new StartScene();
export default startScene;
