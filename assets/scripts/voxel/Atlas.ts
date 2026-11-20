/**
 * 程序化方块纹理图集（移植自 4jsvoxel.js 的 canvas 绘制逻辑）
 * 直接生成 256×256 的 RGBA 像素缓冲，再交给 Cocos 生成 Texture2D，
 * 不依赖 DOM / Canvas，微信小游戏与浏览器都能用。
 */
import { ImageAsset, Texture2D } from 'cc';
import { hash2 } from './Noise';

const TILE = 16;
const ATLAS = 256;
const COLS = ATLAS / TILE;

/** gfx.Format.RGBA8888（PixelFormat 未在 cc 顶层导出，这里用数值常量） */
const RGBA8888 = 35;

/** 极简像素画布：RGBA 缓冲 + 透明度混合 */
class PixBuf {
  readonly data: Uint8Array;
  ox = 0;
  oy = 0;

  constructor() {
    this.data = new Uint8Array(ATLAS * ATLAS * 4);
  }

  private blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (x < 0 || y < 0 || x >= ATLAS || y >= ATLAS) return;
    const i = (y * ATLAS + x) * 4;
    const d = this.data;
    if (a >= 255) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
      return;
    }
    const k = a / 255;
    const rest = 1 - k;
    d[i] = Math.round(r * k + d[i] * rest);
    d[i + 1] = Math.round(g * k + d[i + 1] * rest);
    d[i + 2] = Math.round(b * k + d[i + 2] * rest);
    d[i + 3] = Math.max(d[i + 3], Math.round(a + d[i + 3] * rest));
  }

  fill(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 255): void {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) this.blend(px, py, r, g, b, a);
    }
  }

  clear(x: number, y: number, w: number, h: number): void {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        const i = (py * ATLAS + px) * 4;
        this.data[i] = 0;
        this.data[i + 1] = 0;
        this.data[i + 2] = 0;
        this.data[i + 3] = 0;
      }
    }
  }

  /** 带稳定噪点的填充（坐标用图集绝对值，保证每个纹理都有自己的颗粒感） */
  noisy(x: number, y: number, w: number, h: number, r: number, g: number, b: number, variance: number): void {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        const n = (hash2(px + this.ox, py + this.oy) - 0.5) * variance * 255;
        const rr = Math.max(0, Math.min(255, Math.round(r + n)));
        const gg = Math.max(0, Math.min(255, Math.round(g + n)));
        const bb = Math.max(0, Math.min(255, Math.round(b + n)));
        this.blend(px, py, rr, gg, bb, 255);
      }
    }
  }

  /** 圆环（年轮） */
  ring(cx: number, cy: number, radius: number, thick: number, r: number, g: number, b: number, a: number): void {
    const r0 = radius - thick;
    const r1 = radius + thick;
    for (let py = Math.floor(cy - r1); py <= Math.ceil(cy + r1); py++) {
      for (let px = Math.floor(cx - r1); px <= Math.ceil(cx + r1); px++) {
        const d = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
        if (d >= r0 && d <= r1) this.blend(px, py, r, g, b, a);
      }
    }
  }

  /** 指定图集槽位作为局部原点 */
  slot(index: number): void {
    this.ox = (index % COLS) * TILE;
    this.oy = Math.floor(index / COLS) * TILE;
  }

  /** 在槽位内绘制（局部坐标 0..15） */
  paint(index: number, fn: (px: number, py: number) => void): void {
    this.slot(index);
    fn(this.ox, this.oy);
  }
}

/** 生成方块图集贴图（16×16 像素风，最近邻采样） */
export function createBlockAtlas(): Texture2D {
  const p = new PixBuf();
  const d = p.data;

  // ---- 0 草地顶部：绿底 + 深绿草叶点
  p.paint(0, (x0, y0) => {
    p.noisy(x0, y0, TILE, TILE, 76, 175, 80, 0.15);
    for (let i = 0; i < 8; i++) {
      const px = x0 + ((hash2(i, 0) * TILE) | 0);
      const py = y0 + ((hash2(i, 1) * TILE) | 0);
      p.fill(px, py, 1, 1, 56, 142, 60, 153);
    }
  });

  // ---- 1 草地侧面：上绿下棕 + 波浪过渡
  p.paint(1, (x0, y0) => {
    p.noisy(x0, y0 + 4, TILE, TILE - 4, 141, 110, 99, 0.12);
    p.noisy(x0, y0, TILE, 4, 76, 175, 80, 0.15);
    for (let px = 0; px < TILE; px++) {
      const depth = 3 + ((hash2(px, 99) * 3) | 0);
      const rr = (76 + hash2(px, 50) * 30) | 0;
      const gg = (140 + hash2(px, 51) * 30) | 0;
      p.fill(x0 + px, y0 + 3, 1, depth - 3, rr, gg, 60, 255);
    }
  });

  // ---- 2 泥土：棕底 + 小石子
  p.paint(2, (x0, y0) => {
    p.noisy(x0, y0, TILE, TILE, 141, 110, 99, 0.15);
    for (let i = 0; i < 4; i++) {
      const px = x0 + ((hash2(i + 20, 0) * TILE) | 0);
      const py = y0 + ((hash2(i + 20, 1) * TILE) | 0);
      p.fill(px, py, 2, 2, 100, 80, 70, 128);
    }
  });

  // ---- 3 石头：灰底 + 裂纹
  p.paint(3, (x0, y0) => {
    p.noisy(x0, y0, TILE, TILE, 158, 158, 158, 0.18);
    const cx = (hash2(100, 0) * 12 + 2) | 0;
    const cy = (hash2(100, 1) * 12 + 2) | 0;
    p.fill(x0 + cx, y0 + cy, 3, 1, 100, 100, 100, 102);
    p.fill(x0 + cx + 2, y0 + cy + 1, 1, 2, 100, 100, 100, 102);
  });

  // ---- 4 沙子：暖黄 + 沙粒
  p.paint(4, (x0, y0) => {
    p.noisy(x0, y0, TILE, TILE, 253, 216, 53, 0.1);
    for (let i = 0; i < 6; i++) {
      const px = x0 + ((hash2(i + 40, 0) * TILE) | 0);
      const py = y0 + ((hash2(i + 40, 1) * TILE) | 0);
      p.fill(px, py, 1, 1, 245, 200, 40, 128);
    }
  });

  // ---- 5 木头侧面：树皮竖纹
  p.paint(5, (x0, y0) => {
    p.noisy(x0, y0, TILE, TILE, 121, 85, 72, 0.1);
    for (let px = 0; px < TILE; px++) {
      if (hash2(px, 77) > 0.6) p.fill(x0 + px, y0, 1, TILE, 93, 64, 55, 102);
    }
  });

  // ---- 6 木头顶部：年轮
  p.paint(6, (x0, y0) => {
    p.noisy(x0, y0, TILE, TILE, 121, 85, 72, 0.1);
    p.ring(x0 + 7.5, y0 + 7.5, 2, 0.6, 93, 64, 55, 128);
    p.ring(x0 + 7.5, y0 + 7.5, 4, 0.6, 93, 64, 55, 128);
    p.ring(x0 + 7.5, y0 + 7.5, 6, 0.6, 93, 64, 55, 128);
  });

  // ---- 7 树叶：深绿 + 镂空
  p.paint(7, (x0, y0) => {
    p.noisy(x0, y0, TILE, TILE, 46, 125, 50, 0.2);
    for (let i = 0; i < 5; i++) {
      const px = x0 + ((hash2(i + 60, 0) * TILE) | 0);
      const py = y0 + ((hash2(i + 60, 1) * TILE) | 0);
      p.clear(px, py, 1, 1);
    }
  });

  // ---- 8 水：半透明蓝
  p.paint(8, (x0, y0) => {
    for (let py = 0; py < TILE; py++) {
      for (let px = 0; px < TILE; px++) {
        const n = hash2(px + 80, py + 80) * 0.2;
        p.fill(x0 + px, y0 + py, 1, 1,
          33 + n * 30, 150 + n * 30, 243 + n * 12, 178);
      }
    }
  });

  // ---- 9 Coze 品牌粉
  p.paint(9, (x0, y0) => {
    p.noisy(x0, y0, TILE, TILE, 244, 107, 149, 0.08);
    p.fill(x0 + 2, y0 + 2, 4, 4, 255, 255, 255, 26);
  });

  // ---- 10~12 三种花：茎 + 花瓣 + 花蕊
  const flower = (index: number, petal: [number, number, number], core: [number, number, number]) => {
    p.paint(index, (x0, y0) => {
      p.clear(x0, y0, TILE, TILE);
      p.fill(x0 + 7, y0 + 8, 2, 8, 56, 142, 60, 255);
      p.fill(x0 + 6, y0 + 4, 4, 4, petal[0], petal[1], petal[2], 255);
      p.fill(x0 + 5, y0 + 5, 6, 2, petal[0], petal[1], petal[2], 255);
      p.fill(x0 + 7, y0 + 3, 2, 1, petal[0], petal[1], petal[2], 255);
      p.fill(x0 + 7, y0 + 5, 2, 2, core[0], core[1], core[2], 255);
    });
  };
  flower(10, [229, 57, 53], [255, 235, 59]);
  flower(11, [253, 216, 53], [245, 127, 23]);
  flower(12, [250, 250, 250], [255, 235, 59]);

  // ---- 13 红蘑菇：白柄红伞白点
  p.paint(13, (x0, y0) => {
    p.clear(x0, y0, TILE, TILE);
    p.fill(x0 + 6, y0 + 9, 4, 7, 239, 235, 233, 255);
    p.fill(x0 + 4, y0 + 4, 8, 5, 198, 40, 40, 255);
    p.fill(x0 + 3, y0 + 5, 10, 3, 198, 40, 40, 255);
    p.fill(x0 + 5, y0 + 3, 6, 1, 198, 40, 40, 255);
    p.fill(x0 + 5, y0 + 5, 2, 2, 250, 250, 250, 255);
    p.fill(x0 + 9, y0 + 6, 2, 2, 250, 250, 250, 255);
    p.fill(x0 + 7, y0 + 4, 1, 1, 250, 250, 250, 255);
  });

  // ---- 14 棕蘑菇
  p.paint(14, (x0, y0) => {
    p.clear(x0, y0, TILE, TILE);
    p.fill(x0 + 6, y0 + 9, 4, 7, 215, 204, 200, 255);
    p.fill(x0 + 4, y0 + 5, 8, 4, 109, 76, 65, 255);
    p.fill(x0 + 3, y0 + 6, 10, 2, 109, 76, 65, 255);
    p.fill(x0 + 5, y0 + 4, 6, 1, 109, 76, 65, 255);
  });

  // ---- 15 纯白（高亮框等用）
  p.paint(15, (x0, y0) => {
    p.fill(x0, y0, TILE, TILE, 255, 255, 255, 255);
  });

  // ---- 16 雪：白底 + 淡蓝冰晶点
  p.paint(16, (x0, y0) => {
    p.noisy(x0, y0, TILE, TILE, 236, 239, 241, 0.08);
    for (let i = 0; i < 6; i++) {
      const px = x0 + ((hash2(i + 90, 0) * TILE) | 0);
      const py = y0 + ((hash2(i + 90, 1) * TILE) | 0);
      p.fill(px, py, 1, 1, 179, 229, 252, 153);
    }
  });

  // ---- 17 冰面：淡蓝底 + 白色裂纹
  p.paint(17, (x0, y0) => {
    p.noisy(x0, y0, TILE, TILE, 179, 229, 252, 0.1);
    for (let i = 0; i < 3; i++) {
      const px = x0 + ((hash2(i + 130, 0) * 12) | 0);
      const py = y0 + ((hash2(i + 130, 1) * 12) | 0);
      p.fill(px, py, 5, 1, 240, 250, 255, 200);
      p.fill(px + 3, py + 1, 1, 3, 240, 250, 255, 170);
    }
  });

  // WebGL 上传原始像素时数据第 0 行对应 v=0（贴图下方）；
  // 翻转行序后，绘制时“上方”的像素才会出现在方块的上方
  const flipped = new Uint8Array(d.length);
  const rowBytes = ATLAS * 4;
  for (let y = 0; y < ATLAS; y++) {
    flipped.set(d.subarray(y * rowBytes, (y + 1) * rowBytes), (ATLAS - 1 - y) * rowBytes);
  }

  const img = new ImageAsset({
    _data: flipped,
    _compressed: false,
    width: ATLAS,
    height: ATLAS,
    format: RGBA8888,
  } as any);

  const tex = new Texture2D();
  tex.image = img;
  tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
  tex.setMipFilter(Texture2D.Filter.NONE);
  return tex;
}

/** 1×1 纯白贴图（材质高亮框、纯色面片用） */
export function createSolidTexture(): Texture2D {
  const img = new ImageAsset({
    _data: new Uint8Array([255, 255, 255, 255]),
    _compressed: false,
    width: 1,
    height: 1,
    format: RGBA8888,
  } as any);
  const tex = new Texture2D();
  tex.image = img;
  tex.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
  tex.setMipFilter(Texture2D.Filter.NONE);
  return tex;
}

/** 图集 UV（含极小的内缩，避免最近邻采样串色） */
const TILE_UV_TABLE: Array<{ u0: number; v0: number; u1: number; v1: number }> = [];

export function tileUV(texIndex: number): { u0: number; v0: number; u1: number; v1: number } {
  // 查表缓存：建网格每帧调用上千次，避免每次新建对象造成 GC 抖动
  let t = TILE_UV_TABLE[texIndex];
  if (t) return t;
  const col = texIndex % COLS;
  const row = Math.floor(texIndex / COLS);
  const eps = 0.06 / ATLAS;
  t = {
    u0: col / COLS + eps,
    v0: 1 - (row + 1) / COLS + eps,
    u1: (col + 1) / COLS - eps,
    v1: 1 - row / COLS - eps,
  };
  TILE_UV_TABLE[texIndex] = t;
  return t;
}
