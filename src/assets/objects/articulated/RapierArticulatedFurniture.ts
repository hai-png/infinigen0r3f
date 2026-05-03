/**
 * Rapier-Backed Articulated Furniture — P8.3: Rapier-Backed Articulated Objects
 *
 * Reimplements articulated furniture using Rapier physics joints from
 * @react-three/rapier. Each generator creates both the visual mesh hierarchy
 * and the physics joint definitions for realistic articulation.
 *
 * Generators:
 * - DoorGenerator: RevoluteJoint with angular limits (0 to PI/2)
 * - WindowGenerator: PrismaticJoint for sliding, RevoluteJoint for casement
 * - DrawerGenerator: PrismaticJoint with linear limits
 * - CabinetGenerator: RevoluteJoint for doors with spring-back
 * - FaucetGenerator: RevoluteJoint for handles and spout rotation
 *
 * @module articulated
 * @phase 8
 * @p-number P8.3
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Joint type mapping to Rapier joint types.
 */
export type RapierJointType = 'revolute' | 'prismatic' | 'ball' | 'fixed';

/**
 * Configuration for a Rapier joint.
 */
export interface RapierJointConfig {
  /** Unique joint ID */
  id: string;
  /** Joint type */
  type: RapierJointType;
  /** Body A name (parent) */
  bodyA: string;
  /** Body B name (child) */
  bodyB: string;
  /** Anchor point on body A (local space) */
  anchorA: THREE.Vector3;
  /** Anchor point on body B (local space) */
  anchorB: THREE.Vector3;
  /** Joint axis (local space of body A) */
  axis: THREE.Vector3;
  /** Angular or linear limits [min, max] */
  limits: [number, number];
  /** Spring stiffness for spring-back behavior (0 = no spring) */
  springStiffness: number;
  /** Spring damping */
  springDamping: number;
}

/**
 * Result of an articulated furniture generator.
 */
export interface ArticulatedFurnitureResult {
  /** Root THREE.Group with all visual meshes */
  group: THREE.Group;
  /** Rapier joint configurations */
  joints: RapierJointConfig[];
  /** Rigid body definitions for Rapier */
  rigidBodies: RigidBodyDef[];
  /** Category name */
  category: string;
}

/**
 * Rigid body definition for Rapier.
 */
export interface RigidBodyDef {
  /** Body name */
  name: string;
  /** Body type */
  type: 'fixed' | 'dynamic' | 'kinematicPosition';
  /** Position in world space */
  position: THREE.Vector3;
  /** Rotation (Euler) */
  rotation: THREE.Euler;
  /** Collider shape */
  colliderShape: 'cuboid' | 'cylinder' | 'ball';
  /** Collider half-extents (for cuboid) or radius (for cylinder/ball) */
  colliderParams: THREE.Vector3;
  /** Mass in kg */
  mass: number;
  /** Whether this body is the fixed base */
  isBase: boolean;
}

/**
 * Common configuration for all articulated furniture.
 */
export interface ArticulatedFurnitureConfig {
  /** Seed for procedural variation. Default: 42 */
  seed: number;
  /** Scale multiplier. Default: 1 */
  scale: number;
  /** Style variant. Default: 'modern' */
  style: 'modern' | 'traditional' | 'industrial' | 'minimalist';
  /** Material overrides */
  materialOverrides?: Record<string, Partial<THREE.MeshStandardMaterialParameters>>;
}

// ---------------------------------------------------------------------------
// Default Config
// ---------------------------------------------------------------------------

const DEFAULT_FURNITURE_CONFIG: ArticulatedFurnitureConfig = {
  seed: 42,
  scale: 1,
  style: 'modern',
};

// ---------------------------------------------------------------------------
// Material Factory
// ---------------------------------------------------------------------------

function createMaterial(
  params: Partial<THREE.MeshStandardMaterialParameters> = {}
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, ...params });
}

// ---------------------------------------------------------------------------
// DoorGenerator — RevoluteJoint (0 to PI/2)
// ---------------------------------------------------------------------------

/**
 * Door generator with Rapier RevoluteJoint.
 *
 * Creates a door panel that rotates around a vertical axis (hinge).
 * Angular limits: 0 (closed) to PI/2 (open at 90 degrees).
 * Supports spring-back for auto-closing.
 *
 * @phase 8
 * @p-number P8.3
 */
export class DoorGenerator {
  private config: ArticulatedFurnitureConfig;

  constructor(config: Partial<ArticulatedFurnitureConfig> = {}) {
    this.config = { ...DEFAULT_FURNITURE_CONFIG, ...config };
  }

  generate(): ArticulatedFurnitureResult {
    const s = this.config.scale;
    const group = new THREE.Group();
    group.name = 'RapierDoor';

    const frameMat = createMaterial({ color: 0x8B7355, roughness: 0.8 });
    const doorMat = createMaterial({ color: 0xD2B48C, roughness: 0.7 });
    const handleMat = createMaterial({ color: 0xC0C0C0, metalness: 0.8, roughness: 0.2 });

    // Door frame (fixed base)
    const frameLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.05 * s, 2.1 * s, 0.08 * s),
      frameMat
    );
    frameLeft.position.set(-0.475 * s, 1.05 * s, 0);
    frameLeft.name = 'door_frame_left';
    frameLeft.castShadow = true;
    group.add(frameLeft);

    const frameRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.05 * s, 2.1 * s, 0.08 * s),
      frameMat
    );
    frameRight.position.set(0.475 * s, 1.05 * s, 0);
    frameRight.name = 'door_frame_right';
    frameRight.castShadow = true;
    group.add(frameRight);

    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.95 * s, 0.05 * s, 0.08 * s),
      frameMat
    );
    frameTop.position.set(0, 2.075 * s, 0);
    frameTop.name = 'door_frame_top';
    frameTop.castShadow = true;
    group.add(frameTop);

    // Door panel (dynamic body — rotates around left edge)
    const doorGroup = new THREE.Group();
    doorGroup.name = 'door_pivot';
    doorGroup.position.set(-0.45 * s, 0, 0);

    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.88 * s, 2.0 * s, 0.03 * s),
      doorMat
    );
    doorPanel.position.set(0.44 * s, 1.0 * s, 0);
    doorPanel.name = 'door_panel';
    doorPanel.castShadow = true;
    doorGroup.add(doorPanel);

    // Door handle
    const handleKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.06 * s, 12),
      handleMat
    );
    handleKnob.position.set(0.75 * s, 1.0 * s, 0.05 * s);
    handleKnob.rotation.x = Math.PI / 2;
    handleKnob.name = 'door_handle';
    doorGroup.add(handleKnob);

    group.add(doorGroup);

    // Rapier joint configuration
    const joints: RapierJointConfig[] = [
      {
        id: 'door_hinge',
        type: 'revolute',
        bodyA: 'door_frame_left',
        bodyB: 'door_panel',
        anchorA: new THREE.Vector3(-0.45 * s, 1.0 * s, 0),
        anchorB: new THREE.Vector3(0, 1.0 * s, 0),
        axis: new THREE.Vector3(0, 1, 0), // Vertical hinge axis
        limits: [0, Math.PI / 2],
        springStiffness: 5.0, // Auto-close spring
        springDamping: 1.0,
      },
    ];

    const rigidBodies: RigidBodyDef[] = [
      {
        name: 'door_frame_left',
        type: 'fixed',
        position: new THREE.Vector3(-0.475 * s, 1.05 * s, 0),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.025 * s, 1.05 * s, 0.04 * s),
        mass: 0,
        isBase: true,
      },
      {
        name: 'door_panel',
        type: 'dynamic',
        position: new THREE.Vector3(0, 1.0 * s, 0),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.44 * s, 1.0 * s, 0.015 * s),
        mass: 15, // 15 kg door
        isBase: false,
      },
    ];

    return { group, joints, rigidBodies, category: 'Door' };
  }
}

// ---------------------------------------------------------------------------
// WindowGenerator — PrismaticJoint (sliding) / RevoluteJoint (casement)
// ---------------------------------------------------------------------------

/**
 * Window generator with Rapier joints.
 *
 * Supports two window types:
 * - Sliding: PrismaticJoint for horizontal sliding motion
 * - Casement: RevoluteJoint for hinged opening motion
 *
 * @phase 8
 * @p-number P8.3
 */
export class WindowGenerator {
  private config: ArticulatedFurnitureConfig;
  private windowType: 'sliding' | 'casement';

  constructor(
    config: Partial<ArticulatedFurnitureConfig> = {},
    windowType: 'sliding' | 'casement' = 'casement'
  ) {
    this.config = { ...DEFAULT_FURNITURE_CONFIG, ...config };
    this.windowType = windowType;
  }

  generate(): ArticulatedFurnitureResult {
    const s = this.config.scale;
    const group = new THREE.Group();
    group.name = 'RapierWindow';

    const frameMat = createMaterial({ color: 0xF5F5DC, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xADD8E6,
      transparent: true,
      opacity: 0.3,
      roughness: 0.1,
      metalness: 0.0,
    });

    // Frame (fixed base)
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.0 * s, 0.04 * s, 0.06 * s), frameMat);
    frameTop.position.set(0, 0.7 * s, 0);
    frameTop.name = 'win_frame_top';
    frameTop.castShadow = true;
    group.add(frameTop);

    const frameBot = new THREE.Mesh(new THREE.BoxGeometry(1.0 * s, 0.04 * s, 0.06 * s), frameMat);
    frameBot.position.set(0, -0.7 * s, 0);
    frameBot.name = 'win_frame_bot';
    frameBot.castShadow = true;
    group.add(frameBot);

    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 1.44 * s, 0.06 * s), frameMat);
    frameLeft.position.set(-0.5 * s, 0, 0);
    frameLeft.name = 'win_frame_left';
    frameLeft.castShadow = true;
    group.add(frameLeft);

    const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 1.44 * s, 0.06 * s), frameMat);
    frameRight.position.set(0.5 * s, 0, 0);
    frameRight.name = 'win_frame_right';
    frameRight.castShadow = true;
    group.add(frameRight);

    const joints: RapierJointConfig[] = [];
    const rigidBodies: RigidBodyDef[] = [];

    if (this.windowType === 'sliding') {
      // Sliding window — PrismaticJoint along X axis
      const slidingPanel = new THREE.Group();
      slidingPanel.name = 'window_sliding_pivot';

      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 1.34 * s, 0.02 * s), frameMat);
      panel.position.set(0.23 * s, 0, 0.01 * s);
      panel.name = 'window_panel_sliding';
      panel.castShadow = true;

      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 1.26 * s, 0.005 * s), glassMat);
      glass.position.set(0.23 * s, 0, 0.02 * s);
      glass.name = 'window_glass_sliding';

      slidingPanel.add(panel, glass);
      group.add(slidingPanel);

      joints.push({
        id: 'window_slide',
        type: 'prismatic',
        bodyA: 'win_frame_left',
        bodyB: 'window_panel_sliding',
        anchorA: new THREE.Vector3(0, 0, 0.01 * s),
        anchorB: new THREE.Vector3(0, 0, 0),
        axis: new THREE.Vector3(1, 0, 0), // Slide horizontally
        limits: [0, 0.46 * s],
        springStiffness: 0,
        springDamping: 2.0,
      });

      rigidBodies.push(
        {
          name: 'win_frame_left',
          type: 'fixed',
          position: new THREE.Vector3(-0.5 * s, 0, 0),
          rotation: new THREE.Euler(0, 0, 0),
          colliderShape: 'cuboid',
          colliderParams: new THREE.Vector3(0.02 * s, 0.72 * s, 0.03 * s),
          mass: 0,
          isBase: true,
        },
        {
          name: 'window_panel_sliding',
          type: 'dynamic',
          position: new THREE.Vector3(0, 0, 0.01 * s),
          rotation: new THREE.Euler(0, 0, 0),
          colliderShape: 'cuboid',
          colliderParams: new THREE.Vector3(0.23 * s, 0.67 * s, 0.01 * s),
          mass: 5,
          isBase: false,
        }
      );
    } else {
      // Casement window — RevoluteJoint hinged on left
      const casementPivot = new THREE.Group();
      casementPivot.name = 'window_casement_pivot';
      casementPivot.position.set(-0.48 * s, 0, 0);

      const casementFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.92 * s, 1.34 * s, 0.02 * s),
        frameMat
      );
      casementFrame.position.set(0.46 * s, 0, 0.01 * s);
      casementFrame.name = 'window_casement_frame';
      casementFrame.castShadow = true;

      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.84 * s, 1.26 * s, 0.005 * s),
        glassMat
      );
      glass.position.set(0.46 * s, 0, 0.02 * s);
      glass.name = 'window_glass_casement';

      casementPivot.add(casementFrame, glass);
      group.add(casementPivot);

      joints.push({
        id: 'window_hinge',
        type: 'revolute',
        bodyA: 'win_frame_left',
        bodyB: 'window_casement_frame',
        anchorA: new THREE.Vector3(-0.48 * s, 0, 0.01 * s),
        anchorB: new THREE.Vector3(0, 0, 0),
        axis: new THREE.Vector3(0, 1, 0), // Vertical hinge
        limits: [0, Math.PI * 0.75],
        springStiffness: 2.0,
        springDamping: 0.5,
      });

      rigidBodies.push(
        {
          name: 'win_frame_left',
          type: 'fixed',
          position: new THREE.Vector3(-0.5 * s, 0, 0),
          rotation: new THREE.Euler(0, 0, 0),
          colliderShape: 'cuboid',
          colliderParams: new THREE.Vector3(0.02 * s, 0.72 * s, 0.03 * s),
          mass: 0,
          isBase: true,
        },
        {
          name: 'window_casement_frame',
          type: 'dynamic',
          position: new THREE.Vector3(0, 0, 0.01 * s),
          rotation: new THREE.Euler(0, 0, 0),
          colliderShape: 'cuboid',
          colliderParams: new THREE.Vector3(0.46 * s, 0.67 * s, 0.01 * s),
          mass: 4,
          isBase: false,
        }
      );
    }

    return { group, joints, rigidBodies, category: 'Window' };
  }
}

// ---------------------------------------------------------------------------
// DrawerGenerator — PrismaticJoint with linear limits
// ---------------------------------------------------------------------------

/**
 * Drawer generator with Rapier PrismaticJoint.
 *
 * Creates a cabinet with a drawer that slides along the Z axis.
 * Linear limits: 0 (closed) to 0.35m (fully open).
 *
 * @phase 8
 * @p-number P8.3
 */
export class DrawerGenerator {
  private config: ArticulatedFurnitureConfig;

  constructor(config: Partial<ArticulatedFurnitureConfig> = {}) {
    this.config = { ...DEFAULT_FURNITURE_CONFIG, ...config };
  }

  generate(): ArticulatedFurnitureResult {
    const s = this.config.scale;
    const group = new THREE.Group();
    group.name = 'RapierDrawer';

    const cabinetMat = createMaterial({ color: 0x8B6914, roughness: 0.75 });
    const drawerMat = createMaterial({ color: 0xDEB887, roughness: 0.7 });
    const handleMat = createMaterial({ color: 0xA0A0A0, metalness: 0.7, roughness: 0.3 });

    // Cabinet shell (fixed base)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.3 * s, 0.02 * s), cabinetMat);
    back.position.set(0, 0.15 * s, -0.25 * s);
    back.name = 'cabinet_back';
    back.castShadow = true;
    group.add(back);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.3 * s, 0.5 * s), cabinetMat);
    left.position.set(-0.26 * s, 0.15 * s, 0);
    left.name = 'cabinet_left';
    left.castShadow = true;
    group.add(left);

    const right = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.3 * s, 0.5 * s), cabinetMat);
    right.position.set(0.26 * s, 0.15 * s, 0);
    right.name = 'cabinet_right';
    right.castShadow = true;
    group.add(right);

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.02 * s, 0.5 * s), cabinetMat);
    top.position.set(0, 0.3 * s, 0);
    top.name = 'cabinet_top';
    top.castShadow = true;
    group.add(top);

    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.02 * s, 0.5 * s), cabinetMat);
    bottom.position.set(0, 0, 0);
    bottom.name = 'cabinet_bottom';
    bottom.castShadow = true;
    group.add(bottom);

    // Drawer box (dynamic body — slides out)
    const drawerGroup = new THREE.Group();
    drawerGroup.name = 'drawer_slide_group';

    const drawerFront = new THREE.Mesh(new THREE.BoxGeometry(0.48 * s, 0.28 * s, 0.02 * s), drawerMat);
    drawerFront.position.set(0, 0.14 * s, 0.24 * s);
    drawerFront.name = 'drawer_front';
    drawerFront.castShadow = true;

    const drawerBottom = new THREE.Mesh(new THREE.BoxGeometry(0.44 * s, 0.01 * s, 0.42 * s), drawerMat);
    drawerBottom.position.set(0, 0.01 * s, 0);
    drawerBottom.name = 'drawer_bottom';

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01 * s, 0.01 * s, 0.1 * s, 8),
      handleMat
    );
    handle.position.set(0, 0.14 * s, 0.28 * s);
    handle.rotation.z = Math.PI / 2;
    handle.name = 'drawer_handle';

    drawerGroup.add(drawerFront, drawerBottom, handle);
    group.add(drawerGroup);

    // Rapier joint configuration
    const joints: RapierJointConfig[] = [
      {
        id: 'drawer_slide',
        type: 'prismatic',
        bodyA: 'cabinet_bottom',
        bodyB: 'drawer_front',
        anchorA: new THREE.Vector3(0, 0.01 * s, 0),
        anchorB: new THREE.Vector3(0, 0, -0.22 * s),
        axis: new THREE.Vector3(0, 0, 1), // Slide along Z
        limits: [0, 0.35 * s],
        springStiffness: 0,
        springDamping: 3.0,
      },
    ];

    const rigidBodies: RigidBodyDef[] = [
      {
        name: 'cabinet_bottom',
        type: 'fixed',
        position: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.25 * s, 0.01 * s, 0.25 * s),
        mass: 0,
        isBase: true,
      },
      {
        name: 'drawer_front',
        type: 'dynamic',
        position: new THREE.Vector3(0, 0.14 * s, 0.24 * s),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.24 * s, 0.14 * s, 0.01 * s),
        mass: 3,
        isBase: false,
      },
    ];

    return { group, joints, rigidBodies, category: 'Drawer' };
  }
}

// ---------------------------------------------------------------------------
// CabinetGenerator — RevoluteJoint for doors with spring-back
// ---------------------------------------------------------------------------

/**
 * Cabinet generator with Rapier RevoluteJoint and spring-back.
 *
 * Creates a cabinet with a hinged door that auto-closes via spring.
 * Angular limits: 0 (closed) to PI/2 (open).
 * Spring-back: door returns to closed position when released.
 *
 * @phase 8
 * @p-number P8.3
 */
export class CabinetGenerator {
  private config: ArticulatedFurnitureConfig;

  constructor(config: Partial<ArticulatedFurnitureConfig> = {}) {
    this.config = { ...DEFAULT_FURNITURE_CONFIG, ...config };
  }

  generate(): ArticulatedFurnitureResult {
    const s = this.config.scale;
    const group = new THREE.Group();
    group.name = 'RapierCabinet';

    const woodMat = createMaterial({ color: 0x6B4226, roughness: 0.75 });
    const doorMat = createMaterial({ color: 0x8B6914, roughness: 0.7 });
    const knobMat = createMaterial({ color: 0xB8860B, metalness: 0.6, roughness: 0.3 });

    // Cabinet body (fixed base)
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 0.02 * s, 0.4 * s), woodMat);
    top.position.set(0, 0.9 * s, 0);
    top.name = 'cab_top';
    top.castShadow = true;
    group.add(top);

    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 0.02 * s, 0.4 * s), woodMat);
    bottom.position.set(0, 0, 0);
    bottom.name = 'cab_bottom';
    bottom.castShadow = true;
    group.add(bottom);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.9 * s, 0.4 * s), woodMat);
    left.position.set(-0.31 * s, 0.45 * s, 0);
    left.name = 'cab_left';
    left.castShadow = true;
    group.add(left);

    const right = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.9 * s, 0.4 * s), woodMat);
    right.position.set(0.31 * s, 0.45 * s, 0);
    right.name = 'cab_right';
    right.castShadow = true;
    group.add(right);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 0.9 * s, 0.01 * s), woodMat);
    back.position.set(0, 0.45 * s, -0.2 * s);
    back.name = 'cab_back';
    back.castShadow = true;
    group.add(back);

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.56 * s, 0.015 * s, 0.38 * s), woodMat);
    shelf.position.set(0, 0.45 * s, 0);
    shelf.name = 'cab_shelf';
    shelf.castShadow = true;
    group.add(shelf);

    // Cabinet door (dynamic — hinged on left)
    const doorPivot = new THREE.Group();
    doorPivot.name = 'cabinet_door_pivot';
    doorPivot.position.set(-0.3 * s, 0, 0);

    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.58 * s, 0.88 * s, 0.015 * s),
      doorMat
    );
    doorPanel.position.set(0.29 * s, 0.45 * s, 0.2 * s);
    doorPanel.name = 'cabinet_door';
    doorPanel.castShadow = true;

    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.015 * s, 12, 8),
      knobMat
    );
    knob.position.set(0.5 * s, 0.45 * s, 0.22 * s);
    knob.name = 'cabinet_knob';

    doorPivot.add(doorPanel, knob);
    group.add(doorPivot);

    // Rapier joint with spring-back
    const joints: RapierJointConfig[] = [
      {
        id: 'cabinet_hinge',
        type: 'revolute',
        bodyA: 'cab_left',
        bodyB: 'cabinet_door',
        anchorA: new THREE.Vector3(-0.3 * s, 0.45 * s, 0.2 * s),
        anchorB: new THREE.Vector3(0, 0, 0),
        axis: new THREE.Vector3(0, 1, 0), // Vertical hinge
        limits: [0, Math.PI / 2],
        springStiffness: 10.0, // Spring-back force
        springDamping: 2.0,
      },
    ];

    const rigidBodies: RigidBodyDef[] = [
      {
        name: 'cab_left',
        type: 'fixed',
        position: new THREE.Vector3(-0.31 * s, 0.45 * s, 0),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.01 * s, 0.45 * s, 0.2 * s),
        mass: 0,
        isBase: true,
      },
      {
        name: 'cabinet_door',
        type: 'dynamic',
        position: new THREE.Vector3(0, 0.45 * s, 0.2 * s),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cuboid',
        colliderParams: new THREE.Vector3(0.29 * s, 0.44 * s, 0.0075 * s),
        mass: 5,
        isBase: false,
      },
    ];

    return { group, joints, rigidBodies, category: 'Cabinet' };
  }
}

// ---------------------------------------------------------------------------
// FaucetGenerator — RevoluteJoint for handles and spout rotation
// ---------------------------------------------------------------------------

/**
 * Faucet generator with Rapier RevoluteJoint.
 *
 * Creates a faucet with:
 * - Lever handle: RevoluteJoint for up/down rotation
 * - Spout: RevoluteJoint for swivel rotation
 *
 * @phase 8
 * @p-number P8.3
 */
export class FaucetGenerator {
  private config: ArticulatedFurnitureConfig;

  constructor(config: Partial<ArticulatedFurnitureConfig> = {}) {
    this.config = { ...DEFAULT_FURNITURE_CONFIG, ...config };
  }

  generate(): ArticulatedFurnitureResult {
    const s = this.config.scale;
    const group = new THREE.Group();
    group.name = 'RapierFaucet';

    const metalMat = createMaterial({ color: 0xC0C0C0, metalness: 0.85, roughness: 0.15 });

    // Base (fixed)
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02 * s, 0.025 * s, 0.03 * s, 16),
      metalMat
    );
    base.position.set(0, 0.015 * s, 0);
    base.name = 'faucet_base';
    base.castShadow = true;
    group.add(base);

    // Column (fixed)
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01 * s, 0.01 * s, 0.12 * s, 12),
      metalMat
    );
    column.position.set(0, 0.09 * s, 0);
    column.name = 'faucet_column';
    column.castShadow = true;
    group.add(column);

    // Spout (dynamic — swivel rotation)
    const spoutGroup = new THREE.Group();
    spoutGroup.name = 'faucet_spout_pivot';
    spoutGroup.position.set(0, 0.14 * s, 0);

    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008 * s, 0.008 * s, 0.1 * s, 12),
      metalMat
    );
    spout.position.set(0.04 * s, 0, 0);
    spout.rotation.z = -Math.PI / 4;
    spout.name = 'faucet_spout';
    spout.castShadow = true;

    spoutGroup.add(spout);
    group.add(spoutGroup);

    // Lever handle (dynamic — rotates to control flow)
    const leverGroup = new THREE.Group();
    leverGroup.name = 'faucet_lever_pivot';
    leverGroup.position.set(0, 0.14 * s, 0);

    const lever = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006 * s, 0.006 * s, 0.06 * s, 8),
      metalMat
    );
    lever.position.set(0, 0, -0.03 * s);
    lever.rotation.x = Math.PI / 2;
    lever.name = 'faucet_lever';
    lever.castShadow = true;

    leverGroup.add(lever);
    group.add(leverGroup);

    // Rapier joint configurations
    const joints: RapierJointConfig[] = [
      {
        id: 'faucet_lever_hinge',
        type: 'revolute',
        bodyA: 'faucet_column',
        bodyB: 'faucet_lever',
        anchorA: new THREE.Vector3(0, 0.14 * s, 0),
        anchorB: new THREE.Vector3(0, 0, 0),
        axis: new THREE.Vector3(1, 0, 0), // Rotate around X for up/down
        limits: [-Math.PI * 0.3, Math.PI * 0.3],
        springStiffness: 3.0, // Spring-back to center
        springDamping: 0.5,
      },
      {
        id: 'faucet_spout_swivel',
        type: 'revolute',
        bodyA: 'faucet_column',
        bodyB: 'faucet_spout',
        anchorA: new THREE.Vector3(0, 0.14 * s, 0),
        anchorB: new THREE.Vector3(0, 0, 0),
        axis: new THREE.Vector3(0, 1, 0), // Rotate around Y for swivel
        limits: [-Math.PI * 0.5, Math.PI * 0.5],
        springStiffness: 2.0,
        springDamping: 1.0,
      },
    ];

    const rigidBodies: RigidBodyDef[] = [
      {
        name: 'faucet_column',
        type: 'fixed',
        position: new THREE.Vector3(0, 0.09 * s, 0),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cylinder',
        colliderParams: new THREE.Vector3(0.01 * s, 0.06 * s, 0.01 * s),
        mass: 0,
        isBase: true,
      },
      {
        name: 'faucet_lever',
        type: 'dynamic',
        position: new THREE.Vector3(0, 0.14 * s, -0.03 * s),
        rotation: new THREE.Euler(0, 0, 0),
        colliderShape: 'cylinder',
        colliderParams: new THREE.Vector3(0.003 * s, 0.03 * s, 0.003 * s),
        mass: 0.1,
        isBase: false,
      },
      {
        name: 'faucet_spout',
        type: 'dynamic',
        position: new THREE.Vector3(0.04 * s, 0.14 * s, 0),
        rotation: new THREE.Euler(0, 0, -Math.PI / 4),
        colliderShape: 'cylinder',
        colliderParams: new THREE.Vector3(0.004 * s, 0.05 * s, 0.004 * s),
        mass: 0.2,
        isBase: false,
      },
    ];

    return { group, joints, rigidBodies, category: 'Faucet' };
  }
}

export default {
  DoorGenerator,
  WindowGenerator,
  DrawerGenerator,
  CabinetGenerator,
  FaucetGenerator,
};
