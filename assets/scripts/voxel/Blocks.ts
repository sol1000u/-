/**
 * 方块类型定义（移植自 4jsvoxel.js）
 * 保留原版的方块种类、命名、碰撞与透明规则。
 */

export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  SAND = 4,
  WOOD = 5,
  LEAVES = 6,
  WATER = 7,
  COZE_PINK = 8,
  FLOWER_RED = 9,
  FLOWER_YELLOW = 10,
  FLOWER_WHITE = 11,
  MUSHROOM_RED = 12,
  MUSHROOM_BROWN = 13,
  /** v2.3 霜雪冰原：冻结湖面（可行走） */
  ICE = 14,
  /** v2.3 霜雪冰原地表 */
  SNOW = 15,
}

export const BlockNames: Record<number, string> = {
  [BlockType.GRASS]: '草方块',
  [BlockType.DIRT]: '泥土',
  [BlockType.STONE]: '石头',
  [BlockType.SAND]: '沙子',
  [BlockType.WOOD]: '木头',
  [BlockType.LEAVES]: '树叶',
  [BlockType.WATER]: '水',
  [BlockType.COZE_PINK]: 'Coze 粉',
  [BlockType.FLOWER_RED]: '红花',
  [BlockType.FLOWER_YELLOW]: '黄花',
  [BlockType.FLOWER_WHITE]: '白花',
  [BlockType.MUSHROOM_RED]: '红蘑菇',
  [BlockType.MUSHROOM_BROWN]: '棕蘑菇',
  [BlockType.SNOW]: '雪块',
  [BlockType.ICE]: '冰面',
};

export const BLOCK_COLORS: Record<number, string> = {
  [BlockType.GRASS]: '#4CAF50',
  [BlockType.DIRT]: '#8D6E63',
  [BlockType.STONE]: '#9E9E9E',
  [BlockType.SAND]: '#FDD835',
  [BlockType.WOOD]: '#795548',
  [BlockType.LEAVES]: '#2E7D32',
  [BlockType.WATER]: '#2196F3',
  [BlockType.COZE_PINK]: '#F46B95',
  [BlockType.FLOWER_RED]: '#E53935',
  [BlockType.FLOWER_YELLOW]: '#FDD835',
  [BlockType.FLOWER_WHITE]: '#FAFAFA',
  [BlockType.MUSHROOM_RED]: '#C62828',
  [BlockType.MUSHROOM_BROWN]: '#6D4C41',
  [BlockType.SNOW]: '#ECEFF1',
  [BlockType.ICE]: '#B3E5FC',
};

/** 实体（可碰撞）；树叶与花草可穿过 */
export function isSolid(type: number): boolean {
  return type !== BlockType.AIR && type !== BlockType.WATER &&
    type !== BlockType.LEAVES &&
    type !== BlockType.FLOWER_RED && type !== BlockType.FLOWER_YELLOW && type !== BlockType.FLOWER_WHITE &&
    type !== BlockType.MUSHROOM_RED && type !== BlockType.MUSHROOM_BROWN;
}

export function isFluid(type: number): boolean {
  return type === BlockType.WATER;
}

/** 透明（用于面剔除） */
export function isTransparent(type: number): boolean {
  return type === BlockType.AIR || type === BlockType.WATER || type === BlockType.LEAVES ||
    type === BlockType.FLOWER_RED || type === BlockType.FLOWER_YELLOW || type === BlockType.FLOWER_WHITE ||
    type === BlockType.MUSHROOM_RED || type === BlockType.MUSHROOM_BROWN;
}

/** 纹理图集槽位索引 */
export const TEX = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD_SIDE: 5,
  WOOD_TOP: 6,
  LEAVES: 7,
  WATER: 8,
  COZE_PINK: 9,
  FLOWER_RED: 10,
  FLOWER_YELLOW: 11,
  FLOWER_WHITE: 12,
  MUSHROOM_RED: 13,
  MUSHROOM_BROWN: 14,
  SNOW: 16,
  ICE: 17,
};

/** 方块面纹理 [顶, 底, 侧] */
export const BLOCK_TEX: Record<number, [number, number, number]> = {
  [BlockType.GRASS]: [TEX.GRASS_TOP, TEX.DIRT, TEX.GRASS_SIDE],
  [BlockType.DIRT]: [TEX.DIRT, TEX.DIRT, TEX.DIRT],
  [BlockType.STONE]: [TEX.STONE, TEX.STONE, TEX.STONE],
  [BlockType.SAND]: [TEX.SAND, TEX.SAND, TEX.SAND],
  [BlockType.WOOD]: [TEX.WOOD_TOP, TEX.WOOD_TOP, TEX.WOOD_SIDE],
  [BlockType.LEAVES]: [TEX.LEAVES, TEX.LEAVES, TEX.LEAVES],
  [BlockType.WATER]: [TEX.WATER, TEX.WATER, TEX.WATER],
  [BlockType.COZE_PINK]: [TEX.COZE_PINK, TEX.COZE_PINK, TEX.COZE_PINK],
  [BlockType.FLOWER_RED]: [TEX.FLOWER_RED, TEX.FLOWER_RED, TEX.FLOWER_RED],
  [BlockType.FLOWER_YELLOW]: [TEX.FLOWER_YELLOW, TEX.FLOWER_YELLOW, TEX.FLOWER_YELLOW],
  [BlockType.FLOWER_WHITE]: [TEX.FLOWER_WHITE, TEX.FLOWER_WHITE, TEX.FLOWER_WHITE],
  [BlockType.MUSHROOM_RED]: [TEX.MUSHROOM_RED, TEX.MUSHROOM_RED, TEX.MUSHROOM_RED],
  [BlockType.MUSHROOM_BROWN]: [TEX.MUSHROOM_BROWN, TEX.MUSHROOM_BROWN, TEX.MUSHROOM_BROWN],
  [BlockType.SNOW]: [TEX.SNOW, TEX.DIRT, TEX.SNOW],
  [BlockType.ICE]: [TEX.ICE, TEX.ICE, TEX.ICE],
};

/** 快捷栏可放置方块 */
export const HOTBAR_BLOCKS: number[] = [
  BlockType.GRASS,
  BlockType.DIRT,
  BlockType.STONE,
  BlockType.SAND,
  BlockType.WOOD,
  BlockType.COZE_PINK,
];
