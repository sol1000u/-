/**
 * 微信小游戏分享模块：右上角菜单转发 / 分享朋友圈、游戏内主动转发、分享海报。
 * 非微信环境自动降级为空操作，不影响浏览器预览。
 */

type WxApi = any;

export interface ShareInfo {
  title: string;
  imageUrl?: string;
  query?: string;
}

let inited = false;
let infoGetter: (() => ShareInfo) | null = null;
let lastInfo: ShareInfo | null = null;

function getWx(): WxApi | null {
  const w = (globalThis as any).wx;
  return w && typeof w.showShareMenu === 'function' ? w : null;
}

function currentInfo(): ShareInfo {
  if (infoGetter) {
    try {
      const info = infoGetter();
      if (info && info.title) {
        lastInfo = info;
        return info;
      }
    } catch (e) { /* 忽略，回落到默认文案 */ }
  }
  return lastInfo || { title: '像素荒野寻宝｜方块世界挑战巨龙与泰坦', query: 'from=share' };
}

/** 开启右上角菜单的「转发」「分享到朋友圈」，并注册自定义分享卡片 */
export function initShare(getter?: () => ShareInfo): void {
  const wx = getWx();
  if (!wx) return;
  if (getter) infoGetter = getter;
  if (inited) return;
  inited = true;

  // menus 参数在部分基础库/模拟器上不被支持，会导致整次调用失败（转发菜单仍灰显）。
  // 失败时降级为不带 menus 的调用，至少保证「转发」可用。
  const enable = (menus?: string[]) => {
    try {
      const opt: any = { withShareTicket: true };
      if (menus) opt.menus = menus;
      opt.fail = (err: any) => {
        console.warn('[share] showShareMenu fail', err && err.errMsg);
        if (menus) enable(undefined);
      };
      wx.showShareMenu(opt);
    } catch (e) {
      console.warn('[share] showShareMenu throw', e);
      if (menus) {
        try { wx.showShareMenu({ withShareTicket: true }); } catch (e2) { /* 忽略 */ }
      }
    }
  };
  enable(['shareAppMessage', 'shareTimeline']);

  try {
    wx.onShareAppMessage(() => {
      const info = currentInfo();
      return { title: info.title, imageUrl: info.imageUrl, query: info.query || 'from=share' };
    });
  } catch (e) { /* 忽略 */ }

  try {
    wx.onShareTimeline(() => {
      const info = currentInfo();
      return { title: info.title, imageUrl: info.imageUrl, query: info.query || 'from=timeline' };
    });
  } catch (e) { /* 忽略 */ }
}

/** 主动转发给好友；返回是否唤起成功 */
export function shareToFriend(override?: Partial<ShareInfo>): boolean {
  const wx = getWx();
  if (!wx || typeof wx.shareAppMessage !== 'function') return false;
  const base = currentInfo();
  const info: ShareInfo = {
    title: override?.title || base.title,
    imageUrl: override?.imageUrl || base.imageUrl,
    query: override?.query || base.query || 'from=share',
  };
  try {
    wx.shareAppMessage({ title: info.title, imageUrl: info.imageUrl, query: info.query });
    return true;
  } catch (e) {
    return false;
  }
}

/** 小游戏不支持主动调起朋友圈，只能引导用户使用右上角菜单 */
export function canShareTimeline(): boolean {
  return !!getWx();
}

export type PosterResult = 'saved' | 'cancelled' | 'denied' | 'unsupported' | 'fail';

/**
 * 生成分享海报并保存到相册。
 * 首次调用 wx.createCanvas 会拿到主渲染画布，因此这里必须使用离屏画布。
 */
export function saveSharePoster(opts: {
  title: string;
  subtitle: string;
  lines: Array<{ label: string; value: string }>;
  footer: string;
}): Promise<PosterResult> {
  const wx = getWx();
  if (!wx || typeof wx.createOffscreenCanvas !== 'function' || typeof wx.canvasToTempFilePath !== 'function') {
    return Promise.resolve('unsupported');
  }

  return new Promise<PosterResult>((resolve) => {
    const W = 660;
    const H = 1000;
    let canvas: any = null;
    let ctx: any = null;
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: W, height: H });
      ctx = canvas.getContext('2d');
    } catch (e) {
      resolve('unsupported');
      return;
    }
    if (!ctx) {
      resolve('unsupported');
      return;
    }

    const draw = () => {
      try {
        // 深色渐变背景
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#101A2E');
        bg.addColorStop(0.55, '#1B2440');
        bg.addColorStop(1, '#0A0F1E');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // 顶部紫金光晕
        const glow = ctx.createRadialGradient(W / 2, 190, 20, W / 2, 190, 380);
        glow.addColorStop(0, 'rgba(124, 77, 255, 0.42)');
        glow.addColorStop(1, 'rgba(124, 77, 255, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, 600);

        // 金色描边
        ctx.strokeStyle = 'rgba(255, 213, 79, 0.55)';
        ctx.lineWidth = 3;
        ctx.strokeRect(24, 24, W - 48, H - 48);

        // 标题
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD54F';
        ctx.font = 'bold 54px sans-serif';
        ctx.fillText(opts.title, W / 2, 148);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.font = '26px sans-serif';
        ctx.fillText(opts.subtitle, W / 2, 200);

        // 分隔线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(90, 240);
        ctx.lineTo(W - 90, 240);
        ctx.stroke();

        // 战绩数据
        let y = 320;
        for (const line of opts.lines) {
          ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
          ctx.font = '30px sans-serif';
          ctx.fillText(line.label, 110, y);

          ctx.textAlign = 'right';
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 38px sans-serif';
          ctx.fillText(line.value, W - 110, y);
          y += 78;
        }

        // 底部引导
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 213, 79, 0.9)';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText(opts.footer, W / 2, H - 150);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '24px sans-serif';
        ctx.fillText('微信小游戏 · 搜索游戏名即可开玩', W / 2, H - 100);
      } catch (e) {
        resolve('fail');
        return;
      }

      wx.canvasToTempFilePath({
        canvas,
        x: 0,
        y: 0,
        width: W,
        height: H,
        destWidth: W,
        destHeight: H,
        success: (res: any) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => resolve('saved'),
            fail: (err: any) => {
              const msg = String((err && err.errMsg) || '');
              if (msg.indexOf('auth') >= 0 || msg.indexOf('authorize') >= 0) resolve('denied');
              else if (msg.indexOf('cancel') >= 0) resolve('cancelled');
              else resolve('fail');
            },
          });
        },
        fail: () => resolve('fail'),
      });
    };

    // 部分基础库需要下一帧再绘制
    if (typeof (globalThis as any).requestAnimationFrame === 'function') {
      (globalThis as any).requestAnimationFrame(() => draw());
    } else {
      draw();
    }
  });
}
