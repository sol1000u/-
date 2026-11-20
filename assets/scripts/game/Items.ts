/**
 * 装备系统：装备定义、数值、掉落判定、掉落物实体。
 * 槽位：宝剑 / 头盔 / 铠甲 / 戒指 / 工具。
 */
import { MeshRenderer, Node } from 'cc';
import { buildBoxesMesh, getVoxGhostMaterial, getVoxMaterial, hexToRgb01, type BoxDef } from './VoxMesh';

export type SlotId = 'weapon' | 'helmet' | 'armor' | 'ring' | 'tool';

export interface EquipDef {
  id: string;
  slot: SlotId;
  name: string;
  tier: number;          // 1普通 2优良 3精良 4史诗 5传说
  color: string;
  dmg?: number;          // 武器=攻击力（替换拳头2）；工具=附加攻击
  hp?: number;           // 头盔：生命上限加成
  armor?: number;        // 铠甲：减伤比例 0~0.5
  regen?: number;        // 戒指：每秒回血
  cdMul?: number;        // 工具：攻击冷却系数
  burn?: number;         // 灼烧：命中后持续掉血 dmg×0.2，持续 X 秒
  slow?: number;         // 冰冻：命中减速 X（0.35 = 移速 ×0.65），持续 2 秒
  stun?: number;         // 雷电：命中眩晕 X 秒（BOSS 免疫）
  splash?: number;       // 爆炸：命中点半径 X 米内敌人受到 50% 溅射伤害
  chain?: number;        // 连锁：电弧跳向最近 X 个敌人，每跳伤害衰减 30%
  fireCd?: number;       // 远程武器：射击间隔（秒）
  projSpeed?: number;    // 远程武器：弹道速度（m/s）
  projRange?: number;    // 远程武器：射程（米）
  pierce?: number;       // 远程武器：穿透敌人数量
  shots?: number;        // 远程武器：单次发射弹丸数（喷管 3 连珠）
  spread?: number;       // 远程武器：扇形半角（度）
  homing?: number;       // 远程武器：弱锁定修正半径（米）
  desc: string;
}

export const SLOT_NAMES: Record<SlotId, string> = {
  weapon: '宝剑', helmet: '头盔', armor: '铠甲', ring: '戒指', tool: '工具',
};
export const SLOT_ORDER: SlotId[] = ['weapon', 'helmet', 'armor', 'ring', 'tool'];
export const TIER_NAMES = ['', '普通', '优良', '精良', '史诗', '传说'];
export const TIER_COLORS = ['', '#FAFAFA', '#7BE38A', '#42A5F5', '#BA68C8', '#FFD54F'];

/** 人物皮肤：改变第三人称人物模型的主色调 */
export interface SkinPreset {
  id: string;
  name: string;
  /** 肤色（头部 / 手脚） */
  skin: string;
  /** 上衣颜色 */
  shirt: string;
  /** 裤子颜色 */
  pants: string;
  /** 鞋子颜色 */
  shoes: string;
  /** 面板展示用的强调色 */
  accent: string;
}

export const SKIN_PRESETS: SkinPreset[] = [
  { id: 'sk_default',  name: '冒险者',   skin: '#C68642', shirt: '#1E88E5', pants: '#3949AB', shoes: '#5D4037', accent: '#42A5F5' },
  { id: 'sk_bronze',   name: '青铜勇者', skin: '#C98B5B', shirt: '#8D6E63', pants: '#5D4037', shoes: '#3E2723', accent: '#D79A63' },
  { id: 'sk_gold',     name: '黄金骑士', skin: '#F5D06A', shirt: '#D2A22F', pants: '#A97C12', shoes: '#6D4C10', accent: '#FFD54F' },
  { id: 'sk_platinum', name: '铂金银卫', skin: '#DEF1F5', shirt: '#6F9BAB', pants: '#4A7683', shoes: '#2F5560', accent: '#BFE9F2' },
  { id: 'sk_diamond',  name: '钻石锋刃', skin: '#C3E9FF', shirt: '#5B8FC9', pants: '#3F6E9E', shoes: '#204A70', accent: '#9FDCFF' },
  { id: 'sk_legend',   name: '传说之王', skin: '#CDBCFF', shirt: '#6F4FC0', pants: '#4B3400', shoes: '#2C1B52', accent: '#B388FF' },
];

/** 出生自带的木棍（不进掉落池，数值参考设计文档：攻击 12） */
export const STICK: EquipDef = {
  id: 'w_stick', slot: 'weapon', name: '木棍', tier: 1, dmg: 12, color: '#8D6E63', desc: '出生自带的木棍',
};

/** 宝剑（武器池），数值参考设计文档 */
export const WEAPONS: EquipDef[] = [
  { id: 'w_wood', slot: 'weapon', name: '木剑', tier: 1, dmg: 18, color: '#A1887F', desc: '入门之剑，攻击稳定' },
  { id: 'w_stone', slot: 'weapon', name: '石剑', tier: 2, dmg: 26, color: '#9E9E9E', desc: '沉甸甸的石刃，挥砍有力' },
  { id: 'w_iron', slot: 'weapon', name: '铁剑', tier: 3, dmg: 34, color: '#CFD8DC', desc: '铁匠铺的骄傲，削铁如泥' },
  { id: 'w_crossbow', slot: 'weapon', name: '铁弩', tier: 3, dmg: 30, fireCd: 0.9, projSpeed: 18, projRange: 22, pierce: 2, color: '#B0BEC5', desc: '远程弩箭，穿透 2 个敌人' },
  { id: 'w_gold', slot: 'weapon', name: '金剑', tier: 4, dmg: 40, color: '#FFD54F', desc: '华贵之刃，伤害可观' },
  { id: 'w_diamond', slot: 'weapon', name: '钻石剑', tier: 5, dmg: 45, color: '#4DD0E1', desc: '璀璨夺目，无坚不摧' },
  { id: 'w_firegun', slot: 'weapon', name: '火焰喷管', tier: 4, dmg: 22, fireCd: 1.1, projSpeed: 10, projRange: 8, shots: 3, spread: 8, burn: 2, color: '#FF7043', desc: '3 连珠扇形，命中灼烧' },
  { id: 'w_staff', slot: 'weapon', name: '奥术法杖', tier: 5, dmg: 55, fireCd: 1.3, projSpeed: 7, projRange: 16, homing: 6, chain: 2, color: '#BA68C8', desc: '追踪飞弹，命中连锁 2 目标' },
  { id: 'w_fire', slot: 'weapon', name: '火焰剑', tier: 5, dmg: 55, burn: 2, color: '#FF7043', desc: '传说之剑，命中灼烧2秒' },
  { id: 'w_spear', slot: 'weapon', name: '长矛', tier: 2, dmg: 24, color: '#BCAAA4', desc: '长柄利器，攻击距离远' },
  { id: 'w_bow', slot: 'weapon', name: '木弓', tier: 2, dmg: 18, fireCd: 0.6, projSpeed: 15, projRange: 18, color: '#A1887F', desc: '远程箭矢，射程 18m' },
  { id: 'w_dagger', slot: 'weapon', name: '匕首', tier: 1, dmg: 14, color: '#ECEFF1', desc: '轻便迅捷，攻速极快' },
  { id: 'w_axe', slot: 'weapon', name: '战斧', tier: 3, dmg: 38, color: '#795548', desc: '重斧劈砍，伤害爆表' },
  { id: 'w_hammer', slot: 'weapon', name: '巨锤', tier: 4, dmg: 48, splash: 1.8, color: '#607D8B', desc: '雷霆一击，溅射震慑群敌' },
  { id: 'w_scythe', slot: 'weapon', name: '镰刀', tier: 4, dmg: 42, color: '#9FA8DA', desc: '夺命弧光，收割生命' },
  { id: 'w_ice', slot: 'weapon', name: '冰霜剑', tier: 5, dmg: 44, slow: 0.35, color: '#81D4FA', desc: '寒冰附魔，命中减速 35%' },
  { id: 'w_thunder', slot: 'weapon', name: '雷电剑', tier: 5, dmg: 50, chain: 2, color: '#FFEB3B', desc: '雷霆之力，连锁电击 2 目标' },
  { id: 'w_star', slot: 'weapon', name: '星辰剑', tier: 5, dmg: 58, burn: 1, chain: 1, color: '#E1BEE7', desc: '陨星铸造，灼烧并连锁' },
];

export const HELMETS: EquipDef[] = [
  { id: 'h_leather', slot: 'helmet', name: '皮帽', tier: 1, hp: 10, color: '#A1887F', desc: '生命上限 +10' },
  { id: 'h_iron', slot: 'helmet', name: '铁头盔', tier: 3, hp: 20, color: '#CFD8DC', desc: '生命上限 +20' },
  { id: 'h_gold', slot: 'helmet', name: '金头盔', tier: 4, hp: 30, color: '#FFD54F', desc: '生命上限 +30' },
  { id: 'h_diamond', slot: 'helmet', name: '钻石头盔', tier: 5, hp: 40, color: '#4DD0E1', desc: '生命上限 +40' },
];

export const ARMORS: EquipDef[] = [
  { id: 'a_cloth', slot: 'armor', name: '布衣', tier: 1, armor: 0.10, color: '#BCAAA4', desc: '减伤 10%' },
  { id: 'a_iron', slot: 'armor', name: '铁铠甲', tier: 3, armor: 0.22, color: '#CFD8DC', desc: '减伤 22%' },
  { id: 'a_gold', slot: 'armor', name: '金铠甲', tier: 4, armor: 0.32, color: '#FFD54F', desc: '减伤 32%' },
  { id: 'a_diamond', slot: 'armor', name: '钻石铠甲', tier: 5, armor: 0.45, color: '#4DD0E1', desc: '减伤 45%' },
];

export const RINGS: EquipDef[] = [
  { id: 'r_wood', slot: 'ring', name: '木戒指', tier: 1, regen: 0.5, color: '#A1887F', desc: '每秒回血 0.5' },
  { id: 'r_iron', slot: 'ring', name: '铁戒指', tier: 2, regen: 1, color: '#CFD8DC', desc: '每秒回血 1' },
  { id: 'r_gold', slot: 'ring', name: '金戒指', tier: 4, regen: 1.5, color: '#FFD54F', desc: '每秒回血 1.5' },
  { id: 'r_diamond', slot: 'ring', name: '钻石戒指', tier: 5, regen: 2, color: '#4DD0E1', desc: '每秒回血 2' },
];

export const TOOLS: EquipDef[] = [
  { id: 't_wood', slot: 'tool', name: '木斧', tier: 1, dmg: 2, cdMul: 0.92, color: '#A1887F', desc: '攻+2 冷却-8%' },
  { id: 't_stone', slot: 'tool', name: '石斧', tier: 2, dmg: 4, cdMul: 0.85, color: '#9E9E9E', desc: '攻+4 冷却-15%' },
  { id: 't_iron', slot: 'tool', name: '铁铲', tier: 3, dmg: 6, cdMul: 0.78, color: '#CFD8DC', desc: '攻+6 冷却-22%' },
  { id: 't_gold', slot: 'tool', name: '金斧', tier: 4, dmg: 8, cdMul: 0.7, color: '#FFD54F', desc: '攻+8 冷却-30%' },
  { id: 't_diamond', slot: 'tool', name: '钻石斧', tier: 5, dmg: 12, cdMul: 0.6, color: '#4DD0E1', desc: '攻+12 冷却-40%' },
];

const POOLS: Record<SlotId, EquipDef[]> = {
  weapon: WEAPONS, helmet: HELMETS, armor: ARMORS, ring: RINGS, tool: TOOLS,
};

export function mainStat(item: EquipDef): string {
  switch (item.slot) {
    case 'weapon': return `攻${item.dmg}`;
    case 'helmet': return `命+${item.hp}`;
    case 'armor': return `减伤${Math.round((item.armor || 0) * 100)}%`;
    case 'ring': return `回血${item.regen}/s`;
    case 'tool': return `攻+${item.dmg}`;
    default: return '';
  }
}

/**
 * 按波次 roll 掉落。波次越高，掉率与高阶概率越大（后面爆的装备多）。
 * force=true 时必定掉落（看广告领奖用）。
 */
export function rollDrop(wave: number, force = false): EquipDef | null {
  // 参考设计文档：第 1 波约 30%，逐波提升，第 10 波 60% 以上
  const chance = Math.min(0.3 + Math.max(0, wave - 1) * 0.04, 0.7);
  if (!force && Math.random() > chance) return null;

  const slotRoll = Math.random() * 100;
  let slot: SlotId = 'weapon';
  if (slotRoll < 30) slot = 'weapon';
  else if (slotRoll < 50) slot = 'helmet';
  else if (slotRoll < 70) slot = 'armor';
  else if (slotRoll < 85) slot = 'ring';
  else slot = 'tool';

  // 波次解锁的最高品质
  const maxTier = wave >= 7 ? 5 : wave >= 5 ? 4 : wave >= 3 ? 3 : wave >= 2 ? 2 : 1;
  const pool = POOLS[slot].filter((it) => it.tier <= maxTier && unlockedAtWave(it, wave));
  if (!pool.length) return null;

  // 高品质更稀有：权重按品质递减
  const weights = [0, 8, 5, 3, 2, 1];
  let total = 0;
  for (const it of pool) total += weights[it.tier];
  let r = Math.random() * total;
  for (const it of pool) {
    r -= weights[it.tier];
    if (r <= 0) return it;
  }
  return pool[0];
}

// ---------------- 掉落物实体 ----------------

export interface DropEnt {
  node: Node;
  item: EquipDef | null;
  heal: number;
  cons: ConsumableId | null;
  baseY: number;
  t: number;
}

/** 颜色加深/提亮（f<1 加深，f>1 提亮） */
function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb01(hex);
  const c = (v: number) => (`0${Math.max(0, Math.min(255, Math.round(v * 255 * f))).toString(16)}`).slice(-2);
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 按装备槽位拼出有形状的掉落物模型（剑/头盔/铠甲/戒指/斧头） */
function equipDropBoxes(item: EquipDef): BoxDef[] {
  const c = item.color;
  const dark = shade(c, 0.78);
  const wood = '#6D4C41';
  switch (item.slot) {
    case 'weapon':
      return [
        { x: -0.035, y: 0.15, z: -0.035, w: 0.07, h: 0.34, d: 0.07, color: c },   // 剑刃
        { x: -0.018, y: 0.49, z: -0.018, w: 0.036, h: 0.07, d: 0.036, color: c }, // 剑尖
        { x: -0.11, y: 0.12, z: -0.045, w: 0.22, h: 0.035, d: 0.09, color: wood }, // 护手
        { x: -0.023, y: 0, z: -0.023, w: 0.046, h: 0.12, d: 0.046, color: shade(wood, 0.8) }, // 剑柄
      ];
    case 'helmet':
      return [
        { x: -0.16, y: 0.1, z: -0.16, w: 0.32, h: 0.2, d: 0.32, color: c },      // 盔体
        { x: -0.185, y: 0.05, z: -0.185, w: 0.37, h: 0.05, d: 0.37, color: dark }, // 帽檐
        { x: -0.04, y: 0.3, z: -0.04, w: 0.08, h: 0.05, d: 0.08, color: dark },   // 顶珠
      ];
    case 'armor':
      return [
        { x: -0.15, y: 0.03, z: -0.1, w: 0.3, h: 0.26, d: 0.2, color: c },        // 胸甲
        { x: -0.215, y: 0.21, z: -0.09, w: 0.075, h: 0.09, d: 0.18, color: dark }, // 左肩甲
        { x: 0.14, y: 0.21, z: -0.09, w: 0.075, h: 0.09, d: 0.18, color: dark },  // 右肩甲
        { x: -0.15, y: 0.03, z: -0.1, w: 0.3, h: 0.05, d: 0.2, color: wood },     // 腰带
        { x: -0.05, y: 0.29, z: -0.06, w: 0.1, h: 0.04, d: 0.12, color: dark },   // 领口
      ];
    case 'ring':
      return [
        { x: -0.11, y: 0.04, z: -0.02, w: 0.045, h: 0.2, d: 0.04, color: c },     // 环-左
        { x: 0.065, y: 0.04, z: -0.02, w: 0.045, h: 0.2, d: 0.04, color: c },     // 环-右
        { x: -0.065, y: 0.2, z: -0.02, w: 0.13, h: 0.045, d: 0.04, color: c },    // 环-上
        { x: -0.065, y: 0.04, z: -0.02, w: 0.13, h: 0.045, d: 0.04, color: c },   // 环-下
        { x: -0.03, y: 0.245, z: -0.03, w: 0.06, h: 0.06, d: 0.06, color: '#FFFFFF' }, // 宝石
      ];
    default: // tool 斧头
      return [
        { x: -0.02, y: 0, z: -0.02, w: 0.04, h: 0.34, d: 0.04, color: wood },     // 斧柄
        { x: -0.13, y: 0.24, z: -0.03, w: 0.26, h: 0.11, d: 0.06, color: c },     // 斧头
        { x: -0.155, y: 0.2, z: -0.03, w: 0.05, h: 0.17, d: 0.06, color: dark },  // 斧刃
      ];
  }
}

function healDropBoxes(): BoxDef[] {
  return [
    { x: -0.15, y: 0, z: -0.15, w: 0.3, h: 0.3, d: 0.3, color: '#E53935' },
    { x: -0.11, y: 0.16, z: -0.16, w: 0.22, h: 0.06, d: 0.02, color: '#FFFFFF' },
    { x: -0.03, y: 0.08, z: -0.16, w: 0.06, h: 0.22, d: 0.02, color: '#FFFFFF' },
  ];
}

// ---------------- v2.0 消耗品 ----------------

export type ConsumableId = 'p_heal' | 'p_energy' | 'p_bomb' | 'p_shield';

export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  stackMax: number;
  color: string;
  desc: string;
}

export const CONSUMABLES: Record<ConsumableId, ConsumableDef> = {
  p_heal: { id: 'p_heal', name: '治疗药水', stackMax: 5, color: '#EF5350', desc: '恢复 40 HP' },
  p_energy: { id: 'p_energy', name: '能量药水', stackMax: 3, color: '#FFD54F', desc: '攻速 ×1.8，持续 10s' },
  p_bomb: { id: 'p_bomb', name: '炸弹', stackMax: 5, color: '#78909C', desc: '下次攻击掷出，爆炸 60 伤害' },
  p_shield: { id: 'p_shield', name: '护盾结晶', stackMax: 2, color: '#4FC3F7', desc: '30 点护盾，持续 20s' },
};

export interface ConsumableItem {
  id: ConsumableId;
  count: number;
}

/** 怪物死亡掉消耗品：治疗 8%；精英（≥4 波）能量 20%；炸弹第 3 波起 5% */
export function rollConsumableDrop(wave: number, elite: boolean): ConsumableId | null {
  if (elite && wave >= 4 && Math.random() < 0.2) return 'p_energy';
  if (wave >= 3 && Math.random() < 0.05) return 'p_bomb';
  if (Math.random() < 0.08) return 'p_heal';
  return null;
}

/** 消耗品掉落物模型：药瓶 / 结晶 */
function consumableDropBoxes(id: ConsumableId): BoxDef[] {
  const c = CONSUMABLES[id].color;
  const glass = '#E1F5FE';
  if (id === 'p_bomb') {
    return [
      { x: -0.16, y: 0, z: -0.16, w: 0.32, h: 0.32, d: 0.32, color: c },
      { x: -0.04, y: 0.3, z: -0.04, w: 0.08, h: 0.14, d: 0.08, color: '#5D4037' },
      { x: -0.06, y: 0.44, z: -0.06, w: 0.12, h: 0.06, d: 0.12, color: '#FFB300' },
    ];
  }
  if (id === 'p_shield') {
    return [
      { x: -0.14, y: 0.02, z: -0.14, w: 0.28, h: 0.3, d: 0.28, color: c },
      { x: -0.07, y: 0.32, z: -0.07, w: 0.14, h: 0.14, d: 0.14, color: glass },
    ];
  }
  return [
    { x: -0.13, y: 0, z: -0.13, w: 0.26, h: 0.3, d: 0.26, color: c },       // 瓶身
    { x: -0.05, y: 0.3, z: -0.05, w: 0.1, h: 0.1, d: 0.1, color: glass },    // 瓶颈
    { x: -0.07, y: 0.4, z: -0.07, w: 0.14, h: 0.05, d: 0.14, color: '#795548' }, // 瓶塞
    { x: -0.06, y: 0.08, z: -0.14, w: 0.12, h: 0.08, d: 0.02, color: '#FFFFFF' }, // 标签
  ];
}

// ---------------- 快捷栏武器 / 手持模型 / 宝箱 ----------------

/** 快捷栏里的一件武器：def + 强化层数（每层 +2 攻击，上限 +10） */
export interface BackpackItem {
  def: EquipDef;
  bonus: number;
}

/** 武器外形分类：直剑 / 长柄 / 重器 / 短刃 / 弓 / 弩 / 喷管 / 法杖 */
function weaponKind(id: string): 'spear' | 'heavy' | 'dagger' | 'sword' | 'bow' | 'crossbow' | 'gun' | 'staff' {
  if (id === 'w_spear') return 'spear';
  if (id === 'w_axe' || id === 'w_hammer' || id === 'w_scythe') return 'heavy';
  if (id === 'w_dagger') return 'dagger';
  if (id === 'w_bow') return 'bow';
  if (id === 'w_crossbow') return 'crossbow';
  if (id === 'w_firegun') return 'gun';
  if (id === 'w_staff') return 'staff';
  return 'sword';
}

/**
 * 手持武器网格：握把在原点，刃/头朝 +y（局部坐标）。
 * 第三人称右手与第一人称 ViewModel 共用。
 */
export function handBoxes(item: EquipDef): BoxDef[] {
  const c = item.color;
  const dark = shade(c, 0.72);
  const wood = '#7A5230';
  const grip = '#5D4037';
  switch (weaponKind(item.id)) {
    case 'spear':
      return [
        { x: -0.022, y: -0.16, z: -0.022, w: 0.044, h: 0.62, d: 0.044, color: wood },
        { x: -0.018, y: 0.46, z: -0.018, w: 0.036, h: 0.26, d: 0.036, color: c },
        { x: -0.01, y: 0.72, z: -0.01, w: 0.02, h: 0.06, d: 0.02, color: shade(c, 1.2) },
        { x: -0.03, y: 0.44, z: -0.03, w: 0.06, h: 0.03, d: 0.06, color: grip },
      ];
    case 'heavy':
      return [
        { x: -0.022, y: 0, z: -0.022, w: 0.044, h: 0.36, d: 0.044, color: wood },
        { x: -0.13, y: 0.32, z: -0.03, w: 0.26, h: 0.12, d: 0.06, color: c },
        { x: -0.15, y: 0.26, z: -0.03, w: 0.05, h: 0.2, d: 0.06, color: dark },
        { x: -0.03, y: 0.3, z: -0.03, w: 0.06, h: 0.16, d: 0.06, color: grip },
      ];
    case 'dagger':
      return [
        { x: -0.017, y: -0.02, z: -0.017, w: 0.034, h: 0.07, d: 0.034, color: grip },
        { x: -0.055, y: 0.03, z: -0.016, w: 0.11, h: 0.025, d: 0.032, color: wood },
        { x: -0.02, y: 0.06, z: -0.02, w: 0.04, h: 0.2, d: 0.04, color: c },
        { x: -0.008, y: 0.26, z: -0.008, w: 0.016, h: 0.04, d: 0.016, color: shade(c, 1.2) },
      ];
    case 'bow':
      return [
        { x: -0.022, y: -0.14, z: -0.02, w: 0.044, h: 0.3, d: 0.044, color: grip },   // 握把
        { x: -0.06, y: 0.1, z: -0.016, w: 0.034, h: 0.28, d: 0.034, color: c },       // 上弓臂
        { x: -0.085, y: 0.33, z: -0.016, w: 0.032, h: 0.22, d: 0.032, color: c },
        { x: -0.095, y: 0.48, z: -0.016, w: 0.028, h: 0.14, d: 0.028, color: dark },  // 上弓梢
        { x: 0.038, y: 0.1, z: -0.016, w: 0.034, h: 0.28, d: 0.034, color: c },       // 下弓臂
        { x: 0.063, y: 0.33, z: -0.016, w: 0.032, h: 0.22, d: 0.032, color: c },
        { x: 0.073, y: 0.48, z: -0.016, w: 0.028, h: 0.14, d: 0.028, color: dark },   // 下弓梢
        { x: 0.003, y: 0.08, z: -0.012, w: 0.012, h: 0.56, d: 0.012, color: '#ECEFF1' }, // 弓弦
      ];
    case 'crossbow':
      return [
        { x: -0.022, y: -0.2, z: -0.022, w: 0.044, h: 0.52, d: 0.044, color: grip },  // 弩身
        { x: -0.3, y: 0.28, z: -0.02, w: 0.6, h: 0.05, d: 0.05, color: c },           // 弩臂
        { x: -0.33, y: 0.26, z: -0.02, w: 0.06, h: 0.1, d: 0.06, color: dark },       // 左弩尖
        { x: 0.27, y: 0.26, z: -0.02, w: 0.06, h: 0.1, d: 0.06, color: dark },        // 右弩尖
        { x: -0.01, y: 0.18, z: -0.024, w: 0.02, h: 0.46, d: 0.02, color: '#ECEFF1' }, // 弩弦
      ];
    case 'gun':
      return [
        { x: -0.06, y: -0.1, z: -0.06, w: 0.12, h: 0.46, d: 0.12, color: dark },     // 粗管身
        { x: -0.08, y: 0.3, z: -0.08, w: 0.16, h: 0.12, d: 0.16, color: c },         // 喷口
        { x: -0.05, y: 0.4, z: -0.05, w: 0.1, h: 0.05, d: 0.1, color: '#FFCC80' },    // 火芯
        { x: -0.09, y: -0.16, z: -0.05, w: 0.18, h: 0.1, d: 0.1, color: grip },       // 握把
      ];
    case 'staff':
      return [
        { x: -0.022, y: -0.2, z: -0.022, w: 0.044, h: 0.86, d: 0.044, color: wood },  // 长杆
        { x: -0.055, y: 0.66, z: -0.055, w: 0.11, h: 0.14, d: 0.11, color: dark },    // 托座
        { x: -0.06, y: 0.78, z: -0.06, w: 0.12, h: 0.12, d: 0.12, color: c },         // 顶端宝石
        { x: -0.025, y: 0.9, z: -0.025, w: 0.05, h: 0.08, d: 0.05, color: '#E1BEE7' },// 宝石尖
        { x: -0.03, y: 0.5, z: -0.03, w: 0.06, h: 0.08, d: 0.06, color: c },          // 缠带
      ];
    default:
      return [
        { x: -0.02, y: 0, z: -0.02, w: 0.04, h: 0.1, d: 0.04, color: grip },
        { x: -0.09, y: 0.07, z: -0.022, w: 0.18, h: 0.03, d: 0.044, color: wood },
        { x: -0.028, y: 0.1, z: -0.028, w: 0.056, h: 0.34, d: 0.056, color: c },
        { x: -0.014, y: 0.44, z: -0.014, w: 0.028, h: 0.05, d: 0.028, color: shade(c, 1.2) },
      ];
  }
}

/** 拳头（空手）网格：握把位置的一个肤色方块 */
export function fistBoxes(): BoxDef[] {
  return [
    { x: -0.07, y: -0.07, z: -0.07, w: 0.14, h: 0.15, d: 0.14, color: '#C68642' },
  ];
}

/** 宝箱箱体（木箱 + 金锁扣 + 红布条） */
export const CHEST_BOXES: BoxDef[] = [
  { x: -0.45, y: 0, z: -0.45, w: 0.9, h: 0.5, d: 0.9, color: '#8D6E63' },
  { x: -0.46, y: 0.06, z: -0.46, w: 0.92, h: 0.1, d: 0.92, color: '#5D4037' },   // 底箍
  { x: -0.46, y: 0.38, z: -0.46, w: 0.92, h: 0.1, d: 0.92, color: '#5D4037' },   // 上箍
  { x: -0.1, y: 0.12, z: -0.47, w: 0.2, h: 0.26, d: 0.03, color: '#B71C1C' },    // 红布条
  { x: -0.09, y: 0.2, z: -0.475, w: 0.18, h: 0.13, d: 0.04, color: '#FFD54F' },  // 金锁扣
];

/** 宝箱箱盖（局部坐标：以箱体后沿为旋转轴，y=0 为贴合面） */
export const CHEST_LID_BOXES: BoxDef[] = [
  { x: -0.45, y: 0, z: -0.45, w: 0.9, h: 0.22, d: 0.9, color: '#795548' },
  { x: -0.47, y: 0.16, z: -0.47, w: 0.94, h: 0.06, d: 0.94, color: '#4E342E' },
  { x: -0.09, y: 0.02, z: -0.47, w: 0.18, h: 0.12, d: 0.04, color: '#FFD54F' },
];

/** 当前波次可产出的最高品质 */
export function maxTierForWave(wave: number): number {
  if (wave >= 7) return 5;
  if (wave >= 5) return 4;
  if (wave >= 3) return 3;
  return 2;
}

/** 武器按波次解锁：木弓第 2 波、铁弩第 3 波、火焰喷管第 5 波、火焰剑第 6 波、奥术法杖第 7 波 */
export function unlockedAtWave(item: EquipDef, wave: number): boolean {
  if (item.id === 'w_fire') return wave >= 6;
  if (item.id === 'w_bow') return wave >= 2;
  if (item.id === 'w_crossbow') return wave >= 3;
  if (item.id === 'w_firegun') return wave >= 5;
  if (item.id === 'w_staff') return wave >= 7;
  return true;
}

/** 宝箱奖励：1 武器 + 1 装备；武器优先未拥有 */
export function rollChestLoot(wave: number, owned: string[]): { weapon: EquipDef; equip: EquipDef } | null {
  const cap = maxTierForWave(wave);
  const wpool = WEAPONS.filter((w) => w.tier <= cap && unlockedAtWave(w, wave));
  if (!wpool.length) return null;
  const unowned = wpool.filter((w) => owned.indexOf(w.id) < 0);
  const wsrc = unowned.length ? unowned : wpool;
  const weapon = wsrc[(Math.random() * wsrc.length) | 0];

  const slots: SlotId[] = ['helmet', 'armor', 'ring', 'tool'];
  const epoolAll: EquipDef[] = [];
  for (const s of slots) {
    for (const it of POOLS[s]) if (it.tier <= cap) epoolAll.push(it);
  }
  if (!epoolAll.length) return null;
  const equip = epoolAll[(Math.random() * epoolAll.length) | 0];
  return { weapon, equip };
}

/** 传说宝剑（tier 5）；优先未拥有的，全部拥有返回 null */
export function pickLegendary(owned: string[], wave = 99): EquipDef | null {
  const legends = WEAPONS.filter((w) => w.tier === 5 && unlockedAtWave(w, wave));
  if (!legends.length) return null;
  const unowned = legends.filter((w) => owned.indexOf(w.id) < 0);
  if (!unowned.length) return null;
  return unowned[(Math.random() * unowned.length) | 0];
}

/** v2.1 世界 BOSS 大宝箱：3 件（1 传说武器 + 1 高阶装备 + 1 中高阶随机） */
export function rollBossLoot(owned: string[], wave = 99): EquipDef[] {
  const out: EquipDef[] = [];
  const t5 = WEAPONS.filter((w) => w.tier === 5 && unlockedAtWave(w, wave));
  const weapon = pickLegendary(owned, wave) || t5[(Math.random() * t5.length) | 0];
  if (weapon) out.push(weapon);
  const slots: SlotId[] = ['helmet', 'armor', 'ring', 'tool'];
  const hi: EquipDef[] = [];
  const mid: EquipDef[] = [];
  for (const s of slots) {
    for (const it of POOLS[s]) {
      if (it.tier >= 4) hi.push(it);
      else if (it.tier >= 3) mid.push(it);
    }
  }
  if (hi.length) out.push(hi[(Math.random() * hi.length) | 0]);
  const third = mid.concat(hi);
  if (third.length) out.push(third[(Math.random() * third.length) | 0]);
  return out;
}

// ---------------- 通关宝箱实体 ----------------

export interface ChestEnt {
  node: Node;
  lid: Node;
  x: number;
  y: number;
  z: number;
  baseY: number;
  t: number;
  wave: number;
  opened: boolean;
  openT: number;
}

/** 场上宝箱：漂浮 + 自转 + 靠近自动开启；未开启的永久保留（最多 5 个） */
export class ChestField {
  private readonly root: Node;
  private readonly list: ChestEnt[] = [];
  private bodyMesh: any = null;
  private lidMesh: any = null;
  /** v2.2 冲天光柱网格（按品质色缓存） */
  private readonly beamMeshes = new Map<string, any>();

  constructor(root: Node) {
    this.root = root;
  }

  get count(): number {
    return this.list.length;
  }

  get oldest(): ChestEnt | null {
    return this.list.length ? this.list[0] : null;
  }

  spawn(x: number, y: number, z: number, wave: number, beam = false): ChestEnt {
    if (!this.bodyMesh) this.bodyMesh = buildBoxesMesh(CHEST_BOXES);
    if (!this.lidMesh) this.lidMesh = buildBoxesMesh(CHEST_LID_BOXES);

    const node = new Node('chest');
    node.parent = this.root;
    node.setPosition(x, y + 0.3, z);

    const mr = node.addComponent(MeshRenderer);
    mr.mesh = this.bodyMesh;
    mr.setSharedMaterial(getVoxMaterial(), 0);

    const lid = new Node('lid');
    lid.parent = node;
    lid.setPosition(0, 0.5, -0.45);
    const lmr = lid.addComponent(MeshRenderer);
    lmr.mesh = this.lidMesh;
    lmr.setSharedMaterial(getVoxMaterial(), 0);

    // v2.2 未开启宝箱：冲天光柱 + 底部光环，远距离一眼可见（按品质着色）
    if (beam) {
      const color = TIER_COLORS[maxTierForWave(wave)] || '#FFD54F';
      let mesh = this.beamMeshes.get(color);
      if (!mesh) {
        mesh = buildBoxesMesh([
          // 主光柱：细长竖直，向上收束
          { x: -0.11, y: 0.4, z: -0.11, w: 0.22, h: 20, d: 0.22, color },
          { x: -0.07, y: 20, z: -0.07, w: 0.14, h: 14, d: 0.14, color },
          { x: -0.045, y: 33, z: -0.045, w: 0.09, h: 4, d: 0.09, color },
          // 底部光环：扁平十字，强化地面落点
          { x: -1.1, y: 0.3, z: -0.12, w: 2.2, h: 0.06, d: 0.24, color },
          { x: -0.12, y: 0.3, z: -1.1, w: 0.24, h: 0.06, d: 2.2, color },
        ]);
        this.beamMeshes.set(color, mesh);
      }
      const b = new Node('beam');
      b.parent = node;
      const bmr = b.addComponent(MeshRenderer);
      bmr.mesh = mesh;
      bmr.setSharedMaterial(getVoxGhostMaterial(150), 0);
    }

    const ent: ChestEnt = {
      node, lid, x, z, y, baseY: y + 0.3, t: Math.random() * 6, wave, opened: false, openT: 0,
    };
    this.list.push(ent);
    return ent;
  }

  /** 每帧表现；返回本帧因玩家靠近而被开启的宝箱；已开启的箱盖动画播完后消失 */
  update(dt: number, px: number, py: number, pz: number): ChestEnt | null {
    let justOpened: ChestEnt | null = null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.t += dt;
      c.node.setPosition(c.x, c.baseY + Math.sin(c.t * 2) * 0.06, c.z);
      c.node.setRotationFromEuler(0, c.t * (8 * Math.PI / 180), 0);
      if (c.opened) {
        if (c.openT > 0) {
          c.openT -= dt;
          const p = 1 - Math.max(0, c.openT) / 0.3;
          c.lid.setRotationFromEuler(-p * 75, 0, 0);
        } else {
          // v2.1：拿完东西宝箱消失
          c.node.destroy();
          this.list.splice(i, 1);
        }
      } else {
        const dx = c.x - px;
        const dy = (c.baseY + 0.25) - (py + 0.9);
        const dz = c.z - pz;
        if (dx * dx + dy * dy + dz * dz < 1.6 * 1.6) {
          c.opened = true;
          c.openT = 0.3;
          justOpened = c;
        }
      }
    }
    return justOpened;
  }

  /** 最近的未开启宝箱距离（没有宝箱时返回 Infinity），用于准星提示 */
  nearestDist(px: number, py: number, pz: number): number {
    let best = Infinity;
    for (const c of this.list) {
      if (c.opened) continue;
      const dx = c.x - px;
      const dy = (c.baseY + 0.25) - (py + 0.9);
      const dz = c.z - pz;
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd < best) best = dd;
    }
    return best === Infinity ? Infinity : Math.sqrt(best);
  }

  /** 移除并返回最早的宝箱（用于超过 5 个时自动开启） */
  takeOldest(): ChestEnt | null {
    const c = this.list.shift();
    if (!c) return null;
    c.node.destroy();
    return c;
  }

  clear(): void {
    // 延迟销毁：分帧释放，避免换图清场时一帧集中 destroy 卡顿
    for (const c of this.list) {
      c.node.active = false;
      NODE_GRAVEYARD.push(c.node);
    }
    this.list.length = 0;
  }
}

/** 待销毁节点队列（宝箱/掉落物共用，由 GameRoot 每帧限量释放） */
const NODE_GRAVEYARD: Node[] = [];

/** 分帧销毁队列中的节点 */
export function flushNodeGraveyard(n: number): void {
  while (n > 0 && NODE_GRAVEYARD.length > 0) {
    const node = NODE_GRAVEYARD.pop()!;
    if (node.isValid) node.destroy();
    n--;
  }
}

/** 掉落物管理：旋转 + 浮动 + 靠近拾取 */
export class DropField {
  private readonly root: Node;
  private readonly list: DropEnt[] = [];

  constructor(root: Node) {
    this.root = root;
  }

  spawnEquip(x: number, y: number, z: number, item: EquipDef): void {
    this.spawn(x, y, z, item, 0, null, equipDropBoxes(item));
  }

  spawnHeal(x: number, y: number, z: number, amount: number): void {
    this.spawn(x, y, z, null, amount, null, healDropBoxes());
  }

  spawnConsumable(x: number, y: number, z: number, id: ConsumableId): void {
    this.spawn(x, y, z, null, 0, id, consumableDropBoxes(id));
  }

  private spawn(
    x: number, y: number, z: number,
    item: EquipDef | null, heal: number, cons: ConsumableId | null,
    boxes: BoxDef[],
  ): void {
    const node = new Node('drop');
    node.parent = this.root;
    node.setPosition(x, y + 0.25, z);
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = buildBoxesMesh(boxes);
    mr.setSharedMaterial(getVoxMaterial(), 0);
    this.list.push({ node, item, heal, cons, baseY: y + 0.25, t: Math.random() * 6 });
  }

  /** 返回本帧被玩家拾取的掉落物 */
  update(dt: number, px: number, py: number, pz: number): DropEnt[] {
    const picked: DropEnt[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += dt;
      d.node.setRotationFromEuler(0, d.t * 90, 0);
      d.node.setPosition(d.node.position.x, d.baseY + Math.sin(d.t * 2.4) * 0.1, d.node.position.z);

      const dx = d.node.position.x - px;
      const dy = d.node.position.y - (py + 0.9);
      const dz = d.node.position.z - pz;
      if (dx * dx + dy * dy + dz * dz < 1.7) {
        picked.push(d);
        d.node.destroy();
        this.list.splice(i, 1);
      }
    }
    return picked;
  }

  clear(): void {
    // 延迟销毁：同 ChestField，分帧释放避免集中销毁卡帧
    for (const d of this.list) {
      d.node.active = false;
      NODE_GRAVEYARD.push(d.node);
    }
    this.list.length = 0;
  }
}
