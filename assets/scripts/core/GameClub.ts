// 游戏圈入口：微信小游戏原生「游戏圈」按钮封装
// 前置条件：小游戏已发布上线，并在 mp.weixin.qq.com「功能 → 游戏圈」开通；
// 未开通 / 非微信环境时 createGameClubButton 不可用，这里全部静默降级，不影响游戏。
let btn: any = null;
let inited = false;

/** 初始化游戏圈按钮（只在菜单 / 暂停界面显示，避免挡摇杆与战斗按钮） */
export function initGameClub(): void {
  if (inited) return;
  inited = true;
  try {
    const wx = (globalThis as any).wx;
    if (!wx || typeof wx.createGameClubButton !== 'function') return;
    const info = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null;
    const w = (info && info.windowWidth) || 375;
    const h = (info && info.windowHeight) || 667;
    const size = 40;
    btn = wx.createGameClubButton({
      icon: 'green',
      style: {
        left: Math.round(w * 0.03),
        top: Math.round(h - size - 26),
        width: size,
        height: size,
      },
    });
    if (btn && btn.hide) btn.hide();
  } catch (e) {
    console.warn('[gameclub] init failed', e);
    btn = null;
  }
}

/** 显示 / 隐藏游戏圈按钮（未初始化或平台不支持时为空操作） */
export function setGameClubVisible(v: boolean): void {
  if (!btn) return;
  try {
    if (v) btn.show();
    else btn.hide();
  } catch (e) {
    /* 忽略：按钮实例失效不影响游戏 */
  }
}
