// 全局配置：段位、角色、广告位、云环境
export interface SkinCfg {
  fur: string; furDark: string; belly: string; armor: string;
  glow: string; eye: string; crown: boolean; aura: number; rainbow?: boolean;
}

export interface WeaponCfg {
  name: string; type: string; color: string; color2: string;
}

export interface RankCfg {
  name: string; skinName: string; skin: SkinCfg; weapon: WeaponCfg; tag: string;
}

export interface CharCfg {
  id: string; name: string; title: string; desc: string;
  hp: number; dmg: number; speed: number; color: string;
}

export const CFG = {
  AD_UNIT_ID: 'adunit-4c682a98c0c5ed45',
  // 激励视频广告位（留空则自动降级为模拟广告）
  AD_SCENES: {
    legend: 'adunit-4c682a98c0c5ed45',   // 绝世武器
    revive: 'adunit-4c682a98c0c5ed45',   // 死亡复活
    chest: 'adunit-4c682a98c0c5ed45',    // 宝箱加开
    equip: 'adunit-4c682a98c0c5ed45',    // 角色面板领装备
    skin: 'adunit-4c682a98c0c5ed45',     // 皮肤解锁
    bag: 'adunit-4c682a98c0c5ed45',      // 物品栏图鉴领装备
    map: 'adunit-4c682a98c0c5ed45',      // 新地图解锁
    ult: 'adunit-4c682a98c0c5ed45',      // 大招解锁（3 次）
  } as Record<string, string>,
  // 插屏广告（对局结算 / 返回主页时延迟展示，按游玩时长自适应频率）
  INTERSTITIAL_UNIT_ID: 'adunit-58f9fac6195e6a23',
  // 原生模板广告（主页菜单展示）
  NATIVE_UNIT_ID: 'adunit-abd1a2a391016d60',
  CLOUD_ENV: '',
  RANK_STARS: 2,
  MAX_RANK: 10,
  VW: 375,
  VH: 667,
  GROUND_Y: 400,
  SAVE_KEY: 'dogcat_arena_save_v1',
  BOARD_KEY: 'dogcat_arena_board_v1',

  RANKS: [
    {
      name: '青铜', skinName: '青铜战袍',
      skin: { fur: '#c98b5b', furDark: '#9c6a3c', belly: '#eed4b4', armor: '#7c5732', glow: '#d79a63', eye: '#3a2a1a', crown: false, aura: 0 },
      weapon: { name: '青铜木棒', type: 'wood', color: '#b5813f', color2: '#e2b872' },
      tag: '#c98b5b',
    },
    {
      name: '黄金', skinName: '黄金铠甲',
      skin: { fur: '#f5d06a', furDark: '#d2a22f', belly: '#fff5d2', armor: '#a97c12', glow: '#ffd76a', eye: '#4a3714', crown: false, aura: 0 },
      weapon: { name: '黄金拳套', type: 'fist', color: '#ffd76a', color2: '#c99421' },
      tag: '#f0b429',
    },
    {
      name: '铂金', skinName: '铂金胸甲',
      skin: { fur: '#def1f5', furDark: '#a6ccd6', belly: '#ffffff', armor: '#6f9bab', glow: '#bfe9f2', eye: '#2f5560', crown: false, aura: 0 },
      weapon: { name: '铂金弯刀', type: 'blade', color: '#d7f4fb', color2: '#7fb0c0' },
      tag: '#8fd0e2',
    },
    {
      name: '钻石', skinName: '钻石战衣',
      skin: { fur: '#c3e9ff', furDark: '#7fb6e8', belly: '#f4fbff', armor: '#5b8fc9', glow: '#9fdcff', eye: '#204a70', crown: false, aura: 1 },
      weapon: { name: '钻石晶刃', type: 'crystal', color: '#aee6ff', color2: '#4f9fe0' },
      tag: '#62b6ff',
    },
    {
      name: '星耀', skinName: '星耀法袍',
      skin: { fur: '#cdbcff', furDark: '#9a7fe0', belly: '#f0e9ff', armor: '#6f4fc0', glow: '#b79cff', eye: '#33245c', crown: false, aura: 1 },
      weapon: { name: '星耀法杖', type: 'star', color: '#c8b1ff', color2: '#8a63e8' },
      tag: '#a97dff',
    },
    {
      name: '王子', skinName: '王子礼服',
      skin: { fur: '#c7ddff', furDark: '#82a8e6', belly: '#eef5ff', armor: '#3552b0', glow: '#8fb6ff', eye: '#1f3464', crown: true, aura: 1 },
      weapon: { name: '王子权杖', type: 'scepter', color: '#ffe9a3', color2: '#cfa53a' },
      tag: '#6f95ff',
    },
    {
      name: '王者', skinName: '王者斗篷',
      skin: { fur: '#ffd2a0', furDark: '#e08b4f', belly: '#fff2e0', armor: '#a83434', glow: '#ff9a5c', eye: '#4a2412', crown: true, aura: 2 },
      weapon: { name: '王者巨剑', type: 'greatsword', color: '#ffd9a0', color2: '#c0553d' },
      tag: '#ff7a45',
    },
    {
      name: '最强王者', skinName: '烈焰战甲',
      skin: { fur: '#ff9f7a', furDark: '#c65a3d', belly: '#ffe6d8', armor: '#5c1f2e', glow: '#ff5d3a', eye: '#4d1208', crown: true, aura: 2 },
      weapon: { name: '烈焰利爪', type: 'flame', color: '#ff8a4c', color2: '#c22d17' },
      tag: '#ff5432',
    },
    {
      name: '至尊王者', skinName: '虚空战衣',
      skin: { fur: '#b48aff', furDark: '#6d45b8', belly: '#efe2ff', armor: '#2c1b52', glow: '#9b5cff', eye: '#2a1050', crown: true, aura: 2 },
      weapon: { name: '虚空拳套', type: 'void', color: '#9b5cff', color2: '#3a1e6e' },
      tag: '#9b5cff',
    },
    {
      name: '超凡王者', skinName: '圣光战袍',
      skin: { fur: '#fff8e3', furDark: '#dccfa9', belly: '#ffffff', armor: '#c9a227', glow: '#ffe9a3', eye: '#5c4a12', crown: true, aura: 2 },
      weapon: { name: '圣光长剑', type: 'holy', color: '#fff3c4', color2: '#e2b33c' },
      tag: '#ffd76a',
    },
    {
      name: '荣耀王者', skinName: '荣耀之翼',
      skin: { fur: '#f3e9ff', furDark: '#c3a8f2', belly: '#ffffff', armor: '#ff5fa2', glow: '#ffd166', eye: '#4a2b6e', crown: true, aura: 2, rainbow: true },
      weapon: { name: '荣耀彩虹剑', type: 'rainbow', color: '#ff8ab5', color2: '#5fd0ff' },
      tag: '#ff6fae',
    },
  ] as RankCfg[],

  CHARACTERS: [
    {
      id: 'dog', name: '哈吉米', title: '哈士奇 · 稳健型',
      desc: '血量厚实，攻守均衡', hp: 112, dmg: 9.0, speed: 150, color: '#8fb7e8',
    },
    {
      id: 'cat', name: '大橘', title: '橘猫 · 敏捷型',
      desc: '身法灵活，出手更快', hp: 96, dmg: 10.2, speed: 172, color: '#f0a04b',
    },
  ] as CharCfg[],

  BASE_SKINS: {
    dog: { fur: '#e9eff8', furDark: '#a8b8cc', belly: '#ffffff', armor: '#6d8cbf', glow: '#a8c6ee', eye: '#4f8fd0', crown: false, aura: 0 },
    cat: { fur: '#f4a65a', furDark: '#d48437', belly: '#fff1dd', armor: '#e0704f', glow: '#ffc273', eye: '#59a86a', crown: false, aura: 0 },
  } as Record<string, SkinCfg>,

  BASE_WEAPON: { name: '软爪套', type: 'paw', color: '#ece2d0', color2: '#c0ae8e' } as WeaponCfg,
};

export default CFG;
