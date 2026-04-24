import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Configuration for procedural tree generation
 */
export interface TreeConfig {
  // Trunk properties
  trunkHeight: number;
  trunkRadius: number;
  trunkSegments: number;
  trunkColor: THREE.Color;
  
  // Branching properties
  maxDepth: number;
  branchLength: number;
  branchLengthVariation: number;
  branchRadius: number;
  branchRadiusTaper: number;
  branchAngle: number;
  branchAngleVariation: number;
  branchesPerNode: number;
  
  // Leaf properties
  hasLeaves: boolean;
  leafSize: number;
  leafDensity: number;
  leafColor: THREE.Color;
  leafShape: 'sphere' | 'box' | 'dodecahedron';
  
  // Variation
  seed?: number;
  randomness: number;
}

/**
 * Procedural Tree Generator
 * Generates realistic trees using recursive branching algorithms
 */
export class TreeGenerator {
  private config: TreeConfig;
  
  constructor(config: Partial<TreeConfig> = {}) {
    this.config = {
      trunkHeight: 4,
      trunkRadius: 0.3,
      trunkSegments: 8,
      trunkColor: new THREE.Color(0x5c4033),
      maxDepth: 4,
      branchLength: 2.5,
      branchLengthVariation: 0.3,
      branchRadius: 0.15,
      branchRadiusTaper: 0.7,
      branchAngle: Math.PI / 6,
      branchAngleVariation: 0.2,
      branchesPerNode: 3,
      hasLeaves: true,
      leafSize: 0.3,
      leafDensity: 0.7,
      leafColor: new THREE.Color(0x228b22),
      leafShape: 'dodecahedron',
      randomness: 0.3,
      ...config
    };
  }

  /**
   * Generate a complete tree mesh
   */
  generate(): THREE.Group {
    const group = new THREE.Group();
    
    // Generate trunk and branches
    const trunkGeo = this.createTrunk();
    const branchGeos = this.generateBranches(
      new THREE.Vector3(0, this.config.trunkHeight, 0),
      new THREE.Vector3(0, 1, 0),
      this.config.branchRadius,
      0
    );
    
    // Merge wood geometries
    const allWoodGeos = [trunkGeo, ...branchGeos].filter((g): g is THREE.BufferGeometry => g !== null);
    if (allWoodGeos.length > 0) {
      const mergedWood = mergeGeometries(allWoodGeos);
      const woodMat = new THREE.MeshStandardMaterial({
        color: this.config.trunkColor,
        roughness: 0.9,
        bumpScale: 0.02
      });
      const woodMesh = new THREE.Mesh(mergedWood, woodMat);
      woodMesh.castShadow = true;
      woodMesh.receiveShadow = true;
      group.add(woodMesh);
    }
    
    // Generate leaves
    if (this.config.hasLeaves) {
      const leaves = this.generateLeaves();
      if (leaves) {
        group.add(leaves);
      }
    }
    
    return group;
  }

  /**
   * Create the main trunk
   */
  private createTrunk(): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(
      this.config.trunkRadius,
      this.config.trunkRadius * 0.8,
      this.config.trunkHeight,
      this.config.trunkSegments
    );
    geometry.translate(0, this.config.trunkHeight / 2, 0);
    return geometry;
  }

  /**
   * Recursively generate branches
   */
  private generateBranches(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    radius: number,
    depth: number
  ): THREE.BufferGeometry[] {
    if (depth >= this.config.maxDepth || radius < 0.01) {
      return [];
    }

    const geometries: THREE.BufferGeometry[] = [];
    
    // Calculate branch length with variation
    const lengthVariation = 1 + (Math.random() - 0.5) * this.config.branchLengthVariation;
    const length = this.config.branchLength * lengthVariation * Math.pow(0.8, depth);
    
    // Create branch geometry
    const endPos = position.clone().add(direction.clone().multiplyScalar(length));
    const branchGeo = new THREE.CylinderGeometry(
      radius,
      radius * this.config.branchRadiusTaper,
      length,
      Math.max(5, Math.floor(this.config.trunkSegments * Math.pow(0.8, depth)))
    );
    
    // Align cylinder to direction
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    branchGeo.applyQuaternion(quaternion);
    branchGeo.translate(position.x, position.y, position.z);
    branchGeo.translate(0, length / 2, 0);
    
    geometries.push(branchGeo);
    
    // Generate child branches
    for (let i = 0; i < this.config.branchesPerNode; i++) {
      const angle = this.config.branchAngle + (Math.random() - 0.5) * this.config.branchAngleVariation;
      const rotationAxis = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      
      const newDirection = direction.clone().applyAxisAngle(rotationAxis, angle);
      
      if (this.config.randomness > 0) {
        newDirection.x += (Math.random() - 0.5) * this.config.randomness;
        newDirection.y += (Math.random() - 0.5) * this.config.randomness;
        newDirection.z += (Math.random() - 0.5) * this.config.randomness;
        newDirection.normalize();
      }
      
      const childRadius = radius * this.config.branchRadiusTaper;
      const childBranches = this.generateBranches(endPos, newDirection, childRadius, depth + 1);
      geometries.push(...childBranches);
    }
    
    return geometries;
  }

  /**
   * Generate foliage/leaves
   */
  private generateLeaves(): THREE.Group | null {
    const leavesGroup = new THREE.Group();
    const leafMat = new THREE.MeshStandardMaterial({
      color: this.config.leafColor,
      roughness: 0.8,
      side: THREE.DoubleSide
    });
    
    const leafCount = Math.floor(50 * this.config.leafDensity * this.config.maxDepth);
    const leafGeometries: THREE.BufferGeometry[] = [];
    
    for (let i = 0; i < leafCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const heightFactor = Math.pow(Math.random(), 0.5);
      const radiusFactor = Math.sqrt(Math.random()) * (1 - heightFactor);
      
      const x = radiusFactor * this.config.branchLength * 2 * Math.cos(angle);
      const y = this.config.trunkHeight * 0.5 + heightFactor * this.config.branchLength * 2;
      const z = radiusFactor * this.config.branchLength * 2 * Math.sin(angle);
      
      let leafGeo: THREE.BufferGeometry;
      
      switch (this.config.leafShape) {
        case 'box':
          leafGeo = new THREE.BoxGeometry(this.config.leafSize, this.config.leafSize, this.config.leafSize);
          break;
        case 'sphere':
          leafGeo = new THREE.SphereGeometry(this.config.leafSize / 2, 4, 4);
          break;
        case 'dodecahedron':
        default:
          leafGeo = new THREE.DodecahedronGeometry(this.config.leafSize / 2, 0);
          break;
      }
      
      leafGeo.translate(x, y, z);
      
      const rotation = new THREE.Euler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      leafGeo.rotateX(rotation.x);
      leafGeo.rotateY(rotation.y);
      leafGeo.rotateZ(rotation.z);
      
      const scale = 0.8 + Math.random() * 0.4;
      leafGeo.scale(scale, scale, scale);
      
      leafGeometries.push(leafGeo);
    }
    
    if (leafGeometries.length > 0) {
      const mergedLeaves = mergeGeometries(leafGeometries);
      const leavesMesh = new THREE.Mesh(mergedLeaves, leafMat);
      leavesMesh.castShadow = true;
      leavesMesh.receiveShadow = true;
      leavesGroup.add(leavesMesh);
    }
    
    return leavesGroup;
  }

  /**
   * Update configuration and regenerate
   */
  setConfig(config: Partial<TreeConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
