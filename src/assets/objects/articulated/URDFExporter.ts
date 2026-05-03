/**
 * URDF (Unified Robot Description Format) Exporter
 *
 * Ported from Infinigen's core/sim/exporters/urdf_exporter.py.
 * Converts JointInfo[] and mesh geometry data into valid URDF XML,
 * supporting revolute, continuous, prismatic, fixed, floating, and planar joints.
 *
 * URDF reference: http://wiki.ros.org/urdf/XML
 */

import * as THREE from 'three';
import { JointInfo, JointType } from './types';

// ============================================================================
// URDF Type Definitions
// ============================================================================

/** URDF joint type enumeration matching the URDF specification */
export type URDFJointType =
  | 'revolute'
  | 'continuous'
  | 'prismatic'
  | 'fixed'
  | 'floating'
  | 'planar';

/** Geometry definition for visual or collision elements */
export interface URDFGeometry {
  /** Path to an external mesh file (e.g. .obj or .stl) */
  meshPath?: string;
  /** Box geometry with dimensions [x, y, z] */
  box?: { size: [number, number, number] };
  /** Cylinder geometry defined by radius and length */
  cylinder?: { radius: number; length: number };
  /** Sphere geometry defined by radius */
  sphere?: { radius: number };
}

/** 3D origin with position and orientation (roll-pitch-yaw) */
export interface URDFOrigin {
  /** Position [x, y, z] */
  xyz: [number, number, number];
  /** Orientation as roll-pitch-yaw [r, p, y] in radians */
  rpy: [number, number, number];
}

/** Inertial properties for a rigid body link */
export interface URDFInertial {
  /** Mass in kilograms */
  mass: number;
  /** Origin of the center of mass relative to the link frame */
  origin: URDFOrigin;
  /** Inertia tensor components (symmetric 3x3 matrix) */
  inertia: {
    ixx: number;
    ixy: number;
    ixz: number;
    iyy: number;
    iyz: number;
    izz: number;
  };
}

/** A single rigid body link in the URDF tree */
export interface URDFLink {
  /** Unique link name */
  name: string;
  /** Visual geometry representation */
  visualGeometry?: URDFGeometry;
  /** Origin of the visual geometry relative to the link frame */
  visualOrigin?: URDFOrigin;
  /** Collision geometry representation (can differ from visual) */
  collisionGeometry?: URDFGeometry;
  /** Origin of the collision geometry relative to the link frame */
  collisionOrigin?: URDFOrigin;
  /** Inertial properties (mass, center of mass, inertia tensor) */
  inertial?: URDFInertial;
}

/** Joint limit parameters */
export interface URDFJointLimit {
  /** Lower limit (radians for revolute, meters for prismatic) */
  lower: number;
  /** Upper limit (radians for revolute, meters for prismatic) */
  upper: number;
  /** Maximum effort (N·m for revolute, N for prismatic) */
  effort: number;
  /** Maximum velocity (rad/s for revolute, m/s for prismatic) */
  velocity: number;
}

/** Joint dynamics parameters */
export interface URDFJointDynamics {
  /** Damping coefficient (N·m·s/rad for revolute, N·s/m for prismatic) */
  damping: number;
  /** Friction coefficient (N·m for revolute, N for prismatic) */
  friction: number;
}

/** A single joint connecting two links in the URDF tree */
export interface URDFJoint {
  /** Unique joint name */
  name: string;
  /** Joint type from URDF specification */
  type: URDFJointType;
  /** Name of the parent link */
  parent: string;
  /** Name of the child link */
  child: string;
  /** Transform from parent link to joint frame */
  origin: URDFOrigin;
  /** Joint axis in the joint frame (defaults to [0, 0, 1]) */
  axis?: [number, number, number];
  /** Joint limits (required for revolute and prismatic) */
  limit?: URDFJointLimit;
  /** Joint dynamics (damping and friction) */
  dynamics?: URDFJointDynamics;
}

/** Options controlling URDF export behavior */
export interface URDFExportOptions {
  /** Whether to include inertial data in links (default: true) */
  includeInertial?: boolean;
  /** Whether to include collision geometry (default: true) */
  includeCollision?: boolean;
  /** Base path for mesh file references (default: 'meshes/') */
  meshExportPath?: string;
  /** Estimate mass from geometry dimensions when not provided (default: true) */
  estimateMassFromGeometry?: boolean;
  /** Default material density in kg/m³ for mass estimation (default: 500) */
  defaultDensity?: number;
}

// ============================================================================
// Type Mapping
// ============================================================================

/**
 * Map an Infinigen JointType to a URDF joint type.
 *
 * Mapping rules (matching Infinigen's Python implementation):
 * - hinge       → revolute  (limited rotational joint)
 * - continuous  → continuous (unlimited rotational joint)
 * - prismatic   → prismatic  (limited linear joint)
 * - ball        → floating   (URDF has no ball/ spherical, use 6-DOF floating)
 * - ball_socket → floating   (same as ball)
 * - fixed       → fixed      (no motion)
 */
export function jointTypeToURDF(type: JointType): URDFJointType {
  switch (type) {
    case 'hinge':
      return 'revolute';
    case 'continuous':
      return 'continuous';
    case 'prismatic':
      return 'prismatic';
    case 'ball':
    case 'ball_socket':
      return 'floating';
    case 'fixed':
      return 'fixed';
    default:
      return 'fixed';
  }
}

// ============================================================================
// Inertia Estimation
// ============================================================================

/**
 * Estimate the inertia tensor of a rigid body using a solid box approximation.
 *
 * For a solid box with dimensions (w, h, d) = size and uniform mass m:
 *   Ixx = m/12 * (h² + d²)
 *   Iyy = m/12 * (w² + d²)
 *   Izz = m/12 * (w² + h²)
 *   Ixy = Ixz = Iyz = 0 (principal axes aligned with box)
 *
 * @param mass - Mass of the body in kilograms
 * @param size - Dimensions of the bounding box [width, height, depth]
 * @returns Symmetric inertia tensor components
 */
export function estimateInertia(
  mass: number,
  size: THREE.Vector3
): { ixx: number; ixy: number; ixz: number; iyy: number; iyz: number; izz: number } {
  const w = size.x;
  const h = size.y;
  const d = size.z;
  const m = mass;

  return {
    ixx: (m / 12) * (h * h + d * d),
    ixy: 0,
    ixz: 0,
    iyy: (m / 12) * (w * w + d * d),
    iyz: 0,
    izz: (m / 12) * (w * w + h * h),
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Estimate mass from geometry using density × volume.
 * Supports box, cylinder, and sphere geometry types.
 */
function estimateMassFromGeometry(
  geometry: URDFGeometry,
  density: number
): number {
  if (geometry.box) {
    const [w, h, d] = geometry.box.size;
    return density * w * h * d;
  }
  if (geometry.cylinder) {
    const { radius, length } = geometry.cylinder;
    return density * Math.PI * radius * radius * length;
  }
  if (geometry.sphere) {
    const { radius } = geometry.sphere;
    return density * (4 / 3) * Math.PI * radius * radius * radius;
  }
  // Fallback for mesh geometry: estimate from 10cm cube
  return density * 0.1 * 0.1 * 0.1;
}

/** Format a number to fixed decimal places for XML output */
function fmt(n: number, precision: number = 6): string {
  return n.toFixed(precision);
}

/** Format a THREE.Vector3 as "x y z" string */
function fmtVec3(v: THREE.Vector3): string {
  return `${fmt(v.x)} ${fmt(v.y)} ${fmt(v.z)}`;
}

/** Format a [number, number, number] tuple as "x y z" string */
function fmtTuple3(t: [number, number, number]): string {
  return `${fmt(t[0])} ${fmt(t[1])} ${fmt(t[2])}`;
}

/**
 * Build a link tree from the joint array.
 * Returns a Map<linkName, parentLinkName | null> representing the hierarchy,
 * and identifies the root link.
 */
function buildLinkTree(joints: JointInfo[]): {
  linkParents: Map<string, string | null>;
  rootLink: string;
} {
  const linkParents = new Map<string, string | null>();

  for (const joint of joints) {
    const parentName = joint.parentMesh || '__root__';
    const childName = joint.childMesh;

    if (!linkParents.has(parentName)) {
      linkParents.set(parentName, null);
    }
    if (!linkParents.has(childName)) {
      linkParents.set(childName, parentName);
    } else {
      // If already present, ensure parent is set (first joint wins)
      if (linkParents.get(childName) === null) {
        linkParents.set(childName, parentName);
      }
    }
  }

  // Find root: the link with no parent
  let rootLink = '__root__';
  for (const [link, parent] of linkParents) {
    if (parent === null) {
      rootLink = link;
      break;
    }
  }

  return { linkParents, rootLink };
}

/**
 * Generate XML for a URDF geometry element.
 */
function geometryToXML(geometry: URDFGeometry, indent: string, meshPath: string): string {
  if (geometry.meshPath) {
    const fullPath = meshPath + geometry.meshPath;
    return `${indent}<mesh filename="${fullPath}"/>`;
  }
  if (geometry.box) {
    return `${indent}<box size="${fmtTuple3(geometry.box.size)}"/>`;
  }
  if (geometry.cylinder) {
    return `${indent}<cylinder radius="${fmt(geometry.cylinder.radius)}" length="${fmt(geometry.cylinder.length)}"/>`;
  }
  if (geometry.sphere) {
    return `${indent}<sphere radius="${fmt(geometry.sphere.radius)}"/>`;
  }
  return `${indent}<box size="0.01 0.01 0.01"/>`;
}

/**
 * Generate XML for a URDF origin element.
 */
function originToXML(origin: URDFOrigin, indent: string, tagName: string = 'origin'): string {
  const xyzStr = fmtTuple3(origin.xyz);
  const rpyStr = fmtTuple3(origin.rpy);
  return `${indent}<${tagName} xyz="${xyzStr}" rpy="${rpyStr}"/>`;
}

// ============================================================================
// URDF Generator
// ============================================================================

/**
 * Generate a complete URDF XML string from articulated object data.
 *
 * This function converts Infinigen's JointInfo array and mesh geometry map
 * into a valid URDF robot description. It:
 * 1. Builds a link tree from parent-child joint relationships
 * 2. Creates URDF links with visual, collision, and inertial data
 * 3. Creates URDF joints with proper type mapping, limits, and dynamics
 * 4. Outputs properly indented URDF XML
 *
 * @param name - Robot model name
 * @param joints - Array of JointInfo describing the kinematic structure
 * @param meshGeometries - Map of mesh names to their geometry data (size, position, optional mass)
 * @param options - Export options controlling output format
 * @returns Valid URDF XML string
 *
 * @example
 * ```ts
 * const urdf = generateURDF('door', joints, meshMap, {
 *   includeInertial: true,
 *   includeCollision: true,
 *   estimateMassFromGeometry: true,
 * });
 * ```
 */
export function generateURDF(
  name: string,
  joints: JointInfo[],
  meshGeometries: Map<string, { size: THREE.Vector3; pos: THREE.Vector3; mass?: number }>,
  options?: URDFExportOptions
): string {
  const opts: Required<URDFExportOptions> = {
    includeInertial: options?.includeInertial ?? true,
    includeCollision: options?.includeCollision ?? true,
    meshExportPath: options?.meshExportPath ?? 'meshes/',
    estimateMassFromGeometry: options?.estimateMassFromGeometry ?? true,
    defaultDensity: options?.defaultDensity ?? 500,
  };

  const lines: string[] = [];
  const I = (level: number) => '  '.repeat(level); // Indent helper

  // ------------------------------------------------------------------
  // Header
  // ------------------------------------------------------------------
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push(`<robot name="${name}" xmlns:xacro="http://www.ros.org/wiki/xacro">`);
  lines.push('');

  // ------------------------------------------------------------------
  // Build link tree from joints
  // ------------------------------------------------------------------
  const { linkParents, rootLink } = buildLinkTree(joints);

  // Collect all unique link names in order: root first, then children
  const linkNames: string[] = [rootLink];
  for (const [linkName] of linkParents) {
    if (linkName !== rootLink && !linkNames.includes(linkName)) {
      linkNames.push(linkName);
    }
  }

  // ------------------------------------------------------------------
  // Links
  // ------------------------------------------------------------------
  for (const linkName of linkNames) {
    const geo = meshGeometries.get(linkName);
    lines.push(`${I(1)}<link name="${linkName}">`);

    // -- Visual --
    if (geo) {
      lines.push(`${I(2)}<visual>`);
      lines.push(
        originToXML(
          { xyz: [geo.pos.x, geo.pos.y, geo.pos.z], rpy: [0, 0, 0] },
          I(3)
        )
      );
      const visualGeo: URDFGeometry = {
        box: { size: [geo.size.x, geo.size.y, geo.size.z] },
      };
      lines.push(`${I(3)}<geometry>`);
      lines.push(geometryToXML(visualGeo, I(4), opts.meshExportPath));
      lines.push(`${I(3)}</geometry>`);
      lines.push(`${I(2)}</visual>`);

      // -- Collision --
      if (opts.includeCollision) {
        lines.push(`${I(2)}<collision>`);
        lines.push(
          originToXML(
            { xyz: [geo.pos.x, geo.pos.y, geo.pos.z], rpy: [0, 0, 0] },
            I(3)
          )
        );
        const collisionGeo: URDFGeometry = {
          box: { size: [geo.size.x, geo.size.y, geo.size.z] },
        };
        lines.push(`${I(3)}<geometry>`);
        lines.push(geometryToXML(collisionGeo, I(4), opts.meshExportPath));
        lines.push(`${I(3)}</geometry>`);
        lines.push(`${I(2)}</collision>`);
      }

      // -- Inertial --
      if (opts.includeInertial) {
        let mass = geo.mass;
        if (mass === undefined || mass === null) {
          if (opts.estimateMassFromGeometry) {
            mass = estimateMassFromGeometry(
              { box: { size: [geo.size.x, geo.size.y, geo.size.z] } },
              opts.defaultDensity
            );
          } else {
            mass = 1.0; // Default 1kg
          }
        }

        const inertia = estimateInertia(mass, geo.size);

        lines.push(`${I(2)}<inertial>`);
        lines.push(
          originToXML(
            { xyz: [geo.pos.x, geo.pos.y, geo.pos.z], rpy: [0, 0, 0] },
            I(3)
          )
        );
        lines.push(`${I(3)}<mass value="${fmt(mass)}"/>`);
        lines.push(
          `${I(3)}<inertia ixx="${fmt(inertia.ixx)}" ixy="${fmt(inertia.ixy)}" ixz="${fmt(inertia.ixz)}" iyy="${fmt(inertia.iyy)}" iyz="${fmt(inertia.iyz)}" izz="${fmt(inertia.izz)}"/>`
        );
        lines.push(`${I(2)}</inertial>`);
      }
    } else {
      // Link without geometry: minimal visual + inertial
      lines.push(`${I(2)}<visual>`);
      lines.push(`${I(3)}<geometry>`);
      lines.push(`${I(4)}<box size="0.001 0.001 0.001"/>`);
      lines.push(`${I(3)}</geometry>`);
      lines.push(`${I(2)}</visual>`);

      if (opts.includeInertial) {
        const mass = 0.001; // Near-zero mass for virtual links
        const inertia = estimateInertia(mass, new THREE.Vector3(0.001, 0.001, 0.001));
        lines.push(`${I(2)}<inertial>`);
        lines.push(
          originToXML({ xyz: [0, 0, 0], rpy: [0, 0, 0] }, I(3))
        );
        lines.push(`${I(3)}<mass value="${fmt(mass)}"/>`);
        lines.push(
          `${I(3)}<inertia ixx="${fmt(inertia.ixx)}" ixy="${fmt(inertia.ixy)}" ixz="${fmt(inertia.ixz)}" iyy="${fmt(inertia.iyy)}" iyz="${fmt(inertia.iyz)}" izz="${fmt(inertia.izz)}"/>`
        );
        lines.push(`${I(2)}</inertial>`);
      }
    }

    lines.push(`${I(1)}</link>`);
    lines.push('');
  }

  // ------------------------------------------------------------------
  // Joints
  // ------------------------------------------------------------------
  for (const joint of joints) {
    const urdfType = jointTypeToURDF(joint.type);
    const parentLinkName = joint.parentMesh || rootLink;
    const childLinkName = joint.childMesh;

    lines.push(`${I(1)}<joint name="${joint.id}" type="${urdfType}">`);
    lines.push(`${I(2)}<parent link="${parentLinkName}"/>`);
    lines.push(`${I(2)}<child link="${childLinkName}"/>`);

    // Origin: from anchor point
    lines.push(
      originToXML(
        {
          xyz: [joint.anchor.x, joint.anchor.y, joint.anchor.z],
          rpy: [0, 0, 0],
        },
        I(2)
      )
    );

    // Axis
    const axisVec: [number, number, number] = [
      joint.axis.x,
      joint.axis.y,
      joint.axis.z,
    ];
    lines.push(`${I(2)}<axis xyz="${fmtTuple3(axisVec)}"/>`);

    // Limits (required for revolute and prismatic)
    if (urdfType === 'revolute' || urdfType === 'prismatic') {
      const effort = joint.motor?.gearRatio
        ? Math.abs(joint.motor.ctrlRange[1]) * joint.motor.gearRatio
        : 100.0; // Default 100 N·m or N
      const velocity = 10.0; // Default 10 rad/s or m/s

      lines.push(
        `${I(2)}<limit lower="${fmt(joint.limits.min)}" upper="${fmt(joint.limits.max)}" effort="${fmt(effort)}" velocity="${fmt(velocity)}"/>`
      );
    }

    // Dynamics (damping + friction)
    if (joint.damping > 0 || joint.friction > 0) {
      lines.push(
        `${I(2)}<damping value="${fmt(joint.damping)}"/>`
      );
      lines.push(
        `${I(2)}<friction value="${fmt(joint.friction)}"/>`
      );
    }

    lines.push(`${I(1)}</joint>`);
    lines.push('');
  }

  // ------------------------------------------------------------------
  // Footer
  // ------------------------------------------------------------------
  lines.push('</robot>');

  return lines.join('\n');
}
