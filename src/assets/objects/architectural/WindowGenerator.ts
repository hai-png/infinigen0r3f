/**
 * Procedural Window Generator for Infinigen R3F
 * Generates various window types: casement, double-hung, sliding, bay, skylight, arched
 * FIX: Each window type now produces distinct geometry
 */

import {
  Group, Mesh, BoxGeometry, CylinderGeometry, BufferGeometry,
  Float32BufferAttribute, MeshStandardMaterial, Color, Vector3
} from 'three';
import { SeededRandom } from '../../../core/util/math/index';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface WindowParams extends BaseGeneratorConfig {
  width: number;
  height: number;
  depth: number;
  type: 'casement' | 'double-hung' | 'sliding' | 'bay' | 'skylight' | 'arched';
  style: 'modern' | 'traditional' | 'industrial' | 'rustic' | 'victorian';
  paneCount: number;
  hasShutters: boolean;
  frameMaterial: 'wood' | 'metal' | 'vinyl' | 'aluminum';
  glassType: 'clear' | 'frosted' | 'tinted' | 'stained';
  sillDepth: number;
}

export class WindowGenerator extends BaseObjectGenerator<WindowParams> {
  public getDefaultConfig(): WindowParams {
    return {
      width: 1.2 + this.rng.range(-0.3, 0.6),
      height: 1.5 + this.rng.range(-0.3, 0.8),
      depth: 0.15 + this.rng.range(0, 0.1),
      type: this.rng.choice(['casement', 'double-hung', 'sliding', 'bay', 'skylight', 'arched']),
      style: this.rng.choice(['modern', 'traditional', 'industrial', 'rustic', 'victorian']),
      paneCount: this.rng.int(2, 12),
      hasShutters: this.rng.boolean(0.4),
      frameMaterial: this.rng.choice(['wood', 'metal', 'vinyl', 'aluminum']),
      glassType: this.rng.choice(['clear', 'frosted', 'tinted', 'stained']),
      sillDepth: 0.1 + this.rng.range(0, 0.15),
    };
  }

  generate(params?: Partial<WindowParams>): Group {
    const finalParams = { ...this.getDefaultConfig(), ...params };
    return this.createWindow(finalParams);
  }

  private createWindow(params: WindowParams): Group {
    const group = new Group();

    switch (params.type) {
      case 'casement':
        this.createCasementWindow(group, params);
        break;
      case 'double-hung':
        this.createDoubleHungWindow(group, params);
        break;
      case 'sliding':
        this.createSlidingWindow(group, params);
        break;
      case 'bay':
        this.createBayWindow(group, params);
        break;
      case 'skylight':
        this.createSkylightWindow(group, params);
        break;
      case 'arched':
        this.createArchedWindow(group, params);
        break;
    }

    // Add shutters if specified (not for bay, skylight, arched)
    if (params.hasShutters && params.type !== 'bay' && params.type !== 'skylight') {
      const shutters = this.createShutters(params);
      shutters.forEach(s => group.add(s));
    }

    // Add window sill (not for skylight)
    if (params.type !== 'skylight') {
      const sill = this.createSill(params);
      group.add(sill);
    }

    return group;
  }

  // ===== CASEMENT: Side-hinged panel(s) that open outward =====
  private createCasementWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06; // frame thickness
    const { width, height, depth } = params;

    // Outer frame (4 bars)
    this.addRectFrame(group, width, height, depth, ft, frameMat);

    // Two side-hinged panels with center mullion
    const panelWidth = (width - ft * 3) / 2;
    const panelHeight = height - ft * 2;
    const glassThickness = 0.01;

    // Center mullion
    const mullionGeo = new BoxGeometry(ft, panelHeight, depth);
    const mullion = new Mesh(mullionGeo, frameMat);
    mullion.position.set(0, 0, 0);
    mullion.castShadow = true;
    group.add(mullion);

    // Left panel (hinged on left side, swings outward)
    const leftPanelGroup = new Group();
    leftPanelGroup.name = 'casement_left_panel';

    // Panel frame
    const lft = 0.03; // panel frame thickness
    const leftTopBar = new Mesh(new BoxGeometry(panelWidth, lft, depth * 0.6), frameMat);
    leftTopBar.position.set(panelWidth / 2, panelHeight / 2 - lft / 2, 0);
    leftPanelGroup.add(leftTopBar);
    const leftBottomBar = new Mesh(new BoxGeometry(panelWidth, lft, depth * 0.6), frameMat);
    leftBottomBar.position.set(panelWidth / 2, -panelHeight / 2 + lft / 2, 0);
    leftPanelGroup.add(leftBottomBar);
    const leftRightBar = new Mesh(new BoxGeometry(lft, panelHeight, depth * 0.6), frameMat);
    leftRightBar.position.set(panelWidth - lft / 2, 0, 0);
    leftPanelGroup.add(leftRightBar);
    const leftLeftBar = new Mesh(new BoxGeometry(lft, panelHeight, depth * 0.6), frameMat);
    leftLeftBar.position.set(lft / 2, 0, 0);
    leftPanelGroup.add(leftLeftBar);

    // Glass pane
    const leftGlass = new Mesh(
      new BoxGeometry(panelWidth - lft * 2, panelHeight - lft * 2, glassThickness),
      glassMat
    );
    leftGlass.position.set(panelWidth / 2, 0, 0);
    leftPanelGroup.add(leftGlass);

    // Hinge point at left edge of left panel
    leftPanelGroup.position.set(-width / 2 + ft, 0, 0);
    // Slight outward rotation to show it's a casement
    leftPanelGroup.rotation.y = 0.15;
    group.add(leftPanelGroup);

    // Right panel (hinged on right side)
    const rightPanelGroup = new Group();
    rightPanelGroup.name = 'casement_right_panel';

    const rightTopBar = new Mesh(new BoxGeometry(panelWidth, lft, depth * 0.6), frameMat);
    rightTopBar.position.set(-panelWidth / 2, panelHeight / 2 - lft / 2, 0);
    rightPanelGroup.add(rightTopBar);
    const rightBottomBar = new Mesh(new BoxGeometry(panelWidth, lft, depth * 0.6), frameMat);
    rightBottomBar.position.set(-panelWidth / 2, -panelHeight / 2 + lft / 2, 0);
    rightPanelGroup.add(rightBottomBar);
    const rightLeftBar = new Mesh(new BoxGeometry(lft, panelHeight, depth * 0.6), frameMat);
    rightLeftBar.position.set(-panelWidth + lft / 2, 0, 0);
    rightPanelGroup.add(rightLeftBar);
    const rightRightBar = new Mesh(new BoxGeometry(lft, panelHeight, depth * 0.6), frameMat);
    rightRightBar.position.set(-lft / 2, 0, 0);
    rightPanelGroup.add(rightRightBar);

    const rightGlass = new Mesh(
      new BoxGeometry(panelWidth - lft * 2, panelHeight - lft * 2, glassThickness),
      glassMat
    );
    rightGlass.position.set(-panelWidth / 2, 0, 0);
    rightPanelGroup.add(rightGlass);

    rightPanelGroup.position.set(width / 2 - ft, 0, 0);
    rightPanelGroup.rotation.y = -0.15;
    group.add(rightPanelGroup);

    // Handle/knob in center
    const handleMat = new MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const handleGeo = new CylinderGeometry(0.015, 0.015, 0.08, 8);
    const handle = new Mesh(handleGeo, handleMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(ft / 2 + 0.02, 0, depth / 2 + 0.04);
    group.add(handle);
  }

  // ===== DOUBLE-HUNG: Two sashes, meeting rail in middle =====
  private createDoubleHungWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06;
    const { width, height, depth } = params;

    // Outer frame
    this.addRectFrame(group, width, height, depth, ft, frameMat);

    const sashWidth = width - ft * 2;
    const sashHeight = (height - ft * 2) / 2 - 0.02; // slight gap for meeting rail
    const sashFt = 0.03;
    const glassThickness = 0.01;

    // Bottom sash (slides up)
    const bottomSash = new Group();
    bottomSash.name = 'double_hung_bottom_sash';
    // Sash frame
    this.addPanelFrame(bottomSash, sashWidth, sashHeight, sashFt, depth * 0.6, frameMat);
    // Glass
    const bottomGlass = new Mesh(
      new BoxGeometry(sashWidth - sashFt * 2, sashHeight - sashFt * 2, glassThickness),
      glassMat
    );
    bottomSash.add(bottomGlass);
    bottomSash.position.set(0, -sashHeight / 2 - ft / 2 + 0.01, 0);
    group.add(bottomSash);

    // Top sash (slides down)
    const topSash = new Group();
    topSash.name = 'double_hung_top_sash';
    this.addPanelFrame(topSash, sashWidth, sashHeight, sashFt, depth * 0.6, frameMat);
    const topGlass = new Mesh(
      new BoxGeometry(sashWidth - sashFt * 2, sashHeight - sashFt * 2, glassThickness),
      glassMat
    );
    topSash.add(topGlass);
    topSash.position.set(0, sashHeight / 2 + ft / 2 - 0.01, 0);
    group.add(topSash);

    // Meeting rail (horizontal bar in the middle where the two sashes meet)
    const meetingRailGeo = new BoxGeometry(sashWidth, 0.03, depth * 0.7);
    const meetingRail = new Mesh(meetingRailGeo, frameMat);
    meetingRail.position.set(0, 0, 0);
    meetingRail.castShadow = true;
    meetingRail.name = 'meeting_rail';
    group.add(meetingRail);

    // Lock on meeting rail
    const lockMat = new MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const lockGeo = new BoxGeometry(0.04, 0.025, 0.03);
    const lock = new Mesh(lockGeo, lockMat);
    lock.position.set(0, 0.015, depth / 2 + 0.015);
    group.add(lock);
  }

  // ===== SLIDING: Horizontal sliding panels (left/right offset) =====
  private createSlidingWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06;
    const { width, height, depth } = params;

    // Outer frame
    this.addRectFrame(group, width, height, depth, ft, frameMat);

    const panelWidth = width - ft * 2;
    const panelHeight = height - ft * 2;
    const panelFt = 0.03;
    const glassThickness = 0.01;

    // Left panel (slightly behind)
    const leftPanel = new Group();
    leftPanel.name = 'sliding_left_panel';
    this.addPanelFrame(leftPanel, panelWidth, panelHeight, panelFt, depth * 0.4, frameMat);
    const leftGlass = new Mesh(
      new BoxGeometry(panelWidth - panelFt * 2, panelHeight - panelFt * 2, glassThickness),
      glassMat
    );
    leftPanel.add(leftGlass);
    leftPanel.position.set(-panelWidth * 0.15, 0, -0.02);
    group.add(leftPanel);

    // Right panel (slightly in front, offset to the right)
    const rightPanel = new Group();
    rightPanel.name = 'sliding_right_panel';
    this.addPanelFrame(rightPanel, panelWidth, panelHeight, panelFt, depth * 0.4, frameMat);
    const rightGlass = new Mesh(
      new BoxGeometry(panelWidth - panelFt * 2, panelHeight - panelFt * 2, glassThickness),
      glassMat
    );
    rightPanel.add(rightGlass);
    rightPanel.position.set(panelWidth * 0.15, 0, 0.02);
    group.add(rightPanel);

    // Horizontal interlock where panels overlap
    const interlockGeo = new BoxGeometry(0.02, panelHeight, depth * 0.5);
    const interlock = new Mesh(interlockGeo, frameMat);
    interlock.position.set(panelWidth * 0.15 - panelWidth / 2 + panelFt, 0, 0);
    interlock.name = 'interlock';
    group.add(interlock);

    // Handle
    const handleMat = new MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const handleGeo = new BoxGeometry(0.06, 0.025, 0.025);
    const handle = new Mesh(handleGeo, handleMat);
    handle.position.set(panelWidth * 0.15 - panelWidth / 4, 0, depth / 2 + 0.01);
    group.add(handle);
  }

  // ===== BAY: Three angled panes projecting outward =====
  private createBayWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06;
    const { width, height, depth } = params;

    const bayProjection = 0.4 + width * 0.15; // how far the bay extends
    const sideAngle = Math.PI / 6; // ~30 degrees
    const sidePanelWidth = width * 0.35;
    const centerPanelWidth = width * 0.4;

    // Center pane - flat, projected forward
    const centerFrame = new Group();
    this.addRectFrame(centerFrame, centerPanelWidth, height, depth, ft, frameMat);
    const centerGlass = new Mesh(
      new BoxGeometry(centerPanelWidth - ft * 2, height - ft * 2, 0.01),
      glassMat
    );
    centerFrame.add(centerGlass);
    centerFrame.position.set(0, 0, bayProjection);
    group.add(centerFrame);

    // Left side pane - angled
    const leftFrame = new Group();
    this.addRectFrame(leftFrame, sidePanelWidth, height, depth, ft, frameMat);
    const leftGlass = new Mesh(
      new BoxGeometry(sidePanelWidth - ft * 2, height - ft * 2, 0.01),
      glassMat
    );
    leftFrame.add(leftGlass);
    leftFrame.position.set(-centerPanelWidth / 2 - sidePanelWidth / 2 * Math.cos(sideAngle), 0, bayProjection / 2);
    leftFrame.rotation.y = sideAngle;
    group.add(leftFrame);

    // Right side pane - angled
    const rightFrame = new Group();
    this.addRectFrame(rightFrame, sidePanelWidth, height, depth, ft, frameMat);
    const rightGlass = new Mesh(
      new BoxGeometry(sidePanelWidth - ft * 2, height - ft * 2, 0.01),
      glassMat
    );
    rightFrame.add(rightGlass);
    rightFrame.position.set(centerPanelWidth / 2 + sidePanelWidth / 2 * Math.cos(sideAngle), 0, bayProjection / 2);
    rightFrame.rotation.y = -sideAngle;
    group.add(rightFrame);

    // Side walls connecting bay to wall
    const wallMat = new MeshStandardMaterial({ color: this.getFrameColor(params), roughness: 0.7 });
    const sideWallWidth = bayProjection / Math.cos(sideAngle);
    for (const side of [-1, 1]) {
      const wallGeo = new BoxGeometry(0.05, height, sideWallWidth);
      const wall = new Mesh(wallGeo, wallMat);
      wall.position.set(side * (centerPanelWidth / 2 + 0.025), 0, bayProjection / 2);
      wall.rotation.y = side * sideAngle;
      wall.castShadow = true;
      group.add(wall);
    }

    // Top shelf/seat board
    const topBoardGeo = new BoxGeometry(centerPanelWidth + sidePanelWidth * 2 * Math.cos(sideAngle) + 0.1, 0.04, bayProjection + 0.05);
    const topBoard = new Mesh(topBoardGeo, wallMat);
    topBoard.position.set(0, height / 2 + 0.02, bayProjection / 2);
    group.add(topBoard);

    // Bottom seat board
    const bottomBoardGeo = new BoxGeometry(centerPanelWidth + sidePanelWidth * 2 * Math.cos(sideAngle) + 0.1, 0.04, bayProjection + 0.05);
    const bottomBoard = new Mesh(bottomBoardGeo, wallMat);
    bottomBoard.position.set(0, -height / 2 - 0.02, bayProjection / 2);
    group.add(bottomBoard);
  }

  // ===== SKYLIGHT: Tilted pane at an angle =====
  private createSkylightWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06;
    const { width, height, depth } = params;

    const tiltAngle = Math.PI / 4; // 45-degree tilt

    // Frame (rectangular, will be tilted)
    const frameGroup = new Group();
    this.addRectFrame(frameGroup, width, height * 0.7, depth, ft, frameMat);

    // Glass pane
    const glass = new Mesh(
      new BoxGeometry(width - ft * 2, height * 0.7 - ft * 2, 0.01),
      glassMat
    );
    frameGroup.add(glass);

    // Curb/frame border (raised edges around the skylight)
    const curbMat = new MeshStandardMaterial({ color: 0x666666, roughness: 0.6, metalness: 0.3 });
    const curbHeight = 0.1;
    const curbDepth = 0.08;
    // Front curb
    const frontCurb = new Mesh(new BoxGeometry(width + 0.1, curbHeight, curbDepth), curbMat);
    frontCurb.position.set(0, -height * 0.35 - curbHeight / 2, depth / 2);
    frameGroup.add(frontCurb);
    // Back curb
    const backCurb = new Mesh(new BoxGeometry(width + 0.1, curbHeight, curbDepth), curbMat);
    backCurb.position.set(0, height * 0.35 + curbHeight / 2, depth / 2);
    frameGroup.add(backCurb);
    // Left curb
    const leftCurb = new Mesh(new BoxGeometry(curbDepth, curbHeight, depth + 0.05), curbMat);
    leftCurb.position.set(-width / 2 - curbDepth / 2, 0, depth / 2);
    frameGroup.add(leftCurb);
    // Right curb
    const rightCurb = new Mesh(new BoxGeometry(curbDepth, curbHeight, depth + 0.05), curbMat);
    rightCurb.position.set(width / 2 + curbDepth / 2, 0, depth / 2);
    frameGroup.add(rightCurb);

    // Apply tilt rotation on X axis
    frameGroup.rotation.x = -tiltAngle;
    group.add(frameGroup);
  }

  // ===== ARCHED: Semi-circular arch at top of frame =====
  private createArchedWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06;
    const { width, height, depth } = params;

    // Rectangular frame for bottom portion
    const rectHeight = height * 0.6; // bottom 60% is rectangular
    this.addRectFrame(group, width, rectHeight, depth, ft, frameMat);

    // Bottom glass (rectangular portion)
    const bottomGlass = new Mesh(
      new BoxGeometry(width - ft * 2, rectHeight - ft * 2, 0.01),
      glassMat
    );
    bottomGlass.position.set(0, 0, 0);
    group.add(bottomGlass);

    // Arched top portion
    const archHeight = height - rectHeight;
    const archRadius = width / 2;
    const archCenter = rectHeight / 2;
    const archSegments = 16;

    // Arch frame pieces (curved top)
    const archFramePieces: Mesh[] = [];
    for (let i = 0; i <= archSegments; i++) {
      const angle = Math.PI * (i / archSegments); // 0 to PI (semicircle)
      const x = archRadius * Math.cos(angle) * (1 - ft / archRadius);
      const y = archCenter + archRadius * Math.sin(angle);

      if (i > 0) {
        const prevAngle = Math.PI * ((i - 1) / archSegments);
        const px = archRadius * Math.cos(prevAngle) * (1 - ft / archRadius);
        const py = archCenter + archRadius * Math.sin(prevAngle);
        const segLen = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        const segAngle = Math.atan2(y - py, x - px);
        const segGeo = new BoxGeometry(segLen, ft, depth);
        const seg = new Mesh(segGeo, frameMat);
        seg.position.set((x + px) / 2, (y + py) / 2, 0);
        seg.rotation.z = segAngle;
        seg.castShadow = true;
        archFramePieces.push(seg);
      }
    }
    archFramePieces.forEach(m => group.add(m));

    // Side frame bars going up to arch
    const leftSideGeo = new BoxGeometry(ft, archHeight, depth);
    const leftSide = new Mesh(leftSideGeo, frameMat);
    leftSide.position.set(-width / 2 + ft / 2, rectHeight / 2 + archHeight / 2, 0);
    leftSide.castShadow = true;
    group.add(leftSide);

    const rightSide = new Mesh(leftSideGeo.clone(), frameMat);
    rightSide.position.set(width / 2 - ft / 2, rectHeight / 2 + archHeight / 2, 0);
    rightSide.castShadow = true;
    group.add(rightSide);

    // Arched glass (approximated with a circle segment using custom geometry)
    const archGlassGeo = new BufferGeometry();
    const archGlassVerts: number[] = [];
    const archGlassNorms: number[] = [];
    const archGlassUvs: number[] = [];

    // Center point of arch
    const cx = 0;
    const cy = archCenter;

    for (let i = 0; i < archSegments; i++) {
      const a1 = Math.PI * (i / archSegments);
      const a2 = Math.PI * ((i + 1) / archSegments);
      const innerR = ft + 0.02;
      const outerR = archRadius - ft - 0.02;

      // Triangle 1
      archGlassVerts.push(cx, cy, 0);
      archGlassNorms.push(0, 0, 1);
      archGlassUvs.push(0.5, 0.5);

      archGlassVerts.push(cx + innerR * Math.cos(a2), cy + innerR * Math.sin(a2), 0);
      archGlassNorms.push(0, 0, 1);
      archGlassUvs.push(0.5 + 0.5 * Math.cos(a2), 0.5 + 0.5 * Math.sin(a2));

      archGlassVerts.push(cx + outerR * Math.cos(a1), cy + outerR * Math.sin(a1), 0);
      archGlassNorms.push(0, 0, 1);
      archGlassUvs.push(0.5 + 0.5 * Math.cos(a1), 0.5 + 0.5 * Math.sin(a1));

      // Triangle 2
      archGlassVerts.push(cx + outerR * Math.cos(a1), cy + outerR * Math.sin(a1), 0);
      archGlassNorms.push(0, 0, 1);
      archGlassUvs.push(0.5 + 0.5 * Math.cos(a1), 0.5 + 0.5 * Math.sin(a1));

      archGlassVerts.push(cx + innerR * Math.cos(a2), cy + innerR * Math.sin(a2), 0);
      archGlassNorms.push(0, 0, 1);
      archGlassUvs.push(0.5 + 0.5 * Math.cos(a2), 0.5 + 0.5 * Math.sin(a2));

      archGlassVerts.push(cx + outerR * Math.cos(a2), cy + outerR * Math.sin(a2), 0);
      archGlassNorms.push(0, 0, 1);
      archGlassUvs.push(0.5 + 0.5 * Math.cos(a2), 0.5 + 0.5 * Math.sin(a2));
    }

    archGlassGeo.setAttribute('position', new Float32BufferAttribute(archGlassVerts, 3));
    archGlassGeo.setAttribute('normal', new Float32BufferAttribute(archGlassNorms, 3));
    archGlassGeo.setAttribute('uv', new Float32BufferAttribute(archGlassUvs, 2));

    const archGlass = new Mesh(archGlassGeo, glassMat);
    archGlass.name = 'arch_glass';
    group.add(archGlass);

    // Decorative keystone at top
    const keystoneGeo = new BoxGeometry(0.1, 0.12, depth * 0.5);
    const keystone = new Mesh(keystoneGeo, frameMat);
    keystone.position.set(0, archCenter + archRadius - ft / 2, 0);
    keystone.name = 'keystone';
    group.add(keystone);
  }

  // ===== Helper: Add rectangular frame (4 bars) =====
  private addRectFrame(
    group: Group, w: number, h: number, d: number, ft: number, mat: MeshStandardMaterial
  ): void {
    // Top bar
    const top = new Mesh(new BoxGeometry(w, ft, d), mat);
    top.position.set(0, h / 2 - ft / 2, 0);
    top.castShadow = true;
    group.add(top);

    // Bottom bar
    const bottom = new Mesh(new BoxGeometry(w, ft, d), mat);
    bottom.position.set(0, -h / 2 + ft / 2, 0);
    bottom.castShadow = true;
    group.add(bottom);

    // Left bar
    const left = new Mesh(new BoxGeometry(ft, h, d), mat);
    left.position.set(-w / 2 + ft / 2, 0, 0);
    left.castShadow = true;
    group.add(left);

    // Right bar
    const right = new Mesh(new BoxGeometry(ft, h, d), mat);
    right.position.set(w / 2 - ft / 2, 0, 0);
    right.castShadow = true;
    group.add(right);
  }

  // ===== Helper: Add panel frame (4 bars around a sash/panel) =====
  private addPanelFrame(
    group: Group, w: number, h: number, ft: number, d: number, mat: MeshStandardMaterial
  ): void {
    const top = new Mesh(new BoxGeometry(w, ft, d), mat);
    top.position.set(0, h / 2 - ft / 2, 0);
    group.add(top);

    const bottom = new Mesh(new BoxGeometry(w, ft, d), mat);
    bottom.position.set(0, -h / 2 + ft / 2, 0);
    group.add(bottom);

    const left = new Mesh(new BoxGeometry(ft, h, d), mat);
    left.position.set(-w / 2 + ft / 2, 0, 0);
    group.add(left);

    const right = new Mesh(new BoxGeometry(ft, h, d), mat);
    right.position.set(w / 2 - ft / 2, 0, 0);
    group.add(right);
  }

  private createShutters(params: WindowParams): Group[] {
    const shutters: Group[] = [];
    const shutterColor = this.getShutterColor(params);
    const shutterMaterial = new MeshStandardMaterial({
      color: shutterColor,
      roughness: 0.6
    });

    for (const side of [-1, 1]) {
      const shutterGroup = new Group();
      const shutterWidth = params.width * 0.35;

      const panelGeo = new BoxGeometry(shutterWidth, params.height, 0.04);
      const panel = new Mesh(panelGeo, shutterMaterial);
      panel.castShadow = true;
      shutterGroup.add(panel);

      const slatCount = 5;
      for (let i = 0; i < slatCount; i++) {
        const y = ((i + 0.5) / slatCount - 0.5) * params.height;
        const slatGeo = new BoxGeometry(shutterWidth * 0.85, 0.03, 0.05);
        const slat = new Mesh(slatGeo, shutterMaterial);
        slat.position.y = y;
        slat.position.z = 0.025;
        shutterGroup.add(slat);
      }

      shutterGroup.position.set(side * (params.width / 2 + shutterWidth / 2 + 0.02), 0, 0);
      shutters.push(shutterGroup);
    }

    return shutters;
  }

  private createSill(params: WindowParams): Mesh {
    const sillMaterial = new MeshStandardMaterial({
      color: this.getFrameColor(params),
      roughness: 0.7
    });

    const sillGeo = new BoxGeometry(params.width + 0.2, 0.05, params.sillDepth);
    const sill = new Mesh(sillGeo, sillMaterial);
    sill.position.set(0, -params.height / 2 - 0.025, params.sillDepth / 2 - params.depth / 2);
    sill.castShadow = true;
    sill.receiveShadow = true;
    sill.name = 'sill';
    return sill;
  }

  private getGlassMaterial(params: WindowParams): MeshStandardMaterial {
    let color = 0x88ccff;
    let opacity = 0.3;
    let roughness = 0.1;

    switch (params.glassType) {
      case 'frosted': color = 0xcccccc; opacity = 0.5; roughness = 0.4; break;
      case 'tinted': color = 0x6688aa; opacity = 0.4; break;
      case 'stained': color = 0xaa6688; opacity = 0.6; break;
    }

    return new MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness,
      metalness: 0.1
    });
  }

  private getFrameMaterial(params: WindowParams): MeshStandardMaterial {
    const color = this.getFrameColor(params);
    return new MeshStandardMaterial({
      color,
      roughness: params.frameMaterial === 'metal' ? 0.3 : 0.7,
      metalness: params.frameMaterial === 'metal' || params.frameMaterial === 'aluminum' ? 0.6 : 0.0,
    });
  }

  private getFrameColor(params: WindowParams): Color {
    switch (params.frameMaterial) {
      case 'wood': return new Color(0x4a3728);
      case 'metal': return new Color(0x333333);
      case 'vinyl': return new Color(0xffffff);
      case 'aluminum': return new Color(0xaaaaaa);
      default: return new Color(0x4a3728);
    }
  }

  private getShutterColor(params: WindowParams): Color {
    const colors = [0x2d5016, 0x1a1a1a, 0x4a3728, 0x8b0000, 0x003366];
    return new Color(this.rng.choice(colors));
  }

  validateParams(params: WindowParams): boolean {
    return (
      params.width > 0.5 && params.width < 4.0 &&
      params.height > 0.5 && params.height < 3.5 &&
      params.paneCount >= 1 && params.paneCount <= 24
    );
  }
}
