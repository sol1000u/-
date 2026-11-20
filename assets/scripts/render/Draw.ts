// 美术层：由 Canvas 2D 版本移植到 Cocos Graphics（无图片资源，全部程序化绘制）
import { Painter, shadeHex, mixHex } from './Painter';
import CFG, { SkinCfg, WeaponCfg } from '../core/Config';

const PI = Math.PI;
const OUTLINE = 'rgba(45, 34, 58, 0.72)';

export interface VB { x: number; y: number; w: number; h: number }

export interface FighterView {
  x: number; y: number; facing: number; state: string; stateT: number; dur: number;
  seed: number; skin: SkinCfg; weapon: WeaponCfg; charId: string;
  rankIndex: number; flash: number; hideShadow?: boolean;
}

function shrink(pts: number[][], cx: number, cy: number, k: number): number[][] {
  return pts.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]);
}

export function shadeSkin(skin: SkinCfg, k: number): SkinCfg {
  return {
    fur: shadeHex(skin.fur, k),
    furDark: shadeHex(skin.furDark, k * 0.92),
    belly: shadeHex(skin.belly, k),
    armor: shadeHex(skin.armor, k * 0.95),
    glow: skin.glow,
    eye: skin.eye,
    crown: skin.crown,
    aura: skin.aura,
    rainbow: skin.rainbow,
  };
}

export function shadeWeapon(w: WeaponCfg, k: number): WeaponCfg {
  if (!w) return w;
  return { name: w.name, type: w.type, color: shadeHex(w.color, k), color2: shadeHex(w.color2, k) };
}

// ---------------- 背景 ----------------

function drawCloud(p: Painter, x: number, y: number, s: number, alpha: number): void {
  p.save();
  p.setAlpha(alpha);
  p.ell(x, y, 34 * s, 15 * s, '#ffffff');
  p.ell(x - 24 * s, y + 6 * s, 22 * s, 11 * s, '#ffffff');
  p.ell(x + 22 * s, y + 5 * s, 26 * s, 12 * s, '#ffffff');
  p.restore();
}

export function drawArenaBg(p: Painter, vb: VB, t: number, accent: string): void {
  p.vGrad(vb.x, vb.y, vb.w, vb.h, ['#5fb0e6', '#b8e2f5', '#ffe5c6', '#f3c9a1'], 12);

  // 太阳
  p.glow(304, 148, 70, '#fff3bd', 0.2);
  p.glow(304, 148, 40, '#fff8d8', 0.3);
  p.circle(304, 148, 26, '#fffbe6');

  drawCloud(p, 82 + Math.sin(t * 0.16) * 22, 176, 0.9, 0.85);
  drawCloud(p, 216 + Math.sin(t * 0.12 + 2) * 28, 138, 0.7, 0.7);
  drawCloud(p, 34 + Math.sin(t * 0.2 + 1) * 16, 240, 0.58, 0.55);

  // 远山
  p.save();
  p.setAlpha(0.5);
  p.quadFill([
    [-20, 404], [60, 306, 150, 396], [245, 316, 330, 398], [360, 380, 400, 402],
    [400, 430], [-20, 430],
  ], '#7ec4c6');
  p.restore();

  // 舞台地板
  const floorTop = CFG.GROUND_Y;
  p.vGrad(vb.x, floorTop, vb.w, vb.y + vb.h - floorTop, ['#e0b07a', '#8d5c3d'], 10);
  p.save();
  p.setAlpha(0.18);
  for (let y = floorTop + 26; y < vb.y + vb.h; y += 34) {
    p.polyStroke([[vb.x, y], [vb.x + vb.w, y]], '#4d2f22', 1.5, false);
  }
  p.restore();

  // 擂台圆台
  p.ell(187, floorTop + 6, 186, 26, 'rgba(60,36,28,0.35)');
  p.ell(187, floorTop, 178, 22, '#f4d9b4');
  p.ell(187, floorTop - 3, 168, 17, '#ffeccd');

  // 场边旗帜
  drawFlag(p, 26, floorTop - 4, accent, t);
  drawFlag(p, 349, floorTop - 4, accent, t + 1);

  // 飘浮光点
  for (let i = 0; i < 14; i++) {
    const px = (i * 53 + Math.sin(t * 0.9 + i) * 14) % 375;
    const py = 150 + ((i * 37 + t * 26 + Math.sin(t + i) * 10) % 230);
    p.setAlpha(0.25 + Math.sin(t * 2 + i) * 0.12);
    p.circle(px, py, 1.8 + (i % 3), '#fff6cf');
  }
  p.setAlpha(1);

  // 顶部渐隐，保证血条 / 名字可读
  p.vGrad(vb.x, vb.y, vb.w, 172, [
    'rgba(16,11,30,0.62)', 'rgba(16,11,30,0.26)', 'rgba(16,11,30,0)',
  ], 8);
}

function drawFlag(p: Painter, x: number, groundY: number, color: string, t: number): void {
  p.fillRR(x - 2, groundY - 96, 4, 96, 2, '#7b5a3f');
  const sway = Math.sin(t * 2.2) * 4;
  p.quadFill([[x + 2, groundY - 94], [x + 30 + sway, groundY - 88], [x + 2, groundY - 64]], color);
  p.circle(x, groundY - 96, 4, '#ffe2a6');
}

export function drawMenuBg(p: Painter, vb: VB, t: number, accent: string): void {
  p.vGrad(vb.x, vb.y, vb.w, vb.h, ['#241a3d', '#37234f', '#181228'], 14);

  p.glow(70, 150, 210, accent, 0.14);
  p.glow(330, 520, 220, accent, 0.1);
  p.glow(300, 120, 120, '#ffd166', 0.08);

  for (let i = 0; i < 34; i++) {
    const sx = (i * 97 + 13) % 375;
    const sy = (i * 61 + 7) % 667;
    const a = 0.16 + Math.abs(Math.sin(t * 1.4 + i * 0.7)) * 0.4;
    p.setAlpha(a);
    p.circle(sx, sy, 1 + (i % 3) * 0.6, '#ffffff');
  }
  p.setAlpha(1);

  p.save();
  p.setAlpha(0.06);
  for (let i = 0; i < 5; i++) {
    const px = 36 + i * 82 + Math.sin(t * 0.6 + i) * 8;
    const py = 560 + (i % 2) * 46;
    drawPaw(p, px, py, 16, '#ffffff');
  }
  p.restore();
}

// 四角星闪光
export function sparkle(p: Painter, x: number, y: number, r: number, color: string): void {
  p.quadFill([
    [x, y - r],
    [x + r * 0.14, y - r * 0.14, x + r, y],
    [x + r * 0.14, y + r * 0.14, x, y + r],
    [x - r * 0.14, y + r * 0.14, x - r, y],
    [x - r * 0.14, y - r * 0.14, x, y - r],
  ], color);
}

// 大厅背景：高饱和天蓝渐变 + 光柱 + 云 + 气泡 + 底部水波（参考蛋仔派对配色）
export function drawLobbyBg(p: Painter, vb: VB, t: number, accent: string): void {
  p.vGrad(vb.x, vb.y, vb.w, vb.h, ['#0f5fd6', '#2a8ce8', '#5fc4f4', '#a8efff'], 18);

  // 中央光晕
  p.glow(187, 318, 290, '#e6faff', 0.14);
  p.glow(187, 318, 150, '#ffffff', 0.12);
  p.glow(187, 150, 120, '#bfe9ff', 0.1);

  // 斜向光束
  p.save();
  p.setAlpha(0.09);
  p.poly([[52, vb.y], [128, vb.y], [286, 470], [170, 486]], '#ffffff');
  p.poly([[252, vb.y], [312, vb.y], [430, 452], [330, 480]], '#ffffff');
  p.restore();

  // 云
  drawCloud(p, 66 + Math.sin(t * 0.14) * 18, 178, 0.8, 0.5);
  drawCloud(p, 318 + Math.sin(t * 0.11 + 2) * 22, 146, 0.62, 0.42);
  drawCloud(p, 24 + Math.sin(t * 0.2 + 1) * 14, 268, 0.5, 0.32);

  // 气泡
  for (let i = 0; i < 16; i++) {
    const bx = (i * 71 + 21) % 375 + Math.sin(t * 0.7 + i) * 8;
    const by = 620 - ((i * 53 + t * 26) % 520);
    const br = 3 + (i % 5) * 3;
    p.save();
    p.setAlpha(0.18 + (i % 4) * 0.04);
    p.circleStroke(bx, by, br, '#ffffff', 1.4);
    p.setAlpha(0.5);
    p.circle(bx - br * 0.3, by - br * 0.35, br * 0.28, '#ffffff');
    p.restore();
  }

  // 闪光
  for (let i = 0; i < 10; i++) {
    const sx = (i * 113 + 37) % 360 + 8;
    const sy = 130 + ((i * 79) % 420);
    const a = 0.2 + Math.abs(Math.sin(t * 1.6 + i * 0.9)) * 0.5;
    p.save();
    p.setAlpha(a);
    sparkle(p, sx, sy, 3 + (i % 3) * 1.6, '#ffffff');
    p.restore();
  }

  // 底部水波
  p.save();
  p.setAlpha(0.25);
  p.quadFill([[-20, 560], [60, 540, 130, 560], [210, 578, 290, 556], [350, 540, 400, 556],
    [400, 690], [-20, 690]], '#d9f7ff');
  p.setAlpha(0.16);
  p.quadFill([[-20, 600], [80, 578, 160, 600], [250, 620, 330, 596], [370, 582, 400, 596],
    [400, 690], [-20, 690]], '#ffffff');
  p.restore();

  // 顶部压暗，保证状态栏文字可读
  p.vGrad(vb.x, vb.y, vb.w, 128, [
    'rgba(8,44,110,0.45)', 'rgba(8,44,110,0.16)', 'rgba(8,44,110,0)',
  ], 6);

  // 段位主色点缀光
  p.save();
  p.setAlpha(0.12);
  p.glow(330, 560, 170, accent, 1);
  p.restore();
}

// 角色脚下的发光圆形地台
export function drawStage(p: Painter, cx: number, cy: number, rx: number, ry: number,
  color: string, t: number): void {
  p.glow(cx, cy, rx * 0.9, color, 0.2);
  p.ell(cx, cy + 6, rx * 1.04, ry * 1.1, 'rgba(6,40,96,0.22)');
  p.ell(cx, cy, rx, ry, 'rgba(226,248,255,0.9)');
  p.ell(cx, cy - 3, rx * 0.93, ry * 0.84, 'rgba(196,240,255,0.95)');
  p.ell(cx, cy - 6, rx * 0.72, ry * 0.62, 'rgba(255,255,255,0.95)');
  p.ring(cx, cy, rx * 1.02 + Math.sin(t * 2) * 3, ry * 1.04, 'rgba(255,255,255,0.55)', 2);
  p.ring(cx, cy, rx * 0.88, ry * 0.9, color, 2.4, 0.75);
}

export function drawPaw(p: Painter, x: number, y: number, r: number, color: string): void {
  p.ell(x, y + r * 0.3, r * 0.72, r * 0.62, color, 0);
  p.ell(x - r * 0.62, y - r * 0.28, r * 0.26, r * 0.32, color, -0.4);
  p.ell(x - r * 0.2, y - r * 0.5, r * 0.24, r * 0.34, color, -0.14);
  p.ell(x + r * 0.24, y - r * 0.48, r * 0.24, r * 0.34, color, 0.14);
  p.ell(x + r * 0.62, y - r * 0.22, r * 0.26, r * 0.32, color, 0.4);
}

// ---------------- 角色 ----------------

function drawTail(p: Painter, charId: string, skin: SkinCfg, t: number, seed: number): void {
  const sway = Math.sin(t * 4 + seed) * 0.28;
  p.save();
  p.translate(-22, -38);
  p.rotate(-0.5 + sway);
  if (charId === 'dog') {
    p.ell(-14, 0, 15, 9, skin.furDark, 0.3);
    p.ell(-25, 3, 11, 7, skin.fur, 0.55);
    p.ell(-33, 4, 7, 5, skin.belly, 0.8);
  } else {
    p.quadStroke([[0, 0], [-22, -6, -30, -26 + sway * 14]], skin.furDark, 9, false);
    p.quadStroke([[-22, -12], [-30, -22, -30, -26 + sway * 14]], skin.belly, 4, false);
  }
  p.restore();
}

function drawOneLeg(p: Painter, x: number, off: number, skin: SkinCfg): void {
  p.fillRR(x - 7, -32 + off, 14, 32, 7, skin.furDark);
  p.ell(x + 1, -1 + off, 11, 5, skin.fur);
  p.ell(x + 1, -2 + off, 6, 2.5, 'rgba(255,255,255,0.55)');
}

function drawLegs(p: Painter, skin: SkinCfg, st: string, t: number, seed: number): void {
  const walk = st === 'walk' ? Math.sin(t * 11 + seed) * 4 : 0;
  drawOneLeg(p, -12, walk, skin);
  drawOneLeg(p, 10, -walk, skin);
}

function drawArm(p: Painter, px: number, py: number, angle: number, len: number,
  skin: SkinCfg, weapon: WeaponCfg | null, rankIndex: number, t: number): void {
  p.save();
  p.translate(px, py);
  p.rotate(angle);
  p.fillRR(-3, -7, len + 6, 14, 7, skin.fur);
  p.strokeRR(-3, -7, len + 6, 14, 7, OUTLINE, 1.6);
  p.circle(len + 2, 0, 8.5, skin.fur);
  p.strokeRR(len - 6.5, -8.5, 17, 17, 8.5, OUTLINE, 1.6);
  if (weapon) drawWeapon(p, weapon, rankIndex, len + 6, t);
  p.restore();
}

function blade(p: Painter, w: WeaponCfg, len: number, wide: number, colorA: string, colorB: string,
  extra?: () => void): void {
  p.fillRR(2, -12, 6, 24, 3, w.color2);
  const pts = [[7, -wide / 2], [len - 9, -wide / 2], [len, 0], [len - 9, wide / 2], [7, wide / 2]];
  p.poly(pts, colorA);
  p.save();
  p.setAlpha(0.5);
  p.poly([[len * 0.42, -wide / 2], [len - 9, -wide / 2], [len, 0], [len - 9, wide / 2], [len * 0.42, wide / 2]], colorB);
  p.restore();
  p.save();
  p.setAlpha(0.7);
  p.fillRR(10, -wide / 2 + 1.5, len - 20, 2, 1, '#ffffff');
  p.restore();
  if (extra) extra();
}

function drawWeapon(p: Painter, w: WeaponCfg, rankIndex: number, x0: number, t: number): void {
  const t2 = w.type;
  p.save();
  p.translate(x0, 0);
  if (rankIndex >= 3) p.glow(10, 0, 18, w.color, 0.18);

  if (t2 === 'paw') {
    p.fillRR(0, -10, 22, 20, 10, w.color);
    p.strokeRR(0, -10, 22, 20, 10, 'rgba(70,54,60,0.35)', 1.5);
    for (let i = 0; i < 3; i++) p.ell(22, -6 + i * 6, 4.5, 2.6, w.color2, 0.2);
  } else if (t2 === 'wood') {
    p.fillRR(4, -5.5, 46, 11, 5.5, w.color);
    p.fillRR(34, -6, 16, 12, 6, w.color2);
    p.ell(18, -1, 3, 2, 'rgba(90,60,30,0.5)');
  } else if (t2 === 'fist' || t2 === 'void' || t2 === 'flame') {
    if (t2 === 'void') p.glow(14, 0, 26, w.color, 0.35);
    p.fillRR(0, -13, 25, 26, 11, w.color);
    p.strokeRR(0, -13, 25, 26, 11, 'rgba(40,25,50,0.4)', 1.6);
    for (let i = 0; i < 3; i++) p.circle(24, -8 + i * 8, 4, w.color2);
    if (t2 === 'flame') {
      for (let i = 0; i < 3; i++) {
        const fy = -9 + i * 9;
        p.quadFill([
          [6, fy],
          [30 + Math.sin(t * 9 + i) * 4, fy - 12, 40, fy + 2],
          [24, fy + 8, 6, fy],
        ], i === 1 ? '#ffd166' : w.color);
      }
    }
  } else if (t2 === 'crystal') {
    const pts = [[6, 0], [18, -12], [48, -6], [56, 0], [48, 6], [18, 12]];
    p.poly(pts, w.color);
    p.save();
    p.setAlpha(0.55);
    p.poly([[18, -12], [48, -6], [56, 0], [48, 6], [18, 12], [22, 0]], '#ffffff');
    p.restore();
    p.polyStroke(pts, 'rgba(255,255,255,0.8)', 1.4);
  } else if (t2 === 'star') {
    p.fillRR(2, -3.5, 36, 7, 3.5, '#e3c98c');
    p.star(44, 0, 12, w.color, Math.sin(t * 2) * 0.2);
    p.circle(44, 0, 4, '#ffffff');
  } else if (t2 === 'scepter') {
    p.fillRR(2, -3.5, 42, 7, 3.5, '#e3c98c');
    p.circle(46, 0, 9, w.color);
    p.circle(46, 0, 5, '#ffffff');
    p.polyStroke([[38, -6], [40, -14], [44, -8], [48, -14], [52, -8], [54, -14], [56, -6]], '#ffe9a3', 3, false);
  } else if (t2 === 'greatsword') {
    blade(p, w, 64, 19, w.color, w.color2, () => p.circle(5, 0, 4, '#ffd166'));
  } else if (t2 === 'holy') {
    blade(p, w, 60, 14, w.color, w.color2, () => {
      p.save();
      p.setAlpha(0.85);
      p.poly([[8, -12], [-10, -30], [0, -10]], '#fff3c4');
      p.poly([[8, 12], [-10, 30], [0, 10]], '#fff3c4');
      p.restore();
    });
  } else if (t2 === 'rainbow') {
    p.fillRR(2, -12, 6, 24, 3, '#ffd166');
    const stops = ['#ff8ab5', '#ffd166', '#7ee1a8', '#5fd0ff', '#b58cff'];
    p.poly([[7, -8], [56, -8], [64, 0], [56, 8], [7, 8]], stops[0]);
    for (let i = 1; i < stops.length; i++) {
      const x1 = 7 + (57 * i) / stops.length;
      const x2 = 7 + (57 * (i + 1)) / stops.length;
      p.poly([[x1, -8], [x2, -8 + (x2 > 56 ? 0 : 0)], [x2, 8], [x1, 8]], stops[i]);
    }
    p.star(60, 0, 4, '#ffffff');
  } else {
    blade(p, w, 50, 11, w.color, w.color2);
  }
  p.restore();
}

function drawEars(p: Painter, charId: string, skin: SkinCfg): void {
  p.save();
  p.translate(0, -126);
  if (charId === 'dog') {
    const ear = (dir: number) => {
      p.save();
      p.scale(dir, 1);
      p.translate(10, 0);
      p.quadFill([
        [-7, 16], [-12, -16, 4, -33], [25, -29, 28, 2], [27, 15, 8, 17],
      ], shadeHex(skin.furDark, 0.9));
      p.quadStroke([
        [-7, 16], [-12, -16, 4, -33], [25, -29, 28, 2], [27, 15, 8, 17],
      ], OUTLINE, 1.8, true);
      p.quadFill([
        [-1, 9], [-4, -12, 6, -24], [18, -20, 19, 2], [17, 10, 6, 11],
      ], '#f2b9c4');
      p.restore();
    };
    ear(1);
    ear(-1);
  } else {
    const ear = (dir: number) => {
      p.save();
      p.scale(dir, 1);
      p.translate(15, 6);
      p.quadFill([[-5, 12], [-2, -18, 3, -31], [10, -27, 19, 8]], skin.fur);
      p.quadStroke([[-5, 12], [-2, -18, 3, -31], [10, -27, 19, 8]], OUTLINE, 1.8, true);
      p.quadFill([[1, 8], [3, -14, 5, -22], [9, -18, 14, 4]], '#f7b8c8');
      p.restore();
    };
    ear(1);
    ear(-1);
  }
  p.restore();
}

function drawHeadMark(p: Painter, charId: string, skin: SkinCfg, t: number): void {
  // 原版用 clip 裁剪到头部圆形；Graphics 无裁剪，改为整体收缩到 0.86 避免溢出
  if (charId === 'dog') {
    const hood = shrink([
      [-34, -98], [-34, -136, 0, -137], [34, -136, 34, -98],
      [24, -110, 14, -113], [9, -107], [0, -101, -9, -107],
      [-14, -113], [-24, -110, -34, -98],
    ], 0, -104, 0.86);
    p.quadFill(hood, shadeHex(skin.furDark, 0.82));
    const mark = shrink([
      [-7, -137], [7, -137], [10, -116], [0, -109, -10, -116],
    ], 0, -104, 0.86);
    p.quadFill(mark, skin.belly);
  } else {
    p.save();
    p.setAlpha(0.9);
    for (let i = 0; i < 3; i++) {
      const sx = -10 + i * 10;
      p.quadStroke([[sx, -132], [sx + 2, -127, sx + 1, -120 + Math.abs(i - 1) * 2]], shadeHex(skin.furDark, 0.8), 3, false);
    }
    p.restore();
  }

  if (charId === 'cat') {
    const sway = Math.sin(t * 4) * 1.2;
    p.save();
    p.translate(sway, -70);
    p.ellStroke(0, -6, 9, 9, 0, '#e0a92c', 2, 1, 0.15, PI - 0.15, false);
    p.circle(0, 1, 7, '#ffd166');
    p.circle(-1.5, -1.5, 3, '#fff3c4');
    p.polyStroke([[-5, 6], [0, 9], [5, 6]], '#c9942a', 2, false);
    p.restore();
  }
}

function drawFace(p: Painter, charId: string, skin: SkinCfg, st: string, t: number): void {
  const hurt = st === 'hurt' || st === 'ko';
  p.save();
  if (hurt) {
    for (let i = 0; i < 2; i++) {
      const ex = -11 + i * 25;
      p.polyStroke([[ex - 5, -111], [ex + 5, -101]], '#3a2a3f', 3, false);
      p.polyStroke([[ex + 5, -111], [ex - 5, -101]], '#3a2a3f', 3, false);
    }
  } else {
    const attack = st === 'punch' || st === 'heavy' || st === 'special';
    p.ell(-11, -105, 5.2, attack ? 3.4 : 5.4, '#3a2a3f');
    p.ell(14, -105, 5.2, attack ? 3.4 : 5.4, '#3a2a3f');
    p.circle(-9, -107, 1.8, '#ffffff');
    p.circle(16, -107, 1.8, '#ffffff');
  }
  p.ell(-21, -96, 6, 3.6, 'rgba(255,150,170,0.55)');
  p.ell(24, -96, 6, 3.6, 'rgba(255,150,170,0.55)');

  if (charId === 'dog') {
    p.ell(6, -94, 16, 11, skin.belly);
    p.ell(20, -99, 3.6, 2.8, '#3a2a3f');
    p.quadStroke([[18, -92], [12, -88, 4, -91]], '#a97e8a', 1.6, false);
    p.ell(2, -104, 9, 6, skin.belly);
  } else {
    p.ell(4, -93, 11, 8, skin.belly);
    p.poly([[4, -97], [9, -98], [6.5, -94]], '#f08b9f');
    for (let i = 0; i < 3; i++) {
      p.polyStroke([[15, -98 + i * 3], [31, -102 + i * 5]], 'rgba(90,70,60,0.55)', 1.4, false);
      p.polyStroke([[15, -98 + i * 3], [31, -90 + i * 5]], 'rgba(90,70,60,0.55)', 1.4, false);
    }
  }
  p.restore();
}

function drawCrown(p: Painter, skin: SkinCfg, t: number): void {
  if (!skin.crown) return;
  p.save();
  p.translate(0, -140 + Math.sin(t * 2) * 1.5);
  const pts = [[-20, 2], [-24, -14], [-9, -4], [0, -18], [9, -4], [24, -14], [20, 2]];
  p.poly(pts, '#fff2b8');
  p.save();
  p.setAlpha(0.6);
  p.poly([[-20, 2], [-24, -14], [-9, -4], [0, -18], [9, -4], [24, -14], [20, 2], [20, 2], [0, 2]], '#e0a92c');
  p.restore();
  p.polyStroke(pts, 'rgba(120,80,20,0.55)', 1.2, true);
  p.circle(0, -3, 3.2, '#ff6b9a');
  p.circle(-15, -5, 2.2, '#5fd0ff');
  p.circle(15, -5, 2.2, '#5fd0ff');
  p.restore();
}

function drawCape(p: Painter, skin: SkinCfg, t: number, seed: number): void {
  p.save();
  p.translate(0, -66);
  const sway = Math.sin(t * 2.4 + seed) * 5;
  p.quadFill([
    [-20, 0],
    [-38 - sway, 22, -30 - sway, 54],
    [-6, 42, 0, 50],
    [6, 42, 30 + sway, 54],
    [38 + sway, 22, 20, 0],
  ], skin.armor);
  p.save();
  p.setAlpha(0.25);
  p.quadStroke([
    [-20, 0],
    [-38 - sway, 22, -30 - sway, 54],
    [-6, 42, 0, 50],
    [6, 42, 30 + sway, 54],
    [38 + sway, 22, 20, 0],
  ], '#ffffff', 1.4, true);
  p.restore();
  p.restore();
}

export function drawFighter(p: Painter, f: FighterView, t: number): void {
  const skin = f.skin;
  const charId = f.charId;
  const st = f.state;
  const seed = f.seed || 0;
  const prog = f.dur > 0 ? Math.min(1, f.stateT / f.dur) : 0;

  if (f.hideShadow !== true) p.ell(f.x, f.y + 5, 38, 10, 'rgba(38,30,60,0.16)');

  if (skin.aura > 0 && st !== 'ko') {
    const pulse = 0.7 + Math.sin(t * 2 + seed) * 0.1;
    p.glow(f.x, f.y - 66, (56 + skin.aura * 8) * pulse, skin.glow, 0.16 * pulse);
  }

  p.save();
  p.translate(f.x, f.y);
  p.scale(f.facing, 1);
  if (st === 'ko') p.rotate(1.5);

  const bob = st === 'idle' ? Math.sin(t * 3 + seed) * 2.2
    : st === 'walk' ? Math.abs(Math.sin(t * 10 + seed)) * 2.6 : 0;
  p.translate(0, -bob);
  if (st === 'hurt') p.rotate(-0.16);
  if (st === 'block') p.translate(0, 3);

  if (skin.crown) drawCape(p, skin, t, seed);
  drawTail(p, charId, skin, t, seed);
  drawLegs(p, skin, st, t, seed);

  let leftAngle = 1.38;
  if (st === 'punch') leftAngle = 1.75;
  if (st === 'heavy') leftAngle = 1.55;
  if (st === 'special') leftAngle = -0.05;
  if (st === 'block') leftAngle = 0.62;
  if (st === 'hurt') leftAngle = 2.1;
  if (st === 'ko') leftAngle = 1.5;
  drawArm(p, -16, -62, leftAngle, 24, skin, null, f.rankIndex || 0, t);

  // 身体
  p.fillRR(-22, -74, 44, 60, 20, skin.fur);
  p.strokeRR(-22, -74, 44, 60, 20, OUTLINE, 2);
  p.ell(0, -48, 13, 19, skin.belly);
  p.fillRR(-22, -38, 44, 9, 4.5, skin.armor);
  p.ell(-8, -60, 6, 4, 'rgba(255,255,255,0.35)');

  drawEars(p, charId, skin);

  // 头
  p.circle(0, -104, 31, skin.fur);
  p.circleStroke(0, -104, 31, OUTLINE, 2);
  p.ell(-9, -124, 13, 6, 'rgba(255,255,255,0.4)', -0.35);

  drawHeadMark(p, charId, skin, t);
  drawFace(p, charId, skin, st, t);
  drawCrown(p, skin, t);

  let rightAngle = 1.12;
  if (st === 'punch') rightAngle = 0.04;
  if (st === 'heavy') rightAngle = prog < 0.45 ? -1.55 : 0.12;
  if (st === 'special') rightAngle = -0.02;
  if (st === 'block') rightAngle = 0.5;
  if (st === 'hurt') rightAngle = 2.0;
  if (st === 'ko') rightAngle = 1.2;
  drawArm(p, 18, -62, rightAngle, 24, skin, f.weapon, f.rankIndex || 0, t);

  // 格挡护盾
  if (st === 'block') {
    p.save();
    p.translate(44, -64);
    p.setAlpha(0.5);
    p.ellStroke(0, 0, 38, 38, 0, 'rgba(140,200,255,0.5)', 0, 1, -1.15, 1.15, true);
    p.fill('rgba(140,200,255,0.5)');
    p.setAlpha(0.9);
    p.ellStroke(0, 0, 38, 38, 0, '#bfe3ff', 4, 1, -1.15, 1.15, false);
    p.restore();
    p.glow(44, -64, 30, '#9fd8ff', 0.2);
  }

  // 受击闪白
  if (f.flash > 0) {
    p.save();
    p.setAlpha(Math.min(0.6, f.flash * 3));
    p.ell(0, -58, 30, 46, '#ffffff');
    p.ell(0, -104, 32, 32, '#ffffff');
    p.restore();
  }
  p.restore();
}

export function drawMiniFighter(p: Painter, x: number, y: number, charId: string,
  skin: SkinCfg, weapon: WeaponCfg, scale: number, t: number): void {
  p.save();
  p.translate(x, y);
  p.scale(scale, scale);
  drawFighter(p, {
    x: 0, y: 0, facing: 1, state: 'idle', stateT: 0, dur: 0,
    seed: 2, skin, weapon, charId, rankIndex: 0, flash: 0,
  }, t);
  p.restore();
}

export function drawWeaponIcon(p: Painter, x: number, y: number, scale: number,
  weapon: WeaponCfg, rankIndex: number, t: number): void {
  p.save();
  p.translate(x, y);
  p.rotate(-0.35);
  p.scale(scale, scale);
  drawWeapon(p, weapon, rankIndex, 0, t || 0);
  p.restore();
}

export function drawParticles(p: Painter, list: any[]): void {
  for (let i = 0; i < list.length; i++) {
    const pt = list[i];
    const k = pt.life / pt.max;
    p.save();
    p.setAlpha(Math.max(0, Math.min(1, k)));
    p.circle(pt.x, pt.y, pt.r * (0.4 + k * 0.8), pt.color);
    p.restore();
  }
}

export function drawRings(p: Painter, list: any[]): void {
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const k = r.life / r.max;
    p.save();
    p.setAlpha(k * 0.7);
    p.circleStroke(r.x, r.y, r.radius + (1 - k) * r.grow, r.color, 3 * k + 1);
    p.restore();
  }
}

export function drawTexts(p: Painter, list: any[]): void {
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const k = d.life / d.max;
    p.text(d.text, d.x, d.y, {
      size: d.size, align: 'center', color: d.color,
      stroke: 'rgba(30,22,44,0.75)', strokeWidth: 3, alpha: Math.min(1, k * 2),
    });
  }
}

export function drawStar(p: Painter, x: number, y: number, r: number, color: string): void {
  p.star(x, y, r, color);
}

export const draw = {
  shade: shadeHex,
  star: drawStar,
  shadeSkin,
  shadeWeapon,
  drawArenaBg,
  drawMenuBg,
  drawLobbyBg,
  drawStage,
  sparkle,
  drawPaw,
  drawFighter,
  drawMiniFighter,
  drawWeaponIcon,
  drawParticles,
  drawRings,
  drawTexts,
  mix: mixHex,
};

export default draw;
