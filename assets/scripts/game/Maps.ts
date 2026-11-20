/**
 * v2.3 三地图配置：翠绿草原 / 黄沙荒漠 / 霜雪冰原
 *  - 每图一套地形参数 + 表层方块 + 装饰物 + 刷怪池 + 天空雾色
 *  - 解锁进度与选中态持久化（sys.localStorage，key: dogcat_map_v1）
 */
import { sys } from 'cc';
import { BlockType } from '../voxel/Blocks';
import type { MobKind } from './Mobs';

export type MapId = 'grassland' | 'desert' | 'snow';

export interface MapDef {
  id: MapId;
  name: string;
  icon: string;
  desc: string;
  /** 解锁条件：前置地图累计开箱数（0 = 默认解锁） */
  unlockChests: number;
  /** 前置地图（解锁进度按它的累计开箱数计），null = 无前置 */
  prevMap: MapId | null;
  terrain: {
    amp: number;      // 噪声振幅（草原原值 12）
    freq: number;     // 噪声频率除数（草原原值 80，越小沙丘越大）
    treeProb: number; // 树生成概率（草原原值 0.006）
    water: boolean;   // 是否有水系
    frozen?: boolean; // 水面冻结为可行走冰面（冰原）
  };
  /** 表层 / 次表层方块 */
  surface: { top: BlockType; sub: BlockType };
  /** 地表装饰风格 */
  decorate: 'flowers' | 'snowflake' | 'cactus' | 'none';
  /** 雾色与视距 */
  sky: { fog: [number, number, number]; fogStart: number; fogEnd: number };
  /** 该图刷怪池 */
  animalPool: MobKind[];
  wildPool: MobKind[];
  /** 宝箱密度倍率 */
  chestDensity: number;
}

export const MAPS: Record<MapId, MapDef> = {
  grassland: {
    id: 'grassland', name: '翠绿草原', icon: '🌿',
    desc: '平缓丘陵与树林，生态温和',
    unlockChests: 0, prevMap: null,
    terrain: { amp: 7, freq: 120, treeProb: 0.006, water: true },
    surface: { top: BlockType.GRASS, sub: BlockType.DIRT },
    decorate: 'flowers',
    sky: { fog: [150, 205, 246], fogStart: 28, fogEnd: 74 },
    animalPool: ['pig', 'sheep', 'chicken', 'rabbit', 'cow', 'villager'],
    wildPool: ['boar', 'fox', 'wolf', 'zombie', 'skeleton', 'creeper', 'slime', 'bee', 'iron_golem', 'raptor', 'triceratops'],
    chestDensity: 1,
  },
  desert: {
    id: 'desert', name: '黄沙荒漠', icon: '🏜',
    desc: '起伏沙丘与仙人掌，怪物更凶',
    unlockChests: 10, prevMap: 'grassland',
    terrain: { amp: 16, freq: 64, treeProb: 0, water: false },
    surface: { top: BlockType.SAND, sub: BlockType.SAND },
    decorate: 'cactus',
    sky: { fog: [244, 208, 138], fogStart: 26, fogEnd: 70 },
    animalPool: ['rabbit', 'chicken'],
    wildPool: ['scorpion', 'sandworm', 'vulture', 'skeleton', 'enderman', 'bee', 'ptera', 'raptor', 'triceratops'],
    chestDensity: 1.2,
  },
  snow: {
    id: 'snow', name: '霜雪冰原', icon: '❄',
    desc: '冰盖湖泊与雪松，极寒之地',
    unlockChests: 10, prevMap: 'desert',
    terrain: { amp: 10, freq: 90, treeProb: 0.003, water: true, frozen: true },
    surface: { top: BlockType.SNOW, sub: BlockType.DIRT },
    decorate: 'snowflake',
    sky: { fog: [228, 240, 250], fogStart: 22, fogEnd: 60 },
    animalPool: ['sheep', 'rabbit'],
    wildPool: ['snowfox', 'icewolf', 'polarbear', 'zombie', 'witch', 'snow_golem'],
    chestDensity: 1.2,
  },
};

export const MAP_LIST: MapDef[] = [MAPS.grassland, MAPS.desert, MAPS.snow];

export interface MapSave {
  selected: MapId;
  /** 各图累计开箱数（解锁进度依据） */
  chests: Record<MapId, number>;
  /** 已通过看广告直接解锁的地图 */
  adUnlocked: Record<MapId, boolean>;
}

const STORAGE_KEY = 'dogcat_map_v1';

function defaultSave(): MapSave {
  return {
    selected: 'grassland',
    chests: { grassland: 0, desert: 0, snow: 0 },
    adUnlocked: { grassland: true, desert: false, snow: false },
  };
}

export function loadMapSave(): MapSave {
  try {
    const raw = sys.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw) as Partial<MapSave>;
    const d = defaultSave();
    if (s.selected && MAPS[s.selected]) d.selected = s.selected;
    if (s.chests) {
      for (const id of Object.keys(d.chests) as MapId[]) {
        const n = s.chests[id];
        if (typeof n === 'number' && n > 0) d.chests[id] = Math.floor(n);
      }
    }
    if (s.adUnlocked) {
      for (const id of Object.keys(d.adUnlocked) as MapId[]) {
        if (s.adUnlocked[id]) d.adUnlocked[id] = true;
      }
    }
    return d;
  } catch {
    return defaultSave();
  }
}

export function saveMapSave(s: MapSave): void {
  try {
    sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* 存储失败不影响游戏 */ }
}

/** 地图是否已解锁（广告解锁优先，其次看前置地图累计开箱） */
export function isMapUnlocked(id: MapId, s: MapSave): boolean {
  const def = MAPS[id];
  if (!def.prevMap) return true;
  if (s.adUnlocked[id]) return true;
  return s.chests[def.prevMap] >= def.unlockChests;
}

/** 看广告解锁地图（持久化由调用方保存） */
export function adUnlockMap(s: MapSave, id: MapId): void {
  s.adUnlocked[id] = true;
}

/** 锁定卡片上的进度文案数据 */
export function unlockProgress(id: MapId, s: MapSave): { cur: number; need: number } {
  const def = MAPS[id];
  if (!def.prevMap) return { cur: 0, need: 0 };
  return { cur: Math.min(s.chests[def.prevMap], def.unlockChests), need: def.unlockChests };
}

/** 累计开箱 +1；返回是否因此解锁了新地图（用于弹提示） */
export function addChestCount(s: MapSave, id: MapId): MapId | null {
  s.chests[id] = (s.chests[id] || 0) + 1;
  for (const m of MAP_LIST) {
    if (m.prevMap === id && s.chests[id] === m.unlockChests) return m.id;
  }
  return null;
}
