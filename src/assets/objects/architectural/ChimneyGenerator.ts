/**
 * ChimneyGenerator - Procedural chimney generation
 * Supports brick, stone, metal, and modern types with differentiated textures
 * and flat, conical, and decorative cap styles
 */
import {
  Group, Mesh, MeshStandardMaterial,
  BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry,
} from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface ChimneyParams extends BaseGeneratorConfig {
  height: number;
  width: number;
  depth: number;
  chimneyType: 'brick' | 'stone' | 'metal' | 'modern';
  hasCap: boolean;
  capStyle: 'flat' | 'conical' | 'decorative';
  flueCount: number;
  hasDamper: boolean;
  material: string;
  style: 'traditional' | 'modern' | 'rustic' | 'industrial';
}

const DEFAULT_PARAMS: ChimneyParams = {
  height: 2.5,
  width: 0.8,
  depth: 0.6,
  chimneyType: 'brick',
  hasCap: true,
  capStyle: 'flat',
  flueCount: 1,
  hasDamper: false,
  material: 'brick',
  style: 'traditional',
};

export class ChimneyGenerator extends BaseObjectGenerator<ChimneyParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): ChimneyParams {
    return { ...DEFAULT_PARAMS };
  }

  // ---------------------------------------------------------------------------
  // Material helpers
  // ---------------------------------------------------------------------------

  getBodyMaterial(chimneyType: string = 'brick'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      brick:  { color: 0x8b4513, metalness: 0.0, roughness: 0.85 },
      stone:  { color: 0x888888, metalness: 0.0, roughness: 0.75 },
      metal:  { color: 0x555555, metalness: 0.85, roughness: 0.3 },
      modern: { color: 0x666666, metalness: 0.0, roughness: 0.6 },
    };
    const c = configs[chimneyType] ?? configs.brick;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  getCapMaterial(chimneyType: string = 'brick'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      brick:  { color: 0x6b3510, metalness: 0.0, roughness: 0.8 },
      stone:  { color: 0x777777, metalness: 0.0, roughness: 0.7 },
      metal:  { color: 0x444444, metalness: 0.9, roughness: 0.2 },
      modern: { color: 0x555555, metalness: 0.1, roughness: 0.5 },
    };
    const c = configs[chimneyType] ?? configs.brick;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  generate(params: Partial<ChimneyParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { height, width, depth, chimneyType, hasCap, capStyle, flueCount } = finalParams;

    const bodyMat = this.getBodyMaterial(chimneyType);
    const capMat  = this.getCapMaterial(chimneyType);

    // --- Main chimney body ---
    const bodyGeom = new BoxGeometry(width, height, depth);
    const body = new Mesh(bodyGeom, bodyMat);
    body.position.set(0, height / 2, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // --- Type-specific detail ---
    if (chimneyType === 'brick') {
      this.addBrickDetail(group, height, width, depth, bodyMat);
    } else if (chimneyType === 'stone') {
      this.addStoneDetail(group, height, width, depth, bodyMat);
    } else if (chimneyType === 'metal') {
      this.addMetalDetail(group, height, width, depth);
    }
    // modern: clean, no extra detail

    // --- Chimney cap ---
    if (hasCap) {
      this.addCap(group, height, width, depth, capStyle, capMat, chimneyType);
    }

    // --- Flues ---
    this.addFlues(group, height, flueCount, width, depth);

    return group;
  }

  // ---------------------------------------------------------------------------
  // Type detail implementations
  // ---------------------------------------------------------------------------

  /** Brick texture: mortar joint lines + corbel at top */
  private addBrickDetail(
    group: Group, height: number, width: number, depth: number,
    bodyMat: MeshStandardMaterial,
  ): void {
    const mortarMat = new MeshStandardMaterial({ color: 0xccbbaa, metalness: 0.0, roughness: 0.9 });
    const brickHeight = 0.065;
    const brickRows = Math.floor(height / brickHeight);

    // Horizontal mortar lines
    for (let row = 0; row < brickRows; row++) {
      const y = row * brickHeight + brickHeight / 2;
      // Front face
      const mortar = new Mesh(new BoxGeometry(width + 0.005, 0.005, depth + 0.005), mortarMat);
      mortar.position.set(0, y, 0);
      group.add(mortar);
    }

    // Vertical mortar lines (staggered per row)
    const brickWidth = 0.2;
    for (let row = 0; row < brickRows; row++) {
      const y = row * brickHeight + brickHeight / 2;
      const offset = (row % 2) * brickWidth / 2;
      for (let col = 0; col < Math.ceil(width / brickWidth) + 1; col++) {
        const x = -width / 2 + col * brickWidth + offset;
        if (x < -width / 2 || x > width / 2) continue;
        // Front face vertical line
        const vMortar = new Mesh(new BoxGeometry(0.005, brickHeight, 0.005), mortarMat);
        vMortar.position.set(x, y, depth / 2 + 0.003);
        group.add(vMortar);
      }
    }

    // Brick corbel at top (stepped outward courses)
    const corbelSteps = 3;
    for (let s = 0; s < corbelSteps; s++) {
      const stepOut = 0.02 * (s + 1);
      const stepY = height + s * brickHeight;
      const corbelGeom = new BoxGeometry(width + stepOut * 2, brickHeight, depth + stepOut * 2);
      const corbel = new Mesh(corbelGeom, bodyMat);
      corbel.position.set(0, stepY + brickHeight / 2, 0);
      group.add(corbel);
    }
  }

  /** Stone texture: random stone lines + metal bands */
  private addStoneDetail(
    group: Group, height: number, width: number, depth: number,
    bodyMat: MeshStandardMaterial,
  ): void {
    const mortarMat = new MeshStandardMaterial({ color: 0x999988, metalness: 0.0, roughness: 0.9 });

    // Horizontal stone course lines (irregular spacing)
    const rng = this.rng;
    let y = 0;
    while (y < height) {
      const courseHeight = 0.08 + rng.nextFloat(0, 0.15);
      y += courseHeight;
      if (y >= height) break;
      const mortar = new Mesh(new BoxGeometry(width + 0.005, 0.006, depth + 0.005), mortarMat);
      mortar.position.set(0, y, 0);
      group.add(mortar);
    }

    // Metal bands (straps around chimney)
    const bandMat = new MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.35 });
    const bandPositions = [height * 0.3, height * 0.65];
    for (const by of bandPositions) {
      // Front
      const frontBand = new Mesh(new BoxGeometry(width + 0.02, 0.025, 0.008), bandMat);
      frontBand.position.set(0, by, depth / 2 + 0.004);
      group.add(frontBand);
      // Back
      const backBand = new Mesh(new BoxGeometry(width + 0.02, 0.025, 0.008), bandMat);
      backBand.position.set(0, by, -depth / 2 - 0.004);
      group.add(backBand);
      // Left
      const leftBand = new Mesh(new BoxGeometry(0.008, 0.025, depth + 0.02), bandMat);
      leftBand.position.set(-width / 2 - 0.004, by, 0);
      group.add(leftBand);
      // Right
      const rightBand = new Mesh(new BoxGeometry(0.008, 0.025, depth + 0.02), bandMat);
      rightBand.position.set(width / 2 + 0.004, by, 0);
      group.add(rightBand);
    }
  }

  /** Metal chimney: rain cap ring + flue ring */
  private addMetalDetail(group: Group, height: number, width: number, depth: number): void {
    const ringMat = new MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.15 });

    // Top ring
    const ringGeom = new TorusGeometry(width / 2 + 0.02, 0.015, 8, 24);
    const topRing = new Mesh(ringGeom, ringMat);
    topRing.position.set(0, height, 0);
    topRing.rotation.x = Math.PI / 2;
    group.add(topRing);

    // Bottom ring
    const botRing = new Mesh(ringGeom, ringMat);
    botRing.position.set(0, 0.1, 0);
    botRing.rotation.x = Math.PI / 2;
    group.add(botRing);
  }

  // ---------------------------------------------------------------------------
  // Cap implementations
  // ---------------------------------------------------------------------------

  private addCap(
    group: Group, height: number, width: number, depth: number,
    capStyle: string, capMat: MeshStandardMaterial, chimneyType: string,
  ): void {
    const capY = height;

    if (capStyle === 'flat') {
      // Flat cap with drip edge
      const capGeom = new BoxGeometry(width + 0.1, 0.08, depth + 0.1);
      const cap = new Mesh(capGeom, capMat);
      cap.position.set(0, capY + 0.04, 0);
      cap.castShadow = true;
      group.add(cap);

      // Drip edge (underside lip)
      const dripMat = new MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.3 });
      const dripGeom = new BoxGeometry(width + 0.14, 0.015, depth + 0.14);
      const drip = new Mesh(dripGeom, dripMat);
      drip.position.set(0, capY + 0.005, 0);
      group.add(drip);
    } else if (capStyle === 'conical') {
      // Conical cap
      const capGeom = new CylinderGeometry(0.1, width / 2 + 0.1, 0.4, 16);
      const cap = new Mesh(capGeom, capMat);
      cap.position.set(0, capY + 0.2, 0);
      cap.castShadow = true;
      group.add(cap);
    } else if (capStyle === 'decorative') {
      // Decorative cap: crown molding (stacked torus + ogee profile)
      // Base ledge
      const ledgeGeom = new BoxGeometry(width + 0.12, 0.06, depth + 0.12);
      const ledge = new Mesh(ledgeGeom, capMat);
      ledge.position.set(0, capY + 0.03, 0);
      group.add(ledge);

      // Crown molding - convex torus
      const crownGeom = new TorusGeometry(width / 2 + 0.04, 0.025, 8, 24);
      const crown = new Mesh(crownGeom, capMat);
      crown.position.set(0, capY + 0.085, 0);
      crown.rotation.x = Math.PI / 2;
      group.add(crown);

      // Concave cove (smaller inverted torus)
      const coveGeom = new TorusGeometry(width / 2 + 0.02, 0.018, 8, 24);
      const cove = new Mesh(coveGeom, capMat);
      cove.position.set(0, capY + 0.06, 0);
      cove.rotation.x = Math.PI / 2;
      group.add(cove);

      // Top flat
      const topGeom = new BoxGeometry(width + 0.08, 0.04, depth + 0.08);
      const top = new Mesh(topGeom, capMat);
      top.position.set(0, capY + 0.12, 0);
      group.add(top);

      // Finial on top
      const finialGeom = new SphereGeometry(0.04, 8, 8);
      const finial = new Mesh(finialGeom, capMat);
      finial.position.set(0, capY + 0.18, 0);
      group.add(finial);
    }
  }

  // ---------------------------------------------------------------------------
  // Flues
  // ---------------------------------------------------------------------------

  private addFlues(
    group: Group, height: number, flueCount: number, width: number, depth: number,
  ): void {
    const flueMat = new MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.4 });
    const rimMat  = new MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.3 });

    const capOffset = 0.15; // above the cap

    for (let i = 0; i < flueCount; i++) {
      const flueX = flueCount === 1 ? 0 : (i - (flueCount - 1) / 2) * 0.3;

      // Flue liner (cylinder)
      const flueGeom = new CylinderGeometry(0.08, 0.08, 0.4, 8);
      const flue = new Mesh(flueGeom, flueMat);
      flue.position.set(flueX, height + capOffset + 0.2, 0);
      group.add(flue);

      // Flue rim (wider ring at top)
      const rimGeom = new TorusGeometry(0.09, 0.012, 8, 16);
      const rim = new Mesh(rimGeom, rimMat);
      rim.position.set(flueX, height + capOffset + 0.4, 0);
      rim.rotation.x = Math.PI / 2;
      group.add(rim);
    }
  }

  getStylePresets(): Record<string, Partial<ChimneyParams>> {
    return {
      traditional: { chimneyType: 'brick', hasCap: true, capStyle: 'flat', flueCount: 1 },
      modern: { chimneyType: 'modern', hasCap: false, material: 'concrete' },
      rustic: { chimneyType: 'stone', hasCap: true, capStyle: 'decorative' },
      industrial: { chimneyType: 'metal', material: 'steel', hasCap: true, capStyle: 'conical' },
    };
  }
}
