/**
 * 像素荒野寻宝 · Cocos Creator 3.8 入口
 *
 * 由「4jsvoxel.js (Three.js) + jsnoise.js」的原版源码移植而来：
 *  - Simplex/FBM 噪声生成地形（与原版参数一致）
 *  - 区块合并网格 + 面剔除 + 双预算流式加载
 *  - 波次打怪玩法：限时关卡、怪物 AI、装备掉落、看广告复活/领装备
 *  - 竖屏 HUD：血条 / 摇杆 / 攻击 / 跳跃 / 放置 / 破坏 / 装备面板
 */
import {
  _decorator, AudioClip, AudioSource, Camera, Color, Component, EventKeyboard, EventMouse, EventTouch,
  FogInfo, ImageAsset, Input, Layers, Material, Mesh, MeshRenderer, Node, ResolutionPolicy,
  Texture2D, UITransform, Vec3,
  assetManager, director, input, primitives, profiler, resources, sys, utils, view,
} from 'cc';
import { createSolidTexture } from './voxel/Atlas';
import { BlockNames, BlockType, HOTBAR_BLOCKS } from './voxel/Blocks';
import { Hud, type CharPanelData, type ChestReward, type HudOverlay, type ToastMsg } from './voxel/Hud';
import { Player } from './voxel/Player';
import {
  ARENA_CX, ARENA_CZ, ARENA_GROUND_Y, ARENA_INNER_R, getTreasureChestSpots, isInArena,
  SEA_LEVEL, World, type RayHit,
} from './voxel/World';
import {
  CONSUMABLES, ChestField, DropField, SKIN_PRESETS, TIER_COLORS, WEAPONS, HELMETS, ARMORS, RINGS, TOOLS,
  rollConsumableDrop, rollDrop,
  handBoxes, fistBoxes, pickLegendary, rollBossLoot, rollChestLoot, flushNodeGraveyard,
  type BackpackItem, type ConsumableId, type ConsumableItem, type EquipDef, type SlotId,
} from './game/Items';
import { FACE_TEXTURES, Mob, MobField, mobName, MOB_TIER_COLORS, AFFIX_NAMES, type AffixKind, type MobKind } from './game/Mobs';
import {
  MAP_LIST, MAPS, addChestCount, adUnlockMap, isMapUnlocked, loadMapSave, saveMapSave, unlockProgress,
  type MapDef, type MapSave,
} from './game/Maps';
import { ProjectileSystem } from './game/Projectile';
import { buildBoxesMesh, getVoxGhostMaterial, getVoxMaterial, type BoxDef } from './game/VoxMesh';
import { AD_MOCK_SECONDS, AD_MOCK_SECONDS_ULT, AdService, disposeAds, interstitialIntervalMs, preloadAds, setNativeAdVisible, showInterstitialLater, type AdResult, type AdScene } from './core/Ad';
import { initGameClub, setGameClubVisible } from './core/GameClub';

const { ccclass } = _decorator;

// v2.0 横屏：720 × 400 (16:9)，FIXED_WIDTH 策略
const DESIGN_W = 720;
const DESIGN_H = 400;
const SKY = new Color(150, 205, 246, 255);

const KEY = {
  W: 87, A: 65, S: 83, D: 68, SPACE: 32, SHIFT: 16, ESC: 27, R: 82, ENTER: 13,
  F: 70, E: 69, J: 74,
  // v2.0 消耗品 1~4 格（1~8 已被武器栏占用）
  Q: 81, T: 84, Z: 90, X: 88,
};

type GameState = 'loading' | 'menu' | 'playing' | 'paused' | 'dead' | 'fail';

const BASE_HP = 100;
const MAX_ALIVE_MOBS = 14;

/** v2.5 大招：三个技能各自充能，击杀可加速 */
type UltId = 'meteor' | 'thunder' | 'frost';

interface UltSkill {
  id: UltId;
  name: string;
  icon: string;
  color: string;
  /** 充能进度 0~100 */
  charge: number;
  /** 看广告解锁的额外释放次数 */
  charges: number;
  /** 释放后短冷却（秒） */
  cd: number;
}

/** 寻宝模式：12 只世界 BOSS（固定方位，本局击杀后不再刷新） */
const WORLD_BOSSES: Array<{ kind: MobKind; x: number; z: number; scale: number }> = [
  { kind: 'boss_zombie', x: 60.5, z: 10.5, scale: 3 },     // 出生点东 60m
  { kind: 'boss_golem', x: -84.5, z: -74.5, scale: 4 },    // 西北约 120m
  { kind: 'boss_spider', x: 0.5, z: 210.5, scale: 3.5 },   // 南 200m
  { kind: 'boss_dragon_flame', x: 0.5, z: 0.5, scale: 4.8 },   // 出生广场中央：烈焰巨龙（被动，不主动攻击）
  { kind: 'boss_titan_lava', x: 32.5, z: 0.5, scale: 3.2 },   // 广场东侧 32m：熔岩泰坦（被动）
  // v2.4「谁最强」三大泰坦：苦力怕 / 铁甲 / 白骨（模型本身 4.5~5m，无需放大）
  { kind: 'titan_creeper', x: -60.5, z: 44.5, scale: 1 },
  { kind: 'titan_iron', x: 60.5, z: 44.5, scale: 1 },
  { kind: 'titan_bone', x: 0.5, z: -86.5, scale: 1 },
  // v2.6 四方神兽：朱雀 / 玄武 / 白虎 / 霸王龙（模型 3~4.7m，缩放后渲染高约 4.5~5m）
  { kind: 'boss_zhuque', x: -104.5, z: 86.5, scale: 1.2 },    // 西北远境：朱雀
  { kind: 'boss_xuanwu', x: 104.5, z: -86.5, scale: 1.45 },   // 东南远境：玄武
  { kind: 'boss_baihu', x: -44.5, z: -128.5, scale: 1.25 },   // 西南：白虎
  { kind: 'boss_rex', x: 52.5, z: 128.5, scale: 1.1 },        // 南偏东：霸王龙
];

/** 第一人称手持模型基准变换（相机局部坐标）：右前方、略微下压、刃口朝右上 */
const VM_POS = { x: 0.09, y: -0.20, z: -0.50 };
const VM_ROT = { x: -12, y: 6, z: -22 };
const VM_SCALE = 0.5;

/** 第三人称右手挂点（手臂局部坐标）：偏向手臂外侧，否则刃身会被手臂方块包住 */
const HAND_POS = { x: 0.13, y: -0.83, z: -0.04 };
/** 第三人称持械时刃身向外倾角（度） */
const HAND_TILT = -14;

interface FxParticle {
  node: Node;
  vel: Vec3;
  ttl: number;
  ttl0: number;
}

/** 飞行中的炸弹（fuse < 0 表示尚未落地） */
interface BombEnt {
  node: Node;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  fuse: number;
}

/** v2.3 斗兽场刷怪队列项：可携带精英标记 / 词缀 / 血量倍率 */
interface SpawnEnt {
  kind: MobKind;
  elite?: boolean;
  affix?: AffixKind;
  hpMul?: number;
}

@ccclass('GameRoot')
export class GameRoot extends Component {
  private world!: World;
  private player!: Player;
  private hud!: Hud;
  private hudNode!: Node;

  private camNode!: Node;
  private cam!: Camera;
  private highlight!: Node;
  private mobs!: MobField;
  private drops!: DropField;

  private state: GameState = 'loading';
  private overlay: HudOverlay = 'none';
  private progress = 0.04;
  private loadTime = 0;
  private orbit = 0.0;

  private readonly keys = new Set<number>();
  private jumpHeld = false;
  private sprintHeld = false;
  private joyX = 0;
  private joyY = 0;

  private joyTouchId = -1;
  private jumpTouchId = -1;
  private lookTouchId = -1;
  private volDragId = -1;
  private lookPrevX = 0;
  private lookPrevY = 0;

  private mouseDrag = false;
  private mouseStartX = 0;
  private mouseStartY = 0;
  private mouseMoved = false;

  /** 快捷栏 7 个武器格（不含常驻石块格） */
  private backpack: Array<BackpackItem | null> = [null, null, null, null, null, null, null];
  /** 当前选中槽：0 = 石块，1~7 = 武器格 */
  private selected = 0;
  private slotFlash = 0;
  private blockName = '';
  private blockNameTimer = 0;
  private hintTimer = 6;
  private viewMode = 0;
  private playerNode: Node | null = null; // 第三人称人物模型
  private armR: Node | null = null;       // 右臂（肩关节旋转轴）
  private handNode: Node | null = null;   // 右手挂点（持械 / 拳头）
  private handMr: MeshRenderer | null = null;
  private viewModel: Node | null = null;  // 第一人称手持模型
  private viewModelMr: MeshRenderer | null = null;
  private switchFxT = 0;                  // 换装模型弹出
  private handItemId = '';

  private target: RayHit | null = null;
  private actionCd = 0;
  private attackCd = 0;
  private swingT = 0;

  // ---------------- 战斗 / 装备 ----------------
  private hp = BASE_HP;
  private invT = 0;          // 复活无敌
  private hurtT = 0;         // 受击红闪
  private shakeT = 0;
  private regenAcc = 0;
  private kills = 0;

  // ---------------- v2.5 大招 ----------------
  /** 三个大招（陨石 / 雷霆 / 冰封）：各自充能，满槽或广告次数可释放 */
  private ults: UltSkill[] = [
    { id: 'meteor', name: '陨石天降', icon: '☄', color: '#FF7043', charge: 0, charges: 0, cd: 0 },
    { id: 'thunder', name: '雷霆万钧', icon: '⚡', color: '#FFEB3B', charge: 0, charges: 0, cd: 0 },
    { id: 'frost', name: '冰封千里', icon: '❄', color: '#81D4FA', charge: 0, charges: 0, cd: 0 },
  ];
  /** 大招充能：每秒多少 %；每次击杀额外加速 */
  private static readonly ULT_TIME_RATE = 1.6;
  private static readonly ULT_KILL_BONUS = 6;
  private static readonly ULT_AD_USES = 3;
  /** 大招全屏演出（HUD 用） */
  private ultShow: { id: string; name: string; color: string; t: number; total: number } | null = null;
  /** 大招延迟触发队列（陨石下落等） */
  private ultTimers: Array<{ t: number; fn: () => void }> = [];
  /** 大招 3D 特效节点 */
  private ultFxList: Array<{ node: Node; t: number; ttl: number; tick: (n: Node, p: number) => void }> = [];

  private equip: Record<SlotId, EquipDef | null> = {
    weapon: null, helmet: null, armor: null, ring: null, tool: null,
  };
  private collectedWeapons: string[] = [];
  /** 物品栏：所有拾取过的装备（按 id 去重，最多 32 件） */
  private inventory: EquipDef[] = [];
  /** 当前人物皮肤索引（SKIN_PRESETS） */
  private skinIndex = 0;
  /** v2.2 皮肤解锁状态：前 2 款免费，其余看广告解锁 */
  private skinUnlocked: boolean[] = SKIN_PRESETS.map((_, i) => i < 2);
  private static readonly SKIN_STORAGE_KEY = 'dogcat_skins_v1';

  // ---------------- v2.0 消耗品 ----------------
  /** 左下角 4 格消耗品栏 */
  private consumables: Array<ConsumableItem | null> = [null, null, null, null];
  /** 护盾点数（先于 HP 扣减） */
  private shield = 0;
  private shieldT = 0;
  /** 能量药水剩余时间（攻速 ×1.8） */
  private energyT = 0;
  /** 已持雷，等待下次攻击键掷出 */
  private bombArmed = false;
  private bombs: BombEnt[] = [];
  private bombMesh: Mesh | null = null;
  /** 最近一次炸弹爆炸的位置 / 命中数 / 击杀数（调试用） */
  private lastBoom: { x: number; y: number; z: number; hit: number; kill: number } | null = null;

  // ---------------- v2.0 毒雾（毒物怪死亡释放） ----------------
  /** 毒雾实体：位置 + 半径 + 剩余时间 + dps */
  private poisonClouds: Array<{ x: number; y: number; z: number; r: number; t: number; dps: number }> = [];
  /** 玩家中毒剩余时间 + 每秒伤害 */
  private poisonT = 0;
  private poisonDps = 0;
  private poisonAcc = 0;

  // ---------------- 波次 ----------------
  private wave = 0;
  private timeLeft = 0;
  private timeMax = 1;
  private betweenT = 0;      // 波次间隔（横幅倒计时）
  private freeT = 0;         // 通关后的自由活动时间（180s，可手动提前进下一波）
  private spawnQueue: SpawnEnt[] = [];
  private spawnT = 0;
  private waveActive = false;
  /** 第 10 波 BOSS 战不限时 */
  private waveNoTimer = false;
  private banner = '';
  private bannerSub = '';
  private bannerT = 0;

  private toasts: ToastMsg[] = [];

  // 宝箱 / 奖励面板
  private chests!: ChestField;
  private reward: ChestReward | null = null;
  private rewardT = 0;
  private chestHint = 0;

  // ---------------- v2.1 双模式：寻宝 / 斗兽场 ----------------
  private mode: 'treasure' | 'arena' = 'treasure';
  /** 进入斗兽场前的寻宝位置（离开回原位） */
  private retX = 0;
  private retY = 0;
  private retZ = 0;
  /** 进场 3s 倒计时（>0 时战斗未开始） */
  private arenaCd = 0;
  /** 寻宝宝箱点位（走近才懒生成实体） */
  private treasureSpots: Array<{ x: number; z: number; ring: number; spawned: boolean }> = [];
  /** 世界 BOSS 是否已生成过（本局一次） */
  private bossSpawned = WORLD_BOSSES.map(() => false);
  /** 斗兽场宝箱二选一：-1 未选 / 0 武器 / 1 装备 */
  private rewardPicked = -1;
  /** 第二件已通过广告领取 */
  private rewardSecond = false;
  /** v2.3 换图后短时间加大区块生成/建模预算，避免一次性同步重建造成卡顿 */
  private mapLoadT = 0;
  /** v2.3 换图过场：剩余时间 / 目标地图 / 生成进度（0~1） */
  private mapSwitchT = 0;
  private mapSwitchDef: MapDef | null = null;
  private mapSwitchProg = 0;

  // 广告
  private adT = 0;
  private adPurpose: AdScene = 'equip';
  private mockAdResolve: ((r: AdResult) => void) | null = null;

  private timeAcc = 0;
  private fov = 85;
  /** 顶部安全区（HUD 虚拟单位）：微信真机避开刘海/胶囊，浏览器为 0 */
  private safeTopU = 0;

  // ---------------- 音频 ----------------
  private musicSrc!: AudioSource;  // BGM（播放列表自动切歌）
  private ambSrc!: AudioSource;    // 环境音（循环）
  private sfxSrc!: AudioSource;    // 短音效（oneShot 混音）
  private readonly clips: Record<string, AudioClip> = {};
  private musicOn = true;          // 音乐开关（持久化）
  private musicVol = 1;            // 音乐音量 0~1（持久化）
  private bgmIdx = 0;              // 当前列表曲目序号
  private bgmCtx = '';             // 当前音频场景 key（state+mode）
  private static readonly AUDIO_STORAGE_KEY = 'dogcat_audio_v1';
  /** 微信分包名（assets/subpkg_audio，存放 BGM，降低主包体积） */
  private static readonly BGM_BUNDLE = 'subpkg_audio';
  private static readonly BGM_NAMES = ['bgm_menu', 'bgm_game', 'bgm_explore', 'bgm_battle'];
  /** 游戏圈按钮当前显隐（null = 尚未同步过） */
  private clubVisible: boolean | null = null;

  /** 广告流程：上一帧状态 / 累计游玩秒数 */
  private adPrevState: GameState = 'loading';
  private playTime = 0;

  // 环境点缀
  private clouds: Array<{ node: Node; speed: number }> = [];
  private fx: FxParticle[] = [];
  private fxMeshes: Mesh[] = [];
  /** v2.0 远程弹道系统 */
  private projectiles!: ProjectileSystem;
  /** v2.0 命中飘字（世界坐标 + 剩余寿命） */
  private readonly dmgTexts: Array<{ x: number; y: number; z: number; t: number; n: number; crit: boolean }> = [];
  /** 按品质色缓存的粒子网格（换装 / 开箱） */
  private readonly fxColorMeshes: Record<string, Mesh> = {};
  private animalT = 5;
  /** v2.2 野外主动动物刷新计时 */
  private wildT = 20;

  // ---------------- v2.3 地图系统 ----------------
  /** 地图解锁进度与选中态（dogcat_map_v1） */
  private mapSave: MapSave = {
    selected: 'grassland',
    chests: { grassland: 0, desert: 0, snow: 0 },
    adUnlocked: { grassland: true, desert: false, snow: false },
  };
  /** 主页地图选择面板开关 */
  private mapPanelOpen = false;
  /** 玩家灼烧 DOT（灼烧词缀怪命中附加） */
  private burnT = 0;
  private burnDps = 0;
  private burnAcc = 0;
  /** 斗兽场最高波次存档（10 波一档 checkpoint） */
  private static readonly ARENA_STORAGE_KEY = 'dogcat_arena_v1';

  private fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;

  private lastW = 0;
  private lastH = 0;
  private readonly spawnX = 0.5;
  private readonly spawnY = ARENA_GROUND_Y + 1.02;
  private readonly spawnZ = 10.5;

  private readonly tmpDir = new Vec3();
  private readonly tmpLook = new Vec3();
  private readonly tmpUiWorld = new Vec3();
  private readonly tmpUiPos = new Vec3();

  onLoad(): void {
    view.setDesignResolutionSize(DESIGN_W, DESIGN_H, ResolutionPolicy.FIXED_WIDTH);
  }

  start(): void {
    profiler.hideStats(); // 关闭 FPS 性能调试面板
    this.mapSave = loadMapSave();
    // v2.3.1 回退单一地图：忽略存档选中项，固定使用草原
    this.mapSave.selected = 'grassland';
    this.setupCameras();
    this.setupEnvironment();
    this.setupWorld();
    this.setupHud();
    this.bindInput();
    this.buildPlayerModel();
    this.buildViewModel();
    this.updateHandModel();
    this.player.spawn(this.spawnX, this.spawnY, this.spawnZ);
    this.loadSkinUnlocks();
    this.applyMapEnv();
    this.blockName = BlockNames[HOTBAR_BLOCKS[2]]; // STONE
    (globalThis as any).__game = this;
    this.detectSafeArea();
    this.setupAudio();
    initGameClub();
    // 预热激励 / 插屏 / 原生模板广告，降低首次点击与菜单展示的等待
    preloadAds();

    // 异步加载怪物脸部贴图（resources/mobface/*.png），完成后给场上生物补贴
    // 注意：loadDir 返回的 ImageAsset.name 为空，故按名称逐个加载
    const FACE_NAMES: MobKind[] = ['zombie', 'skeleton', 'boss', 'creeper', 'spider', 'slime'];
    let faceLoaded = 0;
    for (const name of FACE_NAMES) {
      resources.load(`mobface/${name}`, ImageAsset, (err, img) => {
        faceLoaded++;
        if (!err && img) {
          const tex = new Texture2D();
          tex.image = img;
          tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
          FACE_TEXTURES.set(name, tex);
        }
        if (faceLoaded >= FACE_NAMES.length) {
          for (const m of this.mobs.mobs) m.attachFace();
        }
      });
    }
  }

  onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.off(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
    // 释放广告实例与待展示定时器，避免泄漏
    disposeAds();
  }

  // ---------------- 音频 ----------------
  private setupAudio(): void {
    this.musicSrc = this.node.addComponent(AudioSource);
    this.ambSrc = this.node.addComponent(AudioSource);
    this.sfxSrc = this.node.addComponent(AudioSource);
    this.musicSrc.loop = false;
    this.ambSrc.loop = true;
    this.ambSrc.volume = 0.3;
    this.loadAudioSettings();
    this.applyMusicVolume();
    // 一首播完自动切列表下一首（单曲列表即单曲循环效果）
    this.musicSrc.node.on(AudioSource.EventType.ENDED, () => {
      this.bgmIdx++;
      this.playBgmCurrent();
    });
    // 主包内音频（环境音 + 音效）
    const NAMES = [
      'ambient',
      'sfx_start', 'sfx_swing', 'sfx_hit', 'sfx_hurt',
      'sfx_pickup', 'sfx_switch', 'sfx_chest', 'sfx_win',
      // v2.5 新怪物攻击音效：铁傀儡重击 / 杀人蜂突刺 / 雪傀儡投雪
      'sfx_golem', 'sfx_bee', 'sfx_snow',
      // v2.6 恐龙吼叫
      'sfx_roar',
    ];
    for (const n of NAMES) {
      resources.load(`audio/${n}`, AudioClip, (err, clip) => {
        if (err || !clip) return;
        this.clips[n] = clip;
        // 资源晚到时补播当前 BGM
        if (!this.musicSrc.playing && this.musicOn) this.playBgmCurrent();
      });
    }
    // BGM 放在微信分包 subpkg_audio 中，减少主包体积（主包 ≤4MB）
    assetManager.loadBundle(GameRoot.BGM_BUNDLE, (err, bundle) => {
      if (err || !bundle) return;
      for (const n of GameRoot.BGM_NAMES) {
        bundle.load(`audio/${n}`, AudioClip, (e, clip) => {
          if (e || !clip) return;
          this.clips[n] = clip;
          if (!this.musicSrc.playing && this.musicOn) this.playBgmCurrent();
        });
      }
    });
  }

  /** 当前场景应有的 BGM 播放列表 */
  private desiredPlaylist(): string[] {
    if (this.state === 'playing') {
      return this.mode === 'arena' ? ['bgm_battle', 'bgm_game'] : ['bgm_game', 'bgm_explore'];
    }
    return ['bgm_menu'];
  }

  /** 播放列表中当前曲目（musicOn 关闭时保持静音） */
  private playBgmCurrent(): void {
    if (!this.musicOn) {
      if (this.musicSrc.playing) this.musicSrc.stop();
      return;
    }
    const list = this.desiredPlaylist();
    const c = this.clips[list[this.bgmIdx % list.length]];
    if (!c) return;
    if (this.musicSrc.clip !== c) this.musicSrc.clip = c;
    this.musicSrc.volume = 0.35 * this.musicVol;
    this.musicSrc.play();
  }

  /** 音乐开关（HUD 按钮 / 暂停面板共用） */
  toggleMusic(): void {
    this.musicOn = !this.musicOn;
    if (!this.musicOn) {
      if (this.musicSrc.playing) this.musicSrc.stop();
    } else {
      this.playBgmCurrent();
    }
    this.saveAudioSettings();
  }

  /** 音乐音量 0~1（暂停面板滑条调用） */
  setMusicVol(v: number): void {
    this.musicVol = Math.max(0, Math.min(1, v));
    this.applyMusicVolume();
    this.saveAudioSettings();
  }
  getMusicOn(): boolean { return this.musicOn; }
  getMusicVol(): number { return this.musicVol; }
  private applyMusicVolume(): void {
    this.musicSrc.volume = 0.35 * this.musicVol;
  }
  private loadAudioSettings(): void {
    try {
      const raw = sys.localStorage.getItem(GameRoot.AUDIO_STORAGE_KEY);
      if (raw) {
        const j = JSON.parse(raw);
        if (typeof j.on === 'boolean') this.musicOn = j.on;
        if (typeof j.vol === 'number') this.musicVol = Math.max(0, Math.min(1, j.vol));
      }
    } catch { /* 存档损坏时忽略，用默认值 */ }
  }
  private saveAudioSettings(): void {
    try {
      sys.localStorage.setItem(GameRoot.AUDIO_STORAGE_KEY, JSON.stringify({ on: this.musicOn, vol: this.musicVol }));
    } catch { /* 存储失败不影响游戏 */ }
  }

  private playAmbient(): void {
    const c = this.clips['ambient'];
    if (!c || this.ambSrc.clip === c) return;
    this.ambSrc.clip = c;
    this.ambSrc.play();
  }

  private playSfx(name: string, vol = 1): void {
    const c = this.clips[name];
    if (c) this.sfxSrc.playOneShot(c, vol);
  }

  /** v2.5 新怪物专属音效（攻击 / 死亡共用，音量区分） */
  private mobSfxName(kind: string): string | null {
    if (kind === 'iron_golem') return 'sfx_golem';
    if (kind === 'bee') return 'sfx_bee';
    if (kind === 'snow_golem') return 'sfx_snow';
    // v2.6 恐龙系统一使用低沉吼叫
    if (kind === 'triceratops' || kind === 'raptor' || kind === 'ptera') return 'sfx_roar';
    return null;
  }

  /** 广告流程：结算 / 返回主页时延迟弹插屏；主页展示原生模板广告 */
  private updateAdFlow(d: number): void {
    if (this.state === 'playing') this.playTime += d;

    const prev = this.adPrevState;
    if (this.state !== prev) {
      this.adPrevState = this.state;
      // 对局结算（死亡 / 超时失败）与返回主页时延迟弹插屏；
      // 若玩家先点了激励视频复活，Ad 模块的 busy 互斥会自动跳过插屏
      const settled = this.state === 'dead' || this.state === 'fail';
      const home = this.state === 'menu' && prev !== 'menu' && prev !== 'loading';
      if (settled || home) {
        showInterstitialLater(this.playTime, 1800,
          () => this.state === 'dead' || this.state === 'fail' || this.state === 'menu');
      }
    }

    // 原生模板广告仅在主页菜单展示，进入战斗立即隐藏
    setNativeAdVisible(this.state === 'menu');
  }

  /** 场景/模式切换时自动切换 BGM 列表与环境音 */
  private updateAudioState(): void {
    let ctx = this.bgmCtx;
    if (this.state === 'playing') ctx = 'play:' + this.mode;
    else if (this.state === 'menu' || this.state === 'loading') ctx = 'menu';
    if (ctx !== this.bgmCtx) {
      this.bgmCtx = ctx;
      this.bgmIdx = 0;
      this.playBgmCurrent();
    }
    if (this.state === 'playing') {
      this.playAmbient();
    } else if (this.state === 'menu' || this.state === 'loading') {
      if (this.ambSrc.playing) this.ambSrc.stop();
    }
  }

  /** 顶部安全区：引擎安全区 + 微信胶囊按钮取较大值，微信平台再额外下移留白；浏览器为 0 */
  private detectSafeArea(): void {
    let top = 0;
    // 引擎安全区（设计分辨率坐标系，与 HUD 虚拟坐标一致，浏览器返回全屏即 0）
    try {
      const r = view.getSafeAreaRect();
      const dh = view.getDesignResolutionSize().height;
      if (r) top = Math.max(top, dh - (r.y + r.height));
    } catch { /* ignore */ }
    // 微信胶囊按钮悬浮在游戏之上（不属于安全区），需要额外读取避让
    try {
      const wxObj = (globalThis as any).wx;
      if (wxObj) {
        const vis = view.getVisibleSize();
        const landscape = vis.width > vis.height;
        if (wxObj.getMenuButtonBoundingClientRect && !landscape) {
          const menu = wxObj.getMenuButtonBoundingClientRect();
          const info = wxObj.getWindowInfo
            ? wxObj.getWindowInfo()
            : (wxObj.getSystemInfoSync ? wxObj.getSystemInfoSync() : null);
          if (menu && menu.bottom && info && info.screenWidth) {
            top = Math.max(top, (menu.bottom + 4) * (DESIGN_W / info.screenWidth));
          }
        }
        // 竖屏：至少避开状态栏（72u 保底），并额外下移留白
        // 横屏：胶囊在右上角，HUD 顶部行本身留了 52u，不能再叠加竖屏状态栏高度，
        //       否则血条/波次面板/功能键会被整体压到画面中部（并压住宝剑按钮）
        if (!landscape) top = Math.max(top, 72) + 16;
      }
    } catch { /* ignore */ }
    this.safeTopU = Math.round(top);
    console.log('[HUD] safeTopU =', this.safeTopU);
  }

  // ---------------- 场景搭建 ----------------
  private setupCameras(): void {
    const uiCam = this.node.getChildByName('Camera')?.getComponent(Camera);
    if (uiCam) {
      uiCam.priority = 100;
      uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
      uiCam.visibility = Layers.Enum.UI_2D;
    }

    const sceneRoot = director.getScene()!;
    this.camNode = new Node('VoxelCamera');
    this.camNode.parent = sceneRoot;
    this.cam = this.camNode.addComponent(Camera);
    this.cam.projection = Camera.ProjectionType.PERSPECTIVE;
    this.cam.fov = 85;
    this.cam.near = 0.05;
    this.cam.far = 220;
    this.cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.cam.clearColor = SKY;
    this.cam.visibility = Layers.Enum.DEFAULT;
    this.cam.priority = 0;
  }

  private setupEnvironment(): void {
    const scene = director.getScene()!;
    const fog = scene.globals.fog;
    fog.enabled = true;
    fog.type = FogInfo.FogType.LINEAR;
    fog.fogColor = new Color(SKY.r, SKY.g, SKY.b, 255);
    fog.fogStart = 28;
    fog.fogEnd = 74;
    fog.accurate = true;

    this.applyCameraLook(new Vec3(0, 25, 0), new Vec3(0.6, 24.4, 13.5));
  }

  /** 第三人称玩家模型（方块人）：皮肤配色 + 右臂独立挥砍 + 持械挂点 */
  private buildPlayerModel(): void {
    const sceneRoot = director.getScene()!;
    const node = new Node('PlayerModel');
    node.parent = sceneRoot;

    const preset = SKIN_PRESETS[Math.min(this.skinIndex, SKIN_PRESETS.length - 1)];
    const skin = preset.skin;
    const shirt = preset.shirt;
    const pants = preset.pants;
    const shoes = preset.shoes;

    const boxes: BoxDef[] = [
      { x: -0.26, y: 0, z: -0.13, w: 0.24, h: 0.75, d: 0.26, color: pants },
      { x: 0.02, y: 0, z: -0.13, w: 0.24, h: 0.75, d: 0.26, color: pants },
      { x: -0.26, y: 0, z: -0.13, w: 0.24, h: 0.12, d: 0.28, color: shoes },
      { x: 0.02, y: 0, z: -0.13, w: 0.24, h: 0.12, d: 0.28, color: shoes },
      { x: -0.28, y: 0.75, z: -0.15, w: 0.56, h: 0.72, d: 0.3, color: shirt },
      { x: -0.44, y: 0.78, z: -0.12, w: 0.16, h: 0.66, d: 0.24, color: shirt },
      { x: -0.44, y: 0.62, z: -0.12, w: 0.16, h: 0.16, d: 0.24, color: skin },
      { x: -0.25, y: 1.47, z: -0.25, w: 0.5, h: 0.5, d: 0.5, color: skin },
      { x: -0.26, y: 1.9, z: -0.26, w: 0.52, h: 0.1, d: 0.52, color: '#3E2723' },
    ];
    // 脸部贴片：正反两面各一层 0.008 厚的薄片
    const face: Array<{ x: number; y: number; w: number; h: number; color: string }> = [
      { x: -0.155, y: 1.66, w: 0.095, h: 0.1, color: '#2B1B12' },
      { x: 0.06, y: 1.66, w: 0.095, h: 0.1, color: '#2B1B12' },
      { x: -0.14, y: 1.72, w: 0.035, h: 0.035, color: '#FFFFFF' },
      { x: 0.075, y: 1.72, w: 0.035, h: 0.035, color: '#FFFFFF' },
      { x: -0.175, y: 1.782, w: 0.115, h: 0.028, color: '#5D4037' },
      { x: 0.06, y: 1.782, w: 0.115, h: 0.028, color: '#5D4037' },
      { x: -0.07, y: 1.535, w: 0.14, h: 0.036, color: '#7B3F32' },
      { x: -0.118, y: 1.566, w: 0.05, h: 0.03, color: '#7B3F32' },
      { x: 0.068, y: 1.566, w: 0.05, h: 0.03, color: '#7B3F32' },
    ];
    for (const z of [-0.258, 0.25]) {
      for (const f of face) boxes.push({ ...f, z, d: 0.008 });
    }

    const mr = node.addComponent(MeshRenderer);
    mr.mesh = buildBoxesMesh(boxes);
    mr.setSharedMaterial(getVoxMaterial(), 0);

    // 右臂（肩关节）：持械 / 挥砍
    const arm = new Node('ArmR');
    arm.parent = node;
    arm.setPosition(0.36, 1.44, 0);
    const armMr = arm.addComponent(MeshRenderer);
    armMr.mesh = buildBoxesMesh([
      { x: -0.08, y: -0.66, z: -0.12, w: 0.16, h: 0.66, d: 0.24, color: shirt },
      { x: -0.08, y: -0.82, z: -0.12, w: 0.16, h: 0.16, d: 0.24, color: skin },
    ]);
    armMr.setSharedMaterial(getVoxMaterial(), 0);

    const hand = new Node('HandWeapon');
    hand.parent = arm;
    hand.setPosition(HAND_POS.x, HAND_POS.y, HAND_POS.z);
    hand.setRotationFromEuler(0, 0, 0);
    const hmr = hand.addComponent(MeshRenderer);
    hmr.mesh = buildBoxesMesh(fistBoxes());
    hmr.setSharedMaterial(getVoxMaterial(), 0);
    hand.setScale(0.85, 0.85, 0.85);

    node.setPosition(this.spawnX, this.spawnY, this.spawnZ);
    node.active = false;
    this.playerNode = node;
    this.armR = arm;
    this.handNode = hand;
    this.handMr = hmr;
    this.handItemId = '';
  }
/** 第一人称手持模型（挂在相机下方，Minecraft 风格举在右前方，需高于底部快捷栏） */
  private buildViewModel(): void {
    const view = new Node('ViewModel');
    view.parent = this.camNode;
    view.setPosition(VM_POS.x, VM_POS.y, VM_POS.z);
    view.setRotationFromEuler(VM_ROT.x, VM_ROT.y, VM_ROT.z);
    const mr = view.addComponent(MeshRenderer);
    mr.mesh = buildBoxesMesh(fistBoxes());
    mr.setSharedMaterial(getVoxMaterial(), 0);
    view.setScale(VM_SCALE, VM_SCALE, VM_SCALE);
    this.viewModel = view;
    this.viewModelMr = mr;
  }

  /** 当前手持武器（背包选中槽）；空手返回 null */
  private get handItem(): BackpackItem | null {
    return this.selected > 0 ? this.backpack[this.selected - 1] : null;
  }

  /** 同步第一/第三人称手持模型（网格 + 第三人称持械朝向 + 缩放基准） */
  private updateHandModel(): void {
    const item = this.handItem;
    const id = item ? item.def.id : '';
    if (id !== this.handItemId) {
      this.handItemId = id;
      const mesh = buildBoxesMesh(item ? handBoxes(item.def) : fistBoxes());
      if (this.handMr) this.handMr.mesh = mesh;
      if (this.viewModelMr) this.viewModelMr.mesh = mesh;
      // 第三人称：挂点在手臂外侧，持械时刃身再向外倾 14°
      if (this.handNode) {
        const s = item ? 1.3 : 0.85;
        this.handNode.setPosition(item ? HAND_POS.x : 0.09, HAND_POS.y, HAND_POS.z);
        this.handNode.setRotationFromEuler(0, 0, item ? HAND_TILT : 0);
        this.handNode.setScale(s, s, s);
      }
      this.switchFxT = 0.15;
    }
  }

  /** 换装特效：品质粒子 + 槽位白闪 */
  private switchWeaponFx(color: string): void {
    this.slotFlash = 0.2;
    this.playSfx('sfx_switch', 0.8);
    const p = this.handWorldPos();
    for (let i = 0; i < 12; i++) {
      this.spawnFxColor(p.x, p.y, p.z, color);
    }
  }

  /** 手部世界坐标（用于粒子起点） */
  private handWorldPos(): Vec3 {
    if (this.viewMode === 1 && this.playerNode) {
      return new Vec3(this.playerNode.position.x + 0.3, this.playerNode.position.y + 1.1, this.playerNode.position.z);
    }
    const dir = this.player.forward(this.tmpDir);
    return new Vec3(
      this.player.eyeX + dir.x * 0.8,
      this.player.eyeY - 0.25 + dir.y * 0.8,
      this.player.eyeZ + dir.z * 0.8,
    );
  }

  private setupWorld(): void {
    const sceneRoot = director.getScene()!;
    const worldNode = new Node('VoxelWorld');
    worldNode.parent = sceneRoot;
    worldNode.layer = Layers.Enum.DEFAULT;

    const distance = sys.isMobile ? 3 : 4;
    this.world = new World(worldNode, distance);
    this.world.mapDef = MAPS[this.mapSave.selected];
    this.player = new Player();

    const mobNode = new Node('Mobs');
    mobNode.parent = worldNode;
    this.mobs = new MobField(mobNode, this.world);
    this.projectiles = new ProjectileSystem(worldNode, this.world);

    const dropNode = new Node('Drops');
    dropNode.parent = worldNode;
    this.drops = new DropField(dropNode);

    const chestNode = new Node('Chests');
    chestNode.parent = worldNode;
    this.chests = new ChestField(chestNode);

    // 选中方块的高亮框
    this.highlight = new Node('Highlight');
    this.highlight.parent = worldNode;
    const mr = this.highlight.addComponent(MeshRenderer);
    mr.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
    const mat = new Material();
    mat.initialize({ effectName: 'builtin-unlit', technique: 1 });
    mat.setProperty('mainTexture', createSolidTexture());
    mat.setProperty('mainColor', new Color(255, 255, 255, 105));
    mr.setSharedMaterial(mat, 0);
    this.highlight.setScale(1.02, 1.02, 1.02);
    this.highlight.active = false;

    this.setupSky(worldNode);
  }

  /** 太阳 + 漂浮云（画面优化） */
  private setupSky(parent: Node): void {
    const sun = new Node('Sun');
    sun.parent = parent;
    const sunMr = sun.addComponent(MeshRenderer);
    sunMr.mesh = buildBoxesMesh([{ x: -3, y: -3, z: -0.4, w: 6, h: 6, d: 0.8, color: '#FFE082' }]);
    sunMr.setSharedMaterial(getVoxMaterial(), 0);
    sun.setPosition(36, 58, -62);

    const cloudMat = getVoxGhostMaterial(190);
    for (let i = 0; i < 9; i++) {
      const w = 4 + Math.random() * 6;
      const d = 3 + Math.random() * 3;
      const node = new Node('Cloud');
      node.parent = parent;
      const cmr = node.addComponent(MeshRenderer);
      cmr.mesh = buildBoxesMesh([
        { x: -w / 2, y: 0, z: -d / 2, w, h: 0.9, d, color: '#FFFFFF' },
        { x: -w / 4, y: 0.9, z: -d / 4, w: w / 2, h: 0.6, d: d / 2, color: '#F5F8FF' },
      ]);
      cmr.setSharedMaterial(cloudMat, 0);
      node.setPosition((Math.random() - 0.5) * 140, 44 + Math.random() * 8, (Math.random() - 0.5) * 140);
      this.clouds.push({ node, speed: 0.5 + Math.random() * 0.5 });
    }

    // 粒子特效的三种共享小方块
    this.fxMeshes = ['#FFFFFF', '#FF8A3D', '#9E9E9E'].map((c) =>
      buildBoxesMesh([{ x: -0.09, y: -0.09, z: -0.09, w: 0.18, h: 0.18, d: 0.18, color: c }]));
  }

  private setupHud(): void {
    this.hudNode = new Node('HUD');
    this.hudNode.layer = Layers.Enum.UI_2D;
    this.hudNode.parent = this.node;
    this.hudNode.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
    this.hudNode.setPosition(0, 0, 0);
    this.hud = new Hud(this.hudNode);
    this.relayout();
  }

  private relayout(): void {
    const vis = view.getVisibleSize();
    this.lastW = vis.width;
    this.lastH = vis.height;
    const ut = this.hudNode.getComponent(UITransform)!;
    ut.setContentSize(vis.width, vis.height);
    this.hudNode.setPosition(0, 0, 0);
    this.hud.setSize(vis.width, vis.height);
  }

  // ---------------- 输入 ----------------
  private bindInput(): void {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
  }

  private toVirtual(x: number, y: number): { x: number; y: number } {
    const ut = this.hudNode.getComponent(UITransform)!;
    const out = new Vec3();
    ut.convertToNodeSpaceAR(new Vec3(x, y, 0), out);
    const vis = view.getVisibleSize();
    return { x: out.x + vis.width / 2, y: vis.height / 2 - out.y };
  }

  private onKeyDown(e: EventKeyboard): void {
    const k = Number(e.keyCode);
    if (this.keys.has(k)) return;
    this.keys.add(k);

    if (this.overlay === 'ad') return;

    if (k === KEY.ESC) {
      if (this.overlay === 'character') this.overlay = 'none';
      else if (this.state === 'playing') this.state = 'paused';
      else if (this.state === 'paused') this.state = 'playing';
      return;
    }
    if (this.state === 'menu' && (k === KEY.SPACE || k === KEY.ENTER)) {
      this.beginPlay();
      return;
    }
    if (this.state !== 'playing' || this.overlay !== 'none') return;

    if (k === KEY.SPACE) this.jumpHeld = true;
    if (k === KEY.SHIFT) this.sprintHeld = true;
    if (k === KEY.R) this.player.spawn(this.spawnX, this.spawnY, this.spawnZ);
    if (k === KEY.F || k === KEY.J) this.tryAttack();
    if (k === KEY.E) this.overlay = 'character';
    if (k >= 49 && k <= 56) this.selectSlot(k - 49);
    if (k === KEY.Q) this.useConsumable(0);
    if (k === KEY.T) this.useConsumable(1);
    if (k === KEY.Z) this.useConsumable(2);
    if (k === KEY.X) this.useConsumable(3);
  }

  private onKeyUp(e: EventKeyboard): void {
    const k = Number(e.keyCode);
    this.keys.delete(k);
    if (k === KEY.SPACE) this.jumpHeld = false;
    if (k === KEY.SHIFT) this.sprintHeld = false;
  }

  private onTouchStart(e: EventTouch): void {
    const p = e.getUILocation();
    const v = this.toVirtual(p.x, p.y);
    const id = e.getID() ?? -1;

    if (this.overlay === 'ad') return;
    // 换图过场期间屏蔽操作，避免误触
    if (this.mapSwitchT > 0) return;
    if (this.state !== 'playing' || this.overlay !== 'none') {
      this.uiPress(v.x, v.y, id);
      return;
    }

    const hit = this.hud.hitTest(v.x, v.y);
    if (hit === 'jump') {
      // 跳跃用独立的触摸 ID，不再抢占摇杆的 joyTouchId，避免前进+跳跃互相打断
      this.jumpHeld = true;
      this.jumpTouchId = id;
      return;
    }
    if (hit === 'attack') {
      this.tryAttack();
      return;
    }
    if (hit === 'place') {
      this.placeBlock();
      return;
    }
    if (hit === 'break') {
      this.breakBlock();
      return;
    }
    if (hit === 'pause') {
      this.state = 'paused';
      this.jumpHeld = false;
      return;
    }
    if (hit === 'char') {
      this.overlay = 'character';
      this.jumpHeld = false;
      return;
    }
    if (hit === 'bag') {
      this.overlay = 'bag';
      this.jumpHeld = false;
      return;
    }
    if (hit === 'view') {
      this.toggleViewMode();
      return;
    }
    if (hit === 'music') {
      // 右上角音乐开关按钮
      this.toggleMusic();
      return;
    }
    if (hit === 'legend') {
      this.onLegendClick();
      return;
    }
    if (hit === 'mapBtn') {
      this.mapPanelOpen = true;
      this.jumpHeld = false;
      return;
    }
    if (hit === 'mapClose') {
      this.mapPanelOpen = false;
      return;
    }
    if (hit && hit.startsWith('mapCard')) {
      this.selectMapCard(Number(hit.slice(7)));
      return;
    }
    if (hit === 'challenge') {
      // 寻宝模式：点顶部「挑战斗兽场」进入斗兽场
      console.log('[TOUCH] challenge hit state=' + this.state + ' mode=' + this.mode);
      if (this.state === 'playing' && this.mode === 'treasure') {
        try { this.enterArena(); }
        catch (err) { console.error('[ARENA] enterArena error:', err); }
      }
      return;
    }
    if (hit === 'leaveArena') {
      // 自由时间离开斗兽场
      if (this.state === 'playing' && this.mode === 'arena' && this.freeT > 0) this.leaveArena();
      return;
    }
    if (hit && hit.startsWith('cons')) {
      // 左侧 Q/T/Z/X 消耗品栏：触摸直接使用
      this.useConsumable(parseInt(hit.slice(4), 10));
      return;
    }
    if (hit === 'nextWave') {
      // 自由时间内手动进入下一波
      if (this.freeT > 0) this.nextWave();
      return;
    }
    if (hit && hit.startsWith('slot')) {
      this.selectSlot(parseInt(hit.slice(4), 10));
      return;
    }
    if (hit && hit.startsWith('ultAd')) {
      // 技能键右下角广告徽标：看完解锁该技能 3 次
      this.openAd('ult', () => this.grantUltCharges(parseInt(hit.slice(5), 10)));
      return;
    }
    if (hit && hit.startsWith('ult')) {
      // 左下大招圆钮：释放技能
      this.castUlt(parseInt(hit.slice(3), 10));
      return;
    }
    if (hit === 'joy') {
      this.joyTouchId = id;
      this.updateJoystick(v.x, v.y);
      return;
    }

    this.lookTouchId = id;
    this.lookPrevX = v.x;
    this.lookPrevY = v.y;
  }

  private onTouchMove(e: EventTouch): void {
    const p = e.getUILocation();
    const v = this.toVirtual(p.x, p.y);
    const id = e.getID();

    if (id === this.volDragId && this.volDragId !== -1) {
      // 暂停面板音量滑条拖动
      this.applyVolFromX(v.x);
      return;
    }
    if (id === this.joyTouchId) {
      this.updateJoystick(v.x, v.y);
      return;
    }
    if (id === this.lookTouchId && this.state === 'playing' && this.overlay === 'none') {
      const dx = v.x - this.lookPrevX;
      const dy = v.y - this.lookPrevY;
      this.lookPrevX = v.x;
      this.lookPrevY = v.y;
      this.applyLook(dx, dy, 0.0052);
    }
  }

  private onTouchEnd(e: EventTouch): void {
    const id = e.getID();
    if (id === this.volDragId) this.volDragId = -1;
    if (id === this.jumpTouchId) {
      this.jumpTouchId = -1;
      this.jumpHeld = false;
    }
    if (id === this.joyTouchId) {
      this.joyTouchId = -1;
      this.joyX = 0;
      this.joyY = 0;
    }
    if (id === this.lookTouchId) this.lookTouchId = -1;
  }

  private onMouseDown(e: EventMouse): void {
    const p = e.getUILocation();
    const v = this.toVirtual(p.x, p.y);

    if (this.overlay === 'ad') return;
    if (this.mapSwitchT > 0) return;
    if (this.state !== 'playing' || this.overlay !== 'none') {
      this.uiPress(v.x, v.y);
      return;
    }

    const hit = this.hud.hitTest(v.x, v.y);
    if (hit) {
      if (hit === 'place') this.placeBlock();
      else if (hit === 'break') this.breakBlock();
      else if (hit === 'attack') this.tryAttack();
      else if (hit === 'pause') this.state = 'paused';
      else if (hit === 'char') this.overlay = 'character';
      else if (hit === 'bag') this.overlay = 'bag';
      else if (hit === 'jump') this.jumpHeld = true;
      else if (hit === 'view') this.toggleViewMode();
      else if (hit === 'music') this.toggleMusic();
      else if (hit === 'legend') this.onLegendClick();
      else if (hit === 'mapBtn') this.mapPanelOpen = true;
      else if (hit === 'mapClose') this.mapPanelOpen = false;
      else if (hit.startsWith('mapCard')) this.selectMapCard(Number(hit.slice(7)));
      else if (hit === 'challenge') { if (this.state === 'playing' && this.mode === 'treasure') this.enterArena(); }
      else if (hit === 'leaveArena') { if (this.state === 'playing' && this.mode === 'arena' && this.freeT > 0) this.leaveArena(); }
      else if (hit === 'nextWave') { if (this.freeT > 0) this.nextWave(); }
      else if (hit.startsWith('cons')) this.useConsumable(parseInt(hit.slice(4), 10));
      else if (hit.startsWith('slot')) this.selectSlot(parseInt(hit.slice(4), 10));
      else if (hit.startsWith('ultAd')) this.openAd('ult', () => this.grantUltCharges(parseInt(hit.slice(5), 10)));
      else if (hit.startsWith('ult')) this.castUlt(parseInt(hit.slice(3), 10));
      return;
    }

    const button = e.getButton();
    if (button === 2) {
      this.breakBlock();
      return;
    }
    if (button === 0) {
      this.mouseDrag = true;
      this.mouseMoved = false;
      this.mouseStartX = v.x;
      this.mouseStartY = v.y;
      this.lookPrevX = v.x;
      this.lookPrevY = v.y;
    }
  }

  private onMouseMove(e: EventMouse): void {
    if (!this.mouseDrag || this.state !== 'playing' || this.overlay !== 'none') return;
    const p = e.getUILocation();
    const v = this.toVirtual(p.x, p.y);
    const dx = v.x - this.lookPrevX;
    const dy = v.y - this.lookPrevY;
    this.lookPrevX = v.x;
    this.lookPrevY = v.y;

    if (Math.abs(v.x - this.mouseStartX) + Math.abs(v.y - this.mouseStartY) > 6) this.mouseMoved = true;
    this.applyLook(dx, dy, 0.0042);
  }

  private onMouseUp(e: EventMouse): void {
    if (this.state === 'playing' && this.overlay === 'none' &&
        this.mouseDrag && !this.mouseMoved && e.getButton() === 0) {
      // 左键点按：优先攻击面前生物，否则放置方块
      if (!this.tryAttack()) this.placeBlock();
    }
    this.mouseDrag = false;
  }

  private onMouseWheel(e: EventMouse): void {
    if (this.state !== 'playing' || this.overlay !== 'none') return;
    const dir = e.getScrollY() > 0 ? 1 : -1;
    // 只在「石块 + 已有武器」的槽位之间循环
    const list: number[] = [0];
    for (let i = 0; i < this.backpack.length; i++) if (this.backpack[i]) list.push(i + 1);
    let idx = list.indexOf(this.selected);
    if (idx < 0) idx = 0;
    idx = (idx + dir + list.length) % list.length;
    this.selectSlot(list[idx]);
  }

  private applyLook(dx: number, dy: number, sens: number): void {
    this.player.yaw -= dx * sens;
    this.player.pitch += dy * sens * 0.9;
    const lim = 1.45;
    if (this.player.pitch > lim) this.player.pitch = lim;
    if (this.player.pitch < -lim) this.player.pitch = -lim;
  }

  private updateJoystick(x: number, y: number): void {
    const c = this.hud.joyCenter;
    const r = this.hud.joyR * 1.05;
    let nx = (x - c.x) / r;
    let ny = (y - c.y) / r;
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
    }
    if (len < 0.12) {
      nx = 0;
      ny = 0;
    }
    this.joyX = nx;
    this.joyY = ny;
  }

  /** 暂停面板音量滑条：由虚拟 x 坐标反推音量 */
  private applyVolFromX(x: number): void {
    const b = this.hud.volBar;
    if (b.w <= 0) return;
    this.setMusicVol((x - b.x) / b.w);
  }

  private uiPress(x: number, y: number, touchId = -1): void {
    const hit = this.hud.hitTest(x, y);
    if (!hit) return;
    if (hit === 'start') this.beginPlay();
    else if (hit === 'mapBtn') {
      this.mapPanelOpen = true;
      return;
    } else if (hit === 'mapClose') {
      this.mapPanelOpen = false;
      return;
    } else if (hit.startsWith('mapCard')) {
      this.selectMapCard(Number(hit.slice(7)));
      return;
    }
    else if (hit === 'nextWave') {
      // 自由时间内手动进入下一波
      if (this.state === 'playing' && this.freeT > 0) this.nextWave();
      return;
    }
    else if (hit === 'resume') this.state = 'playing';
    else if (hit === 'musT') {
      // 暂停面板：音乐开关
      this.toggleMusic();
    } else if (hit === 'volBar') {
      // 暂停面板：音量滑条按下并进入拖动
      this.volDragId = touchId;
      this.applyVolFromX(x);
    }
    else if (hit === 'home' || hit === 'failHome') {
      this.state = 'menu';
      this.overlay = 'none';
      this.mobs.clear();
      this.drops.clear();
      this.player.spawn(this.spawnX, this.spawnY, this.spawnZ);
    } else if (hit === 'restart') {
      this.state = 'menu';
      this.overlay = 'none';
      this.mobs.clear();
      this.drops.clear();
      this.player.spawn(this.spawnX, this.spawnY, this.spawnZ);
    } else if (hit === 'adRevive') {
      this.openAd('revive', () => this.reviveByAd());
    } else if (hit === 'retryWave') {
      this.retryWave();
    } else if (hit === 'closeChar') {
      this.overlay = 'none';
    } else if (hit === 'closeBag') {
      this.overlay = 'none';
    } else if (hit.startsWith('skin')) {
      this.applySkin(parseInt(hit.slice(4), 10));
    } else if (hit.startsWith('inv')) {
      this.equipFromInventory(parseInt(hit.slice(3), 10));
    } else if (hit === 'adEquip') {
      this.openAd('equip', () => this.grantAdEquip());
    } else if (hit === 'adBag') {
      this.openAd('bag', () => this.grantBagAdEquip());
    } else if (hit === 'rewardClose') {
      this.closeReward();
    } else if (hit === 'pickW') {
      this.pickReward(0);
    } else if (hit === 'pickE') {
      this.pickReward(1);
    } else if (hit === 'adSecond') {
      this.claimSecondReward();
    } else if (hit === 'challenge') {
      // v2.1 寻宝模式：HUD 挑战按钮进斗兽场
      if (this.state === 'playing' && this.mode === 'treasure') this.enterArena();
    } else if (hit === 'leaveArena') {
      // v2.1 自由时间离开斗兽场
      if (this.state === 'playing' && this.mode === 'arena' && this.freeT > 0) this.leaveArena();
    } else if (hit.startsWith('cons')) {
      this.useConsumable(parseInt(hit.slice(4), 10));
    } else if (hit === 'legend') {
      this.onLegendClick();
    } else if (hit.startsWith('ultAd')) {
      // 大招广告：看完 +3 次释放
      if (this.state === 'playing' && this.overlay === 'none') {
        const idx = parseInt(hit.slice(5), 10);
        this.openAd('ult', () => this.grantUltCharges(idx));
      }
    } else if (hit.startsWith('ult')) {
      this.castUlt(parseInt(hit.slice(3), 10));
    } else if (hit.startsWith('wpn')) {
      this.equipWeapon(parseInt(hit.slice(3), 10));
    }
  }

  // ---------------- 装备与属性 ----------------
  private get maxHp(): number {
    return BASE_HP + (this.equip.helmet?.hp || 0);
  }

  private get attackValue(): number {
    const it = this.handItem;
    const base = it ? (it.def.dmg || 2) + it.bonus : 2; // 空手 = 拳头 2
    return base + (this.equip.tool?.dmg || 0);
  }

  private get armorValue(): number {
    return this.equip.armor?.armor || 0;
  }

  private get regenValue(): number {
    return this.equip.ring?.regen || 0;
  }

  private get attackCdMul(): number {
    const base = this.equip.tool?.cdMul || 1;
    return base * (this.energyT > 0 ? 1 / 1.8 : 1);
  }

  private applyEquip(item: EquipDef): void {
    // 先记录到物品栏（所有拾取过的装备都进格子）
    this.recordInventory(item);
    // 武器走快捷栏（拾取入格），其他部位自动比价替换
    if (item.slot === 'weapon') {
      this.pickupWeapon(item);
      return;
    }
    const cur = this.equip[item.slot];
    const better = !cur || item.tier > cur.tier ||
      (item.tier === cur.tier && (item.dmg || 0) >= (cur.dmg || 0));
    if (better) {
      const prevMax = this.maxHp;
      this.equip[item.slot] = item;
      if (this.maxHp > prevMax) this.hp += this.maxHp - prevMax;
      this.pushToast(`装备 ${item.name}（${mainStatText(item)}）`, TIER_COLORS[item.tier]);
    } else {
      this.hp = Math.min(this.maxHp, this.hp + 5);
      this.pushToast(`${item.name} 已分解，+5 生命`, 'rgba(255,255,255,0.85)');
    }
  }

  /** 切换人物皮肤：未解锁先看广告，解锁后重建第三人称模型 */
  private applySkin(index: number): void {
    if (index < 0 || index >= SKIN_PRESETS.length) return;
    if (!this.skinUnlocked[index]) {
      this.openAd('skin', () => this.unlockSkin(index));
      return;
    }
    if (index === this.skinIndex) return;
    this.skinIndex = index;
    const old = this.playerNode;
    const pos = old ? old.position.clone() : null;
    this.buildPlayerModel();
    if (this.playerNode) {
      if (pos) this.playerNode.setPosition(pos.x, pos.y, pos.z);
      this.playerNode.active = this.viewMode === 1;
    }
    if (old) old.destroy();
    this.updateHandModel();
    this.pushToast(`已切换皮肤：${SKIN_PRESETS[index].name}`, SKIN_PRESETS[index].accent);
  }

  /** 广告看完后解锁皮肤并立即使用，状态持久化到本地存储 */
  private unlockSkin(index: number): void {
    this.skinUnlocked[index] = true;
    this.saveSkinUnlocks();
    this.applySkin(index);
    this.overlay = 'character';
    this.pushToast(`皮肤已解锁：${SKIN_PRESETS[index].name}`, SKIN_PRESETS[index].accent);
  }

  private loadSkinUnlocks(): void {
    try {
      const raw = sys.localStorage.getItem(GameRoot.SKIN_STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as boolean[];
      if (!Array.isArray(arr)) return;
      for (let i = 0; i < this.skinUnlocked.length; i++) {
        this.skinUnlocked[i] = i < 2 ? true : !!arr[i];
      }
    } catch (e) { /* 忽略本地存储异常 */ }
  }

  private saveSkinUnlocks(): void {
    try {
      sys.localStorage.setItem(GameRoot.SKIN_STORAGE_KEY, JSON.stringify(this.skinUnlocked));
    } catch (e) { /* 忽略本地存储异常 */ }
  }

  /** 从物品栏格子穿戴装备（武器进快捷栏，其余部位直接装备） */
  private equipFromInventory(index: number): void {
    const item = this.inventory[index];
    if (!item) return;
    if (item.slot === 'weapon') {
      let slot = this.backpack.findIndex((b) => b && b.def.id === item.id);
      if (slot < 0) slot = this.backpack.findIndex((b) => !b);
      if (slot < 0) {
        this.pushToast('快捷栏已满，先切换或丢弃', '#FFD54F');
        return;
      }
      if (!this.backpack[slot]) this.backpack[slot] = { def: item, bonus: 0 };
      this.selectSlot(slot + 1);
      this.overlay = 'none';
    } else {
      this.equip[item.slot] = item;
      this.hp = Math.min(this.maxHp, this.hp);
      this.pushToast(`已穿戴 ${item.name}`, TIER_COLORS[item.tier]);
      this.overlay = 'none';
    }
  }

  /** 记录到物品栏（按 id 去重，最多 20 件，对应面板 20 格） */
  private recordInventory(item: EquipDef): void {
    if (this.inventory.findIndex((e) => e.id === item.id) >= 0) return;
    if (this.inventory.length >= 20) this.inventory.pop();
    this.inventory.unshift(item);
  }

  /** 已拥有的武器 id 列表（背包 + 身上） */
  private ownedWeaponIds(): string[] {
    const ids = this.collectedWeapons.slice();
    for (const b of this.backpack) if (b && ids.indexOf(b.def.id) < 0) ids.push(b.def.id);
    return ids;
  }

  /**
   * 拾取武器：同名 → 强化（+2/层，上限 +10）；否则放入第一个空武器格。
   * 返回成功时的槽位（1~7），失败返回 0。
   */
  private pickupWeapon(item: EquipDef): number {
    this.playSfx('sfx_pickup', 0.9);
    const owned = this.backpack.findIndex((b) => b && b.def.id === item.id);
    if (owned >= 0) {
      const b = this.backpack[owned]!;
      if (b.bonus >= 10) {
        this.pushToast(`${item.name} 强化已满（+10）`, '#FFD54F');
        return 0;
      }
      b.bonus = Math.min(10, b.bonus + 2);
      this.pushToast(`${item.name} 强化 +${b.bonus}`, TIER_COLORS[item.tier]);
      if (this.selected === owned + 1) {
        this.blockName = this.slotName(owned + 1);
        this.blockNameTimer = 1.6;
        this.updateHandModel();
      }
      if (this.collectedWeapons.indexOf(item.id) < 0) this.collectedWeapons.push(item.id);
      return owned + 1;
    }
    const empty = this.backpack.indexOf(null);
    if (empty < 0) {
      // 快捷栏满：仍存入背包图鉴，可在「包」面板查看
      if (this.collectedWeapons.indexOf(item.id) < 0) this.collectedWeapons.push(item.id);
      this.pushToast(`${item.name} 已存入背包`, TIER_COLORS[item.tier]);
      return 0;
    }
    this.backpack[empty] = { def: item, bonus: 0 };
    if (this.collectedWeapons.indexOf(item.id) < 0) this.collectedWeapons.push(item.id);
    this.pushToast(`拾取 ${item.name}`, TIER_COLORS[item.tier]);
    // 首次拾取自动装备，游戏更顺
    this.selectSlot(empty + 1);
    return empty + 1;
  }

  private slotName(i: number): string {
    if (i <= 0) return BlockNames[HOTBAR_BLOCKS[2]];
    const b = this.backpack[i - 1];
    return b ? `${b.def.name}${b.bonus > 0 ? ` +${b.bonus}` : ''}` : '空格';
  }

  /** 点击快捷栏槽位：立即换手（0 = 石块，1~7 = 武器格） */
  private selectSlot(i: number): void {
    if (!isFinite(i) || i < 0 || i >= 8) return;
    if (i === 0) {
      this.selected = 0;
      this.equip.weapon = null;
      this.blockName = BlockNames[HOTBAR_BLOCKS[2]]; // STONE
      this.blockNameTimer = 1.8;
      this.updateHandModel();
      return;
    }
    const b = this.backpack[i - 1];
    if (!b) {
      this.pushToast('这个格子是空的', 'rgba(255,255,255,0.6)');
      return;
    }
    const changed = this.selected !== i || this.handItemId !== b.def.id;
    this.selected = i;
    this.equip.weapon = b.def;
    this.blockName = this.slotName(i);
    this.blockNameTimer = 1.8;
    this.updateHandModel();
    if (changed) {
      this.switchWeaponFx(b.def.color);
      this.pushToast(`已换装 ${b.def.name} · 攻${(b.def.dmg || 2) + b.bonus}`, TIER_COLORS[b.def.tier]);
    }
  }

  /** 物品栏点图鉴：切到快捷栏对应的宝剑，没有则放进空格 */
  private equipWeapon(index: number): void {
    const wp = WEAPONS[index];
    if (!wp) return;
    if (this.collectedWeapons.indexOf(wp.id) < 0) {
      this.pushToast('这把宝剑还没解锁', 'rgba(255,255,255,0.7)');
      return;
    }
    let slot = this.backpack.findIndex((b) => b && b.def.id === wp.id);
    if (slot < 0) slot = this.backpack.findIndex((b) => !b);
    if (slot < 0) {
      this.pushToast('快捷栏已满，先切换或丢弃', '#FFD54F');
      return;
    }
    if (!this.backpack[slot]) this.backpack[slot] = { def: wp, bonus: 0 };
    this.selectSlot(slot + 1);
    this.overlay = 'none';
  }

  private pushToast(msg: string, color = '#FFFFFF'): void {
    this.toasts.push({ msg, color, alpha: 1 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  // ---------------- 波次 ----------------
  /** v2.3 地图卡片选择：已解锁直接切换；未解锁看广告解锁 */
  private selectMapCard(i: number): void {
    const def = MAP_LIST[i];
    if (!def) return;
    if (!isMapUnlocked(def.id, this.mapSave)) {
      const p = unlockProgress(def.id, this.mapSave);
      this.openAd('map', () => {
        adUnlockMap(this.mapSave, def.id);
        saveMapSave(this.mapSave);
        this.pushToast(`🔓 已解锁「${def.icon} ${def.name}」`, '#7BE38A');
        if (this.state === 'playing' && this.mode === 'treasure') {
          // 看完广告直接进入新地图，免去二次点击
          this.mapSave.selected = def.id;
          saveMapSave(this.mapSave);
          this.mapPanelOpen = false;
          this.switchMapInGame(def);
        }
      }, () => {
        const prev = def.prevMap ? MAPS[def.prevMap].name : '';
        this.pushToast(`广告未看完 · 也可在${prev}累计开箱 ${p.cur}/${p.need} 解锁`, '#FFB74D');
      });
      return;
    }
    if (this.mapSave.selected === def.id) {
      this.mapPanelOpen = false;
      return;
    }
    this.mapSave.selected = def.id;
    saveMapSave(this.mapSave);
    this.mapPanelOpen = false;
    if (this.state === 'playing' && this.mode === 'treasure') {
      this.switchMapInGame(def);
    } else {
      this.pushToast(`${def.icon} 已选择「${def.name}」`, '#7BE38A');
    }
  }

  /** v2.3 游戏内换图：重建世界区块并传送回出生点（寻宝模式限定） */
  private switchMapInGame(def: MapDef): void {
    if (this.world.setMap(def)) {
      this.mobs.clear();
      this.chests.clear();
      this.drops.clear();
      // 不再同步预生成：先回到出生点并进入过场遮罩，区块在遮罩期间分帧生成
      this.player.spawn(this.spawnX, this.spawnY, this.spawnZ);
      this.bossSpawned = WORLD_BOSSES.map(() => false);
      // 宝箱点位按新图密度重建
      this.treasureSpots = getTreasureChestSpots().map((s) => ({ ...s, spawned: false }));
      const extra = Math.round(11 * (def.chestDensity - 1));
      for (let i = 0; i < extra; i++) {
        const a = Math.random() * Math.PI * 2;
        const ring = i % 2;
        const r = (ring === 0 ? 30 : 80) + (Math.random() - 0.5) * 12;
        this.treasureSpots.push({ x: Math.cos(a) * r, z: 10 + Math.sin(a) * r, ring, spawned: false });
      }
      this.banner = `${def.icon} ${def.name}`;
      this.bannerSub = def.desc;
      this.bannerT = 2.2;
      this.pushToast(`${def.icon} 已传送至「${def.name}」`, '#7BE38A');
      // 进入过场：遮罩期间冻结玩法，分帧生成/建模，结束后恢复
      this.mapSwitchDef = def;
      this.mapSwitchT = 1.8;
      this.mapSwitchProg = 0;
      this.mapLoadT = 2.0;
      this.animalT = 6;
      this.wildT = 8;
      console.log('[map] switched to', def.id);
    }
    this.applyMapEnv();
  }

  /** v2.3 按当前选中地图应用雾色与相机底色 */
  private applyMapEnv(): void {
    const scene = director.getScene();
    const sky = MAPS[this.mapSave.selected].sky;
    const fog = scene?.globals.fog;
    if (fog) {
      fog.enabled = true;
      fog.fogColor.set(sky.fog[0], sky.fog[1], sky.fog[2], 255);
      fog.fogStart = sky.fogStart;
      fog.fogEnd = sky.fogEnd;
    }
    if (this.cam) this.cam.clearColor.set(sky.fog[0], sky.fog[1], sky.fog[2], 255);
  }

  private beginPlay(): void {
    // v2.3 应用所选地图：切换时清空旧区块，同步重建出生点周围
    const mapDef = MAPS[this.mapSave.selected];
    if (this.world.setMap(mapDef)) {
      this.world.preloadAt(this.spawnX, this.spawnZ, 1);
      this.mapLoadT = 0.9;
      this.pushToast(`${mapDef.icon} ${mapDef.name} · ${mapDef.desc}`, '#7BE38A');
    }
    this.applyMapEnv();
    this.mapPanelOpen = false;
    this.state = 'playing';
    this.overlay = 'none';
    this.playSfx('sfx_start');
    this.hintTimer = 6;
    this.blockNameTimer = 2;
    this.target = null;
    this.highlight.active = false;

    // 重置一局：快捷栏 7 个武器格全空，手持石块
    this.equip = { weapon: null, helmet: null, armor: null, ring: null, tool: null };
    this.collectedWeapons = [];
    this.inventory = [];
    this.backpack = [null, null, null, null, null, null, null];
    this.selected = 0;
    // 消耗品与临时状态清空
    this.consumables = [null, null, null, null];
    this.shield = 0;
    this.shieldT = 0;
    this.energyT = 0;
    this.bombArmed = false;
    for (const b of this.bombs) b.node.destroy();
    this.bombs.length = 0;
    this.handItemId = '';
    this.reward = null;
    this.rewardT = 0;
    this.chestHint = 0;
    this.updateHandModel();
    this.hp = BASE_HP;
    this.kills = 0;
    this.invT = 0;
    // 大招：新一局重新充能（广告解锁的次数保留）
    for (const s of this.ults) {
      s.charge = 0;
      s.cd = 0;
    }
    this.ultShow = null;
    this.ultTimers.length = 0;
    for (const f of this.ultFxList) if (f.node.isValid) f.node.destroy();
    this.ultFxList.length = 0;
    this.mobs.clear();
    this.projectiles.clear();
    this.drops.clear();
    this.chests.clear();
    this.poisonClouds.length = 0;
    this.poisonT = 0;
    this.poisonDps = 0;
    this.poisonAcc = 0;
    this.player.spawn(this.spawnX, this.spawnY, this.spawnZ);

    // 竞技场里的和平动物
    for (let i = 0; i < 10; i++) this.spawnAnimal();

    // v2.1：默认寻宝模式——不立刻开波，宝箱点位待懒生成
    this.wave = 0;
    this.mode = 'treasure';
    this.arenaCd = 0;
    this.waveActive = false;
    this.freeT = 0;
    this.betweenT = 0;
    this.spawnQueue.length = 0;
    this.treasureSpots = getTreasureChestSpots().map((s) => ({ ...s, spawned: false }));
    // v2.3 宝箱密度：密度 >1 的地图追加内/中圈点位
    const extra = Math.round(11 * (mapDef.chestDensity - 1));
    for (let i = 0; i < extra; i++) {
      const a = Math.random() * Math.PI * 2;
      const ring = i % 2;
      const r = (ring === 0 ? 30 : 80) + (Math.random() - 0.5) * 12;
      this.treasureSpots.push({ x: Math.cos(a) * r, z: 10 + Math.sin(a) * r, ring, spawned: false });
    }
    this.bossSpawned = WORLD_BOSSES.map(() => false);
    this.updateCameraFollow();
  }

  /** v2.3 斗兽场 100 波怪物池：按波次分段解锁 */
  private static readonly POOL_A: MobKind[] = ['zombie', 'skeleton', 'spider', 'slime', 'creeper'];
  private static readonly POOL_B: MobKind[] = ['bat', 'gas', 'boar', 'fox', 'vulture', 'cavebat', 'wolf', 'witch', 'bee', 'snow_golem', 'raptor', 'ptera'];
  private static readonly POOL_C: MobKind[] = ['troll', 'samurai', 'scorpion', 'icewolf', 'polarbear', 'sandworm', 'shadow', 'enderman', 'iron_golem', 'triceratops'];
  /** 斗兽场 BOSS 种类（数值按自身基础属性，不吃普通成长公式） */
  private static readonly ARENA_BOSSES = new Set<MobKind>(['tiger', 'rex', 'dragon', 'boss_troll']);
  /**
   * v2.6 斗兽场中型 BOSS 体型倍率：按各物种模型视觉高度归一化，
   * 缩放后约 3.6m，约为世界 BOSS（约 4.5~4.7m）体积的一半（线性 ∛0.5≈0.79）。
   */
  private static readonly MID_BOSS_SCALE: Record<string, number> = {
    tiger: 3.2, rex: 1.65, dragon: 2.25, boss_troll: 1.55,
  };

  /** 波次限时：60s 起步随波数缓增，封顶 100s */
  private static waveTime(n: number): number {
    return Math.min(60 + n * 0.5, 100);
  }

  /**
   * v2.3 公式化波表（替换手写 10 波表）：
   *  - 普通波：3→9 只，池子随波数扩大
   *  - 每 5 波：精英波（1 精英 + 2 护卫）
   *  - 每 10 波：BOSS 波，虎王→暴龙→巨龙轮换强化，100 波三王同场
   *  - 50 波后：普通怪随机获得 1 个词缀
   */
  private composeWave(n: number): SpawnEnt[] {
    const out: SpawnEnt[] = [];
    const pick = (pool: MobKind[], c: number): void => {
      for (let i = 0; i < c; i++) out.push({ kind: pool[(Math.random() * pool.length) | 0] });
    };
    if (n === 100) {
      out.push({ kind: 'tiger', hpMul: 1.5 }, { kind: 'rex', hpMul: 1.5 }, { kind: 'dragon', hpMul: 1.5 });
    } else if (n % 10 === 0) {
      switch (n / 10) {
        case 1: out.push({ kind: 'tiger' }); break;
        case 2: out.push({ kind: 'rex' }); break;
        case 3: out.push({ kind: 'dragon' }); break;
        case 4: out.push({ kind: 'tiger', hpMul: 1.5, affix: 'burn' }); break;
        case 5: out.push({ kind: 'rex', hpMul: 1.5, affix: 'haste' }); break;
        case 6: out.push({ kind: 'dragon', hpMul: 1.5, affix: 'thorns' }); break;
        case 7: out.push({ kind: 'tiger' }, { kind: 'rex' }); break;
        case 8: out.push({ kind: 'dragon', hpMul: 2 }); break;
        case 9: out.push({ kind: 'tiger', hpMul: 0.7 }, { kind: 'rex', hpMul: 0.7 }, { kind: 'dragon', hpMul: 0.7 }); break;
      }
    } else if (n % 5 === 0) {
      const elite: MobKind = n >= 40 ? 'stonegolem'
        : n >= 15 ? (Math.random() < 0.5 ? 'troll' : 'samurai')
          : (Math.random() < 0.5 ? 'zombie' : 'skeleton');
      out.push({ kind: elite, elite: true });
      pick(GameRoot.POOL_A, 2);
    } else {
      const count = Math.min(4 + Math.floor(n * 0.7), 12);
      const pool = n <= 10 ? GameRoot.POOL_A
        : n <= 40 ? [...GameRoot.POOL_A, ...GameRoot.POOL_B]
          : [...GameRoot.POOL_A, ...GameRoot.POOL_B, ...GameRoot.POOL_C];
      pick(pool, count);
    }
    // 50 波后「噩梦段」：非 BOSS 怪随机 1 个词缀
    if (n > 50) {
      const AFFIXES: AffixKind[] = ['burn', 'haste', 'thorns', 'vamp'];
      for (const e of out) {
        if (!GameRoot.ARENA_BOSSES.has(e.kind)) e.affix = AFFIXES[(Math.random() * AFFIXES.length) | 0];
      }
    }
    return out;
  }

  private nextWave(): void {
    if (this.wave >= 100) return;
    this.wave++;
    const n = this.wave;
    this.waveActive = false;
    this.freeT = 0;
    this.betweenT = 2.6;
    this.banner = `第 ${n} / 100 波 · 来袭！`;
    this.bannerSub = '';
    this.bannerT = 2.4;
    this.waveNoTimer = n % 10 === 0;
    this.timeMax = this.waveNoTimer ? 9999 : GameRoot.waveTime(n);
    this.timeLeft = this.timeMax;
    this.spawnQueue = this.composeWave(n);
    this.spawnT = 0;
    if (n === 100) this.bannerSub = '终局 · 三王同场！';
    else if (n % 10 === 0) this.bannerSub = 'BOSS 波 · 不限时';
    else if (n % 5 === 0) this.bannerSub = '精英波 · 小心应对';
  }

  private retryWave(): void {
    this.mobs.clear();
    this.hp = this.maxHp;
    this.state = 'playing';
    this.overlay = 'none';
    this.wave--;
    this.mode = 'arena';
    this.player.spawn(ARENA_CX + 0.5, ARENA_GROUND_Y + 1.02, ARENA_CZ + 0.5);
    this.nextWave();
  }

  private spawnAnimal(): void {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 12;
      const x = this.spawnX + Math.sin(a) * r;
      const z = this.spawnZ + Math.cos(a) * r;
      const gy = this.world.findGroundY(x, z);
      if (gy > SEA_LEVEL + 1) {
        this.mobs.spawn(this.mobs.randomAnimalKind(this.world.mapDef.animalPool), x, z);
        return;
      }
    }
  }

  private spawnWildAnimal(): void {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 14;
      const x = this.player.pos.x + Math.sin(a) * r;
      const z = this.player.pos.z + Math.cos(a) * r;
      if (isInArena(x, z)) continue;
      const gy = this.world.findGroundY(x, z);
      if (gy > SEA_LEVEL + 1) {
        this.mobs.spawn(this.mobs.randomWildKind(this.world.mapDef.wildPool), x, z);
        return;
      }
    }
  }

  private spawnMobFromQueue(): void {
    const ent = this.spawnQueue.shift();
    if (!ent) return;
    const n = Math.max(1, this.wave);
    const isBoss = GameRoot.ARENA_BOSSES.has(ent.kind);
    // v2.3 百波成长：血量 ×(1+0.08n)，攻击 ×(1+0.05n)；BOSS 按自身基础属性只小幅成长
    let hpMul = 1 + 0.08 * n;
    let dmgMul = 1 + 0.05 * n;
    let speedMul = Math.min(1 + n * 0.015, 1.5);
    let scaleMul = 1;
    if (isBoss) {
      hpMul = 1;
      dmgMul = 1 + 0.02 * n;
      speedMul = 1;
      scaleMul = GameRoot.MID_BOSS_SCALE[ent.kind] || 2.2;
    }
    if (ent.elite) {
      hpMul *= 3;
      scaleMul = 1.3;
    }
    if (ent.hpMul) hpMul *= ent.hpMul;
    if (ent.affix === 'haste') speedMul *= 1.4;
    const mul = { hp: hpMul, dmg: dmgMul, speed: speedMul, scale: scaleMul };

    // v2.1 斗兽场：怪物从东南西北四个门洞入场（不再随机点位刷新）
    const R = ARENA_INNER_R;
    const gates = [
      [ARENA_CX + R, ARENA_CZ + 0.5],
      [ARENA_CX - R + 1, ARENA_CZ + 0.5],
      [ARENA_CX + 0.5, ARENA_CZ + R],
      [ARENA_CX + 0.5, ARENA_CZ - R + 1],
    ];
    const g = gates[(Math.random() * gates.length) | 0];
    const mob = this.mobs.spawn(ent.kind, g[0] + (Math.random() - 0.5) * 1.6, g[1] + (Math.random() - 0.5) * 1.6, mul);
    if (mob) mob.affix = ent.affix ?? null;
  }

  /** v2.1 进入斗兽场：记录寻宝位置，传送到场中央，倒计时后开波 */
  private enterArena(): void {
    console.log('[ARENA] enterArena start world=' + !!this.world + ' player=' + !!this.player);
    if (this.mode === 'arena') return;
    this.mode = 'arena';
    this.retX = this.player.pos.x;
    this.retY = this.player.pos.y;
    this.retZ = this.player.pos.z;
    console.log('[ARENA] preloadAt start');
    // 关键修复：先同步预生成传送点周围区块（r=3 → 7×7=49 区块，覆盖斗兽场+看台+外围缓冲）
    this.world.preloadAt(ARENA_CX, ARENA_CZ, 3);
    console.log('[ARENA] preloadAt done, buildMeshesNow start');
    // 立即同步构建中心 3×3 区块的网格，保证落点周围地面可见
    this.world.buildMeshesNow(ARENA_CX, ARENA_CZ, 1);
    console.log('[ARENA] buildMeshesNow done, spawn player');
    this.player.spawn(ARENA_CX + 0.5, ARENA_GROUND_Y + 1.02, ARENA_CZ + 0.5);
    this.arenaCd = 4;
    this.banner = '⚔ 斗兽场';
    this.bannerSub = '战斗 4 秒后开始';
    this.bannerT = 4;
    // v2.3 checkpoint：从历史最高波次的最近 10 波档续打
    const cp = Math.floor(this.loadArenaBest() / 10) * 10;
    if (cp >= 10 && cp > this.wave) {
      this.wave = cp;
      this.bannerSub = `战斗 4 秒后开始 · 从第 ${cp + 1} 波续打`;
      this.pushToast(`⛳ checkpoint：第 ${cp + 1} 波开始`, '#FFD54F');
    }
    // 进场金色光环：围绕落点撒一圈向上飘的金色粒子
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.spawnFxColor(
        ARENA_CX + 0.5 + Math.sin(a) * 3.2,
        ARENA_GROUND_Y + 0.2,
        ARENA_CZ + 0.5 + Math.cos(a) * 3.2,
        i % 2 ? '#FFD54F' : '#FFF59D',
      );
    }
    this.playSfx('sfx_start');
    this.pushToast('斗兽场规则：只能放置 · 不能破坏', '#FFD54F');
  }

  /** v2.1 离开斗兽场：清场并回到进入前的位置，波次进度保留 */
  private leaveArena(): void {
    if (this.mode !== 'arena') return;
    this.mode = 'treasure';
    this.mobs.clear();
    this.spawnQueue.length = 0;
    this.waveActive = false;
    this.betweenT = 0;
    this.freeT = 0;
    this.timeLeft = 0;
    this.arenaCd = 0;
    this.reward = null;
    if (this.overlay === 'reward') this.overlay = 'none';
    // 返回寻宝世界同样需要预生成落点，避免回到原地时踩空
    this.world.preloadAt(this.retX, this.retZ, 2);
    this.world.buildMeshesNow(this.retX, this.retZ, 1);
    this.player.spawn(this.retX, this.retY, this.retZ);
    this.pushToast('已返回寻宝模式 · 波次进度保留', '#7BE38A');
  }

  /** v2.3 斗兽场最高波次存档读写 */
  private loadArenaBest(): number {
    try {
      const raw = sys.localStorage.getItem(GameRoot.ARENA_STORAGE_KEY);
      if (!raw) return 0;
      const n = (JSON.parse(raw) as { best?: number }).best;
      return typeof n === 'number' && n > 0 ? Math.min(99, Math.floor(n)) : 0;
    } catch {
      return 0;
    }
  }

  private saveArenaBest(): void {
    try {
      const best = Math.max(this.wave, this.loadArenaBest());
      sys.localStorage.setItem(GameRoot.ARENA_STORAGE_KEY, JSON.stringify({ best }));
    } catch { /* 存储失败不影响游戏 */ }
  }

  private waveCleared(): void {
    this.playSfx('sfx_win');
    this.waveActive = false;
    const used = Math.max(1, Math.round(this.timeMax - this.timeLeft));
    this.banner = `第 ${this.wave} 波 · 通关！`;
    this.bannerSub = `用时 ${used}s · 击杀 ${this.kills} · 剩余 ${Math.ceil(this.hp)} 生命`;
    this.bannerT = 2.2;
    this.hp = Math.min(this.maxHp, this.hp + 10);
    this.pushToast('波次奖励：+10 生命', '#7BE38A');
    this.saveArenaBest();
    // v2.3 终局：100 波通关，三传说宝箱
    if (this.wave >= 100) {
      this.banner = '🏆 百战不殆！';
      this.bannerSub = '斗兽场 100 波全部通关 · 传说宝箱 ×3';
      this.bannerT = 5;
      const dir = this.player.forward(this.tmpDir);
      const px = -dir.z, pz = dir.x;
      this.spawnChestAt(this.player.pos.x + dir.x * 2.5, this.player.pos.z + dir.z * 2.5);
      this.spawnChestAt(this.player.pos.x + px * 2.5, this.player.pos.z + pz * 2.5);
      this.spawnChestAt(this.player.pos.x - px * 2.5, this.player.pos.z - pz * 2.5);
      this.freeT = 30;
      this.pushToast('🏆 达成成就「百战不殆」', '#FFD54F');
      return;
    }
    this.spawnChest();
    // v2.3 每 10 波 BOSS 战：双宝箱奖励
    if (this.wave % 10 === 0) {
      const dir = this.player.forward(this.tmpDir);
      const px = -dir.z, pz = dir.x; // 右手法线
      this.spawnChestAt(this.player.pos.x + px * 2.5, this.player.pos.z + pz * 2.5);
    }
    // v2.2 斗兽场：每波清场只有 8 秒整备时间；寻宝模式保留 3 分钟自由活动
    this.freeT = this.mode === 'arena' ? 8 : 180;
    if (this.mode === 'arena') this.pushToast('清场完毕 · 8 秒后下一波', '#FFD54F');
  }

  /** 在玩家正前方 2.5m 生成通关宝箱（最多同时 5 个，超出则最早的自动开启） */
  private spawnChest(): void {
    const dir = this.player.forward(this.tmpDir);
    this.spawnChestAt(this.player.pos.x + dir.x * 2.5, this.player.pos.z + dir.z * 2.5);
  }

  /** 在指定坐标生成通关宝箱 */
  private spawnChestAt(cx: number, cz: number): void {
    let gy = this.world.findGroundY(cx, cz);
    if (gy < 0 || gy <= SEA_LEVEL + 1) gy = this.player.pos.y;
    while (this.chests.count >= 5) {
      const old = this.chests.takeOldest();
      if (!old) break;
      this.grantChestLoot(old.wave, false);
    }
    this.chests.spawn(cx, gy, cz, this.wave);
  }

  /** 开箱：箱盖弹起 + 8 个金色粒子，并给出 1 武器 + 1 装备 */
  private onChestOpened(ent: { wave: number; x: number; y: number; z: number }): void {
    this.playSfx('sfx_chest');
    for (let i = 0; i < 8; i++) this.spawnFxColor(ent.x, ent.y + 0.7, ent.z, '#FFD54F');
    this.grantChestLoot(ent.wave, true);
    // v2.3 寻宝开箱计数：驱动地图解锁
    if (this.mode === 'treasure') {
      const unlocked = addChestCount(this.mapSave, this.mapSave.selected);
      saveMapSave(this.mapSave);
      if (unlocked) {
        const m = MAPS[unlocked];
        this.pushToast(`🗺 新地图解锁：${m.icon} ${m.name}！`, '#7BE38A');
        this.playSfx('sfx_win', 0.8);
      }
    }
  }

  private grantChestLoot(wave: number, showPanel: boolean): void {
    const loot = rollChestLoot(wave, this.ownedWeaponIds());
    if (!loot) return;
    // v2.0 宝箱保底 1 瓶治疗；第 3 波起可出炸弹，第 4 波起能量，第 6 波起护盾
    this.addConsumable('p_heal', 1);
    if (wave >= 6 && Math.random() < 0.25) this.addConsumable('p_shield', 1);
    else if (wave >= 3 && Math.random() < 0.25) this.addConsumable('p_bomb', 1);
    else if (wave >= 4 && Math.random() < 0.2) this.addConsumable('p_energy', 1);
    if (this.mode === 'treasure') {
      // 寻宝模式：两件全拿，无二选一
      this.pickupWeapon(loot.weapon);
      this.applyEquip(loot.equip);
      this.pushToast(`寻宝宝箱 · ${loot.weapon.name} + ${loot.equip.name}`, '#FFD54F');
      return;
    }
    if (!showPanel) {
      // 斗兽场旧宝箱被挤爆自动开启：默认发第一件
      this.pickupWeapon(loot.weapon);
      this.pushToast(`宝箱自动开启 · ${loot.weapon.name}`, '#FFD54F');
      return;
    }
    // 斗兽场：二选一面板（免费选 1 件，另一件看广告）
    this.reward = { weapon: loot.weapon, equip: loot.equip };
    this.rewardPicked = -1;
    this.rewardSecond = false;
    this.rewardT = 30;
    this.overlay = 'reward';
  }

  /** 二选一：免费拿走一件（0=武器 1=装备） */
  private pickReward(idx: number): void {
    if (!this.reward || this.rewardPicked >= 0) return;
    this.rewardPicked = idx;
    const item = idx === 0 ? this.reward.weapon : this.reward.equip;
    if (idx === 0) this.pickupWeapon(item); else this.applyEquip(item);
    this.pushToast(`已选择 ${item.name}`, TIER_COLORS[item.tier]);
    this.playSfx('sfx_pickup', 0.9);
  }

  /** 二选一：看广告拿走另一件 */
  private claimSecondReward(): void {
    if (!this.reward || this.rewardPicked < 0 || this.rewardSecond) return;
    const other = this.rewardPicked === 0 ? this.reward.equip : this.reward.weapon;
    this.openAd('chest', () => {
      this.rewardSecond = true;
      if (this.rewardPicked === 0) this.applyEquip(other); else this.pickupWeapon(other);
      this.pushToast(`额外获得 ${other.name}`, TIER_COLORS[other.tier]);
      this.closeReward();
    });
  }

  private closeReward(): void {
    this.reward = null;
    this.rewardT = 0;
    if (this.overlay === 'reward') this.overlay = 'none';
  }

  // ---------------- 战斗 ----------------
  /** 调试/自动化测试入口：按 id 直接发放并装备一把武器 */
  debugEquip(id: string): boolean {
    const w = WEAPONS.find((x) => x.id === id);
    if (!w) return false;
    this.recordInventory(w);
    return this.pickupWeapon(w) > 0;
  }

  /** 调试/自动化测试入口：查看广告配置与频率（含自适应间隔） */
  debugAdState(): any {
    return {
      state: this.state,
      playTime: Math.round(this.playTime),
      intervalNowMs: interstitialIntervalMs(this.playTime),
      intervalAt0Min: interstitialIntervalMs(0),
      intervalAt10Min: interstitialIntervalMs(600),
      hasWx: typeof (globalThis as any).wx !== 'undefined',
    };
  }

  /** 调试/自动化测试入口：发放一件样例非武器装备（头盔/铠甲/戒指/工具） */
  debugGrantEquip(slot: SlotId): boolean {
    const base: Record<string, EquipDef> = {
      helmet: { id: 'dbg_helmet', slot: 'helmet', name: '测试头盔', tier: 3, color: '#42A5F5', hp: 20, desc: '+20 生命上限' },
      armor: { id: 'dbg_armor', slot: 'armor', name: '测试铠甲', tier: 3, color: '#42A5F5', armor: 0.2, desc: '-20% 受伤' },
      ring: { id: 'dbg_ring', slot: 'ring', name: '测试戒指', tier: 3, color: '#42A5F5', regen: 0.5, desc: '+0.5/s 回血' },
      tool: { id: 'dbg_tool', slot: 'tool', name: '测试工具', tier: 3, color: '#42A5F5', cdMul: 0.9, desc: '攻速 +10%' },
      weapon: { id: 'dbg_weapon', slot: 'weapon', name: '测试宝剑', tier: 3, color: '#42A5F5', dmg: 20, desc: '攻击 +20' },
    };
    const item = base[slot];
    if (!item) return false;
    this.applyEquip(item);
    return true;
  }

  /** 攻击面前最近的生物；返回是否命中 */
  private tryAttack(): boolean {
    if (this.attackCd > 0 || this.state !== 'playing' || this.overlay !== 'none') return false;

    // 持雷状态：本次攻击改为掷炸弹
    if (this.bombArmed) {
      this.bombArmed = false;
      this.attackCd = 0.6;
      this.swingT = 0.2;
      this.throwBomb(this.player.forward(this.tmpDir));
      return true;
    }

    const wd = this.equip.weapon;
    // 有弹道速度的武器（弓/弩/喷管/法杖）走远程发射，其余近战挥砍
    const ranged = !!wd && !!wd.projSpeed;
    this.attackCd = (ranged ? (wd!.fireCd || 0.6) : 0.42) * this.attackCdMul;
    // 能量药水同时缩短挥砍/开火动画，避免攻速加快后手感脱节
    this.swingT = (ranged ? 0.12 : 0.22) * (this.energyT > 0 ? 1 / 1.8 : 1);
    // 能量药水生效中：出手带金色粒子
    if (this.energyT > 0) {
      for (let i = 0; i < 3; i++) this.spawnFxColor(this.player.eyeX, this.player.eyeY - 0.3, this.player.eyeZ, '#FFD54F');
    }
    this.playSfx('sfx_swing', ranged ? 0.55 : 0.7);

    const dir = this.player.forward(this.tmpDir);
    if (ranged) {
      this.fireProjectile(wd!, dir);
      return true;
    }

    let best: Mob | null = null;
    let bestScore = -1;
    for (const mob of this.mobs.mobs) {
      if (!mob.alive) continue;
      const dx = mob.x - this.player.eyeX;
      const dz = mob.z - this.player.eyeZ;
      if (mob.def.worldBoss) {
        // 巨型 BOSS：体型过高，按水平距离 + 朝向判定（3D 距离会永远打不到）
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        const reach = 3.2 + mob.def.hw * mob.scale;
        if (distXZ > reach) continue;
        const dotXZ = (dx * dir.x + dz * dir.z) / (distXZ || 1);
        if (dotXZ < 0.15 && distXZ > 2.4) continue;
        const score = dotXZ * 2 - distXZ * 0.2;
        if (score > bestScore) {
          bestScore = score;
          best = mob;
        }
        continue;
      }
      const dy = (mob.y + mob.def.height * mob.scale * 0.5) - this.player.eyeY;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 3.9) continue;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (dist || 1);
      // 宽容判定：近距离必中，中距离放宽到约 80° 扇形
      if (dot < 0.15 && dist > 2.4) continue;
      const score = dot * 2 - dist * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = mob;
      }
    }
    if (!best) return false;

    // 亡灵武士格挡：正面近战有概率弹反（背后攻击必中）
    if (best.def.parryChance) {
      const mYaw = best.yawDeg * Math.PI / 180;
      const mfx = Math.sin(mYaw), mfz = Math.cos(mYaw);
      const pdx = this.player.pos.x - best.x;
      const pdz = this.player.pos.z - best.z;
      const pl = Math.sqrt(pdx * pdx + pdz * pdz) || 1;
      const frontDot = (pdx * mfx + pdz * mfz) / pl;
      if (frontDot > 0.5 && Math.random() < best.def.parryChance) {
        this.playSfx('sfx_hit', 0.5);
        this.spawnFxColor(best.x, best.y + best.def.height * best.scale * 0.6, best.z, '#FFD54F');
        this.pushToast('格挡！', '#FFD54F');
        return true;
      }
    }

    const crit = Math.random() < 0.15;
    const dmg = Math.round(this.attackValue * (crit ? 1.8 : 1));
    const burn = wd?.burn || 0;
    const kx = dir.x * 4.5;
    const kz = dir.z * 4.5;
    const died = best.takeDamage(dmg, kx, kz, burn);
    this.playSfx('sfx_hit', 0.9);
    this.spawnFx(best.x, best.y + best.def.height * best.scale * 0.6, best.z, 0, 4);
    this.pushDmgText(best, dmg, crit);
    // v2.0 元素结算：冰冻 / 眩晕（BOSS 免疫）/ 溅射 / 连锁
    if (wd?.slow) best.applySlow(wd.slow, 2);
    if (wd?.stun && !best.def.worldBoss && best.def.kind !== 'boss') best.applyStun(wd.stun);
    if (wd?.splash) this.applySplash(best, Math.max(1, Math.round(dmg * 0.5)), wd.splash);
    if (wd?.chain) this.applyChain(best, dmg, wd.chain);
    // v2.3 暗影：受击 30% 概率瞬移到玩家侧后
    if (!died && best.def.blink && Math.random() < best.def.blink) {
      const bx = this.player.pos.x - dir.x * 1.6 + (Math.random() - 0.5);
      const bz = this.player.pos.z - dir.z * 1.6 + (Math.random() - 0.5);
      const by = this.world.findGroundY(bx, bz);
      if (by > 0) {
        this.spawnFxColor(best.x, best.y + 1, best.z, '#BA68C8');
        best.node.setPosition(bx, by, bz);
        best.vel.set(0, 0, 0);
        this.spawnFxColor(bx, by + 1, bz, '#BA68C8');
      }
    }
    if (died) this.onMobKilled(best);
    return true;
  }

  /** 远程武器发射：从眼睛位置沿视线生成弹道（喷管多弹丸扇形，法杖带弱锁定） */
  private fireProjectile(wd: EquipDef, dir: Vec3): void {
    const shots = Math.max(1, wd.shots || 1);
    const half = (wd.spread || 0) * Math.PI / 180;
    const color =
      wd.id === 'w_crossbow' ? '#B0BEC5'
        : wd.id === 'w_firegun' ? '#FF7043'
          : wd.id === 'w_staff' ? '#BA68C8'
            : '#C8A165';
    const ox = this.player.eyeX + dir.x * 0.55;
    const oy = this.player.eyeY + dir.y * 0.55 - 0.05;
    const oz = this.player.eyeZ + dir.z * 0.55;

    for (let i = 0; i < shots; i++) {
      // 绕 Y 轴均匀展开：3 连珠 → -spread / 0 / +spread
      const a = shots === 1 ? 0 : -half + (2 * half) * (i / (shots - 1));
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const d = new Vec3(dir.x * ca + dir.z * sa, dir.y, -dir.x * sa + dir.z * ca);
      d.normalize();
      this.projectiles.spawn({
        x: ox, y: oy, z: oz,
        dir: d,
        speed: wd.projSpeed || 15,
        dmg: this.attackValue,
        pierce: wd.pierce || 0,
        range: wd.projRange || 18,
        color,
        homing: wd.homing || 0,
        burn: wd.burn || 0,
        chain: wd.chain || 0,
      });
    }
  }

  /** 弹道命中怪物：暴击判定 + 伤害 + 飘字 + 灼烧/连锁 */
  private onProjectileHit(mob: Mob, baseDmg: number, burn = 0, chain = 0): void {
    const crit = Math.random() < 0.15;
    const dmg = Math.round(baseDmg * (crit ? 1.8 : 1));
    this.spawnFxColor(mob.x, mob.y + mob.def.height * mob.scale * 0.5, mob.z, '#ECEFF1');
    this.playSfx('sfx_hit', 0.8);
    const died = mob.takeDamage(dmg, 0, 0, burn);
    this.pushDmgText(mob, dmg, crit);
    if (chain) this.applyChain(mob, dmg, chain);
    if (died) this.onMobKilled(mob);
  }

  /** 命中飘字：怪物头顶白色数字，暴击金色大字 */
  private pushDmgText(mob: Mob, n: number, crit: boolean): void {
    this.dmgTexts.push({
      x: mob.x, y: mob.y + mob.def.height * mob.scale + 0.35, z: mob.z, t: 0.6, n, crit,
    });
  }

  /** 爆炸词缀：命中点半径内其余敌人受到 50% 溅射伤害 */
  private applySplash(center: Mob, n: number, radius: number): void {
    for (const m of this.mobs.mobs) {
      if (m === center || !m.alive) continue;
      const dx = m.x - center.x;
      const dz = m.z - center.z;
      if (dx * dx + dz * dz > radius * radius) continue;
      if (Math.abs(m.y - center.y) > 2.5) continue;
      const died = m.takeDamage(n, 0, 0, 0);
      this.pushDmgText(m, n, false);
      if (died) this.onMobKilled(m);
    }
    this.spawnFxColor(center.x, center.y + 0.9, center.z, '#FFB74D');
  }

  /** 连锁词缀：电弧跳向最近敌人，每跳伤害衰减 30% */
  private applyChain(from: Mob, baseDmg: number, jumps: number): void {
    const visited = new Set<Mob>([from]);
    let cur = from;
    let dmg = baseDmg;
    for (let j = 0; j < jumps; j++) {
      dmg = Math.max(1, Math.round(dmg * 0.7));
      let next: Mob | null = null;
      let bestD = 4.5 * 4.5;
      for (const m of this.mobs.mobs) {
        if (!m.alive || visited.has(m)) continue;
        const dx = m.x - cur.x;
        const dz = m.z - cur.z;
        const dd = dx * dx + dz * dz;
        if (dd < bestD) { bestD = dd; next = m; }
      }
      if (!next) break;
      visited.add(next);
      this.spawnFxColor(next.x, next.y + next.def.height * next.scale * 0.6, next.z, '#FFEB3B');
      const died = next.takeDamage(dmg, 0, 0, 0);
      this.pushDmgText(next, dmg, false);
      if (died) this.onMobKilled(next);
      cur = next;
    }
  }

  private onMobKilled(mob: Mob): void {
    if ((mob as any)._dropDone) return;
    (mob as any)._dropDone = true;
    // 击杀加速大招充能
    for (const s of this.ults) s.charge = Math.min(100, s.charge + GameRoot.ULT_KILL_BONUS);
    // v2.5 新怪物倒地音效（低音量，和攻击音区分）
    const dieSfx = this.mobSfxName(mob.def.kind);
    if (dieSfx) this.playSfx(dieSfx, 0.5);
    // v2.0 死亡爆开：12 个体色方块向外飞散（约 0.4s）
    const bx = mob.x, by = mob.y + mob.def.height * mob.scale * 0.5, bz = mob.z;
    for (let i = 0; i < 12; i++) this.spawnFxColor(bx, by, bz, mob.bodyColor);
    if (mob.def.worldBoss && this.mode === 'treasure') {
      // 世界 BOSS（仅寻宝模式）：大宝箱 3 件奖励直接入包，本局不再刷新
      this.kills++;
      this.banner = `👑 讨伐成功 · ${mobName(mob.def.kind)}`;
      this.bannerSub = 'BOSS 大宝箱已开启 · 传说奖励入包';
      this.bannerT = 3.2;
      this.playSfx('sfx_win');
      const loot = rollBossLoot(this.ownedWeaponIds(), this.wave);
      for (const it of loot) {
        if (it.slot === 'weapon') this.pickupWeapon(it); else this.applyEquip(it);
      }
      if (loot.length) {
        this.pushToast(`大宝箱：${loot.map((i) => i.name).join('、')}`, '#FFD54F');
      }
      return;
    }
    if (mob.def.hostile) {
      this.kills++;
      // 毒物怪死亡释放毒雾
      if (mob.def.poisonCloud) {
        const pc = mob.def.poisonCloud;
        this.poisonClouds.push({
          x: mob.x, y: mob.y + 0.4, z: mob.z,
          r: pc.radius, t: pc.duration, dps: pc.dps,
        });
      }
      const item = rollDrop(this.wave);
      if (item) {
        this.drops.spawnEquip(mob.x, mob.y + 0.3, mob.z, item);
        this.pushToast(`${mobName(mob.def.kind)} 掉落了 ${item.name}`, TIER_COLORS[item.tier]);
      }
      // v2.0 消耗品掉落（精英/BOSS 额外能量药水）
      const cons = rollConsumableDrop(this.wave, mob.def.worldBoss || mob.scale >= 2);
      if (cons) this.drops.spawnConsumable(mob.x, mob.y + 0.3, mob.z, cons);
    } else {
      // 小动物掉补血包
      this.drops.spawnHeal(mob.x, mob.y + 0.3, mob.z, 10);
    }
  }

  private hurtPlayer(n: number, kx = 0, kz = 0): void {
    if (this.invT > 0 || this.state !== 'playing') return;
    let dmg = Math.max(1, Math.round(n * (1 - this.armorValue)));
    // 护盾先于 HP 扣减
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
      if (this.shield <= 0) this.shieldT = 0;
    }
    if (dmg <= 0) {
      this.playSfx('sfx_hurt', 0.5);
      this.hurtT = 0.4;
      for (let i = 0; i < 4; i++) this.spawnFxColor(this.player.pos.x, this.player.pos.y + 1, this.player.pos.z, '#4FC3F7');
      return;
    }
    this.hp -= dmg;
    this.playSfx('sfx_hurt', 0.8);
    this.hurtT = 1;
    this.shakeT = 0.25;
    this.player.vel.x += kx;
    this.player.vel.z += kz;
    this.player.vel.y += 2.5;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead';
      this.jumpHeld = false;
      this.joyX = 0;
      this.joyY = 0;
    }
  }

  /** 毒雾更新：倒计时 / 玩家碰撞中毒 / 中毒 DOT */
  private updatePoison(d: number): void {
    // 毒雾倒计时 + 视觉粒子
    for (let i = this.poisonClouds.length - 1; i >= 0; i--) {
      const c = this.poisonClouds[i];
      c.t -= d;
      if (Math.random() < d * 6) {
        this.spawnFxColor(
          c.x + (Math.random() - 0.5) * c.r * 1.5,
          c.y + Math.random() * 1.2,
          c.z + (Math.random() - 0.5) * c.r * 1.5,
          '#81C784',
        );
      }
      if (c.t <= 0) {
        this.poisonClouds.splice(i, 1);
        continue;
      }
      // 玩家踏入毒雾 → 中毒（3s，每秒 dps）
      const pdx = this.player.pos.x - c.x;
      const pdz = this.player.pos.z - c.z;
      if (pdx * pdx + pdz * pdz < c.r * c.r) {
        this.poisonT = Math.max(this.poisonT, 3);
        this.poisonDps = Math.max(this.poisonDps, c.dps);
      }
    }
    // 中毒 DOT
    if (this.poisonT > 0) {
      this.poisonT -= d;
      this.poisonAcc += d * this.poisonDps;
      while (this.poisonAcc >= 1) {
        this.poisonAcc -= 1;
        this.hp -= 1;
        if (this.hp <= 0) {
          this.hp = 0;
          this.state = 'dead';
          this.jumpHeld = false;
          break;
        }
      }
      if (this.poisonT <= 0) {
        this.poisonT = 0;
        this.poisonDps = 0;
        this.poisonAcc = 0;
      }
    }
    // v2.3 玩家灼烧 DOT（灼烧词缀怪命中附加，橙色受击闪）
    if (this.burnT > 0) {
      this.burnT -= d;
      this.burnAcc += d * this.burnDps;
      while (this.burnAcc >= 1) {
        this.burnAcc -= 1;
        this.hp -= 1;
        this.hurtT = Math.max(this.hurtT, 0.12);
        if (this.hp <= 0) {
          this.hp = 0;
          this.state = 'dead';
          this.jumpHeld = false;
          break;
        }
      }
      if (this.burnT <= 0) {
        this.burnT = 0;
        this.burnDps = 0;
        this.burnAcc = 0;
      }
    }
  }

  // ---------------- v2.0 消耗品栏 ----------------
  /** 获得消耗品（同 id 自动堆叠，受 stackMax 限制）；返回是否成功 */
  private addConsumable(id: ConsumableId, n = 1): boolean {
    const def = CONSUMABLES[id];
    const stack = this.consumables.find((c) => c && c.id === id);
    if (stack) {
      const room = def.stackMax - stack.count;
      if (room <= 0) return false;
      stack.count += Math.min(room, n);
      return true;
    }
    const empty = this.consumables.indexOf(null);
    if (empty < 0) return false;
    this.consumables[empty] = { id, count: Math.min(def.stackMax, n) };
    return true;
  }

  /** 调试/自动化测试入口：直接发放消耗品 */
  debugGiveConsumable(id: ConsumableId, n = 1): boolean {
    return this.addConsumable(id, n);
  }

  /** 调试：按 id 使用消耗品（自动化测试用） */
  debugUseConsumable(id: ConsumableId): boolean {
    const i = this.consumables.findIndex((c) => c && c.id === id);
    if (i < 0) return false;
    this.useConsumable(i);
    return true;
  }

  /** 调试：炸弹快照（不含 node 引用） */
  debugBombState(): Array<{ x: number; y: number; z: number; fuse: number }> {
    return this.bombs.map((b) => ({ x: b.x, y: b.y, z: b.z, fuse: b.fuse }));
  }

  /** 调试：最后一次炸弹爆炸的位置与命中数 */
  debugLastBoom(): { x: number; y: number; z: number; hit: number } | null {
    return this.lastBoom;
  }

  /** 调试：一键炸弹自检（开始游戏 → 落点周围生成僵尸 → 持雷 → 掷出） */
  debugBombTest(): string {
    this.beginPlay();
    const targets: Mob[] = [];
    for (const z of [0.0, 1.5, 3.0]) {
      const m = this.mobs.spawn('zombie', 0.5, z);
      if (m) targets.push(m);
    }
    this.addConsumable('p_bomb', 1);
    this.debugUseConsumable('p_bomb');
    this.attackCd = 0;
    const fired = this.tryAttack();
    return JSON.stringify({
      fired,
      bombs: this.debugBombState(),
      mobs: targets.map((m) => ({ z: m.z, hp: m.hp, alive: m.alive })),
    });
  }

  /** 调试：炸弹自检结果（爆炸位置 + 命中/击杀数） */
  debugBombResult(): string {
    return JSON.stringify({ boom: this.lastBoom, bombs: this.debugBombState() });
  }

  // ---------------- 阶段五调试：新怪 / 波次 / 毒雾 ----------------
  /** 生成一只指定怪物并返回基础属性快照 */
  debugSpawnMob(kind: MobKind, x = 0, z = 3): string {
    const m = this.mobs.spawn(kind, x, z);
    if (!m) return JSON.stringify({ ok: false });
    return JSON.stringify({
      ok: true, kind, name: m.def.name, hp: m.hp, maxHp: m.maxHp, dmg: m.dmg,
      aoe: m.def.aoe || 0, windup: m.def.windup || 0, flying: !!m.def.flying,
      parry: m.def.parryChance || 0, poison: !!m.def.poisonCloud,
      y: Math.round(m.y * 100) / 100,
    });
  }

  /** 跳到第 n 波（仅斗兽场生效） */
  debugJumpToWave(n: number): string {
    if (this.mode !== 'arena') this.enterArena();
    this.arenaCd = 0;
    this.mobs.clear();
    this.spawnQueue.length = 0;
    this.wave = n - 1;
    this.nextWave();
    this.betweenT = 0;
    this.waveActive = true;
    return JSON.stringify({ wave: this.wave, queue: this.spawnQueue, noTimer: this.waveNoTimer });
  }

  /** 毒雾与玩家中毒状态快照 */
  debugPoisonState(): string {
    return JSON.stringify({
      clouds: this.poisonClouds.map((c) => ({ r: c.r, t: Math.round(c.t * 10) / 10, dps: c.dps })),
      poisonT: Math.round(this.poisonT * 10) / 10,
      poisonDps: this.poisonDps,
      hp: Math.round(this.hp),
    });
  }

  /** 一键验证：生成 4 种新怪并返回属性对比 */
  debugStage5Mobs(): string {
    this.beginPlay();
    const kinds: MobKind[] = ['troll', 'gas', 'bat', 'samurai'];
    const out: any[] = [];
    let z = 3;
    for (const k of kinds) {
      const m = this.mobs.spawn(k, 0, z);
      z += 2.5;
      if (m) out.push({ kind: k, name: m.def.name, hp: m.maxHp, dmg: m.dmg, y: Math.round(m.y * 100) / 100 });
    }
    return JSON.stringify(out);
  }

  /** 一键验证毒气云：生成毒物怪 → 杀死 → 玩家移到毒雾中 → 返回毒雾与中毒状态 */
  debugGasCloudTest(): string {
    this.beginPlay();
    this.mobs.clear();
    this.poisonClouds.length = 0;
    const m = this.mobs.spawn('gas', 0, 3);
    if (!m) return JSON.stringify({ ok: false, reason: 'spawn failed' });
    const cx = m.x, cz = m.z;
    // 杀死毒物怪触发 onMobKilled → 释放毒雾
    m.takeDamage(999, 0, 0);
    // 手动触发死亡掉落（游戏循环会自动调，但立即验证需要手动调一次）
    this.onMobKilled(m);
    // 把玩家移到毒雾中心
    this.player.spawn(cx, this.player.pos.y, cz);
    return JSON.stringify({
      cloudAt: { x: Math.round(cx * 100) / 100, z: Math.round(cz * 100) / 100 },
      clouds: this.poisonClouds.map((c) => ({ r: c.r, t: Math.round(c.t * 10) / 10, dps: c.dps })),
    });
  }

  /** 使用第 i 格消耗品（治疗/能量/护盾立即生效，炸弹进入持雷） */
  private useConsumable(i: number): void {
    if (this.state !== 'playing' || this.overlay !== 'none') return;
    const c = this.consumables[i];
    if (!c) return;
    switch (c.id) {
      case 'p_heal':
        if (this.hp >= this.maxHp) {
          this.pushToast('生命已满', 'rgba(255,255,255,0.7)');
          return;
        }
        this.hp = Math.min(this.maxHp, this.hp + 40);
        for (let k = 0; k < 5; k++) {
          this.spawnFxColor(this.player.pos.x, this.player.pos.y + 1 + k * 0.12, this.player.pos.z, '#7BE38A');
        }
        this.pushToast('治疗 +40 HP', '#7BE38A');
        break;
      case 'p_energy':
        this.energyT = 10;
        this.pushToast('能量涌动 · 攻速 ×1.8（10s）', '#FFD54F');
        break;
      case 'p_bomb':
        this.bombArmed = true;
        this.pushToast('炸弹已就绪 · 攻击键掷出', '#FF8A65');
        break;
      case 'p_shield':
        this.shield = 30;
        this.shieldT = 20;
        this.pushToast('护盾 +30（20s）', '#4FC3F7');
        break;
    }
    this.playSfx('sfx_pickup', 0.8);
    c.count--;
    if (c.count <= 0) this.consumables[i] = null;
  }

  /** 掷炸弹：抛物线飞行约 5m，落地后引信 1.2s 爆炸（半径 3m / 60 伤害） */
  private throwBomb(dir: Vec3): void {
    if (!this.bombMesh) {
      this.bombMesh = buildBoxesMesh([
        { x: -0.16, y: -0.16, z: -0.16, w: 0.32, h: 0.32, d: 0.32, color: '#263238' },
        { x: -0.05, y: 0.16, z: -0.05, w: 0.1, h: 0.1, d: 0.1, color: '#5D4037' },
        { x: -0.03, y: 0.26, z: -0.03, w: 0.06, h: 0.06, d: 0.06, color: '#FFB300' },
      ]);
    }
    const node = new Node('bomb');
    node.parent = this.world.root;
    const x = this.player.eyeX + dir.x * 0.4;
    const y = this.player.eyeY - 0.1;
    const z = this.player.eyeZ + dir.z * 0.4;
    node.setPosition(x, y, z);
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = this.bombMesh;
    mr.setSharedMaterial(getVoxMaterial(), 0);
    this.bombs.push({ node, x, y, z, vx: dir.x * 6.5, vy: 3.2, vz: dir.z * 6.5, fuse: -1 });
    this.playSfx('sfx_swing', 0.8);
  }

  private updateBombs(dt: number): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (b.fuse < 0) {
        b.vy -= 12 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        if (this.world.isSolidAt(b.x, b.y, b.z) || b.y < SEA_LEVEL) {
          // 落地：回退一小步，贴地并点燃引信
          b.x -= b.vx * dt;
          b.z -= b.vz * dt;
          const gy = this.world.findGroundY(b.x, b.z);
          if (gy >= 0) b.y = gy + 0.2;
          b.vx = 0;
          b.vz = 0;
          b.fuse = 1.2;
        }
        b.node.setPosition(b.x, b.y, b.z);
        b.node.setRotationFromEuler(0, 0, 0);
        continue;
      }
      b.fuse -= dt;
      const s = 1 + Math.sin((1.2 - b.fuse) * 20) * 0.12;
      b.node.setScale(s, s, s);
      if (b.fuse <= 0) {
        this.bombExplode(b.x, b.y, b.z);
        b.node.destroy();
        this.bombs.splice(i, 1);
      }
    }
  }

  /** 炸弹爆炸：只对怪物造成 60 点范围伤害（半径 3m） */
  private bombExplode(x: number, y: number, z: number): void {
    this.playSfx('sfx_hit', 1);
    this.shakeT = Math.max(this.shakeT, 0.3);
    for (let i = 0; i < 10; i++) this.spawnFxColor(x, y + 0.3, z, '#FF7043');
    for (let i = 0; i < 6; i++) this.spawnFxColor(x, y + 0.5, z, '#FFD54F');
    let hit = 0;
    let kill = 0;
    for (const m of this.mobs.mobs) {
      if (!m.alive) continue;
      const dx = m.x - x;
      const dz = m.z - z;
      if (dx * dx + dz * dz > 3 * 3) continue;
      if (Math.abs(m.y + m.def.height * m.scale * 0.5 - y) > 3) continue;
      hit++;
      const died = m.takeDamage(60, dx * 2, dz * 2, 0);
      this.pushDmgText(m, 60, false);
      if (died) {
        kill++;
        this.onMobKilled(m);
      }
    }
    this.lastBoom = { x, y, z, hit, kill };
  }

  /** 苦力怕爆炸：破坏方块 + 范围伤害 */
  private explode(x: number, y: number, z: number, baseDmg: number): void {
    const R = 2.6;
    const x0 = Math.floor(x - R);
    const x1 = Math.floor(x + R);
    const y0 = Math.max(1, Math.floor(y - R));
    const y1 = Math.floor(y + R);
    const z0 = Math.floor(z - R);
    const z1 = Math.floor(z + R);
    let removed = 0;
    for (let by = y0; by <= y1 && removed < 220; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          const ddx = bx + 0.5 - x;
          const ddy = by + 0.5 - y;
          const ddz = bz + 0.5 - z;
          if (ddx * ddx + ddy * ddy + ddz * ddz > R * R) continue;
          const b = this.world.getBlock(bx, by, bz);
          if (b === BlockType.AIR || b === BlockType.WATER) continue;
          this.world.setBlock(bx, by, bz, BlockType.AIR);
          removed++;
        }
      }
    }

    // 波及玩家
    const dx = this.player.pos.x - x;
    const dy = (this.player.pos.y + 0.9) - y;
    const dz = this.player.pos.z - z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 4.2) {
      const dmgMul = this.wave <= 1 ? 0.5 : this.wave === 2 ? 0.75 : 1 + Math.max(0, this.wave - 3) * 0.12;
      this.hurtPlayer(baseDmg * dmgMul * (1 - d / 4.5), (dx / (d || 1)) * 7, (dz / (d || 1)) * 7);
    }
    // 波及其它怪物
    for (const mob of this.mobs.mobs) {
      if (!mob.alive || mob.def.explode) continue;
      const mdx = mob.x - x;
      const mdz = mob.z - z;
      const md = Math.sqrt(mdx * mdx + mdz * mdz);
      if (md < 3.5) {
        const died = mob.takeDamage(Math.round(baseDmg * 0.5), mdx * 2, mdz * 2);
        if (died) this.onMobKilled(mob);
      }
    }
    this.spawnFx(x, y + 0.5, z, 1, 10);
    this.spawnFx(x, y + 0.5, z, 2, 6);
    this.shakeT = Math.max(this.shakeT, 0.35);
  }

  // ---------------- 广告 ----------------
  /**
   * 拉取一次激励视频：真实环境走 wx 激励视频，否则走 3 秒模拟面板。
   * 模拟面板由 update() 倒计时，到期 resolve（方便上线前验收）。
   */
  private showAd(scene: AdScene): Promise<AdResult> {
    if (AdService.isReal(scene)) return AdService.showRewarded(scene);
    this.adPurpose = scene;
    this.adT = scene === 'ult' ? AD_MOCK_SECONDS_ULT : AD_MOCK_SECONDS;
    this.overlay = 'ad';
    this.jumpHeld = false;
    return new Promise<AdResult>((resolve) => {
      this.mockAdResolve = resolve;
    });
  }

  /** 模拟广告倒计时结束：视为「看完」并 resolve */
  private finishMockAd(): void {
    this.adT = 0;
    if (this.overlay === 'ad') this.overlay = 'none';
    const r = this.mockAdResolve;
    this.mockAdResolve = null;
    if (r) r({ status: 'rewarded', scene: this.adPurpose, mock: true });
  }

  /** 统一广告入口：看完发奖；中途关闭 / 不可用给提示 */
  private openAd(scene: AdScene, onGrant: () => void, onFail?: () => void): void {
    this.showAd(scene).then((res) => {
      if (res.status === 'rewarded') {
        onGrant();
      } else if (res.status === 'unavailable') {
        // 广告拉取失败：绝世武器按文档「免费发放」，其余仅提示
        if (scene === 'legend') {
          onGrant();
          this.pushToast('广告暂不可用，已免费发放', '#FF8A3D');
        } else {
          if (onFail) onFail();
          this.pushToast('广告暂不可用，请稍后再试', '#FF8A3D');
        }
      } else {
        if (onFail) onFail();
        this.pushToast('广告未看完，未获得奖励', '#FF8A3D');
      }
      if (this.overlay === 'ad') this.overlay = 'none';
    });
  }

  /** 右侧宝剑按钮：看广告获得绝世武器，不限领取次数 */
  private onLegendClick(): void {
    if (this.state !== 'playing' || this.overlay !== 'none') return;
    this.openAd('legend', () => this.grantLegendary());
  }

  /** 发放传说武器：优先未拥有的 tier5；全都有则给随机一把 +5（上限 +10） */
  private grantLegendary(): void {
    const legend = pickLegendary(this.ownedWeaponIds(), this.wave);
    if (legend) {
      const slot = this.pickupWeapon(legend);
      if (slot > 0) this.selectSlot(slot);
      this.switchWeaponFx(legend.color);
      this.pushToast(`绝世武器 · ${legend.name}（攻${legend.dmg}）`, '#FFD54F');
      return;
    }
    const pool = WEAPONS.filter((w) => w.tier === 5);
    const fallback = pool[(Math.random() * pool.length) | 0];
    const idx = this.backpack.findIndex((b) => b && b.def.id === fallback.id);
    if (idx >= 0) {
      const b = this.backpack[idx]!;
      b.bonus = Math.min(10, b.bonus + 5);
      this.selectSlot(idx + 1);
      this.switchWeaponFx(fallback.color);
      this.pushToast(`${fallback.name} 强化 +${b.bonus}`, '#FFD54F');
    } else {
      this.pushToast('传说武器都已收入囊中', 'rgba(255,255,255,0.75)');
    }
  }

  /** 看广告发放大招次数 */
  private grantUltCharges(index: number): void {
    const s = this.ults[index];
    if (!s) return;
    s.charges = Math.min(9, s.charges + GameRoot.ULT_AD_USES);
    this.overlay = 'none';
    this.pushToast(`「${s.name}」解锁 ${GameRoot.ULT_AD_USES} 次`, s.color);
  }

  /** 看广告复活 */
  private reviveByAd(): void {
    this.hp = this.maxHp;
    this.invT = 3;
    this.state = 'playing';
    this.overlay = 'none';
    this.jumpHeld = false;
    this.pushToast('复活成功！3 秒无敌', '#7BE38A');
  }

  /** 看广告领随机装备（角色面板广告位） */
  private grantAdEquip(): void {
    const item = rollDrop(this.wave + 2, true);
    if (item) this.applyEquip(item);
    this.overlay = 'character';
  }

  /** v2.2 物品栏图鉴右下角：看广告免费领装备（必得 T3/T4） */
  private grantBagAdEquip(): void {
    const pool: EquipDef[] = [];
    for (const list of [WEAPONS, HELMETS, ARMORS, RINGS, TOOLS]) {
      for (const it of list) if (it.tier >= 3 && it.tier <= 4) pool.push(it);
    }
    const item = pool[(Math.random() * pool.length) | 0];
    if (item) this.applyEquip(item);
    this.overlay = 'bag';
  }

  // ---------------- 方块交互 ----------------
  private placeBlock(): void {
    if (!this.target) return;
    if (this.actionCd > 0) return;
    if (this.selected !== 0) return; // 仅第1格（石块）可放置
    const b = HOTBAR_BLOCKS[2]; // STONE
    const px = this.target.x + this.target.nx;
    const py = this.target.y + this.target.ny;
    const pz = this.target.z + this.target.nz;
    if (py < 0 || py >= 48) return;
    const cur = this.world.getBlock(px, py, pz);
    if (cur !== BlockType.AIR && cur !== BlockType.WATER) return;
    if (this.world.overlapsPlayer(px, py, pz, this.player.pos.x, this.player.pos.y, this.player.pos.z,
      this.player.hw, this.player.height)) return;

    this.world.setBlock(px, py, pz, b);
    this.actionCd = 0.14 * this.attackCdMul;
  }

  private breakBlock(): void {
    if (!this.target) return;
    if (this.actionCd > 0) return;
    if (this.target.y <= 0) return;
    // v2.1 斗兽场规则：只能放置，不能破坏
    if (this.mode === 'arena' && isInArena(this.target.x, this.target.z)) {
      this.pushToast('斗兽场不可破坏', '#FF8A3D');
      this.actionCd = 0.3;
      return;
    }
    this.world.setBlock(this.target.x, this.target.y, this.target.z, BlockType.AIR);
    this.actionCd = 0.14 * this.attackCdMul;
  }

  /** 切换第一/第三人称视角 */
  private toggleViewMode(): void {
    this.viewMode = this.viewMode === 0 ? 1 : 0;
    if (this.playerNode) this.playerNode.active = this.viewMode === 1;
    if (this.viewModel) this.viewModel.active = this.viewMode === 0;
    this.pushToast(this.viewMode === 1 ? '第三人称视角' : '第一人称视角', 'rgba(255,255,255,0.85)');
  }

  // ---------------- 特效 ----------------
  private spawnFx(x: number, y: number, z: number, meshIdx: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const node = new Node('fx');
      node.parent = this.world.root;
      node.setPosition(x, y, z);
      const mr = node.addComponent(MeshRenderer);
      mr.mesh = this.fxMeshes[meshIdx % this.fxMeshes.length];
      mr.setSharedMaterial(getVoxMaterial(), 0);
      const a = Math.random() * Math.PI * 2;
      const v = 1.5 + Math.random() * 2.5;
      const ttl = 0.3 + Math.random() * 0.25;
      this.fx.push({
        node,
        vel: new Vec3(Math.sin(a) * v, 2 + Math.random() * 3, Math.cos(a) * v),
        ttl,
        ttl0: ttl,
      });
    }
  }

  /** 按品质色生成单个粒子（换装 / 开箱用），网格按颜色缓存复用 */
  private spawnFxColor(x: number, y: number, z: number, color: string): void {
    let mesh = this.fxColorMeshes[color];
    if (!mesh) {
      mesh = buildBoxesMesh([{ x: -0.06, y: -0.06, z: -0.06, w: 0.12, h: 0.12, d: 0.12, color }]);
      this.fxColorMeshes[color] = mesh;
    }
    const node = new Node('fx');
    node.parent = this.world.root;
    node.setPosition(x, y, z);
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = mesh;
    mr.setSharedMaterial(getVoxMaterial(), 0);
    const a = Math.random() * Math.PI * 2;
    const v = 1.2 + Math.random() * 2;
    const ttl = 0.36 + Math.random() * 0.08; // 约 0.4s，与文档一致
    this.fx.push({
      node,
      vel: new Vec3(Math.sin(a) * v, 1.6 + Math.random() * 2.4, Math.cos(a) * v),
      ttl,
      ttl0: ttl,
    });
  }

  private updateDmgTexts(dt: number): void {
    for (let i = this.dmgTexts.length - 1; i >= 0; i--) {
      const t = this.dmgTexts[i];
      t.t -= dt;
      if (t.t <= 0) this.dmgTexts.splice(i, 1);
    }
  }

  private updateFx(dt: number): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.ttl -= dt;
      if (f.ttl <= 0) {
        f.node.destroy();
        this.fx.splice(i, 1);
        continue;
      }
      f.vel.y -= 12 * dt;
      const p = f.node.position;
      f.node.setPosition(p.x + f.vel.x * dt, p.y + f.vel.y * dt, p.z + f.vel.z * dt);
      const s = Math.max(0.05, f.ttl / f.ttl0);
      f.node.setScale(s, s, s);
    }
  }

  // ---------------- v2.5 大招 ----------------
  /** 每帧推进：充能 / 冷却 / 全屏演出 / 3D 特效 / 延迟触发 */
  private tickUlts(d: number): void {
    for (const s of this.ults) {
      if (s.cd > 0) s.cd = Math.max(0, s.cd - d);
      if (s.charge < 100) s.charge = Math.min(100, s.charge + GameRoot.ULT_TIME_RATE * d);
    }
    if (this.ultShow) {
      this.ultShow.t -= d;
      if (this.ultShow.t <= 0) this.ultShow = null;
    }
    // 延迟触发（陨石落地、连环落雷）
    if (this.ultTimers.length) {
      const due: Array<() => void> = [];
      for (let i = this.ultTimers.length - 1; i >= 0; i--) {
        const it = this.ultTimers[i];
        it.t -= d;
        if (it.t <= 0) {
          due.push(it.fn);
          this.ultTimers.splice(i, 1);
        }
      }
      for (const fn of due) fn();
    }
    // 3D 大招特效
    for (let i = this.ultFxList.length - 1; i >= 0; i--) {
      const f = this.ultFxList[i];
      f.t += d;
      const p = Math.min(1, f.t / f.ttl);
      if (f.node.isValid) f.tick(f.node, p);
      if (f.t >= f.ttl) {
        if (f.node.isValid) f.node.destroy();
        this.ultFxList.splice(i, 1);
      }
    }
  }

  private later(sec: number, fn: () => void): void {
    this.ultTimers.push({ t: sec, fn });
  }

  private addUltFx(node: Node, ttl: number, tick: (n: Node, p: number) => void): void {
    this.ultFxList.push({ node, t: 0, ttl, tick });
  }

  /** 按 key 缓存的大招特效网格 */
  private ultMesh(key: string, make: () => BoxDef[]): Mesh {
    let mesh = this.fxColorMeshes[key];
    if (!mesh) {
      mesh = buildBoxesMesh(make());
      this.fxColorMeshes[key] = mesh;
    }
    return mesh;
  }

  private newUltNode(key: string, boxes: () => BoxDef[]): Node {
    const node = new Node('ultFx');
    node.parent = this.world.root;
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = this.ultMesh(key, boxes);
    mr.setSharedMaterial(getVoxMaterial(), 0);
    return node;
  }

  /** 向外扩散的地面光环 */
  private spawnUltRing(x: number, y: number, z: number, radius: number, color: string, ttl = 0.5): void {
    const node = this.newUltNode('ultRing' + color, () => {
      const boxes: BoxDef[] = [];
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        boxes.push({ x: Math.cos(a) - 0.06, y: -0.03, z: Math.sin(a) - 0.06, w: 0.13, h: 0.06, d: 0.13, color });
      }
      return boxes;
    });
    node.setPosition(x, y + 0.06, z);
    node.setScale(radius * 0.3, 1, radius * 0.3);
    this.addUltFx(node, ttl, (n, p) => {
      const s = radius * (0.3 + p * 0.85);
      n.setScale(s, 1, s);
    });
  }

  /** 从天而降的光柱 */
  private spawnUltBeam(x: number, y: number, z: number, height: number, color: string, ttl = 0.4): void {
    const node = this.newUltNode('ultBeam' + color, () => [
      { x: -0.3, y: 0, z: -0.3, w: 0.6, h: 1, d: 0.6, color },
    ]);
    node.setPosition(x, y, z);
    this.addUltFx(node, ttl, (n, p) => {
      n.setScale(1 - p * 0.75, height * Math.min(1, p * 3), 1 - p * 0.75);
    });
  }

  /** 沿两点画一段点状电弧（雷霆连锁用） */
  private spawnUltArc(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string): void {
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const jx = (Math.random() - 0.5) * 0.6;
      const jz = (Math.random() - 0.5) * 0.6;
      this.spawnFxColor(x0 + (x1 - x0) * t + jx, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t + jz, color);
    }
    // 白色电弧核心：更细更亮
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.spawnFxColor(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 0.08, z0 + (z1 - z0) * t, '#FFFFFF');
    }
  }

  /** 立起的旋转符文法阵（起手式 / 爆发中心） */
  private spawnUltRuneRing(x: number, y: number, z: number, radius: number, color: string, ttl = 0.7): void {
    const node = this.newUltNode('ultRune' + color, () => {
      const boxes: BoxDef[] = [];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        boxes.push({ x: Math.cos(a) - 0.05, y: 0, z: Math.sin(a) - 0.05, w: 0.1, h: 0.9, d: 0.1, color });
      }
      // 内侧四个更高符文柱
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        boxes.push({ x: Math.cos(a) * 0.7 - 0.07, y: 0, z: Math.sin(a) * 0.7 - 0.07, w: 0.14, h: 1.5, d: 0.14, color: '#FFFFFF' });
      }
      return boxes;
    });
    node.setPosition(x, y + 0.04, z);
    this.addUltFx(node, ttl, (n, p) => {
      const s = radius * (0.5 + p * 0.55);
      n.setScale(s, 1.4 * (1 - p * 0.35), s);
      n.setRotationFromEuler(0, p * 260, 0);
    });
  }

  /** 大块碎屑：陨石岩块 / 冰爆碎片，比普通粒子更大且受重力 */
  private spawnUltDebris(x: number, y: number, z: number, colors: string[], count: number, power = 1): void {
    for (let i = 0; i < count; i++) {
      const color = colors[i % colors.length];
      const size = 0.22 + Math.random() * 0.26;
      const key = `ultChunk${color}${size.toFixed(2)}`;
      let mesh = this.fxColorMeshes[key];
      if (!mesh) {
        mesh = buildBoxesMesh([{ x: -size / 2, y: -size / 2, z: -size / 2, w: size, h: size, d: size, color }]);
        this.fxColorMeshes[key] = mesh;
      }
      const node = new Node('ultDebris');
      node.parent = this.world.root;
      node.setPosition(x, y, z);
      node.setRotationFromEuler(Math.random() * 360, Math.random() * 360, 0);
      const mr = node.addComponent(MeshRenderer);
      mr.mesh = mesh;
      mr.setSharedMaterial(getVoxMaterial(), 0);
      const a = Math.random() * Math.PI * 2;
      const v = (3 + Math.random() * 4) * power;
      const ttl = 0.75 + Math.random() * 0.4;
      this.fx.push({
        node,
        vel: new Vec3(Math.sin(a) * v, (3.5 + Math.random() * 4.2) * power, Math.cos(a) * v),
        ttl,
        ttl0: ttl,
      });
    }
  }

  /** 冰锥：从地面刺出后碎裂，用于冰封大招 */
  private spawnUltSpike(x: number, y: number, z: number, height: number, color: string, ttl = 0.9): void {
    const node = this.newUltNode('ultSpike' + color + height.toFixed(1), () => [
      { x: -0.17, y: 0, z: -0.17, w: 0.34, h: height * 0.62, d: 0.34, color },
      { x: -0.1, y: height * 0.62, z: -0.1, w: 0.2, h: height * 0.26, d: 0.2, color },
      { x: -0.045, y: height * 0.88, z: -0.045, w: 0.09, h: height * 0.12, d: 0.09, color: '#E1F5FE' },
    ]);
    node.setPosition(x, y, z);
    node.setRotationFromEuler(0, Math.random() * 360, 0);
    node.setScale(0.04, 0.04, 0.04);
    this.addUltFx(node, ttl, (n, p) => {
      const grow = p < 0.26 ? p / 0.26 : 1;
      const shrink = p > 0.74 ? 1 - (p - 0.74) / 0.26 : 1;
      const s = Math.max(0.03, grow * shrink);
      n.setScale(s, s, s);
    });
  }

  /** 天空劈下的折线闪电（粒子双层模拟） */
  private spawnUltBolt(x: number, z: number, y: number, color: string): void {
    const n = 9;
    let px = x + (Math.random() - 0.5) * 3;
    let py = y + 13;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const nx = x + (Math.random() - 0.5) * 2.6 * (1 - t);
      const ny = y + 13 * (1 - t);
      for (let k = 1; k <= 2; k++) {
        const tt = k / 2;
        this.spawnFxColor(px + (nx - px) * tt, py + (ny - py) * tt, z + (Math.random() - 0.5) * 0.4, k === 2 ? '#FFFFFF' : color);
      }
      px = nx;
      py = ny;
    }
  }

  /** 上升的能量光球（大招起手） */
  private spawnUltOrb(x: number, y: number, z: number, color: string, ttl = 0.55): void {
    const node = this.newUltNode('ultOrb' + color, () => [
      { x: -0.35, y: -0.35, z: -0.35, w: 0.7, h: 0.7, d: 0.7, color },
      { x: -0.5, y: -0.12, z: -0.12, w: 0.12, h: 0.24, d: 0.24, color: '#FFFFFF' },
      { x: 0.38, y: -0.12, z: -0.12, w: 0.12, h: 0.24, d: 0.24, color: '#FFFFFF' },
    ]);
    node.setPosition(x, y + 0.8, z);
    this.addUltFx(node, ttl, (n, p) => {
      n.setPosition(x, y + 0.8 + p * 2.4, z);
      const s = 0.35 + p * 1.35;
      n.setScale(s, s, s);
      n.setRotationFromEuler(0, p * 540, 0);
    });
  }

  /** 大招范围伤害：可选冰冻（减速）与眩晕 */
  private ultDamage(x: number, z: number, radius: number, dmg: number, stun = 0, slow = 0): number {
    const r2 = radius * radius;
    let hits = 0;
    for (const m of this.mobs.mobs) {
      if (!m.alive) continue;
      const dx = m.x - x;
      const dz = m.z - z;
      if (dx * dx + dz * dz > r2) continue;
      if (Math.abs(m.y - this.player.pos.y) > 9) continue;
      const died = m.takeDamage(dmg, dx * 0.35, dz * 0.35, 0);
      if (stun > 0 && !m.def.worldBoss) m.applyStun(stun);
      if (slow > 0) m.applySlow(slow, 2.6);
      this.pushDmgText(m, dmg, true);
      if (died) this.onMobKilled(m);
      hits++;
    }
    return hits;
  }

  /** 释放第 index 个大招 */
  private castUlt(index: number): void {
    if (this.state !== 'playing' || this.overlay !== 'none' || this.mapSwitchT > 0) return;
    const s = this.ults[index];
    if (!s || s.cd > 0) return;
    if (s.charge < 100 && s.charges <= 0) {
      this.pushToast(`「${s.name}」能量不足 ${Math.floor(s.charge)}%`, 'rgba(255,255,255,0.82)');
      return;
    }
    if (s.charge >= 100) s.charge = 0;
    else s.charges--;
    s.cd = 1.1;
    this.ultShow = { id: s.id, name: s.name, color: s.color, t: 1.5, total: 1.5 };
    this.shakeT = Math.max(this.shakeT, 0.6);
    // 起手式：脚下升起能量光球 + 法阵
    this.spawnUltOrb(this.player.pos.x, this.player.pos.y, this.player.pos.z, s.color, 0.6);
    this.spawnUltRuneRing(this.player.pos.x, this.player.pos.y, this.player.pos.z, 4.2, s.color, 0.8);
    this.playSfx('sfx_win', 0.7);
    if (s.id === 'meteor') this.castMeteor();
    else if (s.id === 'thunder') this.castThunder();
    else this.castFrost();
  }

  /** 陨石天降：5 颗陨石依次砸落，大范围高额伤害 */
  private castMeteor(): void {
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    const yaw = this.camNode.eulerAngles.y * Math.PI / 180;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const dmg = 260 + this.wave * 10;
    for (let i = 0; i < 5; i++) {
      let x: number;
      let z: number;
      if (i === 0) {
        x = px + fx * 6;
        z = pz + fz * 6;
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 11;
        x = px + Math.sin(a) * r;
        z = pz + Math.cos(a) * r;
      }
      this.later(0.12 + i * 0.14, () => this.meteorLand(x, z, dmg));
    }
  }

  private meteorLand(x: number, z: number, dmg: number): void {
    const gy = this.world.findGroundY(x, z);
    const y = gy > 0 ? gy + 0.05 : this.player.pos.y;
    // 落点预警环（陨石下落期间可见）
    this.spawnUltRing(x, y, z, 2.2, '#FF7043', 0.34);
    // 下落陨石
    const rock = this.newUltNode('ultRock', () => [
      { x: -0.55, y: -0.55, z: -0.55, w: 1.1, h: 1.1, d: 1.1, color: '#4A3A34' },
      { x: -0.6, y: -0.2, z: -0.1, w: 0.22, h: 0.3, d: 0.9, color: '#FF7043' },
      { x: -0.2, y: -0.62, z: -0.4, w: 0.8, h: 0.24, d: 0.3, color: '#FFD54F' },
    ]);
    rock.setPosition(x, y + 20, z);
    rock.setScale(1.5, 1.5, 1.5);
    let trail = 0;
    this.addUltFx(rock, 0.3, (n, p) => {
      n.setPosition(x, y + 20 * (1 - p), z);
      n.setRotationFromEuler(p * 420, p * 320, 0);
      // 尾焰：每隔几帧喷出火星
      if (++trail % 3 === 0) {
        this.spawnFxColor(n.position.x, n.position.y + 0.6, n.position.z, p < 0.55 ? '#FFD54F' : '#FF7043');
      }
    });
    this.later(0.3, () => {
      this.ultDamage(x, z, 4.6, dmg);
      // 双重冲击环 + 法阵 + 岩块崩飞
      this.spawnUltRing(x, y, z, 4.6, '#FFB74D', 0.5);
      this.spawnUltRing(x, y, z, 6.6, '#FFD54F', 0.42);
      this.spawnUltRuneRing(x, y, z, 3.4, '#FF7043', 0.6);
      this.spawnUltBeam(x, y, z, 8, '#FF7043', 0.36);
      this.spawnUltBeam(x, y, z, 8, '#FFF3E0', 0.2);
      for (let i = 0; i < 16; i++) this.spawnFxColor(x, y + 0.7, z, '#FF7043');
      for (let i = 0; i < 10; i++) this.spawnFxColor(x, y + 1.1, z, '#FFD54F');
      this.spawnUltDebris(x, y + 0.5, z, ['#4A3A34', '#FF7043', '#FFD54F'], 12, 1);
      // 地面灼烧痕迹
      const scorch = this.newUltNode('ultScorch', () => {
        const boxes: BoxDef[] = [];
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 3.2;
          boxes.push({
            x: Math.cos(a) * r - 0.3, y: 0, z: Math.sin(a) * r - 0.3,
            w: 0.6, h: 0.04, d: 0.6,
            color: i % 3 === 0 ? '#FF8A65' : '#3E2723',
          });
        }
        return boxes;
      });
      scorch.setPosition(x, y + 0.02, z);
      this.addUltFx(scorch, 1.3, (n, p) => {
        const s = 1 + p * 0.18;
        n.setScale(s, 1, s);
      });
      this.shakeT = Math.max(this.shakeT, 0.3);
      this.playSfx('sfx_hit', 1);
      // 余波：延迟的二次爆燃
      this.later(0.16, () => {
        this.spawnUltRing(x, y, z, 8.5, '#FF7043', 0.36);
        for (let i = 0; i < 8; i++) this.spawnFxColor(x, y + 0.4, z, '#FFB74D');
        this.spawnUltDebris(x, y + 0.3, z, ['#FF7043', '#4A3A34'], 5, 0.8);
      });
    });
  }

  /** 雷霆万钧：22m 内最多 8 个敌人依次落雷并被电弧串联 */
  private castThunder(): void {
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    const dmg = 220 + this.wave * 9;
    const list = this.mobs.mobs
      .filter((m) => m.alive && (m.x - px) * (m.x - px) + (m.z - pz) * (m.z - pz) < 22 * 22)
      .sort((a, b) => {
        const da = (a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz);
        const db = (b.x - px) * (b.x - px) + (b.z - pz) * (b.z - pz);
        return da - db;
      })
      .slice(0, 8);
    if (!list.length) {
      for (let i = 0; i < 16; i++) this.spawnFxColor(px + (Math.random() - 0.5) * 6, this.player.pos.y + 2, pz + (Math.random() - 0.5) * 6, '#FFEB3B');
      this.spawnUltBolt(px, pz, this.player.pos.y, '#FFEB3B');
      this.spawnUltBeam(px, this.player.pos.y, pz, 11, '#FFEB3B', 0.4);
      this.spawnUltBeam(px, this.player.pos.y, pz, 11, '#FFFFFF', 0.22);
      this.spawnUltRing(px, this.player.pos.y, pz, 10, '#FFEB3B', 0.5);
      this.spawnUltRuneRing(px, this.player.pos.y, pz, 6, '#FFF176', 0.6);
      return;
    }
    let prev: Mob | null = null;
    list.forEach((m, i) => {
      this.later(i * 0.08, () => {
        if (!m.alive) return;
        const my = m.y + m.def.height * m.scale * 0.5;
        // 粗光柱 + 白色核心 + 天降折线雷
        this.spawnUltBeam(m.x, m.y, m.z, 12, '#FFEB3B', 0.3);
        this.spawnUltBeam(m.x, m.y, m.z, 12, '#FFFFFF', 0.18);
        this.spawnUltBolt(m.x, m.z, m.y, '#FFEB3B');
        this.spawnUltRing(m.x, m.y, m.z, 2.6, '#FFF176', 0.32);
        for (let k = 0; k < 10; k++) this.spawnFxColor(m.x, my, m.z, '#FFF176');
        for (let k = 0; k < 4; k++) this.spawnFxColor(m.x, my, m.z, '#FFFFFF');
        if (prev && prev.alive) {
          this.spawnUltArc(prev.x, prev.y + prev.def.height * prev.scale * 0.6, prev.z, m.x, my, m.z, '#FFEB3B');
        }
        const died = m.takeDamage(dmg, 0, 0, 0);
        this.pushDmgText(m, dmg, true);
        if (died) this.onMobKilled(m);
        if (!died) m.applyStun(0.6);
        this.playSfx('sfx_hit', 0.9);
        prev = m;
      });
    });
    // 中心雷域：三重扩散环 + 符文阵
    this.spawnUltRing(px, this.player.pos.y, pz, 22, '#FFEB3B', 0.6);
    this.spawnUltRing(px, this.player.pos.y, pz, 14, '#FFF176', 0.68);
    this.spawnUltRuneRing(px, this.player.pos.y, pz, 8, '#FFEB3B', 0.75);
  }

  /** 冰封千里：16m 内全部冻结 3.2s 并承受寒冰伤害 */
  private castFrost(): void {
    const px = this.player.pos.x;
    const py = this.player.pos.y;
    const pz = this.player.pos.z;
    const dmg = 160 + this.wave * 7;
    this.ultDamage(px, pz, 16, dmg, 3.2, 0.7);
    // 三重冰环 + 符文法阵
    this.spawnUltRing(px, py, pz, 16, '#81D4FA', 0.75);
    this.spawnUltRing(px, py, pz, 10, '#E1F5FE', 0.6);
    this.spawnUltRing(px, py, pz, 5.5, '#FFFFFF', 0.5);
    this.spawnUltRuneRing(px, py, pz, 6.5, '#81D4FA', 0.8);
    // 寒冰锥：从地面成片刺出
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2.5 + Math.random() * 12.5;
      const sx = px + Math.sin(a) * r;
      const sz = pz + Math.cos(a) * r;
      const gy = this.world.findGroundY(sx, sz);
      this.spawnUltSpike(sx, gy > 0 ? gy + 0.02 : py, sz, 1.3 + Math.random() * 1.6, i % 3 === 0 ? '#E1F5FE' : '#81D4FA');
    }
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 15;
      this.spawnFxColor(px + Math.sin(a) * r, py + 0.4 + Math.random() * 2.4, pz + Math.cos(a) * r, i % 4 === 0 ? '#E1F5FE' : '#B3E5FC');
    }
    this.spawnUltDebris(px, py + 0.6, pz, ['#B3E5FC', '#E1F5FE', '#81D4FA'], 10, 0.8);
    for (const m of this.mobs.mobs) {
      if (!m.alive) continue;
      const dx = m.x - px;
      const dz = m.z - pz;
      if (dx * dx + dz * dz > 16 * 16) continue;
      this.spawnUltBeam(m.x, m.y, m.z, 5, '#81D4FA', 0.4);
      this.spawnUltRing(m.x, m.y, m.z, 1.9, '#E1F5FE', 0.4);
      // 敌人脚下冰刺 + 冻结碎屑
      this.spawnUltSpike(m.x + 0.7, m.y, m.z + 0.4, 1.5, '#E1F5FE', 0.75);
      this.spawnUltSpike(m.x - 0.6, m.y, m.z - 0.5, 1.2, '#B3E5FC', 0.7);
      for (let k = 0; k < 6; k++) {
        this.spawnFxColor(m.x, m.y + m.def.height * m.scale * 0.5, m.z, '#E1F5FE');
      }
    }
  }

  private updateClouds(dt: number): void {
    const px = this.player.pos.x;
    for (const c of this.clouds) {
      const p = c.node.position;
      let nx = p.x + c.speed * dt;
      if (nx - px > 80) nx -= 160;
      if (px - nx > 80) nx += 160;
      c.node.setPosition(nx, p.y, p.z);
    }
  }

  /** 手持模型姿态：挥砍弧线 + 换装弹出缩放 */
  private updateHandPose(): void {
    const swingP = this.swingT > 0 ? 1 - this.swingT / 0.22 : 0;
    const swing = Math.sin(swingP * Math.PI);
    let pop = 1;
    if (this.switchFxT > 0) {
      const t = 1 - this.switchFxT / 0.15; // 0 → 1
      pop = t < 0.55 ? (t / 0.55) * 1.15 : 1.15 - ((t - 0.55) / 0.45) * 0.15;
    }
    const tilt = -0.20 - (this.handItem ? 0.18 : 0);
    if (this.armR) this.armR.setRotationFromEuler(tilt - 1.25 * swing, 0, 0);
    if (this.viewModel) {
      this.viewModel.setPosition(
        VM_POS.x, VM_POS.y - 0.04 * swing, VM_POS.z - 0.08 * swing,
      );
      this.viewModel.setRotationFromEuler(
        VM_ROT.x + 16 * swing, VM_ROT.y, VM_ROT.z + 8 * swing,
      );
      this.viewModel.setScale(VM_SCALE * pop, VM_SCALE * pop, VM_SCALE * pop);
    }
    if (this.handNode) {
      const base = this.handItem ? 1.3 : 0.85;
      this.handNode.setScale(base * pop, base * pop, base * pop);
    }
  }

  // ---------------- 主循环 ----------------
  update(dt: number): void {
    let d = dt;
    if (!isFinite(d) || d <= 0) d = 0.016;
    if (d > 0.05) d = 0.05;
    this.updateAudioState();
    this.updateAdFlow(d);
    // 分帧释放待销毁节点（怪物/宝箱/掉落物），任何状态下都推进
    this.mobs.flushGraveyard(2);
    flushNodeGraveyard(2);

    // 游戏圈按钮：仅菜单 / 暂停时显示，避免遮挡摇杆与战斗按钮
    const showClub = this.state === 'menu' || this.state === 'paused';
    if (showClub !== this.clubVisible) {
      this.clubVisible = showClub;
      setGameClubVisible(showClub);
    }

    if (this.actionCd > 0) this.actionCd -= d;
    if (this.attackCd > 0) this.attackCd -= d;
    if (this.energyT > 0) this.energyT -= d;
    if (this.shieldT > 0) {
      this.shieldT -= d;
      if (this.shieldT <= 0) {
        this.shieldT = 0;
        this.shield = 0;
      }
    }
    if (this.swingT > 0) this.swingT -= d;
    if (this.blockNameTimer > 0) this.blockNameTimer -= d;
    if (this.hintTimer > 0) this.hintTimer -= d;
    if (this.hurtT > 0) this.hurtT -= d * 2.2;
    if (this.shakeT > 0) this.shakeT -= d;
    if (this.invT > 0) this.invT -= d;
    if (this.bannerT > 0) this.bannerT -= d;
    if (this.slotFlash > 0) this.slotFlash -= d;
    if (this.switchFxT > 0) this.switchFxT -= d;
    this.timeAcc += d;
    this.updateHandPose();
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].alpha -= d / 2.4;
      if (this.toasts[i].alpha <= 0) this.toasts.splice(i, 1);
    }

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    const vis = view.getVisibleSize();
    if (vis.width !== this.lastW || vis.height !== this.lastH) this.relayout();

    // 换图倒计时必须无条件推进：即使过场内的世界更新抛异常，也不会把玩家锁死
    if (this.state === 'playing' && this.mapSwitchT > 0) {
      this.mapSwitchT = Math.max(0, this.mapSwitchT - d);
      if (this.mapSwitchT === 0 && this.mapSwitchDef) this.finishMapTransition();
    }

    if (this.state === 'loading') {
      this.loadTime += d;
      this.world.update(this.spawnX, this.spawnZ, 6, 4);
      const { ready, total } = this.world.readyCount(this.spawnX, this.spawnZ, 2);
      this.progress = Math.min(0.99, 0.1 + 0.9 * (ready / Math.max(1, total)));
      if (ready >= total && this.loadTime > 0.7) {
        this.progress = 1;
        this.state = 'menu';
      }
    } else if (this.state === 'menu') {
      this.world.update(this.spawnX, this.spawnZ, 2, 2);
      this.orbitCamera(d);
      this.updateClouds(d);
      this.updateFx(d);
    } else if (this.state === 'playing' || this.state === 'dead' || this.state === 'fail') {
      if (this.overlay === 'ad') {
        // 模拟广告倒计时不受状态限制（死亡页点「看广告复活」时 state 仍是 dead）
        if (this.mockAdResolve) {
          this.adT -= d;
          if (this.adT <= 0) this.finishMockAd();
        }
      } else if (this.state === 'playing') {
        if (this.overlay === 'reward') {
          // 宝箱奖励面板：3 秒倒计时自动关闭
          this.rewardT -= d;
          if (this.rewardT <= 0) this.closeReward();
        } else if (this.overlay === 'none') {
          this.updatePlaying(d);
        }
      }
    }

    this.drawHud();
  }

  /** v2.3 换图过场推进：分帧生成出生点周边区块并对齐镜头，完成后恢复玩法 */
  private updateMapTransition(d: number): void {
    // 生成/建模预算交给时间切片兜底，靠近点优先就绪
    try {
      this.world.update(this.spawnX, this.spawnZ, 2, 2);
      // 只等出生点贴身 3×3 就绪即揭幕，外圈交给 mapLoadT 加速流式补齐
      const { ready, total } = this.world.readyCount(this.spawnX, this.spawnZ, 1);
      this.mapSwitchProg = total > 0 ? ready / total : 0;
      if (ready >= total && this.mapSwitchT <= 0.6) {
        this.mapSwitchT = 0;
      }
    } catch (e) {
      // 任何异常都不能把玩家锁在过场里
      console.error('[map] transition error', e);
      this.mapSwitchT = 0;
    }
    this.updateCameraFollow();
    this.updateClouds(d);
    if (this.mapSwitchT === 0) this.finishMapTransition();
  }

  /** 揭幕：确保脚下有地面并落位（过场结束时统一调用一次） */
  private finishMapTransition(): void {
    this.mapSwitchDef = null;
    this.mapSwitchProg = 1;
    // 兜底：万一脚下尚未生成，则同步补齐，防止落地穿模
    if (this.world.findGroundY(this.spawnX, this.spawnZ) < 0) {
      this.world.preloadAt(this.spawnX, this.spawnZ, 1);
      this.world.buildMeshesNow(this.spawnX, this.spawnZ, 1);
    }
    this.player.spawn(this.spawnX, this.spawnY, this.spawnZ);
    this.mapLoadT = 0.9;
    console.log('[map] transition finished');
  }

  private updatePlaying(d: number): void {
    // 换图过场期间冻结玩法，只推进区块生成与镜头（完成后自动恢复）
    if (this.mapSwitchT > 0) {
      this.updateMapTransition(d);
      return;
    }
    this.updateDmgTexts(d);
    this.tickUlts(d);
    this.updateBombs(d);
    this.projectiles.update(
      d, this.mobs.mobs,
      (m, dmg, burn, chain) => this.onProjectileHit(m, dmg, burn, chain),
      (x, y, z) => this.spawnFxColor(x, y, z, '#9E9E9E'),
    );
    // 进场冻结期间加大构建预算，确保斗兽场网格快速生成完毕
    const warming = this.mode === 'arena' && this.arenaCd > 0;
    // 换图后短暂加大预算（分帧补齐，避免一帧同步重建几十个区块造成卡顿）
    if (this.mapLoadT > 0) this.mapLoadT -= d;
    const boost = warming || this.mapLoadT > 0;
    this.world.update(this.player.pos.x, this.player.pos.z, boost ? 2 : 1, boost ? 2 : 1);
    // v2.2 斗兽场地形兜底：极端情况掉出场地时拉回场心
    if (this.mode === 'arena' && this.player.pos.y < ARENA_GROUND_Y - 6) {
      this.player.spawn(ARENA_CX + 0.5, ARENA_GROUND_Y + 1.02, ARENA_CZ + 0.5);
      this.pushToast('已回到斗兽场中心', '#FFD54F');
    }
    // 玩家物理必须每帧推进（此前遗漏调用导致人物无法移动）
    this.updatePlayer(d);
    this.updateClouds(d);
    this.updateFx(d);
    this.updateTarget();
    this.updateCameraFollow();

    // 波次流程（仅斗兽场；寻宝模式走传送门与宝箱懒生成）
    if (this.mode === 'arena' && this.arenaCd > 0) {
      // 进场倒计时结束开波
      this.arenaCd -= d;
      if (this.arenaCd <= 0) {
        this.arenaCd = 0;
        this.nextWave();
      }
    } else if (this.mode === 'arena' && this.freeT > 0) {
      // 通关后的自由活动时间：倒计时结束自动进入下一波
      this.freeT -= d;
      if (this.freeT <= 0) {
        this.freeT = 0;
        this.nextWave();
      }
    } else if (this.mode === 'arena' && this.betweenT > 0) {
      this.betweenT -= d;
      if (this.betweenT <= 0) this.waveActive = true;
    } else if (this.mode === 'arena' && this.spawnQueue.length > 0) {
      this.spawnT -= d;
      if (this.spawnT <= 0 && this.mobs.countHostile() < MAX_ALIVE_MOBS) {
        this.spawnMobFromQueue();
        this.spawnT = 0.35;
      }
    } else if (this.mode === 'arena' && this.waveActive) {
      if (!this.waveNoTimer) this.timeLeft -= d;
      if (this.mobs.countHostile() === 0) {
        this.waveCleared();
      } else if (!this.waveNoTimer && this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.state = 'fail';
        this.jumpHeld = false;
      }
    } else if (this.mode === 'treasure') {
      // 传送门已移除，通过 HUD「挑战」按钮进入斗兽场
      // 宝箱点位懒生成（走近 44m 且区块就绪才生成实体）
      for (const s of this.treasureSpots) {
        if (s.spawned) continue;
        const sx = s.x - this.player.pos.x;
        const sz = s.z - this.player.pos.z;
        if (sx * sx + sz * sz > 44 * 44) continue;
        const gy = this.world.findGroundY(s.x, s.z);
        if (gy > SEA_LEVEL + 1) {
          s.spawned = true;
          // 品质随距离圈提升：内圈 ~第2波 / 中圈 ~第4波 / 外圈 ~第7波
          this.chests.spawn(s.x, gy, s.z, [2, 4, 7][s.ring] || 7, true);
        }
      }
      // 世界 BOSS 懒生成（走近 48m 且区块就绪才生成实体，本局一次）
      for (let i = 0; i < WORLD_BOSSES.length; i++) {
        if (this.bossSpawned[i]) continue;
        const b = WORLD_BOSSES[i];
        const bdx = b.x - this.player.pos.x;
        const bdz = b.z - this.player.pos.z;
        if (bdx * bdx + bdz * bdz > 48 * 48) continue;
        const bm = this.mobs.spawn(b.kind, b.x, b.z, { scale: b.scale });
        if (bm) {
          this.bossSpawned[i] = true;
          this.pushToast(`世界BOSS · ${mobName(b.kind)} 就在附近！`, '#FFD54F');
        }
      }
      // v2.5 野外主动动物：密度提升（间隔 22s→12s，上限 2→5）
      this.wildT -= d;
      if (this.wildT <= 0) {
        this.wildT = 12;
        this.mobs.countWild() < 5 && this.spawnWildAnimal();
      }
    }

    // 生物 AI
    const hasTarget = this.state === 'playing' && this.invT <= 0;
    this.mobs.update(d, this.player.pos.x, this.player.pos.y, this.player.pos.z,
      hasTarget, this.camNode.position.x, this.camNode.position.z);
    // 怪物事件：攻击玩家 / 苦力怕爆炸
    for (const mob of this.mobs.mobs) {
      if (mob.evAttack > 0) {
        // v2.5 新怪物攻击音效
        const atkSfx = this.mobSfxName(mob.def.kind);
        if (atkSfx) this.playSfx(atkSfx, 0.9);
        const dx = this.player.pos.x - mob.x;
        const dz = this.player.pos.z - mob.z;
        const dl = Math.sqrt(dx * dx + dz * dz) || 1;
        // v2.3 北极熊等：击退倍率
        const knock = mob.def.knock || 1;
        this.hurtPlayer(mob.evAttack, (dx / dl) * 4 * knock, (dz / dl) * 4 * knock);
        // v2.3 蝎子：命中中毒
        if (mob.def.poisonHit) {
          this.poisonT = Math.max(this.poisonT, mob.def.poisonHit.dur);
          this.poisonDps = Math.max(this.poisonDps, mob.def.poisonHit.dps);
        }
        // v2.3 词缀：灼烧（玩家 3s 燃烧）/ 吸血（怪回血 20%）
        if (mob.affix === 'burn') {
          this.burnT = Math.max(this.burnT, 3);
          this.burnDps = Math.max(this.burnDps, 2);
        } else if (mob.affix === 'vamp') {
          mob.hp = Math.min(mob.maxHp, mob.hp + mob.evAttack * 0.2);
        }
        mob.evAttack = 0;
      }
      if (mob.evExplode > 0) {
        this.explode(mob.x, mob.y + 0.8, mob.z, mob.evExplode);
        mob.evExplode = 0;
      }
      if (mob.evSummon > 0) {
        // 蜘蛛女皇召唤小蜘蛛
        for (let i = 0; i < mob.evSummon; i++) {
          const a = Math.random() * Math.PI * 2;
          this.mobs.spawn('spider', mob.x + Math.sin(a) * 2, mob.z + Math.cos(a) * 2, { hp: 0.6, scale: 0.7 });
        }
        this.pushToast('蜘蛛女皇召唤了小蜘蛛！', '#EF5350');
        mob.evSummon = 0;
      }
    }
    // 灼烧致死等延迟死亡结算
    for (const mob of this.mobs.mobs) {
      if (!mob.alive && !mob.exploded && !(mob as any)._dropDone) {
        (mob as any)._dropDone = true;
        this.onMobKilled(mob);
      }
    }

    // 毒雾更新 + 玩家碰撞中毒
    this.updatePoison(d);

    // 掉落物拾取
    const picked = this.drops.update(d, this.player.pos.x, this.player.pos.y, this.player.pos.z);
    for (const d2 of picked) {
      if (d2.item) this.applyEquip(d2.item);
      else if (d2.cons) {
        if (this.addConsumable(d2.cons)) this.pushToast(`拾取 ${CONSUMABLES[d2.cons].name}`, CONSUMABLES[d2.cons].color);
        else this.pushToast(`${CONSUMABLES[d2.cons].name} 已满`, 'rgba(255,255,255,0.7)');
      } else if (d2.heal > 0) {
        this.hp = Math.min(this.maxHp, this.hp + d2.heal);
        this.pushToast(`+${d2.heal} 生命`, '#7BE38A');
      }
    }

    // 宝箱：漂浮 / 自转 / 靠近 1.6m 自动开启
    const opened = this.chests.update(d, this.player.pos.x, this.player.pos.y, this.player.pos.z);
    if (opened) this.onChestOpened(opened);
    const nd = this.chests.nearestDist(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.chestHint = nd < 6.5 ? Math.max(0, Math.min(1, (6.5 - nd) / 4)) : 0;

    // 冲刺时轻微拉宽视野，跑动更有速度感
    const wantFov = this.sprintHeld ? 92 : 85;
    this.fov += (wantFov - this.fov) * Math.min(1, d * 8);
    if (Math.abs(this.fov - this.cam.fov) > 0.05) this.cam.fov = this.fov;

    // 戒指回血
    if (this.regenValue > 0 && this.hp < this.maxHp) {
      this.regenAcc += d * this.regenValue;
      while (this.regenAcc >= 1) {
        this.regenAcc -= 1;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
    }

    // 动物补充
    this.animalT -= d;
    if (this.animalT <= 0) {
      this.animalT = 6;
      if (this.mobs.countAnimals() < 9) this.spawnAnimal();
    }
  }

  private updatePlayer(d: number): void {
    // 斗兽场进场读秒：冻结物理，避免落点未生成时自由落体
    if (this.mode === 'arena' && this.arenaCd > 0) {
      this.player.vel.set(0, 0, 0);
      this.player.pos.y = ARENA_GROUND_Y + 1.02;
      this.player.onGround = true;
      return;
    }
    let mx = this.joyX;
    let mz = -this.joyY;
    if (this.keys.has(KEY.W)) mz += 1;
    if (this.keys.has(KEY.S)) mz -= 1;
    if (this.keys.has(KEY.D)) mx += 1;
    if (this.keys.has(KEY.A)) mx -= 1;
    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }

    this.player.update(d, this.world, mx, mz, this.jumpHeld || this.keys.has(KEY.SPACE), this.sprintHeld);
  }

  private updateTarget(): void {
    const dir = this.player.forward(this.tmpDir);
    const hit = this.world.raycast(
      this.player.eyeX, this.player.eyeY, this.player.eyeZ,
      dir.x, dir.y, dir.z, 6,
    );
    this.target = hit;
    if (hit) {
      this.highlight.active = true;
      this.highlight.setPosition(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      this.highlight.active = false;
    }
  }

  private updateCameraFollow(d: number = 0): void {
    const p = this.player;
    const dir = p.forward(this.tmpLook);

    if (this.viewMode === 1) {
      // 第三人称：相机在玩家身后上方
      const dist = 4.2;
      const height = 2.6;
      const eye = new Vec3(
        p.pos.x - dir.x * dist,
        p.pos.y + height,
        p.pos.z - dir.z * dist,
      );
      if (this.shakeT > 0) {
        const s = this.shakeT * 0.35;
        eye.x += (Math.random() - 0.5) * s;
        eye.y += (Math.random() - 0.5) * s;
        eye.z += (Math.random() - 0.5) * s;
      }
      this.camNode.setPosition(eye);
      // v1.4：看向玩家头顶上方稍前方（原为 eyeH*0.6），让人物整体下移到屏幕中心以下，
      // 中心准星不再压住脸部表情；瞄准射线本就由玩家视线方向发出，不受相机取景影响
      const target = new Vec3(p.pos.x + dir.x * 2, p.pos.y + p.eyeH + 0.2, p.pos.z + dir.z * 2);
      this.camNode.lookAt(target, Vec3.UP);
    } else {
      // 第一人称
      const eye = new Vec3(p.eyeX, p.eyeY, p.eyeZ);
      if (this.shakeT > 0) {
        const s = this.shakeT * 0.35;
        eye.x += (Math.random() - 0.5) * s;
        eye.y += (Math.random() - 0.5) * s;
        eye.z += (Math.random() - 0.5) * s;
      }
      this.camNode.setPosition(eye);
      this.camNode.lookAt(new Vec3(eye.x + dir.x, eye.y + dir.y, eye.z + dir.z), Vec3.UP);
    }

    // 同步人物模型位置、朝向
    if (this.playerNode) {
      this.playerNode.setPosition(p.pos.x, p.pos.y, p.pos.z);
      this.playerNode.setRotationFromEuler(0, -p.yaw * 180 / Math.PI, 0);
    }
  }

  private applyCameraLook(target: Vec3, pos: Vec3): void {
    this.camNode.setPosition(pos);
    this.camNode.lookAt(target, Vec3.UP);
  }

  private orbitCamera(d: number): void {
    const spawn = new Vec3(this.spawnX, ARENA_GROUND_Y + 4.5, this.spawnZ);
    this.orbit += d * 0.22;
    const r = 15;
    const pos = new Vec3(
      spawn.x + Math.sin(this.orbit) * r,
      spawn.y + 3.2,
      spawn.z + Math.cos(this.orbit) * r,
    );
    this.applyCameraLook(spawn, pos);
  }

  private charPanelData(): CharPanelData {
    return {
      equip: this.equip,
      collected: this.collectedWeapons,
      attack: this.attackValue,
      maxHp: this.maxHp,
      armor: this.armorValue,
      regen: this.regenValue,
      skinIndex: this.skinIndex,
      skinUnlocked: this.skinUnlocked,
    };
  }

  /** 寻宝模式：存活世界 BOSS 的方向指引（angle 相对相机朝向，弧度，0=正前方） */
  private collectBossArrows(): Array<{ angle: number; dist: number; name: string; hpRatio: number }> | null {
    if (this.state !== 'playing' || this.mode !== 'treasure') return null;
    const fx = -Math.sin(this.player.yaw);
    const fz = -Math.cos(this.player.yaw);
    const camBearing = Math.atan2(fx, fz);
    const out: Array<{ angle: number; dist: number; name: string; hpRatio: number }> = [];
    for (const m of this.mobs.mobs) {
      if (!m.def.worldBoss || !m.alive) continue;
      const dx = m.x - this.player.pos.x;
      const dz = m.z - this.player.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      let rel = Math.atan2(dx, dz) - camBearing;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      out.push({ angle: rel, dist, name: mobName(m.def.kind), hpRatio: m.hp / m.maxHp });
    }
    return out.length ? out : null;
  }

  /** 世界坐标 → HUD 虚拟坐标（出屏返回 null） */
  private projectHud(x: number, y: number, z: number): { x: number; y: number } | null {
    this.tmpUiWorld.set(x, y, z);
    this.cam.convertToUINode(this.tmpUiWorld, this.hudNode, this.tmpUiPos);
    const sx = this.tmpUiPos.x + this.lastW * 0.5;
    const sy = this.lastH * 0.5 - this.tmpUiPos.y;
    if (sx < -30 || sx > this.lastW + 30 || sy < -30 || sy > this.lastH + 30) return null;
    return { x: sx, y: sy };
  }

  /** 命中飘字：上浮 0.8m / 0.6s，暴击金色弹跳 */
  private buildDmgTexts(): Array<{ x: number; y: number; text: string; crit: boolean; alpha: number; scale: number }> {
    const out: Array<{ x: number; y: number; text: string; crit: boolean; alpha: number; scale: number }> = [];
    for (const t of this.dmgTexts) {
      const prog = 1 - Math.max(0, t.t) / 0.6;
      const s = this.projectHud(t.x, t.y + prog * 0.8, t.z);
      if (!s) continue;
      out.push({
        x: s.x,
        y: s.y,
        text: `${t.n}`,
        crit: t.crit,
        alpha: Math.min(1, t.t / 0.25),
        scale: t.crit ? 1.2 + Math.sin(prog * Math.PI) * 0.35 : 1,
      });
    }
    return out;
  }

  /** 怪物头顶状态图标（眩晕 > 冰冻 > 灼烧，30m 内） */
  private buildStatusIcons(): Array<{ x: number; y: number; kind: 'burn' | 'slow' | 'stun' }> {
    const out: Array<{ x: number; y: number; kind: 'burn' | 'slow' | 'stun' }> = [];
    for (const m of this.mobs.mobs) {
      if (!m.alive) continue;
      const kind: 'burn' | 'slow' | 'stun' | null =
        m.stunT > 0 ? 'stun' : m.slowT > 0 ? 'slow' : m.burnT > 0 ? 'burn' : null;
      if (!kind) continue;
      const dx = m.x - this.player.pos.x;
      const dz = m.z - this.player.pos.z;
      if (dx * dx + dz * dz > 30 * 30) continue;
      const s = this.projectHud(m.x, m.y + m.def.height * m.scale + 0.75, m.z);
      if (s) out.push({ x: s.x, y: s.y, kind });
    }
    return out;
  }

  /** 头顶名牌：敌对怪按距离投影，颜色按等级区分（普通白 / 精锐绿 / 精英蓝 / 领主紫 / BOSS 金） */
  private buildMobNames(): Array<{ x: number; y: number; text: string; color: string; boss: boolean }> {
    const out: Array<{ x: number; y: number; text: string; color: string; boss: boolean }> = [];
    for (const m of this.mobs.mobs) {
      if (!m.alive || !m.def.hostile) continue;
      const boss = !!(m.def.worldBoss || m.def.bossBar);
      const lim = boss ? 70 : 34;
      const dx = m.x - this.player.pos.x;
      const dz = m.z - this.player.pos.z;
      if (dx * dx + dz * dz > lim * lim) continue;
      const s = this.projectHud(m.x, m.y + m.def.height * m.scale + 1.05, m.z);
      if (!s) continue;
      let text = m.affix ? `${m.def.name}·${AFFIX_NAMES[m.affix]}` : m.def.name;
      if (boss) text = '👑 ' + text;
      else if (m.tier >= 3) text = '★ ' + text;
      out.push({ x: s.x, y: s.y, text, color: MOB_TIER_COLORS[m.tier], boss });
    }
    return out;
  }

  /** 斗兽场 BOSS 在场时返回顶部大血条数据 */
  private buildArenaBoss(): { name: string; ratio: number; wave: number } | null {
    if (this.mode !== 'arena' || this.state !== 'playing') return null;
    for (const m of this.mobs.mobs) {
      if (!m.alive) continue;
      // 只统计斗兽场内的 BOSS：广场上的世界 BOSS（烈焰巨龙等）远在场外，不能串到斗兽场血条
      if (!isInArena(m.x, m.z)) continue;
      if (m.def.worldBoss || m.def.bossBar) {
        return { name: m.def.name, ratio: Math.max(0, m.hp / m.maxHp), wave: this.wave };
      }
    }
    return null;
  }

  private drawHud(): void {
    const nameAlpha = this.blockNameTimer > 0 ? Math.min(1, this.blockNameTimer / 0.5) : 0;
    const hintAlpha = this.hintTimer > 0 ? Math.min(1, this.hintTimer / 1.2) : 0;
    const playing = this.state === 'playing';
    this.hud.draw({
      state: this.state,
      overlay: this.overlay,
      w: this.lastW,
      h: this.lastH,
      progress: this.progress,
      fps: this.fps,
      chunks: this.world.chunkCount(),
      backpack: this.backpack,
      selected: this.selected,
      slotFlash: this.slotFlash,
      reward: this.overlay === 'reward' ? this.reward : null,
      legendReady: playing,
      adPurpose: this.adPurpose,
      chestHint: playing ? this.chestHint : 0,
      time: this.timeAcc,
      bannerSub: this.bannerSub,
      viewMode: this.viewMode,
      blockName: playing ? this.blockName : '',
      blockNameAlpha: nameAlpha,
      hintAlpha: playing ? hintAlpha : 0,
      joyActive: this.joyTouchId !== -1,
      joyX: this.joyX,
      joyY: this.joyY,
      musicOn: this.musicOn,
      musicVol: this.musicVol,
      mobNames: playing ? this.buildMobNames() : [],
      arenaBoss: playing ? this.buildArenaBoss() : null,
      mapPanel: this.state === 'playing' && this.mapPanelOpen,
      mapSwitching: this.state === 'playing' && this.mapSwitchT > 0 && this.mapSwitchDef
        ? { icon: this.mapSwitchDef.icon, name: this.mapSwitchDef.name, progress: this.mapSwitchProg }
        : null,
      mapName: MAPS[this.mapSave.selected].name,
      maps: MAP_LIST.map((m) => {
        const unlocked = isMapUnlocked(m.id, this.mapSave);
        const p = unlockProgress(m.id, this.mapSave);
        return {
          id: m.id,
          name: m.name,
          icon: m.icon,
          desc: m.desc,
          unlocked,
          selected: this.mapSave.selected === m.id,
          lockText: unlocked ? '' : `看广告解锁 · 宝箱 ${p.cur}/${p.need}`,
        };
      }),
      coords: { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z },
      hp: Math.ceil(this.hp),
      maxHp: this.maxHp,
      wave: this.wave,
      mobsLeft: this.mobs.countHostile() + this.spawnQueue.length,
      timeLeft: this.timeLeft,
      timeMax: this.timeMax,
      freeT: this.freeT,
      mode: this.mode,
      arenaCd: this.arenaCd,
      rewardPicked: this.rewardPicked,
      rewardSecond: this.rewardSecond,
      bossArrows: this.collectBossArrows(),
      dmgTexts: this.buildDmgTexts(),
      statusIcons: this.buildStatusIcons(),
      consumables: this.consumables.map((c) => (c ? { id: c.id, name: CONSUMABLES[c.id].name, count: c.count, color: CONSUMABLES[c.id].color } : null)),
      shield: this.shield,
      energyT: this.energyT,
      bombArmed: this.bombArmed,
      safeTop: this.safeTopU,
      kills: this.kills,
      banner: this.banner,
      bannerAlpha: this.bannerT > 0 ? Math.min(1, this.bannerT / 0.6) : 0,
      toasts: this.toasts,
      hurt: Math.max(0, this.hurtT),
      swing: this.swingT > 0 ? this.swingT / 0.22 : 0,
      adT: Math.max(0, this.adT),
      adTotal: this.adPurpose === 'ult' ? AD_MOCK_SECONDS_ULT : AD_MOCK_SECONDS,
      ults: this.ults.map((s) => ({
        id: s.id, name: s.name, icon: s.icon, color: s.color,
        charge: s.charge, charges: s.charges, cd: s.cd,
      })),
      ultFx: this.ultShow ? { ...this.ultShow } : null,
      char: this.overlay === 'character' ? this.charPanelData() : null,
      bag: this.overlay === 'bag'
        ? { items: this.inventory, collected: this.collectedWeapons, weaponId: this.equip.weapon?.id ?? null }
        : null,
    });
  }
}

function mainStatText(item: EquipDef): string {
  if (item.slot === 'weapon') return `攻${item.dmg}`;
  if (item.slot === 'helmet') return `命+${item.hp}`;
  if (item.slot === 'armor') return `减伤${Math.round((item.armor || 0) * 100)}%`;
  if (item.slot === 'ring') return `回血${item.regen}/s`;
  return `攻+${item.dmg}`;
}
