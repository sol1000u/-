// 激励视频广告封装：AdService（Promise 接口，双模式）+ 旧版回调接口
import CFG from './Config';

export type AdScene = 'legend' | 'revive' | 'chest' | 'equip' | 'skin' | 'bag' | 'map' | 'ult';

export interface AdResult {
  status: 'rewarded' | 'closed' | 'unavailable'; // 看完 / 中途关闭 / 广告不可用
  scene: AdScene;
  mock: boolean;                                  // 是否为模拟广告
}

/** 模拟广告时长（秒） */
export const AD_MOCK_SECONDS = 3;
/** 大招广告时长（秒）：看完解锁 3 次大招 */
export const AD_MOCK_SECONDS_ULT = 6;
/** 真实广告超时兜底（毫秒） */
export const AD_TIMEOUT_MS = 20000;

const instances = new Map<string, any>();
let busy = false;
let legacyInstance: any = null;

function sceneUnitId(scene: AdScene): string {
  const map = (CFG as any).AD_SCENES;
  const id = map && map[scene];
  return typeof id === 'string' ? id : '';
}

function createAd(adUnitId: string): any {
  try {
    const wx = (globalThis as any).wx;
    if (!wx || typeof wx.createRewardedVideoAd !== 'function') return null;
    return wx.createRewardedVideoAd({ adUnitId });
  } catch (e) {
    console.warn('[ad] create failed', e);
    return null;
  }
}

/** 按 adUnitId 复用实例：所有场景共用同一个激励视频位，避免重复创建导致抢占/报错 */
function getSceneAd(scene: AdScene): any {
  const unitId = sceneUnitId(scene);
  if (!unitId) return null;
  const cached = instances.get(unitId);
  if (cached) return cached;
  const ad = createAd(unitId);
  if (ad) {
    instances.set(unitId, ad);
    try { ad.load && ad.load(); } catch (e) { /* 预加载失败忽略 */ }
  }
  return ad;
}

function getLegacyAd(): any {
  if (!CFG.AD_UNIT_ID) return null;
  if (legacyInstance) return legacyInstance;
  legacyInstance = createAd(CFG.AD_UNIT_ID);
  return legacyInstance;
}

/** 该场景是否走真实微信激励视频（false 时由玩法侧走自绘模拟广告） */
export function isReal(scene: AdScene): boolean {
  return !!getSceneAd(scene);
}

function playAd(ad: any): Promise<'rewarded' | 'closed' | 'unavailable'> {
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (status: 'rewarded' | 'closed' | 'unavailable') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer as any);
      try { ad.offClose(onClose); } catch (e) { /* 忽略 */ }
      try { ad.offError(onError); } catch (e) { /* 忽略 */ }
      resolve(status);
    };
    const onClose = (res: any) => finish(res && res.isEnded ? 'rewarded' : 'closed');
    const onError = (err: any) => {
      console.warn('[ad] error', err);
      finish('unavailable');
    };
    ad.onClose(onClose);
    ad.onError(onError);
    // 加载阶段超时兜底：20s 内没有成功展示则判定不可用，避免流程卡死
    timer = setTimeout(() => finish('unavailable'), AD_TIMEOUT_MS) as any;
    // 广告已开始播放：换成较长的播放保护，避免 20s 截断长广告导致不发奖
    const armPlayTimeout = () => {
      clearTimeout(timer as any);
      timer = setTimeout(() => finish('unavailable'), 120000) as any;
    };

    const show = () => {
      const p = ad.show();
      if (p && typeof p.then === 'function') {
        p.then(() => armPlayTimeout()).catch(() => reload());
      } else {
        armPlayTimeout();
      }
    };
    // show 失败 → load → show 重试一次
    const reload = () => {
      try {
        const lp = ad.load();
        if (lp && typeof lp.then === 'function') lp.then(() => show()).catch(() => finish('unavailable'));
        else show();
      } catch (e) {
        finish('unavailable');
      }
    };
    try { show(); } catch (e) { reload(); }
  });
}

/** 真实广告（调用方需先 isReal(scene) 为 true）；失败重试 1 次，20s 超时兜底 */
export function showReal(scene: AdScene): Promise<AdResult> {
  const ad = getSceneAd(scene);
  if (!ad) return Promise.resolve({ status: 'unavailable', scene, mock: false });
  if (busy) return Promise.resolve({ status: 'unavailable', scene, mock: false });
  busy = true;
  return playAd(ad).then((status) => {
    busy = false;
    return { status, scene, mock: false } as AdResult;
  });
}

export const AdService = { isReal, showRewarded: showReal, showReal, AD_MOCK_SECONDS, AD_TIMEOUT_MS };

// ---------------- 旧版接口（StartScene 等老场景使用，保持兼容） ----------------

function isAvailable(): boolean {
  return !!getLegacyAd();
}

// 回调状态：rewarded（看完）/ closed（中途关闭）/ unavailable（广告不可用）
function showRewardedLegacy(onResult: (status: string) => void): void {
  if (busy) return;
  const ad = getLegacyAd();
  if (!ad) {
    onResult('unavailable');
    return;
  }
  busy = true;
  playAd(ad).then((status) => {
    busy = false;
    onResult(status);
  });
}

export default { isAvailable, showRewarded: showRewardedLegacy };

// ---------------- 插屏广告（对局结算 / 返回主页，低频自适应） ----------------

/**
 * 插屏最小间隔（毫秒）：开局约 150s（中度频率，整体偏低），
 * 随累计游玩时长线性收紧，10 分钟时达到 75s（最高频率），之后维持。
 */
export function interstitialIntervalMs(playTimeSec: number): number {
  const MEDIUM = 150000;
  const HIGH = 75000;
  const RAMP = 600; // 10 分钟到达最高频率
  const t = Math.max(0, Math.min(playTimeSec, RAMP));
  return Math.round(MEDIUM - (MEDIUM - HIGH) * (t / RAMP));
}

let interstitialAd: any = null;
let interstitialBusy = false;
/** 首次插屏也遵守间隔：启动时刻作为基线，避免开局立刻弹广告 */
let lastInterstitialTs = Date.now();
let interstitialTimer: any = 0;
/** 插屏展示前后短暂隐藏原生模板广告，避免两个广告组件互相抢占/重叠 */
let nativeBlockUntil = 0;

function getInterstitial(): any {
  if (interstitialAd) return interstitialAd;
  const unitId = (CFG as any).INTERSTITIAL_UNIT_ID as string;
  if (!unitId) return null;
  try {
    const wx = (globalThis as any).wx;
    if (!wx || typeof wx.createInterstitialAd !== 'function') return null;
    interstitialAd = wx.createInterstitialAd({ adUnitId: unitId });
    if (interstitialAd && interstitialAd.onError) {
      interstitialAd.onError((e: any) => console.warn('[ad] interstitial error', e));
    }
    // 预加载：缩短展示等待，避免 show 时才加载造成卡顿
    try { interstitialAd.load && interstitialAd.load(); } catch (e) { /* 忽略 */ }
    return interstitialAd;
  } catch (e) {
    console.warn('[ad] interstitial create failed', e);
    return null;
  }
}

function tryShowInterstitial(playTimeSec: number): boolean {
  if (interstitialBusy || busy) return false; // 与激励视频互斥
  const now = Date.now();
  if (now - lastInterstitialTs < interstitialIntervalMs(playTimeSec)) return false;
  const ad = getInterstitial();
  if (!ad) return false;
  // 先记录时间戳：即使展示失败也按频率节流，避免失败后频繁重试
  lastInterstitialTs = now;
  interstitialBusy = true;
  // 插屏会全屏覆盖，先隐藏原生模板广告并短暂禁用它
  if (nativeAd && nativeVisible) {
    try { nativeAd.hide && nativeAd.hide(); } catch (e) { /* 忽略 */ }
    nativeVisible = false;
  }
  nativeBlockUntil = now + 6000;
  try {
    const p = ad.show();
    if (p && typeof p.then === 'function') {
      p.then(() => { interstitialBusy = false; }).catch(() => {
        interstitialBusy = false;
        try { ad.load && ad.load(); } catch (e) { /* 忽略 */ }
      });
    } else {
      interstitialBusy = false;
    }
  } catch (e) {
    interstitialBusy = false;
    try { ad.load && ad.load(); } catch (e2) { /* 忽略 */ }
  }
  return true;
}

/**
 * 延迟展示插屏广告（默认 1.8s）。任何失败静默跳过，绝不阻塞玩法。
 * canShow 在真正展示前再次校验（例如玩家已在 1.8s 内复活回到战斗，则跳过）。
 */
export function showInterstitialLater(playTimeSec: number, delayMs = 1800, canShow?: () => boolean): void {
  if (interstitialTimer || busy) return;
  const delay = Math.max(1000, Math.min(delayMs, 2000)); // 需求：延迟 1.5~2s
  interstitialTimer = setTimeout(() => {
    interstitialTimer = 0;
    if (canShow && !canShow()) return;
    tryShowInterstitial(playTimeSec);
  }, delay) as any;
}

// ---------------- 原生模板广告（主页菜单） ----------------

let nativeAd: any = null;
let nativeTried = false;
let nativeVisible = false;

function winSize(): { w: number; h: number } {
  try {
    const wx = (globalThis as any).wx;
    const info = wx && (wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : null));
    if (info) {
      return {
        w: info.windowWidth || info.screenWidth || 375,
        h: info.windowHeight || info.screenHeight || 667,
      };
    }
  } catch (e) { /* 忽略 */ }
  return { w: 375, h: 667 };
}

function getNative(): any {
  if (nativeAd) return nativeAd;
  if (nativeTried) return null;
  nativeTried = true;
  const unitId = (CFG as any).NATIVE_UNIT_ID as string;
  if (!unitId) return null;
  try {
    const wx = (globalThis as any).wx;
    if (!wx || typeof wx.createCustomAd !== 'function') return null;
    const sc = winSize();
    // 底居中，宽度按屏幕 80%（上限 320），估算高度避免遮挡底部提示
    const width = Math.min(320, Math.round(sc.w * 0.8));
    const estH = Math.round(width * 0.32);
    const style = { left: Math.round((sc.w - width) / 2), top: Math.max(0, sc.h - estH - 16), width };
    nativeAd = wx.createCustomAd({ adUnitId: unitId, style });
    if (nativeAd && nativeAd.onError) {
      nativeAd.onError((e: any) => {
        console.warn('[ad] native error', e);
        try { nativeAd.destroy && nativeAd.destroy(); } catch (e2) { /* 忽略 */ }
        nativeAd = null;
        nativeVisible = false;
      });
    }
    if (nativeAd && nativeAd.onHide) nativeAd.onHide(() => { nativeVisible = false; });
    // 预加载一次，避免菜单首次展示时白块
    try { nativeAd.load && nativeAd.load(); } catch (e) { /* 忽略 */ }
    return nativeAd;
  } catch (e) {
    console.warn('[ad] native create failed', e);
    return null;
  }
}

/** 控制原生模板广告显隐（仅主页可见，进入战斗立即隐藏，减少遮挡与渲染开销） */
export function setNativeAdVisible(visible: boolean): void {
  if (visible === nativeVisible) return; // 状态未变直接返回，避免每帧调用平台 API
  if (visible) {
    if (Date.now() < nativeBlockUntil) return; // 插屏刚展示过，暂缓原生广告
    const ad = getNative();
    if (!ad) return;
    try {
      const p = ad.show();
      if (p && typeof p.catch === 'function') p.catch(() => { /* 展示失败静默 */ });
      nativeVisible = true;
    } catch (e) { /* 忽略 */ }
  } else if (nativeAd) {
    try { nativeAd.hide && nativeAd.hide(); } catch (e) { /* 忽略 */ }
    nativeVisible = false;
  }
}

/** 启动预热：激励 / 插屏 / 原生模板都提前创建并 load，降低首次展示等待 */
export function preloadAds(): void {
  try { getSceneAd('equip'); } catch (e) { /* 忽略 */ }
  try { getInterstitial(); } catch (e) { /* 忽略 */ }
  try { getNative(); } catch (e) { /* 忽略 */ }
}

/** 释放广告资源（场景销毁 / 退出时调用，防止实例泄漏与后台播放） */
export function disposeAds(): void {
  if (interstitialTimer) {
    clearTimeout(interstitialTimer as any);
    interstitialTimer = 0;
  }
  busy = false;
  interstitialBusy = false;
  nativeBlockUntil = 0;
  lastInterstitialTs = Date.now();
  for (const ad of instances.values()) {
    try { ad.destroy && ad.destroy(); } catch (e) { /* 忽略 */ }
  }
  instances.clear();
  legacyInstance = null;
  if (interstitialAd) {
    try { interstitialAd.destroy && interstitialAd.destroy(); } catch (e) { /* 忽略 */ }
    interstitialAd = null;
  }
  if (nativeAd) {
    try { nativeAd.hide && nativeAd.hide(); } catch (e) { /* 忽略 */ }
    try { nativeAd.destroy && nativeAd.destroy(); } catch (e) { /* 忽略 */ }
    nativeAd = null;
  }
  nativeVisible = false;
}
