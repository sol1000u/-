// 场景管理：页面注册 / 切换 / 触摸分发
import { Painter } from '../render/Painter';

export interface Scene {
  enter(payload?: any): void;
  update(dt: number, time: number): void;
  render(p: Painter, time: number): void;
  layout?(): void;
  onTouchStart?(x: number, y: number, id: number): void;
  onTouchMove?(x: number, y: number, id: number): void;
  onTouchEnd?(x: number, y: number, id: number): void;
  onTouchCancel?(x: number, y: number, id: number): void;
}

class App {
  scenes: Record<string, Scene> = {};
  current: Scene | null = null;
  currentName = '';
  time = 0;
  vb = { x: 0, y: 0, w: 375, h: 667 };

  register(name: string, scene: Scene): void {
    this.scenes[name] = scene;
  }

  setScene(name: string, payload?: any): void {
    const scene = this.scenes[name];
    if (!scene) return;
    this.current = scene;
    this.currentName = name;
    if (scene.enter) scene.enter(payload || {});
  }
}

export const app = new App();
export default app;
