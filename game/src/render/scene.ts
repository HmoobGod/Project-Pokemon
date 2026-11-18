/** Three.js view of the simulation. Original primitive placeholder art only. */
import * as THREE from 'three';
import { ALTAR, ARENA_HALF_SIZE, BOSS_SLAM, CHALLENGE, LEGENDARY_SLAM, PORTAL, UNOWN, type Obstacle } from '../sim/config.ts';
import type { AltarState, Enemy, World } from '../sim/world.ts';
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
  /** boss only: ground ring telegraphing the slam */
  telegraph: THREE.Mesh | null;
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
  /** null = follows the player */
  center: { x: number; z: number } | null;
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
  private readonly portal: THREE.Group;
  private readonly portalRingMat = new THREE.MeshStandardMaterial({ color: 0x6ff3ff, emissive: 0x1aa6c4, emissiveIntensity: 1.2 });
  private readonly portalDiscMat = new THREE.MeshBasicMaterial({ color: 0x6ff3ff, transparent: true, opacity: 0.35, depthWrite: false });
  private readonly guide: THREE.Mesh;
  private readonly guideMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  private readonly groundMat = new THREE.MeshStandardMaterial({ color: 0x7cc35a });
  private readonly pillarMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a6 });
  private readonly mapGroup = new THREE.Group();
  private readonly altarGemMat = new THREE.MeshStandardMaterial({ color: 0x3ddc84, emissive: 0x3ddc84, flatShading: true });
  private readonly altarRingMat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  private altar!: THREE.Group;
  private unown!: THREE.Group;
  private challenge!: THREE.Group;
  private readonly unownMat = new THREE.MeshStandardMaterial({ color: 0x5aa9ff, emissive: 0x1f5fd0, emissiveIntensity: 0.6, flatShading: true });
  private readonly unownFillMat = new THREE.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.45, depthWrite: false });
  private readonly unownRingMat = new THREE.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  private readonly challengeMat = new THREE.MeshStandardMaterial({ color: 0xff9b3d, emissive: 0x8a3a00, emissiveIntensity: 0.5, flatShading: true });
  private readonly challengeRingMat = new THREE.MeshBasicMaterial({ color: 0xff9b3d, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  private mapKey = '';
  private readonly geo = {
    chaser: new THREE.IcosahedronGeometry(0.55, 1),
    brute: new THREE.DodecahedronGeometry(1.0, 0),
    boss: new THREE.OctahedronGeometry(1.6, 0),
    legendary: new THREE.IcosahedronGeometry(2.2, 0),
    spike: new THREE.ConeGeometry(0.28, 1.1, 6),
    disc: new THREE.CircleGeometry(1, 40),
    portalRing: new THREE.TorusGeometry(1.6, 0.2, 10, 40),
    arrow: new THREE.ConeGeometry(0.45, 1.2, 3),
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
    this.altar = this.buildAltar();
    this.scene.add(this.altar);
    this.unown = this.buildUnown();
    this.scene.add(this.unown);
    this.challenge = this.buildChallenge();
    this.scene.add(this.challenge);
    const { group, placeholder, bodyMat } = this.buildPlayer();
    this.player = group;
    this.playerPlaceholder = placeholder;
    this.playerBodyMat = bodyMat;
    this.scene.add(this.player);

    // Portal: standing ring + activation zone on the ground (hidden until a boss is defeated).
    this.portal = new THREE.Group();
    const ring = new THREE.Mesh(this.geo.portalRing, this.portalRingMat);
    ring.position.y = 1.8;
    ring.name = 'ring';
    this.portal.add(ring);
    const zone = new THREE.Mesh(this.geo.disc, this.portalDiscMat);
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.03;
    zone.scale.setScalar(PORTAL.activateRange);
    this.portal.add(zone);
    this.portal.visible = false;
    this.scene.add(this.portal);

    // Ground arrow pointing to the boss / open portal.
    this.guide = new THREE.Mesh(this.geo.arrow, this.guideMat);
    this.guide.rotation.x = -Math.PI / 2;
    this.guide.visible = false;
    this.scene.add(this.guide);
    this.resize();
  }

  private buildArena(): void {
    const size = ARENA_HALF_SIZE * 2;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.groundMat);
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
    this.scene.add(this.mapGroup);
  }

  /** Rebuild the per-map layout (new map context on every zone / shrine transition). */
  private buildMap(world: World): void {
    const m = world.map;
    for (const c of [...this.mapGroup.children]) {
      this.mapGroup.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    this.groundMat.color.setHex(m.ground);
    const shrine = m.kind === 'shrine';
    this.pillarMat.color.setHex(shrine ? 0xd9c8ff : m.index === 1 ? 0xa8875a : m.index === 2 ? 0xe8f6ff : 0xb8b2a6);
    for (const o of m.obstacles as readonly Obstacle[]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(o.radius, o.radius * 1.1, shrine ? 4 : 3, 16), this.pillarMat);
      p.position.set(o.x, shrine ? 2 : 1.5, o.z);
      this.mapGroup.add(p);
    }
    this.altar.visible = !!m.altar;
    if (m.altar) this.altar.position.set(m.altar.pos.x, 0, m.altar.pos.z);
    this.unown.visible = !!m.unown;
    if (m.unown) this.unown.position.set(m.unown.pos.x, 0, m.unown.pos.z);
    this.challenge.visible = !!m.challenge;
    if (m.challenge) this.challenge.position.set(m.challenge.pos.x, 0, m.challenge.pos.z);
    this.mapKey = `${m.kind}:${m.index}`;
  }

  private buildAltar(): THREE.Group {
    // Original placeholder altar: stone base, glowing gem, activation ring.
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x8c8c8c, flatShading: true }));
    base.position.y = 0.4;
    g.add(base);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), this.altarGemMat);
    gem.position.y = 1.6;
    gem.name = 'gem';
    g.add(gem);
    const zone = new THREE.Mesh(this.geo.ring, this.altarRingMat);
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.04;
    zone.scale.setScalar(ALTAR.activateRange);
    g.add(zone);
    return g;
  }

  private buildUnown(): THREE.Group {
    // Original placeholder: a floating blue crystal over a circle that fills as it charges.
    const g = new THREE.Group();
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), this.unownMat);
    crystal.scale.set(0.7, 1.4, 0.7);
    crystal.position.y = 1.6;
    crystal.name = 'crystal';
    g.add(crystal);
    const ring = new THREE.Mesh(this.geo.ring, this.unownRingMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.scale.setScalar(UNOWN.radius);
    g.add(ring);
    const fill = new THREE.Mesh(this.geo.disc, this.unownFillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.045;
    fill.name = 'fill';
    fill.scale.setScalar(0.001);
    g.add(fill);
    return g;
  }

  private buildChallenge(): THREE.Group {
    // Original placeholder: two crossed orange blades on a plinth.
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), new THREE.MeshStandardMaterial({ color: 0x6d5c4a, flatShading: true }));
    plinth.position.y = 0.25;
    g.add(plinth);
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.2, 0.12), this.challengeMat);
      blade.position.y = 1.5;
      blade.rotation.z = a;
      g.add(blade);
    }
    const ring = new THREE.Mesh(this.geo.ring, this.challengeRingMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.scale.setScalar(CHALLENGE.activateRange);
    g.add(ring);
    return g;
  }

  private altarLook(state: AltarState, time: number): void {
    const col = state === 'dormant' ? 0x3ddc84 : state === 'awakened' ? 0xff4040 : 0x777777;
    this.altarGemMat.color.setHex(col);
    this.altarGemMat.emissive.setHex(state === 'spent' ? 0x000000 : col);
    this.altarGemMat.emissiveIntensity = state === 'dormant' ? 0.6 + 0.3 * Math.sin(time * 3) : 0.8;
    this.altarRingMat.color.setHex(col);
    this.altarRingMat.opacity = state === 'dormant' ? 0.7 : 0.25;
    const gem = this.altar.getObjectByName('gem');
    if (gem) gem.rotation.y = time * (state === 'spent' ? 0 : 1.2);
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
    if (v.telegraph) (v.telegraph.material as THREE.Material).dispose();
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
      const big = e.kind === 'boss' || e.kind === 'legendary';
      return { group, body: null, material: null, sprite, telegraph: big ? this.makeTelegraph(group, e.kind === 'legendary' ? LEGENDARY_SLAM.radius : BOSS_SLAM.radius) : null };
    }
    const color = e.kind === 'legendary' ? 0xf2f2ff : e.kind === 'boss' ? 0x1f5f6b : e.kind === 'brute' ? 0x8b1e3f : 0x7b4fd6;
    const material = new THREE.MeshStandardMaterial({ color, flatShading: true, ...(e.kind === 'legendary' ? { emissive: 0x6b4fd8, emissiveIntensity: 0.35 } : {}) });
    const geom = e.kind === 'legendary' ? this.geo.legendary : e.kind === 'boss' ? this.geo.boss : e.kind === 'brute' ? this.geo.brute : this.geo.chaser;
    const body = new THREE.Mesh(geom, material);
    body.position.y = e.radius;
    if (e.kind === 'legendary') {
      // original "Legendary" placeholder: pale faceted body with an orbiting violet halo
      const halo = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.18, 8, 40), new THREE.MeshStandardMaterial({ color: 0x9b7bff, emissive: 0x6b4fd8 }));
      halo.rotation.x = Math.PI / 2.4;
      body.add(halo);
    }
    if (e.kind === 'boss') {
      // original "guardian": faceted body with a crown of gold spikes
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, flatShading: true });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(this.geo.spike, spikeMat);
        spike.position.set(Math.cos(a) * 0.7, 1.35, Math.sin(a) * 0.7);
        body.add(spike);
      }
    }
    group.add(body);
    const big = e.kind === 'boss' || e.kind === 'legendary';
    return { group, body, material, sprite: null, telegraph: big ? this.makeTelegraph(group, e.kind === 'legendary' ? LEGENDARY_SLAM.radius : BOSS_SLAM.radius) : null };
  }

  private makeTelegraph(group: THREE.Group, radius: number): THREE.Mesh {
    const t = new THREE.Mesh(this.geo.disc, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false }));
    t.rotation.x = -Math.PI / 2;
    t.position.y = 0.04;
    t.scale.setScalar(radius);
    t.visible = false;
    group.add(t);
    return t;
  }

  spawnPulseRing(radius: number, center: { x: number; z: number } | null = null, color = 0xfff27a): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(this.geo.ring, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.1;
    this.scene.add(mesh);
    this.rings.push({ mesh, material, age: 0, radius, center: center ? { ...center } : null });
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
    if (this.mapKey !== `${world.map.kind}:${world.map.index}`) this.buildMap(world);
    if (world.map.altar) this.altarLook(world.map.altar.state, world.time);
    const un = world.map.unown;
    if (un) {
      const spent = un.state === 'spent';
      this.unownMat.color.setHex(spent ? 0x777777 : 0x5aa9ff);
      this.unownMat.emissive.setHex(spent ? 0x000000 : 0x1f5fd0);
      this.unownRingMat.color.setHex(spent ? 0x777777 : 0x5aa9ff);
      this.unownRingMat.opacity = spent ? 0.25 : 0.8;
      const fill = this.unown.getObjectByName('fill');
      if (fill) fill.scale.setScalar(Math.max(0.001, UNOWN.radius * un.charge));
      const cr = this.unown.getObjectByName('crystal');
      if (cr) {
        cr.rotation.y = world.time * (spent ? 0 : un.state === 'charging' ? 4 : 1);
        cr.position.y = 1.6 + (spent ? 0 : 0.15 * Math.sin(world.time * 2));
      }
    }
    const ch = world.map.challenge;
    if (ch) {
      const col = ch.state === 'idle' ? 0xff9b3d : ch.state === 'active' ? 0xff4040 : 0x777777;
      this.challengeMat.color.setHex(col);
      this.challengeMat.emissive.setHex(ch.state === 'won' || ch.state === 'failed' ? 0x000000 : 0x8a3a00);
      this.challengeRingMat.color.setHex(col);
      this.challengeRingMat.opacity = ch.state === 'idle' ? 0.6 : 0.25;
    }
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
      const pulse = e.ai === 'windup' ? 1 + 0.25 * Math.sin(world.time * 40) : e.ai === 'slam' ? 1 + 0.12 * Math.sin(world.time * 25) : 1;
      if (v.telegraph) {
        v.telegraph.visible = e.ai === 'slam';
        if (e.ai === 'slam') (v.telegraph.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.5 * (1 - Math.max(0, e.aiTimer) / (e.kind === 'legendary' ? LEGENDARY_SLAM.windup : BOSS_SLAM.windup));
      }
      if (v.body && v.material) {
        v.body.scale.setScalar(pulse);
        v.material.emissive.setHex(e.ai === 'windup' || e.ai === 'slam' ? 0xaa2200 : e.hitFlash > 0 ? 0xffffff : 0x000000);
        v.body.rotation.y = world.time * (e.kind === 'brute' || e.kind === 'legendary' ? 0.8 : 2);
      } else if (v.sprite) {
        this.updateSpriteFrame(v.sprite, world.time + e.id * 0.13, p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        const sp = v.sprite.loaded.spec;
        v.sprite.sprite.scale.set((sp.height * sp.frameWidth * pulse) / sp.frameHeight, sp.height * pulse, 1);
        if (e.ai === 'windup' || e.ai === 'slam') v.sprite.material.color.setRGB(1, 0.35, 0.35);
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
      const c = r.center ?? p.pos;
      r.mesh.position.set(c.x, 0.1, c.z);
      r.mesh.scale.setScalar(Math.max(0.01, r.radius * t));
      r.material.opacity = 0.8 * (1 - t);
      if (t >= 1) {
        this.scene.remove(r.mesh);
        r.material.dispose();
        this.rings.splice(i, 1);
      }
    }

    const st = world.map;
    const toShrine = st.kind === 'zone' && st.index === st.zoneCount - 1;
    this.portal.visible = !!st.portal;
    if (st.portal) {
      this.portal.position.set(st.portal.x, 0, st.portal.z);
      const ring = this.portal.getObjectByName('ring');
      if (ring) ring.rotation.y = world.time * 1.5;
      const exit = st.kind === 'shrine';
      const col = exit ? 0xffd34d : toShrine ? 0xb48cff : 0x6ff3ff;
      this.portalRingMat.color.setHex(col);
      this.portalRingMat.emissive.setHex(exit ? 0x8a6a00 : toShrine ? 0x5a2fd0 : 0x1aa6c4);
      this.portalDiscMat.color.setHex(col);
      this.portalDiscMat.opacity = 0.25 + 0.15 * Math.sin(world.time * 4);
    }
    // Arrow: portal if open, else the awake guardian/legendary, else the dormant altar.
    let goal: { x: number; z: number } | null = st.portal;
    let goalColor = st.kind === 'shrine' ? 0xffd34d : toShrine ? 0xb48cff : 0x6ff3ff;
    if (!goal && st.bossId !== null) {
      goal = world.enemies.find((e) => e.id === st.bossId)?.pos ?? null;
      goalColor = 0xff5555;
    }
    if (!goal && st.altar?.state === 'dormant') {
      goal = st.altar.pos;
      goalColor = 0x3ddc84;
    }
    const gd = goal ? Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z) : 0;
    this.guide.visible = !!goal && gd > 4 && world.phase === 'playing';
    if (goal && this.guide.visible) {
      const ang = Math.atan2(goal.z - p.pos.z, goal.x - p.pos.x);
      this.guide.position.set(p.pos.x + Math.cos(ang) * 2.2, 0.15, p.pos.z + Math.sin(ang) * 2.2);
      this.guide.rotation.set(-Math.PI / 2, 0, -ang - Math.PI / 2);
      this.guideMat.color.setHex(goalColor);
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
