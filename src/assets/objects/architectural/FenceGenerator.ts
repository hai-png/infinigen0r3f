/**
 * FenceGenerator - Procedural fence generation
 * Supports picket, privacy, chain_link, wrought_iron, and ranch types
 * with proper materials for posts, rails, and infill
 */
import {
  Group, Mesh, MeshStandardMaterial,
  BoxGeometry, CylinderGeometry, ConeGeometry, TorusGeometry,
} from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface FenceParams extends BaseGeneratorConfig {
  length: number;
  height: number;
  fenceType: 'picket' | 'privacy' | 'chain_link' | 'wrought_iron' | 'ranch';
  postSpacing: number;
  postWidth: number;
  picketWidth: number;
  picketSpacing: number;
  hasGate: boolean;
  gateWidth: number;
  material: string;
  style: 'traditional' | 'modern' | 'rustic' | 'farmhouse';
}

const DEFAULT_PARAMS: FenceParams = {
  length: 10.0,
  height: 1.8,
  fenceType: 'picket',
  postSpacing: 2.5,
  postWidth: 0.1,
  picketWidth: 0.1,
  picketSpacing: 0.08,
  hasGate: false,
  gateWidth: 1.2,
  material: 'wood',
  style: 'traditional',
};

export class FenceGenerator extends BaseObjectGenerator<FenceParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): FenceParams {
    return { ...DEFAULT_PARAMS };
  }

  // ---------------------------------------------------------------------------
  // Material helpers
  // ---------------------------------------------------------------------------

  getPostMaterial(type: string = 'wood'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      wood:              { color: 0x8b6914, metalness: 0.0,  roughness: 0.75 },
      white_painted_wood: { color: 0xf0f0f0, metalness: 0.0, roughness: 0.55 },
      composite:         { color: 0x7a6b55, metalness: 0.0,  roughness: 0.7 },
      metal:             { color: 0x888888, metalness: 0.85, roughness: 0.25 },
      vinyl:             { color: 0xe8e8e8, metalness: 0.0,  roughness: 0.4 },
    };
    const c = configs[type] ?? configs.wood;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  getRailMaterial(type: string = 'wood'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      wood:              { color: 0x9b7624, metalness: 0.0,  roughness: 0.7 },
      white_painted_wood: { color: 0xf5f5f5, metalness: 0.0, roughness: 0.5 },
      composite:         { color: 0x6d5e48, metalness: 0.0,  roughness: 0.65 },
      metal:             { color: 0x999999, metalness: 0.85, roughness: 0.2 },
      vinyl:             { color: 0xeaeaea, metalness: 0.0,  roughness: 0.35 },
    };
    const c = configs[type] ?? configs.wood;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  getInfillMaterial(type: string = 'wood'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      wood:              { color: 0xa0782c, metalness: 0.0,  roughness: 0.7 },
      white_painted_wood: { color: 0xfafafa, metalness: 0.0, roughness: 0.5 },
      composite:         { color: 0x7a6b55, metalness: 0.0,  roughness: 0.65 },
      metal:             { color: 0xaaaaaa, metalness: 0.8,  roughness: 0.3 },
      vinyl:             { color: 0xf0f0f0, metalness: 0.0,  roughness: 0.35 },
    };
    const c = configs[type] ?? configs.wood;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  generate(params: Partial<FenceParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const {
      length, height, fenceType, postSpacing, postWidth,
      picketWidth, picketSpacing, hasGate, gateWidth, material,
    } = finalParams;

    const postMat   = this.getPostMaterial(material);
    const railMat   = this.getRailMaterial(material);
    const infillMat = this.getInfillMaterial(material);

    const numPosts = Math.floor(length / postSpacing) + 1;
    const actualLength = (numPosts - 1) * postSpacing;
    const gateStart = hasGate ? actualLength / 2 - gateWidth / 2 : actualLength;
    const gateEnd = hasGate ? actualLength / 2 + gateWidth / 2 : 0;

    // --- Posts ---
    for (let i = 0; i < numPosts; i++) {
      const x = -actualLength / 2 + i * postSpacing;
      if (hasGate && x > gateStart - postWidth && x < gateEnd + postWidth) continue;

      const postGeom = new BoxGeometry(postWidth, height, postWidth);
      const post = new Mesh(postGeom, postMat);
      post.position.set(x, height / 2, 0);
      post.castShadow = true;
      group.add(post);

      // Post cap
      const capGeom = new ConeGeometry(postWidth * 0.7, postWidth * 0.6, 4);
      const cap = new Mesh(capGeom, railMat);
      cap.position.set(x, height + postWidth * 0.3, 0);
      group.add(cap);
    }

    // --- Rails / panels based on fence type ---
    if (fenceType === 'picket') {
      this.addPicketFence(group, actualLength, height, picketWidth, picketSpacing,
        hasGate, gateStart, gateEnd, railMat, infillMat);
    } else if (fenceType === 'privacy') {
      this.addPrivacyFence(group, actualLength, height, postSpacing,
        hasGate, gateStart, gateEnd, railMat, infillMat);
    } else if (fenceType === 'chain_link') {
      this.addChainLinkFence(group, actualLength, height, postSpacing,
        hasGate, gateStart, gateEnd, railMat);
    } else if (fenceType === 'wrought_iron') {
      this.addWroughtIronFence(group, actualLength, height, postSpacing,
        hasGate, gateStart, gateEnd);
    } else if (fenceType === 'ranch') {
      this.addRanchFence(group, actualLength, height, numPosts, postSpacing, railMat);
    }

    // --- Gate ---
    if (hasGate) {
      this.addGate(group, gateWidth, height, fenceType, railMat, infillMat);
    }

    return group;
  }

  // ---------------------------------------------------------------------------
  // Fence type implementations
  // ---------------------------------------------------------------------------

  private addPicketFence(
    group: Group, actualLength: number, height: number,
    picketWidth: number, picketSpacing: number,
    hasGate: boolean, gateStart: number, gateEnd: number,
    railMat: MeshStandardMaterial, infillMat: MeshStandardMaterial,
  ): void {
    // Horizontal rails
    const topRailGeom = new BoxGeometry(actualLength, 0.05, 0.08);
    const topRail = new Mesh(topRailGeom, railMat);
    topRail.position.set(0, height - 0.1, 0);
    group.add(topRail);

    const bottomRail = new Mesh(new BoxGeometry(actualLength, 0.05, 0.08), railMat);
    bottomRail.position.set(0, 0.15, 0);
    group.add(bottomRail);

    // Pickets
    const numPickets = Math.floor(actualLength / (picketWidth + picketSpacing));
    for (let i = 0; i < numPickets; i++) {
      const x = -actualLength / 2 + (i + 0.5) * (picketWidth + picketSpacing);
      if (hasGate && x > gateStart - picketWidth && x < gateEnd + picketWidth) continue;

      const picketGeom = new BoxGeometry(picketWidth, height - 0.2, 0.05);
      const picket = new Mesh(picketGeom, infillMat);
      picket.position.set(x, height / 2 - 0.1, 0);
      picket.castShadow = true;
      group.add(picket);

      // Pointed picket top
      const tipGeom = new ConeGeometry(picketWidth / 2, 0.06, 4);
      const tip = new Mesh(tipGeom, infillMat);
      tip.position.set(x, height - 0.17, 0);
      group.add(tip);
    }
  }

  private addPrivacyFence(
    group: Group, actualLength: number, height: number, postSpacing: number,
    hasGate: boolean, gateStart: number, gateEnd: number,
    railMat: MeshStandardMaterial, infillMat: MeshStandardMaterial,
  ): void {
    // Top and bottom rails
    const topRail = new Mesh(new BoxGeometry(actualLength, 0.05, 0.08), railMat);
    topRail.position.set(0, height - 0.1, 0);
    group.add(topRail);
    const botRail = new Mesh(new BoxGeometry(actualLength, 0.05, 0.08), railMat);
    botRail.position.set(0, 0.1, 0);
    group.add(botRail);

    // Solid panels between posts
    const panelGeom = new BoxGeometry(postSpacing - 0.05, height - 0.2, 0.08);
    const numPanels = Math.floor(actualLength / postSpacing);
    for (let i = 0; i < numPanels; i++) {
      const x = -actualLength / 2 + (i + 0.5) * postSpacing;
      if (hasGate && x > gateStart - postSpacing / 2 && x < gateEnd + postSpacing / 2) continue;
      const panel = new Mesh(panelGeom, infillMat);
      panel.position.set(x, height / 2 - 0.05, 0);
      panel.castShadow = true;
      group.add(panel);
    }
  }

  /** Chain-link fence: grid of horizontal + vertical thin wires */
  private addChainLinkFence(
    group: Group, actualLength: number, height: number, postSpacing: number,
    hasGate: boolean, gateStart: number, gateEnd: number,
    railMat: MeshStandardMaterial,
  ): void {
    // Top rail (pipe)
    const topPipe = new Mesh(new CylinderGeometry(0.025, 0.025, actualLength, 12), railMat);
    topPipe.rotation.z = Math.PI / 2;
    topPipe.position.set(0, height, 0);
    group.add(topPipe);

    // Bottom tension wire
    const botWire = new Mesh(new CylinderGeometry(0.008, 0.008, actualLength, 8), railMat);
    botWire.rotation.z = Math.PI / 2;
    botWire.position.set(0, 0.05, 0);
    group.add(botWire);

    // Chain-link mesh (diagonal wires)
    const wireMat = new MeshStandardMaterial({ color: 0x999999, metalness: 0.7, roughness: 0.4 });
    const wireRadius = 0.003;
    const wireSpacing = 0.05;

    // Horizontal wires
    const hWireCount = Math.floor(height / wireSpacing);
    for (let i = 0; i < hWireCount; i++) {
      const y = (i + 0.5) * wireSpacing;
      if (y > height - 0.05) continue;
      const hwGeom = new CylinderGeometry(wireRadius, wireRadius, actualLength, 4);
      const hw = new Mesh(hwGeom, wireMat);
      hw.rotation.z = Math.PI / 2;
      hw.position.set(0, y, 0);
      group.add(hw);
    }

    // Vertical wires
    const vWireCount = Math.floor(actualLength / wireSpacing);
    for (let i = 0; i < vWireCount; i++) {
      const x = -actualLength / 2 + (i + 0.5) * wireSpacing;
      if (hasGate && x > gateStart && x < gateEnd) continue;
      const vwGeom = new CylinderGeometry(wireRadius, wireRadius, height - 0.1, 4);
      const vw = new Mesh(vwGeom, wireMat);
      vw.position.set(x, (height - 0.1) / 2 + 0.05, 0);
      group.add(vw);
    }

    // Diagonal cross-wires (the actual chain-link diamond pattern)
    const diagMat = new MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6, roughness: 0.45 });
    const diamondSize = wireSpacing * 2;
    const diagLen = Math.sqrt(diamondSize * diamondSize * 2);
    const diagGeom = new CylinderGeometry(wireRadius * 0.8, wireRadius * 0.8, diagLen, 4);
    const numDiagH = Math.floor(height / diamondSize);
    const numDiagW = Math.floor(actualLength / diamondSize);

    for (let row = 0; row < numDiagH; row++) {
      for (let col = 0; col < numDiagW; col++) {
        const cx = -actualLength / 2 + (col + 0.5) * diamondSize;
        const cy = (row + 0.5) * diamondSize;
        if (hasGate && cx > gateStart && cx < gateEnd) continue;
        if (cy > height - 0.1) continue;

        // Forward slash
        const d1 = new Mesh(diagGeom, diagMat);
        d1.position.set(cx, cy, 0);
        d1.rotation.z = Math.PI / 4;
        group.add(d1);

        // Back slash
        const d2 = new Mesh(diagGeom, diagMat);
        d2.position.set(cx + diamondSize / 2, cy, 0);
        d2.rotation.z = -Math.PI / 4;
        group.add(d2);
      }
    }
  }

  /** Wrought-iron fence: bars with spear tops + scrollwork */
  private addWroughtIronFence(
    group: Group, actualLength: number, height: number, postSpacing: number,
    hasGate: boolean, gateStart: number, gateEnd: number,
  ): void {
    const ironMat = new MeshStandardMaterial({ color: 0x222222, metalness: 0.65, roughness: 0.5 });
    const accentMat = new MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.35 });

    // Top rail
    const topRail = new Mesh(new BoxGeometry(actualLength, 0.03, 0.04), accentMat);
    topRail.position.set(0, height - 0.015, 0);
    group.add(topRail);

    // Bottom rail
    const botRail = new Mesh(new BoxGeometry(actualLength, 0.025, 0.04), accentMat);
    botRail.position.set(0, 0.05, 0);
    group.add(botRail);

    // Vertical bars with spear tops
    const barSpacing = 0.12;
    const numBars = Math.floor(actualLength / barSpacing);
    for (let i = 0; i < numBars; i++) {
      const x = -actualLength / 2 + (i + 0.5) * barSpacing;
      if (hasGate && x > gateStart - 0.06 && x < gateEnd + 0.06) continue;

      const barHeight = height - 0.08;
      const bar = new Mesh(new CylinderGeometry(0.008, 0.008, barHeight, 6), ironMat);
      bar.position.set(x, barHeight / 2 + 0.04, 0);
      group.add(bar);

      // Spear top
      const spear = new Mesh(new ConeGeometry(0.015, 0.04, 4), accentMat);
      spear.position.set(x, height + 0.02, 0);
      group.add(spear);
    }

    // Scrollwork between posts (decorative C-scrolls)
    const sections = Math.floor(actualLength / postSpacing);
    for (let s = 0; s < sections; s++) {
      const cx = -actualLength / 2 + (s + 0.5) * postSpacing;
      if (hasGate && cx > gateStart - postSpacing / 2 && cx < gateEnd + postSpacing / 2) continue;

      // Central scroll (torus ring)
      const scrollY = height * 0.55;
      const scroll = new Mesh(new TorusGeometry(0.08, 0.006, 8, 16), ironMat);
      scroll.position.set(cx, scrollY, 0);
      scroll.rotation.x = Math.PI / 2;
      group.add(scroll);

      // Side scrolls
      for (const offset of [-postSpacing * 0.25, postSpacing * 0.25]) {
        const sideScroll = new Mesh(new TorusGeometry(0.05, 0.005, 6, 12), ironMat);
        sideScroll.position.set(cx + offset, scrollY - 0.04, 0);
        sideScroll.rotation.x = Math.PI / 2;
        group.add(sideScroll);
      }
    }
  }

  /** Ranch fence: horizontal rails between posts */
  private addRanchFence(
    group: Group, actualLength: number, height: number,
    numPosts: number, postSpacing: number, railMat: MeshStandardMaterial,
  ): void {
    // 2-4 horizontal rails
    const railCount = 3;
    for (let r = 0; r < railCount; r++) {
      const y = 0.15 + (r / (railCount - 1)) * (height - 0.3);
      const railGeom = new BoxGeometry(actualLength, 0.06, 0.06);
      const rail = new Mesh(railGeom, railMat);
      rail.position.set(0, y, 0);
      rail.castShadow = true;
      group.add(rail);
    }
  }

  // ---------------------------------------------------------------------------
  // Gate
  // ---------------------------------------------------------------------------

  private addGate(
    group: Group, gateWidth: number, height: number, fenceType: string,
    railMat: MeshStandardMaterial, infillMat: MeshStandardMaterial,
  ): void {
    // Gate frame
    const frameThickness = 0.04;
    const gateMat = fenceType === 'wrought_iron'
      ? new MeshStandardMaterial({ color: 0x222222, metalness: 0.65, roughness: 0.5 })
      : railMat;

    // Left stile
    const leftStile = new Mesh(new BoxGeometry(frameThickness, height - 0.1, 0.05), gateMat);
    leftStile.position.set(-gateWidth / 2 + frameThickness / 2, height / 2 - 0.05, 0);
    group.add(leftStile);

    // Right stile
    const rightStile = new Mesh(new BoxGeometry(frameThickness, height - 0.1, 0.05), gateMat);
    rightStile.position.set(gateWidth / 2 - frameThickness / 2, height / 2 - 0.05, 0);
    group.add(rightStile);

    // Top rail
    const topRail = new Mesh(new BoxGeometry(gateWidth, frameThickness, 0.05), gateMat);
    topRail.position.set(0, height - 0.1, 0);
    group.add(topRail);

    // Bottom rail
    const botRail = new Mesh(new BoxGeometry(gateWidth, frameThickness, 0.05), gateMat);
    botRail.position.set(0, 0.1, 0);
    group.add(botRail);

    // Gate infill
    if (fenceType === 'wrought_iron') {
      const barMat = new MeshStandardMaterial({ color: 0x222222, metalness: 0.65, roughness: 0.5 });
      const barCount = Math.floor(gateWidth / 0.1);
      for (let i = 0; i < barCount; i++) {
        const x = -gateWidth / 2 + 0.08 + i * ((gateWidth - 0.16) / Math.max(barCount - 1, 1));
        const bar = new Mesh(new CylinderGeometry(0.008, 0.008, height - 0.25, 6), barMat);
        bar.position.set(x, (height - 0.25) / 2 + 0.1, 0);
        group.add(bar);
        const spear = new Mesh(new ConeGeometry(0.012, 0.03, 4), barMat);
        spear.position.set(x, height - 0.12 + 0.015, 0);
        group.add(spear);
      }
    } else {
      // Simple picket / panel fill
      const fillGeom = new BoxGeometry(gateWidth - 0.1, height - 0.25, 0.03);
      const fill = new Mesh(fillGeom, infillMat);
      fill.position.set(0, height / 2 - 0.05, 0);
      group.add(fill);
    }

    // Hinges (left side)
    const hingeMat = new MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.2 });
    for (const hy of [height * 0.3, height * 0.7]) {
      const hinge = new Mesh(new CylinderGeometry(0.015, 0.015, 0.04, 8), hingeMat);
      hinge.rotation.x = Math.PI / 2;
      hinge.position.set(-gateWidth / 2 - 0.02, hy, 0);
      group.add(hinge);
    }

    // Latch (right side)
    const latch = new Mesh(new BoxGeometry(0.06, 0.03, 0.03), hingeMat);
    latch.position.set(gateWidth / 2 + 0.03, height * 0.5, 0);
    group.add(latch);
  }

  getStylePresets(): Record<string, Partial<FenceParams>> {
    return {
      traditional: { fenceType: 'picket', material: 'wood', picketSpacing: 0.08 },
      modern: { fenceType: 'privacy', material: 'composite', height: 2.0 },
      rustic: { fenceType: 'ranch', material: 'wood', postSpacing: 3.0 },
      farmhouse: { fenceType: 'picket', material: 'white_painted_wood' },
    };
  }
}
