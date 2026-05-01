/**
 * CeilingGenerator - Procedural ceiling generation
 * FIX: All ceiling elements are Mesh objects with proper MeshStandardMaterial
 * FIX: Vaulted ceiling type now implemented with parabolic arch
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, Color, DoubleSide } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface CeilingParams extends BaseGeneratorConfig {
  width: number;
  depth: number;
  height: number;
  thickness: number;
  ceilingType: 'flat' | 'coffered' | 'tray' | 'vaulted' | 'beamed';
  beamCount: number;
  beamDepth: number;
  cofferSize: number;
  material: string;
  hasMolding: boolean;
  moldingWidth: number;
}

const DEFAULT_PARAMS: CeilingParams = {
  width: 5.0,
  depth: 5.0,
  height: 3.0,
  thickness: 0.15,
  ceilingType: 'flat',
  beamCount: 4,
  beamDepth: 0.2,
  cofferSize: 0.6,
  material: 'drywall',
  hasMolding: false,
  moldingWidth: 0.1,
};

export class CeilingGenerator extends BaseObjectGenerator<CeilingParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): CeilingParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<CeilingParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { width, depth, height, thickness, ceilingType, beamCount, beamDepth, hasMolding, moldingWidth, material } = finalParams;

    const ceilingMat = this.getCeilingMaterial(material);

    // Main ceiling plane
    const mainGeom = new BoxGeometry(width, thickness, depth);
    const ceiling = new Mesh(mainGeom, ceilingMat);
    ceiling.position.set(0, height - thickness / 2, 0);
    ceiling.receiveShadow = true;
    ceiling.name = 'ceiling';
    group.add(ceiling);

    // Beamed ceiling
    if (ceilingType === 'beamed') {
      const beamMat = this.getCeilingMaterial('wood');
      for (let i = 0; i < beamCount; i++) {
        const x = -width / 2 + (i + 0.5) * (width / beamCount);
        const beamGeom = new BoxGeometry(0.15, beamDepth, depth);
        const beam = new Mesh(beamGeom, beamMat);
        beam.position.set(x, height - thickness - beamDepth / 2, 0);
        beam.castShadow = true;
        beam.name = `beam_${i}`;
        group.add(beam);
      }
    }

    // Coffered ceiling - recessed panels
    if (ceilingType === 'coffered') {
      const beamMat = this.getCeilingMaterial('wood');
      const cofferMat = this.getCeilingMaterial('drywall');
      const coffersPerSide = Math.floor(width / finalParams.cofferSize);

      // Grid beams
      for (let i = 0; i <= coffersPerSide; i++) {
        const x = -width / 2 + i * (width / coffersPerSide);
        const beamGeom = new BoxGeometry(0.08, beamDepth * 0.5, depth);
        const beam = new Mesh(beamGeom, beamMat);
        beam.position.set(x, height - thickness - beamDepth * 0.25, 0);
        beam.castShadow = true;
        group.add(beam);
      }
      for (let i = 0; i <= coffersPerSide; i++) {
        const z = -depth / 2 + i * (depth / coffersPerSide);
        const beamGeom = new BoxGeometry(width, beamDepth * 0.5, 0.08);
        const beam = new Mesh(beamGeom, beamMat);
        beam.position.set(0, height - thickness - beamDepth * 0.25, z);
        beam.castShadow = true;
        group.add(beam);
      }
    }

    // Tray ceiling - recessed center
    if (ceilingType === 'tray') {
      const trayInset = 0.3;
      const trayDepth = 0.15;
      const trayMat = this.getCeilingMaterial(material);
      // Recessed center panel
      const trayGeom = new BoxGeometry(width - trayInset * 2, thickness, depth - trayInset * 2);
      const tray = new Mesh(trayGeom, trayMat);
      tray.position.set(0, height - thickness - trayDepth, 0);
      tray.name = 'tray_center';
      group.add(tray);
      // Side lips
      const lipMat = this.getCeilingMaterial('wood');
      const frontLip = new Mesh(new BoxGeometry(width - trayInset * 2, trayDepth, 0.08), lipMat);
      frontLip.position.set(0, height - thickness - trayDepth / 2, -depth / 2 + trayInset);
      group.add(frontLip);
      const backLip = new Mesh(new BoxGeometry(width - trayInset * 2, trayDepth, 0.08), lipMat);
      backLip.position.set(0, height - thickness - trayDepth / 2, depth / 2 - trayInset);
      group.add(backLip);
      const leftLip = new Mesh(new BoxGeometry(0.08, trayDepth, depth - trayInset * 2), lipMat);
      leftLip.position.set(-width / 2 + trayInset, height - thickness - trayDepth / 2, 0);
      group.add(leftLip);
      const rightLip = new Mesh(new BoxGeometry(0.08, trayDepth, depth - trayInset * 2), lipMat);
      rightLip.position.set(width / 2 - trayInset, height - thickness - trayDepth / 2, 0);
      group.add(rightLip);
    }

    // VAULTED ceiling - parabolic arch cross-section
    if (ceilingType === 'vaulted') {
      this.addVaultedCeiling(group, width, depth, height, thickness, material);
    }

    // Molding
    if (hasMolding) {
      const moldMat = this.getCeilingMaterial('wood');
      // Perimeter molding pieces
      const frontMold = new Mesh(new BoxGeometry(width, 0.08, moldingWidth), moldMat);
      frontMold.position.set(0, height - thickness - 0.04, -depth / 2 + moldingWidth / 2);
      frontMold.name = 'molding_front';
      group.add(frontMold);

      const backMold = new Mesh(new BoxGeometry(width, 0.08, moldingWidth), moldMat);
      backMold.position.set(0, height - thickness - 0.04, depth / 2 - moldingWidth / 2);
      backMold.name = 'molding_back';
      group.add(backMold);

      const leftMold = new Mesh(new BoxGeometry(moldingWidth, 0.08, depth), moldMat);
      leftMold.position.set(-width / 2 + moldingWidth / 2, height - thickness - 0.04, 0);
      leftMold.name = 'molding_left';
      group.add(leftMold);

      const rightMold = new Mesh(new BoxGeometry(moldingWidth, 0.08, depth), moldMat);
      rightMold.position.set(width / 2 - moldingWidth / 2, height - thickness - 0.04, 0);
      rightMold.name = 'molding_right';
      group.add(rightMold);
    }

    return group;
  }

  /**
   * Vaulted ceiling: parabolic arch cross-section
   * Creates multiple arch segment meshes along the length with rib lines
   */
  private addVaultedCeiling(
    group: Group, width: number, depth: number, height: number,
    thickness: number, material: string
  ): void {
    const vaultMat = this.getCeilingMaterial(material);
    const ribMat = this.getCeilingMaterial('wood');
    const vaultHeight = height * 0.5; // how high the arch rises above the flat ceiling
    const archSegments = 12; // number of segments along the arch curve
    const numRibs = Math.max(2, Math.floor(depth / 1.5)); // rib count along length

    // Create the vaulted arch surface as segments along the depth
    const numLengthSegments = Math.max(4, Math.floor(depth / 0.8));
    const lengthStep = depth / numLengthSegments;

    for (let li = 0; li < numLengthSegments; li++) {
      const z0 = -depth / 2 + li * lengthStep;
      const z1 = z0 + lengthStep;

      // Build a curved quad strip for this segment
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      for (let ai = 0; ai <= archSegments; ai++) {
        const t = ai / archSegments; // 0 to 1 across the arch
        const x = -width / 2 + t * width;
        // Parabolic arch: y = vaultHeight * (1 - (2t - 1)^2)
        // This creates an arch that peaks at center (t=0.5) and touches the base at t=0 and t=1
        const archT = 2 * t - 1; // -1 to 1
        const y = vaultHeight * (1 - archT * archT);

        // Compute normal (perpendicular to arch tangent)
        const dx = width / archSegments;
        const dy = vaultHeight * (-2 * archT * 2) * (1 / archSegments); // derivative
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len;
        const ny = dx / len;

        // Two vertices: front and back of this segment
        positions.push(x, y + height - vaultHeight, z0);
        normals.push(nx, ny, 0);
        uvs.push(t, li / numLengthSegments);

        positions.push(x, y + height - vaultHeight, z1);
        normals.push(nx, ny, 0);
        uvs.push(t, (li + 1) / numLengthSegments);
      }

      // Create triangles for this strip
      for (let ai = 0; ai < archSegments; ai++) {
        const base = ai * 2;
        // Triangle 1
        indices.push(base, base + 1, base + 2);
        // Triangle 2
        indices.push(base + 1, base + 3, base + 2);
      }

      const segGeo = new BufferGeometry();
      segGeo.setAttribute('position', new Float32BufferAttribute(positions, 3));
      segGeo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
      segGeo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      segGeo.setIndex(indices);

      const segMesh = new Mesh(segGeo, vaultMat);
      segMesh.receiveShadow = true;
      segMesh.castShadow = true;
      segMesh.name = `vault_segment_${li}`;
      segMesh.material = segMesh.material.clone();
      (segMesh.material as MeshStandardMaterial).side = DoubleSide;
      group.add(segMesh);
    }

    // Add rib lines along the arch (cross-beams at intervals along the depth)
    for (let ri = 0; ri <= numRibs; ri++) {
      const z = -depth / 2 + ri * (depth / numRibs);
      const ribThickness = 0.06;
      const ribDepth = 0.08;

      // Build rib as a series of small boxes following the arch curve
      for (let ai = 0; ai < archSegments; ai++) {
        const t0 = ai / archSegments;
        const t1 = (ai + 1) / archSegments;
        const x0 = -width / 2 + t0 * width;
        const x1 = -width / 2 + t1 * width;
        const archT0 = 2 * t0 - 1;
        const archT1 = 2 * t1 - 1;
        const y0 = vaultHeight * (1 - archT0 * archT0) + height - vaultHeight;
        const y1 = vaultHeight * (1 - archT1 * archT1) + height - vaultHeight;

        const segLen = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
        const segAngle = Math.atan2(y1 - y0, x1 - x0);

        const ribSegGeo = new BoxGeometry(segLen, ribThickness, ribDepth);
        const ribSeg = new Mesh(ribSegGeo, ribMat);
        ribSeg.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
        ribSeg.rotation.z = segAngle;
        ribSeg.castShadow = true;
        ribSeg.name = `vault_rib_${ri}_seg_${ai}`;
        group.add(ribSeg);
      }
    }

    // Wall fill triangles on the two long sides (the triangular gaps between arch base and walls)
    const wallMat = this.getCeilingMaterial('drywall');
    for (const zSide of [-1, 1]) {
      for (let li = 0; li < numLengthSegments; li++) {
        const z0 = -depth / 2 + li * lengthStep;
        const z1 = z0 + lengthStep;
        const wallBaseY = height - vaultHeight;
        const wallTopY = height;

        // Left side wall triangle strip
        if (zSide === -1) {
          const wallGeo = this.createWallTriangle(-width / 2, wallBaseY, -width / 2, wallTopY, z0, z1, 0);
          if (wallGeo) {
            const wallMesh = new Mesh(wallGeo, wallMat);
            wallMesh.receiveShadow = true;
            wallMesh.name = `vault_wall_left_${li}`;
            group.add(wallMesh);
          }
        } else {
          const wallGeo = this.createWallTriangle(width / 2, wallBaseY, width / 2, wallTopY, z0, z1, 0);
          if (wallGeo) {
            const wallMesh = new Mesh(wallGeo, wallMat);
            wallMesh.receiveShadow = true;
            wallMesh.name = `vault_wall_right_${li}`;
            group.add(wallMesh);
          }
        }
      }
    }
  }

  /**
   * Create a wall triangle/fill geometry for vaulted ceiling sides
   */
  private createWallTriangle(
    x: number, baseY: number, topY: number, _peakY: number,
    z0: number, z1: number, _thickness: number
  ): BufferGeometry | null {
    const positions = [
      x, baseY, z0,
      x, topY, z0,
      x, baseY, z1,
      x, baseY, z1,
      x, topY, z0,
      x, topY, z1,
    ];
    const normals = [
      x < 0 ? -1 : 1, 0, 0,
      x < 0 ? -1 : 1, 0, 0,
      x < 0 ? -1 : 1, 0, 0,
      x < 0 ? -1 : 1, 0, 0,
      x < 0 ? -1 : 1, 0, 0,
      x < 0 ? -1 : 1, 0, 0,
    ];
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    return geo;
  }

  private getCeilingMaterial(material: string): MeshStandardMaterial {
    const configs: Record<string, { color: number; roughness: number; metalness: number }> = {
      drywall: { color: 0xeeeeee, roughness: 0.8, metalness: 0.0 },
      wood: { color: 0x8b6914, roughness: 0.65, metalness: 0.0 },
      plaster: { color: 0xf5f0e8, roughness: 0.7, metalness: 0.0 },
      concrete: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
      metal: { color: 0xaaaaaa, roughness: 0.3, metalness: 0.8 },
      stone: { color: 0xbbb8a8, roughness: 0.75, metalness: 0.0 },
    };
    const config = configs[material] || configs.drywall;
    return new MeshStandardMaterial({
      color: new Color(config.color),
      roughness: config.roughness,
      metalness: config.metalness,
    });
  }

  getStylePresets(): Record<string, Partial<CeilingParams>> {
    return {
      flat: { ceilingType: 'flat', hasMolding: false },
      coffered: { ceilingType: 'coffered', cofferSize: 0.8 },
      tray: { ceilingType: 'tray', beamDepth: 0.15 },
      vaulted: { ceilingType: 'vaulted', height: 4.0, material: 'plaster' },
      beamed: { ceilingType: 'beamed', beamCount: 5, material: 'wood' },
    };
  }
}
