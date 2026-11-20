// Canvas 2D → Cocos Graphics 适配层
// 保持原有绘制代码的坐标习惯：虚拟坐标 375×667、左上角原点、y 向下、支持 translate/rotate/scale
import { Color, Graphics, Label, LabelOutline, Node, UITransform, Vec3 } from 'cc';

const VW = 375;
const VH = 667;

export interface TextOpt {
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  regular?: boolean;
  stroke?: string;
  strokeWidth?: number;
  alpha?: number;
  maxWidth?: number;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  size: number;
  color: Color;
  align: number; // 0 left, 1 center, 2 right
  bold: boolean;
  stroke: string | null;
  strokeWidth: number;
  maxWidth: number;
}

interface Mat {
  a: number; b: number; c: number; d: number; e: number; f: number;
}

const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const colorCache: Record<string, Color> = {};

function parseColor(hex: string, alphaMul = 1): Color {
  let base = colorCache[hex];
  if (!base) {
    let r = 255, g = 255, b = 255, a = 255;
    const s = (hex || '').trim();
    if (s.charAt(0) === '#') {
      let h = s.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      if (h.length >= 6) {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
        if (h.length >= 8) a = parseInt(h.slice(6, 8), 16);
      }
    } else {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(',');
        r = parseFloat(parts[0]);
        g = parseFloat(parts[1]);
        b = parseFloat(parts[2]);
        a = parts.length > 3 ? Math.round(parseFloat(parts[3]) * 255) : 255;
      }
    }
    base = new Color(r | 0, g | 0, b | 0, a);
    colorCache[hex] = base;
  }
  if (alphaMul === 1) return base;
  return new Color(base.r, base.g, base.b, Math.max(0, Math.min(255, Math.round(base.a * alphaMul))));
}

export function cstr(hex: string, alphaMul = 1): Color {
  return parseColor(hex, alphaMul);
}

export function shadeHex(hex: string, k: number): string {
  if (!hex || hex.charAt(0) !== '#') return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  if (h.length !== 6) return hex;
  const clamp255 = (v: number) => {
    const n = Math.max(0, Math.min(255, Math.round(v)));
    return (n < 16 ? '0' : '') + n.toString(16);
  };
  return '#' + clamp255(parseInt(h.slice(0, 2), 16) * k) +
    clamp255(parseInt(h.slice(2, 4), 16) * k) +
    clamp255(parseInt(h.slice(4, 6), 16) * k);
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseColor(a, 1);
  const pb = parseColor(b, 1);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const ca = (pa.a + (pb.a - pa.a) * t) / 255;
  return 'rgba(' + cl(pa.r + (pb.r - pa.r) * t) + ',' + cl(pa.g + (pb.g - pa.g) * t) + ',' +
    cl(pa.b + (pb.b - pa.b) * t) + ',' + Math.round(ca * 100) / 100 + ')';
}

// 渐变降级：Graphics 不支持渐变，用色带近似
export function bandColors(stops: string[], seg = 10): string[] {
  const n = stops.length;
  const out: string[] = [];
  for (let i = 0; i < seg; i++) {
    const t = (i + 0.5) / seg;
    const idx = Math.max(0, Math.min(n - 2, Math.floor(t * (n - 1))));
    const local = t * (n - 1) - idx;
    out.push(mixHex(stops[idx], stops[Math.min(n - 1, idx + 1)], local));
  }
  return out;
}

export function measureText(str: string, size: number): number {
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    w += code < 128 ? 0.56 : 1.0;
  }
  return w * size;
}

export class Painter {
  readonly g: Graphics;
  private readonly host: Node;
  private readonly labelPool: Label[] = [];
  private readonly labelNodes: Node[] = [];
  private readonly labelKeys: string[] = [];
  /** 文本布局缓存：避免每帧重复写节点属性触发重建 */
  private readonly labelAnchors: number[] = [];
  private readonly labelXs: number[] = [];
  private readonly labelYs: number[] = [];
  private readonly labelColors: Array<Color | null> = [];
  private readonly tmpVec = new Vec3();
  private texts: TextItem[] = [];
  /** 当前帧文本数量（texts 数组跨帧复用，避免每帧新建对象造成 GC 抖动） */
  private textCount = 0;
  alpha = 1;

  private m: Mat = { ...IDENTITY };
  private stack: { m: Mat; alpha: number }[] = [];
  private halfW = VW / 2;
  private halfH = VH / 2;

  constructor(host: Node) {
    this.host = host;
    this.g = host.getComponent(Graphics) || host.addComponent(Graphics);
    this.g.lineJoin = Graphics.LineJoin.ROUND;
  }

  /** 动态虚拟分辨率（竖屏 HUD 用；默认为设计尺寸 375×667） */
  setSize(w: number, h: number): void {
    this.halfW = w / 2;
    this.halfH = h / 2;
  }

  // ---------------- 帧控制 ----------------
  begin(): void {
    this.g.clear();
    this.alpha = 1;
    this.m = { ...IDENTITY };
    this.stack.length = 0;
    this.textCount = 0;
  }

  end(): void {
    this.flushTexts();
  }

  // ---------------- 变换 ----------------
  save(): void {
    this.stack.push({ m: { ...this.m }, alpha: this.alpha });
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) {
      this.m = s.m;
      this.alpha = s.alpha;
    }
  }

  translate(x: number, y: number): void {
    this.mul({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
  }

  rotate(r: number): void {
    const c = Math.cos(r), s = Math.sin(r);
    this.mul({ a: c, b: s, c: -s, d: c, e: 0, f: 0 });
  }

  scale(sx: number, sy: number): void {
    this.mul({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
  }

  setAlpha(a: number): void {
    this.alpha = a;
  }

  private mul(n: Mat): void {
    const m = this.m;
    this.m = {
      a: m.a * n.a + m.c * n.b,
      b: m.b * n.a + m.d * n.b,
      c: m.a * n.c + m.c * n.d,
      d: m.b * n.c + m.d * n.d,
      e: m.a * n.e + m.c * n.f + m.e,
      f: m.b * n.e + m.d * n.f + m.f,
    };
  }

  private gx(x: number, y: number): number {
    const m = this.m;
    return m.a * x + m.c * y + m.e - this.halfW;
  }

  private gy(x: number, y: number): number {
    const m = this.m;
    const py = m.b * x + m.d * y + m.f;
    return this.halfH - py;
  }

  // ---------------- 基础图元 ----------------
  private start(x: number, y: number): void {
    this.g.moveTo(this.gx(x, y), this.gy(x, y));
  }

  private line(x: number, y: number): void {
    this.g.lineTo(this.gx(x, y), this.gy(x, y));
  }

  private close(): void {
    this.g.close();
  }

  private setFill(color: string, alphaMul = 1): void {
    this.g.fillColor = parseColor(color, alphaMul * this.alpha);
  }

  fill(color: string, alphaMul = 1): void {
    this.setFill(color, alphaMul);
    this.g.fill();
  }

  stroke(color: string, width = 1, alphaMul = 1): void {
    this.g.strokeColor = parseColor(color, alphaMul * this.alpha);
    this.g.lineWidth = width;
    this.g.stroke();
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.start(x, y);
    this.line(x + w, y);
    this.line(x + w, y + h);
    this.line(x, y + h);
    this.close();
    this.fill(color);
  }

  rectStroke(x: number, y: number, w: number, h: number, color: string, lw = 1): void {
    this.start(x, y);
    this.line(x + w, y);
    this.line(x + w, y + h);
    this.line(x, y + h);
    this.close();
    this.stroke(color, lw);
  }

  rrPath(x: number, y: number, w: number, h: number, r: number): void {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    this.start(x + rad, y);
    this.line(x + w - rad, y);
    this.g.quadraticCurveTo(this.gx(x + w, y), this.gy(x + w, y), this.gx(x + w, y + rad), this.gy(x + w, y + rad));
    this.line(x + w, y + h - rad);
    this.g.quadraticCurveTo(this.gx(x + w, y + h), this.gy(x + w, y + h), this.gx(x + w - rad, y + h), this.gy(x + w - rad, y + h));
    this.line(x + rad, y + h);
    this.g.quadraticCurveTo(this.gx(x, y + h), this.gy(x, y + h), this.gx(x, y + h - rad), this.gy(x, y + h - rad));
    this.line(x, y + rad);
    this.g.quadraticCurveTo(this.gx(x, y), this.gy(x, y), this.gx(x + rad, y), this.gy(x + rad, y));
    this.close();
  }

  fillRR(x: number, y: number, w: number, h: number, r: number, color: string, alphaMul = 1): void {
    this.rrPath(x, y, w, h, r);
    this.fill(color, alphaMul);
  }

  strokeRR(x: number, y: number, w: number, h: number, r: number, color: string, lw = 1, alphaMul = 1): void {
    this.rrPath(x, y, w, h, r);
    this.stroke(color, lw, alphaMul);
  }

  circle(x: number, y: number, r: number, color: string, alphaMul = 1): void {
    this.ell(x, y, r, r, color, 0, alphaMul);
  }

  circleStroke(x: number, y: number, r: number, color: string, lw = 1, alphaMul = 1): void {
    this.ellStroke(x, y, r, r, 0, color, lw, alphaMul, 0, Math.PI * 2);
  }

  ell(x: number, y: number, rx: number, ry: number, color: string, rot = 0, alphaMul = 1): void {
    this.ellStroke(x, y, rx, ry, rot, color, 0, alphaMul, 0, Math.PI * 2);
    this.fill(color, alphaMul);
  }

  ellStroke(
    x: number, y: number, rx: number, ry: number, rot: number,
    color: string, lw: number, alphaMul = 1, a0 = 0, a1 = Math.PI * 2, closeIt = true,
  ): void {
    const seg = Math.max(8, Math.min(48, Math.round((rx + ry) * 0.6)));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      const ex = Math.cos(a) * rx;
      const ey = Math.sin(a) * ry;
      const px = x + ex * cr - ey * sr;
      const py = y + ex * sr + ey * cr;
      if (i === 0) this.start(px, py);
      else this.line(px, py);
    }
    if (closeIt) this.close();
    if (lw > 0) this.stroke(color, lw, alphaMul);
  }

  // 圆环（描边），用于光环、能量圈
  ring(x: number, y: number, rx: number, ry: number, color: string, lw = 2, alphaMul = 1): void {
    this.ellStroke(x, y, rx, ry, 0, color, lw, alphaMul, 0, Math.PI * 2);
  }

  // 发光近似：由外到内多层半透明圆
  glow(x: number, y: number, r: number, color: string, alphaMul = 0.2): void {
    const steps = 4;
    for (let i = steps; i >= 1; i--) {
      const rr = r * (i / steps);
      this.circle(x, y, rr, color, (alphaMul / steps) * (steps - i + 1) * 0.6);
    }
  }

  // 路径：直接使用调用方坐标
  poly(points: number[][], color: string, closeIt = true): void {
    for (let i = 0; i < points.length; i++) {
      if (i === 0) this.start(points[i][0], points[i][1]);
      else this.line(points[i][0], points[i][1]);
    }
    if (closeIt) this.close();
    this.fill(color);
  }

  polyStroke(points: number[][], color: string, lw = 1, closeIt = true): void {
    for (let i = 0; i < points.length; i++) {
      if (i === 0) this.start(points[i][0], points[i][1]);
      else this.line(points[i][0], points[i][1]);
    }
    if (closeIt) this.close();
    this.stroke(color, lw);
  }

  quadPath(points: number[][], color: string): void {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) this.start(p[0], p[1]);
      else if (p.length >= 4) {
        this.g.quadraticCurveTo(this.gx(p[0], p[1]), this.gy(p[0], p[1]), this.gx(p[2], p[3]), this.gy(p[2], p[3]));
      } else {
        this.line(p[0], p[1]);
      }
    }
  }

  quadFill(points: number[][], color: string, closeIt = true): void {
    this.quadPath(points, color);
    if (closeIt) this.close();
    this.fill(color);
  }

  quadStroke(points: number[][], color: string, lw = 1, closeIt = false): void {
    this.quadPath(points, color);
    if (closeIt) this.close();
    this.stroke(color, lw);
  }

  star(x: number, y: number, r: number, color: string, rot = 0): void {
    const pts: number[][] = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5 + rot;
      const b = a + Math.PI / 5;
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
      pts.push([x + Math.cos(b) * r * 0.45, y + Math.sin(b) * r * 0.45]);
    }
    this.poly(pts, color);
  }

  // 纵向渐变（自上而下）
  vGrad(x: number, y: number, w: number, h: number, stops: string[], seg = 10): void {
    const cols = bandColors(stops, seg);
    const bh = h / seg;
    for (let i = 0; i < seg; i++) {
      this.rect(x, y + i * bh, w, bh + 0.6, cols[i]);
    }
  }

  // 横向渐变（自左向右）
  hGrad(x: number, y: number, w: number, h: number, stops: string[], seg = 10): void {
    const cols = bandColors(stops, seg);
    const bw = w / seg;
    for (let i = 0; i < seg; i++) {
      this.rect(x + i * bw, y, bw + 0.6, h, cols[i]);
    }
  }

  // ---------------- 文本 ----------------
  text(str: string, x: number, y: number, opt: TextOpt = {}): void {
    if (!str) return;
    const size = opt.size || 16;
    const alphaMul = (opt.alpha === undefined ? 1 : opt.alpha) * this.alpha;
    let t = this.texts[this.textCount];
    if (!t) {
      t = { str: '', x: 0, y: 0, size: size, color: new Color(), align: 0, bold: false, stroke: null, strokeWidth: 4, maxWidth: 0 };
      this.texts[this.textCount] = t;
    }
    t.str = str;
    t.x = this.gx(x, y);
    t.y = this.gy(x, y);
    t.size = size;
    t.color = parseColor(opt.color || '#ffffff', alphaMul);
    t.align = opt.align === 'center' ? 1 : opt.align === 'right' ? 2 : 0;
    t.bold = !opt.regular;
    t.stroke = opt.stroke || null;
    t.strokeWidth = opt.strokeWidth || 4;
    t.maxWidth = opt.maxWidth === undefined ? 0 : opt.maxWidth;
    this.textCount++;
  }

  private ensureLabel(i: number): Label {
    let label = this.labelPool[i];
    if (!label) {
      const node = new Node('T' + i);
      node.parent = this.host;
      node.layer = this.host.layer;
      node.addComponent(UITransform);
      label = node.addComponent(Label);
      label.overflow = Label.Overflow.NONE;
      label.enableWrapText = false;
      this.labelPool[i] = label;
      this.labelNodes[i] = node;
    }
    return label;
  }

  private flushTexts(): void {
    const n = this.textCount;
    for (let i = 0; i < n; i++) {
      const t = this.texts[i];
      const label = this.ensureLabel(i);
      const node = this.labelNodes[i];
      if (!node.active) node.active = true;
      const ut = node.getComponent(UITransform)!;
      const anchorX = t.align === 0 ? 0 : t.align === 1 ? 0.5 : 1;
      // 每帧只在真正变化时写属性，避免无谓的脏标记与材质刷新
      if (this.labelAnchors[i] !== anchorX) {
        this.labelAnchors[i] = anchorX;
        ut.setAnchorPoint(anchorX, 0.5);
      }
      const px = this.labelXs[i];
      const py = this.labelYs[i];
      if (px !== t.x || py !== t.y) {
        this.labelXs[i] = t.x;
        this.labelYs[i] = t.y;
        this.tmpVec.set(t.x, t.y, 0);
        node.setPosition(this.tmpVec);
      }
      const key = t.str + '|' + t.size + '|' + (t.bold ? 'b' : 'r');
      if (this.labelKeys[i] !== key) {
        this.labelKeys[i] = key;
        label.fontSize = t.size;
        label.lineHeight = t.size + 3;
        label.string = t.str;
        label.isBold = t.bold;
        ut.setContentSize(Math.max(4, measureText(t.str, t.size) + 4), t.size + 6);
      }
      const c = t.color;
      const prev = this.labelColors[i];
      if (!prev || prev.r !== c.r || prev.g !== c.g || prev.b !== c.b || prev.a !== c.a) {
        this.labelColors[i] = new Color(c.r, c.g, c.b, c.a);
        label.color = c;
      }
      let outline = node.getComponent(LabelOutline);
      if (t.stroke) {
        if (!outline) outline = node.addComponent(LabelOutline);
        if (!outline.enabled) outline.enabled = true;
        outline.color = parseColor(t.stroke, this.alpha);
        outline.width = t.strokeWidth * 0.5;
      } else if (outline && outline.enabled) {
        outline.enabled = false;
      }
    }
    for (let i = n; i < this.labelNodes.length; i++) {
      const node = this.labelNodes[i];
      if (node && node.active) node.active = false;
    }
  }
}
