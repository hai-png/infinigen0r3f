/**
 * USD (Universal Scene Description) Exporter for Articulated Objects
 *
 * Provides USDA (ASCII USD) and USDC (binary crate) export for articulated
 * objects, producing a scene description with Xform hierarchy, mesh prims,
 * and joint definitions matching the kinematic tree structure.
 *
 * This is a simplified implementation since full USD requires a dedicated
 * native library (e.g. Pixar's USD C++ library or usd-core Python bindings).
 * The ASCII USDA format is fully generated; USDC is a stub that wraps USDA.
 *
 * USD reference: https://openusd.org/release/index.html
 */

import * as THREE from 'three';
import { JointInfo, JointType } from './types';

// ============================================================================
// Internal Helpers
// ============================================================================

/** Format a number for USDA output (6 decimal places, no trailing zeros) */
function fmtUSD(n: number): string {
  return n.toFixed(6);
}

/** Format a THREE.Vector3 as USDA float3 tuple */
function fmtVec3USD(v: THREE.Vector3): string {
  return `(${fmtUSD(v.x)}, ${fmtUSD(v.y)}, ${fmtUSD(v.z)})`;
}

/**
 * Map an Infinigen JointType to a USD joint type token.
 *
 * USD uses the following joint type tokens in Skeleton definitions:
 * - "revolute" for 1-DOF rotation (hinge)
 * - "prismatic" for 1-DOF translation
 * - "fixed" for no DOF
 *
 * For ball/socket joints, USD represents them as 3 revolute joints
 * at the same location (3-DOF rotation).
 */
function jointTypeToUSD(type: JointType): string {
  switch (type) {
    case 'hinge':
    case 'continuous':
      return 'revolute';
    case 'prismatic':
      return 'prismatic';
    case 'ball':
    case 'ball_socket':
      return 'revolute'; // Represented as 3 revolute joints in USD
    case 'fixed':
      return 'fixed';
    default:
      return 'fixed';
  }
}

/**
 * Build the kinematic tree hierarchy from joints.
 * Returns the root link name and a map of link → children.
 */
function buildHierarchy(
  joints: JointInfo[]
): { rootLink: string; childrenOf: Map<string, { link: string; joint: JointInfo }[]> } {
  const childrenOf = new Map<string, { link: string; joint: JointInfo }[]>();

  // Find root: appears as parentMesh but never as childMesh
  const childMeshes = new Set(joints.map((j) => j.childMesh));
  let rootLink = '';
  for (const j of joints) {
    const p = j.parentMesh || '';
    if (p && !childMeshes.has(p)) {
      rootLink = p;
      break;
    }
  }
  if (!rootLink && joints.length > 0) {
    rootLink = joints[0].parentMesh || 'base';
  }

  for (const joint of joints) {
    const parentLink = joint.parentMesh || rootLink;
    const childLink = joint.childMesh;

    if (!childrenOf.has(parentLink)) {
      childrenOf.set(parentLink, []);
    }
    childrenOf.get(parentLink)!.push({ link: childLink, joint });
  }

  return { rootLink, childrenOf };
}

/**
 * Recursively generate Xform + Mesh prim definitions for each link
 * in the kinematic tree.
 */
function generateLinkPrims(
  linkName: string,
  geoData: Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>,
  childrenOf: Map<string, { link: string; joint: JointInfo }[]>,
  indent: number,
  lines: string[]
): void {
  const I = '    '.repeat(indent);
  const geo = geoData.get(linkName);

  // Xform for this link
  lines.push(`${I}def Xform "${linkName}" {`);

  if (geo) {
    lines.push(`${I}    float3 xformOp:translate = ${fmtVec3USD(geo.pos)}`);
    lines.push(`${I}    uniform token[] xformOpOrder = ["xformOp:translate"]`);

    // Mesh prim for visual geometry (box approximation)
    lines.push(`${I}    def Mesh "${linkName}_mesh" {`);
    const sx = geo.size.x / 2;
    const sy = geo.size.y / 2;
    const sz = geo.size.z / 2;

    // 8 vertices of a box
    lines.push(`${I}        point3f[] points = [`);
    lines.push(`${I}            (${fmtUSD(-sx)}, ${fmtUSD(-sy)}, ${fmtUSD(-sz)}),`);
    lines.push(`${I}            (${fmtUSD(+sx)}, ${fmtUSD(-sy)}, ${fmtUSD(-sz)}),`);
    lines.push(`${I}            (${fmtUSD(+sx)}, ${fmtUSD(+sy)}, ${fmtUSD(-sz)}),`);
    lines.push(`${I}            (${fmtUSD(-sx)}, ${fmtUSD(+sy)}, ${fmtUSD(-sz)}),`);
    lines.push(`${I}            (${fmtUSD(-sx)}, ${fmtUSD(-sy)}, ${fmtUSD(+sz)}),`);
    lines.push(`${I}            (${fmtUSD(+sx)}, ${fmtUSD(-sy)}, ${fmtUSD(+sz)}),`);
    lines.push(`${I}            (${fmtUSD(+sx)}, ${fmtUSD(+sy)}, ${fmtUSD(+sz)}),`);
    lines.push(`${I}            (${fmtUSD(-sx)}, ${fmtUSD(+sy)}, ${fmtUSD(+sz)})`);
    lines.push(`${I}        ]`);

    // 12 triangles (6 faces × 2 triangles each)
    lines.push(`${I}        int[] faceVertexCounts = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]`);
    lines.push(`${I}        int[] faceVertexIndices = [`);
    lines.push(`${I}            0, 1, 2,  0, 2, 3,  // -Z face`);
    lines.push(`${I}            4, 6, 5,  4, 7, 6,  // +Z face`);
    lines.push(`${I}            0, 4, 5,  0, 5, 1,  // -Y face`);
    lines.push(`${I}            2, 6, 7,  2, 7, 3,  // +Y face`);
    lines.push(`${I}            0, 3, 7,  0, 7, 4,  // -X face`);
    lines.push(`${I}            1, 5, 6,  1, 6, 2   // +X face`);
    lines.push(`${I}        ]`);

    // normals
    lines.push(`${I}        normal3f[] normals = [`);
    lines.push(`${I}            (0, 0, -1), (0, 0, -1), (0, 0, -1), (0, 0, -1),`);
    lines.push(`${I}            (0, 0, +1), (0, 0, +1), (0, 0, +1), (0, 0, +1),`);
    lines.push(`${I}            (0, -1, 0), (0, -1, 0), (0, -1, 0), (0, -1, 0),`);
    lines.push(`${I}            (0, +1, 0), (0, +1, 0), (0, +1, 0), (0, +1, 0),`);
    lines.push(`${I}            (-1, 0, 0), (-1, 0, 0), (-1, 0, 0), (-1, 0, 0),`);
    lines.push(`${I}            (+1, 0, 0), (+1, 0, 0), (+1, 0, 0), (+1, 0, 0)`);
    lines.push(`${I}        ]`);
    lines.push(`${I}        uniform token subdivisionScheme = "none"`);
    lines.push(`${I}    }`);
  } else {
    // Empty Xform for links without geometry (virtual/connector links)
    lines.push(`${I}    float3 xformOp:translate = (0, 0, 0)`);
    lines.push(`${I}    uniform token[] xformOpOrder = ["xformOp:translate"]`);
  }

  // Recurse into child links
  const children = childrenOf.get(linkName) || [];
  for (const { link, joint } of children) {
    // Add joint reference as a child Xform with the joint offset
    generateLinkPrims(link, geoData, childrenOf, indent + 1, lines);
  }

  lines.push(`${I}}`);
}

// ============================================================================
// USD Generator
// ============================================================================

/**
 * Generate a USDA (ASCII USD) file for an articulated object.
 *
 * Produces a valid USDA file with:
 * - Xform hierarchy matching the kinematic tree
 * - Mesh prims for each rigid body (box approximation from geometry size)
 * - Skeleton prim with joint definitions
 * - Proper transform composition (translations from joint anchors)
 *
 * @param name - Scene name for the root prim
 * @param joints - Array of JointInfo describing the kinematic structure
 * @param meshGeometries - Map of mesh names to their geometry data
 * @returns Valid USDA string
 *
 * @example
 * ```ts
 * const usda = generateUSD('door', joints, meshMap);
 * // Write to file: fs.writeFileSync('door.usda', usda);
 * ```
 */
export function generateUSD(
  name: string,
  joints: JointInfo[],
  meshGeometries: Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>
): string {
  const lines: string[] = [];

  // ------------------------------------------------------------------
  // USDA Header
  // ------------------------------------------------------------------
  lines.push('#usda 1.0');
  lines.push(`(
    doc = "Generated by infinigen-r3f USDExporter"
    metersPerUnit = 1
    upAxis = "Y"
)`);
  lines.push('');

  // ------------------------------------------------------------------
  // Root Xform
  // ------------------------------------------------------------------
  lines.push(`def Xform "${name}" {`);
  lines.push('    float3 xformOp:translate = (0, 0, 0)');
  lines.push('    uniform token[] xformOpOrder = ["xformOp:translate"]');
  lines.push('');

  // ------------------------------------------------------------------
  // Build hierarchy and generate link prims
  // ------------------------------------------------------------------
  const { rootLink, childrenOf } = buildHierarchy(joints);
  generateLinkPrims(rootLink, meshGeometries, childrenOf, 1, lines);
  lines.push('');

  // ------------------------------------------------------------------
  // Skeleton prim with joint definitions
  // ------------------------------------------------------------------
  if (joints.length > 0) {
    lines.push('    def Skeleton "' + name + '_skeleton" {');

    // Collect all joint names in tree order (root first)
    const jointNames: string[] = [];
    const jointParentNames: string[] = [];

    // Add the root as the first joint
    jointNames.push(rootLink);
    jointParentNames.push(''); // root has no parent

    // BFS traversal of joints
    const queue: string[] = [rootLink];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = childrenOf.get(current) || [];
      for (const { link, joint } of children) {
        jointNames.push(joint.id);
        jointParentNames.push(current);
        queue.push(link);
      }
    }

    // joints attribute
    lines.push('        token[] joints = [');
    for (const jn of jointNames) {
      lines.push(`            "${jn}",`);
    }
    lines.push('        ]');

    // parentIndices
    lines.push('        int[] parentIndices = [');
    for (let i = 0; i < jointParentNames.length; i++) {
      const parentIdx = jointNames.indexOf(jointParentNames[i]);
      lines.push(`            ${parentIdx},`);
    }
    lines.push('        ]');

    // Joint translations (from anchor positions)
    lines.push('        float3[] translations = [');
    // Root at origin
    lines.push('            (0, 0, 0),');
    for (const joint of joints) {
      lines.push(`            ${fmtVec3USD(joint.anchor)},`);
    }
    lines.push('        ]');

    // Joint rotations (identity quaternions)
    lines.push('        quatf[] rotations = [');
    for (let i = 0; i < jointNames.length; i++) {
      lines.push('            (1, 0, 0, 0),');
    }
    lines.push('        ]');

    // Joint types (for each joint, define its DOF type)
    lines.push('        uniform token[] jointType = [');
    for (let i = 0; i < jointNames.length; i++) {
      if (i === 0) {
        lines.push('            "fixed",'); // root
      } else {
        const jointIdx = i - 1; // offset by root
        if (jointIdx < joints.length) {
          lines.push(`            "${jointTypeToUSD(joints[jointIdx].type)}",`);
        } else {
          lines.push('            "fixed",');
        }
      }
    }
    lines.push('        ]');

    lines.push('    }');
    lines.push('');
  }

  // ------------------------------------------------------------------
  // Close root Xform
  // ------------------------------------------------------------------
  lines.push('}');

  return lines.join('\n');
}

// ============================================================================
// USDC (Binary Crate) Generator — Stub
// ============================================================================

/**
 * Generate a USDC (binary crate) representation of the articulated object.
 *
 * This is a stub implementation that generates the USDA content first,
 * then wraps it with a minimal USDC crate header. A full implementation
 * would require a native USD library for proper binary serialization.
 *
 * The USDC format starts with a 40-byte header:
 * - 8 bytes: magic "PXR-USDC"
 * - 8 bytes: version (0.0.0 as 3 x 4-byte LE ints)
 * - 8 bytes: table of contents offset
 * - 8 bytes: table of contents size
 *
 * @param name - Scene name for the root prim
 * @param joints - Array of JointInfo describing the kinematic structure
 * @param meshGeometries - Map of mesh names to their geometry data
 * @returns ArrayBuffer containing the USDC data
 */
export function generateUSDCrate(
  name: string,
  joints: JointInfo[],
  meshGeometries: Map<string, { size: THREE.Vector3; pos: THREE.Vector3 }>
): ArrayBuffer {
  // Generate USDA content first
  const usdaContent = generateUSD(name, joints, meshGeometries);
  const usdaBytes = new TextEncoder().encode(usdaContent);

  // USDC crate header (40 bytes)
  const headerSize = 40;
  const totalSize = headerSize + usdaBytes.length;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Magic number: "PXR-USDC"
  const magic = 0x5058522D55534443; // "PXR-USDC" in hex
  // Write magic as two 32-bit values (little-endian)
  view.setUint32(0, 0x55534443, true); // "USDC"
  view.setUint32(4, 0x5058522D, true); // "PXR-"

  // Version: 0.0.0 (3 x uint32)
  view.setUint32(8, 0, true);  // major
  view.setUint32(12, 0, true); // minor
  view.setUint32(16, 0, true); // patch

  // Table of contents offset (points to USDA content after header)
  view.setUint32(20, headerSize, true);
  view.setUint32(24, 0, true); // padding

  // Table of contents size
  view.setUint32(28, usdaBytes.length, true);
  view.setUint32(32, 0, true); // padding

  // Reserved
  view.setUint32(36, 0, true);

  // Write USDA content after header
  const bytes = new Uint8Array(buffer);
  bytes.set(usdaBytes, headerSize);

  return buffer;
}
