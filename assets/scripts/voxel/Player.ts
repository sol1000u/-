/**
 * 玩家控制与体素碰撞（原版 game.js 缺失的部分，按同样的物理规则补齐）
 *  - AABB 碰撞 + 分步推进，避免高速下落穿墙
 *  - 水面游泳、跳跃、冲刺
 */
import { Vec3 } from 'cc';
import { BlockType } from './Blocks';
import { World } from './World';

const WALK_SPEED = 4.4;
const SPRINT_SPEED = 6.4;
const WATER_SPEED = 2.6;
const GRAVITY = 28.0;
const WATER_GRAVITY = 5.0;
const JUMP_SPEED = 8.4;
const SWIM_UP = 3.4;

export class Player {
  readonly pos = new Vec3();
  readonly vel = new Vec3();
  yaw = 0;
  pitch = 0.06;
  onGround = false;
  inWater = false;
  private coyote = 0;

  readonly hw = 0.3;
  readonly height = 1.8;
  readonly eyeH = 1.62;

  spawn(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.yaw = 0;
    this.pitch = 0.04;
  }

  get eyeX(): number { return this.pos.x; }
  get eyeY(): number { return this.pos.y + this.eyeH; }
  get eyeZ(): number { return this.pos.z; }

  /** 相机朝向（单位向量） */
  forward(out: Vec3): Vec3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  private collides(world: World, x: number, y: number, z: number): boolean {
    const eps = 1e-4;
    const hw = this.hw;
    const x0 = Math.floor(x - hw + eps);
    const x1 = Math.floor(x + hw - eps);
    const y0 = Math.floor(y + eps);
    const y1 = Math.floor(y + this.height - eps);
    const z0 = Math.floor(z - hw + eps);
    const z1 = Math.floor(z + hw - eps);
    for (let by = y0; by <= y1; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          if (world.isSolidAt(bx, by, bz)) return true;
        }
      }
    }
    return false;
  }

  /**
   * @param mx 左右输入 [-1,1]
   * @param mz 前后输入 [-1,1]
   */
  update(dt: number, world: World, mx: number, mz: number, jump: boolean, sprint: boolean): void {
    if (dt <= 0) return;

    const feetBlock = world.getBlock(this.pos.x, this.pos.y + 0.4, this.pos.z);
    const eyeBlock = world.getBlock(this.pos.x, this.eyeY, this.pos.z);
    this.inWater = feetBlock === BlockType.WATER || eyeBlock === BlockType.WATER;

    // 水平目标速度（只跟随偏航角，抬头不影响走路）
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);

    let tx = fx * mz + rx * mx;
    let tz = fz * mz + rz * mx;
    const len = Math.sqrt(tx * tx + tz * tz);
    if (len > 1) {
      tx /= len;
      tz /= len;
    }

    const speed = this.inWater ? WATER_SPEED : sprint ? SPRINT_SPEED : WALK_SPEED;
    const control = this.onGround || this.inWater ? 1 : 0.45;
    const k = 1 - Math.exp(-12 * dt * control);
    this.vel.x += (tx * speed - this.vel.x) * k;
    this.vel.z += (tz * speed - this.vel.z) * k;

    // 跳跃 / 游泳（带土狼时间：离地后 0.12s 内仍可起跳，手机上连跳不卡脚）
    if (jump) {
      if (this.inWater) {
        this.vel.y = SWIM_UP;
      } else if (this.onGround || this.coyote > 0) {
        this.vel.y = JUMP_SPEED;
        this.onGround = false;
        this.coyote = 0;
      }
    }

    // 重力
    const g = this.inWater ? WATER_GRAVITY : GRAVITY;
    this.vel.y -= g * dt;
    if (this.inWater) {
      if (this.vel.y < -3.2) this.vel.y = -3.2;
      if (this.vel.y > 4.2) this.vel.y = 4.2;
    } else if (this.vel.y < -24) {
      this.vel.y = -24;
    }

    // 刷新土狼时间：在地面充满，离地后按帧衰减
    this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt);
    this.onGround = false;

    let dx = this.vel.x * dt;
    let dy = this.vel.y * dt;
    let dz = this.vel.z * dt;

    const maxDist = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(maxDist / 0.12));
    const sx = dx / steps;
    const sy = dy / steps;
    const sz = dz / steps;

    for (let i = 0; i < steps; i++) {
      if (sx !== 0) {
        this.pos.x += sx;
        if (this.collides(world, this.pos.x, this.pos.y, this.pos.z)) {
          this.pos.x -= sx;
          this.vel.x = 0;
        }
      }
      if (sz !== 0) {
        this.pos.z += sz;
        if (this.collides(world, this.pos.x, this.pos.y, this.pos.z)) {
          this.pos.z -= sz;
          this.vel.z = 0;
        }
      }
      if (sy !== 0) {
        this.pos.y += sy;
        if (this.collides(world, this.pos.x, this.pos.y, this.pos.z)) {
          this.pos.y -= sy;
          if (sy < 0) this.onGround = true;
          this.vel.y = 0;
          break;
        }
      }
    }

    // 出生点保护：掉出世界或卡住时重置（阈值放宽到 -30，避免斗兽场等特殊地形误触发）
    if (this.pos.y < -30) this.spawn(this.pos.x, 30, this.pos.z);
  }
}
