// 存档 / 段位 / 装备与奖励结算（Cocos 版，存储层兼容微信小游戏与浏览器预览）
import CFG, { SkinCfg, WeaponCfg, RankCfg, CharCfg } from './Config';

const PREFIX = ['哈吉米', '橘座', '奶盖', '芝士', '布丁', '豌豆', '芝麻', '年糕', '团子', '可乐',
  '肉松', '汤圆', '绿豆', '芋圆', '麻薯', '旺财', '雪球', '豆包', '小鱼干', '猫爪'];
const SUFFIX = ['战士', '拳王', '队长', '大魔王', '小霸王', '守护者', '冲鸭', '出击', '不认输', '喵喵拳'];

export interface PlayerState {
  name: string;
  avatar: string;
  openid: string;
  charId: string;
  rankIndex: number;
  stars: number;
  skins: number[];
  weapons: number[];
  coins: number;
  battles: number;
  wins: number;
}

export interface Reward {
  type: 'coin' | 'skin' | 'weapon' | 'star';
  rankIndex: number;
  name?: string;
  coins?: number;
}

const DEFAULT_STATE: PlayerState = {
  name: '', avatar: '', openid: '', charId: 'dog',
  rankIndex: 0, stars: 0, skins: [], weapons: [],
  coins: 0, battles: 0, wins: 0,
};

function randomName(): string {
  return PREFIX[Math.floor(Math.random() * PREFIX.length)] +
    SUFFIX[Math.floor(Math.random() * SUFFIX.length)];
}

function storageGet(key: string): any {
  try {
    const wx = (globalThis as any).wx;
    if (wx && wx.getStorageSync) {
      const v = wx.getStorageSync(key);
      return v || null;
    }
    const ls = (globalThis as any).localStorage;
    if (ls) {
      const raw = ls.getItem('cocos_' + key);
      return raw ? JSON.parse(raw) : null;
    }
  } catch (e) {
    return null;
  }
  return null;
}

function storageSet(key: string, value: any): void {
  try {
    const wx = (globalThis as any).wx;
    if (wx && wx.setStorageSync) {
      wx.setStorageSync(key, value);
      return;
    }
    const ls = (globalThis as any).localStorage;
    if (ls) ls.setItem('cocos_' + key, JSON.stringify(value));
  } catch (e) {
    // 存储失败时忽略，游戏仍可继续运行
  }
}

class Store {
  state: PlayerState = Object.assign({}, DEFAULT_STATE);

  load(): void {
    const raw = storageGet(CFG.SAVE_KEY);
    if (raw && typeof raw === 'object') {
      this.state = Object.assign({}, DEFAULT_STATE, raw);
      if (!Array.isArray(this.state.skins)) this.state.skins = [];
      if (!Array.isArray(this.state.weapons)) this.state.weapons = [];
      this.state.rankIndex = Math.max(0, Math.min(CFG.MAX_RANK, this.state.rankIndex | 0));
      this.state.stars = Math.max(0, Math.min(CFG.RANK_STARS - 1, this.state.stars | 0));
    }
    if (!this.state.name) this.state.name = randomName();
    this.save();
  }

  save(): void {
    storageSet(CFG.SAVE_KEY, this.state);
  }

  rerollName(): string {
    this.state.name = randomName();
    this.save();
    return this.state.name;
  }

  char(): CharCfg {
    return CFG.CHARACTERS.find((c) => c.id === this.state.charId) || CFG.CHARACTERS[0];
  }

  selectChar(id: string): void {
    if (CFG.CHARACTERS.some((c) => c.id === id)) {
      this.state.charId = id;
      this.save();
    }
  }

  rank(): RankCfg {
    return CFG.RANKS[this.state.rankIndex];
  }

  equippedSkinIndex(): number {
    return this.state.skins.length ? Math.max.apply(null, this.state.skins as any) : -1;
  }

  equippedWeaponIndex(): number {
    return this.state.weapons.length ? Math.max.apply(null, this.state.weapons as any) : -1;
  }

  skin(): SkinCfg {
    const idx = this.equippedSkinIndex();
    if (idx >= 0) return CFG.RANKS[idx].skin;
    return CFG.BASE_SKINS[this.state.charId] || CFG.BASE_SKINS.dog;
  }

  weapon(): WeaponCfg {
    const idx = this.equippedWeaponIndex();
    if (idx >= 0) return CFG.RANKS[idx].weapon;
    return CFG.BASE_WEAPON;
  }

  stats(): { hp: number; dmg: number; speed: number } {
    const char = this.char();
    const skinIdx = this.equippedSkinIndex();
    const weaponIdx = this.equippedWeaponIndex();
    return {
      hp: char.hp + (skinIdx >= 0 ? (skinIdx + 1) * 9 : 0),
      dmg: char.dmg + (weaponIdx >= 0 ? (weaponIdx + 1) * 1.8 : 0),
      speed: char.speed,
    };
  }

  score(): number {
    return this.state.rankIndex * 100 + this.state.stars * 12 +
      (this.state.skins.length + this.state.weapons.length) * 6;
  }

  // 胜利战利品：随机夺取该段位的皮肤或武器；已拥有则折算金币
  grantItem(rankIndex: number): Reward {
    const rank = CFG.RANKS[rankIndex];
    if (!rank) return { type: 'coin', coins: 60, rankIndex };
    const wantSkin = Math.random() < 0.5;
    const ownsSkin = this.state.skins.indexOf(rankIndex) >= 0;
    const ownsWeapon = this.state.weapons.indexOf(rankIndex) >= 0;
    let type: 'skin' | 'weapon' = wantSkin ? 'skin' : 'weapon';
    if ((type === 'skin' && ownsSkin) || (type === 'weapon' && ownsWeapon)) {
      type = type === 'skin' ? 'weapon' : 'skin';
    }
    const owned = type === 'skin' ? ownsSkin : ownsWeapon;
    if (owned) {
      this.state.coins += 60;
      this.save();
      return { type: 'coin', coins: 60, rankIndex };
    }
    if (type === 'skin') this.state.skins.push(rankIndex);
    else this.state.weapons.push(rankIndex);
    this.save();
    return { type, rankIndex, name: type === 'skin' ? rank.skinName : rank.weapon.name };
  }

  // 失败惩罚：扣除当前段位一件装备，没有装备则扣一颗星
  loseItem(rankIndex: number): Reward | null {
    const rank = CFG.RANKS[rankIndex];
    if (!rank) return null;
    const hasSkin = this.state.skins.indexOf(rankIndex) >= 0;
    const hasWeapon = this.state.weapons.indexOf(rankIndex) >= 0;
    if (hasSkin || hasWeapon) {
      let type: 'skin' | 'weapon' = 'skin';
      if (hasSkin && hasWeapon) type = Math.random() < 0.5 ? 'skin' : 'weapon';
      else if (hasWeapon) type = 'weapon';
      if (type === 'skin') {
        this.state.skins.splice(this.state.skins.indexOf(rankIndex), 1);
        this.save();
        return { type, rankIndex, name: rank.skinName };
      }
      this.state.weapons.splice(this.state.weapons.indexOf(rankIndex), 1);
      this.save();
      return { type, rankIndex, name: rank.weapon.name };
    }
    if (this.state.stars > 0) {
      this.state.stars -= 1;
      this.save();
      return { type: 'star', rankIndex };
    }
    return null;
  }

  addStars(): { promoted: boolean; rankIndex: number; stars: number } {
    this.state.battles += 1;
    this.state.wins += 1;
    this.state.stars += 1;
    let promoted = false;
    if (this.state.stars >= CFG.RANK_STARS && this.state.rankIndex < CFG.MAX_RANK) {
      this.state.rankIndex += 1;
      this.state.stars = 0;
      promoted = true;
    } else if (this.state.stars >= CFG.RANK_STARS) {
      this.state.stars = CFG.RANK_STARS - 1;
    }
    this.save();
    return { promoted, rankIndex: this.state.rankIndex, stars: this.state.stars };
  }

  addLoss(): void {
    this.state.battles += 1;
    this.save();
  }

  describeReward(r: Reward | null): string {
    if (!r) return '无';
    if (r.type === 'coin') return '重复装备折算 ' + r.coins + ' 金币';
    return '获得「' + r.name + '」';
  }

  describePenalty(p: Reward | null): string {
    if (!p) return '本段位暂无装备可扣';
    if (p.type === 'star') return '无装备可扣，星数 -1';
    return '失去「' + p.name + '」';
  }
}

export const store = new Store();
export default store;
