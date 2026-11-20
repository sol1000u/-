// 通用 UI 组件（Canvas 版 ui.js 的 Graphics 移植）
import { Painter, measureText } from '../render/Painter';
import { draw } from '../render/Draw';
import CFG from '../core/Config';

export interface ButtonOpt {
  x: number; y: number; w: number; h: number; r?: number;
  label?: string; sub?: string; color?: string; color2?: string;
  textColor?: string; subColor?: string; size?: number; subSize?: number;
  shape?: 'pill' | 'circle'; border?: string; enabled?: boolean; visible?: boolean;
}

export class Button {
  x: number; y: number; w: number; h: number; r: number;
  label: string; sub: string; color: string; color2: string;
  textColor: string; subColor: string; size: number; subSize: number;
  shape: string; border: string; enabled: boolean; visible: boolean;
  press = 0;

  constructor(o: ButtonOpt) {
    this.x = o.x;
    this.y = o.y;
    this.w = o.w;
    this.h = o.h;
    this.r = o.r !== undefined ? o.r : Math.min(this.h / 2, 16);
    this.label = o.label || '';
    this.sub = o.sub || '';
    this.color = o.color || '#ff8f4c';
    this.color2 = o.color2 || '#e2632c';
    this.textColor = o.textColor || '#ffffff';
    this.subColor = o.subColor || 'rgba(255,255,255,0.8)';
    this.size = o.size || 18;
    this.subSize = o.subSize || 10;
    this.shape = o.shape || 'pill';
    this.border = o.border || 'rgba(255,255,255,0.45)';
    this.enabled = o.enabled !== false;
    this.visible = o.visible !== false;
  }

  hit(px: number, py: number): boolean {
    if (!this.visible) return false;
    if (this.shape === 'circle') {
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;
      const rr = this.w / 2;
      const dx = px - cx;
      const dy = py - cy;
      return dx * dx + dy * dy <= rr * rr;
    }
    return px >= this.x && px <= this.x + this.w &&
      py >= this.y && py <= this.y + this.h;
  }

  draw(p: Painter): void {
    if (!this.visible) return;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    p.save();
    if (this.press > 0) {
      const s = 1 - Math.min(0.06, this.press * 6);
      p.translate(cx, cy);
      p.scale(s, s);
      p.translate(-cx, -cy);
    }
    p.setAlpha(this.enabled ? 1 : 0.42);

    // 投影
    p.save();
    p.setAlpha(0.3 * (this.enabled ? 1 : 0.42));
    if (this.shape === 'circle') p.circle(cx, cy + 4, this.w / 2, '#000000');
    else p.fillRR(this.x, this.y + 4, this.w, this.h, this.r, '#000000');
    p.restore();

    // 主体
    if (this.shape === 'circle') {
      p.circle(cx, cy, this.w / 2, this.color);
      p.save();
      p.setAlpha(0.45 * (this.enabled ? 1 : 0.42));
      p.ell(cx, cy - this.w * 0.22, this.w * 0.3, this.w * 0.16, this.color2, 0);
      p.restore();
    } else {
      // 不用 vGrad：矩形色带会溢出圆角，改为整块圆角底 + 下半部加深
      p.fillRR(this.x, this.y, this.w, this.h, this.r, this.color);
      p.save();
      p.setAlpha(0.5 * (this.enabled ? 1 : 0.42));
      p.fillRR(this.x, this.y + this.h * 0.46, this.w, this.h * 0.54, this.r, this.color2);
      p.restore();
      p.save();
      p.setAlpha(0.5 * (this.enabled ? 1 : 0.42));
      p.strokeRR(this.x, this.y, this.w, this.h, this.r, this.border, 2);
      p.restore();
    }

    // 顶部高光
    p.save();
    p.setAlpha(0.22 * (this.enabled ? 1 : 0.42));
    if (this.shape === 'circle') p.ell(cx, cy - this.h * 0.24, this.w * 0.32, this.h * 0.12, '#ffffff');
    else p.fillRR(this.x + 5, this.y + 4, this.w - 10, this.h * 0.28, this.h * 0.14, '#ffffff');
    p.restore();

    if (this.label) {
      const ty = this.sub ? cy - 7 : cy;
      p.text(this.label, cx, ty, { size: this.size, color: this.textColor, align: 'center' });
    }
    if (this.sub) {
      p.text(this.sub, cx, cy + 13, { size: this.subSize, color: this.subColor, align: 'center', regular: true });
    }
    p.restore();
  }
}

export function panel(p: Painter, x: number, y: number, w: number, h: number, r: number, opt?: any): void {
  opt = opt || {};
  p.fillRR(x, y, w, h, r, opt.fill || 'rgba(28,19,44,0.62)');
  p.strokeRR(x, y, w, h, r, opt.border || 'rgba(255,255,255,0.14)', 1.5);
}

// 亮色玻璃卡片（大厅风格）：投影 + 白色半透明底 + 顶部高光 + 白描边
export function glassCard(p: Painter, x: number, y: number, w: number, h: number, r: number, opt?: any): void {
  opt = opt || {};
  p.save();
  p.setAlpha(opt.shadowAlpha === undefined ? 0.18 : opt.shadowAlpha);
  p.fillRR(x, y + 4, w, h, r, '#062a63');
  p.restore();
  p.fillRR(x, y, w, h, r, opt.fill || 'rgba(255,255,255,0.34)');
  p.save();
  p.setAlpha(opt.hlAlpha === undefined ? 0.28 : opt.hlAlpha);
  p.fillRR(x + 5, y + 4, w - 10, h * 0.4, Math.max(4, r * 0.7), 'rgba(255,255,255,0.65)');
  p.restore();
  p.strokeRR(x, y, w, h, r, opt.border || 'rgba(255,255,255,0.82)', opt.borderWidth || 2);
}

// 金币图标
export function coinIcon(p: Painter, cx: number, cy: number, r: number, color = '#ffd166', edge = '#c98a12'): void {
  p.circle(cx, cy, r, edge);
  p.circle(cx, cy, r - 1.2, color);
  p.save();
  p.setAlpha(0.55);
  p.ell(cx - r * 0.3, cy - r * 0.38, r * 0.34, r * 0.2, '#ffffff', -0.5);
  p.restore();
  p.star(cx, cy, r * 0.5, '#fff6cf');
}

// 小圆形箭头按钮（切换角色等）
export function arrowButton(p: Painter, cx: number, cy: number, r: number, dir: number, press: number): void {
  const s = press > 0 ? 1 - Math.min(0.08, press * 0.4) : 1;
  p.save();
  p.translate(cx, cy);
  p.scale(s, s);
  p.glow(0, 2, r * 1.5, '#9fe4ff', 0.28);
  p.circle(0, 2, r, 'rgba(8,52,118,0.5)');
  p.circle(0, 0, r, 'rgba(255,255,255,0.34)');
  p.circleStroke(0, 0, r, 'rgba(255,255,255,0.88)', 2.2);
  p.polyStroke([
    [dir * r * 0.38, -r * 0.42], [-dir * r * 0.26, 0], [dir * r * 0.38, r * 0.42],
  ], '#ffffff', 3.2, false);
  p.restore();
}

export function hpBar(p: Painter, x: number, y: number, w: number, h: number,
  ratio: number, trail: number, mirror: boolean, colorA: string, colorB: string): void {
  p.fillRR(x, y, w, h, h / 2, 'rgba(20,14,32,0.65)');
  const r1 = Math.max(0, Math.min(1, trail));
  const r2 = Math.max(0, Math.min(1, ratio));
  if (r1 > 0) {
    const tw = w * r1;
    p.fillRR(mirror ? x + w - tw : x, y, tw, h, h / 2, 'rgba(255,255,255,0.55)');
  }
  if (r2 > 0) {
    const fw = Math.max(h, w * r2);
    const bx = mirror ? x + w - fw : x;
    p.fillRR(bx, y, fw, h, h / 2, colorA);
    // 少量竖向渐变与高光
    p.save();
    p.setAlpha(0.35);
    p.fillRR(bx, y + h * 0.5, fw, h * 0.5, h * 0.25, colorB);
    p.setAlpha(0.5);
    p.fillRR(bx + 4, y + 2, Math.max(0, fw - 8), h * 0.3, h * 0.15, '#ffffff');
    p.restore();
  }
  p.strokeRR(x, y, w, h, h / 2, 'rgba(0,0,0,0.25)', 1);
}

export function stars(p: Painter, x: number, y: number, filled: number, total: number,
  r: number, gap: number, colorOn: string, colorOff: string, mirror = false): void {
  for (let i = 0; i < total; i++) {
    const idx = mirror ? total - 1 - i : i;
    const cx = x + (mirror ? -idx * gap : idx * gap);
    const on = idx < filled;
    draw.star(p, cx, y, r, on ? (colorOn || '#ffd166') : (colorOff || 'rgba(255,255,255,0.22)'));
    if (on) p.glow(cx, y, r * 2.2, colorOn || '#ffd166', 0.16);
  }
}

export function rankBadge(p: Painter, cx: number, cy: number, r: number, rankIndex: number, label?: string): void {
  const rank = CFG.RANKS[rankIndex];
  const color = rank ? rank.tag : '#c98b5b';
  p.glow(cx, cy, r * 2.1, color, 0.22);
  p.circle(cx, cy, r, 'rgba(20,14,34,0.9)');
  p.circleStroke(cx, cy, r, color, 3);
  p.text(label || (rank ? rank.name : ''), cx, cy + 1, {
    size: Math.round(r * 0.52), color, align: 'center',
  });
}

export function avatar(p: Painter, cx: number, cy: number, r: number, img: any, name: string, color: string): void {
  p.circle(cx, cy, r, 'rgba(255,255,255,0.14)');
  p.circle(cx, cy, r * 0.94, color || '#8fb7e8');
  p.save();
  p.setAlpha(0.25);
  p.ell(cx - r * 0.35, cy - r * 0.4, r * 0.5, r * 0.3, '#ffffff');
  p.restore();
  const initial = (name || '?').charAt(0);
  p.text(initial, cx, cy + 1, { size: Math.round(r * 0.9), align: 'center' });
  p.circleStroke(cx, cy, r, 'rgba(255,255,255,0.55)', 2);
}

export function tag(p: Painter, x: number, y: number, label: string, color: string, opt?: any): number {
  opt = opt || {};
  const size = opt.size || 11;
  const padX = opt.padX || 8;
  const h = opt.h || 20;
  const w = Math.max(h, measureText(label, size) + padX * 2);
  const bx = opt.align === 'right' ? x - w : x;
  p.fillRR(bx, y, w, h, h / 2, opt.fill || 'rgba(0,0,0,0.28)');
  p.strokeRR(bx, y, w, h, h / 2, color || 'rgba(255,255,255,0.3)', 1.2);
  p.text(label, bx + w / 2, y + h / 2 + 0.5, { size, align: 'center', color: color || '#ffffff' });
  return w;
}

export function toast(p: Painter, msg: string, alpha: number, y: number): void {
  if (alpha <= 0 || !msg) return;
  p.save();
  p.setAlpha(Math.min(1, alpha));
  const w = Math.min(330, measureText(msg, 13) + 32);
  const x = 187 - w / 2;
  p.fillRR(x, y - 16, w, 32, 16, 'rgba(18,12,30,0.86)');
  p.strokeRR(x, y - 16, w, 32, 16, 'rgba(255,255,255,0.18)', 1);
  p.text(msg, 187, y + 1, { size: 13, align: 'center', color: '#fff4d6' });
  p.restore();
}

export const ui = {
  Button, panel, glassCard, coinIcon, arrowButton, hpBar, stars, rankBadge, avatar, tag, toast,
};
export default ui;
