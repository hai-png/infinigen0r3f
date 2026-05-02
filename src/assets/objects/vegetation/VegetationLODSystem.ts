/**
 * VegetationLODSystem - Level of Detail system for vegetation
 *
 * Provides three LOD levels for trees and vegetation:
 *   LOD0: Full geometry with all branches, leaves, and textures
 *   LOD1: Reduced geometry with fewer branches and merged leaf clusters
 *   LOD2: Billboard (camera-facing sprite) for distant objects
 *
 * Uses InstancedMesh for LOD2 billboards for performance with many distant trees.
 * Distance thresholds are configurable per-vegetation type.
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { createCanvas } from '@/assets/utils/CanvasUtils';

// ============================================================================
// Types
// ============================================================================

export interface LODLevelConfig {
  /** Distance at which this LOD level begins */
  minDistance: number;
  /** Distance at which this LOD level ends */
  maxDistance: number;
}

export interface VegetationLODConfig {
  /** LOD distance thresholds */
  lodDistances: LODLevelConfig[];
  /** Number of billboard angles to pre-render (4-8) */
  billboardAngles: number;
  /** Billboard sprite resolution */
  billboardResolution: number;
  /** Whether to use instanced rendering for LOD2 */
  useInstancedBillboards: boolean;
}

export interface VegetationInstance {
  /** The full-detail mesh group */
  mesh: THREE.Group;
  /** World position */
  position: THREE.Vector3;
  /** Y-axis rotation */
  rotation: number;
  /** Uniform scale */
  scale: number;
  /** Vegetation type for LOD grouping */
  type: string;
  /** Pre-computed LOD level */
  currentLOD: number;
}

// ============================================================================
// VegetationLODSystem
// ============================================================================

export class VegetationLODSystem {
  private config: VegetationLODConfig;
  private instances: VegetationInstance[] = [];
  private billboardCache: Map<string, THREE.CanvasTexture> = new Map();
  private lodGroups: Map<number, THREE.Group> = new Map();
  private camera: THREE.Camera | null = null;
  private rng: SeededRandom;

  constructor(config: Partial<VegetationLODConfig> = {}, seed: number = 42) {
    this.rng = new SeededRandom(seed);
    this.config = {
      lodDistances: [
        { minDistance: 0, maxDistance: 50 },
        { minDistance: 50, maxDistance: 120 },
        { minDistance: 120, maxDistance: 500 },
      ],
      billboardAngles: 6,
      billboardResolution: 128,
      useInstancedBillboards: true,
      ...config,
    };

    // Initialize LOD groups
    for (let i = 0; i < 3; i++) {
      this.lodGroups.set(i, new THREE.Group());
    }
  }

  /**
   * Set the camera for distance calculations
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Register a vegetation instance for LOD management
   */
  addInstance(instance: VegetationInstance): void {
    this.instances.push(instance);
  }

  /**
   * Add multiple instances
   */
  addInstances(instances: VegetationInstance[]): void {
    this.instances.push(...instances);
  }

  /**
   * Get the LOD group for a specific level
   */
  getLODGroup(level: number): THREE.Group {
    return this.lodGroups.get(level) ?? new THREE.Group();
  }

  /**
   * Get all LOD groups as an array
   */
  getAllLODGroups(): THREE.Group[] {
    return [this.lodGroups.get(0)!, this.lodGroups.get(1)!, this.lodGroups.get(2)!];
  }

  /**
   * Update LOD levels based on camera position
   */
  update(): void {
    if (!this.camera) return;

    const cameraPos = this.camera.position;

    for (const instance of this.instances) {
      const distance = cameraPos.distanceTo(instance.position);
      const newLOD = this.computeLODLevel(distance);

      if (newLOD !== instance.currentLOD) {
        this.switchLOD(instance, instance.currentLOD, newLOD);
        instance.currentLOD = newLOD;
      }
    }
  }

  /**
   * Compute LOD level from distance
   */
  private computeLODLevel(distance: number): number {
    for (let i = 0; i < this.config.lodDistances.length; i++) {
      const lodConfig = this.config.lodDistances[i];
      if (distance >= lodConfig.minDistance && distance < lodConfig.maxDistance) {
        return i;
      }
    }
    return this.config.lodDistances.length - 1;
  }

  /**
   * Switch an instance between LOD levels
   */
  private switchLOD(instance: VegetationInstance, fromLOD: number, toLOD: number): void {
    const fromGroup = this.lodGroups.get(fromLOD);
    const toGroup = this.lodGroups.get(toLOD);

    if (fromGroup) {
      // Remove from old LOD group
      const children = fromGroup.children;
      for (let i = children.length - 1; i >= 0; i--) {
        if (children[i].userData.instanceId === this.getInstanceId(instance)) {
          fromGroup.remove(children[i]);
          break;
        }
      }
    }

    if (toGroup) {
      // Create appropriate representation for new LOD
      const lodObject = this.createLODRepresentation(instance, toLOD);
      lodObject.userData.instanceId = this.getInstanceId(instance);
      toGroup.add(lodObject);
    }
  }

  private getInstanceId(instance: VegetationInstance): string {
    return `${instance.type}_${instance.position.x.toFixed(2)}_${instance.position.z.toFixed(2)}`;
  }

  /**
   * Create the appropriate representation for a LOD level
   */
  private createLODRepresentation(instance: VegetationInstance, lodLevel: number): THREE.Object3D {
    switch (lodLevel) {
      case 0:
        // Full detail — clone the original mesh
        return this.createFullDetailLOD(instance);
      case 1:
        // Reduced detail — simplified geometry
        return this.createReducedLOD(instance);
      case 2:
        // Billboard — camera-facing sprite
        return this.createBillboardLOD(instance);
      default:
        return this.createBillboardLOD(instance);
    }
  }

  /**
   * LOD0: Full detail mesh
   */
  private createFullDetailLOD(instance: VegetationInstance): THREE.Group {
    const clone = instance.mesh.clone();
    clone.position.copy(instance.position);
    clone.rotation.y = instance.rotation;
    clone.scale.setScalar(instance.scale);
    return clone;
  }

  /**
   * LOD1: Reduced detail — simplified branch geometry + merged foliage
   */
  private createReducedLOD(instance: VegetationInstance): THREE.Group {
    const group = new THREE.Group();

    // Simplified trunk — single cylinder
    const trunkHeight = 5 * instance.scale;
    const trunkRadius = 0.3 * instance.scale;
    const trunkGeo = new THREE.CylinderGeometry(
      trunkRadius * 0.7, trunkRadius, trunkHeight, 6
    );
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    group.add(trunk);

    // Simplified foliage — 1-2 merged spheres
    const rng = new SeededRandom(Math.floor(instance.position.x * 100 + instance.position.z * 100));
    const foliageCount = rng.nextInt(1, 3);
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a1d,
      roughness: 0.7,
    });

    for (let i = 0; i < foliageCount; i++) {
      const radius = rng.uniform(1.5, 3.0) * instance.scale;
      const foliageGeo = new THREE.SphereGeometry(radius, 6, 4);
      const foliage = new THREE.Mesh(foliageGeo, foliageMat);
      foliage.position.set(
        (rng.next() - 0.5) * instance.scale,
        trunkHeight + rng.uniform(0, 1) * instance.scale,
        (rng.next() - 0.5) * instance.scale
      );
      foliage.castShadow = true;
      group.add(foliage);
    }

    group.position.copy(instance.position);
    group.rotation.y = instance.rotation;

    return group;
  }

  /**
   * LOD2: Billboard — camera-facing sprite
   */
  private createBillboardLOD(instance: VegetationInstance): THREE.Mesh {
    const texture = this.getBillboardTexture(instance.type);

    // Create a simple quad that faces the camera
    const aspect = 1.0;
    const height = 6 * instance.scale;
    const width = height * aspect;
    const geometry = new THREE.PlaneGeometry(width, height);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(instance.position);
    mesh.position.y += height / 2;

    // Billboard behavior: always face camera
    mesh.lookAt(this.camera?.position ?? new THREE.Vector3(0, 5, 0));

    mesh.userData.isBillboard = true;

    return mesh;
  }

  /**
   * Get or create a billboard texture for a vegetation type
   */
  private getBillboardTexture(type: string): THREE.CanvasTexture {
    if (this.billboardCache.has(type)) {
      return this.billboardCache.get(type)!;
    }

    const texture = this.generateBillboardTexture(type);
    this.billboardCache.set(type, texture);
    return texture;
  }

  /**
   * Generate a billboard texture by rendering a simplified tree silhouette
   */
  private generateBillboardTexture(type: string): THREE.CanvasTexture {
    const res = this.config.billboardResolution;
    const canvas = createCanvas();
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d')!;

    // Transparent background
    ctx.clearRect(0, 0, res, res);

    // Color palette by type
    const colors: Record<string, { trunk: string; foliage: string }> = {
      oak: { trunk: '#4a3728', foliage: '#2d5a1d' },
      pine: { trunk: '#3e2723', foliage: '#1b5e20' },
      birch: { trunk: '#e8e8e8', foliage: '#689f38' },
      palm: { trunk: '#8d6e63', foliage: '#4caf50' },
      willow: { trunk: '#5d4037', foliage: '#8bc34a' },
      default: { trunk: '#4a3728', foliage: '#2d5a1d' },
    };

    const palette = colors[type] || colors.default;

    // Draw trunk
    ctx.fillStyle = palette.trunk;
    const trunkWidth = res * 0.08;
    const trunkHeight = res * 0.45;
    ctx.fillRect(res / 2 - trunkWidth / 2, res - trunkHeight, trunkWidth, trunkHeight);

    // Draw foliage
    ctx.fillStyle = palette.foliage;
    ctx.beginPath();
    if (type === 'pine') {
      // Conical shape
      ctx.moveTo(res / 2, res * 0.1);
      ctx.lineTo(res * 0.75, res * 0.55);
      ctx.lineTo(res * 0.25, res * 0.55);
    } else {
      // Rounded canopy
      ctx.ellipse(res / 2, res * 0.4, res * 0.35, res * 0.3, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    // Add some noise/variation
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 50; i++) {
      const x = this.rng.next() * res;
      const y = this.rng.next() * res * 0.6;
      const r = this.rng.uniform(2, 6);
      ctx.fillStyle = this.rng.next() > 0.5 ? '#1a3d1a' : '#4a7c23';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Update billboard orientations to face the camera
   * Should be called each frame
   */
  updateBillboardOrientations(): void {
    if (!this.camera) return;

    const lod2Group = this.lodGroups.get(2);
    if (!lod2Group) return;

    for (const child of lod2Group.children) {
      if (child.userData.isBillboard) {
        child.lookAt(this.camera.position);
      }
    }
  }

  /**
   * Create instanced billboard mesh for all LOD2 instances of a type
   */
  createInstancedBillboards(type: string, instances: VegetationInstance[]): THREE.InstancedMesh | null {
    if (instances.length === 0) return null;

    const texture = this.getBillboardTexture(type);
    const height = 6;
    const width = 6;
    const geometry = new THREE.PlaneGeometry(width, height);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });

    const instancedMesh = new THREE.InstancedMesh(geometry, material, instances.length);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      dummy.position.copy(inst.position);
      dummy.position.y += height * inst.scale / 2;
      dummy.scale.setScalar(inst.scale);
      dummy.rotation.y = inst.rotation;

      if (this.camera) {
        dummy.lookAt(this.camera.position);
      }

      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  /**
   * Get total instance count
   */
  getInstanceCount(): number {
    return this.instances.length;
  }

  /**
   * Get instance count per LOD level
   */
  getLODCounts(): Record<number, number> {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    for (const inst of this.instances) {
      counts[inst.currentLOD] = (counts[inst.currentLOD] || 0) + 1;
    }
    return counts;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.billboardCache.forEach(tex => tex.dispose());
    this.billboardCache.clear();
    this.instances = [];
    this.lodGroups.forEach(group => {
      group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    });
  }
}
