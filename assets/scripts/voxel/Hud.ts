/**
 * 竖屏 HUD：加载页 / 主界面 / 游戏内 HUD（血条、波次、计时、攻击）/ 暂停 /
 * 死亡复活 / 超时失败 / 角色装备面板 / 物品栏 / 模拟广告。
 * 全部用 Painter( Graphics + Label ) 绘制，分辨率自适应（不依赖图片资源）。
 *
 * v2.3：只依赖 Painter；装备/皮肤/品质/方块配色常量就地定义，行为与 v2.3 一致。
 */
import { Node } from 'cc';
import { Painter, shadeHex } from '../render/Painter';

export type HudState = 'loading' | 'menu' | 'playing' | 'paused' | 'dead' | 'fail';
export type HudOverlay = 'none' | 'character' | 'bag' | 'ad' | 'reward';

export type SlotId = 'weapon' | 'helmet' | 'armor' | 'ring' | 'tool';

/** 装备定义（与 Items.EquipDef 结构兼容） */
export interface EquipDef {
  id: string;
  slot: SlotId;
  name: string;
  /** 1 普通 2 优良 3 精良 4 史诗 5 传说 */
  tier: number;
  color: string;
  dmg?: number;
  hp?: number;
  armor?: number;
  regen?: number;
  desc?: string;
}

/** 快捷栏物品：装备 + 强化附加攻击 */
export interface BackpackItem {
  def: EquipDef;
  bonus: number;
}

export interface ToastMsg {
  msg: string;
  color: string;
  alpha: number;
}

/** 宝箱奖励面板要展示的两件奖励 */
export interface ChestReward {
  weapon: EquipDef;
  equip: EquipDef;
}

export interface CharPanelData {
  equip: Record<SlotId, EquipDef | null>;
  collected: string[];
  attack: number;
  maxHp: number;
  armor: number;
  regen: number;
  /** 当前皮肤索引（SKIN_PRESETS） */
  skinIndex: number;
  /** 各皮肤是否已解锁（前两款免费，其余看广告） */
  skinUnlocked: boolean[];
}

/** 物品栏面板数据：所有拾取过的装备 + 宝剑图鉴 */
export interface BagPanelData {
  items: EquipDef[];
  collected: string[];
  /** 当前手持宝剑 id（图鉴高亮） */
  weaponId: string | null;
}

export interface HudData {
  state: HudState;
  overlay: HudOverlay;
  w: number;
  h: number;
  progress: number;
  fps: number;
  chunks: number;
  /** 快捷栏 7 个武器格（index 0 对应 UI 第 2 格） */
  backpack: Array<BackpackItem | null>;
  /** 当前选中槽位 0~7（0 = 石块） */
  selected: number;
  slotFlash: number;
  reward: ChestReward | null;
  legendReady: boolean;
  adPurpose: string;
  chestHint: number;
  time: number;
  blockName: string;
  blockNameAlpha: number;
  hintAlpha: number;
  joyActive: boolean;
  joyX: number;
  joyY: number;
  coords: { x: number; y: number; z: number };
  // 战斗
  hp: number;
  maxHp: number;
  wave: number;
  mobsLeft: number;
  timeLeft: number;
  timeMax: number;
  /** 通关后的自由活动时间（>0 表示处于自由时间） */
  freeT: number;
  /** 双模式：寻宝 / 斗兽场 */
  mode: 'treasure' | 'arena';
  /** 斗兽场进场倒计时（>0 时显示） */
  arenaCd: number;
  /** 斗兽场宝箱二选一：-1 未选 / 0 武器 / 1 装备 */
  rewardPicked: number;
  /** 第二件已看广告领取 */
  rewardSecond: boolean;
  /** 寻宝模式：存活世界 BOSS 方向指引（angle 相对相机弧度，0=正前方） */
  bossArrows: Array<{ angle: number; dist: number; name: string; hpRatio: number }> | null;
  /** 命中飘字（屏幕坐标） */
  dmgTexts: Array<{ x: number; y: number; text: string; crit: boolean; alpha: number; scale: number }>;
  /** 怪物头顶状态图标 */
  statusIcons: Array<{ x: number; y: number; kind: 'burn' | 'slow' | 'stun' }>;
  /** 左下消耗品栏 4 格 */
  consumables: Array<{ id: string; name: string; count: number; color: string } | null>;
  /** 护盾点数（先于 HP 扣减） */
  shield: number;
  /** 能量药水剩余时间（>0 时生效） */
  energyT: number;
  /** 已持雷，等待攻击键掷出 */
  bombArmed: boolean;
  /** 顶部安全区（HUD 虚拟单位，微信真机避开刘海/胶囊，浏览器为 0） */
  safeTop: number;
  kills: number;
  /** 累计金币（左上角金币面板） */
  coins: number;
  /** 金币拾取飞向面板的特效（p: 0~1 飞行进度） */
  coinFlies: Array<{ x0: number; y0: number; p: number }>;
  banner: string;
  bannerSub: string;
  bannerAlpha: number;
  toasts: ToastMsg[];
  hurt: number;
  swing: number;
  adT: number;
  char: CharPanelData | null;
  /** 物品栏面板数据（overlay==='bag' 时才有） */
  bag: BagPanelData | null;
  viewMode: number; // 0 = 第一人称, 1 = 第三人称
  /** 音乐开关状态（HUD 按钮 / 暂停面板显示） */
  musicOn: boolean;
  /** 音乐音量 0~1（暂停面板滑条显示） */
  musicVol: number;
  /** 怪物头顶名牌（颜色按等级区分，由 GameRoot 传入） */
  mobNames: Array<{ x: number; y: number; text: string; color: string; boss: boolean }>;
  /** 斗兽场 BOSS 顶部大血条（无 BOSS 在场时为 null） */
  arenaBoss: { name: string; ratio: number; wave: number } | null;
  /** 主页地图选择面板是否展开 */
  mapPanel: boolean;
  /** 当前选中地图名（主页地图按钮文案用） */
  mapName: string;
  /** 地图切换过场（null = 无切换） */
  mapSwitching: { icon: string; name: string; progress: number } | null;
  /** 三张地图卡片数据 */
  maps: Array<{ id: string; name: string; icon: string; desc: string; unlocked: boolean; selected: boolean; lockText: string }>;
  /** 模拟广告总时长（大招广告 6s，其余 3s） */
  adTotal: number;
  /** v2.5 三个大招：充能 / 广告次数 / 冷却 */
  ults: Array<{ id: string; name: string; icon: string; color: string; charge: number; charges: number; cd: number }>;
  /** 大招释放的全屏演出（null = 无） */
  ultFx: { id: string; name: string; color: string; t: number; total: number } | null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WHITE = '#ffffff';
const GREEN = '#4CAF50';
const PINK = '#F46B95';
const RED = '#EF5350';
const ORANGE = '#FF8A3D';

// ---------------- v2.3 常量（原 Items / Blocks） ----------------
const TIER_NAMES = ['', '普通', '优良', '精良', '史诗', '传说'];
const TIER_COLORS = ['', '#FAFAFA', '#7BE38A', '#42A5F5', '#BA68C8', '#FFD54F'];

const SLOT_NAMES: Record<SlotId, string> = {
  weapon: '宝剑', helmet: '头盔', armor: '铠甲', ring: '戒指', tool: '工具',
};

/** 人物皮肤：改变第三人称人物模型的主色调 */
interface SkinPreset {
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

const SKIN_PRESETS: SkinPreset[] = [
  { id: 'sk_default', name: '冒险者', skin: '#C68642', shirt: '#1E88E5', pants: '#3949AB', shoes: '#5D4037', accent: '#42A5F5' },
  { id: 'sk_bronze', name: '青铜勇者', skin: '#C98B5B', shirt: '#8D6E63', pants: '#5D4037', shoes: '#3E2723', accent: '#D79A63' },
  { id: 'sk_gold', name: '黄金骑士', skin: '#F5D06A', shirt: '#D2A22F', pants: '#A97C12', shoes: '#6D4C10', accent: '#FFD54F' },
  { id: 'sk_platinum', name: '铂金银卫', skin: '#DEF1F5', shirt: '#6F9BAB', pants: '#4A7683', shoes: '#2F5560', accent: '#BFE9F2' },
  { id: 'sk_diamond', name: '钻石锋刃', skin: '#C3E9FF', shirt: '#5B8FC9', pants: '#3F6E9E', shoes: '#204A70', accent: '#9FDCFF' },
  { id: 'sk_legend', name: '传说之王', skin: '#CDBCFF', shirt: '#6F4FC0', pants: '#4B3400', shoes: '#2C1B52', accent: '#B388FF' },
];

/** 宝剑图鉴（武器池） */
const WEAPONS: EquipDef[] = [
  { id: 'w_wood', slot: 'weapon', name: '木剑', tier: 1, dmg: 18, color: '#A1887F', desc: '入门之剑，攻击稳定' },
  { id: 'w_stone', slot: 'weapon', name: '石剑', tier: 2, dmg: 26, color: '#9E9E9E', desc: '沉甸甸的石刃，挥砍有力' },
  { id: 'w_iron', slot: 'weapon', name: '铁剑', tier: 3, dmg: 34, color: '#CFD8DC', desc: '铁匠铺的骄傲，削铁如泥' },
  { id: 'w_crossbow', slot: 'weapon', name: '铁弩', tier: 3, dmg: 30, color: '#B0BEC5', desc: '远程弩箭，穿透 2 个敌人' },
  { id: 'w_gold', slot: 'weapon', name: '金剑', tier: 4, dmg: 40, color: '#FFD54F', desc: '华贵之刃，伤害可观' },
  { id: 'w_diamond', slot: 'weapon', name: '钻石剑', tier: 5, dmg: 45, color: '#4DD0E1', desc: '璀璨夺目，无坚不摧' },
  { id: 'w_firegun', slot: 'weapon', name: '火焰喷管', tier: 4, dmg: 22, color: '#FF7043', desc: '3 连珠扇形，命中灼烧' },
  { id: 'w_staff', slot: 'weapon', name: '奥术法杖', tier: 5, dmg: 55, color: '#BA68C8', desc: '追踪飞弹，命中连锁 2 目标' },
  { id: 'w_fire', slot: 'weapon', name: '火焰剑', tier: 5, dmg: 55, color: '#FF7043', desc: '传说之剑，命中灼烧2秒' },
  { id: 'w_spear', slot: 'weapon', name: '长矛', tier: 2, dmg: 24, color: '#BCAAA4', desc: '长柄利器，攻击距离远' },
  { id: 'w_bow', slot: 'weapon', name: '木弓', tier: 2, dmg: 18, color: '#A1887F', desc: '远程箭矢，射程 18m' },
  { id: 'w_dagger', slot: 'weapon', name: '匕首', tier: 1, dmg: 14, color: '#ECEFF1', desc: '轻便迅捷，攻速极快' },
  { id: 'w_axe', slot: 'weapon', name: '战斧', tier: 3, dmg: 38, color: '#795548', desc: '重斧劈砍，伤害爆表' },
  { id: 'w_hammer', slot: 'weapon', name: '巨锤', tier: 4, dmg: 48, color: '#607D8B', desc: '雷霆一击，溅射震慑群敌' },
  { id: 'w_scythe', slot: 'weapon', name: '镰刀', tier: 4, dmg: 42, color: '#9FA8DA', desc: '夺命弧光，收割生命' },
  { id: 'w_ice', slot: 'weapon', name: '冰霜剑', tier: 5, dmg: 44, color: '#81D4FA', desc: '寒冰附魔，命中减速 35%' },
  { id: 'w_thunder', slot: 'weapon', name: '雷电剑', tier: 5, dmg: 50, color: '#FFEB3B', desc: '雷霆之力，连锁电击 2 目标' },
  { id: 'w_star', slot: 'weapon', name: '星辰剑', tier: 5, dmg: 58, color: '#E1BEE7', desc: '陨星铸造，灼烧并连锁' },
];

/** 快捷栏方块（草 / 土 / 石 / 沙 / 木 / Coze 粉） */
const HOTBAR_BLOCKS = [1, 2, 3, 4, 5, 8];
const BLOCK_COLORS: Record<number, string> = {
  1: '#4CAF50', 2: '#8D6E63', 3: '#9E9E9E', 4: '#FDD835', 5: '#795548',
  6: '#2E7D32', 7: '#2196F3', 8: '#F46B95', 9: '#E53935', 10: '#FDD835',
  11: '#FAFAFA', 12: '#C62828', 13: '#6D4C41', 14: '#B3E5FC', 15: '#ECEFF1',
};

/** 金币数展示：过万缩写 */
function fmtCoins(n: number): string {
  if (n >= 100000) return `${Math.floor(n / 10000)}万`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

function mainStat(item: EquipDef): string {
  switch (item.slot) {
    case 'weapon': return `攻${item.dmg}`;
    case 'helmet': return `命+${item.hp}`;
    case 'armor': return `减伤${Math.round((item.armor || 0) * 100)}%`;
    case 'ring': return `回血${item.regen}/s`;
    case 'tool': return `攻+${item.dmg}`;
    default: return '';
  }
}

export class Hud {
  private readonly p: Painter;
  private state: HudState = 'loading';
  private overlay: HudOverlay = 'none';

  // 横屏设计分辨率 720×400 (16:9)；FIXED_WIDTH 策略下自适应
  W = 720;
  H = 400;
  u = 1;

  /** 触控命中区（每帧布局时更新） */
  joyCenter = { x: 64, y: 330 };
  joyR = 56;
  btnJump = { x: 0, y: 0, r: 26, id: 'jump' };
  btnPlace = { x: 0, y: 0, r: 24, id: 'place' };
  btnBreak = { x: 0, y: 0, r: 24, id: 'break' };
  btnAttack = { x: 0, y: 0, r: 32, id: 'attack' };
  private slots: Array<Rect & { id: string }> = [];
  private pauseBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'pause' };
  private charBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'char' };
  /** 背包按钮：打开物品栏面板 */
  private bagBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'bag' };
  private viewBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'view' };
  private startBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'start' };
  private resumeBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'resume' };
  private homeBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'home' };
  private deadReviveBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'adRevive' };
  private deadRestartBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'restart' };
  private failRetryBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'retryWave' };
  private failHomeBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'failHome' };
  private charCloseBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'closeChar' };
  private adEquipBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'adEquip' };
  /** 物品栏图鉴右下角：看广告免费领装备 */
  private bagAdBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'adBag' };
  private weaponCells: Array<Rect & { id: string }> = [];
  /** 人物栏：皮肤格子 */
  private skinCells: Array<Rect & { id: string }> = [];
  /** 物品栏：装备格子 + 关闭按钮 */
  private bagCloseBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'closeBag' };
  private invCells: Array<Rect & { id: string }> = [];
  /** 左下消耗品 4 格 */
  private consSlots: Array<Rect & { id: string }> = [];
  /** 右侧中部「宝剑」悬浮按钮 */
  legendBtn = { x: 0, y: 0, r: 26, id: 'legend' };
  /** v2.5 左侧三个大招键 + 对应看广告按钮 */
  private ultBtns: Array<{ x: number; y: number; r: number; id: string }> = [];
  private ultAdBtns: Array<Rect & { id: string }> = [];
  private rewardBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'rewardClose' };
  /** 通关自由时间的「下一关」按钮 */
  private nextWaveBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'nextWave' };
  private freeT = 0;
  private safeTop = 0;
  private mode: 'treasure' | 'arena' = 'treasure';
  /** 二选一状态（draw 时同步自 HudData） */
  private rewardPicked = -1;
  private rewardSecond = false;
  /** 寻宝模式的「⚔ 挑战」按钮 */
  private challengeBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'challenge' };
  /** 主页「🗺 地图」按钮与选择面板 */
  private mapBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'mapBtn' };
  private mapCards: Array<Rect & { id: string }> = [];
  private mapCloseBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'mapClose' };
  private mapPanelOpen = false;
  /** 自由时间的「离开斗兽场」按钮 */
  private leaveArenaBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'leaveArena' };
  /** 二选一面板命中区 */
  private pickWBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'pickW' };
  private pickEBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'pickE' };
  private adSecondBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'adSecond' };
  /** 音乐开关按钮（右上角功能行） */
  private musicBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'music' };
  /** 分享按钮（音乐左侧），点击展开转发 / 朋友圈 / 海报三项 */
  private shareBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'share' };
  private shareItems: Array<Rect & { id: string }> = [];
  private shareOpen = false;

  // ---------------- 金币面板 / 拾取特效 ----------------
  private coinPanel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** 上一帧金币数（用于检测增加并触发弹跳） */
  private coinShown = -1;
  /** 金币面板弹跳强度 1→0 */
  private coinPunch = 0;
  private coinSparks: Array<{ x: number; y: number; vx: number; vy: number; t: number; ttl: number }> = [];
  private coinPops: Array<{ text: string; t: number; ttl: number }> = [];
  private lastDrawT = -1;
  /** 暂停面板：音乐开关按钮 */
  private musTBtn: Rect & { id: string } = { x: 0, y: 0, w: 0, h: 0, id: 'musT' };
  /** 暂停面板：音量滑条轨道（GameRoot 拖动时读取此矩形） */
  volBar: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private musicOn = true;
  private musicVol = 1;

  constructor(host: Node) {
    this.p = new Painter(host);
  }

  setSize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    this.u = Math.max(0.6, Math.min(2, Math.min(w / 720, h / 400)));
    this.p.setSize(w, h);
    this.layout();
  }

  // 横屏布局（720×400）：左侧摇杆，右下同心弧按钮群，顶部信息横条
  private layout(): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;
    const B = 24 * u; // 底部安全边距（避开 Home 指示条）

    // === 左下：摇杆 ===
    this.joyR = 56 * u;
    this.joyCenter = { x: 24 * u + this.joyR, y: H - B - this.joyR };

    // === 右下按钮群：以攻击为圆心，其余三键沿半径 88u 的弧线靠拢 ===
    this.btnAttack = { x: W - 16 * u - 44 * u, y: H - B - 44 * u, r: 44 * u, id: 'attack' };
    const R = 88 * u;
    const d45 = R * 0.7071;
    this.btnJump = { x: this.btnAttack.x, y: this.btnAttack.y - R, r: 26 * u, id: 'jump' };
    this.btnPlace = { x: this.btnAttack.x - d45, y: this.btnAttack.y - d45, r: 26 * u, id: 'place' };
    this.btnBreak = { x: this.btnAttack.x - R, y: this.btnAttack.y, r: 26 * u, id: 'break' };

    // === 底部：快捷栏 8 格（与动作区保持 12u 间距） ===
    const slotCount = 8;
    const gap = 4 * u;
    const s = 40 * u;
    const total = slotCount * s + (slotCount - 1) * gap;
    const breakLeft = this.btnBreak.x - this.btnBreak.r;
    const x0 = breakLeft - 12 * u - total;
    const y0 = H - B - s;
    this.slots = [];
    for (let i = 0; i < slotCount; i++) {
      this.slots.push({ x: x0 + i * (s + gap), y: y0, w: s, h: s, id: `slot${i}` });
    }

    // === 左下：消耗品 4 格（摇杆上方，间距 16u） ===
    const cs = 44 * u;
    const cgap = 8 * u;
    const consY = this.joyCenter.y - this.joyR - 16 * u - cs;
    this.consSlots = [];
    for (let i = 0; i < 4; i++) {
      this.consSlots.push({ x: 24 * u + i * (cs + cgap), y: consY, w: cs, h: cs, id: `cons${i}` });
    }

    // === 通关自由时间：居中并排，抬到快捷栏上方 10u，避免压住 8 格快捷栏 ===
    const freeY = H - B - s - 10 * u - 30 * u;
    this.nextWaveBtn = { x: W / 2 - 130 * u, y: freeY, w: 124 * u, h: 30 * u, id: 'nextWave' };
    this.leaveArenaBtn = { x: W / 2 + 6 * u, y: freeY, w: 124 * u, h: 30 * u, id: 'leaveArena' };

    // === 寻宝模式：顶部中央面板下方的「⚔ 挑战」按钮 ===
    this.challengeBtn = { x: W / 2 - 55 * u, y: 42 * u + this.safeTop, w: 110 * u, h: 26 * u, id: 'challenge' };

    // === 左上：金币面板（血条 / 护盾条下方） ===
    this.coinPanel = { x: 12 * u, y: 12 * u + this.safeTop + 32 * u, w: 108 * u, h: 20 * u };

    // === 顶部横条：右上功能键整体下移，避让微信胶囊区（96×36） ===
    const topY = 52 * u + this.safeTop;
    this.viewBtn = { x: W - 52 * u, y: topY, w: 36 * u, h: 36 * u, id: 'view' };
    this.pauseBtn = { x: W - 96 * u, y: topY, w: 36 * u, h: 36 * u, id: 'pause' };
    this.charBtn = { x: W - 140 * u, y: topY, w: 36 * u, h: 36 * u, id: 'char' };
    this.bagBtn = { x: W - 184 * u, y: topY, w: 36 * u, h: 36 * u, id: 'bag' };
    // 音乐开关按钮：背包左侧
    this.musicBtn = { x: W - 228 * u, y: topY, w: 36 * u, h: 36 * u, id: 'music' };
    // 分享按钮：音乐左侧，点击展开三项分享入口
    this.shareBtn = { x: W - 272 * u, y: topY, w: 36 * u, h: 36 * u, id: 'share' };
    this.shareItems = [];
    {
      const siW = 124 * u;
      const siH = 30 * u;
      const siX = this.shareBtn.x - (siW - this.shareBtn.w);
      const ids = ['shareFriend', 'shareTimeline', 'sharePoster'];
      for (let i = 0; i < 3; i++) {
        this.shareItems.push({
          x: siX,
          y: topY + 44 * u + i * (siH + 6 * u),
          w: siW,
          h: siH,
          id: ids[i],
        });
      }
    }

    // === 右上：宝剑按钮贴在功能键行下方，避免与「视角/暂停/人物/物品」叠在一起 ===
    this.legendBtn = { x: W - 40 * u, y: topY + 36 * u + 34 * u, r: 24 * u, id: 'legend' };

    // === 左下：三个大招键横排（摇杆右侧、快捷栏上方的空档），右下角挂广告小徽标 ===
    this.ultBtns = [];
    this.ultAdBtns = [];
    const ultY = this.consSlots[0].y + cs + 22 * u;
    for (let i = 0; i < 3; i++) {
      const cx = 168 * u + i * 44 * u;
      this.ultBtns.push({ x: cx, y: ultY, r: 18 * u, id: `ult${i}` });
      this.ultAdBtns.push({ x: cx + 13 * u - 10 * u, y: ultY + 13 * u - 10 * u, w: 20 * u, h: 20 * u, id: `ultAd${i}` });
    }
  }

  private inRect(r: Rect, x: number, y: number): boolean {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** 触控命中：返回动作 id */
  hitTest(x: number, y: number): string | null {
    const u = this.u;
    if (this.overlay === 'ad') return null;
    if (this.overlay === 'reward') {
      // 二选一：未选时只能点两张卡；选后另一件可看广告，或点「收下」关闭
      if (this.rewardPicked < 0) {
        if (this.inRect(this.pickWBtn, x, y)) return 'pickW';
        if (this.inRect(this.pickEBtn, x, y)) return 'pickE';
        return null;
      }
      if (!this.rewardSecond && this.inRect(this.adSecondBtn, x, y)) return 'adSecond';
      return this.inRect(this.rewardBtn, x, y) ? 'rewardClose' : null;
    }
    if (this.state === 'dead') {
      if (this.inRect(this.deadReviveBtn, x, y)) return 'adRevive';
      if (this.inRect(this.deadRestartBtn, x, y)) return 'restart';
      return null;
    }
    if (this.state === 'fail') {
      if (this.inRect(this.failRetryBtn, x, y)) return 'retryWave';
      if (this.inRect(this.failHomeBtn, x, y)) return 'failHome';
      return null;
    }
    if (this.overlay === 'character') {
      if (this.inRect(this.charCloseBtn, x, y)) return 'closeChar';
      if (this.inRect(this.adEquipBtn, x, y)) return 'adEquip';
      for (const c of this.weaponCells) {
        if (this.inRect(c, x, y)) return c.id;
      }
      for (const c of this.skinCells) {
        if (this.inRect(c, x, y)) return c.id;
      }
      return null;
    }
    if (this.overlay === 'bag') {
      if (this.inRect(this.bagCloseBtn, x, y)) return 'closeBag';
      if (this.inRect(this.bagAdBtn, x, y)) return 'adBag';
      for (const c of this.invCells) {
        if (this.inRect(c, x, y)) return c.id;
      }
      for (const c of this.weaponCells) {
        if (this.inRect(c, x, y)) return c.id;
      }
      return null;
    }
    if (this.state === 'menu') {
      return this.inRect(this.startBtn, x, y) ? 'start' : null;
    }
    if (this.state === 'paused') {
      for (const r of [this.resumeBtn, this.homeBtn, this.musTBtn]) {
        if (this.inRect(r, x, y)) return r.id;
      }
      // 音量滑条（上下放宽 6u 方便点按）
      if (x >= this.volBar.x && x <= this.volBar.x + this.volBar.w && y >= this.volBar.y - 6 * this.u && y <= this.volBar.y + this.volBar.h + 6 * this.u) return 'volBar';
      return null;
    }
    if (this.state !== 'playing') return null;

    // 分享面板展开时优先响应三项入口，点其他位置则收起
    if (this.shareOpen) {
      for (const it of this.shareItems) {
        if (this.inRect(it, x, y)) {
          this.shareOpen = false;
          return it.id;
        }
      }
      this.shareOpen = false;
      return null;
    }
    if (this.inRect(this.shareBtn, x, y)) {
      this.shareOpen = true;
      return 'share';
    }

    if (this.mode === 'treasure' && this.inRect(this.challengeBtn, x, y)) return 'challenge';
    if (this.freeT > 0 && this.inRect(this.nextWaveBtn, x, y)) return 'nextWave';
    if (this.freeT > 0 && this.mode === 'arena' && this.inRect(this.leaveArenaBtn, x, y)) return 'leaveArena';
    if (this.inRect(this.pauseBtn, x, y)) return 'pause';
    if (this.inRect(this.charBtn, x, y)) return 'char';
    if (this.inRect(this.bagBtn, x, y)) return 'bag';
    if (this.inRect(this.viewBtn, x, y)) return 'view';
    if (this.inRect(this.musicBtn, x, y)) return 'music';

    {
      const b = this.legendBtn;
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy <= (b.r + 8 * u) * (b.r + 8 * u)) return 'legend';
    }

    for (const b of [this.btnAttack, this.btnJump, this.btnPlace, this.btnBreak]) {
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy <= (b.r + 8 * u) * (b.r + 8 * u)) return b.id;
    }
    for (const r of this.slots) {
      if (x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2) return r.id;
    }
    for (const r of this.consSlots) {
      if (x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2) return r.id;
    }
    // 大招：右下角广告徽标优先级更高（叠在技能圆键上）；其余圆形区域为技能键
    for (let i = 0; i < this.ultBtns.length; i++) {
      const b = this.ultBtns[i];
      const a = this.ultAdBtns[i];
      if (a) {
        const ax = a.x + a.w / 2;
        const ay = a.y + a.h / 2;
        const adx = x - ax;
        const ady = y - ay;
        if (adx * adx + ady * ady <= (a.w * 0.62) * (a.w * 0.62)) return a.id;
      }
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy <= (b.r + 9 * u) * (b.r + 9 * u)) return b.id;
    }
    if (x < this.W * 0.5 && y > this.H * 0.5) return 'joy';
    return null;
  }

  draw(d: HudData): void {
    this.W = d.w;
    this.H = d.h;
    this.u = Math.max(0.6, Math.min(2, Math.min(d.w / 720, d.h / 400)));
    this.state = d.state;
    this.overlay = d.overlay;
    this.freeT = d.freeT;
    this.safeTop = d.safeTop || 0;
    this.mode = d.mode;
    this.musicOn = d.musicOn;
    this.musicVol = d.musicVol;
    this.rewardPicked = d.rewardPicked;
    this.rewardSecond = d.rewardSecond;
    this.mapPanelOpen = d.mapPanel;
    this.layout();
    this.p.setSize(d.w, d.h);

    this.p.begin();
    if (d.state === 'loading') {
      this.drawLoading(d);
    } else if (d.state === 'menu') {
      this.drawMenu(d);
    } else if (d.overlay === 'ad') {
      // 广告独占全屏：避免底层面板的文字（Label 层在 Graphics 之上）透出来
      this.drawAd(d);
    } else {
      // 弹窗/暂停等模态页面：不再绘制游戏内 HUD，避免文字浮在面板上
      const modal = d.state === 'paused' || d.state === 'dead' || d.state === 'fail'
        || d.overlay === 'character' || d.overlay === 'bag' || d.overlay === 'reward';
      if (!modal) this.drawPlaying(d);
      if (d.state === 'paused') this.drawPause(d);
      if (d.state === 'dead') this.drawDead(d);
      if (d.state === 'fail') this.drawFail(d);
      if (d.overlay === 'character') this.drawChar(d);
      if (d.overlay === 'bag') this.drawBag(d);
      if (d.overlay === 'reward') this.drawReward(d);
    }
    this.p.end();
  }

  // ---------------- 通用部件 ----------------
  private glass(x: number, y: number, w: number, h: number, r: number): void {
    this.p.fillRR(x, y, w, h, r, 'rgba(8, 14, 22, 0.62)');
    this.p.strokeRR(x, y, w, h, r, 'rgba(255, 255, 255, 0.14)', 1);
  }

  private heart(cx: number, cy: number, s: number, color: string, alpha = 1): void {
    this.p.circle(cx - s * 0.3, cy - s * 0.1, s * 0.34, color, alpha);
    this.p.circle(cx + s * 0.3, cy - s * 0.1, s * 0.34, color, alpha);
    this.p.poly([
      [cx - s * 0.6, cy + s * 0.04], [cx + s * 0.6, cy + s * 0.04], [cx, cy + s * 0.72],
    ], color);
  }

  private swordIcon(cx: number, cy: number, s: number, color: string, alpha = 1): void {
    this.p.save();
    this.p.translate(cx, cy);
    this.p.rotate(-Math.PI / 4);
    this.p.setAlpha(alpha);
    this.p.poly([[-s * 0.09, -s * 0.5], [s * 0.09, -s * 0.5], [0, -s * 0.72]], color);
    this.p.rect(-s * 0.09, -s * 0.5, s * 0.18, s * 0.7, color);
    this.p.rect(-s * 0.24, s * 0.18, s * 0.48, s * 0.1, '#8D6E63');
    this.p.rect(-s * 0.05, s * 0.28, s * 0.1, s * 0.26, '#5D4037');
    this.p.restore();
  }

  private slotIcon(slot: SlotId, cx: number, cy: number, s: number, color: string): void {
    if (slot === 'weapon') {
      this.swordIcon(cx, cy, s, color);
    } else if (slot === 'helmet') {
      this.p.circle(cx, cy + s * 0.08, s * 0.4, color);
      this.p.rect(cx - s * 0.5, cy + s * 0.08, s, s * 0.16, shadeHex(color, 0.75));
    } else if (slot === 'armor') {
      this.p.poly([
        [cx, cy - s * 0.5], [cx + s * 0.42, cy - s * 0.26], [cx + s * 0.32, cy + s * 0.24],
        [cx, cy + s * 0.52], [cx - s * 0.32, cy + s * 0.24], [cx - s * 0.42, cy - s * 0.26],
      ], color);
    } else if (slot === 'ring') {
      this.p.circleStroke(cx, cy, s * 0.32, color, s * 0.14);
      this.p.circle(cx, cy - s * 0.32, s * 0.12, '#FFFFFF');
    } else {
      this.p.save();
      this.p.translate(cx, cy);
      this.p.rotate(-Math.PI / 5);
      this.p.rect(-s * 0.05, -s * 0.42, s * 0.1, s * 0.86, '#8D6E63');
      this.p.poly([[-s * 0.3, -s * 0.44], [s * 0.16, -s * 0.42], [s * 0.1, -s * 0.12], [-s * 0.22, -s * 0.1]], color);
      this.p.restore();
    }
  }

  private miniCube(cx: number, cy: number, s: number, hex: string): void {
    const top = shadeHex(hex, 1.22);
    const left = shadeHex(hex, 0.8);
    const right = shadeHex(hex, 0.58);
    const hw = s * 0.5;
    const topH = s * 0.3;
    const bodyH = s * 0.62;
    this.p.quadFill([[cx, cy - topH], [cx + hw, cy], [cx, cy + topH], [cx - hw, cy]], top);
    this.p.quadFill([[cx - hw, cy], [cx, cy + topH], [cx, cy + topH + bodyH], [cx - hw, cy + bodyH]], left);
    this.p.quadFill([[cx, cy + topH], [cx + hw, cy], [cx + hw, cy + bodyH], [cx, cy + topH + bodyH]], right);
    this.p.polyStroke(
      [[cx, cy - topH], [cx + hw, cy], [cx, cy + topH], [cx - hw, cy], [cx, cy - topH]],
      'rgba(0, 0, 0, 0.30)', 1,
    );
  }

  private roundButton(cx: number, cy: number, r: number, color: string, label: string): void {
    const u = this.u;
    this.p.setAlpha(0.92);
    this.p.circle(cx, cy, r, 'rgba(8, 14, 22, 0.55)');
    this.p.setAlpha(1);
    this.p.circleStroke(cx, cy, r, 'rgba(255, 255, 255, 0.28)', 2 * u);
    this.p.circleStroke(cx, cy, r - 3.5 * u, color, 1.5 * u, 0.9);
    const fs = Math.round(r * (label.length > 1 ? 0.58 : 0.82));
    this.p.text(label, cx, cy, {
      size: fs, color: WHITE, align: 'center', stroke: 'rgba(0,0,0,0.45)', strokeWidth: 3,
    });
  }

  private panelButton(r: Rect, label: string, color: string, size = 15): void {
    const u = this.u;
    this.p.fillRR(r.x, r.y + 3 * u, r.w, r.h, 12 * u, 'rgba(0, 0, 0, 0.35)');
    this.p.fillRR(r.x, r.y, r.w, r.h, 12 * u, color);
    this.p.fillRR(r.x, r.y, r.w, r.h * 0.5, 12 * u, 'rgba(255, 255, 255, 0.14)');
    this.p.text(label, r.x + r.w / 2, r.y + r.h / 2, {
      size: size * u, color: WHITE, align: 'center', stroke: 'rgba(0,0,0,0.25)', strokeWidth: 3,
    });
  }

  // ---------------- 加载页 ----------------
  private drawLoading(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;
    this.p.rect(0, 0, W, H, '#0b1220');
    this.p.vGrad(0, H * 0.15, W, H * 0.7, ['rgba(20, 60, 48, 0)', 'rgba(30, 96, 74, 0.45)', 'rgba(20, 60, 48, 0)'], 14);

    this.p.glow(W / 2, H * 0.34, 86 * u, PINK, 0.28);
    this.p.text('像素荒野寻宝', W / 2, H * 0.32, {
      size: 27 * u, color: WHITE, align: 'center', stroke: 'rgba(0, 0, 0, 0.35)', strokeWidth: 5,
    });
    this.p.text('P I X E L   W I L D E R N E S S', W / 2, H * 0.32 + 26 * u, {
      size: 8.5 * u, color: PINK, align: 'center',
    });

    const bw = 236 * u;
    const bh = 9 * u;
    const bx = W / 2 - bw / 2;
    const by = H * 0.55;
    this.p.text('正在生成体素地形', W / 2, by - 20 * u, { size: 12 * u, color: 'rgba(255,255,255,0.78)', align: 'center' });
    this.p.fillRR(bx, by, bw, bh, bh / 2, 'rgba(255, 255, 255, 0.14)');
    const pw = Math.max(bh, bw * Math.min(1, Math.max(0, d.progress)));
    this.p.fillRR(bx, by, pw, bh, bh / 2, GREEN);
    this.p.fillRR(bx, by, Math.max(0, pw - 6 * u), bh, bh / 2, '#7BE38A');
    this.p.text(`${Math.round(Math.min(1, Math.max(0, d.progress)) * 100)}%`, W / 2, by + 22 * u, {
      size: 12 * u, color: 'rgba(255,255,255,0.7)', align: 'center',
    });

    this.p.text('波次打怪 · 装备掉落 · 自由建造', W / 2, H - 14 * u, {
      size: 10 * u, color: 'rgba(255,255,255,0.45)', align: 'center',
    });
  }

  // ---------------- 主界面 ----------------
  private drawMenu(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;

    this.p.vGrad(0, 0, W, H, ['rgba(6, 12, 20, 0.93)', 'rgba(8, 22, 19, 0.74)', 'rgba(4, 10, 16, 0.95)'], 16);
    this.p.glow(W / 2, H * 0.28, 110 * u, PINK, 0.24);
    this.p.glow(W / 2, H * 0.28, 66 * u, '#7EE3C4', 0.16);

    this.p.setAlpha(0.95);
    this.miniCube(W * 0.17, H * 0.73, 30 * u, '#4CAF50');
    this.miniCube(W * 0.83, H * 0.7, 27 * u, '#F46B95');
    this.miniCube(W * 0.5, H * 0.86, 22 * u, '#FDD835');
    this.p.setAlpha(1);

    this.p.text('像素荒野寻宝', W / 2, H * 0.29, {
      size: 33 * u, color: WHITE, align: 'center', stroke: 'rgba(0, 0, 0, 0.40)', strokeWidth: 6,
    });
    this.p.text('波 次 打 怪 · 装 备 掉 落', W / 2, H * 0.29 + 30 * u, {
      size: 10 * u, color: PINK, align: 'center',
    });

    // 三个玩法标签
    const tags = ['限时波次', '怪物掉落', '装备图鉴'];
    const tw = 74 * u;
    const th = 22 * u;
    const tgap = 7 * u;
    const tx0 = W / 2 - (tags.length * tw + (tags.length - 1) * tgap) / 2;
    const ty = H * 0.415;
    for (let i = 0; i < tags.length; i++) {
      const x = tx0 + i * (tw + tgap);
      this.p.fillRR(x, ty, tw, th, th / 2, 'rgba(255, 255, 255, 0.10)');
      this.p.strokeRR(x, ty, tw, th, th / 2, 'rgba(255, 255, 255, 0.16)', 1);
      this.p.text(tags[i], x + tw / 2, ty + th / 2, {
        size: 10 * u, color: 'rgba(255,255,255,0.86)', align: 'center',
      });
    }

    // 开始按钮
    const bw = 178 * u;
    const bh = 48 * u;
    const bx = W / 2 - bw / 2;
    const by = H * 0.53;
    this.startBtn = { x: bx, y: by, w: bw, h: bh, id: 'start' };
    this.p.fillRR(bx, by + 3 * u, bw, bh, 14 * u, 'rgba(0, 0, 0, 0.35)');
    this.p.fillRR(bx, by, bw, bh, 14 * u, GREEN);
    this.p.fillRR(bx, by, bw, bh * 0.5, 14 * u, '#5BBD62');
    this.p.strokeRR(bx, by, bw, bh, 14 * u, 'rgba(255, 255, 255, 0.35)', 1.5);
    this.p.text('开始挑战', W / 2, by + bh / 2, {
      size: 18 * u, color: WHITE, align: 'center', stroke: 'rgba(0, 0, 0, 0.28)', strokeWidth: 4,
    });
    this.p.text('一波比一波强 · 击杀怪物掉落装备', W / 2, by + bh + 20 * u, {
      size: 10 * u, color: 'rgba(255,255,255,0.62)', align: 'center',
    });

    this.p.text(`${d.chunks} 个区块已载入   ·   FPS ${d.fps}`, W / 2, H * 0.74, {
      size: 9.5 * u, color: 'rgba(255,255,255,0.40)', align: 'center',
    });
    this.p.text('WASD 移动 · F 攻击 · 空格跳跃 · 左键放置 · 右键破坏', W / 2, H - 14 * u, {
      size: 9 * u, color: 'rgba(255,255,255,0.38)', align: 'center',
    });
  }

  /** 主页地图选择面板 */
  private drawMapPanel(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;

    this.p.rect(0, 0, W, H, 'rgba(0, 0, 0, 0.72)');

    const pw = 560 * u;
    const ph = 210 * u;
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2;
    this.p.fillRR(px, py, pw, ph, 14 * u, 'rgba(14, 20, 28, 0.97)');
    this.p.strokeRR(px, py, pw, ph, 14 * u, 'rgba(255, 255, 255, 0.2)', 1.5);

    this.p.text('选择寻宝地图', W / 2, py + 24 * u, {
      size: 16 * u, color: WHITE, align: 'center', stroke: 'rgba(0,0,0,0.3)', strokeWidth: 4,
    });
    this.p.text('在对应地图累计开启 10 个宝箱可解锁下一张', W / 2, py + 42 * u, {
      size: 9.5 * u, color: 'rgba(255,255,255,0.55)', align: 'center',
    });

    // 关闭按钮
    const cs = 26 * u;
    this.mapCloseBtn = { x: px + pw - cs - 8 * u, y: py + 8 * u, w: cs, h: cs, id: 'mapClose' };
    this.p.fillRR(this.mapCloseBtn.x, this.mapCloseBtn.y, cs, cs, cs / 2, 'rgba(255,255,255,0.12)');
    this.p.text('✕', this.mapCloseBtn.x + cs / 2, this.mapCloseBtn.y + cs / 2, {
      size: 13 * u, color: 'rgba(255,255,255,0.85)', align: 'center',
    });

    // 三张卡片横排
    const cw = 160 * u;
    const ch = 128 * u;
    const gap = 18 * u;
    const total = cw * 3 + gap * 2;
    const cx0 = W / 2 - total / 2;
    const cy0 = py + 62 * u;
    this.mapCards = [];
    for (let i = 0; i < d.maps.length; i++) {
      const m = d.maps[i];
      const x = cx0 + i * (cw + gap);
      this.mapCards.push({ x, y: cy0, w: cw, h: ch, id: `mapCard${i}` });

      const bg = !m.unlocked ? 'rgba(40, 44, 52, 0.85)'
        : m.selected ? 'rgba(46, 90, 40, 0.9)'
        : 'rgba(20, 30, 40, 0.85)';
      this.p.fillRR(x, cy0, cw, ch, 12 * u, bg);
      this.p.strokeRR(x, cy0, cw, ch, 12 * u,
        m.selected ? '#7BE38A' : m.unlocked ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)',
        m.selected ? 2 * u : 1);

      this.p.text(m.icon, x + cw / 2, cy0 + 30 * u, { size: 26 * u, color: WHITE, align: 'center' });
      this.p.text(m.name, x + cw / 2, cy0 + 54 * u, {
        size: 14 * u, color: m.unlocked ? WHITE : 'rgba(255,255,255,0.45)', align: 'center',
      });
      this.p.text(m.desc, x + cw / 2, cy0 + 72 * u, {
        size: 9 * u, color: m.unlocked ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)', align: 'center', maxWidth: cw - 12 * u,
      });

      // 底部状态
      if (!m.unlocked) {
        this.p.text('🔒 看广告解锁', x + cw / 2, cy0 + ch - 22 * u, {
          size: 10.5 * u, color: '#FFD54F', align: 'center',
        });
        this.p.text(m.lockText, x + cw / 2, cy0 + ch - 10 * u, {
          size: 8.5 * u, color: 'rgba(255,255,255,0.45)', align: 'center',
        });
      } else if (m.selected) {
        this.p.text('✓ 当前地图', x + cw / 2, cy0 + ch - 14 * u, {
          size: 10 * u, color: '#7BE38A', align: 'center',
        });
      } else {
        this.p.text('点击前往', x + cw / 2, cy0 + ch - 14 * u, {
          size: 10 * u, color: 'rgba(255,255,255,0.55)', align: 'center',
        });
      }
    }
  }

  // ---------------- 游戏内 HUD ----------------
  private drawPlaying(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;

    // 顶部半透明渐变（压住顶部 HUD 区域）
    this.p.vGrad(0, 0, W, 50 * u, ['rgba(0, 0, 0, 0.42)', 'rgba(0, 0, 0, 0)'], 8);
    // 底部半透明渐变（压住按钮 / 快捷栏区域）
    this.p.vGrad(0, H - 100 * u, W, 100 * u, ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.38)'], 8);

    // 准星：外圈 + 中心点 + 四向刻度 + 呼吸光
    const cx = W / 2;
    const cy = H / 2;
    const len = 8 * u;
    const gap = 5 * u;
    const breathe = 0.75 + Math.sin(d.time * 2.4) * 0.25;
    this.p.glow(cx, cy, 11 * u, '#9BE7FF', 0.16 * breathe);
    this.p.setAlpha(0.72);
    this.p.circleStroke(cx, cy, gap + 1.5 * u, 'rgba(255,255,255,0.75)', 1 * u);
    this.p.circle(cx, cy, 1.4 * u, '#FFFFFF');
    this.p.rect(cx - gap - len, cy - 1 * u, len, 2 * u, '#ffffff');
    this.p.rect(cx + gap, cy - 1 * u, len, 2 * u, '#ffffff');
    this.p.rect(cx - 1 * u, cy - gap - len, 2 * u, len, '#ffffff');
    this.p.rect(cx - 1 * u, cy + gap, 2 * u, len, '#ffffff');
    this.p.setAlpha(1);

    // 攻击挥砍弧光
    if (d.swing > 0.01) {
      this.p.ellStroke(cx, cy, 24 * u, 24 * u, 0, '#FFFFFF', 3 * u, d.swing * 0.8, -2.4, -0.4, false);
    }

    this.drawHearts(d);
    this.drawWaveBar(d);
    this.drawHotbar(d);
    this.drawConsumables(d);
    this.drawUltButtons(d);
    this.drawJoystick(d);
    this.drawButtons();
    this.drawPauseButton();
    this.drawCharButton();
    this.drawBagButton();
    this.drawViewButton(d);
    this.drawMusicButton();
    this.drawShareButton(d);
    this.drawLegendButton(d);
    this.drawChestHint(d);
    this.drawBossArrows(d);
    this.drawDmgTexts(d);
    this.drawStatusIcons(d);
    this.drawMobNames(d);
    this.drawArenaBossBar(d);
    this.drawCoinPanel(d);
    this.drawCoinFlies(d);
    this.drawToasts(d);
    this.drawNextWaveBtn(d); // 自由时间按钮绘制在提示条之上，保证可点区域不被遮挡

    // 选中方块名（淡出）
    if (d.blockNameAlpha > 0.01 && d.blockName) {
      this.p.setAlpha(d.blockNameAlpha);
      const ty = H - 72 * u;
      this.p.text(d.blockName, W / 2, ty, {
        size: 12 * u, color: '#ffffff', align: 'center', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 4,
      });
      this.p.setAlpha(1);
    }

    // 波次横幅（通关/来袭）：金色渐变 + 光晕
    if (d.bannerAlpha > 0.01 && d.banner) {
      const gold = '#FFD54F';
      const by = H * 0.34;
      this.p.setAlpha(Math.min(1, d.bannerAlpha));
      this.p.glow(W / 2, by, 92 * u, gold, 0.22);
      this.p.glow(W / 2, by, 48 * u, '#FFFFFF', 0.10);
      this.p.text(d.banner, W / 2, by, {
        size: 25 * u, color: gold, align: 'center', stroke: 'rgba(80,44,0,0.72)', strokeWidth: 7,
      });
      if (d.bannerSub) {
        this.p.text(d.bannerSub, W / 2, by + 22 * u, {
          size: 9.5 * u, color: 'rgba(255,255,255,0.86)', align: 'center', regular: true,
        });
      }
      this.p.setAlpha(1);
    }

    // 新手提示（横屏屏高只有 400u，压矮到 24u 并上移到 banner 下方）
    if (d.hintAlpha > 0.01) {
      this.p.setAlpha(d.hintAlpha);
      const hy = 56 * u;
      this.p.fillRR(W / 2 - 118 * u, hy, 236 * u, 24 * u, 12 * u, 'rgba(8, 14, 22, 0.62)');
      this.p.strokeRR(W / 2 - 118 * u, hy, 236 * u, 24 * u, 12 * u, 'rgba(255, 255, 255, 0.16)', 1);
      this.p.text('「攻」击杀怪物 · 清空怪物进入下一波', W / 2, hy + 12 * u, {
        size: 9.5 * u, color: 'rgba(255,255,255,0.88)', align: 'center',
      });
      this.p.setAlpha(1);
    }

    // 受击红闪
    if (d.hurt > 0.01) {
      this.p.rect(0, 0, W, H, `rgba(229, 57, 53, ${(d.hurt * 0.3).toFixed(3)})`);
    }

    // 大招全屏演出（盖在受击红闪之上）
    if (d.ultFx) this.drawUltFx(d.ultFx);

    // 换图过场遮罩（盖住区块重建成型的瞬间）
    if (d.mapSwitching) this.drawMapSwitching(d.mapSwitching);
  }

  /** v2.5 左下大招三连：充能环 + 图标 + 右下角广告小徽标（键旁不写字） */
  private drawUltButtons(d: HudData): void {
    const u = this.u;
    for (let i = 0; i < this.ultBtns.length; i++) {
      const b = this.ultBtns[i];
      const s = d.ults[i];
      if (!s) continue;
      const ready = s.charge >= 100 || s.charges > 0;
      const pulse = 0.5 + 0.5 * Math.sin(d.time * 4.2 + i * 1.7);
      // 底光
      if (ready) {
        this.p.glow(b.x, b.y, b.r * 1.9, s.color, 0.14 + 0.14 * pulse);
      }
      this.p.circle(b.x, b.y, b.r, 'rgba(8, 14, 22, 0.72)');
      this.p.circleStroke(b.x, b.y, b.r, ready ? s.color : 'rgba(255,255,255,0.18)', 1.2 * u);
      // 充能环
      this.p.circleStroke(b.x, b.y, b.r - 2.6 * u, 'rgba(255,255,255,0.10)', 3 * u);
      const ratio = Math.min(1, s.charge / 100);
      if (ratio > 0.005) {
        this.p.ellStroke(
          b.x, b.y, b.r - 2.6 * u, b.r - 2.6 * u, 0, s.color, 3 * u,
          ready ? 0.95 : 0.85, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false,
        );
      }
      // 圆内：华丽矢量图标 + 冷却 / 充能百分比
      this.drawUltIcon(s.id, b.x, b.y - 3.5 * u, b.r * 0.6, s.color, ready, d.time);
      if (s.cd > 0) {
        this.p.text(`${s.cd.toFixed(1)}`, b.x, b.y + 11 * u, {
          size: 7.5 * u, color: '#FFFFFF', align: 'center', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 2,
        });
      } else if (!ready) {
        this.p.text(`${Math.floor(s.charge)}%`, b.x, b.y + 11.5 * u, {
          size: 6.5 * u, color: 'rgba(255,255,255,0.72)', align: 'center',
        });
      }
      // 已有广告次数：左上角小徽标
      if (s.charges > 0) {
        this.p.circle(b.x - b.r * 0.82, b.y - b.r * 0.82, 7 * u, s.color);
        this.p.text(`${s.charges}`, b.x - b.r * 0.82, b.y - b.r * 0.82 + 0.5 * u, {
          size: 8 * u, color: '#22160A', align: 'center',
        });
      }
      // 右下角广告小徽标：只有播放三角，不写字
      const a = this.ultAdBtns[i];
      if (a) {
        const ax = a.x + a.w / 2;
        const ay = a.y + a.h / 2;
        const hot = 0.5 + 0.5 * Math.sin(d.time * 3 + i);
        const rr = a.w * 0.5;
        this.p.circle(ax, ay + 1.5 * u, rr, 'rgba(0,0,0,0.35)');
        this.p.circle(ax, ay, rr, `rgba(255, 193, 7, ${(0.26 + 0.14 * hot).toFixed(3)})`);
        this.p.circleStroke(ax, ay, rr, 'rgba(255, 213, 79, 0.9)', 1);
        this.p.text('▶', ax + 0.6 * u, ay + 0.8 * u, {
          size: 7.5 * u, color: '#FFF3C4', align: 'center',
        });
      }
    }
  }

  /** 大招矢量图标：陨石火球 / 雷霆闪电 / 冰晶雪花（替代字符图标） */
  private drawUltIcon(id: string, x: number, y: number, r: number, color: string, bright: boolean, t: number): void {
    const p = this.p;
    const lw = (k: number) => Math.max(1, r * k);
    // 背光 + 旋转外弧
    p.glow(x, y, r * 1.25, color, bright ? 0.34 : 0.18);
    const rot = t * 0.8;
    p.ellStroke(x, y, r * 1.32, r * 1.32, 0, color, lw(0.08), bright ? 0.6 : 0.3, rot, rot + 1.9, false);
    p.ellStroke(x, y, r * 1.32, r * 1.32, 0, '#FFFFFF', lw(0.05), bright ? 0.5 : 0.2, rot + Math.PI, rot + Math.PI + 1.2, false);

    if (id === 'meteor') {
      // 火焰尾迹（朝左下，随时间抖动）
      const fl = 0.85 + 0.15 * Math.sin(t * 9);
      p.poly([
        [x - 0.1 * r, y + 0.05 * r],
        [x - 1.35 * r * fl, y + 0.9 * r],
        [x - 0.55 * r, y + 0.3 * r],
        [x - 1.2 * r * fl, y + 0.08 * r],
        [x - 0.5 * r, y - 0.3 * r],
      ], '#FF6D3A');
      p.poly([
        [x - 0.1 * r, y],
        [x - 0.95 * r * fl, y + 0.62 * r],
        [x - 0.4 * r, y + 0.16 * r],
        [x - 0.85 * r * fl, y - 0.06 * r],
      ], '#FFB03A');
      // 熔岩球体（四层由深到亮）
      const bx = x + 0.12 * r;
      const by = y - 0.12 * r;
      p.circle(bx, by, r * 0.84, '#A6290A');
      p.circle(bx, by, r * 0.7, '#F4511E');
      p.circle(bx - 0.06 * r, by - 0.06 * r, r * 0.5, '#FFA726');
      p.circle(bx - 0.1 * r, by - 0.12 * r, r * 0.28, '#FFF59D');
      p.circle(bx - 0.12 * r, by - 0.16 * r, r * 0.13, '#FFFFFF');
      // 环绕火星
      for (let i = 0; i < 4; i++) {
        const a2 = t * 2.2 + i * Math.PI * 0.5;
        const rd = r * (1.0 + 0.14 * Math.sin(t * 5 + i));
        p.circle(x + Math.cos(a2) * rd, y + Math.sin(a2) * rd * 0.8, lw(0.12), i % 2 ? '#FFE082' : '#FF7043');
      }
    } else if (id === 'thunder') {
      // 三层闪电（外橙光 → 黄色 → 白色芯）+ 两侧电弧
      const flick = 0.72 + 0.28 * Math.abs(Math.sin(t * 12));
      const shape = [
        [0.1, -0.95], [-0.44, 0.0], [-0.04, 0.0], [-0.3, 0.95], [0.5, -0.14], [0.07, -0.14],
      ];
      const scale = (k: number) => shape.map(([px, py]) => [x + px * r * k, y + py * r * k]);
      p.poly(scale(1.14), `rgba(255, 143, 0, ${(0.6 * flick).toFixed(3)})`);
      p.poly(scale(1.0), '#FFB300');
      p.poly(scale(0.8), bright ? '#FFEB3B' : '#FFD54F');
      p.poly(scale(0.46), '#FFFFFF');
      p.polyStroke([
        [x - r * 1.15, y - r * 0.62], [x - r * 0.85, y - r * 0.28], [x - r * 1.05, y + r * 0.05],
      ], color, lw(0.09), false);
      p.polyStroke([
        [x + r * 1.15, y - r * 0.15], [x + r * 0.9, y + r * 0.18], [x + r * 1.08, y + r * 0.5],
      ], color, lw(0.09), false);
    } else {
      // 冰晶雪花：六臂 + 枝杈 + 尖端亮点 + 中心六边形晶体
      const spin = t * 0.45;
      for (let i = 0; i < 6; i++) {
        const a2 = spin + (i * Math.PI) / 3;
        const ex = x + Math.cos(a2) * r;
        const ey = y + Math.sin(a2) * r;
        p.polyStroke([[x, y], [ex, ey]], '#4FC3F7', lw(0.16), false);
        p.polyStroke([[x, y], [ex, ey]], '#E1F5FE', lw(0.07), false);
        for (const f of [0.52, 0.78]) {
          const bx2 = x + Math.cos(a2) * r * f;
          const by2 = y + Math.sin(a2) * r * f;
          for (const sgn of [-1, 1]) {
            const ba = a2 + sgn * 0.58;
            p.polyStroke([
              [bx2, by2],
              [bx2 + Math.cos(ba) * r * 0.24, by2 + Math.sin(ba) * r * 0.24],
            ], '#B3E5FC', lw(0.09), false);
          }
        }
        p.circle(ex, ey, lw(0.1), '#FFFFFF');
      }
      const hex: number[][] = [];
      const hex2: number[][] = [];
      for (let i = 0; i < 6; i++) {
        const a2 = spin + (i * Math.PI) / 3;
        hex.push([x + Math.cos(a2) * r * 0.32, y + Math.sin(a2) * r * 0.32]);
        hex2.push([x + Math.cos(a2) * r * 0.2, y + Math.sin(a2) * r * 0.2]);
      }
      p.poly(hex, '#29B6F6');
      p.poly(hex2, '#E1F5FE');
      p.circle(x, y, lw(0.09), '#FFFFFF');
    }
  }

  /** 大招释放演出：白闪 + 暗角 + 双层光芒 + 符文环 + 速度线 + 技能专属元素 + 技能名 */
  private drawUltFx(fx: { id: string; name: string; color: string; t: number; total: number }): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;
    const cx = W / 2;
    const cy = H / 2;
    const total = Math.max(0.001, fx.total);
    const t = Math.max(0, fx.t);
    const p = 1 - t / total;         // 演出进度 0 → 1
    const a = t / total;             // 总体透明 1 → 0
    const col = fx.color;
    const keep = Math.min(1, a * 1.5);
    const rot = p * Math.PI * 1.2;
    const flash = Math.max(0, 1 - p / 0.13);
    // 确定性的伪随机（避免每帧跳动）
    const rnd = (i: number, s: number) => {
      const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    // ---- 1. 全屏染色 + 上下暗角 ----
    this.p.setAlpha(0.26 * keep);
    this.p.rect(0, 0, W, H, col);
    this.p.setAlpha(0.4 * keep);
    this.p.vGrad(0, 0, W, H * 0.32, ['rgba(0,0,0,0.9)', 'rgba(0,0,0,0)'], 7);
    this.p.vGrad(0, H * 0.68, W, H * 0.32, ['rgba(0,0,0,0)', 'rgba(0,0,0,0.9)'], 7);

    // ---- 2. 双层旋转光芒 ----
    const rayLen = (0.45 + p * 1.25) * W;
    for (let layer = 0; layer < 2; layer++) {
      const n = layer === 0 ? 18 : 9;
      const spin = rot * (layer === 0 ? 1 : -0.62);
      const spread = layer === 0 ? 0.034 : 0.068;
      const l = rayLen * (layer === 0 ? 1 : 0.7);
      this.p.setAlpha((layer === 0 ? 0.18 : 0.26) * keep);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + spin;
        this.p.poly([
          [cx, cy],
          [cx + Math.cos(ang - spread) * l, cy + Math.sin(ang - spread) * l * 0.6],
          [cx + Math.cos(ang) * l * 1.07, cy + Math.sin(ang) * l * 0.64],
          [cx + Math.cos(ang + spread) * l, cy + Math.sin(ang + spread) * l * 0.6],
        ], layer === 0 ? col : '#FFFFFF');
      }
    }

    // ---- 3. 双层旋转符文环（虚线弧段）----
    const runeRing = (radius: number, count: number, spin: number, color: string, alpha: number) => {
      this.p.setAlpha(alpha);
      const arc = (Math.PI * 2) / count * 0.6;
      for (let i = 0; i < count; i++) {
        const a0 = (i / count) * Math.PI * 2 + spin;
        this.p.ellStroke(cx, cy, radius, radius * 0.6, 0, color, Math.max(1, 2 * u * a), 1, a0, a0 + arc, false);
      }
    };
    runeRing((0.2 + p * 0.34) * W, 24, rot * 0.8, col, 0.55 * keep);
    runeRing((0.13 + p * 0.24) * W, 16, -rot * 1.1, '#FFFFFF', 0.32 * keep);

    // ---- 4. 四向星爆（冲击中心）----
    const burst = Math.max(0, 1 - p / 0.4);
    if (burst > 0.01) {
      const sr = (26 + 96 * p) * u;
      const sw = sr * 0.16;
      this.p.setAlpha(burst * 0.85);
      this.p.poly([
        [cx, cy - sr], [cx + sw, cy - sw], [cx + sr, cy], [cx + sw, cy + sw],
        [cx, cy + sr], [cx - sw, cy + sw], [cx - sr, cy], [cx - sw, cy - sw],
      ], '#FFFFFF');
      this.p.poly([
        [cx, cy - sr * 0.62], [cx + sw * 0.6, cy], [cx, cy + sr * 0.62], [cx - sw * 0.6, cy],
      ], col);
    }

    // ---- 5. 飞散速度线 ----
    this.p.setAlpha(0.5 * keep);
    for (let i = 0; i < 22; i++) {
      const ang = rnd(i, 1) * Math.PI * 2;
      const r0 = (0.1 + p * 0.85 * (0.6 + rnd(i, 2) * 0.6)) * W;
      const len = (14 + 34 * rnd(i, 3)) * u;
      this.p.polyStroke([
        [cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * 0.6],
        [cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len) * 0.6],
      ], '#FFFFFF', Math.max(1, 1.6 * u * a), false);
    }

    // ---- 6. 技能专属元素 ----
    if (fx.id === 'meteor') {
      // 四道拖尾火球俯冲 + 中心熔岩闪光
      for (let i = 0; i < 4; i++) {
        const k = Math.max(0, Math.min(1, (p - i * 0.05) / 0.5));
        if (k <= 0 || k >= 1) continue;
        const sx = W * (0.16 + rnd(i, 4) * 0.68);
        const tx = cx + (rnd(i, 5) - 0.5) * W * 0.52;
        const ty = cy + (rnd(i, 6) - 0.4) * H * 0.22;
        const x = sx + (tx - sx) * k;
        const y = -30 * u + (ty + 30 * u) * k * k;
        const tail = 52 * u;
        this.p.setAlpha(0.55 * keep);
        this.p.poly([
          [x, y], [x - tail * 0.34, y - tail], [x + tail * 0.16, y - tail * 0.86],
        ], '#FFB300');
        this.p.setAlpha(0.7 * keep);
        this.p.glow(x, y, 16 * u, '#FF7043', 0.5);
        this.p.circle(x, y, 5.5 * u, '#FFE082');
        this.p.circle(x, y, 3 * u, '#FFFFFF');
      }
      this.p.setAlpha(Math.max(0, Math.min(1, (0.55 - p) * 2)) * 0.7);
      if (p < 0.55) this.p.glow(cx, cy, 60 * u, '#FF7043', 0.55);
    } else if (fx.id === 'thunder') {
      // 三道折线闪电（彩色粗描 + 白色细芯，带闪烁）+ 横向扫光
      for (let i = 0; i < 3; i++) {
        const topX = cx + (rnd(i, 7) - 0.5) * W * 0.62;
        const pts: number[][] = [[topX, -6 * u]];
        const segs = 6;
        for (let s = 1; s <= segs; s++) {
          const yy = H * 0.6 * (s / segs);
          const xx = topX + (cx - topX) * (s / segs) + (rnd(i * 10 + s, 8) - 0.5) * 40 * u;
          pts.push([xx, yy]);
        }
        const flick = 0.45 + 0.55 * Math.abs(Math.sin(p * 34 + i * 2.1));
        this.p.setAlpha(Math.min(0.9, flick * keep));
        this.p.polyStroke(pts, col, Math.max(1, 6 * u * a), false);
        this.p.setAlpha(Math.min(1, flick * keep));
        this.p.polyStroke(pts, '#FFFFFF', Math.max(1, 2 * u * a), false);
      }
      // 横向扫光带
      const sy = H * (0.1 + p * 0.9);
      this.p.setAlpha(0.32 * keep);
      this.p.vGrad(0, sy - 7 * u, W, 14 * u, ['rgba(255,255,255,0)', '#FFFFFF', 'rgba(255,255,255,0)'], 6);
    } else if (fx.id === 'frost') {
      // 六芒雪花 + 枝杈 + 外圈冰晶
      const snowR = (0.16 + p * 0.42) * W;
      this.p.setAlpha(0.8 * keep);
      for (let i = 0; i < 6; i++) {
        const ang = rot * 0.55 + (i / 6) * Math.PI * 2;
        const ex = cx + Math.cos(ang) * snowR;
        const ey = cy + Math.sin(ang) * snowR * 0.62;
        this.p.polyStroke([[cx, cy], [ex, ey]], '#E1F5FE', Math.max(1, 2.8 * u * a), false);
        for (const f of [0.5, 0.76]) {
          const bx = cx + Math.cos(ang) * snowR * f;
          const by = cy + Math.sin(ang) * snowR * 0.62 * f;
          for (const sgn of [-1, 1]) {
            const ba = ang + sgn * 0.62;
            this.p.polyStroke([
              [bx, by],
              [bx + Math.cos(ba) * snowR * 0.17, by + Math.sin(ba) * snowR * 0.17 * 0.62],
            ], '#B3E5FC', Math.max(1, 1.8 * u * a), false);
          }
        }
      }
      this.p.setAlpha(0.55 * keep);
      for (let i = 0; i < 14; i++) {
        const ang = rnd(i, 9) * Math.PI * 2;
        const r0 = (0.24 + p * 0.4) * W;
        const x = cx + Math.cos(ang) * r0;
        const y = cy + Math.sin(ang) * r0 * 0.62;
        this.p.star(x, y, (3 + 4 * rnd(i, 10)) * u, '#FFFFFF', rnd(i, 11) * 3);
      }
    }

    // ---- 7. 扩散冲击环 ----
    if (p < 0.88) {
      const rr = (0.1 + p * 0.92) * W * 0.62;
      this.p.setAlpha((1 - p / 0.88) * 0.9);
      this.p.circleStroke(cx, cy, rr, col, Math.max(1, 7 * u * a));
      this.p.circleStroke(cx, cy, rr * 0.86, '#FFFFFF', Math.max(1, 3 * u * a), 0.7);
    }

    // ---- 8. 起手白闪 ----
    if (flash > 0.01) {
      this.p.setAlpha(flash * 0.8);
      this.p.rect(0, 0, W, H, '#FFFFFF');
    }

    // ---- 9. 技能名（多层描边 + 英文副标题）----
    const en = fx.id === 'meteor' ? 'METEOR RAIN' : fx.id === 'thunder' ? 'THUNDER STORM' : 'FROST NOVA';
    const pop = Math.min(1, p / 0.22);
    const size = (24 + 9 * (1 - pop)) * u;
    const ny = cy + 56 * u - 10 * u * pop;
    this.p.setAlpha(Math.min(1, a * 2.4));
    this.p.text(fx.name, cx, ny + 2.5 * u, {
      size, color: 'rgba(0,0,0,0.55)', align: 'center', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 10,
    });
    this.p.text(fx.name, cx, ny, {
      size, color: '#FFFFFF', align: 'center', stroke: col, strokeWidth: 8,
    });
    // 分隔线
    const lw2 = 74 * u * pop;
    this.p.setAlpha(Math.min(1, a * 2) * 0.85);
    this.p.rect(cx - lw2, ny + 17 * u, lw2 * 2, Math.max(1, 1.4 * u), col);
    this.p.text(en, cx, ny + 26 * u, {
      size: 8.5 * u, color: col, align: 'center', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 3,
    });
    this.p.setAlpha(1);
  }

  /** 换图过场：全屏压暗 + 地图名 + 进度条 */
  private drawMapSwitching(s: { icon: string; name: string; progress: number }): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;
    this.p.rect(0, 0, W, H, 'rgba(8, 12, 18, 0.72)');
    const cy = H / 2;
    this.p.text(`${s.icon} 正在前往「${s.name}」`, W / 2, cy + 14 * u, {
      size: 18 * u, color: '#E8F5E9', align: 'center', stroke: 'rgba(0,0,0,0.5)', strokeWidth: 4,
    });
    const bw = 220 * u;
    const bh = 8 * u;
    const bx = (W - bw) / 2;
    const by = cy - 18 * u;
    this.p.fillRR(bx, by, bw, bh, 4 * u, 'rgba(255,255,255,0.16)');
    const pw = Math.max(2 * u, bw * Math.min(1, s.progress));
    this.p.fillRR(bx, by, pw, bh, 4 * u, '#7BE38A');
    this.p.text('正在生成地形…', W / 2, by - 16 * u, {
      size: 11 * u, color: 'rgba(255,255,255,0.65)', align: 'center',
    });
  }

  /** 游戏内地图入口按钮（血条下方） */
  private drawMapButton(d: HudData): void {
    const u = this.u;
    const b = this.mapBtn;
    this.p.fillRR(b.x, b.y + 2 * u, b.w, b.h, 8 * u, 'rgba(0, 0, 0, 0.3)');
    this.p.fillRR(b.x, b.y, b.w, b.h, 8 * u, 'rgba(27, 60, 32, 0.85)');
    this.p.strokeRR(b.x, b.y, b.w, b.h, 8 * u, 'rgba(123, 227, 138, 0.5)', 1);
    this.p.text(`🗺 ${d.mapName}`, b.x + b.w / 2, b.y + b.h / 2, {
      size: 11 * u, color: '#C8E6C9', align: 'center', stroke: 'rgba(0,0,0,0.35)', strokeWidth: 3,
    });
  }

  // 横屏：血条加宽（屏宽富裕）、高度拉平，顶部横条紧凑
  private drawHearts(d: HudData): void {
    const u = this.u;
    const x0 = 12 * u;
    const y0 = 12 * u + this.safeTop;
    const bw = 200 * u;
    const bh = 14 * u;
    this.p.fillRR(x0 - 6 * u, y0 - 6 * u, bw + 26 * u, bh + 12 * u, 6 * u, 'rgba(8, 14, 22, 0.42)');
    this.heart(x0 + 3 * u, y0 + bh / 2 - 1 * u, 8 * u, RED);
    const bx = x0 + 13 * u;
    this.p.fillRR(bx, y0, bw, bh, bh / 2, '#4a1a1a');
    const ratio = Math.max(0, Math.min(1, d.hp / Math.max(1, d.maxHp)));
    if (ratio > 0) {
      this.p.fillRR(bx, y0, Math.max(bh, bw * ratio), bh, bh / 2, ratio > 0.3 ? RED : '#FF9100');
    }
    this.p.text(`${Math.ceil(d.hp)}/${d.maxHp}`, bx + bw / 2, y0 + bh / 2, {
      size: 9 * u, color: '#FFFFFF', align: 'center', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 2,
    });
    // 护盾条（血条正下方）
    if (d.shield > 0) {
      const sy = y0 + bh + 4 * u;
      this.p.fillRR(bx, sy, bw, 5 * u, 2.5 * u, 'rgba(15, 40, 60, 0.6)');
      this.p.fillRR(bx, sy, Math.max(4 * u, bw * Math.min(1, d.shield / 30)), 5 * u, 2.5 * u, '#4FC3F7');
      this.p.text(`护盾 ${Math.ceil(d.shield)}`, bx + bw + 4 * u, sy + 2.5 * u, {
        size: 7.5 * u, color: '#4FC3F7', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 2,
      });
    }
  }

  /** 左下消耗品栏：4 格 + 数量 + 快捷键提示 */
  private drawConsumables(d: HudData): void {
    const u = this.u;
    const n = this.consSlots.length;
    if (n === 0) return;
    const keyHints = ['Q', 'T', 'Z', 'X'];
    const first = this.consSlots[0];
    const last = this.consSlots[n - 1];
    const pad = 3 * u;
    this.p.fillRR(first.x - pad, first.y - pad, last.x + last.w - first.x + pad * 2, first.h + pad * 2, 5 * u, 'rgba(8, 14, 22, 0.52)');
    for (let i = 0; i < n; i++) {
      const r = this.consSlots[i];
      const item = d.consumables[i];
      this.p.fillRR(r.x, r.y, r.w, r.h, 4 * u, item ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)');
      this.p.strokeRR(r.x, r.y, r.w, r.h, 4 * u, item ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)', 1);
      if (item) {
        this.consumableIcon(item.id, r.x + r.w * 0.52, r.y + r.h * 0.56, r.w * 0.5, item.color);
        if (item.count > 1) {
          this.p.text(`x${item.count}`, r.x + r.w - 2 * u, r.y + r.h - 2 * u, {
            size: 7.5 * u, color: '#FFFFFF', align: 'right', stroke: 'rgba(0,0,0,0.75)', strokeWidth: 2,
          });
        }
      }
      this.p.text(keyHints[i] || '', r.x + 3 * u, r.y + 2 * u, {
        size: 7 * u, color: 'rgba(255,255,255,0.48)',
      });
    }
    // 左下角状态：能量 / 持雷
    let tip = '';
    let tipColor = '#FFFFFF';
    if (d.bombArmed) {
      tip = '炸弹已就绪 · 攻击键掷出';
      tipColor = '#FF8A65';
    } else if (d.energyT > 0) {
      tip = `能量涌动 ${Math.ceil(d.energyT)}s`;
      tipColor = '#FFD54F';
    }
    if (tip) {
      this.p.text(tip, first.x, first.y - 9 * u, {
        size: 8 * u, color: tipColor, stroke: 'rgba(0,0,0,0.6)', strokeWidth: 2,
      });
    }
  }

  private consumableIcon(id: string, cx: number, cy: number, r: number, color: string): void {
    if (id === 'p_heal') {
      this.p.fillRR(cx - r * 0.5, cy - r * 0.62, r, r * 1.34, r * 0.28, color);
      this.p.rect(cx - r * 0.11, cy - r * 0.3, r * 0.22, r * 0.72, '#FFFFFF');
      this.p.rect(cx - r * 0.33, cy - r * 0.06, r * 0.66, r * 0.24, '#FFFFFF');
    } else if (id === 'p_energy') {
      this.p.poly([
        [cx + r * 0.06, cy - r * 0.82], [cx - r * 0.46, cy + r * 0.06],
        [cx - r * 0.06, cy + r * 0.06], [cx - r * 0.12, cy + r * 0.82],
        [cx + r * 0.5, cy - r * 0.12], [cx + r * 0.1, cy - r * 0.12],
      ], color);
    } else if (id === 'p_bomb') {
      this.p.circle(cx, cy + r * 0.16, r * 0.56, color);
      this.p.rect(cx - r * 0.06, cy - r * 0.68, r * 0.12, r * 0.36, '#8D6E63');
      this.p.circle(cx + r * 0.16, cy - r * 0.7, r * 0.1, '#FFB300');
    } else {
      this.p.poly([
        [cx, cy - r * 0.82], [cx + r * 0.46, cy], [cx, cy + r * 0.82], [cx - r * 0.46, cy],
      ], color);
      this.p.poly([
        [cx, cy - r * 0.46], [cx + r * 0.22, cy], [cx, cy + r * 0.46], [cx - r * 0.22, cy],
      ], 'rgba(255,255,255,0.78)');
    }
  }

  // 横屏：波次面板加宽（屏宽富裕），但仍避开右侧按钮
  // 寻宝模式显示模式标签 + 挑战入口；斗兽场显示波次/倒计时/进场读秒
  private drawWaveBar(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;
    const cx = W / 2;
    const st = this.safeTop;

    if (d.mode === 'treasure') {
      // 寻宝模式：顶部标签 + 「⚔ 挑战斗兽场」按钮
      this.p.fillRR(cx - 100 * u, 2 * u + st, 200 * u, 34 * u, 8 * u, 'rgba(8, 14, 22, 0.5)');
      this.p.text('寻宝模式', cx, 15 * u + st, {
        size: 13 * u, color: '#7BE38A', align: 'center', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 3,
      });
      this.p.text('寻找宝箱 · 挑战世界BOSS', cx, 28 * u + st, {
        size: 8.5 * u, color: 'rgba(255,255,255,0.72)', align: 'center',
      });
      const b = this.challengeBtn;
      this.p.fillRR(b.x, b.y + 2 * u, b.w, b.h, 13 * u, 'rgba(0, 0, 0, 0.35)');
      this.glass(b.x, b.y, b.w, b.h, 13 * u);
      this.p.strokeRR(b.x, b.y, b.w, b.h, 13 * u, 'rgba(244, 107, 149, 0.85)', 1.5);
      this.p.text('⚔ 挑战斗兽场', b.x + b.w / 2, b.y + b.h / 2, {
        size: 12 * u, color: '#F8BBD0', align: 'center', stroke: 'rgba(0,0,0,0.3)', strokeWidth: 3,
      });
      return;
    }

    if (d.arenaCd > 0) {
      // 斗兽场进场 3s 读秒
      this.p.fillRR(cx - 100 * u, 2 * u + st, 200 * u, 34 * u, 8 * u, 'rgba(8, 14, 22, 0.5)');
      this.p.text('斗兽场 · 战斗即将开始', cx, 20 * u + st, {
        size: 12 * u, color: '#FFD54F', align: 'center', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 3,
      });
      const n = Math.ceil(d.arenaCd);
      this.p.glow(cx, H * 0.38, 60 * u, '#FFD54F', 0.3);
      this.p.text(`${n}`, cx, H * 0.38, {
        size: 52 * u, color: '#FFD54F', align: 'center', stroke: 'rgba(80,44,0,0.8)', strokeWidth: 8,
      });
      return;
    }

    // 面板宽 200u，右缘 cx+100；右侧 viewBtn 左缘 W-124，720/2+100=460, 720-124=596 → 安全
    this.p.fillRR(cx - 100 * u, 2 * u + st, 200 * u, 34 * u, 8 * u, 'rgba(8, 14, 22, 0.5)');
    this.p.text(`第 ${d.wave} 波`, cx - 24 * u, 14 * u + st, {
      size: 14 * u, color: '#FFD54F', align: 'center', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 3,
    });
    this.p.text(`剩 ${d.mobsLeft}`, cx + 40 * u, 14 * u + st, {
      size: 11 * u, color: 'rgba(255,255,255,0.85)', align: 'center',
    });
    // 倒计时条
    const bw = 172 * u;
    const bh = 6 * u;
    const bx = cx - bw / 2;
    const by = 26 * u + st;
    const t = d.timeMax > 0 ? Math.max(0, Math.min(1, d.timeLeft / d.timeMax)) : 0;
    this.p.fillRR(bx, by, bw, bh, bh / 2, 'rgba(255,255,255,0.15)');
    const color = t > 0.4 ? '#7BE38A' : t > 0.15 ? '#FFD54F' : RED;
    this.p.fillRR(bx, by, Math.max(bh, bw * t), bh, bh / 2, color);
    // 时间画在倒计时条正中央
    const sec = Math.max(0, Math.ceil(d.timeLeft));
    this.p.text(`${Math.floor(sec / 60)}:${('0' + (sec % 60)).slice(-2)}`, cx, by + bh / 2, {
      size: 8.5 * u, color: '#FFFFFF', align: 'center', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 2,
    });
  }

  private drawHotbar(d: HudData): void {
    const u = this.u;
    const first = this.slots[0];
    const last = this.slots[this.slots.length - 1];
    const px = first.x - 6 * u;
    const py = first.y - 6 * u;
    const pw = last.x + last.w - first.x + 12 * u;
    const ph = first.h + 12 * u;
    // 玻璃底 + 顶部高光
    this.p.fillRR(px, py, pw, ph, 9 * u, 'rgba(8, 14, 22, 0.62)');
    this.p.fillRR(px, py, pw, ph * 0.45, 9 * u, 'rgba(255, 255, 255, 0.06)');
    this.p.strokeRR(px, py, pw, ph, 9 * u, 'rgba(255, 255, 255, 0.18)', 1);

    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const selected = i === d.selected;
      const item = i === 0 ? null : d.backpack[i - 1] || null;
      this.p.fillRR(s.x, s.y, s.w, s.h, 5 * u, selected ? 'rgba(255, 255, 255, 0.20)' : 'rgba(255, 255, 255, 0.07)');
      if (selected) {
        this.p.setAlpha(0.6);
        this.p.fillRR(s.x - 2 * u, s.y - 2 * u, s.w + 4 * u, s.h + 4 * u, 7 * u, 'rgba(126, 227, 196, 0.32)');
        this.p.setAlpha(1);
      }
      this.p.strokeRR(s.x, s.y, s.w, s.h, 5 * u, selected ? '#ffffff' : 'rgba(255, 255, 255, 0.18)', selected ? 2 * u : 1);

      if (i === 0) {
        // 第 1 格：石块
        const color = BLOCK_COLORS[HOTBAR_BLOCKS[2]] || '#888888';
        this.miniCube(s.x + s.w / 2, s.y + s.h * 0.52, s.w * 0.62, color);
      } else if (item) {
        // 武器格：品质色描边 + 图标 + 强化角标
        const tc = TIER_COLORS[item.def.tier] || '#FFFFFF';
        this.p.strokeRR(s.x + 1 * u, s.y + 1 * u, s.w - 2 * u, s.h - 2 * u, 4 * u, tc, 1.4 * u, 0.85);
        this.drawWeaponIcon(s.x + s.w / 2, s.y + s.h * 0.52, s.w * 0.7, item.def.color, item.def.name);
        if (item.bonus > 0) {
          this.p.text(`+${item.bonus}`, s.x + s.w - 2.5 * u, s.y + s.h - 6.5 * u, {
            size: 7.5 * u, color: '#FFD54F', align: 'right',
          });
        }
      } else {
        // 空格：虚线框 + 淡「+」
        const m = 4 * u;
        const seg = s.w * 0.22;
        const col = 'rgba(255, 255, 255, 0.20)';
        this.p.rectStroke(s.x + m, s.y + m, s.w - 2 * m, s.h - 2 * m, col, 1);
        this.p.setAlpha(0.45);
        this.p.rect(s.x + s.w / 2 - seg / 2, s.y + s.h / 2 - 0.8 * u, seg, 1.6 * u, col);
        this.p.rect(s.x + s.w / 2 - 0.8 * u, s.y + s.h / 2 - seg / 2, 1.6 * u, seg, col);
        this.p.setAlpha(1);
      }

      // 选中白闪（切枪反馈）
      if (selected && d.slotFlash > 0.01) {
        this.p.fillRR(s.x, s.y, s.w, s.h, 5 * u, `rgba(255,255,255,${(d.slotFlash * 0.55).toFixed(3)})`);
      }
      this.p.text(`${i + 1}`, s.x + 3 * u, s.y + 7 * u, { size: 7 * u, color: 'rgba(255,255,255,0.65)' });
    }
  }

  /** 绘制武器小图标（简化的剑形） */
  private drawWeaponIcon(cx: number, cy: number, size: number, color: string, name: string): void {
    const dark = shadeHex(color, 0.55);
    const light = shadeHex(color, 1.2);
    // 剑柄
    const hiltW = size * 0.5;
    const hiltH = size * 0.12;
    this.p.rect(cx - hiltW / 2, cy + size * 0.18, hiltW, hiltH, dark);
    // 剑柄末端
    this.p.rect(cx - size * 0.08, cy + size * 0.18 + hiltH, size * 0.16, size * 0.1, '#8D6E63');
    // 剑刃（三角形）
    const bladeTop = cy - size * 0.42;
    const bladeBot = cy + size * 0.18;
    const bw = size * 0.22;
    this.p.quadFill([
      [cx - bw, bladeBot], [cx + bw, bladeBot], [cx, bladeTop],
    ], color);
    // 剑刃高光
    this.p.quadFill([
      [cx - bw * 0.3, bladeBot], [cx, bladeBot], [cx, bladeTop],
    ], light);
    // 剑刃描边
    this.p.polyStroke([[cx - bw, bladeBot], [cx, bladeTop], [cx + bw, bladeBot]], dark, 1);
    // 长矛/长柄武器额外画长杆
    if (name.includes('矛') || name.includes('镰') || name.includes('锤')) {
      this.p.rect(cx - size * 0.04, cy - size * 0.05, size * 0.08, size * 0.45, '#6D4C41');
    }
  }

  private drawJoystick(d: HudData): void {
    const u = this.u;
    const c = this.joyCenter;
    const r = this.joyR;
    this.p.setAlpha(d.joyActive ? 0.92 : 0.62);
    this.p.circle(c.x, c.y, r, 'rgba(8, 14, 22, 0.42)');
    this.p.circleStroke(c.x, c.y, r, 'rgba(255, 255, 255, 0.30)', 2 * u);
    this.p.circleStroke(c.x, c.y, r - 5 * u, 'rgba(255, 255, 255, 0.10)', 1);
    this.p.setAlpha(1);

    const tx = c.x + d.joyX * r * 0.55;
    const ty = c.y + d.joyY * r * 0.55;
    this.p.circle(tx, ty, r * 0.34, 'rgba(255, 255, 255, 0.26)');
    this.p.circleStroke(tx, ty, r * 0.34, 'rgba(255, 255, 255, 0.55)', 1.5 * u);
  }

  private drawButtons(): void {
    this.roundButton(this.btnAttack.x, this.btnAttack.y, this.btnAttack.r, RED, '攻击');
    this.roundButton(this.btnJump.x, this.btnJump.y, this.btnJump.r, GREEN, '跳跃');
    this.roundButton(this.btnPlace.x, this.btnPlace.y, this.btnPlace.r, '#42A5F5', '放置');
    // 斗兽场内只能放不能拆，「破坏」灰化
    this.roundButton(this.btnBreak.x, this.btnBreak.y, this.btnBreak.r,
      this.mode === 'arena' ? '#616161' : ORANGE, '破坏');
  }

  private drawPauseButton(): void {
    const u = this.u;
    const b = this.pauseBtn;
    this.p.fillRR(b.x, b.y, b.w, b.h, 8 * u, 'rgba(8, 14, 22, 0.58)');
    this.p.strokeRR(b.x, b.y, b.w, b.h, 8 * u, 'rgba(255, 255, 255, 0.18)', 1);
    this.p.rect(b.x + b.w * 0.33, b.y + b.h * 0.28, 3 * u, b.h * 0.44, WHITE);
    this.p.rect(b.x + b.w * 0.56, b.y + b.h * 0.28, 3 * u, b.h * 0.44, WHITE);
  }

  private drawCharButton(): void {
    const u = this.u;
    const b = this.charBtn;
    this.p.fillRR(b.x, b.y, b.w, b.h, 8 * u, 'rgba(8, 14, 22, 0.58)');
    this.p.strokeRR(b.x, b.y, b.w, b.h, 8 * u, 'rgba(255, 255, 255, 0.18)', 1);
    const cx = b.x + b.w / 2;
    this.p.circle(cx, b.y + b.h * 0.34, b.w * 0.16, WHITE);
    this.p.fillRR(cx - b.w * 0.22, b.y + b.h * 0.52, b.w * 0.44, b.h * 0.3, 4 * u, WHITE);
  }

  /** 背包按钮：袋子图标（袋身 + 提手） */
  private drawBagButton(): void {
    const u = this.u;
    const b = this.bagBtn;
    this.p.fillRR(b.x, b.y, b.w, b.h, 8 * u, 'rgba(8, 14, 22, 0.58)');
    this.p.strokeRR(b.x, b.y, b.w, b.h, 8 * u, 'rgba(255, 255, 255, 0.18)', 1);
    const cx = b.x + b.w / 2;
    // 袋身
    this.p.fillRR(cx - b.w * 0.26, b.y + b.h * 0.42, b.w * 0.52, b.h * 0.42, 4 * u, '#FFB74D');
    // 袋口
    this.p.fillRR(cx - b.w * 0.22, b.y + b.h * 0.34, b.w * 0.44, b.h * 0.12, 2 * u, '#FFA726');
    // 提手（弧线）
    this.p.ellStroke(cx, b.y + b.h * 0.34, b.w * 0.18, b.h * 0.16, 0, WHITE, 2 * u);
  }

  /** 视角切换按钮（眼睛图标）：第一人称/第三人称 */
  private drawViewButton(d: HudData): void {
    const u = this.u;
    const b = this.viewBtn;
    const third = d.viewMode === 1;
    this.p.fillRR(b.x, b.y, b.w, b.h, 8 * u, third ? 'rgba(126, 227, 196, 0.35)' : 'rgba(8, 14, 22, 0.58)');
    this.p.strokeRR(b.x, b.y, b.w, b.h, 8 * u, third ? '#7EE3C4' : 'rgba(255, 255, 255, 0.18)', 1.5 * u);
    // 眼睛形状
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const ew = b.w * 0.42;
    const eh = b.h * 0.26;
    this.p.ellStroke(cx, cy, ew, eh, 0, WHITE, 1.8 * u);
    this.p.circle(cx, cy, b.w * 0.13, WHITE);
    this.p.circle(cx, cy, b.w * 0.06, '#0b1220');
  }

  private drawMusicButton(): void {
    const u = this.u;
    const b = this.musicBtn;
    const on = this.musicOn;
    this.p.fillRR(b.x, b.y, b.w, b.h, 8 * u, on ? 'rgba(143, 221, 106, 0.22)' : 'rgba(8, 14, 22, 0.58)');
    this.p.strokeRR(b.x, b.y, b.w, b.h, 8 * u, on ? '#8FDD6A' : 'rgba(255, 255, 255, 0.18)', 1.5 * u);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    this.p.text('♪', cx, cy + 1 * u, { size: 17 * u, color: on ? '#8FDD6A' : '#6A7488', align: 'center' });
    if (!on) {
      // 关闭状态：红色斜线覆盖
      const dx = b.w * 0.3;
      this.p.polyStroke([[cx - dx, cy + dx], [cx + dx, cy - dx]], '#EF5350', 2.2 * u, false);
    }
  }

  /** 右上角分享按钮：点击展开「转发好友 / 朋友圈 / 海报」三项 */
  private drawShareButton(d: HudData): void {
    if (d.state !== 'playing') {
      this.shareOpen = false;
      return;
    }
    if (d.overlay !== 'none') this.shareOpen = false;

    const u = this.u;
    const b = this.shareBtn;
    const p = this.p;
    const active = this.shareOpen;
    const accent = active ? '#7FE3FF' : '#9FB3C8';

    p.fillRR(b.x, b.y, b.w, b.h, 8 * u, active ? 'rgba(60, 170, 220, 0.24)' : 'rgba(8, 14, 22, 0.58)');
    p.strokeRR(b.x, b.y, b.w, b.h, 8 * u, active ? '#7FE3FF' : 'rgba(255, 255, 255, 0.18)', 1.5 * u);

    // 经典「分享」图标：三个节点 + 两条连线
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const r1 = 2.6 * u;
    const rx = cx + 5.4 * u;
    const lx = cx - 5.4 * u;
    const ty = cy - 4.6 * u;
    const by = cy + 4.6 * u;
    p.polyStroke([[lx + r1, cy], [rx - r1, ty + r1 * 0.6]], accent, 1.4 * u, false);
    p.polyStroke([[lx + r1, cy], [rx - r1, by - r1 * 0.6]], accent, 1.4 * u, false);
    p.circle(lx, cy, r1, accent);
    p.circle(rx, ty, r1, accent);
    p.circle(rx, by, r1, accent);

    if (!this.shareOpen) return;

    // 展开面板
    const first = this.shareItems[0];
    const last = this.shareItems[2];
    const pad = 6 * u;
    const px = first.x - pad;
    const py = first.y - pad;
    const pw = first.w + pad * 2;
    const ph = last.y + last.h - first.y + pad * 2;
    p.fillRR(px, py, pw, ph, 10 * u, 'rgba(8, 12, 22, 0.94)');
    p.strokeRR(px, py, pw, ph, 10 * u, 'rgba(127, 227, 255, 0.42)', 1.2 * u);

    const labels = ['转发给好友', '分享朋友圈', '生成分享海报'];
    const icons = ['↗', '◎', '▣'];
    for (let i = 0; i < this.shareItems.length; i++) {
      const it = this.shareItems[i];
      p.fillRR(it.x + 3 * u, it.y + 2 * u, it.w - 6 * u, it.h - 4 * u, 7 * u, 'rgba(24, 38, 58, 0.9)');
      p.strokeRR(it.x + 3 * u, it.y + 2 * u, it.w - 6 * u, it.h - 4 * u, 7 * u, 'rgba(127, 227, 255, 0.22)', 1 * u);
      p.text(icons[i], it.x + 16 * u, it.y + it.h / 2, { size: 14 * u, color: '#7FE3FF', align: 'center' });
      p.text(labels[i], it.x + 30 * u, it.y + it.h / 2, { size: 12.5 * u, color: '#DCE9F5', align: 'left' });
    }
  }

  /** 左上角金币面板：金币图标 + 数量，拾取时弹跳并迸发金色粒子 */
  private drawCoinPanel(d: HudData): void {
    const u = this.u;
    const r = this.coinPanel;
    const p = this.p;
    const dt = this.lastDrawT < 0 ? 0.016 : Math.min(0.05, Math.max(0, d.time - this.lastDrawT));
    this.lastDrawT = d.time;

    if (this.coinShown < 0) this.coinShown = d.coins;
    else if (d.coins > this.coinShown) {
      this.coinPunch = 1;
      this.spawnCoinBurst(d.coins - this.coinShown);
      this.coinShown = d.coins;
    } else if (d.coins !== this.coinShown) this.coinShown = d.coins;

    this.coinPunch = Math.max(0, this.coinPunch - dt * 3.4);
    const k = this.coinPunch;
    const sc = 1 + 0.26 * k;
    const cy = r.y + r.h / 2;

    if (k > 0.01) p.glow(r.x + 14 * u, cy, 26 * u * (0.8 + k * 0.6), '#FFD54F', 0.22 * k);
    p.fillRR(r.x, r.y, r.w, r.h, r.h / 2, 'rgba(10, 16, 26, 0.66)');
    p.strokeRR(r.x, r.y, r.w, r.h, r.h / 2, k > 0.01 ? 'rgba(255, 213, 79, 0.95)' : 'rgba(255, 213, 79, 0.5)', 1.1 * u);
    p.rect(r.x + r.w * 0.5, r.y + 3 * u, 1 * u, r.h - 6 * u, 'rgba(255, 213, 79, 0.16)');

    this.drawCoinIcon(r.x + 13 * u, cy, 7.4 * u * sc);
    p.text(fmtCoins(d.coins), r.x + 25 * u, cy, {
      size: 12.5 * u * sc, color: '#FFE082', align: 'left',
      stroke: '#3E2A00', strokeWidth: 3 * u,
    });

    // 金色粒子
    for (let i = this.coinSparks.length - 1; i >= 0; i--) {
      const s = this.coinSparks[i];
      s.t -= dt;
      if (s.t <= 0) { this.coinSparks.splice(i, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 120 * u * dt;
      const a = Math.max(0, s.t / s.ttl);
      p.circle(s.x, s.y, 2.2 * u * a + 0.4 * u, a > 0.5 ? '#FFF59D' : '#FFD54F', a);
    }
    // +N 飘字
    for (let i = this.coinPops.length - 1; i >= 0; i--) {
      const c = this.coinPops[i];
      c.t -= dt;
      if (c.t <= 0) { this.coinPops.splice(i, 1); continue; }
      const a = Math.min(1, c.t / 0.25);
      p.text(c.text, r.x + r.w + 8 * u, cy - (1 - c.t / c.ttl) * 16 * u, {
        size: 12 * u, color: '#FFE082', align: 'left', alpha: a,
        stroke: '#3E2A00', strokeWidth: 3 * u,
      });
    }
  }

  /** 金币图标：外圈金环 + 中心方孔 + 高光 */
  private drawCoinIcon(cx: number, cy: number, rr: number): void {
    const p = this.p;
    const u = this.u;
    p.circle(cx, cy, rr, '#FFC107');
    p.circleStroke(cx, cy, rr, '#FFE082', 1.3 * u);
    p.circle(cx, cy, rr * 0.62, '#FFD54F');
    p.rect(cx - rr * 0.26, cy - rr * 0.26, rr * 0.52, rr * 0.52, '#6B4700');
    p.circleStroke(cx, cy, rr * 0.78, 'rgba(255, 255, 255, 0.35)', 1 * u);
  }

  /** 拾取金币时：面板迸发金色粒子 + 「+N」飘字 */
  private spawnCoinBurst(gain: number): void {
    const u = this.u;
    const r = this.coinPanel;
    const cx = r.x + 13 * u;
    const cy = r.y + r.h / 2;
    const n = Math.min(16, 8 + gain);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (40 + Math.random() * 90) * u;
      const ttl = 0.45 + Math.random() * 0.25;
      this.coinSparks.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40 * u,
        t: ttl, ttl,
      });
    }
    this.coinPops.push({ text: `+${gain}`, t: 0.8, ttl: 0.8 });
  }

  /** 拾取的金币从屏幕位置沿抛物线飞向金币面板 */
  private drawCoinFlies(d: HudData): void {
    const u = this.u;
    const r = this.coinPanel;
    const p = this.p;
    const tx = r.x + 13 * u;
    const ty = r.y + r.h / 2;
    for (const f of d.coinFlies) {
      const prog = Math.min(1, Math.max(0, f.p));
      if (prog >= 0.995) continue;
      // 拖尾
      for (let k = 3; k >= 1; k--) {
        const pk = Math.max(0, prog - k * 0.055);
        const e = pk * pk * (3 - 2 * pk);
        const x = f.x0 + (tx - f.x0) * e;
        const y = f.y0 + (ty - f.y0) * e - Math.sin(Math.PI * pk) * 78 * u;
        p.circle(x, y, (4.6 - k) * u, '#FFD54F', 0.26 - k * 0.05);
      }
      const e = prog * prog * (3 - 2 * prog);
      const x = f.x0 + (tx - f.x0) * e;
      const y = f.y0 + (ty - f.y0) * e - Math.sin(Math.PI * prog) * 78 * u;
      const rr = (5 - prog * 1.8) * u;
      const a = 1 - prog * 0.35;
      p.glow(x, y, rr * 3, '#FFD54F', 0.2 * a);
      p.circle(x, y, rr, '#FFD54F', a);
      p.circle(x, y, rr * 0.62, '#FFF59D', a);
      p.rect(x - rr * 0.22, y - rr * 0.22, rr * 0.44, rr * 0.44, 'rgba(122, 75, 0, 0.9)');
    }
  }

  /** 右侧中部「绝世武器」：与大招同风格的紫金水晶剑、旋转符文与环绕星光 */
  private drawLegendButton(d: HudData): void {
    const u = this.u;
    const b = this.legendBtn;
    const ready = d.legendReady;
    if (d.state !== 'playing' || d.overlay !== 'none') return;
    const p = this.p;
    const pulse = 0.5 + 0.5 * Math.sin(d.time * (Math.PI * 2 / 1.6));
    const purple = ready ? '#B388FF' : '#697080';
    const gold = ready ? '#FFD54F' : '#77736A';

    p.glow(b.x, b.y, b.r * 2.15, '#7C4DFF', ready ? 0.20 + pulse * 0.15 : 0.08);
    p.glow(b.x, b.y, b.r * 1.75, '#FFD54F', ready ? 0.14 + pulse * 0.12 : 0.04);
    p.fillRR(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, b.r, 'rgba(8, 10, 25, 0.82)');
    p.circle(b.x, b.y, b.r * 0.88, 'rgba(91, 45, 145, 0.24)');
    p.circleStroke(b.x, b.y, b.r, gold, 1.7 * u);
    p.circleStroke(b.x, b.y, b.r - 3 * u, 'rgba(209, 179, 255, 0.34)', 0.8 * u);

    // 双层旋转外弧与四枚星芒，让静态轮廓也有技能图标般的动态华丽感
    const rot = d.time * 0.85;
    p.ellStroke(b.x, b.y, b.r + 3.5 * u, b.r + 3.5 * u, 0, purple, 1.5 * u, ready ? 0.9 : 0.35, rot, rot + 1.65, false);
    p.ellStroke(b.x, b.y, b.r + 3.5 * u, b.r + 3.5 * u, 0, gold, 1.1 * u, ready ? 0.8 : 0.3, rot + Math.PI, rot + Math.PI + 1.35, false);
    for (let i = 0; i < 4; i++) {
      const a = -d.time * 1.15 + i * Math.PI * 0.5;
      const sx = b.x + Math.cos(a) * b.r * 1.12;
      const sy = b.y + Math.sin(a) * b.r * 1.12;
      const sr = (1.2 + (i % 2) * 0.45) * u;
      p.poly([[sx, sy - sr * 1.8], [sx + sr * 0.55, sy - sr * 0.45], [sx + sr * 1.8, sy],
        [sx + sr * 0.55, sy + sr * 0.45], [sx, sy + sr * 1.8], [sx - sr * 0.55, sy + sr * 0.45],
        [sx - sr * 1.8, sy], [sx - sr * 0.55, sy - sr * 0.45]], i % 2 ? gold : '#E9D5FF');
    }

    p.save();
    p.translate(b.x, b.y);
    p.rotate(-Math.PI / 4);
    const s = b.r * 0.92;
    p.glow(0, -s * 0.18, s * 0.95, purple, ready ? 0.32 : 0.12);
    // 水晶剑刃：深紫描边、紫罗兰刃面、淡紫内芯、白色高光
    p.poly([[-s * 0.18, s * 0.20], [-s * 0.18, -s * 0.60], [0, -s * 1.02],
      [s * 0.18, -s * 0.60], [s * 0.18, s * 0.20]], '#5E35B1');
    p.poly([[-s * 0.12, s * 0.14], [-s * 0.12, -s * 0.57], [0, -s * 0.88],
      [s * 0.12, -s * 0.57], [s * 0.12, s * 0.14]], purple);
    p.poly([[0, -s * 0.82], [0, s * 0.12], [s * 0.085, -s * 0.52]], '#D1C4E9');
    p.poly([[-s * 0.07, -s * 0.50], [0, -s * 0.76], [0, -s * 0.08], [-s * 0.07, s * 0.02]], '#F3E5F5');
    p.polyStroke([[0, -s * 0.72], [0, s * 0.10]], '#FFFFFF', Math.max(1, s * 0.035), false);
    // 金色展开护手 + 中央紫宝石
    p.poly([[-s * 0.48, s * 0.12], [-s * 0.20, s * 0.04], [0, s * 0.12],
      [s * 0.20, s * 0.04], [s * 0.48, s * 0.12], [s * 0.40, s * 0.28],
      [s * 0.14, s * 0.22], [0, s * 0.30], [-s * 0.14, s * 0.22], [-s * 0.40, s * 0.28]], '#C88A12');
    p.poly([[-s * 0.40, s * 0.12], [-s * 0.16, s * 0.10], [0, s * 0.17],
      [s * 0.16, s * 0.10], [s * 0.40, s * 0.12], [s * 0.34, s * 0.20],
      [s * 0.13, s * 0.16], [0, s * 0.24], [-s * 0.13, s * 0.16], [-s * 0.34, s * 0.20]], gold);
    p.poly([[0, s * 0.06], [s * 0.12, s * 0.16], [0, s * 0.28], [-s * 0.12, s * 0.16]], '#7E57C2');
    p.circle(0, s * 0.16, s * 0.045, '#FFFFFF');
    // 缠绕剑柄与星形剑首
    p.fillRR(-s * 0.075, s * 0.27, s * 0.15, s * 0.43, s * 0.04, '#34224F');
    for (let i = 0; i < 3; i++) p.rect(-s * 0.08, s * (0.34 + i * 0.11), s * 0.16, s * 0.035, gold);
    p.circle(0, s * 0.73, s * 0.13, '#C88A12');
    p.poly([[0, s * 0.58], [s * 0.07, s * 0.69], [s * 0.16, s * 0.73], [s * 0.07, s * 0.78],
      [0, s * 0.90], [-s * 0.07, s * 0.78], [-s * 0.16, s * 0.73], [-s * 0.07, s * 0.69]], gold);
    p.circle(0, s * 0.73, s * 0.055, '#F3E5F5');
    p.restore();

    if (ready) {
      p.circle(b.x + b.r * 0.72, b.y + b.r * 0.72, 3.4 * u, '#F44336');
      p.circleStroke(b.x + b.r * 0.72, b.y + b.r * 0.72, 3.4 * u, 'rgba(255,255,255,0.85)', 1);
    }
  }

  /** 通关自由时间：快捷栏上方的「下一关」按钮 + 倒计时 */
  private drawNextWaveBtn(d: HudData): void {
    if (d.freeT <= 0 || d.state !== 'playing' || d.overlay !== 'none') return;
    const u = this.u;
    const b = this.nextWaveBtn;
    const t = Math.max(0, Math.ceil(d.freeT));
    const mm = Math.floor(t / 60);
    const ss = ('0' + (t % 60)).slice(-2);
    this.p.fillRR(b.x, b.y + 2 * u, b.w, b.h, 14 * u, 'rgba(0, 0, 0, 0.35)');
    this.glass(b.x, b.y, b.w, b.h, 14 * u);
    this.p.strokeRR(b.x, b.y, b.w, b.h, 14 * u, 'rgba(255, 213, 79, 0.8)', 1.5);
    this.p.text(`${d.mode === 'arena' ? '下一波' : '下一关'} ▶ · ${mm}:${ss}`, b.x + b.w / 2, b.y + b.h / 2, {
      size: 13 * u, color: '#FFD54F', align: 'center', stroke: 'rgba(0,0,0,0.3)', strokeWidth: 3,
    });
    // 斗兽场自由时间可离开返回寻宝模式
    if (d.mode === 'arena') {
      const lb = this.leaveArenaBtn;
      this.p.fillRR(lb.x, lb.y + 2 * u, lb.w, lb.h, 14 * u, 'rgba(0, 0, 0, 0.35)');
      this.glass(lb.x, lb.y, lb.w, lb.h, 14 * u);
      this.p.strokeRR(lb.x, lb.y, lb.w, lb.h, 14 * u, 'rgba(126, 227, 196, 0.8)', 1.5);
      this.p.text('离开斗兽场', lb.x + lb.w / 2, lb.y + lb.h / 2, {
        size: 13 * u, color: '#7EE3C4', align: 'center', stroke: 'rgba(0,0,0,0.3)', strokeWidth: 3,
      });
    }
  }

  /** 准星对准宝箱时的提示 */
  private drawChestHint(d: HudData): void {
    if (d.chestHint <= 0.01) return;
    const u = this.u;
    const W = this.W;
    const H = this.H;
    this.p.setAlpha(Math.min(1, d.chestHint));
    const w = 132 * u;
    this.p.fillRR(W / 2 - w / 2, H / 2 + 22 * u, w, 20 * u, 10 * u, 'rgba(8, 14, 22, 0.66)');
    this.p.strokeRR(W / 2 - w / 2, H / 2 + 22 * u, w, 20 * u, 10 * u, 'rgba(255, 213, 79, 0.5)', 1);
    this.p.text('宝箱 · 靠近自动开启', W / 2, H / 2 + 32 * u, {
      size: 9.5 * u, color: '#FFD54F', align: 'center',
    });
    this.p.setAlpha(1);
  }

  /** 寻宝模式：世界 BOSS 方向指引（环绕准星的金色箭头 + 名称/距离/血条） */
  private drawBossArrows(d: HudData): void {
    if (!d.bossArrows || d.overlay !== 'none' || d.state !== 'playing') return;
    const u = this.u;
    const cx = this.W / 2;
    const cy = this.H / 2;
    const R = 66 * u;
    for (const a of d.bossArrows) {
      const sx = cx + Math.sin(a.angle) * R;
      const sy = cy - Math.cos(a.angle) * R;
      // 三角箭头指向 BOSS 方位
      this.p.save();
      this.p.translate(sx, sy);
      this.p.rotate(a.angle);
      this.p.setAlpha(0.92);
      this.p.poly([[0, -7.5 * u], [4.8 * u, 4.2 * u], [-4.8 * u, 4.2 * u]], '#FFD54F');
      this.p.polyStroke([[0, -7.5 * u], [4.8 * u, 4.2 * u], [-4.8 * u, 4.2 * u], [0, -7.5 * u]], 'rgba(80,44,0,0.7)', 1);
      this.p.setAlpha(1);
      this.p.restore();
      // 标签放箭头外侧，避免压准星
      const above = Math.cos(a.angle) > 0;
      const ly = sy + (above ? -18 * u : 18 * u);
      const label = `${a.name} ${Math.round(a.dist)}m`;
      const lw = Math.max(54 * u, label.length * 7.2 * u + 10 * u);
      this.p.fillRR(sx - lw / 2, ly - 6.5 * u, lw, 13 * u, 6 * u, 'rgba(8, 14, 22, 0.62)');
      this.p.strokeRR(sx - lw / 2, ly - 6.5 * u, lw, 13 * u, 6 * u, 'rgba(255, 213, 79, 0.45)', 1);
      this.p.text(label, sx, ly, { size: 8 * u, color: '#FFD54F', align: 'center' });
      // 迷你血条
      const bw = 38 * u;
      const by = ly + (above ? 9 * u : -11.5 * u);
      this.p.fillRR(sx - bw / 2, by, bw, 3 * u, 1.5 * u, 'rgba(255,255,255,0.20)');
      this.p.fillRR(sx - bw / 2, by, Math.max(3 * u, bw * Math.max(0, Math.min(1, a.hpRatio))), 3 * u, 1.5 * u, '#FFD54F');
    }
  }

  /** 宝箱奖励面板：斗兽场二选一（免费一件，另一件看广告领取） */
  private drawReward(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;
    const r = d.reward;
    if (!r) return;

    const picked = d.rewardPicked;
    const second = d.rewardSecond;

    this.p.rect(0, 0, W, H, 'rgba(4, 8, 14, 0.72)');
    const pw = 320 * u;
    const ph = 268 * u;
    const px = W / 2 - pw / 2;
    const py = (H - ph) / 2;

    const tc = TIER_COLORS[Math.max(r.weapon.tier, r.equip.tier)] || '#FFD54F';
    this.p.glow(W / 2, py + ph * 0.45, 96 * u, tc, 0.22);
    this.p.fillRR(px, py, pw, ph, 18 * u, 'rgba(12, 19, 30, 0.96)');
    this.p.fillRR(px, py, pw, ph * 0.4, 18 * u, 'rgba(255, 255, 255, 0.05)');
    this.p.strokeRR(px, py, pw, ph, 18 * u, tc, 1.6 * u, 0.75);

    this.p.text(picked < 0 ? '宝箱二选一' : '获得奖励', W / 2, py + 26 * u, {
      size: 19 * u, color: '#FFD54F', align: 'center', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 4,
    });
    this.p.text(
      picked < 0 ? '免费挑选一件 · 另一件可看广告领取' : (second ? '两件奖励全部到手' : '另一件仍可看广告领取'),
      W / 2, py + 44 * u,
      { size: 8.5 * u, color: 'rgba(255,255,255,0.5)', align: 'center', regular: true },
    );

    const cw = 132 * u;
    const ch = 108 * u;
    const gap = 10 * u;
    const cy = py + 56 * u;
    const cx0 = W / 2 - (cw * 2 + gap) / 2;
    const cards: Array<[EquipDef, string]> = [[r.weapon, '武器'], [r.equip, '装备']];
    for (let i = 0; i < 2; i++) {
      const it = cards[i][0];
      const cc = TIER_COLORS[it.tier] || '#FFFFFF';
      const cx = cx0 + i * (cw + gap);
      const isPicked = picked === i;
      const isOther = picked >= 0 && picked !== i;
      const taken = isOther && second;

      this.p.fillRR(cx, cy, cw, ch, 12 * u,
        isPicked ? 'rgba(123, 227, 138, 0.14)' : 'rgba(255, 255, 255, 0.06)');
      this.p.strokeRR(cx, cy, cw, ch, 12 * u,
        isPicked ? '#7BE38A' : cc, isPicked ? 2.2 * u : 1.5 * u, isOther && !taken ? 0.45 : 0.9);
      if (!isOther || taken) {
        this.p.glow(cx + cw / 2, cy + 30 * u, 30 * u, cc, 0.16);
      }
      this.slotIcon(it.slot, cx + cw / 2, cy + 28 * u, 26 * u, it.color);
      this.p.text(it.name, cx + cw / 2, cy + 54 * u, {
        size: 11 * u, color: cc, align: 'center',
      });
      this.p.text(`${TIER_NAMES[it.tier]} · ${cards[i][1]}`, cx + cw / 2, cy + 67 * u, {
        size: 8 * u, color: 'rgba(255,255,255,0.62)', align: 'center', regular: true,
      });
      this.p.text(mainStat(it), cx + cw / 2, cy + 80 * u, {
        size: 9 * u, color: '#9BE7B0', align: 'center',
      });

      // 卡片底部状态
      if (picked < 0) {
        this.p.text('点击拿走', cx + cw / 2, cy + ch - 10 * u, {
          size: 9 * u, color: '#FFD54F', align: 'center',
        });
        if (i === 0) this.pickWBtn = { x: cx, y: cy, w: cw, h: ch, id: 'pickW' };
        else this.pickEBtn = { x: cx, y: cy, w: cw, h: ch, id: 'pickE' };
      } else if (isPicked) {
        this.p.text('✔ 已选择', cx + cw / 2, cy + ch - 10 * u, {
          size: 9.5 * u, color: '#7BE38A', align: 'center',
        });
      } else if (taken) {
        this.p.text('✔ 已领取', cx + cw / 2, cy + ch - 10 * u, {
          size: 9.5 * u, color: '#7BE38A', align: 'center',
        });
      } else {
        // 未选中的另一件：看广告领取
        this.adSecondBtn = { x: cx, y: cy, w: cw, h: ch, id: 'adSecond' };
        this.p.fillRR(cx + 8 * u, cy + ch - 22 * u, cw - 16 * u, 17 * u, 8 * u, 'rgba(244, 107, 149, 0.28)');
        this.p.strokeRR(cx + 8 * u, cy + ch - 22 * u, cw - 16 * u, 17 * u, 8 * u, PINK, 1);
        this.p.text('▶ 看广告领取', cx + cw / 2, cy + ch - 13 * u, {
          size: 9 * u, color: '#F8BBD0', align: 'center',
        });
      }
    }

    if (picked >= 0) {
      const bw = pw - 140 * u;
      const bh = 38 * u;
      const bx = W / 2 - bw / 2;
      const by = py + ph - 50 * u;
      this.rewardBtn = { x: bx, y: by, w: bw, h: bh, id: 'rewardClose' };
      this.panelButton(this.rewardBtn, '收下', GREEN, 15);
    } else {
      // 未选择时不可关闭
      this.rewardBtn = { x: -9999, y: -9999, w: 1, h: 1, id: 'rewardClose' };
      this.p.text('选择一件后关闭面板', W / 2, py + ph - 22 * u, {
        size: 9 * u, color: 'rgba(255,255,255,0.4)', align: 'center', regular: true,
      });
    }

    // 复位当前不应命中的区域
    if (picked >= 0) {
      this.pickWBtn = { x: -9999, y: -9999, w: 1, h: 1, id: 'pickW' };
      this.pickEBtn = { x: -9999, y: -9999, w: 1, h: 1, id: 'pickE' };
    }
    if (picked < 0 || second) {
      this.adSecondBtn = { x: -9999, y: -9999, w: 1, h: 1, id: 'adSecond' };
    }
  }

  /** 伤害飘字：普通白色，暴击金色大字 + 「暴击!」 */
  private drawDmgTexts(d: HudData): void {
    const u = this.u;
    for (const t of d.dmgTexts) {
      const size = (t.crit ? 17 : 12) * u * t.scale;
      this.p.setAlpha(t.alpha);
      this.p.text(t.text, t.x, t.y, {
        size, color: t.crit ? '#FFD54F' : '#FFFFFF', align: 'center',
        stroke: 'rgba(0, 0, 0, 0.75)', strokeWidth: 3 * u,
      });
      if (t.crit) {
        this.p.text('暴击!', t.x, t.y - 16 * u, {
          size: 10 * u, color: '#FFD54F', align: 'center',
          stroke: 'rgba(0, 0, 0, 0.75)', strokeWidth: 3 * u,
        });
      }
      this.p.setAlpha(1);
    }
  }

  /** 怪物头顶名牌：颜色按等级区分，BOSS 金色带底衬 */
  private drawMobNames(d: HudData): void {
    const u = this.u;
    for (const n of d.mobNames) {
      const w = n.text.length * 11 * u;
      // 底衬小胶囊
      this.p.fillRR(n.x - w / 2 - 6 * u, n.y - 9 * u, w + 12 * u, 18 * u, 9 * u,
        n.boss ? 'rgba(80, 50, 0, 0.55)' : 'rgba(12, 16, 28, 0.5)');
      // 阴影 + 正文（模拟描边）
      this.p.text(n.text, n.x + 1 * u, n.y + 1 * u, { size: 11 * u, color: 'rgba(0,0,0,0.8)', align: 'center' });
      this.p.text(n.text, n.x, n.y, { size: 11 * u, color: n.color, align: 'center' });
    }
  }

  /** 斗兽场 BOSS 顶部大血条：名字 + 波次 + 渐变血条 */
  private drawArenaBossBar(d: HudData): void {
    if (!d.arenaBoss || d.state !== 'playing') return;
    const u = this.u;
    const W = this.W;
    const b = d.arenaBoss;
    const bw = 300 * u;
    const bh = 14 * u;
    const bx = W / 2 - bw / 2;
    const by = (52 + 40) * u + d.safeTop; // 位于右上角功能按钮行下方
    // 标题：👑 名字 · 第N波
    const title = `👑 ${b.name} · 第${b.wave}波`;
    this.p.text(title, W / 2 + 1 * u, by - 6 * u + 1 * u, { size: 13 * u, color: 'rgba(0,0,0,0.8)', align: 'center' });
    this.p.text(title, W / 2, by - 6 * u, { size: 13 * u, color: '#FFD54F', align: 'center' });
    // 底 + 金框
    this.p.fillRR(bx - 2 * u, by + 4 * u, bw + 4 * u, bh + 4 * u, 8 * u, 'rgba(10, 6, 4, 0.72)');
    this.p.strokeRR(bx - 2 * u, by + 4 * u, bw + 4 * u, bh + 4 * u, 8 * u, '#FFD54F', 1.5 * u);
    // 血条：暗红底 + 金红填充 + 顶部高光
    this.p.fillRR(bx, by + 6 * u, bw, bh, 6 * u, '#3A0E0E');
    const fw = bw * Math.max(0, Math.min(1, b.ratio));
    if (fw > 1) {
      this.p.fillRR(bx, by + 6 * u, fw, bh, 6 * u, '#C62828');
      this.p.fillRR(bx, by + 6 * u, fw, bh * 0.4, 6 * u, 'rgba(255, 213, 79, 0.45)');
    }
    // 百分比
    this.p.text(Math.round(b.ratio * 100) + '%', bx + bw + 8 * u, by + 6 * u + bh / 2, {
      size: 10 * u, color: '#FFD54F',
    });
  }

  /** 状态图标：火苗 / 雪花 / 闪电（怪物头顶） */
  private drawStatusIcons(d: HudData): void {
    const u = this.u;
    for (const s of d.statusIcons) {
      this.p.circle(s.x, s.y, 9 * u, 'rgba(0, 0, 0, 0.45)');
      if (s.kind === 'burn') {
        this.p.poly([
          [s.x, s.y - 7 * u], [s.x + 5 * u, s.y + 2 * u], [s.x + 2.5 * u, s.y + 6 * u],
          [s.x, s.y + 2.5 * u], [s.x - 2.5 * u, s.y + 6 * u], [s.x - 5 * u, s.y + 2 * u],
        ], '#FF7043');
        this.p.circle(s.x, s.y + 3 * u, 2 * u, '#FFD54F');
      } else if (s.kind === 'slow') {
        this.p.save();
        this.p.translate(s.x, s.y);
        for (let i = 0; i < 3; i++) {
          this.p.save();
          this.p.rotate(i * Math.PI / 3);
          this.p.rect(-6 * u, -1 * u, 12 * u, 2 * u, '#81D4FA');
          this.p.restore();
        }
        this.p.restore();
      } else {
        this.p.poly([
          [s.x - 3 * u, s.y - 8 * u], [s.x + 4 * u, s.y - 1 * u], [s.x + 0.5 * u, s.y - 1 * u],
          [s.x + 3 * u, s.y + 8 * u], [s.x - 4 * u, s.y + 1 * u], [s.x - 0.5 * u, s.y + 1 * u],
        ], '#FFEB3B');
      }
    }
  }

  private drawToasts(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;
    let y = H - 24 * u - 40 * u - 14 * u; // 抬到 8 格快捷栏上方，避免提示条盖住格子
    for (const t of d.toasts) {
      if (t.alpha <= 0.01) continue;
      this.p.setAlpha(Math.min(1, t.alpha));
      const w = Math.max(120 * u, t.msg.length * 11 * u + 28 * u);
      this.p.fillRR(W / 2 - w / 2, y - 11 * u, w, 22 * u, 11 * u, 'rgba(8, 14, 22, 0.7)');
      this.p.text(t.msg, W / 2, y, { size: 10.5 * u, color: t.color, align: 'center' });
      y -= 26 * u;
    }
    this.p.setAlpha(1);
  }

  // ---------------- 暂停页 ----------------
  private drawPause(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;

    this.p.rect(0, 0, W, H, 'rgba(4, 8, 14, 0.58)');
    const pw = 244 * u;
    const ph = 274 * u;
    const px = W / 2 - pw / 2;
    const py = (H - ph) / 2;

    this.p.fillRR(px, py, pw, ph, 18 * u, 'rgba(10, 17, 26, 0.88)');
    this.p.strokeRR(px, py, pw, ph, 18 * u, 'rgba(255, 255, 255, 0.16)', 1);
    this.p.glow(W / 2, py + 26 * u, 58 * u, PINK, 0.16);

    this.p.text('已暂停', W / 2, py + 32 * u, { size: 22 * u, color: WHITE, align: 'center' });
    this.p.text(`第 ${d.wave} 波 · 击杀 ${d.kills}`, W / 2, py + 54 * u, {
      size: 9.5 * u, color: 'rgba(255,255,255,0.55)', align: 'center',
    });

    const rw = pw - 44 * u;
    const rh = 42 * u;
    const rx = W / 2 - rw / 2;
    const ry = py + 78 * u;
    this.resumeBtn = { x: rx, y: ry, w: rw, h: rh, id: 'resume' };
    this.panelButton(this.resumeBtn, '继续游戏', GREEN);

    const hy = ry + rh + 12 * u;
    this.homeBtn = { x: rx, y: hy, w: rw, h: 36 * u, id: 'home' };
    this.p.fillRR(rx, hy, rw, 36 * u, 10 * u, 'rgba(255, 255, 255, 0.10)');
    this.p.strokeRR(rx, hy, rw, 36 * u, 10 * u, 'rgba(255, 255, 255, 0.18)', 1);
    this.p.text('返回主界面', W / 2, hy + 18 * u, { size: 13 * u, color: 'rgba(255,255,255,0.88)', align: 'center' });

    // === 音乐行：开关按钮 + 音量滑条 ===
    const my = hy + 36 * u + 14 * u;
    const mh = 30 * u;
    const on = this.musicOn;
    this.musTBtn = { x: rx, y: my, w: rw * 0.36, h: mh, id: 'musT' };
    this.p.fillRR(rx, my, rw * 0.36, mh, 10 * u, on ? 'rgba(76, 175, 80, 0.30)' : 'rgba(255, 255, 255, 0.10)');
    this.p.strokeRR(rx, my, rw * 0.36, mh, 10 * u, on ? GREEN : 'rgba(255, 255, 255, 0.18)', 1);
    this.p.text(on ? '♪ 音乐开' : '♪ 音乐关', rx + rw * 0.18, my + mh / 2, {
      size: 11 * u, color: on ? '#A5E8A0' : 'rgba(255,255,255,0.6)', align: 'center',
    });

    const vx = rx + rw * 0.42;
    const vw = rw * 0.58;
    this.volBar = { x: vx, y: my, w: vw, h: mh };
    this.p.text('音量', vx + 1 * u, my + 3 * u, { size: 9 * u, color: 'rgba(255,255,255,0.5)' });
    this.p.text(Math.round(this.musicVol * 100) + '%', vx + vw - 1 * u, my + 3 * u, { size: 9 * u, color: '#A5E8A0', align: 'right' });
    const ty = my + mh * 0.7;
    this.p.fillRR(vx, ty - 2 * u, vw, 4 * u, 2 * u, 'rgba(255,255,255,0.12)');
    const fw = vw * this.musicVol;
    if (fw > 0.5) this.p.fillRR(vx, ty - 2 * u, fw, 4 * u, 2 * u, GREEN);
    this.p.circle(vx + fw, ty, 6 * u, WHITE);
    this.p.circleStroke(vx + fw, ty, 6 * u, GREEN, 1.5 * u);

    this.p.text('提示：按 Esc 也可以继续', W / 2, py + ph - 16 * u, {
      size: 9 * u, color: 'rgba(255,255,255,0.4)', align: 'center',
    });
  }

  // ---------------- 死亡页 ----------------
  private drawDead(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;

    this.p.rect(0, 0, W, H, 'rgba(40, 4, 8, 0.62)');
    const pw = 258 * u;
    const ph = 252 * u;
    const px = W / 2 - pw / 2;
    const py = (H - ph) / 2;

    this.p.fillRR(px, py, pw, ph, 18 * u, 'rgba(16, 10, 14, 0.92)');
    this.p.strokeRR(px, py, pw, ph, 18 * u, 'rgba(255, 120, 120, 0.25)', 1);
    this.p.glow(W / 2, py + 30 * u, 60 * u, RED, 0.22);

    this.p.text('你倒下了', W / 2, py + 36 * u, { size: 24 * u, color: RED, align: 'center' });
    this.p.text(`坚持到第 ${d.wave} 波 · 击杀 ${d.kills} 只怪物`, W / 2, py + 60 * u, {
      size: 10.5 * u, color: 'rgba(255,255,255,0.6)', align: 'center',
    });

    const rw = pw - 44 * u;
    const rx = W / 2 - rw / 2;
    const ry = py + 84 * u;
    this.deadReviveBtn = { x: rx, y: ry, w: rw, h: 46 * u, id: 'adRevive' };
    this.panelButton(this.deadReviveBtn, '看广告 · 原地复活', PINK, 16);

    const hy = ry + 58 * u;
    this.deadRestartBtn = { x: rx, y: hy, w: rw, h: 38 * u, id: 'restart' };
    this.p.fillRR(rx, hy, rw, 38 * u, 10 * u, 'rgba(255, 255, 255, 0.10)');
    this.p.strokeRR(rx, hy, rw, 38 * u, 10 * u, 'rgba(255, 255, 255, 0.18)', 1);
    this.p.text('从头再来（第 1 波）', W / 2, hy + 19 * u, {
      size: 13 * u, color: 'rgba(255,255,255,0.88)', align: 'center',
    });

    this.p.text('复活后保留装备与当前波次，不限次数', W / 2, py + ph - 18 * u, {
      size: 9 * u, color: 'rgba(255,255,255,0.42)', align: 'center',
    });
  }

  // ---------------- 超时失败页 ----------------
  private drawFail(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;

    this.p.rect(0, 0, W, H, 'rgba(30, 18, 4, 0.62)');
    const pw = 258 * u;
    const ph = 226 * u;
    const px = W / 2 - pw / 2;
    const py = (H - ph) / 2;

    this.p.fillRR(px, py, pw, ph, 18 * u, 'rgba(18, 14, 10, 0.92)');
    this.p.strokeRR(px, py, pw, ph, 18 * u, 'rgba(255, 200, 100, 0.25)', 1);
    this.p.glow(W / 2, py + 30 * u, 60 * u, ORANGE, 0.2);

    this.p.text('时间到！', W / 2, py + 36 * u, { size: 24 * u, color: ORANGE, align: 'center' });
    this.p.text(`第 ${d.wave} 波还剩 ${d.mobsLeft} 只怪物`, W / 2, py + 60 * u, {
      size: 10.5 * u, color: 'rgba(255,255,255,0.6)', align: 'center',
    });

    const rw = pw - 44 * u;
    const rx = W / 2 - rw / 2;
    const ry = py + 84 * u;
    this.failRetryBtn = { x: rx, y: ry, w: rw, h: 44 * u, id: 'retryWave' };
    this.panelButton(this.failRetryBtn, '重新挑战本关', GREEN);

    const hy = ry + 56 * u;
    this.failHomeBtn = { x: rx, y: hy, w: rw, h: 36 * u, id: 'failHome' };
    this.p.fillRR(rx, hy, rw, 36 * u, 10 * u, 'rgba(255, 255, 255, 0.10)');
    this.p.strokeRR(rx, hy, rw, 36 * u, 10 * u, 'rgba(255, 255, 255, 0.18)', 1);
    this.p.text('回主界面', W / 2, hy + 18 * u, { size: 13 * u, color: 'rgba(255,255,255,0.88)', align: 'center' });
  }

  // ---------------- 人物栏（传奇式：人物居中，装备槽绕四周） ----------------
  private drawChar(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;
    const c = d.char;
    if (!c) return;

    this.p.rect(0, 0, W, H, 'rgba(4, 8, 14, 0.66)');

    const pw = W * 0.88;
    const ph = H * 0.84;
    const px = W / 2 - pw / 2;
    const py = (H - ph) / 2;

    this.p.fillRR(px, py, pw, ph, 16 * u, 'rgba(12, 19, 30, 0.95)');
    this.p.strokeRR(px, py, pw, ph, 16 * u, 'rgba(255, 255, 255, 0.16)', 1);

    this.p.text('人物', W / 2, py + 22 * u, { size: 17 * u, color: WHITE, align: 'center' });
    this.p.text('角色与装备 · 游戏已暂停', W / 2, py + 37 * u, {
      size: 8.5 * u, color: 'rgba(255,255,255,0.4)', align: 'center',
    });

    // 关闭按钮
    this.charCloseBtn = { x: px + pw - 40 * u, y: py + 12 * u, w: 28 * u, h: 28 * u, id: 'closeChar' };
    this.p.fillRR(this.charCloseBtn.x, this.charCloseBtn.y, this.charCloseBtn.w, this.charCloseBtn.h, 8 * u,
      'rgba(255,255,255,0.10)');
    this.p.text('✕', this.charCloseBtn.x + 14 * u, this.charCloseBtn.y + 14 * u, {
      size: 13 * u, color: 'rgba(255,255,255,0.8)', align: 'center',
    });

    // ---- 左侧：人物居中 + 上下左右装备槽 ----
    const regionX = px + 16 * u;
    const regionW = pw * 0.58;
    const regionY = py + 52 * u;
    const regionH = ph - 68 * u;
    const ecx = regionX + regionW / 2;
    const ecy = regionY + regionH / 2;
    const sk = SKIN_PRESETS[Math.min(c.skinIndex, SKIN_PRESETS.length - 1)];

    this.p.fillRR(regionX, regionY, regionW, regionH, 12 * u, 'rgba(255,255,255,0.03)');
    this.p.strokeRR(regionX, regionY, regionW, regionH, 12 * u, 'rgba(255,255,255,0.08)', 1);
    this.p.glow(ecx, ecy, 84 * u, sk.accent, 0.3);

    // 体素人物：头 / 身体 / 双臂 / 双腿 / 鞋
    const head = 38 * u;
    const headY = ecy - 72 * u;
    const bW = 46 * u;
    const bH = 54 * u;
    const bodyY = headY + head + 6 * u;
    this.p.fillRR(ecx - bW / 2, bodyY, bW, bH, 4 * u, sk.shirt);
    this.p.fillRR(ecx - bW / 2 - 12 * u, bodyY + 3 * u, 12 * u, 46 * u, 3 * u, sk.shirt);
    this.p.fillRR(ecx + bW / 2, bodyY + 3 * u, 12 * u, 46 * u, 3 * u, sk.shirt);
    const legY = bodyY + bH + 4 * u;
    this.p.fillRR(ecx - bW / 2 + 2 * u, legY, 19 * u, 36 * u, 3 * u, sk.pants);
    this.p.fillRR(ecx + bW / 2 - 21 * u, legY, 19 * u, 36 * u, 3 * u, sk.pants);
    this.p.fillRR(ecx - bW / 2 + 1 * u, legY + 36 * u, 21 * u, 8 * u, 2 * u, sk.shoes);
    this.p.fillRR(ecx + bW / 2 - 22 * u, legY + 36 * u, 21 * u, 8 * u, 2 * u, sk.shoes);
    this.p.fillRR(ecx - head / 2, headY, head, head, 4 * u, sk.skin);
    this.p.fillRR(ecx - 11 * u, headY + 14 * u, 6 * u, 6 * u, 1 * u, '#2B1B12');
    this.p.fillRR(ecx + 5 * u, headY + 14 * u, 6 * u, 6 * u, 1 * u, '#2B1B12');

    // 装备槽（上：头盔 / 下：铠甲 / 左：武器 / 右：戒指 / 右上：工具）
    const S = 54 * u;
    const hlY = ecy - 132 * u;
    const arY = ecy + 76 * u;
    const sideY = ecy - S / 2;
    this.drawEquipSlot(ecx - S / 2, hlY, S, 'helmet', c.equip.helmet);
    this.drawEquipSlot(ecx - S / 2, arY, S, 'armor', c.equip.armor);
    this.drawEquipSlot(ecx - 138 * u, sideY, S, 'weapon', c.equip.weapon);
    this.drawEquipSlot(ecx + 84 * u, sideY, S, 'ring', c.equip.ring);
    this.drawEquipSlot(ecx + 84 * u, hlY, S, 'tool', c.equip.tool);

    // ---- 右列：皮肤卡片（广告解锁 · 状态条） ----
    const gridX = regionX + regionW + 16 * u;
    const gridW = px + pw - 16 * u - gridX;
    this.p.text('皮肤 · 看广告解锁', gridX + gridW / 2, py + 58 * u, {
      size: 11 * u, color: '#FFD54F', align: 'center',
    });
    const cols = 3;
    const gap = 8 * u;
    const cw = (gridW - (cols - 1) * gap) / cols;
    const ch = 72 * u;
    const gridY = py + 70 * u;
    this.skinCells = [];
    for (let i = 0; i < SKIN_PRESETS.length; i++) {
      const s = SKIN_PRESETS[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gridX + col * (cw + gap);
      const cy = gridY + row * (ch + gap);
      const mx = cx + cw / 2;
      const using = i === c.skinIndex;
      const unlocked = c.skinUnlocked ? c.skinUnlocked[i] !== false : i < 2;
      this.skinCells.push({ x: cx, y: cy, w: cw, h: ch, id: `skin${i}` });

      // 卡片底 + 描边：使用中金色发光，未解锁降饱和
      this.p.fillRR(cx, cy, cw, ch, 9 * u,
        using ? 'rgba(255, 213, 79, 0.16)' : unlocked ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.03)');
      this.p.strokeRR(cx, cy, cw, ch, 9 * u,
        using ? '#FFD54F' : unlocked ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)', using ? 2 : 1);
      if (using) this.p.glow(mx, cy + ch * 0.45, cw * 0.6, '#FFD54F', 0.22);
      // 顶部强调条（皮肤主色）
      this.p.fillRR(cx + 6 * u, cy + 5 * u, cw - 12 * u, 3 * u, 1.5 * u, s.accent, unlocked ? 0.9 : 0.4);

      // 皮肤预览：头 / 身 / 双腿（紧凑排布，给名称和状态条留出空间）
      const dim = unlocked ? 1 : 0.5;
      const pv = cy + 8 * u;
      this.p.fillRR(mx - 6 * u, pv, 12 * u, 12 * u, 2.5 * u, s.skin, dim);
      this.p.fillRR(mx - 8 * u, pv + 14 * u, 16 * u, 13 * u, 3 * u, s.shirt, dim);
      this.p.fillRR(mx - 7 * u, pv + 28 * u, 6 * u, 6 * u, 1.5 * u, s.pants, dim);
      this.p.fillRR(mx + 1 * u, pv + 28 * u, 6 * u, 6 * u, 1.5 * u, s.pants, dim);
      this.p.fillRR(mx - 7 * u, pv + 34 * u, 6 * u, 2.5 * u, 1 * u, s.shoes, dim);
      this.p.fillRR(mx + 1 * u, pv + 34 * u, 6 * u, 2.5 * u, 1 * u, s.shoes, dim);

      // 名称
      this.p.text(s.name, mx, cy + 49 * u, {
        size: 8.5 * u, color: using ? '#FFD54F' : unlocked ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.4)',
        align: 'center',
      });

      // 状态条
      const sy = cy + 60 * u;
      if (using) {
        this.p.fillRR(mx - 26 * u, sy - 7 * u, 52 * u, 14 * u, 7 * u, 'rgba(255,213,79,0.18)');
        this.p.strokeRR(mx - 26 * u, sy - 7 * u, 52 * u, 14 * u, 7 * u, 'rgba(255,213,79,0.45)', 1);
        this.p.text('使用中', mx, sy, {
          size: 6.8 * u, color: '#FFD54F', align: 'center', regular: true,
        });
      } else if (unlocked) {
        this.p.text('点击使用', mx, sy, {
          size: 6.8 * u, color: 'rgba(255,255,255,0.6)', align: 'center', regular: true,
        });
      } else {
        this.p.fillRR(mx - 31 * u, sy - 7 * u, 62 * u, 14 * u, 7 * u, 'rgba(244,107,149,0.16)');
        this.p.strokeRR(mx - 31 * u, sy - 7 * u, 62 * u, 14 * u, 7 * u, 'rgba(244,107,149,0.45)', 1);
        // 锁：锁体 + 半圆锁扣（用 Graphics 绘制，不依赖 emoji 字体）
        const lx = mx - 23 * u;
        this.p.fillRR(lx - 3 * u, sy - 2 * u, 6 * u, 5 * u, 1.2 * u, '#F46B95', 0.9);
        this.p.ellStroke(lx, sy - 2 * u, 2.4 * u, 2.8 * u, 0, '#F46B95', 1.1 * u, 0.9, Math.PI, Math.PI * 2);
        this.p.text('看广告解锁', mx + 4 * u, sy, {
          size: 6.4 * u, color: '#F46B95', align: 'center', regular: true,
        });
      }
    }

    // 看广告领装备：皮肤区下方
    const adY = gridY + 2 * (ch + gap) + 12 * u;
    this.adEquipBtn = { x: gridX, y: adY, w: gridW, h: 36 * u, id: 'adEquip' };
    this.panelButton(this.adEquipBtn, '看广告 · 免费领装备', GREEN);

    // 属性汇总（放在右列底部，避免压住左下的铠甲槽）
    const stX = gridX + gridW / 2;
    const stY = py + ph - 22 * u;
    this.p.text(`攻击 ${c.attack} · 生命上限 ${c.maxHp}`, stX, stY - 15 * u, {
      size: 9 * u, color: '#9BE7B0', align: 'center', regular: true,
    });
    this.p.text(`减伤 ${Math.round(c.armor * 100)}% · 回血 ${c.regen.toFixed(2)}/s`, stX, stY, {
      size: 9 * u, color: '#9BE7B0', align: 'center', regular: true,
    });
  }

  /** 单个装备槽：顶部槽名 + 图标 + 物品名（空槽显示槽位名） */
  private drawEquipSlot(x: number, y: number, s: number, slot: SlotId, item: EquipDef | null): void {
    const u = this.u;
    this.p.text(SLOT_NAMES[slot], x + s / 2, y - 7 * u, {
      size: 7.5 * u, color: 'rgba(255,255,255,0.5)', align: 'center', regular: true,
    });
    this.p.fillRR(x, y, s, s, 8 * u, item ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)');
    this.p.strokeRR(x, y, s, s, 8 * u, item ? TIER_COLORS[item.tier] : 'rgba(255,255,255,0.14)', item ? 1.5 : 1);
    this.slotIcon(slot, x + s / 2, y + s * 0.42, 14 * u, item ? item.color : 'rgba(255,255,255,0.3)');
    if (item) {
      this.p.text(item.name, x + s / 2, y + s - 8 * u, {
        size: 7 * u, color: TIER_COLORS[item.tier], align: 'center',
      });
    } else {
      this.p.text('未装备', x + s / 2, y + s - 8 * u, {
        size: 6.5 * u, color: 'rgba(255,255,255,0.3)', align: 'center', regular: true,
      });
    }
  }

  // ---------------- 物品栏（装备格子 + 宝剑图鉴） ----------------
  private drawBag(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;
    const b = d.bag;
    if (!b) return;

    this.p.rect(0, 0, W, H, 'rgba(4, 8, 14, 0.66)');

    const pw = W * 0.88;
    const ph = H * 0.84;
    const px = W / 2 - pw / 2;
    const py = (H - ph) / 2;

    this.p.fillRR(px, py, pw, ph, 16 * u, 'rgba(12, 19, 30, 0.95)');
    this.p.strokeRR(px, py, pw, ph, 16 * u, 'rgba(255, 255, 255, 0.16)', 1);

    this.p.text('物品栏', W / 2, py + 22 * u, { size: 17 * u, color: WHITE, align: 'center' });
    this.p.text(`装备 ${b.items.length} 件 · 宝剑图鉴 ${b.collected.length}/${WEAPONS.length} · 游戏已暂停`,
      W / 2, py + 37 * u, { size: 8.5 * u, color: 'rgba(255,255,255,0.4)', align: 'center' });

    // 关闭按钮
    this.bagCloseBtn = { x: px + pw - 40 * u, y: py + 12 * u, w: 28 * u, h: 28 * u, id: 'closeBag' };
    this.p.fillRR(this.bagCloseBtn.x, this.bagCloseBtn.y, this.bagCloseBtn.w, this.bagCloseBtn.h, 8 * u,
      'rgba(255,255,255,0.10)');
    this.p.text('✕', this.bagCloseBtn.x + 14 * u, this.bagCloseBtn.y + 14 * u, {
      size: 13 * u, color: 'rgba(255,255,255,0.8)', align: 'center',
    });

    const gridX = px + 14 * u;
    const gridW = pw - 28 * u;

    // 自适应高度：标题下到面板底部之间，按 装备 2 行 + 图鉴 N 行 分配
    // 图鉴 6 列，底部预留「看广告领装备」按钮
    const wpnRows = Math.ceil(WEAPONS.length / 6);
    const btnH = 30 * u;
    const avail = (py + ph - 12 * u - btnH - 10 * u) - (py + 52 * u);
    const unit = (avail - 34 * u) / (2 + wpnRows * 0.9);
    const ch = Math.max(28 * u, Math.floor(unit * 0.9));
    const wch = Math.max(26 * u, Math.floor(unit * 0.8));
    const gap = 5 * u;

    // ---- 上半区：装备格子 10 列 × 2 行 = 20 格 ----
    this.p.text('装备（点击立即穿戴）', gridX, py + 58 * u, {
      size: 9 * u, color: 'rgba(255,255,255,0.6)', regular: true,
    });
    const cols = 10;
    const cw = (gridW - (cols - 1) * gap) / cols;
    const equipY = py + 66 * u;
    this.invCells = [];
    for (let i = 0; i < 20; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gridX + col * (cw + gap);
      const cy = equipY + row * (ch + gap);
      const item: EquipDef | undefined = b.items[i];
      if (item) {
        this.invCells.push({ x: cx, y: cy, w: cw, h: ch, id: `inv${i}` });
        this.p.fillRR(cx, cy, cw, ch, 7 * u, 'rgba(255,255,255,0.06)');
        this.p.strokeRR(cx, cy, cw, ch, 7 * u, TIER_COLORS[item.tier] || 'rgba(255,255,255,0.12)', 1);
        if (item.slot === 'weapon') {
          this.swordIcon(cx + cw / 2, cy + ch * 0.32, cw * 0.4, item.color, 1);
        } else {
          this.slotIcon(item.slot, cx + cw / 2, cy + ch * 0.32, cw * 0.34, item.color);
        }
        this.p.text(item.name, cx + cw / 2, cy + ch * 0.66, {
          size: 7.5 * u, color: TIER_COLORS[item.tier], align: 'center',
        });
        this.p.text(`${SLOT_NAMES[item.slot]}·${TIER_NAMES[item.tier]}`, cx + cw / 2, cy + ch * 0.86, {
          size: 6 * u, color: 'rgba(255,255,255,0.45)', align: 'center', regular: true,
        });
      } else {
        this.p.fillRR(cx, cy, cw, ch, 7 * u, 'rgba(255,255,255,0.02)');
        this.p.strokeRR(cx, cy, cw, ch, 7 * u, 'rgba(255,255,255,0.06)', 1);
      }
    }

    // ---- 下半区：宝剑图鉴 6 列 × N 行 ----
    const wpnLabelY = equipY + 2 * (ch + gap) + 8 * u;
    this.p.text(`宝剑图鉴 ${b.collected.length}/${WEAPONS.length}（点击已获得的宝剑可切换）`, gridX, wpnLabelY + 8 * u, {
      size: 9 * u, color: '#FFD54F', regular: true,
    });
    const wcols = 6;
    const wcw = (gridW - (wcols - 1) * gap) / wcols;
    const wpnY = wpnLabelY + 14 * u;
    this.weaponCells = [];
    for (let i = 0; i < WEAPONS.length; i++) {
      const wp = WEAPONS[i];
      const col = i % wcols;
      const row = Math.floor(i / wcols);
      const cx = gridX + col * (wcw + gap);
      const cy = wpnY + row * (wch + gap);
      const owned = b.collected.indexOf(wp.id) >= 0;
      const equipped = owned && b.weaponId === wp.id;
      this.weaponCells.push({ x: cx, y: cy, w: wcw, h: wch, id: `wpn${i}` });
      this.p.fillRR(cx, cy, wcw, wch, 7 * u, equipped ? 'rgba(255, 213, 79, 0.16)' : 'rgba(255,255,255,0.05)');
      this.p.strokeRR(cx, cy, wcw, wch, 7 * u, equipped ? '#FFD54F' : 'rgba(255,255,255,0.10)', equipped ? 1.5 : 1);
      this.swordIcon(cx + wcw / 2, cy + wch * 0.32, wcw * 0.4, owned ? wp.color : '#4a4a4a', owned ? 1 : 0.5);
      this.p.text(owned ? wp.name : '？？？', cx + wcw / 2, cy + wch * 0.68, {
        size: 7.5 * u, color: owned ? TIER_COLORS[wp.tier] : 'rgba(255,255,255,0.3)', align: 'center',
      });
      this.p.text(owned ? `攻${wp.dmg}` : '未解锁', cx + wcw / 2, cy + wch * 0.88, {
        size: 6 * u, color: 'rgba(255,255,255,0.45)', align: 'center', regular: true,
      });
    }

    // 右下角：看广告免费领装备（必得 T3/T4）
    const abw = 200 * u;
    this.bagAdBtn = {
      x: px + pw - 14 * u - abw, y: py + ph - 12 * u - btnH, w: abw, h: btnH, id: 'adBag',
    };
    this.p.fillRR(this.bagAdBtn.x, this.bagAdBtn.y, abw, btnH, btnH / 2, 'rgba(123, 227, 138, 0.16)');
    this.p.strokeRR(this.bagAdBtn.x, this.bagAdBtn.y, abw, btnH, btnH / 2, 'rgba(123, 227, 138, 0.5)', 1.2);
    this.p.text('看广告 · 免费领装备', this.bagAdBtn.x + abw / 2, this.bagAdBtn.y + btnH / 2, {
      size: 9.5 * u, color: '#9BE7B0', align: 'center', regular: true,
    });
  }

  // ---------------- 模拟广告 ----------------
  private drawAd(d: HudData): void {
    const u = this.u;
    const W = this.W;
    const H = this.H;

    this.p.rect(0, 0, W, H, 'rgba(2, 4, 8, 0.82)');
    const pw = 264 * u;
    const ph = 296 * u;
    const px = W / 2 - pw / 2;
    const py = (H - ph) / 2;

    this.p.fillRR(px, py, pw, ph, 16 * u, 'rgba(14, 20, 32, 0.98)');
    this.p.strokeRR(px, py, pw, ph, 16 * u, 'rgba(255, 255, 255, 0.18)', 1);

    this.p.text('激励视频广告', W / 2, py + 26 * u, { size: 15 * u, color: WHITE, align: 'center' });

    // 模拟广告画面
    const ax = px + 18 * u;
    const ay = py + 44 * u;
    const aw = pw - 36 * u;
    const ah = 150 * u;
    const legend = d.adPurpose === 'legend';
    const skinAd = d.adPurpose === 'skin';
    const bagAd = d.adPurpose === 'bag';
    const ultAd = d.adPurpose === 'ult';
    this.p.vGrad(ax, ay, aw, ah, legend
      ? ['#2a1b52', '#5b3fa8', '#c65d7b']
      : skinAd
        ? ['#1f2f4d', '#3f5b86', '#b07ca8']
        : ultAd
          ? ['#2b1410', '#6d2a12', '#e8542a']
          : ['#3a2b5c', '#7b3f8c', '#c65d7b'], 12);
    this.p.glow(W / 2, ay + ah / 2, legend ? 76 * u : 60 * u, ultAd ? '#FF7043' : '#FFD54F', legend ? 0.4 : 0.3);
    if (ultAd) {
      // 大招广告：三色能量环 + 技能图标
      const my = ay + ah / 2 - 4 * u;
      this.p.glow(W / 2, my, 64 * u, '#FFD54F', 0.35);
      this.p.circleStroke(W / 2, my, 46 * u, 'rgba(255, 213, 79, 0.55)', 3 * u);
      this.p.circleStroke(W / 2, my, 58 * u, 'rgba(255, 112, 67, 0.4)', 2 * u);
      const ids = ['meteor', 'thunder', 'frost'];
      const cols = ['#FF7043', '#FFEB3B', '#81D4FA'];
      for (let i = 0; i < 3; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        const ix = W / 2 + Math.cos(ang) * 34 * u;
        const iy = my + Math.sin(ang) * 34 * u;
        this.p.circle(ix, iy, 15 * u, 'rgba(10, 10, 16, 0.72)');
        this.p.circleStroke(ix, iy, 15 * u, cols[i], 1.5 * u);
        this.drawUltIcon(ids[i], ix, iy, 9 * u, cols[i], true, d.time + i * 0.7);
      }
      this.p.text('ULT', W / 2, my + 1 * u, {
        size: 13 * u, color: '#FFFFFF', align: 'center', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 4,
      });
    } else if (skinAd) {
      // 皮肤广告：体素人物剪影
      const mx2 = W / 2;
      this.p.fillRR(mx2 - 13 * u, ay + ah / 2 - 26 * u, 26 * u, 26 * u, 5 * u, '#FFE0B2');
      this.p.fillRR(mx2 - 19 * u, ay + ah / 2 + 2 * u, 38 * u, 34 * u, 6 * u, '#F46B95');
      this.p.fillRR(mx2 - 17 * u, ay + ah / 2 + 37 * u, 15 * u, 14 * u, 3 * u, '#3949AB');
      this.p.fillRR(mx2 + 2 * u, ay + ah / 2 + 37 * u, 15 * u, 14 * u, 3 * u, '#3949AB');
    } else {
      this.swordIcon(W / 2, ay + ah / 2 - 6 * u, legend ? 52 * u : 44 * u, legend ? '#B388FF' : '#FFD54F');
    }
    this.p.text(ultAd ? '究极大招 · 看广告解锁' : legend ? '绝世武器 · 看广告免费领' : skinAd ? '限定皮肤 · 看广告解锁' : '神兵利器 · 限时领取',
      W / 2, ay + ah - 24 * u, {
        size: 14 * u, color: WHITE, align: 'center', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 4,
      });
    this.p.text(ultAd ? '看完立即获得 3 次大招释放' : legend ? '必得传说级宝剑' : skinAd ? '看完立即解锁并切换' : bagAd ? '必得 T3 / T4 装备' : '看完即可领取装备',
      W / 2, ay + ah - 8 * u, {
        size: 8.5 * u, color: 'rgba(255,255,255,0.78)', align: 'center', regular: true,
      });

    // 进度条
    const bw = aw;
    const by = ay + ah + 18 * u;
    const total = d.adTotal > 0 ? d.adTotal : 3;
    const t = Math.max(0, Math.min(1, 1 - d.adT / total));
    this.p.fillRR(ax, by, bw, 8 * u, 4 * u, 'rgba(255,255,255,0.15)');
    this.p.fillRR(ax, by, Math.max(8 * u, bw * t), 8 * u, 4 * u, '#FFD54F');
    const sec = Math.max(0, Math.ceil(d.adT));
    this.p.text(`广告剩余 ${sec} 秒 · 看完即可获得奖励`, W / 2, by + 26 * u, {
      size: 9.5 * u, color: 'rgba(255,255,255,0.6)', align: 'center',
    });
  }
}
