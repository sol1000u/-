/**
 * 区块与网格构建（移植自 4jsvoxel.js 的 Chunk.buildMesh）
 * 保留原版的核心优化：只生成暴露在空气中的面（面剔除），实体/水面分开两个网格。
 */
import { BLOCK_TEX, BlockType, TEX, isTransparent } from './Blocks';
import { tileUV } from './Atlas';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 48;

export interface ChunkGeo {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

interface FaceDef {
  dir: [number, number, number];
  corners: [number, number, number][];
  uv: [number, number][];
  texIndex: 0 | 1 | 2;
}

/** 立方体 6 个面：顶点顺序保证逆时针（Cocos 默认 CCW 为正面） */
export const FACES: FaceDef[] = [
  { // +X 右
    dir: [1, 0, 0],
    corners: [[1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]],
    uv: [[0, 0], [0, 1], [1, 1], [1, 0]],
    texIndex: 2,
  },
  { // -X 左
    dir: [-1, 0, 0],
    corners: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]],
    uv: [[0, 0], [0, 1], [1, 1], [1, 0]],
    texIndex: 2,
  },
  { // +Y 顶
    dir: [0, 1, 0],
    corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
    texIndex: 0,
  },
  { // -Y 底
    dir: [0, -1, 0],
    corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
    texIndex: 1,
  },
  { // +Z 前
    dir: [0, 0, 1],
    corners: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
    texIndex: 2,
  },
  { // -Z 后
    dir: [0, 0, -1],
    corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
    texIndex: 2,
  },
];

const FALLBACK_TEX: [number, number, number] = [TEX.STONE, TEX.STONE, TEX.STONE];

/** 每面烘死的亮度（替代实时光照，unlit 材质也能有立体感） */
export const SHADE: number[] = [0.68, 0.68, 1.0, 0.5, 0.82, 0.78];

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly blocks: Uint8Array;
  dirty = true;
  meshed = false;
  /** 区块内最高非空方块的 y+1（建网格时跳过其上方的全空气层，降低扫描量） */
  maxY = 1;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
  }

  private index(lx: number, ly: number, lz: number): number {
    return ly * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx;
  }

  get(lx: number, ly: number, lz: number): number {
    if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT || lz < 0 || lz >= CHUNK_SIZE) return BlockType.AIR;
    return this.blocks[this.index(lx, ly, lz)];
  }

  set(lx: number, ly: number, lz: number, type: number): void {
    if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT || lz < 0 || lz >= CHUNK_SIZE) return;
    this.blocks[this.index(lx, ly, lz)] = type;
    if (type !== BlockType.AIR && ly + 1 > this.maxY) this.maxY = ly + 1;
    this.dirty = true;
  }

  /** 构建几何数据：getWorldBlock 用于跨区块边界判断 */
  buildGeometry(getWorldBlock: (wx: number, wy: number, wz: number) => number): { solid: ChunkGeo | null; water: ChunkGeo | null } {
    const s = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], colors: [] as number[], indices: [] as number[] };
    const w = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], colors: [] as number[], indices: [] as number[] };

    const wx0 = this.cx * CHUNK_SIZE;
    const wz0 = this.cz * CHUNK_SIZE;
    // 只扫描到区块实际最高方块，高空空气层整体跳过（地形通常只占 48 层的下半）
    const topY = Math.min(CHUNK_HEIGHT, this.maxY + 1);

    for (let ly = 0; ly < topY; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const block = this.blocks[this.index(lx, ly, lz)];
          if (block === BlockType.AIR) continue;

          const isWater = block === BlockType.WATER;
          const target = isWater ? w : s;
          const texList = BLOCK_TEX[block] || FALLBACK_TEX;

          for (let fi = 0; fi < 6; fi++) {
            const face = FACES[fi];
            const nx = lx + face.dir[0];
            const ny = ly + face.dir[1];
            const nz = lz + face.dir[2];

            let neighbor: number;
            if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
              neighbor = this.blocks[this.index(nx, ny, nz)];
            } else {
              neighbor = getWorldBlock(wx0 + nx, ny, wz0 + nz);
            }

            let visible: boolean;
            if (isWater) visible = neighbor === BlockType.AIR;
            else visible = isTransparent(neighbor) && neighbor !== block;
            if (!visible) continue;

            const texIdx = texList[face.texIndex];
            const { u0, v0, u1, v1 } = tileUV(texIdx);
            const baseIdx = target.positions.length / 3;
            const shade = isWater ? 1.0 : SHADE[fi];

            for (let i = 0; i < 4; i++) {
              const c = face.corners[i];
              target.positions.push(lx + c[0], ly + c[1], lz + c[2]);
              target.normals.push(face.dir[0], face.dir[1], face.dir[2]);
              target.colors.push(shade, shade, shade, 1);
              const u = face.uv[i][0];
              const v = face.uv[i][1];
              target.uvs.push(u0 + u * (u1 - u0), v0 + v * (v1 - v0));
            }

            // 顶点顺序与 UV 沿用原版（Three.js）的排布，但三角形绕序需反转为 CCW（Cocos 正面）
            target.indices.push(baseIdx, baseIdx + 2, baseIdx + 1, baseIdx, baseIdx + 3, baseIdx + 2);
          }
        }
      }
    }

    return {
      solid: s.positions.length ? s : null,
      water: w.positions.length ? w : null,
    };
  }
}
