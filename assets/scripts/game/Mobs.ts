/**
 * 生物系统 v2.3：怪物 / BOSS / 被动动物，全部体素盒子模型（顶点色烘焙明暗，单 Mesh 单 DrawCall）。
 *  - 模型：humanoid / quadruped 两个骨架 + 逐物种手工盒子
 *  - AI：追击 / 游荡 / 逃跑 / 苦力怕引爆 / 飞行俯冲 / 蓄力 AOE / 召唤 / 受击反击
 *  - 简化 AABB 物理（与玩家同一套碰撞规则）
 */
import { Material, Mesh, MeshRenderer, Node, Texture2D, Vec3 } from 'cc';
import { isInArena, World } from '../voxel/World';
import { buildBoxesMesh, buildQuadMesh, getVoxMaterial, type BoxDef } from './VoxMesh';

/** 怪物脸部贴图（GameRoot 启动时从 resources/mobface 加载填充） */
export const FACE_TEXTURES = new Map<string, Texture2D>();
const faceMats = new Map<string, Material>();
const faceMeshes = new Map<string, Mesh>();

/** 每种怪脸板的宽高与中心位置（局部坐标，面朝 +z） */
const FACE_SPECS: Record<string, { w: number; h: number; y: number; z: number }> = {
  zombie: { w: 0.5, h: 0.5, y: 1.72, z: 0.258 },
  skeleton: { w: 0.5, h: 0.5, y: 1.72, z: 0.258 },
  boss: { w: 0.5, h: 0.5, y: 1.72, z: 0.258 },
  creeper: { w: 0.54, h: 0.54, y: 1.62, z: 0.278 },
  spider: { w: 0.52, h: 0.4, y: 0.62, z: 0.828 },
  slime: { w: 0.82, h: 0.82, y: 0.44, z: 0.458 },
};

/** 生物种类 id（v2.3 为固定字符串表） */
export type MobKind = string;

/** 词缀（50 波后怪物随机获得） */
export type AffixKind = 'burn' | 'haste' | 'thorns' | 'vamp';

export const AFFIX_NAMES: Record<AffixKind, string> = {
  burn: '灼烧', haste: '疾行', thorns: '厚甲', vamp: '吸血',
};

/** 生成怪物时的属性倍率 */
export interface MobMul {
  hp?: number;
  dmg?: number;
  speed?: number;
  scale?: number;
}

/** 毒物怪死亡释放的毒雾参数 */
export interface PoisonCloudDef {
  radius: number;   // 毒雾半径
  duration: number; // 持续秒数
  dps: number;      // 踏入每秒伤害
}

export interface MobDef {
  kind: MobKind;
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  hw: number;       // 碰撞半宽
  height: number;   // 碰撞高度
  hostile: boolean;
  hop?: boolean;    // 史莱姆跳跃式移动
  explode?: number; // 苦力怕：爆炸基础伤害
  worldBoss?: boolean; // v2.1 世界 BOSS：金色血条常驻、领地 leash、脱战回血
  passive?: boolean;   // v2.3.1 被动世界 BOSS：未受击前不主动索敌，挨打后转为敌对
  leash?: number;      // 可选：以出生点为中心的独立活动半径（米），缺省按怪物等级
  summon?: number;  // 蜘蛛女皇：近战命中时召唤小蜘蛛数量
  aoe?: number;     // 巨魔 / 巨魔王：近战 AOE 半径
  windup?: number;  // 巨魔：攻击前摇秒数（举臂蓄力）
  poisonCloud?: PoisonCloudDef; // 毒物怪：死亡释放毒雾
  flying?: boolean; // 蝙蝠：空中飞行 + 俯冲
  diveCd?: number;  // 蝙蝠：俯冲间隔秒数（默认 4）
  parryChance?: number; // 亡灵武士：正面近战弹反概率 0~1
  bossBar?: boolean;    // 斗兽场 BOSS：金色血条（但计入 hostile、不脱战回血）
  fleeDist?: number;    // 野兔：玩家靠近该距离内主动逃跑
  aggro?: number;       // 野猪：索敌半径（默认 20）
  wallStun?: number;    // 野猪：撞墙后自身眩晕秒数
  poisonHit?: { dur: number; dps: number }; // v2.3 蝎子：命中使玩家中毒
  knock?: number;       // v2.3 北极熊/BOSS：击退倍率（默认 1）
  dmgReduce?: number;   // v2.3 石傀儡：受伤减免 0~1
  noKnock?: boolean;    // v2.3 石傀儡：免疫击退
  blink?: number;       // v2.3 暗影：受击瞬移到目标侧后的概率 0~1
  /** v2.5 攻击动作：slam 下砸 / stab 突刺 / throw 投掷（不填则不播） */
  atkPose?: 'slam' | 'stab' | 'throw';
  build(): BoxDef[];
}

// ---------------- 等级 / 体型 / 领地（怪物生态） ----------------

/** 怪物等级：1 普通 / 2 精锐 / 3 精英 / 4 领主 / 5 传说（世界 BOSS） */
export type MobTier = 1 | 2 | 3 | 4 | 5;

/** 头顶名字颜色按等级区分：白 → 绿 → 蓝 → 紫 → 金 */
export const MOB_TIER_COLORS: Record<MobTier, string> = {
  1: '#ECEFF1',
  2: '#7BE38A',
  3: '#42A5F5',
  4: '#BA68C8',
  5: '#FFD54F',
};

/** 等级名 */
export const MOB_TIER_NAMES: Record<MobTier, string> = {
  1: '普通', 2: '精锐', 3: '精英', 4: '领主', 5: '传说',
};

/**
 * 等级 → 活动半径（米）：等级越低活动范围越大，中等级居中，
 * 高等级和世界 BOSS 守在自己领地。斗兽场内不受限制（避免 BOSS 卡在门口）。
 */
const TIER_LEASH: Record<MobTier, number> = { 1: 46, 2: 34, 3: 22, 4: 14, 5: 11 };

/** 物种等级表（未列出的默认 1 普通） */
const MOB_TIERS: Record<string, MobTier> = {
  // 1 普通：家畜 / 村民 / 基础敌对怪
  cow: 1, villager: 1,
  zombie: 1, skeleton: 1, spider: 1, slime: 1, creeper: 1,
  bat: 1, cavebat: 1, vulture: 1, fox: 1, snowfox: 1, gas: 1,
  // 2 精锐
  wolf: 2, boar: 2, scorpion: 2, icewolf: 2, witch: 2,
  bee: 2, snow_golem: 2, raptor: 2, ptera: 2,
  // 3 精英
  troll: 3, samurai: 3, polarbear: 3, sandworm: 3, enderman: 3, iron_golem: 3, triceratops: 3,
  // 4 领主
  stonegolem: 4, shadow: 4, boss: 4,
  // 5 传说 / 世界 BOSS
  boss_zombie: 5, boss_golem: 5, boss_spider: 5,
  tiger: 5, rex: 5, dragon: 5, boss_troll: 5,
  boss_dragon_flame: 5, boss_titan_lava: 5,
  boss_zhuque: 5, boss_xuanwu: 5, boss_baihu: 5, boss_rex: 5,
  titan_creeper: 5, titan_iron: 5, titan_bone: 5,
};

/** 物种体型倍率（体积有大有小；同时作用于模型与碰撞盒） */
const MOB_SIZES: Record<string, number> = {
  chicken: 0.8, rabbit: 0.85, fox: 0.95, snowfox: 0.95,
  wolf: 0.95, villager: 1.0, witch: 1.0, bee: 0.9,
  cow: 1.2, boar: 1.1, polarbear: 1.15,
  troll: 1.3, stonegolem: 1.15, enderman: 1.12, shadow: 1.1,
  iron_golem: 1.1, snow_golem: 1.05,
  triceratops: 1.15, raptor: 1.0, ptera: 1.0,
};

export function mobTier(kind: MobKind): MobTier {
  return MOB_TIERS[kind] || 1;
}

// ---------------- 模型（面朝 +z，原点在脚底中心） ----------------

function humanoid(skin: string, shirt: string, pants: string, armsForward: boolean): BoxDef[] {
  const boxes: BoxDef[] = [
    { x: -0.26, y: 0, z: -0.14, w: 0.24, h: 0.75, d: 0.28, color: pants },
    { x: 0.02, y: 0, z: -0.14, w: 0.24, h: 0.75, d: 0.28, color: pants },
    { x: -0.28, y: 0.75, z: -0.15, w: 0.56, h: 0.72, d: 0.3, color: shirt },
    { x: -0.25, y: 1.47, z: -0.25, w: 0.5, h: 0.5, d: 0.5, color: skin },
    // 脸部由贴图板呈现（FACE_SPECS），不再拼小方块
  ];
  if (armsForward) {
    boxes.push(
      { x: -0.44, y: 1.28, z: 0.02, w: 0.16, h: 0.16, d: 0.62, color: skin },
      { x: 0.28, y: 1.28, z: 0.02, w: 0.16, h: 0.16, d: 0.62, color: skin },
    );
  } else {
    boxes.push(
      { x: -0.44, y: 0.78, z: -0.12, w: 0.16, h: 0.66, d: 0.24, color: skin },
      { x: 0.28, y: 0.78, z: -0.12, w: 0.16, h: 0.66, d: 0.24, color: skin },
    );
  }
  return boxes;
}

function quadruped(body: string, head: string, leg: string, opts: { bw: number; bh: number; bd: number; by: number; headS: number; legH: number; snout?: string; eye?: string }): BoxDef[] {
  const o = opts;
  const bw = o.bw; const bd = o.bd;
  const boxes: BoxDef[] = [
    { x: -bw / 2, y: o.by, z: -bd / 2, w: bw, h: o.bh, d: bd, color: body },
    { x: -o.headS / 2, y: o.by + o.bh * 0.25, z: bd / 2 - 0.02, w: o.headS, h: o.headS, d: o.headS, color: head },
  ];
  // v2.5 四足动物统一加一对眼睛（提升造型精致度）
  const eyeC = o.eye || '#2B211B';
  const eyeY = o.by + o.bh * 0.25 + o.headS * 0.6;
  const eyeZ = bd / 2 - 0.02 + o.headS + 0.004;
  const es = Math.min(0.075, o.headS * 0.18);
  boxes.push(
    { x: -o.headS * 0.34, y: eyeY, z: eyeZ, w: es, h: es, d: 0.02, color: eyeC },
    { x: o.headS * 0.34 - es, y: eyeY, z: eyeZ, w: es, h: es, d: 0.02, color: eyeC },
  );
  const lw = Math.min(0.16, bw * 0.2);
  const lx = bw / 2 - lw - 0.02;
  const lz = bd / 2 - lw - 0.02;
  boxes.push(
    { x: -lx - lw, y: 0, z: lz, w: lw, h: o.legH, d: lw, color: leg },
    { x: lx, y: 0, z: lz, w: lw, h: o.legH, d: lw, color: leg },
    { x: -lx - lw, y: 0, z: -lz - lw, w: lw, h: o.legH, d: lw, color: leg },
    { x: lx, y: 0, z: -lz - lw, w: lw, h: o.legH, d: lw, color: leg },
  );
  if (o.snout) {
    boxes.push({ x: -0.1, y: o.by + o.bh * 0.3, z: bd / 2 + o.headS - 0.04, w: 0.2, h: 0.14, d: 0.08, color: o.snout });
  }
  return boxes;
}

const MOB_DEFS: Record<string, MobDef> = {
  zombie: {
    kind: 'zombie', name: '僵尸', hp: 20, dmg: 5, speed: 2.4, hw: 0.32, height: 1.98, hostile: true,
    build: () => humanoid('#4E9E4E', '#2E8B8B', '#3E5AA8', true),
  },
  skeleton: {
    kind: 'skeleton', name: '骷髅', hp: 18, dmg: 6, speed: 3.0, hw: 0.32, height: 1.98, hostile: true,
    build: () => humanoid('#E8E8E8', '#BDBDBD', '#9E9E9E', true),
  },
  creeper: {
    kind: 'creeper', name: '苦力怕', hp: 20, dmg: 0, speed: 2.7, hw: 0.32, height: 1.9, hostile: true, explode: 20,
    build: () => [
      { x: -0.26, y: 0, z: 0.08, w: 0.24, h: 0.5, d: 0.26, color: '#3E8E3A' },
      { x: 0.02, y: 0, z: 0.08, w: 0.24, h: 0.5, d: 0.26, color: '#3E8E3A' },
      { x: -0.26, y: 0, z: -0.34, w: 0.24, h: 0.5, d: 0.26, color: '#3E8E3A' },
      { x: 0.02, y: 0, z: -0.34, w: 0.24, h: 0.5, d: 0.26, color: '#3E8E3A' },
      { x: -0.25, y: 0.5, z: -0.15, w: 0.5, h: 0.85, d: 0.3, color: '#5DBB4E' },
      { x: -0.27, y: 1.35, z: -0.27, w: 0.54, h: 0.54, d: 0.54, color: '#5DBB4E' },
      // 经典苦力怕脸由贴图板呈现
    ],
  },
  spider: {
    kind: 'spider', name: '蜘蛛', hp: 16, dmg: 5, speed: 3.6, hw: 0.6, height: 0.95, hostile: true,
    build: () => {
      const leg = '#1B1B22';
      const boxes: BoxDef[] = [
        { x: -0.45, y: 0.42, z: -0.4, w: 0.9, h: 0.42, d: 0.85, color: '#2B2B33' },
        { x: -0.28, y: 0.42, z: 0.42, w: 0.56, h: 0.4, d: 0.4, color: '#23232B' },
        // 红眼由贴图板呈现
      ];
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 4; i++) {
          boxes.push({ x: s > 0 ? 0.45 : -1.15, y: 0.5, z: -0.35 + i * 0.22, w: 0.7, h: 0.07, d: 0.07, color: leg });
        }
      }
      return boxes;
    },
  },
  slime: {
    kind: 'slime', name: '史莱姆', hp: 14, dmg: 4, speed: 2.0, hw: 0.45, height: 0.9, hostile: true, hop: true,
    build: () => [
      { x: -0.45, y: 0, z: -0.45, w: 0.9, h: 0.88, d: 0.9, color: '#8BC34A' },
      // 果冻脸由贴图板呈现
    ],
  },
  boss: {
    kind: 'boss', name: '巨型尸王', hp: 80, dmg: 12, speed: 2.6, hw: 0.32, height: 1.98, hostile: true,
    build: () => humanoid('#7E57C2', '#4A148C', '#311B92', true),
  },
  // ---------------- v2.1 世界 BOSS（寻宝模式常驻，体型由 mul.scale 放大） ----------------
  boss_zombie: {
    kind: 'boss_zombie', name: '巨型僵尸王', hp: 800, dmg: 35, speed: 2.2, hw: 0.32, height: 1.98,
    hostile: true, worldBoss: true,
    build: () => {
      const boxes = humanoid('#4E9E4E', '#1B5E20', '#3E5AA8', true);
      // 金色王冠
      boxes.push(
        { x: -0.27, y: 1.97, z: -0.27, w: 0.54, h: 0.1, d: 0.54, color: '#FFD54F' },
        { x: -0.23, y: 2.07, z: -0.23, w: 0.1, h: 0.12, d: 0.1, color: '#FFD54F' },
        { x: 0.13, y: 2.07, z: -0.23, w: 0.1, h: 0.12, d: 0.1, color: '#FFD54F' },
        { x: -0.05, y: 2.07, z: 0.13, w: 0.1, h: 0.12, d: 0.1, color: '#FFD54F' },
      );
      return boxes;
    },
  },
  boss_golem: {
    kind: 'boss_golem', name: '岩石巨像', hp: 1200, dmg: 45, speed: 1.7, hw: 0.55, height: 2.55,
    hostile: true, worldBoss: true,
    build: () => [
      { x: -0.45, y: 0, z: -0.3, w: 0.4, h: 0.9, d: 0.6, color: '#8D8D93' },    // 左腿
      { x: 0.05, y: 0, z: -0.3, w: 0.4, h: 0.9, d: 0.6, color: '#8D8D93' },     // 右腿
      { x: -0.6, y: 0.9, z: -0.35, w: 1.2, h: 1.1, d: 0.7, color: '#75757D' },  // 躯干
      { x: -0.3, y: 2.0, z: -0.28, w: 0.6, h: 0.55, d: 0.56, color: '#9E9EA6' },// 头
      { x: -0.22, y: 2.2, z: 0.29, w: 0.12, h: 0.1, d: 0.04, color: '#FF8A3D' },// 左眼（发光橙）
      { x: 0.1, y: 2.2, z: 0.29, w: 0.12, h: 0.1, d: 0.04, color: '#FF8A3D' },  // 右眼
      { x: -1.0, y: 0.9, z: -0.28, w: 0.4, h: 1.15, d: 0.56, color: '#6A6A72' },// 左臂
      { x: 0.6, y: 0.9, z: -0.28, w: 0.4, h: 1.15, d: 0.56, color: '#6A6A72' }, // 右臂
      { x: -0.5, y: 1.6, z: 0.36, w: 1.0, h: 0.3, d: 0.12, color: '#5E5E66' },  // 背脊
    ],
  },
  boss_spider: {
    kind: 'boss_spider', name: '蜘蛛女皇', hp: 1000, dmg: 30, speed: 3.0, hw: 0.6, height: 0.95,
    hostile: true, worldBoss: true, summon: 3,
    build: () => {
      const leg = '#3A2444';
      const boxes: BoxDef[] = [
        { x: -0.45, y: 0.42, z: -0.4, w: 0.9, h: 0.42, d: 0.85, color: '#4A2B5E' },
        { x: -0.28, y: 0.42, z: 0.42, w: 0.56, h: 0.4, d: 0.4, color: '#3E2450' },
        // 金色皇冠
        { x: -0.2, y: 0.84, z: -0.2, w: 0.4, h: 0.08, d: 0.4, color: '#FFD54F' },
        { x: -0.14, y: 0.92, z: -0.14, w: 0.08, h: 0.1, d: 0.08, color: '#FFD54F' },
        { x: 0.06, y: 0.92, z: -0.14, w: 0.08, h: 0.1, d: 0.08, color: '#FFD54F' },
      ];
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 4; i++) {
          boxes.push({ x: s > 0 ? 0.45 : -1.15, y: 0.5, z: -0.35 + i * 0.22, w: 0.7, h: 0.07, d: 0.07, color: leg });
        }
      }
      return boxes;
    },
  },
  pig: {
    kind: 'pig', name: '小猪', hp: 6, dmg: 0, speed: 1.4, hw: 0.45, height: 0.95, hostile: false,
    build: () => quadruped('#F4A7B9', '#F4A7B9', '#E291A4', { bw: 0.7, bh: 0.55, bd: 0.95, by: 0.38, headS: 0.45, legH: 0.38, snout: '#E28EA6' }),
  },
  sheep: {
    kind: 'sheep', name: '绵羊', hp: 6, dmg: 0, speed: 1.3, hw: 0.45, height: 1.1, hostile: false,
    build: () => quadruped('#F5F5F5', '#D7CCC8', '#8D8D8D', { bw: 0.75, bh: 0.65, bd: 1.0, by: 0.42, headS: 0.42, legH: 0.42 }),
  },
  chicken: {
    kind: 'chicken', name: '小鸡', hp: 4, dmg: 0, speed: 1.6, hw: 0.25, height: 0.7, hostile: false,
    build: () => [
      { x: -0.22, y: 0.22, z: -0.25, w: 0.44, h: 0.4, d: 0.5, color: '#FAFAFA' },
      { x: -0.15, y: 0.6, z: 0.2, w: 0.3, h: 0.3, d: 0.3, color: '#FAFAFA' },
      { x: -0.07, y: 0.68, z: 0.5, w: 0.14, h: 0.08, d: 0.1, color: '#FDD835' },
      { x: -0.05, y: 0.56, z: 0.48, w: 0.1, h: 0.1, d: 0.04, color: '#E53935' },
      { x: -0.12, y: 0, z: -0.05, w: 0.06, h: 0.22, d: 0.06, color: '#FDD835' },
      { x: 0.06, y: 0, z: -0.05, w: 0.06, h: 0.22, d: 0.06, color: '#FDD835' },
    ],
  },
  // ---------------- v2.2 新增动物 ----------------
  rabbit: {
    kind: 'rabbit', name: '野兔', hp: 6, dmg: 0, speed: 3.4, hw: 0.3, height: 0.6, hostile: false,
    fleeDist: 4,
    build: () => {
      const boxes = quadruped('#EDEDED', '#F5F5F5', '#D7CCC8', { bw: 0.5, bh: 0.4, bd: 0.7, by: 0.24, headS: 0.36, legH: 0.24 });
      // 长耳 + 尾巴
      boxes.push(
        { x: -0.14, y: 0.58, z: 0.3, w: 0.07, h: 0.26, d: 0.07, color: '#F5F5F5' },
        { x: 0.07, y: 0.58, z: 0.3, w: 0.07, h: 0.26, d: 0.07, color: '#F5F5F5' },
        { x: -0.06, y: 0.3, z: -0.42, w: 0.12, h: 0.12, d: 0.12, color: '#FFFFFF' },
      );
      return boxes;
    },
  },
  boar: {
    kind: 'boar', name: '野猪', hp: 30, dmg: 8, speed: 3.0, hw: 0.45, height: 1.0, hostile: true,
    aggro: 8, wallStun: 1,
    build: () => {
      const boxes = quadruped('#6D4C41', '#5D4037', '#3E2723', { bw: 0.8, bh: 0.6, bd: 1.05, by: 0.4, headS: 0.5, legH: 0.4, snout: '#8D6E63' });
      // 獠牙 + 鬃毛
      boxes.push(
        { x: -0.24, y: 0.46, z: 0.98, w: 0.06, h: 0.16, d: 0.06, color: '#FFF8E1' },
        { x: 0.18, y: 0.46, z: 0.98, w: 0.06, h: 0.16, d: 0.06, color: '#FFF8E1' },
        { x: -0.06, y: 0.98, z: -0.3, w: 0.12, h: 0.12, d: 0.55, color: '#4E342E' },
      );
      return boxes;
    },
  },
  fox: {
    kind: 'fox', name: '狐狸', hp: 18, dmg: 5, speed: 3.4, hw: 0.32, height: 0.7, hostile: true,
    build: () => {
      const boxes = quadruped('#E65100', '#EF6C00', '#3E2723', { bw: 0.55, bh: 0.45, bd: 0.8, by: 0.26, headS: 0.4, legH: 0.26, snout: '#FFF8E1' });
      // 尖耳 + 大尾巴
      boxes.push(
        { x: -0.15, y: 0.62, z: 0.22, w: 0.07, h: 0.16, d: 0.07, color: '#BF360C' },
        { x: 0.08, y: 0.62, z: 0.22, w: 0.07, h: 0.16, d: 0.07, color: '#BF360C' },
        { x: -0.12, y: 0.28, z: -0.56, w: 0.24, h: 0.2, d: 0.34, color: '#FF7043' },
        { x: -0.08, y: 0.3, z: -0.84, w: 0.16, h: 0.16, d: 0.14, color: '#FFF8E1' },
      );
      return boxes;
    },
  },
  vulture: {
    kind: 'vulture', name: '秃鹫', hp: 12, dmg: 7, speed: 3.2, hw: 0.35, height: 0.6, hostile: true,
    flying: true, diveCd: 4,
    build: () => [
      { x: -0.18, y: 0, z: -0.16, w: 0.36, h: 0.24, d: 0.42, color: '#4E342E' },
      { x: -0.48, y: 0.02, z: -0.12, w: 0.32, h: 0.05, d: 0.34, color: '#5D4037' },
      { x: 0.16, y: 0.02, z: -0.12, w: 0.32, h: 0.05, d: 0.34, color: '#5D4037' },
      { x: -0.11, y: 0.12, z: 0.2, w: 0.22, h: 0.2, d: 0.18, color: '#BCAAA4' },
      { x: -0.04, y: 0.16, z: 0.38, w: 0.08, h: 0.08, d: 0.1, color: '#FDD835' },
      { x: -0.05, y: 0.24, z: 0.27, w: 0.04, h: 0.04, d: 0.04, color: '#212121' },
      { x: 0.01, y: 0.24, z: 0.27, w: 0.04, h: 0.04, d: 0.04, color: '#212121' },
    ],
  },

  troll: {
    kind: 'troll', name: '巨魔', hp: 220, dmg: 25, speed: 1.44, hw: 0.32, height: 1.98, hostile: true,
    aoe: 2, windup: 1.0,
    build: () => {
      const boxes = humanoid('#5D7E3A', '#3E5A28', '#6B4423', true);
      // 头顶双角
      boxes.push(
        { x: -0.2, y: 1.97, z: -0.1, w: 0.1, h: 0.28, d: 0.1, color: '#F5F5DC' },
        { x: 0.1, y: 1.97, z: -0.1, w: 0.1, h: 0.28, d: 0.1, color: '#F5F5DC' },
      );
      return boxes;
    },
  },
  gas: {
    kind: 'gas', name: '毒物怪', hp: 60, dmg: 8, speed: 2.0, hw: 0.45, height: 0.9, hostile: true, hop: true,
    poisonCloud: { radius: 2.5, duration: 4, dps: 4 },
    build: () => [
      { x: -0.45, y: 0, z: -0.45, w: 0.9, h: 0.88, d: 0.9, color: '#66BB6A' },
      // 体内气泡
      { x: -0.15, y: 0.3, z: -0.15, w: 0.12, h: 0.12, d: 0.12, color: '#A5D6A7' },
      { x: 0.1, y: 0.5, z: 0.05, w: 0.08, h: 0.08, d: 0.08, color: '#C8E6C9' },
      { x: -0.05, y: 0.15, z: 0.12, w: 0.07, h: 0.07, d: 0.07, color: '#A5D6A7' },
    ],
  },
  bat: {
    kind: 'bat', name: '蝙蝠', hp: 40, dmg: 10, speed: 3.6, hw: 0.3, height: 0.5, hostile: true,
    flying: true, diveCd: 4,
    build: () => [
      // 躯干
      { x: -0.12, y: 0, z: -0.15, w: 0.24, h: 0.18, d: 0.3, color: '#3E2723' },
      // 两翼
      { x: -0.5, y: 0.02, z: -0.05, w: 0.38, h: 0.04, d: 0.22, color: '#5D4037' },
      { x: 0.12, y: 0.02, z: -0.05, w: 0.38, h: 0.04, d: 0.22, color: '#5D4037' },
      // 红眼
      { x: -0.06, y: 0.05, z: 0.16, w: 0.05, h: 0.05, d: 0.04, color: '#FF5252' },
      { x: 0.01, y: 0.05, z: 0.16, w: 0.05, h: 0.05, d: 0.04, color: '#FF5252' },
    ],
  },
  samurai: {
    kind: 'samurai', name: '亡灵武士', hp: 180, dmg: 22, speed: 2.6, hw: 0.32, height: 1.98, hostile: true,
    parryChance: 0.3,
    build: () => {
      const boxes = humanoid('#E8E8E8', '#455A64', '#37474F', true);
      // 兜帽
      boxes.push({ x: -0.27, y: 1.45, z: -0.27, w: 0.54, h: 0.2, d: 0.54, color: '#263238' });
      // 肩甲
      boxes.push(
        { x: -0.34, y: 1.4, z: -0.16, w: 0.12, h: 0.18, d: 0.32, color: '#607D8B' },
        { x: 0.22, y: 1.4, z: -0.16, w: 0.12, h: 0.18, d: 0.32, color: '#607D8B' },
      );
      return boxes;
    },
  },
  boss_troll: {
    kind: 'boss_troll', name: '巨魔王', hp: 600, dmg: 40, speed: 1.6, hw: 0.5, height: 2.8, hostile: true,
    aoe: 3, windup: 1.2, bossBar: true,
    build: () => {
      const boxes = humanoid('#4A6B2E', '#2E4A1E', '#5D4037', true);
      // 巨角
      boxes.push(
        { x: -0.22, y: 1.97, z: -0.12, w: 0.12, h: 0.38, d: 0.12, color: '#FFF8E1' },
        { x: 0.1, y: 1.97, z: -0.12, w: 0.12, h: 0.38, d: 0.12, color: '#FFF8E1' },
      );
      return boxes;
    },
  },
  // ---------------- v2.3 地图生态 + 斗兽场扩充 ----------------
  scorpion: {
    kind: 'scorpion', name: '蝎子', hp: 55, dmg: 9, speed: 2.8, hw: 0.4, height: 0.6, hostile: true,
    poisonHit: { dur: 3, dps: 3 },
    build: () => {
      const body = '#B8691B';
      const dark = '#8A4B12';
      const boxes: BoxDef[] = [
        { x: -0.32, y: 0.12, z: -0.42, w: 0.64, h: 0.26, d: 0.9, color: body },
        { x: -0.2, y: 0.14, z: 0.46, w: 0.4, h: 0.22, d: 0.28, color: dark },
        // 双钳
        { x: -0.5, y: 0.14, z: 0.5, w: 0.22, h: 0.16, d: 0.3, color: dark },
        { x: 0.28, y: 0.14, z: 0.5, w: 0.22, h: 0.16, d: 0.3, color: dark },
        // 尾针（向上翘起三节 + 毒钩）
        { x: -0.08, y: 0.36, z: -0.5, w: 0.16, h: 0.16, d: 0.2, color: body },
        { x: -0.07, y: 0.5, z: -0.62, w: 0.14, h: 0.14, d: 0.16, color: dark },
        { x: -0.06, y: 0.62, z: -0.56, w: 0.12, h: 0.12, d: 0.14, color: '#5D2F0C' },
        { x: -0.04, y: 0.66, z: -0.44, w: 0.08, h: 0.08, d: 0.14, color: '#3E1F08' },
        // 眼
        { x: -0.12, y: 0.3, z: 0.7, w: 0.06, h: 0.06, d: 0.04, color: '#212121' },
        { x: 0.06, y: 0.3, z: 0.7, w: 0.06, h: 0.06, d: 0.04, color: '#212121' },
      ];
      // 六条腿
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 3; i++) {
          boxes.push({ x: s > 0 ? 0.3 : -0.55, y: 0.12, z: -0.3 + i * 0.26, w: 0.25, h: 0.06, d: 0.08, color: dark });
        }
      }
      return boxes;
    },
  },
  sandworm: {
    kind: 'sandworm', name: '沙虫', hp: 130, dmg: 18, speed: 2.1, hw: 0.5, height: 0.9, hostile: true,
    build: () => [
      // 三节环节身体（贴地匍匐）
      { x: -0.34, y: 0, z: -0.7, w: 0.68, h: 0.5, d: 0.55, color: '#C8A15A' },
      { x: -0.38, y: 0, z: -0.18, w: 0.76, h: 0.58, d: 0.55, color: '#B8934E' },
      { x: -0.42, y: 0, z: 0.34, w: 0.84, h: 0.72, d: 0.6, color: '#D9B36A' },
      // 口器（深色环 + 尖牙）
      { x: -0.3, y: 0.1, z: 0.92, w: 0.6, h: 0.5, d: 0.14, color: '#5D4037' },
      { x: -0.2, y: 0.2, z: 1.04, w: 0.08, h: 0.14, d: 0.06, color: '#FFF8E1' },
      { x: 0.12, y: 0.2, z: 1.04, w: 0.08, h: 0.14, d: 0.06, color: '#FFF8E1' },
      { x: -0.04, y: 0.42, z: 1.04, w: 0.08, h: 0.14, d: 0.06, color: '#FFF8E1' },
    ],
  },
  snowfox: {
    kind: 'snowfox', name: '雪狐', hp: 14, dmg: 4, speed: 4.4, hw: 0.3, height: 0.65, hostile: true,
    aggro: 14,
    build: () => {
      const boxes = quadruped('#F5F7FA', '#FFFFFF', '#B0BEC5', { bw: 0.5, bh: 0.4, bd: 0.75, by: 0.24, headS: 0.38, legH: 0.24, snout: '#90A4AE' });
      boxes.push(
        { x: -0.14, y: 0.58, z: 0.2, w: 0.07, h: 0.14, d: 0.07, color: '#FFFFFF' },
        { x: 0.07, y: 0.58, z: 0.2, w: 0.07, h: 0.14, d: 0.07, color: '#FFFFFF' },
        { x: -0.11, y: 0.26, z: -0.54, w: 0.22, h: 0.18, d: 0.32, color: '#ECEFF1' },
        { x: -0.07, y: 0.28, z: -0.8, w: 0.14, h: 0.14, d: 0.14, color: '#FFFFFF' },
      );
      return boxes;
    },
  },
  icewolf: {
    kind: 'icewolf', name: '冰狼', hp: 45, dmg: 9, speed: 3.6, hw: 0.4, height: 0.95, hostile: true,
    aggro: 18,
    build: () => {
      const boxes = quadruped('#78909C', '#90A4AE', '#546E7A', { bw: 0.6, bh: 0.5, bd: 1.0, by: 0.34, headS: 0.44, legH: 0.34, snout: '#ECEFF1' });
      boxes.push(
        { x: -0.15, y: 0.76, z: 0.3, w: 0.08, h: 0.14, d: 0.08, color: '#546E7A' },
        { x: 0.07, y: 0.76, z: 0.3, w: 0.08, h: 0.14, d: 0.08, color: '#546E7A' },
        // 冰蓝眼
        { x: -0.14, y: 0.52, z: 0.88, w: 0.06, h: 0.06, d: 0.04, color: '#4FC3F7' },
        { x: 0.08, y: 0.52, z: 0.88, w: 0.06, h: 0.06, d: 0.04, color: '#4FC3F7' },
        // 尾
        { x: -0.08, y: 0.4, z: -0.72, w: 0.16, h: 0.14, d: 0.3, color: '#90A4AE' },
      );
      return boxes;
    },
  },
  polarbear: {
    kind: 'polarbear', name: '北极熊', hp: 170, dmg: 22, speed: 1.9, hw: 0.55, height: 1.5, hostile: true,
    knock: 2, aggro: 16,
    build: () => {
      const boxes = quadruped('#F5F5F5', '#FFFFFF', '#E0E0E0', { bw: 1.0, bh: 0.8, bd: 1.4, by: 0.5, headS: 0.56, legH: 0.5, snout: '#D7CCC8' });
      boxes.push(
        { x: -0.18, y: 1.28, z: 0.42, w: 0.1, h: 0.1, d: 0.1, color: '#E0E0E0' },
        { x: 0.08, y: 1.28, z: 0.42, w: 0.1, h: 0.1, d: 0.1, color: '#E0E0E0' },
        { x: -0.16, y: 0.98, z: 0.96, w: 0.07, h: 0.07, d: 0.04, color: '#212121' },
        { x: 0.09, y: 0.98, z: 0.96, w: 0.07, h: 0.07, d: 0.04, color: '#212121' },
      );
      return boxes;
    },
  },
  cavebat: {
    kind: 'cavebat', name: '洞穴蝙蝠', hp: 25, dmg: 8, speed: 3.8, hw: 0.3, height: 0.5, hostile: true,
    flying: true, diveCd: 3,
    build: () => [
      { x: -0.14, y: 0, z: -0.16, w: 0.28, h: 0.2, d: 0.32, color: '#37474F' },
      { x: -0.56, y: 0.03, z: -0.06, w: 0.42, h: 0.05, d: 0.26, color: '#546E7A' },
      { x: 0.14, y: 0.03, z: -0.06, w: 0.42, h: 0.05, d: 0.26, color: '#546E7A' },
      { x: -0.05, y: 0.06, z: 0.17, w: 0.05, h: 0.05, d: 0.04, color: '#FFEE58' },
      { x: 0.01, y: 0.06, z: 0.17, w: 0.05, h: 0.05, d: 0.04, color: '#FFEE58' },
      // 尖耳
      { x: -0.12, y: 0.18, z: -0.06, w: 0.06, h: 0.1, d: 0.06, color: '#263238' },
      { x: 0.06, y: 0.18, z: -0.06, w: 0.06, h: 0.1, d: 0.06, color: '#263238' },
    ],
  },
  stonegolem: {
    kind: 'stonegolem', name: '石傀儡', hp: 380, dmg: 18, speed: 1.5, hw: 0.5, height: 2.2, hostile: true,
    dmgReduce: 0.2, noKnock: true,
    build: () => [
      { x: -0.4, y: 0, z: -0.26, w: 0.34, h: 0.75, d: 0.52, color: '#8D8D93' },
      { x: 0.06, y: 0, z: -0.26, w: 0.34, h: 0.75, d: 0.52, color: '#8D8D93' },
      { x: -0.52, y: 0.75, z: -0.3, w: 1.04, h: 0.9, d: 0.6, color: '#75757D' },
      { x: -0.26, y: 1.65, z: -0.24, w: 0.52, h: 0.5, d: 0.48, color: '#9E9EA6' },
      { x: -0.18, y: 1.82, z: 0.25, w: 0.1, h: 0.08, d: 0.04, color: '#FFD54F' },
      { x: 0.08, y: 1.82, z: 0.25, w: 0.1, h: 0.08, d: 0.04, color: '#FFD54F' },
      { x: -0.86, y: 0.75, z: -0.24, w: 0.34, h: 0.95, d: 0.48, color: '#6A6A72' },
      { x: 0.52, y: 0.75, z: -0.24, w: 0.34, h: 0.95, d: 0.48, color: '#6A6A72' },
      // 苔痕
      { x: -0.52, y: 1.3, z: 0.31, w: 0.3, h: 0.2, d: 0.04, color: '#7CB342' },
    ],
  },
  shadow: {
    kind: 'shadow', name: '暗影', hp: 90, dmg: 26, speed: 3.2, hw: 0.32, height: 1.98, hostile: true,
    blink: 0.3,
    build: () => {
      const boxes = humanoid('#1A1A22', '#12121A', '#0C0C12', true);
      // 紫瞳 + 烟雾肩
      boxes.push(
        { x: -0.16, y: 1.66, z: 0.26, w: 0.08, h: 0.08, d: 0.04, color: '#BA68C8' },
        { x: 0.08, y: 1.66, z: 0.26, w: 0.08, h: 0.08, d: 0.04, color: '#BA68C8' },
        { x: -0.34, y: 1.4, z: -0.18, w: 0.68, h: 0.12, d: 0.36, color: '#2A2A38' },
      );
      return boxes;
    },
  },
  // ---------------- MC 生态扩充：牛 / 村民 / 狼 / 末影人 / 女巫 ----------------
  cow: {
    kind: 'cow', name: '牛', hp: 10, dmg: 0, speed: 1.2, hw: 0.5, height: 1.25, hostile: false,
    fleeDist: 4,
    build: () => {
      const boxes = quadruped('#3E2723', '#4E342E', '#212121', {
        bw: 0.85, bh: 0.62, bd: 1.2, by: 0.44, headS: 0.48, legH: 0.44, snout: '#D7CCC8',
      });
      boxes.push(
        // 白斑
        { x: -0.45, y: 0.55, z: -0.35, w: 0.04, h: 0.34, d: 0.36, color: '#ECEFF1' },
        { x: 0.41, y: 0.62, z: 0.05, w: 0.04, h: 0.28, d: 0.3, color: '#ECEFF1' },
        // 双角
        { x: -0.22, y: 1.04, z: 0.7, w: 0.07, h: 0.16, d: 0.07, color: '#FFF8E1' },
        { x: 0.15, y: 1.04, z: 0.7, w: 0.07, h: 0.16, d: 0.07, color: '#FFF8E1' },
        // 尾巴
        { x: -0.05, y: 0.5, z: -0.72, w: 0.1, h: 0.1, d: 0.3, color: '#212121' },
      );
      return boxes;
    },
  },
  villager: {
    kind: 'villager', name: '村民', hp: 8, dmg: 0, speed: 1.1, hw: 0.32, height: 1.98, hostile: false,
    fleeDist: 3,
    build: () => {
      const boxes = humanoid('#C68642', '#6D4C41', '#4E342E', false);
      boxes.push(
        // 标志性大鼻子
        { x: -0.09, y: 1.55, z: 0.26, w: 0.18, h: 0.24, d: 0.16, color: '#A1663A' },
        // 粗眉
        { x: -0.24, y: 1.86, z: 0.25, w: 0.48, h: 0.06, d: 0.04, color: '#3E2723' },
        // 腰带
        { x: -0.29, y: 0.76, z: -0.16, w: 0.58, h: 0.1, d: 0.32, color: '#5D4037' },
      );
      return boxes;
    },
  },
  wolf: {
    kind: 'wolf', name: '野狼', hp: 26, dmg: 7, speed: 3.6, hw: 0.38, height: 0.85, hostile: true,
    aggro: 18,
    build: () => {
      const boxes = quadruped('#9E9E9E', '#BDBDBD', '#757575', {
        bw: 0.55, bh: 0.45, bd: 0.95, by: 0.3, headS: 0.4, legH: 0.3, snout: '#E0E0E0',
      });
      boxes.push(
        // 尖耳
        { x: -0.16, y: 0.8, z: 0.32, w: 0.08, h: 0.14, d: 0.08, color: '#616161' },
        { x: 0.08, y: 0.8, z: 0.32, w: 0.08, h: 0.14, d: 0.08, color: '#616161' },
        // 红眼
        { x: -0.14, y: 0.6, z: 0.86, w: 0.06, h: 0.06, d: 0.04, color: '#FF5252' },
        { x: 0.08, y: 0.6, z: 0.86, w: 0.06, h: 0.06, d: 0.04, color: '#FF5252' },
        // 尾巴
        { x: -0.08, y: 0.42, z: -0.66, w: 0.16, h: 0.14, d: 0.3, color: '#9E9E9E' },
      );
      return boxes;
    },
  },
  enderman: {
    kind: 'enderman', name: '末影人', hp: 70, dmg: 14, speed: 3.2, hw: 0.3, height: 2.6, hostile: true,
    blink: 0.35,
    build: () => [
      // 细长双腿
      { x: -0.2, y: 0, z: -0.1, w: 0.16, h: 1.5, d: 0.16, color: '#14141C' },
      { x: 0.04, y: 0, z: -0.1, w: 0.16, h: 1.5, d: 0.16, color: '#14141C' },
      // 躯干
      { x: -0.22, y: 1.5, z: -0.14, w: 0.44, h: 0.7, d: 0.24, color: '#0E0E16' },
      // 头
      { x: -0.18, y: 2.2, z: -0.16, w: 0.36, h: 0.36, d: 0.36, color: '#1A1A24' },
      // 紫色发光眼
      { x: -0.13, y: 2.34, z: 0.2, w: 0.1, h: 0.06, d: 0.04, color: '#E040FB' },
      { x: 0.03, y: 2.34, z: 0.2, w: 0.1, h: 0.06, d: 0.04, color: '#E040FB' },
      // 垂到地面的长臂
      { x: -0.34, y: 0.55, z: -0.1, w: 0.12, h: 1.5, d: 0.12, color: '#0E0E16' },
      { x: 0.22, y: 0.55, z: -0.1, w: 0.12, h: 1.5, d: 0.12, color: '#0E0E16' },
    ],
  },
  witch: {
    kind: 'witch', name: '女巫', hp: 55, dmg: 10, speed: 2.2, hw: 0.32, height: 2.4, hostile: true,
    poisonHit: { dur: 3, dps: 4 },
    build: () => {
      const boxes = humanoid('#6E8B5A', '#4A148C', '#311B92', false);
      boxes.push(
        // 尖顶女巫帽
        { x: -0.32, y: 1.9, z: -0.32, w: 0.64, h: 0.06, d: 0.64, color: '#311B92' },
        { x: -0.18, y: 1.96, z: -0.18, w: 0.36, h: 0.42, d: 0.36, color: '#311B92' },
        { x: -0.1, y: 2.38, z: -0.1, w: 0.2, h: 0.2, d: 0.2, color: '#4A148C' },
        // 长鼻 + 绿眼
        { x: -0.07, y: 1.6, z: 0.27, w: 0.14, h: 0.2, d: 0.12, color: '#8AA06E' },
        { x: -0.14, y: 1.86, z: 0.26, w: 0.28, h: 0.05, d: 0.03, color: '#7CFFB2' },
        // 手中的紫色药水瓶
        { x: 0.32, y: 1.05, z: 0.1, w: 0.12, h: 0.18, d: 0.12, color: '#E040FB' },
      );
      return boxes;
    },
  },

  // ---------------- 三大泰坦（参考图里的巨型机甲：苦力怕 / 铁甲 / 白骨） ----------------
  titan_creeper: {
    kind: 'titan_creeper', name: '苦力怕泰坦', hp: 3000, dmg: 58, speed: 2.0,
    hw: 1.2, height: 4.5, hostile: true, worldBoss: true, passive: true, aoe: 3.4, knock: 3,
    build: () => {
      const G = '#4C9B3F', GD = '#2E6B27', GL = '#6FC756', ARM = '#8D9A86', EYE = '#FF3B30';
      const boxes: BoxDef[] = [
        // 四条粗腿
        { x: -0.9, y: 0, z: -0.55, w: 0.62, h: 1.5, d: 0.62, color: GD },
        { x: 0.28, y: 0, z: -0.55, w: 0.62, h: 1.5, d: 0.62, color: GD },
        { x: -0.9, y: 0, z: 0.3, w: 0.62, h: 1.5, d: 0.62, color: GD },
        { x: 0.28, y: 0, z: 0.3, w: 0.62, h: 1.5, d: 0.62, color: GD },
        // 躯干 + 胸前装甲
        { x: -0.85, y: 1.5, z: -0.7, w: 1.7, h: 1.8, d: 1.4, color: G },
        { x: -0.72, y: 1.7, z: 0.68, w: 1.44, h: 1.4, d: 0.12, color: ARM },
        // 头
        { x: -0.62, y: 3.3, z: -0.62, w: 1.24, h: 1.15, d: 1.24, color: GL },
        // 经典苦力怕脸
        { x: -0.42, y: 3.9, z: 0.62, w: 0.28, h: 0.3, d: 0.06, color: '#1B1B1B' },
        { x: 0.14, y: 3.9, z: 0.62, w: 0.28, h: 0.3, d: 0.06, color: '#1B1B1B' },
        { x: -0.22, y: 3.5, z: 0.62, w: 0.16, h: 0.3, d: 0.06, color: '#1B1B1B' },
        { x: 0.06, y: 3.5, z: 0.62, w: 0.16, h: 0.3, d: 0.06, color: '#1B1B1B' },
        { x: -0.3, y: 3.24, z: 0.62, w: 0.6, h: 0.16, d: 0.06, color: '#1B1B1B' },
        // 双肩炮
        { x: -1.25, y: 2.8, z: -0.25, w: 0.42, h: 0.42, d: 0.9, color: GD },
        { x: 0.83, y: 2.8, z: -0.25, w: 0.42, h: 0.42, d: 0.9, color: GD },
        // 发光眼
        { x: -0.42, y: 3.98, z: 0.69, w: 0.22, h: 0.14, d: 0.05, color: EYE },
        { x: 0.2, y: 3.98, z: 0.69, w: 0.22, h: 0.14, d: 0.05, color: EYE },
        // 背脊散热片
        { x: -0.1, y: 1.9, z: -0.86, w: 0.2, h: 1.1, d: 0.16, color: GD },
      ];
      return boxes;
    },
  },
  titan_iron: {
    kind: 'titan_iron', name: '铁甲泰坦', hp: 4200, dmg: 66, speed: 1.6,
    hw: 1.35, height: 5.0, hostile: true, worldBoss: true, passive: true,
    aoe: 3.8, knock: 3.5, dmgReduce: 0.15, noKnock: true,
    build: () => {
      const R = '#B03A2E', RD = '#7E2418', RL = '#D9573F', IRON = '#9AA0A6', DARK = '#3A3A40';
      return [
        // 双腿 + 脚掌
        { x: -0.95, y: 0, z: -0.45, w: 0.7, h: 1.55, d: 0.9, color: IRON },
        { x: 0.25, y: 0, z: -0.45, w: 0.7, h: 1.55, d: 0.9, color: IRON },
        { x: -1.05, y: 0, z: -0.55, w: 0.9, h: 0.3, d: 1.15, color: DARK },
        { x: 0.15, y: 0, z: -0.55, w: 0.9, h: 0.3, d: 1.15, color: DARK },
        // 髋 + 胸躯 + 胸甲
        { x: -1.05, y: 1.55, z: -0.6, w: 2.1, h: 0.6, d: 1.2, color: RD },
        { x: -1.25, y: 2.15, z: -0.7, w: 2.5, h: 1.5, d: 1.4, color: R },
        { x: -1.0, y: 2.3, z: 0.68, w: 2.0, h: 1.1, d: 0.14, color: RL },
        // 熔岩核心
        { x: -0.32, y: 2.6, z: 0.76, w: 0.64, h: 0.5, d: 0.1, color: '#FFC24A' },
        { x: -0.2, y: 2.68, z: 0.82, w: 0.4, h: 0.3, d: 0.08, color: '#FFF0A8' },
        // 肩甲 + 手臂 + 巨拳
        { x: -1.95, y: 3.3, z: -0.55, w: 0.9, h: 0.8, d: 1.1, color: RD },
        { x: 1.05, y: 3.3, z: -0.55, w: 0.9, h: 0.8, d: 1.1, color: RD },
        { x: -1.95, y: 1.9, z: -0.4, w: 0.62, h: 1.5, d: 0.8, color: IRON },
        { x: 1.33, y: 1.9, z: -0.4, w: 0.62, h: 1.5, d: 0.8, color: IRON },
        { x: -2.1, y: 1.05, z: -0.5, w: 0.95, h: 0.9, d: 1.0, color: DARK },
        { x: 1.15, y: 1.05, z: -0.5, w: 0.95, h: 0.9, d: 1.0, color: DARK },
        // 头 + 面甲 + 金瞳 + 铁角
        { x: -0.55, y: 3.65, z: -0.5, w: 1.1, h: 0.9, d: 1.0, color: R },
        { x: -0.45, y: 3.85, z: 0.48, w: 0.9, h: 0.14, d: 0.08, color: '#2B2B2B' },
        { x: -0.36, y: 3.98, z: 0.52, w: 0.24, h: 0.12, d: 0.06, color: '#FFD54F' },
        { x: 0.12, y: 3.98, z: 0.52, w: 0.24, h: 0.12, d: 0.06, color: '#FFD54F' },
        { x: -0.62, y: 4.5, z: -0.2, w: 0.2, h: 0.35, d: 0.2, color: IRON },
        { x: 0.42, y: 4.5, z: -0.2, w: 0.2, h: 0.35, d: 0.2, color: IRON },
      ];
    },
  },
  titan_bone: {
    kind: 'titan_bone', name: '白骨泰坦', hp: 3600, dmg: 62, speed: 2.2,
    hw: 1.15, height: 4.85, hostile: true, worldBoss: true, passive: true, aoe: 3.4, knock: 3,
    build: () => {
      const B = '#EDE7DA', BD = '#C9C2B2', GLOW = '#7CFFB2';
      const boxes: BoxDef[] = [
        // 腿骨 + 脚掌
        { x: -0.75, y: 0, z: -0.35, w: 0.34, h: 1.9, d: 0.34, color: B },
        { x: 0.41, y: 0, z: -0.35, w: 0.34, h: 1.9, d: 0.34, color: B },
        { x: -0.85, y: 0, z: -0.5, w: 0.55, h: 0.24, d: 0.7, color: BD },
        { x: 0.3, y: 0, z: -0.5, w: 0.55, h: 0.24, d: 0.7, color: BD },
        // 骨盆 + 脊椎 + 肩
        { x: -0.85, y: 1.9, z: -0.45, w: 1.7, h: 0.42, d: 0.7, color: BD },
        { x: -0.14, y: 2.32, z: -0.18, w: 0.28, h: 1.5, d: 0.28, color: B },
        { x: -1.15, y: 3.7, z: -0.35, w: 2.3, h: 0.3, d: 0.6, color: BD },
        // 头骨 + 下颚 + 眼窝 + 绿瞳
        { x: -0.48, y: 4.0, z: -0.4, w: 0.96, h: 0.8, d: 0.8, color: B },
        { x: -0.34, y: 3.85, z: 0.38, w: 0.68, h: 0.36, d: 0.08, color: BD },
        { x: -0.3, y: 4.25, z: 0.4, w: 0.24, h: 0.2, d: 0.06, color: '#151515' },
        { x: 0.06, y: 4.25, z: 0.4, w: 0.24, h: 0.2, d: 0.06, color: '#151515' },
        { x: -0.28, y: 4.3, z: 0.43, w: 0.18, h: 0.1, d: 0.04, color: GLOW },
        { x: 0.1, y: 4.3, z: 0.43, w: 0.18, h: 0.1, d: 0.04, color: GLOW },
        // 手臂骨 + 骨锤
        { x: -1.35, y: 2.1, z: -0.3, w: 0.22, h: 1.5, d: 0.22, color: B },
        { x: 1.13, y: 2.1, z: -0.3, w: 0.22, h: 1.5, d: 0.22, color: B },
        { x: -1.5, y: 1.55, z: -0.3, w: 0.55, h: 0.9, d: 0.72, color: BD },
        { x: 1.0, y: 1.55, z: -0.3, w: 0.55, h: 0.9, d: 0.72, color: BD },
      ];
      // 肋骨
      for (let i = 0; i < 4; i++) {
        boxes.push({ x: -0.72, y: 2.45 + i * 0.32, z: -0.5, w: 1.44, h: 0.16, d: 0.42, color: B });
      }
      return boxes;
    },
  },

  // ---------------- v2.3 斗兽场 BOSS 轮换 ----------------
  tiger: {
    kind: 'tiger', name: '虎王', hp: 500, dmg: 20, speed: 3.4, hw: 0.5, height: 1.3, hostile: true,
    bossBar: true, knock: 1.5,
    build: () => {
      const boxes = quadruped('#E65100', '#F57C00', '#BF360C', { bw: 0.85, bh: 0.65, bd: 1.3, by: 0.42, headS: 0.6, legH: 0.42, snout: '#FFF8E1' });
      boxes.push(
        // 黑纹
        { x: -0.43, y: 0.9, z: -0.3, w: 0.86, h: 0.08, d: 0.14, color: '#212121' },
        { x: -0.43, y: 0.9, z: 0.1, w: 0.86, h: 0.08, d: 0.14, color: '#212121' },
        { x: -0.43, y: 0.9, z: -0.62, w: 0.86, h: 0.08, d: 0.14, color: '#212121' },
        // 耳 + 獠牙
        { x: -0.2, y: 1.0, z: 0.5, w: 0.1, h: 0.14, d: 0.1, color: '#BF360C' },
        { x: 0.1, y: 1.0, z: 0.5, w: 0.1, h: 0.14, d: 0.1, color: '#BF360C' },
        { x: -0.18, y: 0.48, z: 1.24, w: 0.07, h: 0.16, d: 0.06, color: '#FFFFFF' },
        { x: 0.11, y: 0.48, z: 1.24, w: 0.07, h: 0.16, d: 0.06, color: '#FFFFFF' },
        // 王字额纹（金色）
        { x: -0.14, y: 0.86, z: 0.86, w: 0.28, h: 0.05, d: 0.04, color: '#FFD54F' },
        // 尾
        { x: -0.06, y: 0.6, z: -1.0, w: 0.12, h: 0.12, d: 0.44, color: '#E65100' },
        { x: -0.06, y: 0.6, z: -1.14, w: 0.12, h: 0.12, d: 0.14, color: '#212121' },
      );
      return boxes;
    },
  },
  rex: {
    kind: 'rex', name: '暴龙', hp: 900, dmg: 32, speed: 2.2, hw: 0.6, height: 2.4, hostile: true,
    bossBar: true, knock: 2,
    build: () => [
      // 双腿（粗壮）
      { x: -0.42, y: 0, z: -0.3, w: 0.34, h: 0.85, d: 0.6, color: '#33691E' },
      { x: 0.08, y: 0, z: -0.3, w: 0.34, h: 0.85, d: 0.6, color: '#33691E' },
      // 躯干
      { x: -0.45, y: 0.8, z: -0.55, w: 0.9, h: 0.9, d: 1.3, color: '#558B2F' },
      // 尾（两节渐细）
      { x: -0.28, y: 0.9, z: -1.25, w: 0.56, h: 0.5, d: 0.75, color: '#4A7C29' },
      { x: -0.16, y: 0.95, z: -1.9, w: 0.32, h: 0.32, d: 0.66, color: '#33691E' },
      // 大头 + 下颚
      { x: -0.34, y: 1.6, z: 0.5, w: 0.68, h: 0.6, d: 0.7, color: '#558B2F' },
      { x: -0.28, y: 1.4, z: 0.56, w: 0.56, h: 0.22, d: 0.6, color: '#33691E' },
      // 牙
      { x: -0.24, y: 1.58, z: 1.18, w: 0.07, h: 0.12, d: 0.05, color: '#FFFFFF' },
      { x: 0.17, y: 1.58, z: 1.18, w: 0.07, h: 0.12, d: 0.05, color: '#FFFFFF' },
      { x: -0.03, y: 1.58, z: 1.18, w: 0.07, h: 0.12, d: 0.05, color: '#FFFFFF' },
      // 眼（红）
      { x: -0.36, y: 1.95, z: 0.85, w: 0.05, h: 0.09, d: 0.09, color: '#FF5252' },
      { x: 0.31, y: 1.95, z: 0.85, w: 0.05, h: 0.09, d: 0.09, color: '#FF5252' },
      // 小短手
      { x: -0.5, y: 1.0, z: 0.45, w: 0.12, h: 0.3, d: 0.12, color: '#33691E' },
      { x: 0.38, y: 1.0, z: 0.45, w: 0.12, h: 0.3, d: 0.12, color: '#33691E' },
    ],
  },
  dragon: {
    kind: 'dragon', name: '巨龙', hp: 1200, dmg: 28, speed: 2.6, hw: 0.7, height: 1.8, hostile: true,
    bossBar: true, flying: true, diveCd: 5, aoe: 2.5,
    build: () => {
      const body = '#6A1B9A';
      const dark = '#4A148C';
      const boxes = quadruped(body, '#7B1FA2', dark, { bw: 1.0, bh: 0.75, bd: 1.5, by: 0.5, headS: 0.62, legH: 0.5, snout: '#8E24AA' });
      boxes.push(
        // 双翼
        { x: -1.5, y: 1.1, z: -0.4, w: 1.0, h: 0.08, d: 0.7, color: dark },
        { x: 0.5, y: 1.1, z: -0.4, w: 1.0, h: 0.08, d: 0.7, color: dark },
        { x: -1.2, y: 1.18, z: -0.5, w: 0.7, h: 0.06, d: 0.5, color: '#8E24AA' },
        { x: 0.5, y: 1.18, z: -0.5, w: 0.7, h: 0.06, d: 0.5, color: '#8E24AA' },
        // 双角 + 金瞳
        { x: -0.24, y: 1.32, z: 0.5, w: 0.1, h: 0.3, d: 0.1, color: '#FFF8E1' },
        { x: 0.14, y: 1.32, z: 0.5, w: 0.1, h: 0.3, d: 0.1, color: '#FFF8E1' },
        { x: -0.22, y: 0.98, z: 1.08, w: 0.09, h: 0.09, d: 0.04, color: '#FFD54F' },
        { x: 0.13, y: 0.98, z: 1.08, w: 0.09, h: 0.09, d: 0.04, color: '#FFD54F' },
        // 尾刺
        { x: -0.08, y: 0.7, z: -1.15, w: 0.16, h: 0.16, d: 0.5, color: dark },
        { x: -0.1, y: 0.72, z: -1.32, w: 0.2, h: 0.2, d: 0.18, color: '#FFD54F' },
      );
      return boxes;
    },
  },
  // ---------------- v2.6 四大世界 BOSS：朱雀 / 玄武 / 白虎 / 霸王龙 ----------------
  /** 朱雀：赤金凤鸟，三层展翼 + 长尾翎羽 + 青焰金瞳（被动世界 BOSS） */
  boss_zhuque: {
    kind: 'boss_zhuque', name: '朱雀', hp: 3400, dmg: 58, speed: 2.6,
    hw: 1.25, height: 4.0, hostile: true, worldBoss: true, passive: true, leash: 11, aoe: 3.4, knock: 2.4,
    build: () => {
      const boxes: BoxDef[] = [];
      const B = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
        boxes.push({ x, y, z, w, h, d, color: c });
      };
      // 左右对称：x 为左侧坐标，右侧镜像
      const S = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
        B(x, y, z, w, h, d, c);
        B(-x - w, y, z, w, h, d, c);
      };
      const RED = '#D84315', RED_D = '#A62F0C', RED_L = '#F4511E';
      const GOLD = '#FFB300', GOLD_L = '#FFD54F', CREAM = '#FFF3E0', EYE = '#4DD0E1';
      // 双腿 + 金爪（后蹬式站姿，重心略后）
      S(0.34, 0.92, -0.05, 0.3, 0.92, 0.3, GOLD);
      S(0.24, 0, -0.1, 0.48, 0.18, 0.44, GOLD_L);
      for (let i = -1; i <= 1; i++) {
        S(0.3 + i * 0.15, 0, 0.14, 0.1, 0.1, 0.44, '#FFCA28');
      }
      // 躯干：胸 / 前胸亮羽 / 颈胸白羽 / 背部暗羽（纺锤形）
      B(-0.62, 0.95, -0.6, 1.24, 1.15, 1.55, RED);
      B(-0.52, 1.02, 0.6, 1.04, 1.0, 0.78, RED_L);
      B(-0.44, 1.78, 0.3, 0.88, 0.55, 1.05, CREAM);
      B(-0.56, 1.9, -0.8, 1.12, 0.28, 1.55, RED_D);
      // 胸前层叠覆羽：交错排列的小羽片，近看也有清晰层次
      for (let row = 0; row < 4; row++) {
        const count = 3 + row;
        const yy = 1.82 - row * 0.2;
        for (let col = 0; col < count; col++) {
          const xx = (col - (count - 1) / 2) * 0.2;
          B(xx - 0.085, yy, 1.385 + row * 0.008, 0.17, 0.14, 0.055,
            (row + col) % 3 === 0 ? GOLD_L : (row + col) % 2 === 0 ? '#FF8A65' : RED_L);
          B(xx - 0.045, yy - 0.055, 1.43 + row * 0.008, 0.09, 0.055, 0.035, CREAM);
        }
      }
      // 颈（三段上扬）/ 头 / 金喙 / 青瞳
      B(-0.27, 2.08, 0.9, 0.54, 0.44, 0.58, RED_L);
      B(-0.24, 2.44, 1.12, 0.48, 0.4, 0.52, RED_L);
      B(-0.3, 2.66, 1.24, 0.6, 0.52, 0.74, RED);
      B(-0.13, 2.72, 1.96, 0.26, 0.18, 0.44, GOLD);
      B(-0.11, 2.63, 2.37, 0.22, 0.1, 0.2, GOLD_L);
      S(0.26, 2.88, 1.99, 0.08, 0.12, 0.06, EYE);
      // 冠羽三根
      B(-0.05, 3.18, 1.18, 0.1, 0.52, 0.14, GOLD);
      B(-0.18, 3.08, 1.02, 0.1, 0.38, 0.12, RED_L);
      B(0.08, 3.08, 1.02, 0.1, 0.38, 0.12, RED_L);
      // 双翼：内 / 中 / 外三段逐级上扬后掠（有厚度，正视呈翼面）+ 金色前缘
      S(0.58, 1.84, -0.6, 1.48, 0.42, 1.7, RED);
      S(2.06, 2.08, -0.86, 1.24, 0.38, 1.42, RED_L);
      S(3.3, 2.4, -1.08, 0.92, 0.32, 1.05, GOLD);
      S(0.58, 2.28, 1.04, 1.48, 0.14, 0.2, GOLD_L);
      S(2.06, 2.48, 0.48, 1.24, 0.14, 0.2, GOLD_L);
      S(3.3, 2.74, -0.08, 0.92, 0.12, 0.18, GOLD_L);
      // 下垂飞羽：三段下缘各排一列，拉出翼的锯齿轮廓
      for (let i = 0; i < 5; i++) {
        S(0.72 + i * 0.3, 1.4 - i * 0.02, 0.34 - i * 0.16, 0.24, 0.62, 0.22,
          i % 2 === 0 ? RED_D : RED_L);
      }
      for (let i = 0; i < 4; i++) {
        S(2.16 + i * 0.3, 1.66 - i * 0.02, -0.02 - i * 0.2, 0.22, 0.56, 0.2,
          i % 2 === 0 ? RED_L : GOLD);
      }
      for (let i = 0; i < 3; i++) {
        S(3.38 + i * 0.28, 2.02 - i * 0.02, -0.48 - i * 0.18, 0.2, 0.5, 0.18,
          i % 2 === 0 ? GOLD : GOLD_L);
      }
      // 翼面覆羽与翼缘高光：细羽片沿三段翼骨逐级收窄
      for (let i = 0; i < 9; i++) {
        const xx = 0.76 + i * 0.38;
        const yy = 2.24 + Math.max(0, i - 3) * 0.09;
        const zz = 0.74 - Math.max(0, i - 3) * 0.18;
        S(xx, yy, zz, 0.22, 0.09, 0.48, i % 3 === 0 ? GOLD_L : i % 2 ? '#FF7043' : RED_L);
        S(xx + 0.04, yy + 0.09, zz + 0.04, 0.14, 0.045, 0.3, '#FFCC80');
      }
      // 尾翎：五根长羽，金尖上扬，尾端带朱雀特有的眼状斑纹
      for (let i = -2; i <= 2; i++) {
        const x = i * 0.3;
        const lift = Math.abs(i) * 0.09;
        B(x, 1.3 + Math.abs(i) * 0.05, -1.2, 0.24, 0.1, 1.55, i % 2 === 0 ? RED_L : RED);
        B(x + 0.03, 1.48 + Math.abs(i) * 0.07, -2.6, 0.18, 0.08, 1.1, GOLD);
        B(x + 0.05, 1.66 + lift, -3.6, 0.14, 0.07, 0.5, GOLD_L);
        B(x - 0.015, 1.74 + lift, -3.48, 0.27, 0.045, 0.32, GOLD_L);
        B(x + 0.04, 1.79 + lift, -3.43, 0.16, 0.035, 0.2, EYE);
        B(x + 0.085, 1.82 + lift, -3.39, 0.07, 0.025, 0.11, '#263238');
        B(x - 0.005, 1.46 + Math.abs(i) * 0.05, -2.3, 0.25, 0.04, 0.12, '#FFCC80');
      }
      return boxes;
    },
  },
  /** 玄武：玄甲巨龟，蛇缠龟背，甲片金线（高防、慢速） */
  boss_xuanwu: {
    kind: 'boss_xuanwu', name: '玄武', hp: 5200, dmg: 50, speed: 1.2,
    hw: 1.65, height: 3.0, hostile: true, worldBoss: true, passive: true, leash: 11, aoe: 3.8, knock: 2.8,
    build: () => {
      const boxes: BoxDef[] = [];
      const B = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
        boxes.push({ x, y, z, w, h, d, color: c });
      };
      const S = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
        B(x, y, z, w, h, d, c);
        B(-x - w, y, z, w, h, d, c);
      };
      const SHELL_D = '#173A2C', SHELL_M = '#1F4B39', SHELL_L = '#2A6249', SHELL_HL = '#3C7A5C';
      const SKIN = '#37474F', SKIN_L = '#546E7A', LINE = '#B08A2E';
      // 四足 + 脚掌（探出龟甲外，避免从正面看不到腿）
      S(1.12, 0.55, 0.72, 0.62, 0.9, 0.74, SKIN);
      S(1.12, 0.55, -1.42, 0.62, 0.9, 0.74, SKIN);
      S(1.06, 0, 0.62, 0.74, 0.2, 0.94, '#263238');
      S(1.06, 0, -1.52, 0.74, 0.2, 0.94, '#263238');
      // 脚掌鳞甲与三枚弯爪
      for (let i = -1; i <= 1; i++) {
        S(1.12 + i * 0.2, 0.02, 1.48, 0.12, 0.1, 0.28, '#CFD8DC');
        S(1.12 + i * 0.2, 0.02, -1.82, 0.12, 0.1, 0.26, '#CFD8DC');
      }
      for (let row = 0; row < 3; row++) {
        S(1.1, 0.48 + row * 0.24, 1.43, 0.6, 0.07, 0.08, SKIN_L);
        S(1.1, 0.48 + row * 0.24, -1.51, 0.6, 0.07, 0.08, SKIN_L);
      }
      // 尾
      B(-0.18, 0.62, -1.95, 0.36, 0.34, 0.55, SKIN);
      B(-0.12, 0.56, -2.35, 0.24, 0.22, 0.4, SKIN_L);
      // 龟甲：底缘裙边 + 四层穹顶（逐层收窄抬高，呈龟背弧）
      B(-1.38, 0.78, -1.34, 2.76, 0.2, 2.68, SHELL_D);
      B(-1.3, 0.95, -1.26, 2.6, 0.46, 2.52, SHELL_D);
      B(-1.1, 1.38, -1.05, 2.2, 0.42, 2.12, SHELL_M);
      B(-0.82, 1.78, -0.78, 1.64, 0.36, 1.58, SHELL_L);
      B(-0.46, 2.12, -0.44, 0.92, 0.28, 0.88, SHELL_HL);
      B(-0.26, 2.38, -0.24, 0.52, 0.16, 0.48, SHELL_HL);
      // 甲片金线（横纵网格）
      for (let i = -1; i <= 1; i++) {
        B(-1.08, 1.42, i * 0.7 - 0.06, 2.16, 0.32, 0.12, LINE);
        B(i * 0.7 - 0.06, 1.42, -1.02, 0.12, 0.32, 2.06, LINE);
      }
      // 穹顶六边甲片的体素近似：每片都有暗边、亮心和细金脊
      for (let row = 0; row < 4; row++) {
        const zz = -0.9 + row * 0.58;
        const yy = row === 0 || row === 3 ? 1.83 : 2.18;
        const count = row === 0 || row === 3 ? 3 : 4;
        for (let col = 0; col < count; col++) {
          const xx = (col - (count - 1) / 2) * 0.48;
          B(xx - 0.2, yy, zz, 0.4, 0.07, 0.38, SHELL_D);
          B(xx - 0.15, yy + 0.07, zz + 0.035, 0.3, 0.045, 0.3, (row + col) % 2 ? SHELL_L : SHELL_HL);
          B(xx - 0.025, yy + 0.115, zz + 0.06, 0.05, 0.025, 0.24, LINE);
        }
      }
      // 甲缘骨刺
      for (let i = 0; i < 5; i++) {
        S(1.3, 0.9, -1.2 + i * 0.6, 0.22, 0.22, 0.26, SKIN_L);
      }
      // 颈 / 头 / 喙 / 红瞳
      B(-0.4, 1.05, 1.3, 0.8, 0.72, 0.8, SKIN);
      B(-0.5, 1.58, 1.9, 1.0, 0.7, 1.05, SKIN_L);
      B(-0.36, 1.64, 2.86, 0.72, 0.36, 0.3, '#263238');
      S(0.28, 1.98, 2.95, 0.16, 0.14, 0.08, '#FF5252');
      // 蛇：沿龟背盘绕（S 形）+ 蛇颈昂起 + 金瞳蛇信
      for (let i = 0; i < 9; i++) {
        const z = -1.0 + i * 0.3;
        const y = 2.52 + Math.sin(i * 0.75) * 0.12;
        const x = Math.sin(i * 1.15) * 0.52;
        B(x - 0.2, y, z, 0.4, 0.4, 0.36, i % 2 === 0 ? '#1B5E20' : '#2E7D32');
        if (i % 2 === 0) B(x - 0.22, y + 0.38, z + 0.02, 0.44, 0.06, 0.3, '#81C784');
        B(x - 0.1, y + 0.405, z + 0.06, 0.08, 0.035, 0.1, '#C5E1A5');
        B(x + 0.035, y + 0.405, z + 0.17, 0.08, 0.035, 0.1, '#A5D6A7');
        S(Math.abs(x) + 0.19, y + 0.1, z + 0.05, 0.04, 0.12, 0.18, '#43A047');
      }
      B(0.16, 2.78, 1.5, 0.36, 0.36, 0.72, '#1B5E20');
      B(0.06, 3.02, 2.05, 0.56, 0.46, 0.68, '#2E7D32');
      S(0.3, 3.3, 2.28, 0.1, 0.1, 0.1, '#FFD54F');
      B(0.26, 2.96, 2.72, 0.14, 0.06, 0.3, '#E53935');
      return boxes;
    },
  },
  /** 白虎：雪白巨虎，黑王纹、靛蓝瞳、金线勾边 */
  boss_baihu: {
    kind: 'boss_baihu', name: '白虎', hp: 3600, dmg: 64, speed: 3.2,
    hw: 1.3, height: 4.1, hostile: true, worldBoss: true, passive: true, leash: 11, aoe: 3.0, knock: 2.6,
    build: () => {
      const boxes: BoxDef[] = [];
      const B = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
        boxes.push({ x, y, z, w, h, d, color: c });
      };
      const S = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
        B(x, y, z, w, h, d, c);
        B(-x - w, y, z, w, h, d, c);
      };
      const W = '#FAFAFA', W_D = '#E2E6E9', BK = '#263238', EYE = '#40C4FF';
      // 四肢 + 前掌 + 利爪
      S(0.68, 0, 1.02, 0.6, 1.2, 0.62, W);
      S(0.68, 0, -1.42, 0.6, 1.2, 0.64, W);
      S(0.62, 0, 1.1, 0.72, 0.2, 0.9, W_D);
      S(0.62, 0, -1.5, 0.72, 0.2, 0.92, W_D);
      for (let i = -1; i <= 1; i++) {
        S(0.66 + i * 0.2, 0, 1.92, 0.1, 0.1, 0.22, '#B0BEC5');
        S(0.66 + i * 0.2, 0, -2.34, 0.1, 0.1, 0.22, '#B0BEC5');
      }
      // 躯干 + 胸 + 后臀 + 胸前浅色
      B(-1.15, 1.1, -1.6, 2.3, 1.15, 3.05, W);
      B(-0.98, 1.1, 1.28, 1.96, 1.2, 0.45, W);
      B(-1.02, 1.15, -1.82, 2.04, 1.0, 0.4, W_D);
      B(-0.78, 1.15, 1.72, 1.56, 0.85, 0.16, '#F5F5F5');
      // 背脊亮边
      B(-0.2, 2.22, -1.55, 0.4, 0.16, 2.95, '#EEF1F3');
      // 黑纹：背脊横纹 + 体侧纵纹
      for (let i = 0; i < 5; i++) {
        B(-1.17, 2.18, -1.3 + i * 0.6, 2.34, 0.1, 0.15, BK);
      }
      for (let i = 0; i < 4; i++) {
        S(1.12, 1.3 + i * 0.25, -1.1 + i * 0.5, 0.06, 0.13, 0.5, BK);
        S(1.125, 1.34 + i * 0.25, -0.86 + i * 0.5, 0.065, 0.3, 0.1, BK);
        S(1.13, 1.47 + i * 0.25, -1.28 + i * 0.5, 0.07, 0.08, 0.24, '#37474F');
      }
      // 肩背蓬松毛簇：三层浅灰阴影让白色躯干不显得平板
      for (let i = 0; i < 7; i++) {
        S(0.82, 2.12 - (i % 2) * 0.12, -1.48 + i * 0.43, 0.22, 0.18, 0.3, i % 2 ? W_D : '#FFFFFF');
        S(0.9, 1.02, -1.42 + i * 0.42, 0.16, 0.18, 0.24, '#ECEFF1');
      }
      // 颈 / 头 / 下颚 / 吻 / 鼻
      B(-0.5, 1.9, 1.4, 1.0, 0.75, 0.9, W);
      B(-0.58, 2.35, 1.5, 1.16, 0.82, 1.15, W);
      B(-0.48, 2.28, 1.62, 0.96, 0.4, 1.1, W_D);
      B(-0.34, 2.34, 2.62, 0.68, 0.36, 0.34, '#F7F7F7');
      B(-0.16, 2.62, 2.98, 0.32, 0.14, 0.07, BK);
      S(0.56, 2.36, 2.12, 0.18, 0.42, 0.38, '#F0F3F5');
      // 眼窝 + 眼 + 眉纹 + 耳
      S(0.16, 2.72, 2.6, 0.28, 0.2, 0.06, BK);
      S(0.2, 2.75, 2.64, 0.2, 0.13, 0.06, EYE);
      S(0.18, 2.92, 2.6, 0.26, 0.06, 0.07, BK);
      // 前腿 / 后腿黑环（正面可见）
      S(0.62, 1.55, 1.02, 0.74, 0.13, 0.7, BK);
      S(0.62, 1.22, 1.06, 0.74, 0.11, 0.66, BK);
      S(0.62, 1.32, -1.46, 0.74, 0.13, 0.7, BK);
      S(0.4, 3.14, 1.42, 0.32, 0.38, 0.16, W);
      S(0.46, 3.22, 1.46, 0.18, 0.22, 0.1, '#F8BBD0');
      // 獠牙 + 完整「王」字额纹（贴在头部前表面，避免被头骨方块遮住）
      S(0.34, 2.16, 2.68, 0.09, 0.2, 0.07, '#FFFFFF');
      B(-0.27, 3.08, 2.655, 0.54, 0.055, 0.055, BK);
      B(-0.23, 2.98, 2.657, 0.46, 0.05, 0.055, BK);
      B(-0.29, 2.88, 2.66, 0.58, 0.055, 0.055, BK);
      B(-0.04, 2.88, 2.665, 0.08, 0.26, 0.055, BK);
      // 颊毛与眼尾细纹
      for (let i = 0; i < 3; i++) {
        S(0.54 + i * 0.055, 2.38 + i * 0.13, 2.28 - i * 0.09, 0.18, 0.1, 0.26, i % 2 ? W_D : W);
        S(0.37, 2.77 - i * 0.09, 2.66, 0.18 + i * 0.05, 0.035, 0.045, BK);
      }
      // 尾：三节 + 黑环，向上扬起
      B(-0.13, 1.85, -1.85, 0.26, 0.26, 0.85, W);
      B(-0.11, 2.02, -2.55, 0.22, 0.22, 0.7, BK);
      B(-0.1, 2.2, -3.1, 0.2, 0.2, 0.5, W);
      B(-0.08, 2.36, -3.5, 0.16, 0.16, 0.3, BK);
      B(-0.07, 2.5, -3.72, 0.14, 0.14, 0.24, W);
      return boxes;
    },
  },
  /** 霸王龙：远古霸主，巨颅獠牙、粗尾背棘、短臂利爪 */
  boss_rex: {
    kind: 'boss_rex', name: '霸王龙', hp: 4200, dmg: 70, speed: 2.5,
    hw: 1.3, height: 4.7, hostile: true, worldBoss: true, passive: true, leash: 11, aoe: 3.6, knock: 2.8,
    build: () => {
      const boxes: BoxDef[] = [];
      const B = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
        boxes.push({ x, y, z, w, h, d, color: c });
      };
      const S = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
        B(x, y, z, w, h, d, c);
        B(-x - w, y, z, w, h, d, c);
      };
      const G = '#2E7D32', G_L = '#43A047', G_D = '#1B5E20', BELLY = '#C5E1A5', CLAW = '#ECEFF1';
      // 后腿：大腿 / 小腿 / 脚掌 / 三趾
      S(0.7, 1.45, -0.55, 0.55, 1.45, 0.85, G);
      S(0.78, 0.55, -0.5, 0.42, 1.05, 0.5, G_D);
      S(0.7, 0, -0.45, 0.62, 0.3, 1.1, G_D);
      for (let i = -1; i <= 1; i++) {
        S(0.72 + i * 0.2, 0, 0.6, 0.12, 0.12, 0.3, CLAW);
      }
      // 躯干 / 胸 / 腹甲 / 背棘
      B(-0.95, 1.95, -1.55, 1.9, 1.55, 2.75, G);
      B(-0.8, 2.0, 1.15, 1.6, 1.35, 0.55, G_L);
      B(-0.66, 2.05, -1.4, 1.32, 0.28, 2.5, BELLY);
      for (let i = 0; i < 6; i++) {
        B(-0.11, 3.35 + Math.sin(i * 0.6) * 0.08, -1.4 + i * 0.5, 0.22, 0.3, 0.28, G_D);
      }
      // 体侧细鳞：交错明暗鳞片 + 腹部横向甲片
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 7; col++) {
          const zz = -1.35 + col * 0.39 + (row % 2) * 0.16;
          S(0.94, 2.16 + row * 0.29, zz, 0.055, 0.16, 0.23,
            (row + col) % 3 === 0 ? '#66BB6A' : (row + col) % 2 ? G_D : G_L);
        }
      }
      for (let i = 0; i < 6; i++) B(-0.58, 2.04, -1.25 + i * 0.42, 1.16, 0.055, 0.1, '#DCEDC8');
      // 尾：四节渐细 + 分节甲环 + 背鳍
      B(-0.45, 2.15, -2.45, 0.9, 0.85, 1.0, G);
      B(-0.35, 2.3, -3.35, 0.7, 0.65, 0.95, G);
      B(-0.26, 2.45, -4.2, 0.52, 0.5, 0.85, G_D);
      B(-0.18, 2.58, -4.95, 0.36, 0.34, 0.6, G_D);
      for (let i = 0; i < 6; i++) {
        const ss = 0.78 - i * 0.085;
        const yy = 2.96 + i * 0.085;
        const zz = -2.48 - i * 0.5;
        B(-ss / 2, yy, zz, ss, 0.075, 0.13, i % 2 ? G_L : '#81C784');
        B(-0.07, yy + 0.07, zz - 0.05, 0.14, 0.22 - i * 0.018, 0.16, G_D);
      }
      // 颈 / 颅骨 / 上颚 / 下颚
      B(-0.55, 3.0, 1.15, 1.1, 0.85, 0.85, G);
      B(-0.62, 3.6, 1.3, 1.24, 0.9, 1.5, G_L);
      B(-0.55, 3.45, 2.7, 1.1, 0.45, 1.1, '#4CAF50');
      B(-0.5, 3.12, 2.55, 1.0, 0.35, 1.25, G);
      // 上下两排獠牙
      for (let i = 0; i < 5; i++) {
        S(0.44, 3.32, 2.75 + i * 0.2, 0.1, 0.2, 0.09, '#FFFFFF');
        S(0.42, 3.12, 2.8 + i * 0.2, 0.09, 0.16, 0.08, '#FFFFFF');
      }
      // 红瞳 + 眉脊 + 鼻孔
      S(0.6, 3.95, 2.42, 0.08, 0.14, 0.14, '#FF5252');
      S(0.54, 4.12, 2.3, 0.24, 0.08, 0.5, G_D);
      B(-0.3, 3.98, 3.68, 0.2, 0.08, 0.12, G_D);
      B(0.1, 3.98, 3.68, 0.2, 0.08, 0.12, G_D);
      // 短臂 + 三指利爪与肩部鳞片
      S(0.95, 2.35, 1.1, 0.18, 0.5, 0.18, G_L);
      S(0.93, 2.28, 1.3, 0.2, 0.12, 0.3, G_D);
      for (let i = -1; i <= 1; i++) S(0.95 + i * 0.065, 2.2 - Math.abs(i) * 0.025, 1.55, 0.055, 0.09, 0.2, CLAW);
      for (let i = 0; i < 4; i++) S(0.77, 3.12 + i * 0.11, 1.12 + i * 0.14, 0.16, 0.08, 0.2, i % 2 ? G_D : '#66BB6A');
      return boxes;
    },
  },
  /** v2.3 寻宝世界 BOSS：烈焰巨龙（参考蓝图里的橙金巨龙：高扬长颈、巨型展翼、金色犄角与背刺） */
  boss_dragon_flame: {
    kind: 'boss_dragon_flame', name: '烈焰巨龙', hp: 2600, dmg: 55, speed: 2.0,
    hw: 1.15, height: 4.10, hostile: true, worldBoss: true, passive: true, leash: 11, aoe: 3.5, knock: 2.5,
    build: () => {
      // ==== 细体素重制：整体由 0.10~0.16 的小方块拼装，贴近参考图的层叠羽翼造型 ====
      const RED = '#C63A0C', RED_D = '#982906', RED_L = '#E25E13';
      const AMBER = '#F0A030', AMBER_D = '#C9740F', AMBER_L = '#FFC861';
      const BONE = '#FFE7B0', GOLD = '#FFD447';
      const MEMB = '#6E3418', MEMB_D = '#4A2110';
      const boxes: BoxDef[] = [];
      const add = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
        boxes.push({ x, y, z, w, h, d, color: c });
      };
      const U = 0.16; // 躯干细体素：更平滑的椭圆截面与鳞甲边缘
      const V = 0.10; // 细部体素
      let si = 0;
      const skin = () => (si++ % 9 === 0 ? RED_L : si % 7 === 0 ? RED_D : RED);

      // ==== 躯干：椭圆截面外壳，逐层细分（胸宽胯窄、背部微隆） ====
      for (let z = -1.30; z < 1.12; z += U) {
        const zc = z + U * 0.5;
        const taper = 1 - Math.max(0, Math.abs(zc + 0.10) - 0.45) * 0.30;
        const rw = 0.56 * taper;
        const rh = 0.50 * taper;
        const cy = 1.56 + Math.max(0, zc) * 0.10;
        for (let x = -rw; x < rw - 0.001; x += U) {
          for (let y = cy - rh; y < cy + rh - 0.001; y += U) {
            const nx = (x + U / 2) / rw;
            const ny = (y + U / 2 - cy) / rh;
            if (nx * nx + ny * ny > 1.0) continue;
            if (Math.abs(nx) < 0.62 && Math.abs(ny) < 0.62) continue; // 只留外壳
            add(x, y, z, U, U, U, skin());
          }
        }
        // 腹甲：横向金橙色鳞带
        if (zc > -1.0 && zc < 0.95) {
          add(-rw * 0.52, cy - rh - 0.01, z, rw * 1.04, 0.09, U, zc > 0.2 ? AMBER : AMBER_D);
        }
      }
      // 胸口金甲片
      add(-0.30, 1.70, 1.02, 0.60, 0.42, 0.10, '#F2B24A');
      add(-0.22, 2.02, 0.92, 0.44, 0.16, 0.10, AMBER_L);
      // 胸前与体侧叠鳞：每片带暗底和金色薄高光，增强近景层次
      for (let row = 0; row < 4; row++) {
        const n = 3 + row;
        for (let col = 0; col < n; col++) {
          const xx = (col - (n - 1) / 2) * 0.15;
          add(xx - 0.065, 1.94 - row * 0.15, 1.12 + row * 0.004, 0.13, 0.105, 0.055,
            (row + col) % 2 ? AMBER : AMBER_D);
          add(xx - 0.04, 2.015 - row * 0.15, 1.17 + row * 0.004, 0.08, 0.025, 0.025, AMBER_L);
        }
      }
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 10; i++) {
          add(sx * 0.54 - 0.035, 1.42 + (i % 3) * 0.17, -1.10 + i * 0.21, 0.07, 0.11, 0.15,
            i % 3 === 0 ? AMBER_D : RED_L);
        }
      }

      // ==== 四肢：2×2 体素腿柱 + 大腿根 + 三趾金爪 ====
      const leg = (cx: number, cz: number, h: number, back: boolean) => {
        for (let y = 0; y < h - 0.01; y += U) {
          for (let ix = 0; ix < 2; ix++) {
            for (let iz = 0; iz < 2; iz++) {
              add(cx - U + ix * U, y, cz - U + iz * U, U, U, U,
                iz === 0 ? (back ? RED_D : RED) : (back ? RED : RED_L));
            }
          }
        }
        add(cx - U * 1.5, h - 0.34, cz - U * 1.5, U * 3, U * 1.8, U * 3, RED_D);
        for (let t = -1; t <= 1; t++) {
          add(cx + t * U * 1.05 - U * 0.42, 0, cz + U * 0.9, U * 0.84, 0.13, U * 1.4, RED_D);
          add(cx + t * U * 1.05 - U * 0.30, 0, cz + U * 2.2, U * 0.60, 0.10, U * 0.9, BONE);
        }
      };
      leg(-0.52, -0.70, 1.14, true);
      leg(0.52, -0.70, 1.14, true);
      leg(-0.46, 0.62, 1.06, false);
      leg(0.46, 0.62, 1.06, false);

      // ==== 长颈：四节椭圆环，向上前倾 ====
      const neck = (cy: number, cz: number, rw: number, rh: number) => {
        for (let x = -rw; x < rw - 0.001; x += U * 0.85) {
          for (let y = cy - rh; y < cy + rh - 0.001; y += U * 0.85) {
            const nx = (x + U * 0.42) / rw;
            const ny = (y + U * 0.42 - cy) / rh;
            if (nx * nx + ny * ny > 1.0) continue;
            if (Math.abs(nx) < 0.52 && Math.abs(ny) < 0.52) continue;
            add(x, y, cz, U * 0.85, U * 0.85, U * 1.35, skin());
          }
        }
      };
      neck(2.16, 0.20, 0.36, 0.30);
      neck(2.52, 0.40, 0.31, 0.27);
      neck(2.86, 0.58, 0.28, 0.25);
      neck(3.14, 0.76, 0.26, 0.23);
      // 颈部金刺
      add(-0.06, 3.30, 0.80, V, 0.16, V, BONE);
      add(-0.06, 2.92, 0.58, V, 0.18, V, BONE);
      add(-0.07, 2.52, 0.34, V, 0.18, V, BONE);

      // ==== 头骨 3×3×4 + 吻部 + 下颚 ====
      const H = 0.19;
      for (let iz = 0; iz < 4; iz++) {
        for (let iy = 0; iy < 3; iy++) {
          for (let ix = -1; ix <= 1; ix++) {
            add(ix * H - H / 2, 3.16 + iy * H, 0.74 + iz * H, H, H, H,
              iy === 2 && ix === 0 ? RED_L : iy === 0 ? RED_D : RED);
          }
        }
      }
      // 吻部（前伸两排）
      for (let iz = 0; iz < 3; iz++) {
        for (let iy = 0; iy < 2; iy++) {
          for (let ix = -1; ix <= 0; ix++) {
            add(ix * H, 3.20 + iy * H, 1.50 + iz * H, H, H, H, iy === 1 ? RED : RED_D);
          }
        }
      }
      // 下颚 + 牙
      add(-0.20, 3.14, 1.32, 0.40, 0.09, 0.72, RED_D);
      for (let i = 0; i < 5; i++) {
        add(-0.17 + i * 0.085, 3.16, 1.94, 0.055, 0.09, 0.055, '#FFF7E2');
        add(-0.17 + i * 0.085, 3.24, 1.94, 0.055, 0.08, 0.055, '#FFF7E2');
      }
      // 金瞳 + 深色眉骨
      for (const s of [-1, 1]) {
        add(s * 0.215 - 0.05, 3.42, 1.44, 0.10, 0.11, 0.07, '#FFDE3D');
        add(s * 0.215 - 0.07, 3.55, 1.38, 0.14, 0.07, 0.14, RED_D);
        // 颊刺
        add(s * 0.26 - 0.05, 3.22, 1.18, 0.10, 0.10, 0.16, BONE);
      }
      // 金色大犄角：六节渐细，向后上方翻卷
      for (const s of [-1, 1]) {
        let hx = s * 0.20, hy = 3.58, hz = 0.98, hs = 0.17;
        for (let i = 0; i < 6; i++) {
          add(hx - hs / 2, hy, hz - hs / 2, hs, hs, hs, i > 3 ? BONE : '#EFC77A');
          hx += s * 0.055;
          hy += 0.075 - i * 0.008;
          hz -= 0.115;
          hs = Math.max(0.07, hs - 0.018);
        }
      }
      // 头冠金片
      add(-0.09, 3.36, 0.78, 0.18, 0.12, V, AMBER_L);

      // ==== 背脊金刺（从肩到胯） ====
      for (let i = 0; i < 9; i++) {
        const zz = 0.80 - i * 0.26;
        add(-0.06, 2.06 - i * 0.012, zz, V, 0.14 + (i % 2) * 0.06, V, BONE);
      }

      // ==== 尾：九节渐细 + 尾刺 + 金尾刃 ====
      let ty = 1.34, tz = -1.40;
      for (let i = 0; i < 9; i++) {
        const s = 0.40 - i * 0.032;
        add(-s / 2, ty, tz, s, s * 0.9, 0.30, i % 3 === 0 ? RED_D : skin());
        if (i % 3 === 1) add(-0.05, ty + s * 0.9, tz, 0.10, 0.14, 0.10, BONE);
        add(-s * 0.38, ty + s * 0.82, tz + 0.04, s * 0.76, 0.055, 0.19, i % 2 ? AMBER_D : AMBER);
        add(-s * 0.22, ty + s * 0.9, tz + 0.075, s * 0.44, 0.035, 0.12, AMBER_L);
        ty -= 0.022;
        tz -= 0.26;
      }
      add(-0.17, ty + 0.10, tz, 0.34, 0.10, 0.36, GOLD);
      add(-0.10, ty + 0.16, tz + 0.10, 0.20, 0.10, 0.22, AMBER_L);

      // ==== 双翼：五根扇形翼骨 + 层叠翼膜 + 金羽前缘 + 翼尖金爪 ====
      const wing = (sx: number) => {
        const ox = 0.42, oy = 2.12, oz = 0.10;
        // [方向X, 方向Z, 长度, 颜色, 额外下垂]
        const rays: Array<[number, number, number, string, number]> = [
          [0.62, 0.34, 3.50, AMBER_L, 0.00],
          [0.58, 0.08, 3.70, AMBER, 0.02],
          [0.52, -0.18, 3.55, AMBER_D, 0.04],
          [0.44, -0.46, 3.20, MEMB, 0.06],
          [0.34, -0.72, 2.65, MEMB_D, 0.08],
        ];
        rays.forEach((r, ri) => {
          const len = r[2];
          const steps = Math.floor(len / 0.16);
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = ox + sx * r[0] * len * t;
            const pz = oz + r[1] * len * t;
            const py = oy + 0.46 * t - 0.34 * t * t - ri * 0.03 - r[4] * t;
            const s = 0.17 - 0.07 * t;
            const c = ri < 3 && i >= steps - 2 ? AMBER_L : r[3];
            add(px - s / 2, py, pz - s / 2, s, s * 0.75, s, c);
          }
        });
        // 翼膜：相邻翼骨间补细块，形成层叠羽片
        for (let ri = 0; ri < rays.length - 1; ri++) {
          const a = rays[ri], b = rays[ri + 1];
          const steps = Math.floor(((a[2] + b[2]) * 0.5) / 0.16);
          for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const px = ox + sx * (a[0] * a[2] + b[0] * b[2]) * 0.5 * t;
            const pz = oz + (a[1] * a[2] + b[1] * b[2]) * 0.5 * t;
            const py = oy + 0.46 * t - 0.34 * t * t - (ri + 0.5) * 0.03 - 0.06;
            add(px - 0.065, py, pz - 0.065, 0.13, 0.075, 0.13,
              i % 4 === 0 ? AMBER_D : ri === 0 ? AMBER : ri % 2 ? MEMB : MEMB_D);
            if (i % 3 === 0) add(px - 0.035, py + 0.075, pz - 0.035, 0.07, 0.025, 0.07, AMBER_L);
          }
        }
        // 翼尖金爪
        add(ox + sx * rays[1][0] * rays[1][2] - 0.07, oy + 0.09, oz + rays[1][1] * rays[1][2] - 0.07,
          0.14, 0.14, 0.14, BONE);
      };
      wing(1);
      wing(-1);

      return boxes;
    },
  },
  /** v2.3.3 寻宝世界 BOSS：熔岩泰坦（黑曜石巨躯 + 熔岩裂纹，被动） */
  boss_titan_lava: {
    kind: 'boss_titan_lava', name: '熔岩泰坦', hp: 2400, dmg: 60, speed: 1.5,
    hw: 1.05, height: 3.95, hostile: true, worldBoss: true, passive: true, leash: 11, aoe: 3.6, knock: 3.2,
    build: () => {
      const OBS = '#343039', OBS_D = '#1E1C23', OBS_L = '#4C4855', ROCK = '#5C5862';
      const LAVA = '#FF6A18', LAVA_L = '#FFC24A', LAVA_D = '#C23A05';
      const boxes: BoxDef[] = [];
      let k = 0;
      const stone = () => (k++ % 11 === 0 ? ROCK : k % 7 === 0 ? OBS_L : k % 5 === 0 ? OBS_D : OBS);
      const add = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) =>
        boxes.push({ x, y, z, w, h, d, color: c });
      // 岩体：按体素切分，只保留外壳（内部剔除，减少面数）；u 越小细节越精
      const mass = (x: number, y: number, z: number, w: number, h: number, d: number, u = 0.16) => {
        const nx = Math.max(1, Math.round(w / u));
        const ny = Math.max(1, Math.round(h / u));
        const nz = Math.max(1, Math.round(d / u));
        const cu = w / nx, cv = h / ny, cw = d / nz;
        for (let ix = 0; ix < nx; ix++) {
          for (let iy = 0; iy < ny; iy++) {
            for (let iz = 0; iz < nz; iz++) {
              if (ix > 0 && ix < nx - 1 && iy > 0 && iy < ny - 1 && iz > 0 && iz < nz - 1) continue;
              add(x + ix * cu, y + iy * cv, z + iz * cw, cu, cv, cw, stone());
            }
          }
        }
      };

      // ==== 双腿 + 宽大脚掌 ====
      mass(-0.78, 0, -0.30, 0.46, 1.35, 0.60);
      mass(0.32, 0, -0.30, 0.46, 1.35, 0.60);
      mass(-0.86, 0, 0.02, 0.62, 0.28, 0.85);
      mass(0.24, 0, 0.02, 0.62, 0.28, 0.85);
      // 脚趾熔岩缝
      add(-0.80, 0.04, 0.76, 0.5, 0.08, 0.10, LAVA_D);
      add(0.30, 0.04, 0.76, 0.5, 0.08, 0.10, LAVA_D);

      // ==== 髋 + 胸躯（上宽下窄） ====
      mass(-0.80, 1.28, -0.42, 1.60, 0.55, 0.84);
      mass(-0.88, 1.78, -0.50, 1.76, 0.60, 0.98);
      mass(-1.05, 2.32, -0.55, 2.10, 0.75, 1.06);

      // ==== 肩甲 ====
      mass(-1.78, 2.62, -0.50, 0.78, 0.72, 1.00);
      mass(1.00, 2.62, -0.50, 0.78, 0.72, 1.00);

      // 肩部叠甲与错落碎石：大轮廓不变，近看增加岩层断面
      for (const s of [-1, 1]) {
        const sx = s < 0 ? -1.76 : 1.02;
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3 - row; col++) {
            add(sx + col * 0.22 + row * 0.07, 3.30 + row * 0.11, -0.34 + col * 0.13,
              0.19, 0.09, 0.34, (row + col) % 2 ? ROCK : OBS_L);
          }
        }
        add(sx + 0.12, 2.64, 0.50, 0.34, 0.13, 0.12, OBS_D);
        add(sx + 0.18, 2.71, 0.56, 0.22, 0.055, 0.06, LAVA_D);
      }

      // ==== 手臂 + 巨拳 ====
      mass(-1.70, 1.55, -0.30, 0.58, 1.15, 0.62);
      mass(1.12, 1.55, -0.30, 0.58, 1.15, 0.62);
      mass(-1.82, 0.62, -0.36, 0.82, 0.92, 0.80);
      mass(1.00, 0.62, -0.36, 0.82, 0.92, 0.80);

      // ==== 头部（小头宽肩，熔岩双眼） ====
      mass(-0.32, 3.06, -0.16, 0.64, 0.62, 0.62, 0.11);
      add(-0.34, 3.50, 0.42, 0.68, 0.14, 0.16, OBS_D);      // 眉骨
      add(-0.26, 3.02, 0.18, 0.52, 0.12, 0.42, OBS_D);      // 下颚
      add(-0.22, 3.36, 0.44, 0.14, 0.10, 0.06, LAVA_L);     // 左眼
      add(0.08, 3.36, 0.44, 0.14, 0.10, 0.06, LAVA_L);      // 右眼
      // 头顶岩刺
      for (const sx of [-1, 0, 1]) {
        add(sx * 0.22 - 0.07, 3.66, -0.06, 0.14, 0.22 - Math.abs(sx) * 0.07, 0.14, ROCK);
      }

      // ==== 胸口熔岩核心 + 裂纹 ====
      add(-0.24, 2.42, 0.48, 0.48, 0.40, 0.08, LAVA);
      add(-0.14, 2.52, 0.53, 0.28, 0.20, 0.06, LAVA_L);
      add(-0.34, 2.08, 0.44, 0.16, 0.32, 0.06, LAVA_D);
      add(-0.62, 2.86, 0.49, 0.10, 0.34, 0.05, LAVA_D);
      add(0.40, 2.66, 0.50, 0.08, 0.46, 0.05, LAVA);
      add(0.66, 2.28, 0.50, 0.12, 0.18, 0.05, LAVA_D);
      add(-0.96, 2.46, 0.30, 0.06, 0.40, 0.12, LAVA_D);
      add(-0.34, 1.54, 0.42, 0.68, 0.10, 0.06, LAVA);
      // 手臂与肩甲缝隙的熔岩
      add(1.32, 1.80, -0.02, 0.06, 0.30, 0.12, LAVA_D);
      add(-1.46, 1.66, -0.02, 0.06, 0.26, 0.12, LAVA_D);
      add(-1.70, 2.96, -0.04, 0.62, 0.10, 0.12, LAVA_D);
      add(1.08, 2.96, -0.04, 0.62, 0.10, 0.12, LAVA_D);

      // ==== 背脊岩刺 ====
      for (let i = 0; i < 3; i++) {
        add(-0.09, 2.30 + i * 0.34, -0.64 - i * 0.02, 0.18, 0.30, 0.18, OBS_L);
      }

      // ==== 细部：指节、膝盖熔岩、肩头碎石（细体素增强） ====
      for (const s of [-1, 1]) {
        const bx = s < 0 ? -1.72 : 1.10;
        for (let i = 0; i < 3; i++) {
          add(bx + i * 0.22, 0.72, 0.42, 0.18, 0.36, 0.16, OBS_D);
        }
        add(bx - 0.02, 0.68, 0.44, 0.72, 0.06, 0.12, LAVA_D);
      }
      add(-0.72, 0.70, 0.28, 0.34, 0.12, 0.06, LAVA_D);
      add(0.38, 0.70, 0.28, 0.34, 0.12, 0.06, LAVA_D);
      add(-1.78, 3.28, -0.22, 0.20, 0.18, 0.20, ROCK);
      add(1.30, 3.24, -0.12, 0.18, 0.16, 0.18, ROCK);
      add(-1.12, 3.00, 0.38, 0.16, 0.14, 0.16, OBS_L);
      add(0.94, 3.00, 0.38, 0.16, 0.14, 0.16, OBS_L);
      add(-0.52, 1.62, 0.46, 0.14, 0.14, 0.06, LAVA);
      add(0.52, 1.78, 0.46, 0.12, 0.20, 0.06, LAVA_D);
      // 分叉细裂纹与亮芯：主裂纹旁增加二级分支，而非简单几条直缝
      const cracks: Array<[number, number, number, number, number]> = [
        [-0.78, 2.68, 0.24, 0.055, 0.20], [-0.55, 2.75, 0.18, 0.05, 0.15],
        [0.18, 2.92, 0.24, 0.05, 0.16], [0.52, 2.50, 0.22, 0.055, 0.18],
        [-0.72, 1.92, 0.20, 0.05, 0.22], [0.62, 1.92, 0.16, 0.05, 0.18],
      ];
      for (let i = 0; i < cracks.length; i++) {
        const c = cracks[i];
        add(c[0], c[1], 0.515, c[2], c[3], 0.035, i % 2 ? LAVA : LAVA_D);
        add(c[0] + c[2] * 0.35, c[1] + c[3] * 0.35, 0.54, c[2] * 0.3, c[3] * 0.3, 0.025, LAVA_L);
      }
      for (const s of [-1, 1]) {
        const bx = s < 0 ? -1.60 : 1.20;
        for (let i = 0; i < 4; i++) {
          add(bx + i * 0.13, 1.98 + i * 0.12, 0.325, 0.075, 0.16, 0.05, i % 2 ? OBS_L : OBS_D);
          if (i % 2 === 0) add(bx + i * 0.13, 2.02 + i * 0.12, 0.375, 0.04, 0.08, 0.025, LAVA_D);
        }
      }
      return boxes;
    },
  },

  // ---------------- v2.5 新增物种：铁傀儡 / 杀人蜂 / 雪傀儡 ----------------
  iron_golem: {
    kind: 'iron_golem', name: '铁傀儡', hp: 260, dmg: 22, speed: 1.55,
    hw: 0.55, height: 2.4, hostile: true, aoe: 2.2, knock: 1.8,
    windup: 0.5, atkPose: 'slam',
    build: () => {
      const I = '#D9D9CF', ID = '#A9A99D', IL = '#F2F2E8';
      const VD = '#4C7A38', VL = '#6FA24E', EYE = '#E53935';
      const b: BoxDef[] = [];
      const a = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) =>
        b.push({ x, y, z, w, h, d, color: c });
      // 双腿 + 脚掌
      a(-0.42, 0, -0.24, 0.34, 1.02, 0.5, ID);
      a(0.08, 0, -0.24, 0.34, 1.02, 0.5, ID);
      a(-0.46, 0, 0.02, 0.4, 0.22, 0.5, IL);
      a(0.06, 0, 0.02, 0.4, 0.22, 0.5, IL);
      // 髋 / 胸
      a(-0.52, 1.0, -0.34, 1.04, 0.32, 0.7, I);
      a(-0.62, 1.3, -0.4, 1.24, 0.78, 0.82, I);
      a(-0.56, 1.3, 0.4, 1.12, 0.7, 0.04, IL);
      // 肩甲
      a(-0.88, 1.9, -0.36, 0.42, 0.42, 0.76, IL);
      a(0.46, 1.9, -0.36, 0.42, 0.42, 0.76, IL);
      // 长臂 + 巨拳
      a(-0.94, 0.84, -0.28, 0.36, 1.24, 0.56, ID);
      a(0.58, 0.84, -0.28, 0.36, 1.24, 0.56, ID);
      a(-1.0, 0.54, -0.34, 0.48, 0.48, 0.68, I);
      a(0.52, 0.54, -0.34, 0.48, 0.48, 0.68, I);
      // 头 + 眼 + 鼻
      a(-0.3, 2.06, -0.28, 0.6, 0.58, 0.58, IL);
      a(-0.22, 2.36, 0.28, 0.16, 0.12, 0.05, EYE);
      a(0.06, 2.36, 0.28, 0.16, 0.12, 0.05, EYE);
      a(-0.06, 2.16, 0.28, 0.12, 0.22, 0.06, ID);
      // 藤蔓裂纹
      a(-0.2, 1.42, 0.41, 0.4, 0.52, 0.04, VD);
      a(-0.62, 1.72, 0.4, 0.22, 0.28, 0.03, VL);
      a(0.36, 1.5, 0.4, 0.2, 0.44, 0.03, VL);
      a(-0.92, 2.28, 0.3, 0.3, 0.12, 0.06, VD);
      return b;
    },
  },
  bee: {
    kind: 'bee', name: '杀人蜂', hp: 26, dmg: 8, speed: 4.4,
    hw: 0.3, height: 0.6, hostile: true, flying: true, diveCd: 3, aggro: 24,
    atkPose: 'stab',
    build: () => [
      { x: -0.3, y: 0.18, z: -0.34, w: 0.6, h: 0.44, d: 0.64, color: '#F2C230' },
      { x: -0.3, y: 0.18, z: -0.14, w: 0.6, h: 0.44, d: 0.1, color: '#2B2B22' },
      { x: -0.3, y: 0.18, z: 0.12, w: 0.6, h: 0.44, d: 0.08, color: '#2B2B22' },
      // 头 + 复眼 + 触角
      { x: -0.2, y: 0.22, z: 0.3, w: 0.4, h: 0.36, d: 0.3, color: '#3C3C30' },
      { x: -0.16, y: 0.44, z: 0.55, w: 0.1, h: 0.08, d: 0.06, color: '#E53935' },
      { x: 0.06, y: 0.44, z: 0.55, w: 0.1, h: 0.08, d: 0.06, color: '#E53935' },
      { x: -0.18, y: 0.58, z: 0.44, w: 0.05, h: 0.2, d: 0.05, color: '#2B2B22' },
      { x: 0.13, y: 0.58, z: 0.44, w: 0.05, h: 0.2, d: 0.05, color: '#2B2B22' },
      // 双翅
      { x: -0.64, y: 0.58, z: -0.12, w: 0.34, h: 0.05, d: 0.44, color: '#E3F2FD' },
      { x: 0.3, y: 0.58, z: -0.12, w: 0.34, h: 0.05, d: 0.44, color: '#E3F2FD' },
      // 尾刺
      { x: -0.06, y: 0.28, z: -0.44, w: 0.12, h: 0.12, d: 0.18, color: '#5D4037' },
    ],
  },
  snow_golem: {
    kind: 'snow_golem', name: '雪傀儡', hp: 45, dmg: 9, speed: 1.9,
    hw: 0.42, height: 1.7, hostile: true, atkPose: 'throw',
    build: () => {
      const S = '#F5FAFF', SD = '#D7E6F2', P = '#E8833A', PD = '#B85E20', ST = '#7A5232';
      return [
        // 雪球下半身 / 上半身
        { x: -0.34, y: 0.3, z: -0.32, w: 0.68, h: 0.68, d: 0.66, color: SD },
        { x: -0.4, y: 0.9, z: -0.38, w: 0.8, h: 0.74, d: 0.78, color: S },
        // 南瓜头
        { x: -0.3, y: 1.58, z: -0.3, w: 0.6, h: 0.56, d: 0.58, color: P },
        { x: -0.2, y: 1.86, z: 0.28, w: 0.14, h: 0.12, d: 0.05, color: '#2B2B22' },
        { x: 0.06, y: 1.86, z: 0.28, w: 0.14, h: 0.12, d: 0.05, color: '#2B2B22' },
        { x: -0.1, y: 1.68, z: 0.3, w: 0.2, h: 0.1, d: 0.04, color: '#2B2B22' },
        // 南瓜纹路 + 瓜柄
        { x: -0.31, y: 1.62, z: 0.2, w: 0.04, h: 0.4, d: 0.08, color: PD },
        { x: 0.27, y: 1.62, z: 0.2, w: 0.04, h: 0.4, d: 0.08, color: PD },
        { x: -0.05, y: 2.12, z: -0.05, w: 0.1, h: 0.14, d: 0.1, color: '#5E7D2A' },
        // 树枝手臂
        { x: -0.74, y: 1.12, z: -0.04, w: 0.44, h: 0.08, d: 0.08, color: ST },
        { x: 0.28, y: 1.12, z: -0.04, w: 0.44, h: 0.08, d: 0.08, color: ST },
        { x: -0.8, y: 1.2, z: -0.04, w: 0.08, h: 0.26, d: 0.08, color: ST },
        { x: 0.72, y: 1.2, z: -0.04, w: 0.08, h: 0.26, d: 0.08, color: ST },
      ];
    },
  },

  // ---------------- v2.6 恐龙系：三角龙 / 迅猛龙 / 翼龙 ----------------
  triceratops: {
    kind: 'triceratops', name: '三角龙', hp: 240, dmg: 19, speed: 2.3,
    hw: 0.66, height: 2.0, hostile: true, knock: 1.7, windup: 0.4, atkPose: 'stab',
    build: () => {
      const G = '#6E8B4E', GD = '#4E6B34', GL = '#8FAC6B';
      const FR = '#C4671A', FRD = '#8C4A12', FR_L = '#E08B33';
      const BONE = '#F2EAD3', DARK = '#2B211B';
      const boxes = quadruped(G, GL, GD, { bw: 1.2, bh: 0.86, bd: 1.5, by: 0.56, headS: 0.62, legH: 0.56, snout: '#9DB877' });
      boxes.push(
        // 头盾：外圈骨板 + 内圈浅色纹路
        { x: -0.72, y: 1.12, z: 0.58, w: 1.44, h: 0.94, d: 0.14, color: FR },
        { x: -0.56, y: 1.2, z: 0.68, w: 1.12, h: 0.74, d: 0.07, color: FR_L },
        { x: -0.3, y: 1.34, z: 0.72, w: 0.6, h: 0.46, d: 0.05, color: FRD },
        // 头盾边缘的骨突
        { x: -0.78, y: 1.02, z: 0.56, w: 0.14, h: 0.16, d: 0.12, color: BONE },
        { x: 0.64, y: 1.02, z: 0.56, w: 0.14, h: 0.16, d: 0.12, color: BONE },
        { x: -0.78, y: 1.94, z: 0.56, w: 0.14, h: 0.16, d: 0.12, color: BONE },
        { x: 0.64, y: 1.94, z: 0.56, w: 0.14, h: 0.16, d: 0.12, color: BONE },
        // 三支角：两支眉角 + 一支鼻角
        { x: -0.36, y: 1.4, z: 1.12, w: 0.11, h: 0.42, d: 0.11, color: BONE },
        { x: 0.25, y: 1.4, z: 1.12, w: 0.11, h: 0.42, d: 0.11, color: BONE },
        { x: -0.06, y: 1.0, z: 1.34, w: 0.11, h: 0.26, d: 0.11, color: BONE },
        // 喙 + 眼
        { x: -0.1, y: 0.86, z: 1.36, w: 0.2, h: 0.15, d: 0.14, color: BONE },
        { x: -0.31, y: 1.14, z: 1.24, w: 0.07, h: 0.08, d: 0.04, color: DARK },
        { x: 0.24, y: 1.14, z: 1.24, w: 0.07, h: 0.08, d: 0.04, color: DARK },
        // 尾（两节渐细）
        { x: -0.18, y: 0.62, z: -0.95, w: 0.36, h: 0.34, d: 0.62, color: GD },
        { x: -0.1, y: 0.66, z: -1.44, w: 0.2, h: 0.18, d: 0.44, color: GD },
        // 背脊小骨板
        { x: -0.07, y: 1.5, z: -0.35, w: 0.14, h: 0.2, d: 0.2, color: FRD },
        { x: -0.07, y: 1.5, z: -0.02, w: 0.14, h: 0.2, d: 0.2, color: FRD },
      );
      return boxes;
    },
  },
  raptor: {
    kind: 'raptor', name: '迅猛龙', hp: 64, dmg: 12, speed: 4.7,
    hw: 0.38, height: 1.75, hostile: true, atkPose: 'stab',
    build: () => {
      const B = '#8A6B3C', BD = '#5F4726', BL = '#B08A54';
      const FE = '#E07B27', FED = '#B85E17', CLAW = '#F5F0E4', EYE = '#FFD54F';
      const boxes: BoxDef[] = [
        // 双腿（细长带爪）
        { x: -0.3, y: 0, z: -0.18, w: 0.2, h: 0.88, d: 0.26, color: BD },
        { x: 0.1, y: 0, z: -0.18, w: 0.2, h: 0.88, d: 0.26, color: BD },
        { x: -0.34, y: 0, z: 0.02, w: 0.24, h: 0.16, d: 0.34, color: BL },
        { x: 0.1, y: 0, z: 0.02, w: 0.24, h: 0.16, d: 0.34, color: BL },
        { x: -0.34, y: 0, z: 0.32, w: 0.06, h: 0.08, d: 0.12, color: CLAW },
        { x: 0.2, y: 0, z: 0.32, w: 0.06, h: 0.08, d: 0.12, color: CLAW },
        // 躯干 + 胸口浅色
        { x: -0.32, y: 0.82, z: -0.58, w: 0.64, h: 0.58, d: 1.0, color: B },
        { x: -0.22, y: 0.86, z: 0.36, w: 0.44, h: 0.42, d: 0.06, color: BL },
        // 颈 + 头 + 长吻
        { x: -0.19, y: 1.24, z: 0.02, w: 0.38, h: 0.44, d: 0.36, color: B },
        { x: -0.21, y: 1.44, z: 0.3, w: 0.42, h: 0.34, d: 0.5, color: BL },
        { x: -0.15, y: 1.4, z: 0.7, w: 0.3, h: 0.22, d: 0.3, color: B },
        // 牙 + 金瞳
        { x: -0.14, y: 1.38, z: 0.86, w: 0.05, h: 0.09, d: 0.04, color: CLAW },
        { x: 0.09, y: 1.38, z: 0.86, w: 0.05, h: 0.09, d: 0.04, color: CLAW },
        { x: -0.23, y: 1.58, z: 0.52, w: 0.08, h: 0.08, d: 0.04, color: EYE },
        { x: 0.15, y: 1.58, z: 0.52, w: 0.08, h: 0.08, d: 0.04, color: EYE },
        // 头顶羽冠
        { x: -0.22, y: 1.74, z: 0.24, w: 0.44, h: 0.08, d: 0.4, color: FE },
        { x: -0.16, y: 1.82, z: -0.04, w: 0.32, h: 0.08, d: 0.28, color: FED },
        // 前肢
        { x: -0.4, y: 1.0, z: 0.3, w: 0.1, h: 0.3, d: 0.1, color: BD },
        { x: 0.3, y: 1.0, z: 0.3, w: 0.1, h: 0.3, d: 0.1, color: BD },
        // 尾（两节上翘）
        { x: -0.16, y: 0.94, z: -1.16, w: 0.32, h: 0.3, d: 0.7, color: B },
        { x: -0.09, y: 1.06, z: -1.72, w: 0.18, h: 0.18, d: 0.48, color: BD },
        // 背部羽饰
        { x: -0.06, y: 1.42, z: -0.5, w: 0.12, h: 0.14, d: 0.6, color: FE },
      ];
      return boxes;
    },
  },
  ptera: {
    kind: 'ptera', name: '翼龙', hp: 52, dmg: 10, speed: 4.3,
    hw: 0.5, height: 1.0, hostile: true, flying: true, diveCd: 3, atkPose: 'stab',
    build: () => {
      const B = '#5E7A8C', BD = '#3F5566', BL = '#8FA9B8';
      const W = '#C7D8E2', WD = '#9FB6C4', BEAK = '#E8D9A8', EYE = '#FF7043';
      return [
        // 躯干
        { x: -0.26, y: 0.3, z: -0.52, w: 0.52, h: 0.46, d: 1.0, color: B },
        { x: -0.18, y: 0.36, z: 0.3, w: 0.36, h: 0.34, d: 0.3, color: BL },
        // 头 + 长喙 + 头冠
        { x: -0.16, y: 0.5, z: 0.52, w: 0.32, h: 0.28, d: 0.4, color: BL },
        { x: -0.05, y: 0.46, z: 0.88, w: 0.1, h: 0.12, d: 0.34, color: BEAK },
        { x: -0.06, y: 0.74, z: 0.5, w: 0.12, h: 0.3, d: 0.36, color: '#D9534F' },
        { x: -0.21, y: 0.6, z: 0.66, w: 0.07, h: 0.07, d: 0.04, color: EYE },
        { x: 0.14, y: 0.6, z: 0.66, w: 0.07, h: 0.07, d: 0.04, color: EYE },
        // 双翼（外侧主翼 + 内侧翼膜）
        { x: -1.62, y: 0.5, z: -0.16, w: 1.36, h: 0.06, d: 0.96, color: W },
        { x: 0.26, y: 0.5, z: -0.16, w: 1.36, h: 0.06, d: 0.96, color: W },
        { x: -1.3, y: 0.55, z: -0.1, w: 0.86, h: 0.05, d: 0.62, color: WD },
        { x: 0.44, y: 0.55, z: -0.1, w: 0.86, h: 0.05, d: 0.62, color: WD },
        { x: -1.72, y: 0.54, z: 0.18, w: 0.16, h: 0.08, d: 0.12, color: BD },
        { x: 1.56, y: 0.54, z: 0.18, w: 0.16, h: 0.08, d: 0.12, color: BD },
        // 尾 + 脚
        { x: -0.06, y: 0.34, z: -1.24, w: 0.12, h: 0.12, d: 0.6, color: BD },
        { x: -0.1, y: 0.3, z: -1.58, w: 0.2, h: 0.06, d: 0.2, color: BD },
        { x: -0.14, y: 0.26, z: -0.2, w: 0.08, h: 0.16, d: 0.08, color: BEAK },
        { x: 0.06, y: 0.26, z: -0.2, w: 0.08, h: 0.16, d: 0.08, color: BEAK },
      ];
    },
  },
};

// ---------------- 血条（世界空间，始终面向相机） ----------------

interface BarMeshes {
  bg: Mesh;
  fg: Mesh;
  fgBoss: Mesh;
  fgOrange: Mesh;
  fgRed: Mesh;
  fgElite: Mesh;
  ghost: Mesh;
}

function barBox(z: number, color: string): BoxDef[] {
  return [{ x: -0.29, y: -0.032, z, w: 0.58, h: 0.064, d: 0.02, color }];
}

let barMeshes: BarMeshes | null = null;

/** 血条网格缓存：底槽 + 各状态前景 + 白色残影 */
function getBarMeshes(): BarMeshes {
  if (!barMeshes) {
    barMeshes = {
      bg: buildBoxesMesh([{ x: -0.31, y: -0.045, z: -0.02, w: 0.62, h: 0.09, d: 0.04, color: '#301112' }]),
      fg: buildBoxesMesh(barBox(-0.028, '#66BB6A')),
      fgBoss: buildBoxesMesh(barBox(-0.028, '#FFD54F')),
      fgOrange: buildBoxesMesh(barBox(-0.028, '#FFA726')),
      fgRed: buildBoxesMesh(barBox(-0.028, '#EF5350')),
      fgElite: buildBoxesMesh(barBox(-0.028, '#BA68C8')),
      ghost: buildBoxesMesh(barBox(-0.024, '#FFFFFF')),
    };
  }
  return barMeshes;
}

// ---------------- 怪物 ----------------

/** 延迟销毁队列：Node.destroy 有开销，每帧限量释放 */
const GRAVEYARD: Node[] = [];

/** 室内/农田被动动物池 */
const VEG_ANIMALS = ['pig', 'sheep', 'chicken', 'rabbit'];
/** 野外敌怪池 */
const WILD_KINDS = ['boar', 'fox', 'vulture'];

/** 单只怪物：模型 + 血条 + AI + 简化 AABB 物理 */
export class Mob {
  readonly def: MobDef;
  readonly node: Node;
  readonly barNode: Node;
  readonly barFg: Node;
  readonly barGhost: Node;
  readonly barFgMr: MeshRenderer;
  readonly scale: number;
  /** 等级（决定名字颜色与活动半径） */
  readonly tier: MobTier;

  hp: number;
  readonly maxHp: number;
  dmg: number;
  readonly speed: number;
  readonly bodyColor: string;

  affix: AffixKind | null = null;
  vel = new Vec3();
  yawDeg = 0;
  onGround = false;
  alive = true;
  dieT = 0.25;
  exploded = false;
  attackCd = 0;
  igniteT = -1;
  flashT = 0;
  hitT = 0;
  burnT = 0;
  /** 燃烧/中毒 DPS（由受击时传入的 burn 秒数决定） */
  burnDps = 1;
  burnAcc = 0;
  /** 被动世界 BOSS 挨打后转为敌对 */
  provoked = false;
  slowT = 0;
  slowMul = 0;
  stunT = 0;
  hopT = 0;
  wanderT = 0;
  wanderYaw = 0;
  homeX = 0;
  homeZ = 0;
  sinceHit = 0;
  summonCd = 0;
  windupT = 0;
  windupFired = false;
  diveCd = 4;
  diving = false;
  diveT = 0;
  flyT = 0;
  baseY = 0;
  lastNodeScale = -1;
  ghostRatio = 1;
  lastFgRatio = -1;

  /** v2.5 攻击动作计时（秒，>0 时播放姿态动画） */
  atkT = 0;
  /** 攻击动作总时长（按招式区分） */
  atkDur = 0.45;

  /** 事件计数：近战命中 / 爆炸 / 召唤（GameRoot 每帧读取后清零） */
  evAttack = 0;
  evExplode = 0;
  evSummon = 0;

  constructor(kind: MobKind, opts: MobMul, x: number, y: number, z: number) {
    const def = MOB_DEFS[kind];
    this.def = def;
    this.tier = mobTier(kind);
    // 体型：物种基础体型 × 生成倍率（体积有大有小）
    this.scale = (opts.scale || 1) * (MOB_SIZES[kind] || 1);
    this.maxHp = Math.round(def.hp * (opts.hp || 1));
    this.hp = this.maxHp;
    this.dmg = Math.max(1, Math.round(def.dmg * (opts.dmg || 1)));
    this.speed = def.speed * (opts.speed || 1);
    // v2.5 攻击动作时长（按招式区分）
    if (def.atkPose === 'slam') this.atkDur = 0.62;
    else if (def.atkPose === 'stab') this.atkDur = 0.30;
    else if (def.atkPose === 'throw') this.atkDur = 0.42;

    this.node = new Node('mob_' + kind);
    const boxes = def.build();
    // 身体主色 = 体积最大的盒子颜色（避免遮挡时只剩黑白）
    let bestVol = -1;
    let bodyColor = '#9E9E9E';
    for (const b of boxes) {
      const vol = b.w * b.h * b.d;
      if (vol > bestVol) { bestVol = vol; bodyColor = b.color; }
    }
    this.bodyColor = bodyColor;

    const mr = this.node.addComponent(MeshRenderer);
    mr.mesh = buildBoxesMesh(boxes);
    mr.setSharedMaterial(getVoxMaterial(), 0);

    this.baseY = y;
    const py = def.flying ? y + 1.5 : y;
    this.node.setPosition(x, py, z);
    this.homeX = x;
    this.homeZ = z;
    if (this.scale !== 1) this.node.setScale(this.scale, this.scale, this.scale);
    this.attachFace();

    this.barNode = new Node('bar');
    this.barNode.parent = this.node;
    const bm = getBarMeshes();

    const bg = new Node('bg');
    bg.parent = this.barNode;
    const bgMr = bg.addComponent(MeshRenderer);
    bgMr.mesh = bm.bg;
    bgMr.setSharedMaterial(getVoxMaterial(), 0);

    this.barGhost = new Node('ghost');
    this.barGhost.parent = this.barNode;
    const ghostMr = this.barGhost.addComponent(MeshRenderer);
    ghostMr.mesh = bm.ghost;
    ghostMr.setSharedMaterial(getVoxMaterial(), 0);

    this.barFg = new Node('fg');
    this.barFg.parent = this.barNode;
    this.barFgMr = this.barFg.addComponent(MeshRenderer);
    this.barFgMr.mesh = def.worldBoss || def.bossBar ? bm.fgBoss : bm.fg;
    this.barFgMr.setSharedMaterial(getVoxMaterial(), 0);

    if (def.worldBoss || def.bossBar) this.barNode.setScale(1.6, 1.6, 1.6);
    this.barNode.setPosition(0, def.height + 0.32, 0);
    this.barNode.active = false;
  }

  /** 贴图脸板（资源未加载时跳过，加载后可再次调用补挂） */
  attachFace(): void {
    const kind = this.def.kind;
    if (this.node.getChildByName('face')) return;
    const spec = FACE_SPECS[kind];
    const tex = spec ? FACE_TEXTURES.get(kind) : undefined;
    if (!spec || !tex) return;
    let mesh = faceMeshes.get(kind);
    if (!mesh) { mesh = buildQuadMesh(spec.w, spec.h); faceMeshes.set(kind, mesh); }
    let mat = faceMats.get(kind);
    if (!mat) {
      mat = new Material();
      mat.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
      mat.setProperty('mainTexture', tex);
      faceMats.set(kind, mat);
    }
    const face = new Node('face');
    face.parent = this.node;
    const mr = face.addComponent(MeshRenderer);
    mr.mesh = mesh;
    mr.setSharedMaterial(mat, 0);
    face.setPosition(0, spec.y, spec.z);
  }

  /** 返回 true 表示本次伤害致死 */
  takeDamage(amount: number, kx: number, kz: number, burn = 0): boolean {
    if (!this.alive) return false;
    this.provoked = true;
    if (this.def.dmgReduce) amount = Math.max(1, Math.round(amount * (1 - this.def.dmgReduce)));
    if (this.affix === 'thorns') amount = Math.max(1, Math.round(amount * 0.7));
    this.hp -= amount;
    this.flashT = 0.14;
    this.hitT = 1.2;
    this.sinceHit = 0;
    if (burn > 0) {
      this.burnT = Math.max(this.burnT, burn);
      this.burnDps = Math.max(1, 0.2 * amount);
    }
    if (!this.def.noKnock) {
      this.vel.x += kx;
      this.vel.z += kz;
      this.vel.y += 3.2;
      this.onGround = false;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.dieT = 0.25;
      return true;
    }
    return false;
  }

  applySlow(mul: number, dur: number): void {
    if (!this.alive) return;
    this.slowMul = this.slowT > 0 ? Math.max(this.slowMul, mul) : mul;
    this.slowT = Math.max(this.slowT, dur);
  }

  applyStun(t: number): void {
    if (!this.alive) return;
    this.stunT = Math.max(this.stunT, t);
    this.attackCd = Math.max(this.attackCd, t);
  }

  /** v2.5 开始播放攻击动作（仅对有 atkPose 的物种生效） */
  private beginAttack(): void {
    if (!this.def.atkPose) return;
    this.atkT = this.atkDur;
    // 突刺类（杀人蜂）：向面朝方向补一次短冲刺，增强“刺”的手感
    if (this.def.atkPose === 'stab') {
      const a = (this.yawDeg * Math.PI) / 180;
      this.vel.x += Math.sin(a) * 3.5;
      this.vel.z += Math.cos(a) * 3.5;
    }
  }

  /** 体素网格 AABB 碰撞（与玩家同一套敌人碰撞盒） */
  collides(world: World, x: number, y: number, z: number): boolean {
    const hw = this.def.hw * this.scale;
    const h = this.def.height * this.scale;
    const eps = 1e-4;
    const x0 = Math.floor(x - hw + eps);
    const x1 = Math.floor(x + hw - eps);
    const y0 = Math.floor(y + eps);
    const y1 = Math.floor(y + h - eps);
    const z0 = Math.floor(z - hw + eps);
    const z1 = Math.floor(z + hw - eps);
    for (let yy = y0; yy <= y1; yy++) {
      for (let zz = z0; zz <= z1; zz++) {
        for (let xx = x0; xx <= x1; xx++) {
          if (world.isSolidAt(xx, yy, zz)) return true;
        }
      }
    }
    return false;
  }

  update(dt: number, world: World, px: number, py: number, pz: number, playerAlive: boolean): void {
    if (!this.alive) return;
    this.attackCd -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.hitT > 0) this.hitT -= dt;
    this.sinceHit += dt;

    // 世界 BOSS：脱战 5 秒后缓慢回血
    if (this.def.worldBoss) {
      this.summonCd -= dt;
      if (this.sinceHit > 5 && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + 0.02 * this.maxHp * dt);
      }
    }

    // 燃烧/中毒：每 0.5 秒结算一次
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.burnAcc += dt;
      while (this.burnAcc >= 0.5) { this.burnAcc -= 0.5; this.hp -= 0.5 * this.burnDps; }
      if (this.burnT <= 0) { this.burnT = 0; this.burnAcc = 0; }
      if (this.hp <= 0) { this.hp = 0; this.alive = false; this.dieT = 0.25; return; }
    }

    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) { this.slowT = 0; this.slowMul = 0; }
    }
    if (this.stunT > 0) this.stunT -= dt;
    if (this.windupT > 0) {
      this.windupT -= dt;
      if (this.windupT <= 0) { this.windupT = 0; this.windupFired = true; }
    }

    const dx = px - this.x;
    const dz = pz - this.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const pos = this.node.position as Vec3;

    // 飞行怪：悬停 + 周期性俯冲
    if (this.def.flying) {
      this.flyT += dt;
      if (this.diving) {
        this.diveT -= dt;
        if (this.diveT <= 0) { this.diving = false; this.diveCd = this.def.diveCd || 4; this.vel.y = 9; }
      } else {
        this.diveCd -= dt;
        if (this.diveCd <= 0 && playerAlive && dist < 12) { this.diving = true; this.diveT = 1; }
      }
    }

    let mx = 0;
    let mz = 0;
    let spd = 0;

    // 领地 leash：等级越低活动范围越大，高等级 / 世界 BOSS 更小；斗兽场内不限制
    let leashed = false;
    if (this.def.hostile && !isInArena(this.x, this.z)) {
      const ox = this.x - this.homeX;
      const oz = this.z - this.homeZ;
      const r = this.def.leash ?? TIER_LEASH[this.tier];
      leashed = ox * ox + oz * oz > r * r;
    }

    if (leashed) {
      const bx = this.homeX - this.x;
      const bz = this.homeZ - this.z;
      const bl = Math.sqrt(bx * bx + bz * bz);
      if (bl > 2) { mx = bx / bl; mz = bz / bl; spd = this.speed; }
    } else if (this.def.hostile && playerAlive && (!this.def.passive || this.provoked)) {
      if (this.def.explode) {
        // 苦力怕：靠近点燃 → 逃跑 → 爆炸
        if (this.igniteT >= 0) {
          this.igniteT -= dt;
          if (dist > 3.4) this.igniteT = -1;
          else if (this.igniteT <= 0) {
            this.evExplode = this.def.explode;
            this.alive = false;
            this.exploded = true;
            this.dieT = 0.001;
            return;
          }
        } else if (dist < 2.3 && Math.abs(py - this.y) < 2.5) {
          this.igniteT = 1.15;
        }
        if (this.igniteT < 0 && dist < 20 && dist > 0.1) { mx = dx / dist; mz = dz / dist; spd = this.speed; }
      } else if (dist < (this.def.aggro || 20)) {
        if (dist > 1.1) {
          mx = dx / (dist || 1);
          mz = dz / (dist || 1);
          spd = this.speed;
          // 蜘蛛 / 狐狸：侧向绕行，避免直线贴脸
          if (this.def.kind === 'spider' || this.def.kind === 'fox') {
            const ph = 0.004 * Date.now();
            const ox = -mz;
            const oz = mx;
            const s = 0.5 * Math.sin(ph);
            mx += ox * s;
            mz += oz * s;
          }
        }
        const aoe = this.def.aoe || 0;
        const reach = aoe > 0 ? aoe : this.def.hw * this.scale + 1;
        const dyOK = Math.abs(py - this.y) < (aoe > 0 ? aoe + 1 : 2.2);
        if (dist < reach && dyOK) {
          if (this.def.windup) {
            if (this.windupFired) {
              this.evAttack = this.dmg;
              this.attackCd = 1.7;
              this.windupFired = false;
              this.beginAttack();
            } else if (this.windupT <= 0 && this.attackCd <= 0) {
              this.windupT = this.def.windup;
            }
          } else if (this.attackCd <= 0) {
            this.evAttack = this.dmg;
            this.attackCd = 1.7;
            this.beginAttack();
            if (this.def.summon && this.summonCd <= 0) {
              this.evSummon = this.def.summon;
              this.summonCd = 8;
            }
          }
        } else if (this.def.windup && (this.windupT > 0 || this.windupFired)) {
          this.windupT = 0;
          this.windupFired = false;
        }
      }
    } else {
      // 被动动物：受击逃跑 / 玩家靠近逃跑 / 随机游荡
      const flee = this.def.fleeDist || 0;
      if ((this.hitT > 0 && dist < 12 && dist > 0.1) || (flee > 0 && dist < flee)) {
        mx = -dx / dist;
        mz = -dz / dist;
        spd = this.speed * (this.hitT > 0 ? 1.9 : 1.6);
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 2 + 3 * Math.random();
          this.wanderYaw = Math.random() * Math.PI * 2;
        }
        mx = Math.sin(this.wanderYaw);
        mz = Math.cos(this.wanderYaw);
        spd = 0.5 * this.speed;
      }
    }

    if (this.stunT > 0) { mx = 0; mz = 0; spd = 0; }
    else if (this.slowT > 0 && this.slowMul > 0) spd *= 1 - this.slowMul;

    // 朝向平滑跟随移动方向
    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0.01 && spd > 0) {
      mx /= len;
      mz /= len;
      let d = (180 * Math.atan2(mx, mz)) / Math.PI - this.yawDeg;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      this.yawDeg += d * Math.min(1, 10 * dt);
    } else {
      spd = 0;
    }

    if (this.def.hop) {
      // 史莱姆：着地蓄力后跳跃
      if (this.onGround) {
        this.hopT -= dt;
        if (this.hopT <= 0 && spd > 0) {
          this.vel.y = 6.2;
          this.onGround = false;
          this.hopT = 0.65;
          this.vel.x = mx * spd * 1.4;
          this.vel.z = mz * spd * 1.4;
        } else {
          this.vel.x *= 0.6;
          this.vel.z *= 0.6;
        }
      }
    } else {
      const k = 1 - Math.exp(-8 * dt);
      this.vel.x += (mx * spd - this.vel.x) * k;
      this.vel.z += (mz * spd - this.vel.z) * k;
    }

    if (this.def.flying && !this.diving) this.vel.y = 0;
    else {
      this.vel.y -= 24 * dt;
      if (this.vel.y < -22) this.vel.y = -22;
    }

    // 分轴步进物理（每步 ≤0.1m，避免穿墙）
    this.onGround = false;
    const sx = this.vel.x * dt;
    const sy = this.vel.y * dt;
    const sz = this.vel.z * dt;
    const maxMove = Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz));
    const steps = Math.max(1, Math.ceil(maxMove / 0.1));
    const ix = sx / steps;
    const iy = sy / steps;
    const iz = sz / steps;
    let hitX = false;
    let hitZ = false;
    for (let i = 0; i < steps; i++) {
      if (ix !== 0) {
        pos.x += ix;
        if (this.collides(world, pos.x, pos.y, pos.z)) { pos.x -= ix; this.vel.x = 0; hitX = true; }
      }
      if (iz !== 0) {
        pos.z += iz;
        if (this.collides(world, pos.x, pos.y, pos.z)) { pos.z -= iz; this.vel.z = 0; hitZ = true; }
      }
      if (iy !== 0) {
        pos.y += iy;
        if (this.collides(world, pos.x, pos.y, pos.z)) {
          pos.y -= iy;
          if (iy < 0) this.onGround = true;
          this.vel.y = 0;
          break;
        }
      }
    }

    // 撞墙：野猪眩晕 / 普通怪小跳
    if ((hitX || hitZ) && this.onGround && !this.def.hop) {
      if (this.def.wallStun) this.stunT = Math.max(this.stunT, this.def.wallStun);
      this.vel.y = 7.2;
      this.onGround = false;
    }

    if (pos.y < -6) { pos.y = 30; this.vel.set(0, 0, 0); }
    if (this.def.flying && !this.diving) pos.y = this.baseY + 1.5 + 0.2 * Math.sin(2.5 * this.flyT);

    // 受击/蓄力/点燃的呼吸缩放
    const base = this.scale * (1 + (this.flashT > 0 ? 1.6 * this.flashT : 0));
    let s = base;
    if (this.windupT > 0 && this.def.windup) {
      const p = 1 - this.windupT / this.def.windup;
      s = base * (1 + 0.1 * Math.sin(p * Math.PI));
    } else if (this.igniteT >= 0) {
      s = base * (1 + 0.08 * Math.sin(40 * this.igniteT));
    }

    // v2.5 攻击动作：整体前倾 / 压扁拉伸（单 Mesh 模型只能动整体姿态）
    let atkX = 0;
    let atkS = 1;
    if (this.atkT > 0) {
      this.atkT = Math.max(0, this.atkT - dt);
      const p = 1 - this.atkT / this.atkDur;
      const k = 1 - p;
      if (this.def.atkPose === 'slam') {
        // 重锤砸下：命中瞬间前压，随后回正
        atkX = 28 * k * k;
        atkS = 1 - 0.1 * k;
      } else if (this.def.atkPose === 'stab') {
        // 尾刺突袭：绷直前冲
        atkX = 12 * k;
        atkS = 1 + 0.12 * k;
      } else if (this.def.atkPose === 'throw') {
        // 投掷：前甩回弹
        atkX = 20 * k * k - 6 * Math.sin(p * Math.PI * 2) * k;
        atkS = 1 + 0.05 * k;
      }
    }
    // 蓄力后仰（重击前摇的视觉预告）
    if (this.windupT > 0 && this.def.windup) {
      atkX -= 22 * Math.sin((1 - this.windupT / this.def.windup) * Math.PI * 0.5);
    }
    s *= atkS;
    if (s !== this.lastNodeScale) { this.lastNodeScale = s; this.node.setScale(s, s, s); }

    this.node.setRotationFromEuler(atkX, this.yawDeg, 0);

    // 血条：BOSS 常驻，普通怪只在受伤后显示
    const damaged = this.hp < this.maxHp;
    this.barNode.active = this.def.worldBoss || this.def.bossBar ? this.alive : damaged;
    if (this.barNode.active) {
      const ratio = Math.max(0.01, this.hp / this.maxHp);
      if (ratio !== this.lastFgRatio) { this.lastFgRatio = ratio; this.barFg.setScale(ratio, 1, 1); }
      if (ratio > this.ghostRatio) this.ghostRatio = ratio;
      else this.ghostRatio = Math.max(ratio, this.ghostRatio - 0.45 * dt);
      this.barGhost.setScale(Math.max(0.01, this.ghostRatio), 1, 1);

      const bm = getBarMeshes();
      const mesh = this.def.worldBoss || this.def.bossBar ? bm.fgBoss
        : this.isElite ? bm.fgElite
          : ratio > 0.5 ? bm.fg
            : ratio > 0.25 ? bm.fgOrange : bm.fgRed;
      if (this.barFgMr.mesh !== mesh) this.barFgMr.mesh = mesh;
    }
  }

  /** 血条朝向相机（抵消自身 yaw） */
  faceBar(camX: number, camZ: number): void {
    if (!this.barNode.active) return;
    const ang = (180 * Math.atan2(camX - this.x, camZ - this.z)) / Math.PI;
    this.barNode.setRotationFromEuler(0, ang - this.yawDeg, 0);
  }

  dispose(): void {
    this.node.active = false;
    GRAVEYARD.push(this.node);
  }

  get isElite(): boolean {
    return !!(this.def.hostile && !this.def.worldBoss && !this.def.bossBar && this.scale >= 1.25);
  }

  get x(): number { return this.node.position.x; }
  get y(): number { return this.node.position.y; }
  get z(): number { return this.node.position.z; }
}

// ---------------- 怪物场 ----------------

export class MobField {
  readonly root: Node;
  readonly world: World;
  readonly mobs: Mob[] = [];

  constructor(root: Node, world: World) {
    this.root = root;
    this.world = world;
  }

  /** 生成怪物（找地面失败返回 null） */
  spawn(kind: MobKind, x: number, z: number, opts: MobMul = {}): Mob | null {
    const gy = this.world.findGroundY(x, z);
    if (gy < 0) return null;
    const mob = new Mob(kind, opts, Math.floor(x) + 0.5, gy, Math.floor(z) + 0.5);
    mob.node.parent = this.root;
    this.mobs.push(mob);
    return mob;
  }

  update(dt: number, px: number, py: number, pz: number, playerAlive: boolean, camX: number, camZ: number): void {
    for (const mob of this.mobs) {
      mob.update(dt, this.world, px, py, pz, playerAlive);
      mob.faceBar(camX, camZ);
    }
    // 死亡动画：整体前倾倒 0.25s 后回收
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      if (!mob.alive) {
        mob.dieT -= dt;
        if (!mob.exploded) {
          const p = Math.max(0, mob.dieT / 0.25);
          mob.node.setRotationFromEuler(-90 * (1 - p), mob.yawDeg, 0);
        }
        if (mob.dieT <= 0) {
          mob.dispose();
          this.mobs.splice(i, 1);
        }
      }
    }
  }

  /** 斗兽场内活着的敌人数量（刷怪上限判断） */
  countHostile(): number {
    let n = 0;
    for (const mob of this.mobs) {
      if (mob.def.hostile && !mob.def.worldBoss && mob.alive && isInArena(mob.x, mob.z)) n++;
    }
    return n;
  }

  /** 场上被动动物总数 */
  countAnimals(): number {
    let n = 0;
    for (const mob of this.mobs) {
      if (!mob.def.hostile) n++;
    }
    return n;
  }

  randomAnimalKind(pool: string[] = VEG_ANIMALS): string {
    return pool[(Math.random() * pool.length) | 0];
  }

  /** 野外敌怪种类（兔子/野猪圈外刷） */
  randomWildKind(pool: string[] = WILD_KINDS): string {
    return pool[(Math.random() * pool.length) | 0];
  }

  /** 斗兽场外（野外）活着的敌人数量 */
  countWild(): number {
    let n = 0;
    for (const mob of this.mobs) {
      if (mob.def.hostile && !mob.def.worldBoss && mob.alive && !isInArena(mob.x, mob.z)) n++;
    }
    return n;
  }

  clear(): void {
    for (const mob of this.mobs) mob.dispose();
    this.mobs.length = 0;
  }

  flushGraveyard(n: number): void {
    while (n > 0 && GRAVEYARD.length > 0) {
      const node = GRAVEYARD.pop()!;
      if (node.isValid) node.destroy();
      n--;
    }
  }
}

/** 是否为被动动物 */
export function isAnimal(kind: MobKind): boolean {
  return !MOB_DEFS[kind].hostile;
}

/** 怪物显示名 */
export function mobName(kind: MobKind): string {
  return MOB_DEFS[kind].name;
}
