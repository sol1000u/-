/**
 * 通用体素小模型构建器：把多个着色盒子合并成一个 Mesh。
 * 怪物 / 动物 / 掉落物 / 云 / 太阳 / 粒子特效共用，配合 unlit + 顶点色材质。
 */
import { Color, Material, Mesh, Texture2D, utils } from 'cc';
import { createSolidTexture } from '../voxel/Atlas';
import { FACES, SHADE } from '../voxel/Chunk';

export interface BoxDef {
  x: number; // 最小角（局部坐标）
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string; // #rrggbb
}

let whiteTex: Texture2D | null = null;
let opaqueMat: Material | null = null;
const ghostMats = new Map<number, Material>();

/** 不透明顶点色材质（所有小模型共享一份） */
export function getVoxMaterial(): Material {
  if (opaqueMat) return opaqueMat;
  if (!whiteTex) whiteTex = createSolidTexture();
  const m = new Material();
  m.initialize({
    effectName: 'builtin-unlit',
    defines: { USE_TEXTURE: true, USE_VERTEX_COLOR: true },
  });
  m.setProperty('mainTexture', whiteTex);
  m.setProperty('mainColor', new Color(255, 255, 255, 255));
  opaqueMat = m;
  return m;
}

/** 半透明顶点色材质（云、幽灵等），alpha 0~255 */
export function getVoxGhostMaterial(alpha: number): Material {
  const key = alpha | 0;
  const cached = ghostMats.get(key);
  if (cached) return cached;
  if (!whiteTex) whiteTex = createSolidTexture();
  const m = new Material();
  m.initialize({
    effectName: 'builtin-unlit',
    technique: 1,
    defines: { USE_TEXTURE: true, USE_VERTEX_COLOR: true },
  });
  m.setProperty('mainTexture', whiteTex);
  m.setProperty('mainColor', new Color(255, 255, 255, key));
  ghostMats.set(key, m);
  return m;
}

export function hexToRgb01(hex: string): [number, number, number] {
  let h = (hex || '#ffffff').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** 合并多个盒子为一个网格（含面明暗烘焙） */
export function buildBoxesMesh(boxes: BoxDef[]): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;

  for (const b of boxes) {
    const [r, g, bl] = hexToRgb01(b.color);
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); minZ = Math.min(minZ, b.z);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); maxZ = Math.max(maxZ, b.z + b.d);
    for (let fi = 0; fi < 6; fi++) {
      const face = FACES[fi];
      const shade = SHADE[fi];
      const base = positions.length / 3;
      for (let i = 0; i < 4; i++) {
        const c = face.corners[i];
        positions.push(b.x + c[0] * b.w, b.y + c[1] * b.h, b.z + c[2] * b.d);
        normals.push(face.dir[0], face.dir[1], face.dir[2]);
        uvs.push(0.5, 0.5);
        colors.push(r * shade, g * shade, bl * shade, 1);
      }
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }

  return utils.createMesh({
    positions, normals, uvs, colors, indices,
    minPos: { x: minX, y: minY, z: minZ } as any,
    maxPos: { x: maxX, y: maxY, z: maxZ } as any,
  });
}

/** 平面四边形（XY 平面，法线 +z，中心原点）——怪物脸部贴图用 */
export function buildQuadMesh(w: number, h: number): Mesh {
  const hw = w / 2;
  const hh = h / 2;
  return utils.createMesh({
    positions: [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 0, 1, 1, 1],
    indices: [0, 1, 2, 2, 1, 3],
    minPos: { x: -hw, y: -hh, z: 0 } as any,
    maxPos: { x: hw, y: hh, z: 0 } as any,
  });
}
