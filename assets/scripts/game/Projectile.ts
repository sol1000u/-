/**
 * v2.0 轻量弹道系统（弓 / 弩 / 后续喷管与法杖共用）。
 *  - 不使用物理引擎：每帧按 speed×dt 前进，细分步进做地形与怪物碰撞
 *  - 穿透：命中后 pierce--，归零后销毁
 *  - 拖尾：沿飞行路径生成小方块，0.22s 后销毁
 */
import { Mesh, MeshRenderer, Node, Vec3 } from 'cc';
import type { Mob } from './Mobs';
import type { World } from '../voxel/World';
import { buildBoxesMesh, getVoxMaterial } from './VoxMesh';

export interface ProjectileSpawn {
  x: number;
  y: number;
  z: number;
  dir: Vec3;        // 已归一化方向
  speed: number;    // m/s
  dmg: number;
  pierce: number;   // 可额外穿透的怪物数量
  range: number;    // 最大射程（米）
  color: string;
  homing?: number;  // 弱锁定半径（0 = 直线）
  burn?: number;    // 命中附带灼烧秒数
  chain?: number;   // 命中附带连锁跳数
}

interface Proj {
  node: Node;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  speed: number;
  dmg: number;
  pierce: number;
  range: number;
  traveled: number;
  trailT: number;
  color: string;
  homing: number;
  burn: number;
  chain: number;
  hit: Set<Mob>;
}

export class ProjectileSystem {
  private items: Proj[] = [];
  private trails: Array<{ node: Node; ttl: number }> = [];
  private meshes = new Map<string, Mesh>();

  constructor(private readonly parent: Node, private readonly world: World) {}

  get count(): number {
    return this.items.length;
  }

  spawn(o: ProjectileSpawn): void {
    const node = new Node('projectile');
    node.parent = this.parent;
    node.setPosition(o.x, o.y, o.z);
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = this.arrowMesh(o.color);
    mr.setSharedMaterial(getVoxMaterial(), 0);
    // 让弹体长轴朝向飞行方向（Node.lookAt 以 -z 为前方）
    const look = new Vec3(o.x + o.dir.x, o.y + o.dir.y, o.z + o.dir.z);
    node.lookAt(look);

    this.items.push({
      node,
      x: o.x, y: o.y, z: o.z,
      vx: o.dir.x * o.speed, vy: o.dir.y * o.speed, vz: o.dir.z * o.speed,
      speed: o.speed,
      dmg: o.dmg,
      pierce: o.pierce,
      range: o.range,
      traveled: 0,
      trailT: 0,
      color: o.color,
      homing: o.homing || 0,
      burn: o.burn || 0,
      chain: o.chain || 0,
      hit: new Set<Mob>(),
    });
  }

  update(
    dt: number,
    mobs: Mob[],
    onHit: (mob: Mob, dmg: number, burn: number, chain: number) => void,
    onTerrain: (x: number, y: number, z: number) => void,
  ): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      let dead = false;

      // 奥术飞弹：弱锁定 6m 内最近的敌人，缓慢修正方向
      if (p.homing > 0) this.applyHoming(p, mobs, dt);

      const stepLen = p.speed * dt;
      const steps = Math.max(1, Math.ceil(stepLen / 0.4));
      const sdt = dt / steps;
      for (let s = 0; s < steps && !dead; s++) {
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
        p.z += p.vz * sdt;
        p.traveled += stepLen / steps;

        // 地形碰撞
        if (this.world.isSolidAt(p.x, p.y, p.z)) {
          onTerrain(p.x, p.y, p.z);
          dead = true;
          break;
        }

        // 怪物碰撞（水平半径 + 垂直区间）
        for (const m of mobs) {
          if (!m.alive || p.hit.has(m)) continue;
          const dx = p.x - m.x;
          const dz = p.z - m.z;
          const rx = m.def.hw * m.scale + 0.18;
          if (dx * dx + dz * dz > rx * rx) continue;
          const top = m.y + m.def.height * m.scale + 0.2;
          if (p.y < m.y - 0.2 || p.y > top) continue;

          p.hit.add(m);
          onHit(m, p.dmg, p.burn, p.chain);
          if (p.pierce > 0) {
            p.pierce--;
          } else {
            dead = true;
          }
          break;
        }
      }

      if (!dead && p.traveled >= p.range) dead = true;
      if (dead) {
        p.node.destroy();
        this.items.splice(i, 1);
        continue;
      }

      p.node.setPosition(p.x, p.y, p.z);
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.05;
        this.spawnTrail(p);
      }
    }

    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.ttl -= dt;
      if (t.ttl <= 0) {
        t.node.destroy();
        this.trails.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.items) p.node.destroy();
    this.items.length = 0;
    for (const t of this.trails) t.node.destroy();
    this.trails.length = 0;
  }

  /** 奥术飞弹：在 homing 半径内寻找最近敌人，每秒 k 的速率把速度方向掰向目标（速度大小不变） */
  private applyHoming(p: Proj, mobs: Mob[], dt: number): void {
    let best: Mob | null = null;
    let bestD2 = p.homing * p.homing;
    for (const m of mobs) {
      if (!m.alive || p.hit.has(m)) continue;
      const dx = m.x - p.x;
      const dy = m.y + m.def.height * m.scale * 0.5 - p.y;
      const dz = m.z - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = m;
      }
    }
    if (!best) return;

    const dx = best.x - p.x;
    const dy = best.y + best.def.height * best.scale * 0.5 - p.y;
    const dz = best.z - p.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const k = Math.min(1, dt * 4);
    p.vx += (dx / len * p.speed - p.vx) * k;
    p.vy += (dy / len * p.speed - p.vy) * k;
    p.vz += (dz / len * p.speed - p.vz) * k;

    // 归一到原速度，避免多次修正后弹速漂移
    const vlen = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) || 1;
    p.vx = p.vx / vlen * p.speed;
    p.vy = p.vy / vlen * p.speed;
    p.vz = p.vz / vlen * p.speed;

    p.node.lookAt(new Vec3(p.x + p.vx, p.y + p.vy, p.z + p.vz));
  }

  private spawnTrail(p: Proj): void {
    const key = `t_${p.color}`;
    let mesh = this.meshes.get(key);
    if (!mesh) {
      mesh = buildBoxesMesh([{ x: -0.035, y: -0.035, z: -0.035, w: 0.07, h: 0.07, d: 0.07, color: p.color }]);
      this.meshes.set(key, mesh);
    }
    const node = new Node('projTrail');
    node.parent = this.parent;
    node.setPosition(p.x, p.y, p.z);
    const mr = node.addComponent(MeshRenderer);
    mr.mesh = mesh;
    mr.setSharedMaterial(getVoxMaterial(), 0);
    this.trails.push({ node, ttl: 0.22 });
  }

  private arrowMesh(color: string): Mesh {
    const key = `a_${color}`;
    let mesh = this.meshes.get(key);
    if (!mesh) {
      mesh = buildBoxesMesh([
        { x: -0.02, y: -0.02, z: -0.22, w: 0.04, h: 0.04, d: 0.44, color },        // 杆
        { x: -0.035, y: -0.035, z: -0.34, w: 0.07, h: 0.07, d: 0.12, color: '#ECEFF1' }, // 箭头
        { x: -0.05, y: -0.03, z: 0.16, w: 0.1, h: 0.06, d: 0.08, color: '#ECEFF1' }, // 尾羽
      ]);
      this.meshes.set(key, mesh);
    }
    return mesh;
  }
}
