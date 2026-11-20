// 微信登录、云开发排行榜（未配置云环境时自动降级为本地榜）
import CFG from './Config';
import store from './Store';

let cloudReady = false;
let initDone = false;

const SEED = [
  { name: '隔壁老汪', rankIndex: 10, stars: 1, charId: 'dog' },
  { name: '橘座大人', rankIndex: 10, stars: 0, charId: 'cat' },
  { name: '芝士汪汪', rankIndex: 9, stars: 1, charId: 'dog' },
  { name: '奶盖拳王', rankIndex: 9, stars: 0, charId: 'cat' },
  { name: '布丁守护者', rankIndex: 8, stars: 1, charId: 'dog' },
  { name: '小鱼干冲鸭', rankIndex: 8, stars: 0, charId: 'cat' },
  { name: '年糕不认输', rankIndex: 7, stars: 1, charId: 'cat' },
  { name: '汤圆大魔王', rankIndex: 7, stars: 0, charId: 'dog' },
  { name: '喵喵拳', rankIndex: 6, stars: 1, charId: 'cat' },
  { name: '肉松队长', rankIndex: 5, stars: 1, charId: 'dog' },
  { name: '可乐小霸王', rankIndex: 4, stars: 1, charId: 'cat' },
  { name: '雪球出击', rankIndex: 3, stars: 1, charId: 'dog' },
  { name: '绿豆战士', rankIndex: 3, stars: 0, charId: 'cat' },
  { name: '麻薯小队长', rankIndex: 2, stars: 1, charId: 'dog' },
  { name: '芋圆不爱输', rankIndex: 1, stars: 1, charId: 'cat' },
  { name: '哈吉米粉丝', rankIndex: 1, stars: 0, charId: 'dog' },
];

const wxOf = (): any => (globalThis as any).wx;

function scoreOf(r: any): number {
  return (r.rankIndex || 0) * 100 + (r.stars || 0) * 12;
}

function init(): boolean {
  if (initDone) return cloudReady;
  initDone = true;
  if (!CFG.CLOUD_ENV) return false;
  try {
    const wx = wxOf();
    if (!wx || !wx.cloud) return false;
    wx.cloud.init({ env: CFG.CLOUD_ENV, traceUser: true });
    cloudReady = true;
  } catch (e) {
    console.warn('[cloud] init failed', e);
    cloudReady = false;
  }
  return cloudReady;
}

function isCloudReady(): boolean {
  return cloudReady;
}

function getStorage(key: string, fallback: any): any {
  try {
    const wx = wxOf();
    if (wx && wx.getStorageSync) {
      const v = wx.getStorageSync(key);
      return v || fallback;
    }
    const ls = (globalThis as any).localStorage;
    if (ls) {
      const raw = ls.getItem('cocos_' + key);
      return raw ? JSON.parse(raw) : fallback;
    }
    return fallback;
  } catch (e) {
    return fallback;
  }
}

function setStorage(key: string, value: any): void {
  try {
    const wx = wxOf();
    if (wx && wx.setStorageSync) {
      wx.setStorageSync(key, value);
      return;
    }
    const ls = (globalThis as any).localStorage;
    if (ls) ls.setItem('cocos_' + key, JSON.stringify(value));
  } catch (e) {
    // 忽略
  }
}

function fetchProfile(): Promise<{ nickName: string; avatarUrl: string }> {
  return new Promise((resolve) => {
    const finish = (nickName?: string, avatarUrl?: string) => resolve({ nickName: nickName || '', avatarUrl: avatarUrl || '' });
    try {
      const wx = wxOf();
      if (wx && typeof wx.getUserProfile === 'function') {
        wx.getUserProfile({
          desc: '用于在排行榜展示昵称与头像',
          success: (res: any) => finish(res.userInfo && res.userInfo.nickName, res.userInfo && res.userInfo.avatarUrl),
          fail: () => finish('', ''),
        });
      } else if (wx && typeof wx.getUserInfo === 'function') {
        wx.getUserInfo({
          success: (res: any) => finish(res.userInfo && res.userInfo.nickName, res.userInfo && res.userInfo.avatarUrl),
          fail: () => finish('', ''),
        });
      } else {
        finish('', '');
      }
    } catch (e) {
      finish('', '');
    }
  });
}

function login(): Promise<any> {
  init();
  return fetchProfile().then((info) => {
    if (info.nickName) {
      store.state.name = info.nickName;
      store.state.avatar = info.avatarUrl;
      store.save();
    }
    if (!cloudReady) {
      return { ok: true, cloud: false, name: store.state.name };
    }
    return new Promise((resolve) => {
      wxOf().cloud.callFunction({
        name: 'login',
        success: (res: any) => {
          if (res && res.result && res.result.openid) {
            store.state.openid = res.result.openid;
            store.save();
          }
          resolve({ ok: true, cloud: true, name: store.state.name, openid: store.state.openid });
        },
        fail: (err: any) => {
          console.warn('[cloud] login failed', err);
          resolve({ ok: true, cloud: false, name: store.state.name });
        },
      });
    });
  });
}

function submitScore(): Promise<any> {
  const rec = {
    name: store.state.name,
    rankIndex: store.state.rankIndex,
    stars: store.state.stars,
    charId: store.state.charId,
    score: scoreOf(store.state),
  };
  saveLocal(rec);
  if (!cloudReady) return Promise.resolve({ local: true });
  return new Promise((resolve) => {
    wxOf().cloud.callFunction({
      name: 'submitScore',
      data: rec,
      success: (res: any) => resolve((res && res.result) || { ok: true }),
      fail: (err: any) => {
        console.warn('[cloud] submit failed', err);
        resolve({ local: true, error: true });
      },
    });
  });
}

function saveLocal(rec: any): void {
  const prev = getStorage(CFG.BOARD_KEY, null);
  if (!prev || scoreOf(prev) < scoreOf(rec)) {
    setStorage(CFG.BOARD_KEY, rec);
  }
}

function localBoard(): any {
  const own = getStorage(CFG.BOARD_KEY, null);
  const list = SEED.slice().map((s) => ({
    name: s.name, rankIndex: s.rankIndex, stars: s.stars,
    charId: s.charId, score: scoreOf(s), isMe: false,
  }));
  if (own && own.name) {
    const idx = list.findIndex((it) => it.name === own.name);
    if (idx >= 0) list.splice(idx, 1);
    list.push({
      name: own.name, rankIndex: own.rankIndex, stars: own.stars,
      charId: own.charId, score: scoreOf(own), isMe: true,
    });
  }
  list.sort((a, b) => b.score - a.score);
  return { list: list.slice(0, 12), me: own || null, local: true };
}

function fetchRanking(): Promise<any> {
  if (!cloudReady) return Promise.resolve(localBoard());
  return new Promise((resolve) => {
    wxOf().cloud.callFunction({
      name: 'getRanking',
      data: { limit: 12 },
      success: (res: any) => {
        const data = (res && res.result) || {};
        const list = (data.list || []).map((it: any) => ({
          name: it.name || '神秘玩家',
          rankIndex: it.rankIndex | 0,
          stars: it.stars | 0,
          charId: it.charId || 'dog',
          score: it.score | 0,
          isMe: !!it.isMe,
        }));
        if (!list.length) {
          resolve(localBoard());
          return;
        }
        if (!list.some((it: any) => it.isMe)) {
          const me = list.find((it: any) => it.name === store.state.name);
          if (me) me.isMe = true;
        }
        resolve({ list, me: null, local: false });
      },
      fail: (err: any) => {
        console.warn('[cloud] ranking failed', err);
        resolve(localBoard());
      },
    });
  });
}

export default { init, isCloudReady, login, submitScore, fetchRanking };
