/**
 * BeamGenerator - Procedural beam generation
 * Supports i_beam, box_beam, wood_beam, and decorative types
 * with proper materials for each type
 */
import {
  Group, Mesh, MeshStandardMaterial,
  BoxGeometry, CylinderGeometry, TorusGeometry, ExtrudeGeometry, Shape,
} from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface BeamParams extends BaseGeneratorConfig {
  length: number;
  width: number;
  height: number;
  beamType: 'i_beam' | 'box_beam' | 'wood_beam' | 'decorative';
  material: string;
  hasEndCaps: boolean;
  endCapStyle: 'flat' | 'ornate' | 'bracket';
  style: 'industrial' | 'rustic' | 'modern' | 'traditional';
}

const DEFAULT_PARAMS: BeamParams = {
  length: 4.0,
  width: 0.2,
  height: 0.3,
  beamType: 'i_beam',
  material: 'steel',
  hasEndCaps: false,
  endCapStyle: 'flat',
  style: 'industrial',
};

export class BeamGenerator extends BaseObjectGenerator<BeamParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): BeamParams {
    return { ...DEFAULT_PARAMS };
  }

  // ---------------------------------------------------------------------------
  // Material helper
  // ---------------------------------------------------------------------------

  getBeamMaterial(type: string = 'steel'): MeshStandardMaterial {
    const configs: Record<string, { color: number; metalness: number; roughness: number }> = {
      steel:          { color: 0xaaaaaa, metalness: 0.85, roughness: 0.25 },
      wood:           { color: 0x8b6914, metalness: 0.0,  roughness: 0.75 },
      concrete:       { color: 0x999999, metalness: 0.0,  roughness: 0.85 },
      reclaimed_wood: { color: 0x6b4c2a, metalness: 0.0,  roughness: 0.85 },
      oak:            { color: 0x9b7624, metalness: 0.0,  roughness: 0.65 },
      cast_iron:      { color: 0x444444, metalness: 0.8,  roughness: 0.4 },
    };
    const c = configs[type] ?? configs.steel;
    return new MeshStandardMaterial({ color: c.color, metalness: c.metalness, roughness: c.roughness });
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  generate(params: Partial<BeamParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { length, width, height, beamType, material, hasEndCaps, endCapStyle } = finalParams;

    const beamMat = this.getBeamMaterial(material);

    if (beamType === 'i_beam') {
      this.addIBeam(group, length, width, height, beamMat);
    } else if (beamType === 'box_beam') {
      this.addBoxBeam(group, length, width, height, beamMat);
    } else if (beamType === 'wood_beam') {
      this.addWoodBeam(group, length, width, height, beamMat);
    } else if (beamType === 'decorative') {
      this.addDecorativeBeam(group, length, width, height, beamMat, material);
    }

    // End caps
    if (hasEndCaps) {
      this.addEndCaps(group, length, width, height, endCapStyle, beamMat);
    }

    return group;
  }

  // ---------------------------------------------------------------------------
  // Beam type implementations
  // ---------------------------------------------------------------------------

  private addIBeam(
    group: Group, length: number, width: number, height: number,
    mat: MeshStandardMaterial,
  ): void {
    const flangeThickness = height * 0.15;
    const webThickness = width * 0.3;

    // Top flange
    const topFlange = new Mesh(new BoxGeometry(length, flangeThickness, width), mat);
    topFlange.position.set(0, height / 2 - flangeThickness / 2, 0);
    topFlange.castShadow = true;
    group.add(topFlange);

    // Bottom flange
    const bottomFlange = new Mesh(new BoxGeometry(length, flangeThickness, width), mat);
    bottomFlange.position.set(0, -height / 2 + flangeThickness / 2, 0);
    bottomFlange.castShadow = true;
    group.add(bottomFlange);

    // Web
    const web = new Mesh(new BoxGeometry(length, height - flangeThickness * 2, webThickness), mat);
    web.position.set(0, 0, 0);
    web.castShadow = true;
    group.add(web);

    // Stiffener plates (at intervals along the beam)
    const stiffenerSpacing = length / 4;
    const stiffenerMat = new MeshStandardMaterial({
      color: 0x999999, metalness: 0.85, roughness: 0.3,
    });
    for (let i = 1; i < 4; i++) {
      const x = -length / 2 + i * stiffenerSpacing;
      const stiffener = new Mesh(
        new BoxGeometry(0.01, height - flangeThickness * 2, width), stiffenerMat,
      );
      stiffener.position.set(x, 0, 0);
      group.add(stiffener);
    }
  }

  private addBoxBeam(
    group: Group, length: number, width: number, height: number,
    mat: MeshStandardMaterial,
  ): void {
    // Hollow box beam: 4 walls
    const wallThickness = width * 0.15;

    // Top wall
    const top = new Mesh(new BoxGeometry(length, wallThickness, width), mat);
    top.position.set(0, height / 2 - wallThickness / 2, 0);
    top.castShadow = true;
    group.add(top);

    // Bottom wall
    const bot = new Mesh(new BoxGeometry(length, wallThickness, width), mat);
    bot.position.set(0, -height / 2 + wallThickness / 2, 0);
    bot.castShadow = true;
    group.add(bot);

    // Left wall
    const left = new Mesh(new BoxGeometry(length, height, wallThickness), mat);
    left.position.set(0, 0, -width / 2 + wallThickness / 2);
    left.castShadow = true;
    group.add(left);

    // Right wall
    const right = new Mesh(new BoxGeometry(length, height, wallThickness), mat);
    right.position.set(0, 0, width / 2 - wallThickness / 2);
    right.castShadow = true;
    group.add(right);
  }

  private addWoodBeam(
    group: Group, length: number, width: number, height: number,
    mat: MeshStandardMaterial,
  ): void {
    // Main beam
    const beam = new Mesh(new BoxGeometry(length, height, width), mat);
    beam.castShadow = true;
    group.add(beam);

    // Wood grain lines (thin grooves along length)
    const grainMat = new MeshStandardMaterial({
      color: 0x6b4c1a, metalness: 0.0, roughness: 0.9,
    });
    const grainCount = 4;
    for (let i = 0; i < grainCount; i++) {
      const z = -width / 2 + (i + 0.5) * (width / grainCount);
      const grain = new Mesh(new BoxGeometry(length, 0.003, 0.003), grainMat);
      grain.position.set(0, 0, z);
      group.add(grain);
    }

    // Chamfered edges (small bevel at bottom corners)
    const chamferSize = 0.015;
    const chamferMat = new MeshStandardMaterial({
      color: 0x7a5c22, metalness: 0.0, roughness: 0.8,
    });
    // Bottom left chamfer
    const blChamfer = new Mesh(new BoxGeometry(length, chamferSize * 1.4, chamferSize * 1.4), chamferMat);
    blChamfer.position.set(0, -height / 2 + chamferSize * 0.5, -width / 2 + chamferSize * 0.5);
    blChamfer.rotation.x = Math.PI / 4;
    group.add(blChamfer);
    // Bottom right chamfer
    const brChamfer = new Mesh(new BoxGeometry(length, chamferSize * 1.4, chamferSize * 1.4), chamferMat);
    brChamfer.position.set(0, -height / 2 + chamferSize * 0.5, width / 2 - chamferSize * 0.5);
    brChamfer.rotation.x = Math.PI / 4;
    group.add(brChamfer);
  }

  /** Decorative beam: ogee bottom molding + crown top molding + corbel supports */
  private addDecorativeBeam(
    group: Group, length: number, width: number, height: number,
    mat: MeshStandardMaterial, materialType: string,
  ): void {
    const accentMat = new MeshStandardMaterial({
      color: materialType === 'oak' ? 0x7a5c22 : 0x6b4c2a,
      metalness: 0.0, roughness: 0.7,
    });

    // Main body
    const bodyHeight = height * 0.55;
    const body = new Mesh(new BoxGeometry(length, bodyHeight, width), mat);
    body.position.set(0, height * 0.1, 0);
    body.castShadow = true;
    group.add(body);

    // --- Crown top molding (ogee profile at top) ---
    // Convex torus at top
    const crownRadius = width * 0.15;
    const crownTorus = new TorusGeometry(crownRadius, crownRadius * 0.4, 8, 24);
    const crown = new Mesh(crownTorus, accentMat);
    crown.position.set(0, height * 0.1 + bodyHeight / 2 + crownRadius * 0.6, 0);
    crown.rotation.x = Math.PI / 2;
    group.add(crown);

    // Flat fillet above
    const fillet = new Mesh(new BoxGeometry(length, crownRadius * 0.3, width * 1.1), accentMat);
    fillet.position.set(0, height * 0.1 + bodyHeight / 2 + crownRadius * 1.0, 0);
    group.add(fillet);

    // --- Ogee bottom molding (S-curve profile) ---
    // Built from convex torus + concave transition
    const ogeeRadius = width * 0.12;
    // Convex part of ogee
    const ogeeConvex = new TorusGeometry(ogeeRadius, ogeeRadius * 0.35, 8, 24);
    const ogeeBottom = new Mesh(ogeeConvex, accentMat);
    ogeeBottom.position.set(0, height * 0.1 - bodyHeight / 2 - ogeeRadius * 0.5, 0);
    ogeeBottom.rotation.x = Math.PI / 2;
    group.add(ogeeBottom);

    // Thin fillet below ogee
    const botFillet = new Mesh(new BoxGeometry(length, ogeeRadius * 0.25, width * 1.05), accentMat);
    botFillet.position.set(0, height * 0.1 - bodyHeight / 2 - ogeeRadius * 0.9, 0);
    group.add(botFillet);

    // --- Corbel supports at each end ---
    for (const xSign of [-1, 1]) {
      const cx = xSign * length / 2 * 0.85;
      this.addCorbel(group, cx, mat, accentMat, height, width);
    }
  }

  /** Corbel support: triangular bracket with scrollwork */
  private addCorbel(
    group: Group, x: number, mat: MeshStandardMaterial,
    accentMat: MeshStandardMaterial, beamHeight: number, beamWidth: number,
  ): void {
    const corbelHeight = beamHeight * 0.6;
    const corbelDepth = beamWidth * 0.8;

    // Vertical member
    const vert = new Mesh(new BoxGeometry(0.04, corbelHeight, corbelDepth), mat);
    vert.position.set(x, -corbelHeight / 2, 0);
    group.add(vert);

    // Diagonal brace
    const diagLen = Math.sqrt(corbelHeight * corbelHeight + corbelDepth * corbelDepth) * 0.8;
    const diag = new Mesh(new BoxGeometry(0.03, diagLen, corbelDepth * 0.6), accentMat);
    diag.position.set(x, -corbelHeight * 0.4, corbelDepth * 0.15);
    const angle = Math.atan2(corbelHeight, corbelDepth);
    diag.rotation.x = angle;
    group.add(diag);

    // Bottom scroll
    const scrollGeom = new TorusGeometry(0.03, 0.008, 6, 12);
    const scroll = new Mesh(scrollGeom, accentMat);
    scroll.position.set(x, -corbelHeight + 0.03, corbelDepth / 2);
    scroll.rotation.y = Math.PI / 2;
    group.add(scroll);
  }

  // ---------------------------------------------------------------------------
  // End caps
  // ---------------------------------------------------------------------------

  private addEndCaps(
    group: Group, length: number, width: number, height: number,
    endCapStyle: string, mat: MeshStandardMaterial,
  ): void {
    if (endCapStyle === 'flat') {
      const capSize = width * 1.3;
      for (const xSign of [-1, 1]) {
        const cap = new Mesh(new BoxGeometry(0.05, capSize, capSize), mat);
        cap.position.set(xSign * (length / 2 + 0.025), 0, 0);
        group.add(cap);
      }
    } else if (endCapStyle === 'ornate') {
      const accentMat = new MeshStandardMaterial({
        color: 0x5a3d1a, metalness: 0.0, roughness: 0.65,
      });
      for (const xSign of [-1, 1]) {
        // Ornate end plate
        const plate = new Mesh(new BoxGeometry(0.06, height * 1.2, width * 1.2), accentMat);
        plate.position.set(xSign * (length / 2 + 0.03), 0, 0);
        group.add(plate);

        // Scrollwork on plate
        const scroll1 = new Mesh(new TorusGeometry(0.03, 0.008, 6, 12), accentMat);
        scroll1.position.set(xSign * (length / 2 + 0.065), height * 0.15, 0);
        scroll1.rotation.y = Math.PI / 2;
        group.add(scroll1);

        const scroll2 = new Mesh(new TorusGeometry(0.03, 0.008, 6, 12), accentMat);
        scroll2.position.set(xSign * (length / 2 + 0.065), -height * 0.15, 0);
        scroll2.rotation.y = Math.PI / 2;
        group.add(scroll2);
      }
    } else if (endCapStyle === 'bracket') {
      // Bracket-style end caps (L-shaped)
      const bracketMat = mat;
      for (const xSign of [-1, 1]) {
        const bracket = new Mesh(new BoxGeometry(0.08, height * 0.4, width * 1.4), bracketMat);
        bracket.position.set(xSign * (length / 2 + 0.04), -height * 0.3, 0);
        group.add(bracket);
        const top = new Mesh(new BoxGeometry(0.08, 0.04, width * 1.4), bracketMat);
        top.position.set(xSign * (length / 2 + 0.04), -height * 0.1, 0);
        group.add(top);
      }
    }
  }

  getStylePresets(): Record<string, Partial<BeamParams>> {
    return {
      industrial: { beamType: 'i_beam', material: 'steel', hasEndCaps: false },
      rustic: { beamType: 'wood_beam', material: 'reclaimed_wood', hasEndCaps: true, endCapStyle: 'bracket' },
      modern: { beamType: 'box_beam', material: 'steel', hasEndCaps: false },
      traditional: { beamType: 'decorative', material: 'oak', hasEndCaps: true, endCapStyle: 'ornate' },
    };
  }
}
