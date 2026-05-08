/**
 * RoofGenerator - Procedural roof generation
 * FIX: Gable ends are now triangular (BufferGeometry) instead of rectangular (BoxGeometry)
 * FIX: Dormers now generated when hasDormers is true
 * Added: gable, hip, flat, mansard, gambrel, shed types
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, Color } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface RoofParams extends BaseGeneratorConfig {
  width: number;
  depth: number;
  roofType: 'gable' | 'hip' | 'mansard' | 'gambrel' | 'flat' | 'shed';
  pitch: number;
  overhang: number;
  hasDormers: boolean;
  dormerCount: number;
  hasGutters: boolean;
  material: string;
}

const DEFAULT_PARAMS: RoofParams = {
  width: 8.0,
  depth: 10.0,
  roofType: 'gable',
  pitch: 30,
  overhang: 0.3,
  hasDormers: false,
  dormerCount: 2,
  hasGutters: true,
  material: 'shingle',
};

export class RoofGenerator extends BaseObjectGenerator<RoofParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): RoofParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<RoofParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { width, depth, roofType, pitch, overhang, hasDormers, dormerCount, hasGutters, material } = finalParams;

    const pitchRad = (pitch * Math.PI) / 180;
    const roofHeight = (width / 2 + overhang) * Math.tan(pitchRad);
    const roofMat = this.getRoofMaterial(material);

    if (roofType === 'gable') {
      // Two sloping planes
      const rafterLength = Math.sqrt(Math.pow(width / 2 + overhang, 2) + Math.pow(roofHeight, 2));

      const leftPlane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2), roofMat);
      leftPlane.position.set(-width / 4, roofHeight / 2, 0);
      leftPlane.rotation.z = -pitchRad;
      leftPlane.castShadow = true;
      leftPlane.receiveShadow = true;
      leftPlane.name = 'leftPlane';
      group.add(leftPlane);

      const rightPlane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2), roofMat);
      rightPlane.position.set(width / 4, roofHeight / 2, 0);
      rightPlane.rotation.z = pitchRad;
      rightPlane.castShadow = true;
      rightPlane.receiveShadow = true;
      rightPlane.name = 'rightPlane';
      group.add(rightPlane);

      // Ridge board
      const ridgeMat = this.getRoofMaterial('wood');
      const ridge = new Mesh(new BoxGeometry(0.1, 0.1, depth + overhang * 2), ridgeMat);
      ridge.position.set(0, roofHeight, 0);
      ridge.name = 'ridge';
      group.add(ridge);

      // Gable end triangles (FIXED: triangular BufferGeometry instead of BoxGeometry)
      const gableMat = this.getRoofMaterial('stucco');
      for (const zSide of [-1, 1]) {
        const gableGeo = this.createTriangularGableGeo(width, roofHeight);
        const gable = new Mesh(gableGeo, gableMat);
        gable.position.set(0, 0, zSide * (depth / 2 + overhang));
        gable.name = `gable_${zSide === -1 ? 'front' : 'back'}`;
        gable.castShadow = true;
        group.add(gable);
      }
    } else if (roofType === 'hip') {
      // Four sloping planes
      const rafterLength = Math.sqrt(Math.pow(width / 2 + overhang, 2) + Math.pow(roofHeight, 2));

      const leftPlane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2), roofMat);
      leftPlane.position.set(-width / 4, roofHeight / 2, 0);
      leftPlane.rotation.z = -pitchRad;
      leftPlane.castShadow = true;
      group.add(leftPlane);

      const rightPlane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2), roofMat);
      rightPlane.position.set(width / 4, roofHeight / 2, 0);
      rightPlane.rotation.z = pitchRad;
      rightPlane.castShadow = true;
      group.add(rightPlane);

      // Front and back hip slopes
      const hipRafterLen = Math.sqrt(Math.pow(depth / 2 + overhang, 2) + Math.pow(roofHeight, 2));
      const frontPlane = new Mesh(new BoxGeometry(width + overhang * 2, 0.1, hipRafterLen), roofMat);
      frontPlane.position.set(0, roofHeight / 2, -depth / 4);
      frontPlane.rotation.x = pitchRad;
      frontPlane.castShadow = true;
      group.add(frontPlane);

      const backPlane = new Mesh(new BoxGeometry(width + overhang * 2, 0.1, hipRafterLen), roofMat);
      backPlane.position.set(0, roofHeight / 2, depth / 4);
      backPlane.rotation.x = -pitchRad;
      backPlane.castShadow = true;
      group.add(backPlane);
    } else if (roofType === 'flat') {
      const roofGeom = new BoxGeometry(width + overhang * 2, 0.2, depth + overhang * 2);
      const roof = new Mesh(roofGeom, roofMat);
      roof.position.set(0, 0.1, 0);
      roof.castShadow = true;
      roof.receiveShadow = true;
      roof.name = 'flatRoof';
      group.add(roof);

      // Parapet
      const parapetMat = this.getRoofMaterial('concrete');
      for (const zSide of [-1, 1]) {
        const parapet = new Mesh(new BoxGeometry(width + overhang * 2, 0.4, 0.15), parapetMat);
        parapet.position.set(0, 0.3, zSide * (depth / 2 + overhang));
        parapet.name = `parapet_${zSide === -1 ? 'front' : 'back'}`;
        group.add(parapet);
      }
      for (const xSide of [-1, 1]) {
        const parapet = new Mesh(new BoxGeometry(0.15, 0.4, depth + overhang * 2), parapetMat);
        parapet.position.set(xSide * (width / 2 + overhang), 0.3, 0);
        parapet.name = `parapet_${xSide === -1 ? 'left' : 'right'}`;
        group.add(parapet);
      }
    } else if (roofType === 'shed') {
      const rafterLength = Math.sqrt(Math.pow(width + overhang * 2, 2) + Math.pow(roofHeight, 2));
      const shedAngle = Math.atan2(roofHeight, width);
      const plane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2), roofMat);
      plane.position.set(0, roofHeight / 2, 0);
      plane.rotation.z = shedAngle;
      plane.castShadow = true;
      plane.name = 'shedPlane';
      group.add(plane);
    } else if (roofType === 'mansard') {
      const lowerPitch = (pitch * 1.5) * Math.PI / 180;
      const upperPitch = (pitch * 0.5) * Math.PI / 180;
      const lowerHeight = (width / 2) * Math.tan(lowerPitch) * 0.6;
      const upperHeight = (width / 4) * Math.tan(upperPitch);

      for (const side of [-1, 1]) {
        const lowerLen = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(lowerHeight, 2));
        const lowerPlane = new Mesh(new BoxGeometry(lowerLen, 0.1, depth + overhang * 2), roofMat);
        lowerPlane.position.set(side * width / 4, lowerHeight / 2, 0);
        lowerPlane.rotation.z = side * -lowerPitch;
        lowerPlane.castShadow = true;
        group.add(lowerPlane);
      }

      for (const side of [-1, 1]) {
        const upperLen = Math.sqrt(Math.pow(width / 4, 2) + Math.pow(upperHeight, 2));
        const upperPlane = new Mesh(new BoxGeometry(upperLen, 0.1, depth), roofMat);
        upperPlane.position.set(side * width / 8, lowerHeight + upperHeight / 2, 0);
        upperPlane.rotation.z = side * -upperPitch;
        upperPlane.castShadow = true;
        group.add(upperPlane);
      }
    } else if (roofType === 'gambrel') {
      const upperPitchRad = (pitch * 0.6) * Math.PI / 180;
      const lowerPitchRad = (pitch * 1.4) * Math.PI / 180;
      const upperH = (width / 4) * Math.tan(upperPitchRad);
      const lowerH = (width / 2) * Math.tan(lowerPitchRad) * 0.4;

      for (const side of [-1, 1]) {
        const lowerLen = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(lowerH, 2));
        const lowerPlane = new Mesh(new BoxGeometry(lowerLen, 0.1, depth + overhang * 2), roofMat);
        lowerPlane.position.set(side * width / 4, lowerH / 2, 0);
        lowerPlane.rotation.z = side * -lowerPitchRad;
        lowerPlane.castShadow = true;
        group.add(lowerPlane);

        const upperLen = Math.sqrt(Math.pow(width / 4, 2) + Math.pow(upperH, 2));
        const upperPlane = new Mesh(new BoxGeometry(upperLen, 0.1, depth), roofMat);
        upperPlane.position.set(side * width / 8, lowerH + upperH / 2, 0);
        upperPlane.rotation.z = side * -upperPitchRad;
        upperPlane.castShadow = true;
        group.add(upperPlane);
      }
    }

    // Dormers
    if (hasDormers && (roofType === 'gable' || roofType === 'hip' || roofType === 'mansard' || roofType === 'gambrel')) {
      this.addDormers(group, width, depth, roofHeight, pitchRad, dormerCount, material);
    }

    // Gutters
    if (hasGutters) {
      const gutterMat = new MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.7 });
      for (const side of [-1, 1]) {
        const gutterGeo = new CylinderGeometry(0.05, 0.05, depth + overhang * 2, 8);
        const gutter = new Mesh(gutterGeo, gutterMat);
        gutter.rotation.z = Math.PI / 2;
        gutter.position.set(side * (width / 2 + overhang / 2), -0.05, 0);
        gutter.name = `gutter_${side === -1 ? 'left' : 'right'}`;
        group.add(gutter);
      }

      // Downspouts at corners
      for (const xSide of [-1, 1]) {
        for (const zSide of [-1, 1]) {
          const downspoutGeo = new CylinderGeometry(0.03, 0.03, roofHeight + 0.5, 8);
          const downspout = new Mesh(downspoutGeo, gutterMat);
          downspout.position.set(
            xSide * (width / 2 + overhang * 0.8),
            (roofHeight + 0.5) / 2 - 0.3,
            zSide * (depth / 2 + overhang * 0.8)
          );
          downspout.name = `downspout_${xSide === -1 ? 'L' : 'R'}${zSide === -1 ? 'F' : 'B'}`;
          group.add(downspout);
        }
      }
    }

    return group;
  }

  /**
   * Create triangular gable end geometry using BufferGeometry
   * (was incorrectly using BoxGeometry which produced rectangles)
   */
  private createTriangularGableGeo(width: number, height: number): BufferGeometry {
    // Triangle: bottom-left, bottom-right, top-center
    const positions = new Float32Array([
      -width / 2, 0, 0,  // bottom-left
       width / 2, 0, 0,  // bottom-right
       0,       height, 0, // top-center (peak)
    ]);

    const normals = new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]);

    const uvs = new Float32Array([
      0, 0,
      1, 0,
      0.5, 1,
    ]);

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    return geo;
  }

  /**
   * Add dormers: small gabled structures protruding from roof slope
   * Each dormer has walls, a window, and a mini-roof
   */
  private addDormers(
    group: Group, width: number, depth: number, roofHeight: number,
    pitchRad: number, dormerCount: number, material: string
  ): void {
    const roofMat = this.getRoofMaterial(material);
    const wallMat = this.getRoofMaterial('stucco');
    const glassMat = new MeshStandardMaterial({
      color: 0x88ccff, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.1
    });

    const dormerWidth = Math.min(1.2, width * 0.2);
    const dormerHeight = 0.8;
    const dormerDepth = 0.6;
    const dormerPitch = pitchRad * 0.8;

    // Distribute dormers along the depth
    for (let i = 0; i < dormerCount; i++) {
      const t = dormerCount === 1 ? 0.5 : (i + 0.5) / dormerCount;
      const z = -depth / 2 + t * depth;

      for (const side of [-1, 1]) {
        const dormerGroup = new Group();
        dormerGroup.name = `dormer_${side === -1 ? 'left' : 'right'}_${i}`;

        // Position on the roof slope
        const xOnSlope = side * width / 4;
        const yOnSlope = roofHeight / 2 * (1 - Math.abs(xOnSlope) / (width / 2));

        // Front wall (with window opening)
        const frontWallGeo = new BoxGeometry(dormerWidth, dormerHeight, 0.08);
        const frontWall = new Mesh(frontWallGeo, wallMat);
        frontWall.position.set(0, dormerHeight / 2, dormerDepth / 2);
        frontWall.castShadow = true;
        dormerGroup.add(frontWall);

        // Window in front wall
        const windowWidth = dormerWidth * 0.6;
        const windowHeight = dormerHeight * 0.6;
        const windowGeo = new BoxGeometry(windowWidth, windowHeight, 0.01);
        const windowMesh = new Mesh(windowGeo, glassMat);
        windowMesh.position.set(0, dormerHeight * 0.45, dormerDepth / 2 + 0.04);
        windowMesh.name = 'dormer_window';
        dormerGroup.add(windowMesh);

        // Window frame
        const frameMat = this.getRoofMaterial('wood');
        const ft = 0.03;
        // Top frame
        const topFrame = new Mesh(new BoxGeometry(windowWidth + ft * 2, ft, 0.04), frameMat);
        topFrame.position.set(0, dormerHeight * 0.45 + windowHeight / 2 + ft / 2, dormerDepth / 2 + 0.05);
        dormerGroup.add(topFrame);
        // Bottom frame
        const bottomFrame = new Mesh(new BoxGeometry(windowWidth + ft * 2, ft, 0.04), frameMat);
        bottomFrame.position.set(0, dormerHeight * 0.45 - windowHeight / 2 - ft / 2, dormerDepth / 2 + 0.05);
        dormerGroup.add(bottomFrame);
        // Left frame
        const leftFrame = new Mesh(new BoxGeometry(ft, windowHeight + ft * 2, 0.04), frameMat);
        leftFrame.position.set(-windowWidth / 2 - ft / 2, dormerHeight * 0.45, dormerDepth / 2 + 0.05);
        dormerGroup.add(leftFrame);
        // Right frame
        const rightFrame = new Mesh(new BoxGeometry(ft, windowHeight + ft * 2, 0.04), frameMat);
        rightFrame.position.set(windowWidth / 2 + ft / 2, dormerHeight * 0.45, dormerDepth / 2 + 0.05);
        dormerGroup.add(rightFrame);

        // Back wall
        const backWallGeo = new BoxGeometry(dormerWidth, dormerHeight, 0.08);
        const backWall = new Mesh(backWallGeo, wallMat);
        backWall.position.set(0, dormerHeight / 2, -dormerDepth / 2);
        backWall.castShadow = true;
        dormerGroup.add(backWall);

        // Side walls (triangular - they follow the mini gable)
        const sideWallHeight = dormerHeight;
        for (const wallSide of [-1, 1]) {
          const sideWallGeo = new BoxGeometry(0.08, sideWallHeight, dormerDepth);
          const sideWall = new Mesh(sideWallGeo, wallMat);
          sideWall.position.set(wallSide * dormerWidth / 2, sideWallHeight / 2, 0);
          sideWall.castShadow = true;
          dormerGroup.add(sideWall);
        }

        // Mini gable roof
        const miniRoofHeight = dormerWidth / 2 * Math.tan(dormerPitch);
        const miniRafterLen = Math.sqrt((dormerWidth / 2) ** 2 + miniRoofHeight ** 2);

        for (const roofSide of [-1, 1]) {
          const miniRoofGeo = new BoxGeometry(miniRafterLen, 0.06, dormerDepth + 0.1);
          const miniRoof = new Mesh(miniRoofGeo, roofMat);
          miniRoof.position.set(
            roofSide * dormerWidth / 4,
            dormerHeight + miniRoofHeight / 2,
            0
          );
          miniRoof.rotation.z = roofSide * -dormerPitch;
          miniRoof.castShadow = true;
          dormerGroup.add(miniRoof);
        }

        // Mini ridge
        const miniRidgeGeo = new BoxGeometry(0.05, 0.05, dormerDepth + 0.1);
        const miniRidge = new Mesh(miniRidgeGeo, this.getRoofMaterial('wood'));
        miniRidge.position.set(0, dormerHeight + miniRoofHeight, 0);
        dormerGroup.add(miniRidge);

        // Position the dormer on the roof slope
        const slopeX = side * (width / 4 + dormerDepth / 2 * 0.3);
        const slopeY = roofHeight * (1 - Math.abs(slopeX * 2) / width) * 0.5;
        dormerGroup.position.set(slopeX, slopeY, z);
        dormerGroup.rotation.z = side * -pitchRad * 0.1; // slight tilt matching roof

        group.add(dormerGroup);
      }
    }
  }

  private getRoofMaterial(material: string): MeshStandardMaterial {
    const configs: Record<string, { color: number; roughness: number; metalness: number }> = {
      shingle: { color: 0x555555, roughness: 0.9, metalness: 0.0 },
      tile: { color: 0xb5553a, roughness: 0.8, metalness: 0.0 },
      metal: { color: 0x888888, roughness: 0.3, metalness: 0.7 },
      wood: { color: 0x8b6914, roughness: 0.7, metalness: 0.0 },
      thatch: { color: 0xbdb76b, roughness: 0.95, metalness: 0.0 },
      concrete: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
      stucco: { color: 0xe8dcc8, roughness: 0.85, metalness: 0.0 },
      slate: { color: 0x4a4a5a, roughness: 0.8, metalness: 0.0 },
    };
    const config = configs[material] || configs.shingle;
    return new MeshStandardMaterial({
      color: new Color(config.color),
      roughness: config.roughness,
      metalness: config.metalness,
    });
  }

  getStylePresets(): Record<string, Partial<RoofParams>> {
    return {
      gable_traditional: { roofType: 'gable', pitch: 30, hasGutters: true, hasDormers: false },
      gable_dormers: { roofType: 'gable', pitch: 35, hasDormers: true, dormerCount: 2 },
      hip_modern: { roofType: 'hip', pitch: 20, overhang: 0.5 },
      mansard: { roofType: 'mansard', pitch: 45, hasDormers: true, dormerCount: 3 },
      gambrel: { roofType: 'gambrel', pitch: 35 },
      flat: { roofType: 'flat', pitch: 5 },
    };
  }
}
