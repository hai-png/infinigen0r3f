/**
 * RailingGenerator - Procedural railing generation
 * Supports vertical, horizontal, glass, cable, and ornate infill types
 * with metal, wood, and wrought_iron material options
 */
import {
  Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial,
  BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry,
  DoubleSide, Color,
} from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface RailingParams extends BaseGeneratorConfig {
  length: number;
  height: number;
  width: number;
  railingType: 'horizontal' | 'vertical' | 'glass' | 'cable' | 'ornate';
  postSpacing: number;
  postWidth: number;
  railCount: number;
  balusterType: 'round' | 'square' | 'flat' | 'twisted';
  style: 'modern' | 'traditional' | 'industrial' | 'classic';
  material: string;
  hasHandrail: boolean;
  handrailShape: 'round' | 'rectangular' | 'custom';
  glassTint: number;
  glassOpacity: number;
}

const DEFAULT_PARAMS: RailingParams = {
  length: 3.0,
  height: 1.0,
  width: 0.1,
  railingType: 'vertical',
  postSpacing: 1.0,
  postWidth: 0.1,
  railCount: 3,
  balusterType: 'round',
  style: 'modern',
  material: 'metal',
  hasHandrail: true,
  handrailShape: 'round',
  glassTint: 0xaaccff,
  glassOpacity: 0.3,
};

export class RailingGenerator extends BaseObjectGenerator<RailingParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): RailingParams {
    return { ...DEFAULT_PARAMS };
  }

  // ---------------------------------------------------------------------------
  // Material helpers
  // ---------------------------------------------------------------------------

  /** Material for the vertical posts */
  getPostMaterial(type: string = 'metal'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      metal:      { color: 0xaaaaaa, metalness: 0.85, roughness: 0.25 },
      steel:      { color: 0x999999, metalness: 0.9,  roughness: 0.2 },
      aluminum:   { color: 0xcccccc, metalness: 0.9,  roughness: 0.15 },
      wood:       { color: 0x8b6914, metalness: 0.0,  roughness: 0.75 },
      wrought_iron: { color: 0x333333, metalness: 0.7, roughness: 0.45 },
    };
    const c = configs[type] ?? configs.metal;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  /** Material for the handrail / top rail */
  getRailMaterial(type: string = 'metal'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      metal:        { color: 0xbbbbbb, metalness: 0.85, roughness: 0.2 },
      steel:        { color: 0xaaaaaa, metalness: 0.9,  roughness: 0.15 },
      aluminum:     { color: 0xdddddd, metalness: 0.9,  roughness: 0.12 },
      wood:         { color: 0x9b7624, metalness: 0.0,  roughness: 0.65 },
      wrought_iron: { color: 0x2a2a2a, metalness: 0.7,  roughness: 0.4 },
    };
    const c = configs[type] ?? configs.metal;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  /** Material for balusters / infill elements */
  getBalusterMaterial(type: string = 'metal'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      metal:        { color: 0xaaaaaa, metalness: 0.8, roughness: 0.3 },
      steel:        { color: 0x999999, metalness: 0.85, roughness: 0.25 },
      aluminum:     { color: 0xcccccc, metalness: 0.85, roughness: 0.2 },
      wood:         { color: 0xa0782c, metalness: 0.0, roughness: 0.7 },
      wrought_iron: { color: 0x222222, metalness: 0.65, roughness: 0.5 },
    };
    const c = configs[type] ?? configs.metal;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  generate(params: Partial<RailingParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const {
      length, height, width, railingType, postSpacing, postWidth,
      railCount, balusterType, hasHandrail, handrailShape, material,
      glassTint, glassOpacity,
    } = finalParams;

    const postMat   = this.getPostMaterial(material);
    const railMat   = this.getRailMaterial(material);
    const balusterMat = this.getBalusterMaterial(material);

    // --- Posts ---
    const numPosts = Math.floor(length / postSpacing) + 1;
    for (let i = 0; i < numPosts; i++) {
      const x = i * postSpacing;
      const postGeom = new BoxGeometry(postWidth, height, postWidth);
      const post = new Mesh(postGeom, postMat);
      post.position.set(x, height / 2, 0);
      post.castShadow = true;
      group.add(post);

      // Post cap (small sphere on top)
      const capGeom = new SphereGeometry(postWidth * 0.6, 8, 8);
      const cap = new Mesh(capGeom, railMat);
      cap.position.set(x, height + postWidth * 0.3, 0);
      group.add(cap);
    }

    // --- Handrail ---
    if (hasHandrail) {
      const railY = height - 0.05;
      if (handrailShape === 'round') {
        const railGeom = new CylinderGeometry(0.03, 0.03, length, 16);
        const rail = new Mesh(railGeom, railMat);
        rail.rotation.z = Math.PI / 2;
        rail.position.set(length / 2, railY, 0);
        group.add(rail);
      } else {
        const railGeom = new BoxGeometry(length, 0.05, 0.08);
        const rail = new Mesh(railGeom, railMat);
        rail.position.set(length / 2, railY, 0);
        group.add(rail);
      }
    }

    // --- Balusters / Infill based on type ---
    if (railingType === 'vertical') {
      this.addVerticalBalusters(group, length, height, balusterType, balusterMat, postWidth);
    } else if (railingType === 'horizontal') {
      this.addHorizontalRails(group, length, height, railCount, railMat);
    } else if (railingType === 'glass') {
      this.addGlassPanels(group, length, height, numPosts, postSpacing, glassTint, glassOpacity);
    } else if (railingType === 'cable') {
      this.addCableInfill(group, length, height, numPosts, postSpacing, railMat);
    } else if (railingType === 'ornate') {
      this.addOrnateBalusters(group, length, height, balusterMat, railMat);
    }

    return group;
  }

  // ---------------------------------------------------------------------------
  // Infill implementations
  // ---------------------------------------------------------------------------

  private addVerticalBalusters(
    group: Group, length: number, height: number,
    balusterType: string, mat: MeshStandardMaterial, postWidth: number,
  ): void {
    const numBalusters = Math.floor(length / 0.15);
    const balusterHeight = height - 0.1;

    for (let i = 0; i < numBalusters; i++) {
      const x = (i + 0.5) * (length / numBalusters);

      if (balusterType === 'round') {
        const geom = new CylinderGeometry(0.015, 0.015, balusterHeight, 8);
        const baluster = new Mesh(geom, mat);
        baluster.position.set(x, balusterHeight / 2 + 0.05, 0);
        group.add(baluster);
      } else if (balusterType === 'square') {
        const geom = new BoxGeometry(0.03, balusterHeight, 0.03);
        const baluster = new Mesh(geom, mat);
        baluster.position.set(x, balusterHeight / 2 + 0.05, 0);
        group.add(baluster);
      } else if (balusterType === 'flat') {
        // Flat bar baluster — thin in one axis
        const geom = new BoxGeometry(0.002, balusterHeight, 0.04);
        const baluster = new Mesh(geom, mat);
        baluster.position.set(x, balusterHeight / 2 + 0.05, 0);
        group.add(baluster);
      } else if (balusterType === 'twisted') {
        // Twisted square baluster — two intersecting flat bars at 45°
        const geom1 = new BoxGeometry(0.002, balusterHeight, 0.03);
        const bar1 = new Mesh(geom1, mat);
        bar1.position.set(x, balusterHeight / 2 + 0.05, 0);
        bar1.rotation.y = Math.PI / 4;
        group.add(bar1);

        const geom2 = new BoxGeometry(0.002, balusterHeight, 0.03);
        const bar2 = new Mesh(geom2, mat);
        bar2.position.set(x, balusterHeight / 2 + 0.05, 0);
        bar2.rotation.y = -Math.PI / 4;
        group.add(bar2);
      }
    }
  }

  private addHorizontalRails(
    group: Group, length: number, height: number,
    railCount: number, mat: MeshStandardMaterial,
  ): void {
    for (let i = 0; i < railCount; i++) {
      const y = 0.1 + (i / Math.max(railCount - 1, 1)) * (height - 0.2);
      const railGeom = new CylinderGeometry(0.01, 0.01, length, 16);
      const rail = new Mesh(railGeom, mat);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(length / 2, y, 0);
      group.add(rail);
    }
  }

  /** Glass infill: transparent panels between posts */
  private addGlassPanels(
    group: Group, length: number, height: number,
    numPosts: number, postSpacing: number,
    tint: number, opacity: number,
  ): void {
    const glassMat = new MeshPhysicalMaterial({
      color: tint,
      transparent: true,
      opacity: opacity,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.9,
      ior: 1.5,
      thickness: 0.01,
      side: DoubleSide,
      depthWrite: false,
    });

    const panelWidth = postSpacing - 0.06; // small gap at posts
    const panelHeight = height - 0.15;

    for (let i = 0; i < numPosts - 1; i++) {
      const x = i * postSpacing + postSpacing / 2;
      const glassGeom = new BoxGeometry(panelWidth, panelHeight, 0.008);
      const glass = new Mesh(glassGeom, glassMat);
      glass.position.set(x, panelHeight / 2 + 0.05, 0);
      group.add(glass);
    }

    // Handrail clamp strips (top + bottom of each panel)
    const clampMat = new MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.25 });
    for (let i = 0; i < numPosts - 1; i++) {
      const x = i * postSpacing + postSpacing / 2;
      // Top clamp
      const topClamp = new Mesh(new BoxGeometry(panelWidth + 0.02, 0.02, 0.03), clampMat);
      topClamp.position.set(x, panelHeight + 0.06, 0);
      group.add(topClamp);
      // Bottom clamp
      const botClamp = new Mesh(new BoxGeometry(panelWidth + 0.02, 0.02, 0.03), clampMat);
      botClamp.position.set(x, 0.04, 0);
      group.add(botClamp);
    }
  }

  /** Cable infill: thin horizontal metal cables between posts */
  private addCableInfill(
    group: Group, length: number, height: number,
    numPosts: number, postSpacing: number, mat: MeshStandardMaterial,
  ): void {
    const cableRadius = 0.004;
    const cableCount = Math.max(3, Math.floor(height / 0.08));

    for (let c = 0; c < cableCount; c++) {
      const y = 0.06 + ((c + 0.5) / cableCount) * (height - 0.12);
      const cableGeom = new CylinderGeometry(cableRadius, cableRadius, length, 6);
      const cable = new Mesh(cableGeom, mat);
      cable.rotation.z = Math.PI / 2;
      cable.position.set(length / 2, y, 0);
      group.add(cable);
    }

    // Cable end fittings at each post
    const fittingMat = new MeshStandardMaterial({ color: 0x777777, metalness: 0.9, roughness: 0.15 });
    for (let i = 0; i < numPosts; i++) {
      const x = i * postSpacing;
      for (let c = 0; c < cableCount; c++) {
        const y = 0.06 + ((c + 0.5) / cableCount) * (height - 0.12);
        const fitting = new Mesh(new CylinderGeometry(0.008, 0.008, 0.015, 8), fittingMat);
        fitting.position.set(x, y, 0);
        group.add(fitting);
      }
    }
  }

  /** Ornate infill: decorative balusters with scrollwork details */
  private addOrnateBalusters(
    group: Group, length: number, height: number,
    balusterMat: MeshStandardMaterial, railMat: MeshStandardMaterial,
  ): void {
    const spacing = 0.2;
    const numBalusters = Math.floor(length / spacing);
    const balusterHeight = height - 0.15;

    for (let i = 0; i < numBalusters; i++) {
      const x = (i + 0.5) * spacing;
      const bGroup = new Group();
      bGroup.position.set(x, 0.075, 0);

      // Bottom sphere
      const bottomSphere = new Mesh(new SphereGeometry(0.022, 8, 8), balusterMat);
      bottomSphere.position.y = 0.022;
      bGroup.add(bottomSphere);

      // Lower shaft
      const lowerShaft = new Mesh(new CylinderGeometry(0.012, 0.016, balusterHeight * 0.35, 8), balusterMat);
      lowerShaft.position.y = 0.022 + balusterHeight * 0.175;
      bGroup.add(lowerShaft);

      // Center ring / torus
      const ring = new Mesh(new TorusGeometry(0.025, 0.008, 8, 16), balusterMat);
      ring.position.y = 0.022 + balusterHeight * 0.35;
      ring.rotation.x = Math.PI / 2;
      bGroup.add(ring);

      // Upper shaft (thinner)
      const upperShaft = new Mesh(new CylinderGeometry(0.01, 0.012, balusterHeight * 0.35, 8), balusterMat);
      upperShaft.position.y = 0.022 + balusterHeight * 0.35 + balusterHeight * 0.175;
      bGroup.add(upperShaft);

      // Top sphere
      const topSphere = new Mesh(new SphereGeometry(0.018, 8, 8), balusterMat);
      topSphere.position.y = balusterHeight + 0.018;
      bGroup.add(topSphere);

      group.add(bGroup);
    }

    // Bottom rail
    const bottomRailGeom = new BoxGeometry(length, 0.025, 0.035);
    const bottomRail = new Mesh(bottomRailGeom, railMat);
    bottomRail.position.set(length / 2, 0.03, 0);
    group.add(bottomRail);
  }

  getStylePresets(): Record<string, Partial<RailingParams>> {
    return {
      modern: { railingType: 'glass', material: 'steel', hasHandrail: true },
      traditional: { railingType: 'vertical', balusterType: 'twisted', material: 'wood' },
      industrial: { railingType: 'horizontal', material: 'steel', railCount: 4 },
      classic: { railingType: 'ornate', material: 'wrought_iron' },
    };
  }
}
