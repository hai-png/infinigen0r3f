/**
 * WingGenerator - Procedural wing generation with feather-like geometry,
 * curvature, and type variation (soaring, flapping, folded)
 */
import * as THREE from 'three';

export type WingType = 'soaring' | 'flapping' | 'folded' | 'hovering' | 'membrane' | 'butterfly';

export class WingGenerator {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? 42;
  }

  /**
   * Generate a single wing (left or right). The wing is oriented along +X for left,
   * mirror for right.
   */
  generate(side: 'left' | 'right', span: number, pattern: string = 'soaring'): THREE.Group {
    const wingType = pattern as WingType;
    const wingGroup = new THREE.Group();
    wingGroup.name = `${side}Wing`;

    const dir = side === 'left' ? -1 : 1;

    switch (wingType) {
      case 'soaring':
        this.buildSoaringWing(wingGroup, span, dir);
        break;
      case 'flapping':
        this.buildFlappingWing(wingGroup, span, dir);
        break;
      case 'folded':
        this.buildFoldedWing(wingGroup, span, dir);
        break;
      case 'hovering':
        this.buildHoveringWing(wingGroup, span, dir);
        break;
      case 'membrane':
        this.buildMembraneWing(wingGroup, span, dir);
        break;
      case 'butterfly':
        this.buildButterflyWing(wingGroup, span, dir);
        break;
      default:
        this.buildSoaringWing(wingGroup, span, dir);
    }

    return wingGroup;
  }

  /**
   * Soaring wing: long, broad with slotted tips (eagle/albatross style)
   */
  private buildSoaringWing(group: THREE.Group, span: number, dir: number): void {
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0x4a3a2a, roughness: 0.8, side: THREE.DoubleSide,
    });

    // Main wing surface - curved tapered shape
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(span * 0.3, span * 0.08, span * 0.7, span * 0.06, span, 0);
    wingShape.bezierCurveTo(span * 0.7, -span * 0.03, span * 0.3, -span * 0.04, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(wingShape, 12);
    // Add curvature
    this.applyWingCurvature(wingGeo, span, 0.08);
    const wingMesh = new THREE.Mesh(wingGeo, featherMat);
    wingMesh.name = 'wingSurface';
    group.add(wingMesh);

    // Primary feathers at the tip - slotted for soaring
    const featherCount = 5;
    for (let i = 0; i < featherCount; i++) {
      const t = i / (featherCount - 1);
      const featherLen = span * (0.15 + t * 0.1);
      const featherGeo = new THREE.PlaneGeometry(span * 0.02, featherLen, 1, 2);
      const feather = new THREE.Mesh(featherGeo, featherMat);
      feather.position.set(dir * (span - span * 0.05 + t * span * 0.03), 0, -featherLen * 0.3);
      feather.rotation.z = dir * (t - 0.5) * 0.15;
      feather.name = `primaryFeather_${i}`;
      group.add(feather);
    }

    // Secondary feathers along trailing edge
    const secCount = 8;
    for (let i = 0; i < secCount; i++) {
      const t = i / secCount;
      const x = dir * span * (0.3 + t * 0.5);
      const featherLen = span * 0.1;
      const featherGeo = new THREE.PlaneGeometry(span * 0.015, featherLen, 1, 2);
      const feather = new THREE.Mesh(featherGeo, featherMat);
      feather.position.set(x, 0, -span * 0.04 - featherLen * 0.2);
      feather.rotation.z = dir * -0.05;
      feather.name = `secondaryFeather_${i}`;
      group.add(feather);
    }
  }

  /**
   * Flapping wing: shorter, broader with more surface area
   */
  private buildFlappingWing(group: THREE.Group, span: number, dir: number): void {
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0x6a5a4a, roughness: 0.75, side: THREE.DoubleSide,
    });

    // Broader wing shape
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(span * 0.25, span * 0.1, span * 0.6, span * 0.09, span * 0.85, 0);
    wingShape.bezierCurveTo(span * 0.6, -span * 0.06, span * 0.25, -span * 0.06, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(wingShape, 10);
    this.applyWingCurvature(wingGeo, span, 0.12);
    const wingMesh = new THREE.Mesh(wingGeo, featherMat);
    wingMesh.name = 'wingSurface';
    group.add(wingMesh);

    // Covert feathers (overlapping rows)
    const rowColors = [0x5a4a3a, 0x7a6a5a];
    for (let row = 0; row < 2; row++) {
      const count = 6 + row * 3;
      for (let i = 0; i < count; i++) {
        const t = i / count;
        const x = dir * span * (0.15 + t * 0.65);
        const y = row * span * 0.015;
        const featherLen = span * (0.06 + row * 0.04);
        const featherGeo = new THREE.PlaneGeometry(span * 0.025, featherLen, 1, 2);
        const mat = new THREE.MeshStandardMaterial({
          color: rowColors[row], roughness: 0.75, side: THREE.DoubleSide,
        });
        const feather = new THREE.Mesh(featherGeo, mat);
        feather.position.set(x, y, -featherLen * 0.3);
        feather.rotation.z = dir * -0.03 * (1 - t);
        feather.name = `covert_${row}_${i}`;
        group.add(feather);
      }
    }
  }

  /**
   * Folded wing: wing folded against the body
   */
  private buildFoldedWing(group: THREE.Group, span: number, dir: number): void {
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0x5a4a3a, roughness: 0.8, side: THREE.DoubleSide,
    });

    // Folded wing appears as a narrower shape drooping down
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(span * 0.15, span * 0.04, span * 0.4, span * 0.03, span * 0.5, -span * 0.05);
    wingShape.bezierCurveTo(span * 0.4, -span * 0.07, span * 0.15, -span * 0.03, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(wingShape, 8);
    const wingMesh = new THREE.Mesh(wingGeo, featherMat);
    wingMesh.rotation.x = 0.3; // Dropped down
    wingMesh.name = 'wingSurface';
    group.add(wingMesh);
  }

  /**
   * Hovering wing: short and broad (hummingbird style)
   */
  private buildHoveringWing(group: THREE.Group, span: number, dir: number): void {
    const featherMat = new THREE.MeshStandardMaterial({
      color: 0x3a6a3a, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    });

    // Short, narrow, elliptical wing
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(span * 0.3, span * 0.12, span * 0.7, span * 0.1, span, 0);
    wingShape.bezierCurveTo(span * 0.7, -span * 0.08, span * 0.3, -span * 0.06, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(wingShape, 8);
    this.applyWingCurvature(wingGeo, span, 0.15);
    const wingMesh = new THREE.Mesh(wingGeo, featherMat);
    wingMesh.name = 'wingSurface';
    group.add(wingMesh);
  }

  /**
   * Membrane wing: bat-like with finger bones and stretched skin
   */
  private buildMembraneWing(group: THREE.Group, span: number, dir: number): void {
    const membraneMat = new THREE.MeshStandardMaterial({
      color: 0x4a3a3a, roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.85,
    });
    const boneMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.6 });

    // Finger bones that support the membrane
    const fingerCount = 4;
    const fingerAngles = [0.1, 0.2, 0.15, 0.0];
    for (let i = 0; i < fingerCount; i++) {
      const fingerLen = span * (0.6 + i * 0.1);
      const angle = dir * (0.1 + fingerAngles[i]);
      const boneGeo = new THREE.CylinderGeometry(span * 0.008, span * 0.012, fingerLen, 6);
      const bone = new THREE.Mesh(boneGeo, boneMat);
      bone.position.set(dir * fingerLen * 0.4 * Math.cos(angle), fingerLen * 0.4 * Math.sin(angle), 0);
      bone.rotation.z = dir * (-Math.PI / 2 + angle);
      bone.name = `fingerBone_${i}`;
      group.add(bone);
    }

    // Membrane stretched between fingers
    const memShape = new THREE.Shape();
    memShape.moveTo(0, 0);
    memShape.bezierCurveTo(span * 0.3, span * 0.08, span * 0.7, span * 0.06, span * 0.9, span * 0.02);
    memShape.lineTo(span * 0.85, -span * 0.03);
    memShape.bezierCurveTo(span * 0.6, -span * 0.05, span * 0.3, -span * 0.04, 0, 0);

    const memGeo = new THREE.ShapeGeometry(memShape, 8);
    const membrane = new THREE.Mesh(memGeo, membraneMat);
    membrane.name = 'membrane';
    group.add(membrane);
  }

  /**
   * Butterfly wing: colorful, large relative to body, with patterns
   */
  private buildButterflyWing(group: THREE.Group, span: number, dir: number): void {
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xdd6622, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    });

    // Forewing - larger, triangular
    const foreShape = new THREE.Shape();
    foreShape.moveTo(0, 0);
    foreShape.bezierCurveTo(span * 0.3, span * 0.15, span * 0.8, span * 0.12, span, 0);
    foreShape.bezierCurveTo(span * 0.7, -span * 0.05, span * 0.3, -span * 0.03, 0, 0);

    const foreGeo = new THREE.ShapeGeometry(foreShape, 8);
    const forewing = new THREE.Mesh(foreGeo, wingMat);
    forewing.name = 'forewing';
    group.add(forewing);

    // Hindwing - smaller, rounded
    const hindMat = new THREE.MeshStandardMaterial({
      color: 0xcc4411, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    });
    const hindShape = new THREE.Shape();
    hindShape.moveTo(0, 0);
    hindShape.bezierCurveTo(span * 0.2, -span * 0.1, span * 0.5, -span * 0.12, span * 0.6, -span * 0.03);
    hindShape.bezierCurveTo(span * 0.4, -span * 0.02, span * 0.2, -span * 0.01, 0, 0);

    const hindGeo = new THREE.ShapeGeometry(hindShape, 8);
    const hindwing = new THREE.Mesh(hindGeo, hindMat);
    hindwing.position.z = -span * 0.01;
    hindwing.name = 'hindwing';
    group.add(hindwing);

    // Wing veins
    const veinMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const t = 0.3 + i * 0.25;
      const veinLen = span * t;
      const veinGeo = new THREE.CylinderGeometry(span * 0.002, span * 0.003, veinLen, 4);
      const vein = new THREE.Mesh(veinGeo, veinMat);
      vein.position.set(dir * veinLen * 0.35, 0, 0);
      vein.rotation.z = dir * (-Math.PI / 2 + i * 0.1);
      vein.name = `vein_${i}`;
      group.add(vein);
    }
  }

  /**
   * Apply a curvature to a wing geometry (dome shape for lift)
   */
  private applyWingCurvature(geometry: THREE.BufferGeometry, span: number, curvature: number): void {
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const t = Math.abs(x) / span; // 0 at root, 1 at tip
      // Airfoil-like curvature: higher near the front, dropping at the back
      positions[i + 2] += curvature * span * Math.sin(t * Math.PI) * 0.5;
    }
    geometry.computeVertexNormals();
  }
}
