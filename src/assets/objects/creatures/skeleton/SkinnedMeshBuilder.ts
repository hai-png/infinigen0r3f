/**
 * SkinnedMeshBuilder - Creates skinned meshes with proper bone weight assignments
 * Maps vertices to their nearest bones using inverse distance weighting,
 * respecting the GPU skinning limit of 4 bone influences per vertex.
 */

import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Skeleton,
  SkinnedMesh,
  Bone,
  Vector3,
  Material,
  MeshStandardMaterial,
} from 'three';

/** Maximum number of bone influences per vertex (GPU skinning limit) */
const MAX_BONE_INFLUENCES = 4;

export class SkinnedMeshBuilder {
  /**
   * Build a THREE.SkinnedMesh from a geometry, skeleton, and optional per-bone weight overrides.
   *
   * For each vertex, the N closest bones are found (N = MAX_BONE_INFLUENCES).
   * Weights are computed using inverse-distance weighting and normalized so they sum to 1.
   *
   * @param geometry  - The body geometry (will be mutated with skinIndex/skinWeight attributes)
   * @param skeleton  - The THREE.Skeleton to bind
   * @param boneWeights - Optional map of bone name → weight multiplier (default 1 for all)
   * @param material  - Optional material (defaults to a simple MeshStandardMaterial)
   */
  buildSkinnedMesh(
    geometry: BufferGeometry,
    skeleton: Skeleton,
    boneWeights: Map<string, number[]> = new Map(),
    material?: Material,
  ): SkinnedMesh {
    // Ensure geometry has position data
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) {
      throw new Error('SkinnedMeshBuilder: geometry must have a position attribute');
    }

    const vertexCount = posAttr.count;
    const bones = skeleton.bones;

    // Compute world positions for all bones (needed for distance calculations)
    const boneWorldPositions = this.computeBoneWorldPositions(bones);

    // Build a name → index lookup for the bone array
    const boneNameToIndex = new Map<string, number>();
    for (let i = 0; i < bones.length; i++) {
      boneNameToIndex.set(bones[i].name, i);
    }

    // Allocate skin index and weight arrays
    // Each vertex has MAX_BONE_INFLUENCES bone references
    const skinIndices = new Uint16Array(vertexCount * MAX_BONE_INFLUENCES);
    const skinWeights = new Float32Array(vertexCount * MAX_BONE_INFLUENCES);

    const vertexPos = new Vector3();

    for (let v = 0; v < vertexCount; v++) {
      vertexPos.fromBufferAttribute(posAttr as Float32BufferAttribute, v);

      // Compute distance from this vertex to every bone
      const dists: { index: number; dist: number; name: string }[] = [];
      for (let b = 0; b < bones.length; b++) {
        const dist = vertexPos.distanceTo(boneWorldPositions[b]);
        dists.push({ index: b, dist, name: bones[b].name });
      }

      // Sort by distance ascending — closest first
      dists.sort((a, b) => a.dist - b.dist);

      // Take the N closest bones
      const closest = dists.slice(0, MAX_BONE_INFLUENCES);

      // Compute inverse-distance weights
      let totalWeight = 0;
      const weights: number[] = [];

      for (const entry of closest) {
        // Apply optional weight multiplier from the boneWeights map
        const multiplier = this.getWeightMultiplier(entry.name, boneWeights);
        // Use a small epsilon to avoid division by zero for coincident vertices
        const invDist = 1.0 / Math.max(entry.dist, 0.0001);
        const w = invDist * multiplier;
        weights.push(w);
        totalWeight += w;
      }

      // Normalize weights so they sum to 1
      const normalizedWeights = totalWeight > 0
        ? weights.map(w => w / totalWeight)
        : weights.map((_, i) => i === 0 ? 1.0 : 0.0);

      // Write into the arrays
      for (let j = 0; j < MAX_BONE_INFLUENCES; j++) {
        skinIndices[v * MAX_BONE_INFLUENCES + j] = closest[j]?.index ?? 0;
        skinWeights[v * MAX_BONE_INFLUENCES + j] = normalizedWeights[j] ?? 0;
      }
    }

    // Assign skinIndex and skinWeight attributes to the geometry
    geometry.setAttribute(
      'skinIndex',
      new Float32BufferAttribute(skinIndices, MAX_BONE_INFLUENCES),
    );
    geometry.setAttribute(
      'skinWeight',
      new Float32BufferAttribute(skinWeights, MAX_BONE_INFLUENCES),
    );

    // Create the skinned mesh
    const mesh = new SkinnedMesh(geometry, material ?? this.defaultMaterial());
    mesh.name = 'skinnedBody';

    // Add the root bone to the mesh so the skeleton is part of the scene graph
    if (bones.length > 0) {
      mesh.add(bones[0]);
    }

    // Bind the skeleton
    this.bindSkeleton(mesh, skeleton);

    return mesh;
  }

  /**
   * Bind a skeleton to an existing SkinnedMesh.
   * Computes the bind matrix from the current world transform if not provided.
   */
  bindSkeleton(
    mesh: SkinnedMesh,
    skeleton: Skeleton,
    bindMatrix?: Matrix4,
  ): void {
    // Ensure bones are updated before binding
    skeleton.calculateInverses();

    if (bindMatrix) {
      mesh.bind(skeleton, bindMatrix);
    } else {
      // Use the mesh's current world matrix as the bind matrix
      mesh.updateMatrixWorld(true);
      mesh.bind(skeleton, mesh.matrixWorld);
    }
  }

  // ── Internal Helpers ─────────────────────────────────────────────

  /**
   * Compute the world-space position of each bone.
   * Temporarily forces a world matrix update.
   */
  private computeBoneWorldPositions(bones: Bone[]): Vector3[] {
    // Ensure the bone hierarchy has up-to-date world matrices
    if (bones.length > 0) {
      bones[0].updateWorldMatrix(true, true);
    }

    return bones.map(bone => {
      const wp = new Vector3();
      bone.getWorldPosition(wp);
      return wp;
    });
  }

  /**
   * Look up the weight multiplier for a bone from the boneWeights map.
   * Returns 1.0 if no override is specified.
   *
   * The boneWeights map values are arrays of numbers (one per weight slot).
   * We use the first element as a simple multiplier here.
   */
  private getWeightMultiplier(boneName: string, boneWeights: Map<string, number[]>): number {
    const weights = boneWeights.get(boneName);
    if (weights && weights.length > 0) {
      return weights[0];
    }
    return 1.0;
  }

  /**
   * Create a simple default material for skinned meshes.
   * Callers should override with their own material.
   */
  private defaultMaterial(): Material {
    const mat = new MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.8,
      metalness: 0.0,
    });
    (mat as any).skinning = true;
    return mat;
  }
}
