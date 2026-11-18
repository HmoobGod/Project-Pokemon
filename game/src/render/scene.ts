/** Three.js view of the simulation. Original primitive placeholder art only. */
import * as THREE from 'three';
import { ARENA_HALF_SIZE, OBSTACLES } from '../sim/config.ts';
import type { Enemy, World } from '../sim/world.ts';
import type { SpriteRole } from '../sprites/manifest.ts';
import type { LoadedSprite } from '../sprites/loader.ts';
import { directionRow, frameIndex, frameUv } from '../sprites/spriteMath.ts';

const CAMERA_OFFSET = new THREE.Vector3(0, 15, 11);

interface EnemyView {
  group: THREE.Group;
  /** placeholder mesh (null when a billboard sprite is used) */
  body: THREE.Mesh | null;
  material: THREE.MeshStandardMaterial | null;
  sprite: SpriteView | null;
}

/** A camera-facing billboard showing one animated frame of a loaded sprite sheet. */
interface SpriteView {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.Texture;
  loaded: LoadedSprite;
}

interface PulseRing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  radius: number;
}

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly player: THREE.Group;
  private readonly playerPlaceholder: THREE.Group;
  private readonly playerBodyMat: THREE.MeshStandardMaterial;
  private playerSprite: SpriteView | null = null;
  private readonly baseTextures = new Map<SpriteRole, THREE.Texture>();
  private loadedSprites = new Map<SpriteRole, LoadedSprite>();
  private readonly enemies = new Map<number, EnemyView>();
  private readonly projectiles = new Map<number, THREE.Mesh>();
  private readonly orbs = new Map<number, THREE.Mesh>();
  private readonly rings: PulseRing[] = [];
  private readonly geo = {
    chaser: new THREE.IcosahedronGeometry(0.55, 1),
    brute: new THREE.DodecahedronGeometry(1.0, 0),
    projectile: new THREE.SphereGeometry(0.22, 10, 8),
    orb: new THREE.OctahedronGeometry(0.25, 0),
    shadow: new THREE.CircleGeometry(1, 20),
    ring: new THREE.RingGeometry(0.92, 1, 48),
  };
  private readonly mat = {
    projectile: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
    orb: new THREE.MeshStandardMaterial({ color: 0x48e0ff, emissive: 0x1aa6c4, emissiveIntensity: 0.8 }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new THREE.Color(0x9fd3f5);
    this.scene.fog = new THREE.Fog(0x9fd3f5, 35, 70);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a7a3a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(10, 25, 8);
    this.scene.add(sun);

    this.buildArena();
    const { group, placeholder, bodyMat } = this.buildPlayer();
    this.player = group;
    this.playerPlaceholder = placeholder;
    this.playerBodyMat = bodyMat;
    this.scene.add(this.player);
    this.resize();
  }

  private buildArena(): void {
    const size = ARENA_HALF_SIZE * 2;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x7cc35a }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(size, size / 2, 0x5f9e45, 0x6cb04f);
    grid.position.y = 0.01;
    this.scene.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d });
    const wallH = 1.5;
    const t = 1;
    const walls: Array<[number, number, number, number]> = [
      [0, -ARENA_HALF_SIZE - t / 2, size + 2 * t, t],
      [0, ARENA_HALF_SIZE + t / 2, size + 2 * t, t],
      [-ARENA_HALF_SIZE - t / 2, 0, t, size],
      [ARENA_HALF_SIZE + t / 2, 0, t, size],
    ];
    for (const [x, z, w, d] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
      m.position.set(x, wallH / 2, z);
      this.scene.add(m);
    }
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a6 });
    for (const o of OBSTACLES) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(o.radius, o.radius * 1.1, 3, 16), pillarMat);
      m.position.set(o.x, 1.5, o.z);
      this.scene.add(m);
    }
  }

  private buildPlayer(): { group: THREE.Group; placeholder: THREE.Group; bodyMat: THREE.MeshStandardMaterial } {
    // Original placeholder hero: rounded orange body, two ear cones and a facing nose.
    const outer = new THREE.Group();
    const group = new THREE.Group();
    outer.add(group);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x000000 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.5, 6, 12), bodyMat);
    body.position.y = 0.75;
    group.add(body);
    const earMat = new THREE.MeshStandardMaterial({ color: 0x3b2a20 });
    for (const sx of [-0.25, 0.25]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 8), earMat);
      ear.position.set(sx, 1.55, 0);
      group.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    nose.position.set(0, 0.95, -0.48);
    group.add(nose);
    outer.add(this.makeShadow(0.6));
    return { group: outer, placeholder: group, bodyMat };
  }

  /**
   * Use locally loaded sprite sheets. Roles without a valid sprite keep their placeholder shapes.
   * Safe to call at any time (e.g. after the run has started).
   */
  setSprites(sprites: ReadonlyMap<SpriteRole, LoadedSprite>): void {
    for (const t of this.baseTextures.values()) t.dispose();
    this.baseTextures.clear();
    this.loadedSprites = new Map();
    for (const [role, ls] of sprites) {
      try {
        const tex = new THREE.Texture(ls.image as HTMLImageElement);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        this.baseTextures.set(role, tex);
        this.loadedSprites.set(role, ls);
      } catch {
        // leave this role on placeholders
      }
    }
    if (this.playerSprite) {
      this.player.remove(this.playerSprite.sprite);
      this.disposeSprite(this.playerSprite);
      this.playerSprite = null;
    }
    this.playerSprite = this.makeSpriteView('player');
    if (this.playerSprite) this.player.add(this.playerSprite.sprite);
    this.playerPlaceholder.visible = !this.playerSprite;
    // enemies are rebuilt lazily with the new look
    for (const [id, v] of this.enemies) this.disposeEnemyView(v, id);
  }

  activeSpriteRoles(): SpriteRole[] {
    return [...this.loadedSprites.keys()];
  }

  private makeSpriteView(role: SpriteRole): SpriteView | null {
    const base = this.baseTextures.get(role);
    const loaded = this.loadedSprites.get(role);
    if (!base || !loaded) return null;
    const texture = base.clone();
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.1, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.center.set(0.5, 0);
    const h = loaded.spec.height;
    sprite.scale.set((h * loaded.spec.frameWidth) / loaded.spec.frameHeight, h, 1);
    sprite.position.y = 0.02;
    const view = { sprite, material, texture, loaded };
    this.updateSpriteFrame(view, 0, 0, 1);
    return view;
  }

  private updateSpriteFrame(v: SpriteView, time: number, fx: number, fz: number): void {
    const s = v.loaded.spec;
    const uv = frameUv(s.frameWidth, s.frameHeight, v.loaded.width, v.loaded.height, frameIndex(time, s.fps, s.frames), directionRow(fx, fz, s.directions));
    v.texture.repeat.set(uv.repeatX, uv.repeatY);
    v.texture.offset.set(uv.offsetX, uv.offsetY);
  }

  private disposeSprite(v: SpriteView): void {
    v.material.dispose();
    v.texture.dispose();
  }

  private disposeEnemyView(v: EnemyView, id: number): void {
    this.scene.remove(v.group);
    v.material?.dispose();
    if (v.sprite) this.disposeSprite(v.sprite);
    this.enemies.delete(id);
  }

  private makeShadow(r: number): THREE.Mesh {
    const s = new THREE.Mesh(this.geo.shadow, this.mat.shadow);
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.02;
    s.scale.setScalar(r);
    return s;
  }

  private createEnemyView(e: Enemy): EnemyView {
    const group = new THREE.Group();
    group.add(this.makeShadow(e.radius * 1.05));
    this.scene.add(group);
    const sprite = this.makeSpriteView(e.kind);
    if (sprite) {
      group.add(sprite.sprite);
      return { group, body: null, material: null, sprite };
    }
    const material = new THREE.MeshStandardMaterial({ color: e.kind === 'brute' ? 0x8b1e3f : 0x7b4fd6, flatShading: true });
    const body = new THREE.Mesh(e.kind === 'brute' ? this.geo.brute : this.geo.chaser, material);
    body.position.y = e.radius;
    group.add(body);
    return { group, body, material, sprite: null };
  }

  spawnPulseRing(radius: number): void {
    const material = new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(this.geo.ring, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.1;
    this.scene.add(mesh);
    this.rings.push({ mesh, material, age: 0, radius });
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    // Portrait phones: pull the camera back so a similar area stays visible.
    this.camera.fov = this.camera.aspect < 1 ? 70 : 50;
    this.camera.updateProjectionMatrix();
  }

  render(world: World, frameDt: number, snapCamera = false): void {
    const p = world.player;
    this.player.position.set(p.pos.x, 0, p.pos.z);
    this.playerPlaceholder.rotation.y = Math.atan2(-p.facing.x, -p.facing.z);
    const blink = p.invulnTimer > 0 && Math.floor(p.invulnTimer * 20) % 2 === 0;
    this.player.visible = world.phase === 'defeated' ? true : !blink;
    this.playerBodyMat.emissive.setHex(p.invulnTimer > 0 ? 0x661100 : 0x000000);
    this.playerPlaceholder.rotation.z = world.phase === 'defeated' ? Math.PI / 2.5 : 0;
    if (this.playerSprite) {
      this.updateSpriteFrame(this.playerSprite, world.time, p.facing.x, p.facing.z);
      this.playerSprite.material.color.setHex(world.phase === 'defeated' ? 0x777777 : p.invulnTimer > 0 ? 0xff8888 : 0xffffff);
    }

    // enemies
    const live = new Set<number>();
    for (const e of world.enemies) {
      live.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) {
        v = this.createEnemyView(e);
        this.enemies.set(e.id, v);
      }
      v.group.position.set(e.pos.x, 0, e.pos.z);
      const pulse = e.ai === 'windup' ? 1 + 0.25 * Math.sin(world.time * 40) : 1;
      if (v.body && v.material) {
        v.body.scale.setScalar(pulse);
        v.material.emissive.setHex(e.ai === 'windup' ? 0xaa2200 : e.hitFlash > 0 ? 0xffffff : 0x000000);
        v.body.rotation.y = world.time * (e.kind === 'brute' ? 0.8 : 2);
      } else if (v.sprite) {
        this.updateSpriteFrame(v.sprite, world.time + e.id * 0.13, p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        const sp = v.sprite.loaded.spec;
        v.sprite.sprite.scale.set((sp.height * sp.frameWidth * pulse) / sp.frameHeight, sp.height * pulse, 1);
        if (e.ai === 'windup') v.sprite.material.color.setRGB(1, 0.35, 0.35);
        else if (e.hitFlash > 0) v.sprite.material.color.setRGB(3, 3, 3);
        else v.sprite.material.color.setRGB(1, 1, 1);
      }
    }
    for (const [id, v] of this.enemies) {
      if (!live.has(id)) this.disposeEnemyView(v, id);
    }

    this.syncSimple(this.projectiles, world.projectiles, this.geo.projectile, this.mat.projectile, 0.7);
    this.syncSimple(this.orbs, world.orbs, this.geo.orb, this.mat.orb, 0.45);
    for (const m of this.orbs.values()) m.rotation.y += frameDt * 3;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.age += frameDt;
      const t = Math.min(1, r.age / 0.35);
      r.mesh.position.set(p.pos.x, 0.1, p.pos.z);
      r.mesh.scale.setScalar(Math.max(0.01, r.radius * t));
      r.material.opacity = 0.8 * (1 - t);
      if (t >= 1) {
        this.scene.remove(r.mesh);
        r.material.dispose();
        this.rings.splice(i, 1);
      }
    }

    const target = new THREE.Vector3(p.pos.x, 0, p.pos.z);
    const desired = target.clone().add(CAMERA_OFFSET);
    if (snapCamera) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-8 * frameDt));
    this.camera.lookAt(target.x, 0.5, target.z);
    this.renderer.render(this.scene, this.camera);
  }

  private syncSimple(
    store: Map<number, THREE.Mesh>,
    items: ReadonlyArray<{ id: number; pos: { x: number; z: number } }>,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    y: number,
  ): void {
    const live = new Set<number>();
    for (const it of items) {
      live.add(it.id);
      let m = store.get(it.id);
      if (!m) {
        m = new THREE.Mesh(geometry, material);
        this.scene.add(m);
        store.set(it.id, m);
      }
      m.position.set(it.pos.x, y, it.pos.z);
    }
    for (const [id, m] of store) {
      if (!live.has(id)) {
        this.scene.remove(m);
        store.delete(id);
      }
    }
  }

  /** Remove every dynamic object (used on restart). */
  clearDynamic(): void {
    for (const [id, v] of this.enemies) this.disposeEnemyView(v, id);
    for (const m of this.projectiles.values()) this.scene.remove(m);
    this.projectiles.clear();
    for (const m of this.orbs.values()) this.scene.remove(m);
    this.orbs.clear();
    for (const r of this.rings) {
      this.scene.remove(r.mesh);
      r.material.dispose();
    }
    this.rings.length = 0;
  }
}
