/**
 * 体素世界（移植自 4jsvoxel.js 的 World 类）
 *
 * 原版基于 Three.js，这里改为 Cocos 的原生 Mesh + MeshRenderer：
 *  - 每个区块一个合并网格（面剔除后一次性提交，大幅减少 draw call）
 *  - 地形/立墙/树木/花草全部程序化生成，随机种子固定
 *  - 区块按玩家位置流式加载 / 卸载，生成与重建都有每帧预算，避免卡顿
 */
import { Color, Material, Mesh, MeshRenderer, Node, Vec3, utils } from 'cc';
import { MAPS, type MapDef } from '../game/Maps';
import { createBlockAtlas } from './Atlas';
import { BlockType, isSolid } from './Blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, Chunk } from './Chunk';
import { fbm, hash2 } from './Noise';

export const SEA_LEVEL = 20;
/** 出生竞技场：高于海平面的平坦草地（不再是坑） */
export const ARENA_GROUND_Y = 24;
export const ARENA_RADIUS_X = 44;
export const ARENA_RADIUS_Z = 30;

/** v2.1 斗兽场中心（远处固定坐标，同世界不换场景） */
export const ARENA_CX = 2000;
export const ARENA_CZ = 2000;
/** 斗兽场内场半径（围墙内沿） */
export const ARENA_INNER_R = 15.5;
/** 斗兽场外沿半径（含看台） */
export const ARENA_OUTER_R = 20;

/** 寻宝模式传送门位置（出生点附近，粉色门框） */
export const PORTAL_POS = { x: 7.5, y: ARENA_GROUND_Y + 1, z: 6.5 };

/** 判断世界坐标是否处于斗兽场区域（场内方块禁止破坏） */
export function isInArena(wx: number, wz: number): boolean {
  const dx = wx - ARENA_CX;
  const dz = wz - ARENA_CZ;
  return dx * dx + dz * dz <= ARENA_OUTER_R * ARENA_OUTER_R;
}

/** 斗兽场空中结构：围墙（带 4 门洞）+ 双层看台，只处理地面层以上的方块 */
function arenaStructureBlock(wx: number, wz: number, wy: number): number {
  const dx = wx - ARENA_CX;
  const dz = wz - ARENA_CZ;
  const d = Math.sqrt(dx * dx + dz * dz);
  const rel = wy - ARENA_GROUND_Y;
  // 围墙：15.5~16.5，高 4；四个正方向门洞宽 3、高 3
  if (d >= ARENA_INNER_R && d <= ARENA_INNER_R + 1 && rel >= 1 && rel <= 4) {
    const gateNS = Math.abs(dx) <= 1 && rel <= 3; // 南/北门
    const gateEW = Math.abs(dz) <= 1 && rel <= 3; // 东/西门
    if (gateNS || gateEW) return BlockType.AIR;
    return BlockType.STONE;
  }
  // 看台两层台阶
  if (d > ARENA_INNER_R + 2 && d <= ARENA_INNER_R + 3 && rel === 1) return BlockType.STONE;
  if (d > ARENA_INNER_R + 3 && d <= ARENA_INNER_R + 4 && rel >= 1 && rel <= 2) return BlockType.STONE;
  return BlockType.AIR;
}

/** 寻宝宝箱点位：以出生点为圆心 30/80/150m 三圈散布（hash2 种子可复现） */
export function getTreasureChestSpots(): Array<{ x: number; z: number; ring: number }> {
  const spots: Array<{ x: number; z: number; ring: number }> = [];
  const rings = [30, 80, 150];
  for (let ri = 0; ri < rings.length; ri++) {
    const n = ri === 0 ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const a = hash2(rings[ri] * 13 + i * 71, 7) * Math.PI * 2;
      const r = rings[ri] + (hash2(i * 31, rings[ri] * 17) - 0.5) * 14;
      spots.push({ x: Math.cos(a) * r, z: 10 + Math.sin(a) * r, ring: ri });
    }
  }
  return spots;
}

interface ChunkView {
  solidNode: Node | null;
  solidMesh: Mesh | null;
  waterNode: Node | null;
  waterMesh: Mesh | null;
}

export interface RayHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

export class World {
  readonly root: Node;
  readonly chunks = new Map<number, Chunk>();
  readonly renderDistance: number;
  readonly solidMaterial: Material;
  readonly waterMaterial: Material;

  private readonly views = new Map<number, ChunkView>();
  /** 待销毁的区块视图队列（每帧限量销毁，避免集中释放造成卡顿） */
  private readonly pendingViews: ChunkView[] = [];
  /** 待释放的网格资源（节点脱离场景后再统一销毁，避免释放仍被引用的 GPU 缓冲） */
  private readonly pendingMeshes: Mesh[] = [];

  /** v2.3 当前地图参数（默认翠绿草原） */
  mapDef: MapDef = MAPS.grassland;

  /**
   * 切换地图：清空全部已生成区块，按新地图参数重新流式生成。
   * 返回是否真的发生了切换（同图重复调用无副作用）。
   */
  setMap(def: MapDef): boolean {
    if (this.mapDef.id === def.id) return false;
    this.mapDef = def;
    // 分帧销毁旧区块：一帧内销毁几十个 Mesh 会直接造成掉帧
    for (const c of [...this.chunks.values()]) {
      const k = this.key(c.cx, c.cz);
      const v = this.views.get(k);
      if (v) {
        // 立即隐藏：先让旧地形退出渲染，真正的 destroy 交给分帧队列
        if (v.solidNode && v.solidNode.isValid) v.solidNode.active = false;
        if (v.waterNode && v.waterNode.isValid) v.waterNode.active = false;
        this.pendingViews.push(v);
        this.views.delete(k);
      }
    }
    this.chunks.clear();
    return true;
  }

  constructor(root: Node, renderDistance: number) {
    this.root = root;
    this.renderDistance = renderDistance;

    const atlas = createBlockAtlas();

    // 用 unlit + 顶点色烘焙的面明暗，避免依赖 3D builtin-standard 效果资源
    const solid = new Material();
    solid.initialize({
      effectName: 'builtin-unlit',
      defines: { USE_TEXTURE: true, USE_VERTEX_COLOR: true, USE_ALPHA_TEST: true },
    });
    solid.setProperty('mainTexture', atlas);
    solid.setProperty('mainColor', new Color(255, 255, 255, 255));
    this.solidMaterial = solid;

    const water = new Material();
    water.initialize({ effectName: 'builtin-unlit', technique: 1, defines: { USE_TEXTURE: true } });
    water.setProperty('mainTexture', atlas);
    water.setProperty('mainColor', new Color(235, 250, 255, 200));
    this.waterMaterial = water;
  }

  private key(cx: number, cz: number): number {
    return (cx + 2048) * 4096 + (cz + 2048);
  }

  chunkCount(): number {
    return this.chunks.size;
  }

  /** 世界坐标取方块 */
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockType.AIR;
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk) return BlockType.AIR;
    return chunk.get(((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, wy, ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE);
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return isSolid(this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  /** 该列地表高度（第一个实体方块顶面），用于生物生成；-1 表示未加载 */
  findGroundY(wx: number, wz: number): number {
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    for (let y = CHUNK_HEIGHT - 1; y >= 1; y--) {
      if (isSolid(this.getBlock(x, y, z))) return y + 1;
    }
    return -1;
  }

  /** 修改方块，并把自身与相邻区块标记为待重建 */
  setBlock(wx: number, wy: number, wz: number, type: number): void {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk) return;

    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.set(lx, wy, lz, type);

    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
  }

  private markDirty(cx: number, cz: number): void {
    const c = this.chunks.get(this.key(cx, cz));
    if (c) c.dirty = true;
  }

  // ---------------- 区块流式加载 ----------------
  update(px: number, pz: number, genBudget: number, meshBudget: number): void {
    // 先分帧销毁待清理的区块视图（换图 / 远距离移动时集中产生）
    this.flushDispose(4);

    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    const R = this.renderDistance;
    const t0 = Date.now();

    // 卸载过远的区块
    for (const chunk of this.chunks.values()) {
      if (Math.abs(chunk.cx - pcx) > R + 1 || Math.abs(chunk.cz - pcz) > R + 1) {
        this.disposeChunk(chunk);
      }
    }

    // 生成缺失区块（优先靠近玩家）
    if (genBudget > 0) {
      const missing: Array<[number, number, number]> = [];
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const d2 = dx * dx + dz * dz;
          if (d2 > (R + 1) * (R + 1)) continue;
          const cx = pcx + dx;
          const cz = pcz + dz;
          if (!this.chunks.has(this.key(cx, cz))) missing.push([d2, cx, cz]);
        }
      }
      missing.sort((a, b) => a[0] - b[0]);
      let n = genBudget;
      for (let i = 0; i < missing.length && n > 0; i++, n--) {
        // 时间预算：单帧生成超过 5ms 立即停手，把剩余工作推到后续帧
        if (Date.now() - t0 > 5) break;
        this.createChunk(missing[i][1], missing[i][2]);
      }
    }

    // 重建脏区块
    if (meshBudget > 0) {
      const dirty: Array<[number, Chunk]> = [];
      for (const chunk of this.chunks.values()) {
        if (chunk.dirty) {
          const dx = chunk.cx - pcx;
          const dz = chunk.cz - pcz;
          dirty.push([dx * dx + dz * dz, chunk]);
        }
      }
      if (dirty.length) {
        dirty.sort((a, b) => a[0] - b[0]);
        let n = meshBudget;
        for (let i = 0; i < dirty.length && n > 0; i++, n--) {
          // 建网格是重活：开工前先查时间预算（单帧超过 8ms 停手）
          if (Date.now() - t0 > 8) break;
          this.buildMesh(dirty[i][1]);
        }
      }
    }
  }

  /** 分帧销毁待清理视图（每帧最多 n 个） */
  private flushDispose(n: number): void {
    while (n > 0 && this.pendingViews.length > 0) {
      const v = this.pendingViews.pop()!;
      // 先脱离场景再销毁：直接 destroy 仍在渲染列表里的节点，
      // 再立刻销毁 Mesh 会释放仍被引用的 GPU 缓冲，真机上可能直接卡死/崩
      if (v.solidNode && v.solidNode.isValid) {
        v.solidNode.removeFromParent();
        v.solidNode.destroy();
      }
      if (v.waterNode && v.waterNode.isValid) {
        v.waterNode.removeFromParent();
        v.waterNode.destroy();
      }
      if (v.solidMesh) this.pendingMeshes.push(v.solidMesh);
      if (v.waterMesh) this.pendingMeshes.push(v.waterMesh);
      n--;
    }
    // Mesh 资源延后释放（此时节点已脱离场景，不再被渲染引用）
    for (let i = 0; i < 2 && this.pendingMeshes.length > 0; i++) {
      const m = this.pendingMeshes.pop()!;
      if (m && m.isValid) m.destroy();
    }
  }

  /**
   * v2.2 同步预生成：把中心点周围 (2r+1)^2 区块立即生成（数据+碰撞可用）。
   * 网格由 update() 按每帧预算补齐，避免传送瞬间长时间卡顿；
   * 配合进场读秒冻结物理，玩家不会在无地面区域自由落体。
   */
  preloadAt(wx: number, wz: number, r = 2): void {
    const pcx = Math.floor(wx / CHUNK_SIZE);
    const pcz = Math.floor(wz / CHUNK_SIZE);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (!this.chunks.has(this.key(cx, cz))) this.createChunk(cx, cz);
      }
    }
  }

  /**
   * 立即同步构建中心点周围 (2r+1)^2 区块的网格。
   * 用于传送进场时保证落点周围地面立即可见，避免玩家看到虚空。
   */
  buildMeshesNow(wx: number, wz: number, r = 1): void {
    const pcx = Math.floor(wx / CHUNK_SIZE);
    const pcz = Math.floor(wz / CHUNK_SIZE);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const c = this.chunks.get(this.key(pcx + dx, pcz + dz));
        if (c && c.dirty) this.buildMesh(c);
      }
    }
  }

  /** 指定范围内的区块是否都已生成并建好网格（用于加载进度） */
  readyCount(px: number, pz: number, radius: number): { ready: number; total: number } {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    let ready = 0;
    let total = 0;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        total++;
        const c = this.chunks.get(this.key(pcx + dx, pcz + dz));
        if (c && !c.dirty && c.meshed) ready++;
      }
    }
    return { ready, total };
  }

  private createChunk(cx: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cz);
    this.chunks.set(this.key(cx, cz), chunk);
    this.generate(chunk);
    chunk.dirty = true;

    // 新邻居可能让边界面的剔除结果发生变化
    this.markDirty(cx - 1, cz);
    this.markDirty(cx + 1, cz);
    this.markDirty(cx, cz - 1);
    this.markDirty(cx, cz + 1);
    return chunk;
  }

  // ---------------- 地形生成 ----------------
  private generate(chunk: Chunk): void {
    const wx0 = chunk.cx * CHUNK_SIZE;
    const wz0 = chunk.cz * CHUNK_SIZE;
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = wx0 + lx;
        const wz = wz0 + lz;
        const inFlat = wx >= -ARENA_RADIUS_X && wx <= ARENA_RADIUS_X &&
          wz >= -ARENA_RADIUS_Z && wz <= ARENA_RADIUS_Z;
        const inArena = isInArena(wx, wz);

        let height: number;
        if (inFlat || inArena) {
          height = ARENA_GROUND_Y;
        } else {
          const t = this.mapDef.terrain;
          const n = fbm(wx / t.freq, wz / t.freq, 4, 2.0, 0.5);
          let nat = Math.floor(SEA_LEVEL + n * t.amp);
          // v2.3.3 大片平原：接近基准高度的区域直接拍平，开阔且少起伏
          if (Math.abs(nat - (SEA_LEVEL + 2)) <= 2) nat = SEA_LEVEL + 2;
          nat = Math.max(1, Math.min(CHUNK_HEIGHT - 10, nat));
          // v2.3.3 平台边缘 6 格内线性过渡到自然地形（不再先降再抬，避免出现环形沟）
          const edge = Math.max(Math.abs(wx) - ARENA_RADIUS_X, Math.abs(wz) - ARENA_RADIUS_Z);
          if (edge > 0 && edge <= 6) {
            const k = edge / 6;
            height = Math.round(ARENA_GROUND_Y * (1 - k) + nat * k);
          } else {
            height = nat;
          }
        }
        heights[lz * CHUNK_SIZE + lx] = height;

        for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
          let block = BlockType.AIR;
          if (ly === 0) {
            block = BlockType.STONE;
          } else if (inFlat) {
            // 出生平台：石头打底、次表层填充、按当前地图表层方块收顶
            if (ly <= ARENA_GROUND_Y - 4) block = BlockType.STONE;
            else if (ly < ARENA_GROUND_Y) block = this.mapDef.surface.sub;
            else if (ly === ARENA_GROUND_Y) block = this.mapDef.surface.top;
          } else if (inArena) {
            // 斗兽场：石板地 + 空中结构（围墙/门洞/看台）
            if (ly <= ARENA_GROUND_Y - 4) block = BlockType.STONE;
            else if (ly < ARENA_GROUND_Y) block = BlockType.DIRT;
            else if (ly === ARENA_GROUND_Y) block = BlockType.STONE;
            else block = arenaStructureBlock(wx, wz, ly);
          } else if (ly < height - 3) {
            block = BlockType.STONE;
          } else if (ly < height) {
            block = this.mapDef.surface.sub;
          } else if (ly === height) {
            // 低洼海岸线：草原/荒漠用沙，冰原保持雪地
            block = height <= SEA_LEVEL + 1 && this.mapDef.surface.top === BlockType.GRASS
              ? BlockType.SAND : this.mapDef.surface.top;
          } else if (ly <= SEA_LEVEL && ly > height && this.mapDef.terrain.water) {
            block = this.mapDef.terrain.frozen ? BlockType.ICE : BlockType.WATER;
          }
          chunk.set(lx, ly, lz, block);
        }
      }
    }

    this.buildDecorations(chunk, heights);
    this.buildTrees(chunk, heights);
    // 传送门已移除，寻宝模式通过 HUD「挑战」按钮进入斗兽场
  }

  /** 寻宝模式传送门：粉色门框（两根立柱 + 横梁），走近触发进斗兽场 */
  private buildPortal(chunk: Chunk): void {
    const px = Math.floor(PORTAL_POS.x); // 7
    const pz = Math.floor(PORTAL_POS.z); // 6
    const cells: Array<[number, number, number]> = [];
    for (let dy = 0; dy <= 2; dy++) {
      cells.push([px - 1, PORTAL_POS.y + dy, pz]); // 左柱
      cells.push([px + 2, PORTAL_POS.y + dy, pz]); // 右柱
    }
    cells.push([px, PORTAL_POS.y + 3, pz]);        // 横梁
    cells.push([px + 1, PORTAL_POS.y + 3, pz]);
    for (const [wx, wy, wz] of cells) {
      const lx = wx - chunk.cx * CHUNK_SIZE;
      const lz = wz - chunk.cz * CHUNK_SIZE;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
      chunk.set(lx, wy, lz, BlockType.COZE_PINK);
    }
  }

  /** 地表装饰：按地图风格点缀（花草 / 雪花 / 仙人掌） */
  private buildDecorations(chunk: Chunk, heights: Int16Array): void {
    const style = this.mapDef.decorate;
    if (style === 'none') return;
    const top = this.mapDef.surface.top;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = chunk.cx * CHUNK_SIZE + lx;
        const wz = chunk.cz * CHUNK_SIZE + lz;

        const h = heights[lz * CHUNK_SIZE + lx];
        if (h + 1 >= CHUNK_HEIGHT) continue;
        if (chunk.get(lx, h, lz) !== top) continue;
        if (chunk.get(lx, h + 1, lz) !== BlockType.AIR) continue;

        const r = hash2(wx + 101, wz + 37);
        if (style === 'flowers') {
          // 植物密度减半：花 3.5%、蘑菇 1.5%
          if (r > 0.965) {
            const t = hash2(wx + 55, wz + 91);
            let flower = BlockType.FLOWER_RED;
            if (t > 0.66) flower = BlockType.FLOWER_WHITE;
            else if (t > 0.33) flower = BlockType.FLOWER_YELLOW;
            chunk.set(lx, h + 1, lz, flower);
          } else if (r > 0.950) {
            const t = hash2(wx + 17, wz + 7);
            chunk.set(lx, h + 1, lz, t > 0.5 ? BlockType.MUSHROOM_RED : BlockType.MUSHROOM_BROWN);
          }
        } else if (style === 'snowflake') {
          // 冰原：稀疏白花（雪绒花）
          if (r > 0.982) chunk.set(lx, h + 1, lz, BlockType.FLOWER_WHITE);
        } else if (style === 'cactus') {
          // 荒漠：仙人掌（绿叶柱 2~3 格，顶部偶有红花）
          if (r > 0.996 && h > SEA_LEVEL + 1) {
            const th = 2 + (hash2(wx + 31, wz + 63) > 0.6 ? 1 : 0);
            for (let i = 1; i <= th && h + i < CHUNK_HEIGHT; i++) {
              chunk.set(lx, h + i, lz, BlockType.LEAVES);
            }
            if (h + th + 1 < CHUNK_HEIGHT && hash2(wx + 7, wz + 13) > 0.7) {
              chunk.set(lx, h + th + 1, lz, BlockType.FLOWER_RED);
            }
          }
        }
      }
    }
  }

  /** 树：主干 4~6 高，2~3 层树冠（按地图密度与表层方块生长） */
  private buildTrees(chunk: Chunk, heights: Int16Array): void {
    const treeProb = this.mapDef.terrain.treeProb;
    if (treeProb <= 0) return;
    const top = this.mapDef.surface.top;
    const threshold = 1 - treeProb;
    for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
      for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
        const wx = chunk.cx * CHUNK_SIZE + lx;
        const wz = chunk.cz * CHUNK_SIZE + lz;
        if (wx >= -ARENA_RADIUS_X - 2 && wx <= ARENA_RADIUS_X + 2 &&
            wz >= -ARENA_RADIUS_Z - 2 && wz <= ARENA_RADIUS_Z + 2) continue;

        const h = heights[lz * CHUNK_SIZE + lx];
        if (h <= SEA_LEVEL + 1) continue;
        if (chunk.get(lx, h, lz) !== top) continue;
        if (hash2(wx * 7 + 3, wz * 13 + 5) < threshold) continue;

        const r = hash2(wx + 900, wz + 321);
        const trunkH = 4 + Math.floor(r * 3);
        const base = h + 1;
        if (base + trunkH + 2 >= CHUNK_HEIGHT) continue;

        for (let i = 0; i < trunkH; i++) chunk.set(lx, base + i, lz, BlockType.WOOD);

        const topY = base + trunkH - 1;
        for (let dy = -2; dy <= 1; dy++) {
          const rad = dy >= 0 ? 1 : 2;
          for (let dz = -rad; dz <= rad; dz++) {
            for (let dx = -rad; dx <= rad; dx++) {
              if (dy >= 0 && (dx === 0 || dz === 0) && dx + dz !== 0) {
                // 顶层只留十字与中心，避免方正呆板
                if (Math.abs(dx) + Math.abs(dz) > 0 && dy === 1 && hash2(wx + dx, wz + dz) > 0.35) continue;
              }
              if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && hash2(wx + dx * 11, wz + dz * 17) > 0.5) continue;
              const bx = lx + dx;
              const bz = lz + dz;
              if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE) continue;
              const by = topY + dy;
              if (chunk.get(bx, by, bz) === BlockType.AIR) chunk.set(bx, by, bz, BlockType.LEAVES);
            }
          }
        }
      }
    }
  }

  // ---------------- 网格构建 ----------------
  private viewOf(chunk: Chunk): ChunkView {
    const k = this.key(chunk.cx, chunk.cz);
    let v = this.views.get(k);
    if (!v) {
      v = { solidNode: null, solidMesh: null, waterNode: null, waterMesh: null };
      this.views.set(k, v);
    }
    return v;
  }

  private buildMesh(chunk: Chunk): void {
    const geo = chunk.buildGeometry((x, y, z) => this.getBlock(x, y, z));
    const view = this.viewOf(chunk);
    const minPos = new Vec3(0, 0, 0);
    const maxPos = new Vec3(CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE);

    // 实体地形
    if (geo.solid) {
      if (!view.solidNode) {
        view.solidNode = new Node(`chunk_${chunk.cx}_${chunk.cz}`);
        view.solidNode.parent = this.root;
        view.solidNode.setPosition(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
        view.solidNode.addComponent(MeshRenderer);
      }
      const mesh = utils.createMesh({
        positions: geo.solid.positions,
        normals: geo.solid.normals,
        uvs: geo.solid.uvs,
        colors: geo.solid.colors,
        indices: geo.solid.indices,
        minPos,
        maxPos,
      });
      const mr = view.solidNode.getComponent(MeshRenderer)!;
      mr.mesh = mesh;
      mr.setSharedMaterial(this.solidMaterial, 0);
      view.solidNode.active = true;
      if (view.solidMesh) view.solidMesh.destroy();
      view.solidMesh = mesh;
    } else if (view.solidNode) {
      view.solidNode.active = false;
    }

    // 水面
    if (geo.water) {
      if (!view.waterNode) {
        view.waterNode = new Node(`water_${chunk.cx}_${chunk.cz}`);
        view.waterNode.parent = this.root;
        view.waterNode.setPosition(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
        view.waterNode.addComponent(MeshRenderer);
      }
      const mesh = utils.createMesh({
        positions: geo.water.positions,
        normals: geo.water.normals,
        uvs: geo.water.uvs,
        colors: geo.water.colors,
        indices: geo.water.indices,
        minPos,
        maxPos,
      });
      const mr = view.waterNode.getComponent(MeshRenderer)!;
      mr.mesh = mesh;
      mr.setSharedMaterial(this.waterMaterial, 0);
      view.waterNode.active = true;
      if (view.waterMesh) view.waterMesh.destroy();
      view.waterMesh = mesh;
    } else if (view.waterNode) {
      view.waterNode.active = false;
    }

    chunk.dirty = false;
    chunk.meshed = true;
  }

  private disposeChunk(chunk: Chunk): void {
    const k = this.key(chunk.cx, chunk.cz);
    const view = this.views.get(k);
    if (view) {
      // 不立即销毁，交给每帧限量的 flushDispose，避免一帧集中释放多个 Mesh
      this.pendingViews.push(view);
      this.views.delete(k);
    }
    this.chunks.delete(k);
  }

  // ---------------- 射线检测（DDA 体素遍历） ----------------
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);

    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

    const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dx);
    const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dy);
    const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dz);

    let tMaxX = stepX === 0 ? Infinity : (stepX > 0 ? (x + 1 - ox) / dx : (ox - x) / -dx);
    let tMaxY = stepY === 0 ? Infinity : (stepY > 0 ? (y + 1 - oy) / dy : (oy - y) / -dy);
    let tMaxZ = stepZ === 0 ? Infinity : (stepZ > 0 ? (z + 1 - oz) / dz : (oz - z) / -dz);

    let nx = 0;
    let ny = 0;
    let nz = 0;

    for (let i = 0; i < 128; i++) {
      const block = this.getBlock(x, y, z);
      if (block !== BlockType.AIR && isSolid(block)) {
        return { x, y, z, nx, ny, nz };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        if (tMaxX > maxDist) break;
        x += stepX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (tMaxY < tMaxZ) {
        if (tMaxY > maxDist) break;
        y += stepY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        if (tMaxZ > maxDist) break;
        z += stepZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
    return null;
  }

  /** 判断某方块位置是否会与玩家 AABB 相交（放置方块时用） */
  overlapsPlayer(bx: number, by: number, bz: number, px: number, py: number, pz: number, hw: number, ph: number): boolean {
    return bx + 1 > px - hw && bx < px + hw &&
      by + 1 > py && by < py + ph &&
      bz + 1 > pz - hw && bz < pz + hw;
  }
}
