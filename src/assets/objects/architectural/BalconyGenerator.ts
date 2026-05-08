/**
 * BalconyGenerator - Procedural balcony generation
 * Supports cantilever, supported, juliet, and wrap_around types
 * with proper materials for floor, railing, and supports
 */
import {
  Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial,
  BoxGeometry, CylinderGeometry, ConeGeometry, DoubleSide,
} from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface BalconyParams extends BaseGeneratorConfig {
  width: number;
  depth: number;
  railingHeight: number;
  balconyType: 'cantilever' | 'supported' | 'juliet' | 'wrap_around';
  supportType: 'bracket' | 'column' | 'cable';
  railingStyle: 'glass' | 'metal' | 'wood' | 'wrought_iron';
  postSpacing: number;
  floorMaterial: string;
  railingMaterial: string;
  wrapDepth: number; // depth of the side portion for wrap_around
}

const DEFAULT_PARAMS: BalconyParams = {
  width: 3.0,
  depth: 1.5,
  railingHeight: 1.0,
  balconyType: 'cantilever',
  supportType: 'bracket',
  railingStyle: 'metal',
  postSpacing: 0.15,
  floorMaterial: 'wood',
  railingMaterial: 'steel',
  wrapDepth: 1.0,
};

export class BalconyGenerator extends BaseObjectGenerator<BalconyParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): BalconyParams {
    return { ...DEFAULT_PARAMS };
  }

  // ---------------------------------------------------------------------------
  // Material helpers
  // ---------------------------------------------------------------------------

  getFloorMaterial(type: string = 'wood'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      wood:     { color: 0x8b6914, metalness: 0.0,  roughness: 0.7 },
      concrete: { color: 0x999999, metalness: 0.0,  roughness: 0.85 },
      stone:    { color: 0xaaaaaa, metalness: 0.0,  roughness: 0.6 },
      tile:     { color: 0xccbbaa, metalness: 0.0,  roughness: 0.5 },
      metal:    { color: 0x888888, metalness: 0.85, roughness: 0.25 },
      composite: { color: 0x7a6b55, metalness: 0.0, roughness: 0.75 },
    };
    const c = configs[type] ?? configs.wood;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  getRailingMaterial(type: string = 'steel'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      steel:        { color: 0xaaaaaa, metalness: 0.85, roughness: 0.2 },
      aluminum:     { color: 0xcccccc, metalness: 0.9,  roughness: 0.15 },
      wood:         { color: 0x9b7624, metalness: 0.0,  roughness: 0.65 },
      wrought_iron: { color: 0x2a2a2a, metalness: 0.7,  roughness: 0.4 },
      glass:        { color: 0xaaccff, metalness: 0.0,  roughness: 0.05 },
    };
    const c = configs[type] ?? configs.steel;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  generate(params: Partial<BalconyParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const {
      width, depth, railingHeight, balconyType, supportType,
      railingStyle, postSpacing, floorMaterial, railingMaterial, wrapDepth,
    } = finalParams;

    const floorMat = this.getFloorMaterial(floorMaterial);
    const railMat  = this.getRailingMaterial(railingMaterial);

    // -----------------------------------------------------------------------
    // Build per type
    // -----------------------------------------------------------------------
    if (balconyType === 'juliet') {
      this.buildJuliet(group, width, railingHeight, railingStyle, railMat);
    } else if (balconyType === 'wrap_around') {
      this.buildWrapAround(group, width, depth, railingHeight, supportType,
        railingStyle, postSpacing, floorMat, railMat, wrapDepth);
    } else {
      // cantilever or supported
      this.buildStandard(group, width, depth, railingHeight, balconyType,
        supportType, railingStyle, postSpacing, floorMat, railMat);
    }

    return group;
  }

  // ---------------------------------------------------------------------------
  // Juliet balcony — floor bar + railing only, no deck
  // ---------------------------------------------------------------------------

  private buildJuliet(
    group: Group, width: number, railingHeight: number,
    railingStyle: string, railMat: MeshStandardMaterial,
  ): void {
    // Floor bar (thin bar bolted to wall — no deck)
    const floorBarMat = new MeshStandardMaterial({ color: 0x333333, metalness: 0.75, roughness: 0.35 });
    const floorBar = new Mesh(new BoxGeometry(width, 0.04, 0.06), floorBarMat);
    floorBar.position.set(0, 0.02, 0);
    floorBar.castShadow = true;
    group.add(floorBar);

    // Railing posts
    const numPosts = Math.floor(width / 0.3) + 1;
    for (let i = 0; i < numPosts; i++) {
      const x = -width / 2 + i * (width / (numPosts - 1));
      const post = new Mesh(new CylinderGeometry(0.015, 0.015, railingHeight, 8), railMat);
      post.position.set(x, 0.04 + railingHeight / 2, 0);
      group.add(post);
    }

    // Top rail
    const topRail = new Mesh(new CylinderGeometry(0.02, 0.02, width, 12), railMat);
    topRail.rotation.z = Math.PI / 2;
    topRail.position.set(0, 0.04 + railingHeight, 0);
    group.add(topRail);

    // Infill
    if (railingStyle === 'glass') {
      const glassMat = new MeshPhysicalMaterial({
        color: 0xaaccff, transparent: true, opacity: 0.3,
        roughness: 0.05, metalness: 0.0, transmission: 0.9,
        ior: 1.5, thickness: 0.005, side: DoubleSide, depthWrite: false,
      });
      const panel = new Mesh(new BoxGeometry(width - 0.04, railingHeight - 0.08, 0.006), glassMat);
      panel.position.set(0, 0.04 + railingHeight / 2, 0);
      group.add(panel);
    } else if (railingStyle === 'wrought_iron') {
      // Vertical bars with scrollwork
      const barMat = new MeshStandardMaterial({ color: 0x222222, metalness: 0.65, roughness: 0.5 });
      const barCount = Math.floor(width / 0.12);
      for (let i = 0; i < barCount; i++) {
        const x = -width / 2 + 0.06 + i * ((width - 0.12) / Math.max(barCount - 1, 1));
        const bar = new Mesh(new CylinderGeometry(0.008, 0.008, railingHeight - 0.08, 6), barMat);
        bar.position.set(x, 0.04 + (railingHeight - 0.08) / 2 + 0.04, 0);
        group.add(bar);
        // Spear top
        const spear = new Mesh(new ConeGeometry(0.012, 0.03, 4), barMat);
        spear.position.set(x, 0.04 + railingHeight - 0.04 + 0.015, 0);
        group.add(spear);
      }
    } else {
      // Metal vertical bars
      const barCount = Math.floor(width / 0.1);
      for (let i = 0; i < barCount; i++) {
        const x = -width / 2 + 0.05 + i * ((width - 0.1) / Math.max(barCount - 1, 1));
        const bar = new Mesh(new CylinderGeometry(0.006, 0.006, railingHeight - 0.08, 6), railMat);
        bar.position.set(x, 0.04 + (railingHeight - 0.08) / 2 + 0.04, 0);
        group.add(bar);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Standard balcony (cantilever / supported)
  // ---------------------------------------------------------------------------

  private buildStandard(
    group: Group, width: number, depth: number, railingHeight: number,
    balconyType: string, supportType: string, railingStyle: string,
    postSpacing: number, floorMat: MeshStandardMaterial, railMat: MeshStandardMaterial,
  ): void {
    // Floor platform
    const floorGeom = new BoxGeometry(width, 0.1, depth);
    const floor = new Mesh(floorGeom, floorMat);
    floor.position.set(0, 0.05, 0);
    floor.castShadow = true;
    floor.receiveShadow = true;
    group.add(floor);

    // Supports
    if (balconyType === 'supported') {
      this.addSupports(group, width, depth, supportType, railMat);
    } else {
      // Cantilever: bracket always
      this.addBrackets(group, width, depth, railMat);
    }

    // Railing
    this.addRailing(group, width, depth, railingHeight, railingStyle, postSpacing, railMat);
  }

  // ---------------------------------------------------------------------------
  // Wrap-around balcony — L-shaped or U-shaped deck wrapping a corner
  // ---------------------------------------------------------------------------

  private buildWrapAround(
    group: Group, width: number, depth: number, railingHeight: number,
    supportType: string, railingStyle: string, postSpacing: number,
    floorMat: MeshStandardMaterial, railMat: MeshStandardMaterial,
    wrapDepth: number,
  ): void {
    // Front deck
    const frontFloor = new Mesh(new BoxGeometry(width, 0.1, depth), floorMat);
    frontFloor.position.set(0, 0.05, 0);
    frontFloor.castShadow = true;
    frontFloor.receiveShadow = true;
    group.add(frontFloor);

    // Side deck (extending in +x direction — L-shape)
    const sideFloor = new Mesh(new BoxGeometry(wrapDepth, 0.1, depth), floorMat);
    sideFloor.position.set(width / 2 + wrapDepth / 2, 0.05, 0);
    sideFloor.castShadow = true;
    sideFloor.receiveShadow = true;
    group.add(sideFloor);

    // Supports under front
    this.addSupports(group, width, depth, supportType, railMat);
    // Supports under side
    const sideSupportGeom = new CylinderGeometry(0.08, 0.08, 0.05, 16);
    const sideCol1 = new Mesh(sideSupportGeom, railMat);
    sideCol1.position.set(width / 2 + wrapDepth - 0.1, 0.025, -depth / 2 + 0.1);
    group.add(sideCol1);
    const sideCol2 = new Mesh(sideSupportGeom, railMat);
    sideCol2.position.set(width / 2 + wrapDepth - 0.1, 0.025, depth / 2 - 0.1);
    group.add(sideCol2);

    // Front railing
    this.addRailing(group, width, depth, railingHeight, railingStyle, postSpacing, railMat);

    // Side railing (along the +x side deck, two edges: outer + far end)
    // Outer long edge (along Z)
    const sideOuterPosts = Math.floor(depth / postSpacing) + 1;
    for (let i = 0; i < sideOuterPosts; i++) {
      const z = -depth / 2 + i * (depth / (sideOuterPosts - 1));
      const post = new Mesh(new CylinderGeometry(0.03, 0.03, railingHeight, 8), railMat);
      post.position.set(width / 2 + wrapDepth, 0.05 + railingHeight / 2, z);
      group.add(post);
    }
    // Outer top rail
    const sideOuterRail = new Mesh(new CylinderGeometry(0.04, 0.04, depth, 12), railMat);
    sideOuterRail.rotation.x = Math.PI / 2;
    sideOuterRail.position.set(width / 2 + wrapDepth, 0.05 + railingHeight, 0);
    group.add(sideOuterRail);

    // Far end short edge (along X)
    const farPosts = Math.floor(wrapDepth / postSpacing) + 1;
    for (let i = 0; i < farPosts; i++) {
      const x = width / 2 + i * (wrapDepth / (farPosts - 1));
      const post = new Mesh(new CylinderGeometry(0.03, 0.03, railingHeight, 8), railMat);
      post.position.set(x, 0.05 + railingHeight / 2, depth / 2);
      group.add(post);
    }
    const farRail = new Mesh(new CylinderGeometry(0.04, 0.04, wrapDepth, 12), railMat);
    farRail.rotation.z = Math.PI / 2;
    farRail.position.set(width / 2 + wrapDepth / 2, 0.05 + railingHeight, depth / 2);
    group.add(farRail);
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  private addSupports(
    group: Group, width: number, depth: number,
    supportType: string, railMat: MeshStandardMaterial,
  ): void {
    if (supportType === 'column') {
      const colGeom = new CylinderGeometry(0.08, 0.08, 2.5, 16);
      const positions = [
        [-width / 2 + 0.1, -1.25, -depth / 2 + 0.1],
        [width / 2 - 0.1, -1.25, -depth / 2 + 0.1],
        [-width / 2 + 0.1, -1.25, depth / 2 - 0.1],
        [width / 2 - 0.1, -1.25, depth / 2 - 0.1],
      ];
      for (const [x, y, z] of positions) {
        const col = new Mesh(colGeom, railMat);
        col.position.set(x, y, z);
        col.castShadow = true;
        group.add(col);
      }
    } else if (supportType === 'cable') {
      // Diagonal rod supports (cable-stayed)
      const cableMat = new MeshStandardMaterial({ color: 0x666666, metalness: 0.9, roughness: 0.15 });
      const cableGeom = new CylinderGeometry(0.015, 0.015, 2.8, 8);
      const leftCable = new Mesh(cableGeom, cableMat);
      leftCable.position.set(-width / 2 + 0.15, -1.2, 0);
      leftCable.rotation.z = -0.15;
      group.add(leftCable);
      const rightCable = new Mesh(cableGeom, cableMat);
      rightCable.position.set(width / 2 - 0.15, -1.2, 0);
      rightCable.rotation.z = 0.15;
      group.add(rightCable);
    } else {
      this.addBrackets(group, width, depth, railMat);
    }
  }

  private addBrackets(
    group: Group, width: number, depth: number, railMat: MeshStandardMaterial,
  ): void {
    // Bracket: vertical plate + diagonal brace
    const bracketMat = railMat;
    const vPlateGeom = new BoxGeometry(0.08, 0.3, depth * 0.8);
    const dBraceGeom = new BoxGeometry(0.06, 0.5, depth * 0.6);

    const leftV = new Mesh(vPlateGeom, bracketMat);
    leftV.position.set(-width / 2 + 0.1, -0.15, 0);
    group.add(leftV);

    const leftD = new Mesh(dBraceGeom, bracketMat);
    leftD.position.set(-width / 2 + 0.25, -0.2, 0);
    leftD.rotation.z = -0.6;
    group.add(leftD);

    const rightV = new Mesh(vPlateGeom, bracketMat);
    rightV.position.set(width / 2 - 0.1, -0.15, 0);
    group.add(rightV);

    const rightD = new Mesh(dBraceGeom, bracketMat);
    rightD.position.set(width / 2 - 0.25, -0.2, 0);
    rightD.rotation.z = 0.6;
    group.add(rightD);
  }

  private addRailing(
    group: Group, width: number, depth: number, railingHeight: number,
    railingStyle: string, postSpacing: number, railMat: MeshStandardMaterial,
  ): void {
    const floorTop = 0.1;

    // Front railing (along X at z = depth/2)
    const numFrontPosts = Math.floor(width / postSpacing) + 1;
    for (let i = 0; i < numFrontPosts; i++) {
      const x = -width / 2 + i * postSpacing;
      const post = new Mesh(new CylinderGeometry(0.03, 0.03, railingHeight, 8), railMat);
      post.position.set(x, floorTop + railingHeight / 2, depth / 2);
      group.add(post);
    }
    // Front top rail
    const frontRail = new Mesh(new CylinderGeometry(0.04, 0.04, width, 16), railMat);
    frontRail.rotation.z = Math.PI / 2;
    frontRail.position.set(0, floorTop + railingHeight, depth / 2);
    group.add(frontRail);

    // Side railings
    for (const sideZ of [-1, 1]) {
      const z = sideZ === 1 ? depth / 2 : -depth / 2;
      // We already have front posts; add side posts along Z
      const numSidePosts = Math.max(2, Math.floor(depth / postSpacing) + 1);
      for (let i = 1; i < numSidePosts; i++) {
        const pz = -depth / 2 + i * (depth / (numSidePosts - 1));
        const post = new Mesh(new CylinderGeometry(0.03, 0.03, railingHeight, 8), railMat);
        post.position.set(sideZ === 1 ? width / 2 : -width / 2, floorTop + railingHeight / 2, pz);
        group.add(post);
      }
      // Side top rail
      const sideRail = new Mesh(new CylinderGeometry(0.04, 0.04, depth, 12), railMat);
      sideRail.rotation.x = Math.PI / 2;
      sideRail.position.set(sideZ === 1 ? width / 2 : -width / 2, floorTop + railingHeight, 0);
      group.add(sideRail);
    }

    // Glass panels (if glass style)
    if (railingStyle === 'glass') {
      const glassMat = new MeshPhysicalMaterial({
        color: 0xaaccff, transparent: true, opacity: 0.3,
        roughness: 0.05, metalness: 0.0, transmission: 0.9,
        ior: 1.5, thickness: 0.008, side: DoubleSide, depthWrite: false,
      });
      // Front glass
      const frontGlass = new Mesh(
        new BoxGeometry(width - 0.06, railingHeight - 0.1, 0.008), glassMat,
      );
      frontGlass.position.set(0, floorTop + railingHeight / 2, depth / 2);
      group.add(frontGlass);
      // Side glasses
      for (const sideSign of [-1, 1]) {
        const sx = sideSign === 1 ? width / 2 : -width / 2;
        const sideGlass = new Mesh(
          new BoxGeometry(0.008, railingHeight - 0.1, depth - 0.06), glassMat,
        );
        sideGlass.position.set(sx, floorTop + railingHeight / 2, 0);
        group.add(sideGlass);
      }
    }
  }

  getStylePresets(): Record<string, Partial<BalconyParams>> {
    return {
      modern: { balconyType: 'cantilever', railingStyle: 'glass', floorMaterial: 'concrete' },
      traditional: { balconyType: 'supported', railingStyle: 'wrought_iron', supportType: 'column' },
      rustic: { balconyType: 'supported', railingStyle: 'wood', supportType: 'bracket' },
      juliet: { balconyType: 'juliet', depth: 0.3, railingStyle: 'wrought_iron' },
    };
  }
}
