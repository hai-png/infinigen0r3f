/**
 * Creeper Generator
 * 
 * Procedural ground cover creeping plants inspired by Infinigen's vegetation system.
 * Generates various types of creeping plants that spread across surfaces.
 * 
 * Features:
 * - Multiple creeper types (ivy, moss, groundcover, vines)
 * - Surface-adhering growth patterns
 * - Procedural stem and leaf generation
 * - Density and coverage controls
 * - Seasonal variation support
 * - LOD-based performance optimization
 */

import * as THREE from 'three';

export type CreeperType = 'ivy' | 'moss' | 'groundcover' | 'succulent' | 'clover' | 'creeping_thyme';
export type LeafShape = 'oval' | 'heart' | 'lobed' | 'needle' | 'round' | 'star';
export type GrowthPattern = 'radial' | 'linear' | 'clustered' | 'uniform';

export interface CreeperParams {
  // Type and appearance
  creeperType: CreeperType;
  leafShape: LeafShape;
  growthPattern: GrowthPattern;
  
  // Coverage
  coverageRadius: number;
  density: number;
  thickness: number;
  
  // Leaf properties
  leafSize: number;
  leafColor: THREE.Color;
  leafVariation: number;
  leafCount: number;
  
  // Stem properties
  stemColor: THREE.Color;
  stemThickness: number;
  stemBranching: number;
  
  // Growth
  maxHeight: number;
  spreadRate: number;
  clusteringFactor: number;
  
  // Seasonal
  seasonalVariation: boolean;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  
  // Performance
  lodLevel: number;
}

const DEFAULT_CREEPER_PARAMS: CreeperParams = {
  creeperType: 'ivy',
  leafShape: 'lobed',
  growthPattern: 'radial',
  coverageRadius: 2.0,
  density: 0.7,
  thickness: 0.5,
  leafSize: 0.08,
  leafColor: new THREE.Color(0x2d5a27),
  leafVariation: 0.2,
  leafCount: 100,
  stemColor: new THREE.Color(0x3d2817),
  stemThickness: 0.015,
  stemBranching: 3,
  maxHeight: 0.15,
  spreadRate: 1.0,
  clusteringFactor: 0.5,
  seasonalVariation: false,
  season: 'summer',
  lodLevel: 0,
};

/**
 * Creeper Generator Class
 */
export class CreeperGenerator {
  private params: CreeperParams;
  private group: THREE.Group;
  private materials: Map<string, THREE.Material>;
  private leafGeometry: THREE.BufferGeometry | null = null;

  constructor(params: Partial<CreeperParams> = {}) {
    this.params = { ...DEFAULT_CREEPER_PARAMS, ...params };
    this.group = new THREE.Group();
    this.materials = new Map();
    
    this.generate();
  }

  /**
   * Generate the complete creeper patch
   */
  generate(): THREE.Group {
    this.group.clear();
    this.materials.clear();
    this.leafGeometry = null;
    
    // Create materials
    this.createLeafMaterial();
    this.createStemMaterial();
    
    // Create shared leaf geometry if LOD allows
    if (this.params.lodLevel < 2) {
      this.leafGeometry = this.createLeafGeometry();
    }
    
    // Build structure based on growth pattern
    switch (this.params.growthPattern) {
      case 'radial':
        this.generateRadialGrowth();
        break;
      case 'linear':
        this.generateLinearGrowth();
        break;
      case 'clustered':
        this.generateClusteredGrowth();
        break;
      case 'uniform':
        this.generateUniformGrowth();
        break;
    }
    
    return this.group;
  }

  /**
   * Create leaf material
   */
  private createLeafMaterial(): void {
    let color = this.params.leafColor.clone();
    
    // Apply seasonal variation
    if (this.params.seasonalVariation) {
      color = this.getSeasonalColor(color);
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      metalness: 0,
      side: THREE.DoubleSide,
      name: 'leaf',
    });

    this.materials.set('leaf', material);
  }

  /**
   * Get seasonal leaf color
   */
  private getSeasonalColor(baseColor: THREE.Color): THREE.Color {
    switch (this.params.season) {
      case 'spring':
        return baseColor.clone().lerp(new THREE.Color(0x7cb342), 0.3);
      case 'summer':
        return baseColor;
      case 'autumn':
        const autumnColors = [0xd4a574, 0xc97c5d, 0xe8a87c, 0x8b7355];
        const randomColor = autumnColors[Math.floor(Math.random() * autumnColors.length)];
        return new THREE.Color(randomColor);
      case 'winter':
        return baseColor.clone().multiplyScalar(0.6);
      default:
        return baseColor;
    }
  }

  /**
   * Create stem material
   */
  private createStemMaterial(): void {
    const material = new THREE.MeshStandardMaterial({
      color: this.params.stemColor,
      roughness: 0.7,
      metalness: 0,
      name: 'stem',
    });

    this.materials.set('stem', material);
  }

  /**
   * Create leaf geometry based on shape
   */
  private createLeafGeometry(): THREE.BufferGeometry {
    let geometry: THREE.BufferGeometry;
    
    switch (this.params.leafShape) {
      case 'oval':
        geometry = this.createOvalLeaf();
        break;
      case 'heart':
        geometry = this.createHeartLeaf();
        break;
      case 'lobed':
        geometry = this.createLobedLeaf();
        break;
      case 'needle':
        geometry = this.createNeedleLeaf();
        break;
      case 'round':
        geometry = this.createRoundLeaf();
        break;
      case 'star':
        geometry = this.createStarLeaf();
        break;
      default:
        geometry = this.createOvalLeaf();
    }
    
    return geometry;
  }

  /**
   * Create oval leaf geometry
   */
  private createOvalLeaf(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const width = this.params.leafSize;
    const height = this.params.leafSize * 1.5;
    
    shape.moveTo(0, -height / 2);
    shape.bezierCurveTo(width / 2, -height / 4, width / 2, height / 4, 0, height / 2);
    shape.bezierCurveTo(-width / 2, height / 4, -width / 2, -height / 4, 0, -height / 2);
    
    const geometry = new THREE.ShapeGeometry(shape);
    return geometry;
  }

  /**
   * Create heart-shaped leaf geometry
   */
  private createHeartLeaf(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const size = this.params.leafSize;
    
    shape.moveTo(0, -size / 2);
    shape.bezierCurveTo(size / 2, -size, size, -size / 2, 0, size / 2);
    shape.bezierCurveTo(-size, -size / 2, -size / 2, -size, 0, -size / 2);
    
    const geometry = new THREE.ShapeGeometry(shape);
    return geometry;
  }

  /**
   * Create lobed leaf geometry (like ivy)
   */
  private createLobedLeaf(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const size = this.params.leafSize;
    const points = 5;
    
    for (let i = 0; i <= points * 2; i++) {
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? size : size * 0.5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 1.2;
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    const geometry = new THREE.ShapeGeometry(shape);
    return geometry;
  }

  /**
   * Create needle-like leaf geometry
   */
  private createNeedleLeaf(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const length = this.params.leafSize * 2;
    const width = this.params.leafSize * 0.2;
    
    shape.moveTo(0, -length / 2);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, length / 2);
    shape.lineTo(-width / 2, 0);
    shape.closePath();
    
    const geometry = new THREE.ShapeGeometry(shape);
    return geometry;
  }

  /**
   * Create round leaf geometry
   */
  private createRoundLeaf(): THREE.BufferGeometry {
    const geometry = new THREE.CircleGeometry(this.params.leafSize, 8);
    return geometry;
  }

  /**
   * Create star-shaped leaf geometry
   */
  private createStarLeaf(): THREE.BufferGeometry {
    const innerRadius = this.params.leafSize * 0.4;
    const outerRadius = this.params.leafSize;
    const points = 5;
    
    const geometry = new THREE.CircleGeometry(outerRadius, points);
    const positions = geometry.attributes.position.array;
    
    // Modify to create star shape
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const dist = Math.sqrt(x * x + y * y);
      const angle = Math.atan2(y, x);
      
      // Alternate between inner and outer radius
      const pointIndex = Math.floor((angle + Math.PI / 2) / (Math.PI * 2 / points));
      const radius = pointIndex % 2 === 0 ? outerRadius : innerRadius;
      
      positions[i] = Math.cos(angle) * radius;
      positions[i + 1] = Math.sin(angle) * radius;
    }
    
    geometry.attributes.position.needsUpdate = true;
    return geometry;
  }

  /**
   * Generate radial growth pattern (spreading from center)
   */
  private generateRadialGrowth(): void {
    const stemMaterial = this.materials.get('stem')!;
    const leafMaterial = this.materials.get('leaf')!;
    
    const mainStems = Math.floor(3 + Math.random() * 3);
    
    for (let s = 0; s < mainStems; s++) {
      const startAngle = (s / mainStems) * Math.PI * 2;
      this.generateStemBranch(
        new THREE.Vector3(0, 0, 0),
        startAngle,
        this.params.coverageRadius,
        0,
        stemMaterial,
        leafMaterial
      );
    }
  }

  /**
   * Generate linear growth pattern (along a path)
   */
  private generateLinearGrowth(): void {
    const stemMaterial = this.materials.get('stem')!;
    const leafMaterial = this.materials.get('leaf')!;
    
    const lineCount = Math.floor(2 + Math.random() * 2);
    
    for (let l = 0; l < lineCount; l++) {
      const offset = (l - lineCount / 2) * 0.3;
      const startPoint = new THREE.Vector3(offset, 0, -this.params.coverageRadius / 2);
      const direction = new THREE.Vector3(0, 0, 1);
      
      this.generateLinearStem(
        startPoint,
        direction,
        this.params.coverageRadius,
        stemMaterial,
        leafMaterial
      );
    }
  }

  /**
   * Generate clustered growth pattern (patches)
   */
  private generateClusteredGrowth(): void {
    const stemMaterial = this.materials.get('stem')!;
    const leafMaterial = this.materials.get('leaf')!;
    
    const clusterCount = Math.floor(3 + Math.random() * 4);
    
    for (let c = 0; c < clusterCount; c++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * this.params.coverageRadius * 0.7;
      const centerX = Math.cos(angle) * radius;
      const centerZ = Math.sin(angle) * radius;
      
      const clusterRadius = this.params.coverageRadius / clusterCount;
      const clusterStems = Math.floor(this.params.leafCount / clusterCount / 5);
      
      for (let s = 0; s < clusterStems; s++) {
        const startAngle = Math.random() * Math.PI * 2;
        this.generateStemBranch(
          new THREE.Vector3(centerX, 0, centerZ),
          startAngle,
          clusterRadius,
          0,
          stemMaterial,
          leafMaterial
        );
      }
    }
  }

  /**
   * Generate uniform growth pattern (evenly distributed)
   */
  private generateUniformGrowth(): void {
    const stemMaterial = this.materials.get('stem')!;
    const leafMaterial = this.materials.get('leaf')!;
    
    const plantCount = Math.floor(this.params.leafCount / 3);
    
    for (let i = 0; i < plantCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * this.params.coverageRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const startAngle = Math.random() * Math.PI * 2;
      this.generateStemBranch(
        new THREE.Vector3(x, 0, z),
        startAngle,
        this.params.coverageRadius / plantCount * 2,
        0,
        stemMaterial,
        leafMaterial
      );
    }
  }

  /**
   * Generate a branching stem with leaves
   */
  private generateStemBranch(
    startPos: THREE.Vector3,
    direction: number,
    maxLength: number,
    depth: number,
    stemMaterial: THREE.Material,
    leafMaterial: THREE.Material
  ): void {
    if (depth > this.params.stemBranching || maxLength < 0.1) return;
    
    const segments = 10;
    const points: THREE.Vector3[] = [];
    let currentPos = startPos.clone();
    let currentDir = new THREE.Vector3(Math.cos(direction), 0, Math.sin(direction));
    
    for (let i = 0; i <= segments; i++) {
      points.push(currentPos.clone());
      
      if (i < segments) {
        const segmentLength = maxLength / segments * (1 - i / segments * 0.5);
        currentPos.add(currentDir.clone().multiplyScalar(segmentLength));
        
        // Add some curvature
        currentDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.3);
        currentDir.y = Math.min(currentDir.y + 0.02, 0.3); // Slight upward growth
      }
    }
    
    // Create stem
    const curve = new THREE.CatmullRomCurve3(points);
    const stemGeometry = new THREE.TubeGeometry(curve, segments, this.params.stemThickness * (1 - depth * 0.2), 6, false);
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    this.group.add(stem);
    
    // Add leaves along the stem
    const leafInterval = Math.max(1, Math.floor(segments / 3));
    for (let i = leafInterval; i < points.length - 1; i += leafInterval) {
      if (Math.random() > this.params.density) continue;
      
      this.addLeaf(points[i], currentDir, leafMaterial);
    }
    
    // Branch further
    if (depth < this.params.stemBranching && maxLength > 0.3) {
      const branchCount = Math.floor(1 + Math.random() * 2);
      const endPoint = points[points.length - 1];
      
      for (let b = 0; b < branchCount; b++) {
        const branchAngle = direction + (Math.random() - 0.5) * Math.PI / 2;
        this.generateStemBranch(
          endPoint,
          branchAngle,
          maxLength * 0.6,
          depth + 1,
          stemMaterial,
          leafMaterial
        );
      }
    }
  }

  /**
   * Generate linear stem
   */
  private generateLinearStem(
    startPos: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    stemMaterial: THREE.Material,
    leafMaterial: THREE.Material
  ): void {
    const segments = 20;
    const points: THREE.Vector3[] = [];
    let currentPos = startPos.clone();
    
    for (let i = 0; i <= segments; i++) {
      points.push(currentPos.clone());
      
      if (i < segments) {
        const segmentLength = length / segments;
        currentPos.add(direction.clone().multiplyScalar(segmentLength));
        
        // Add slight meandering
        currentPos.x += (Math.random() - 0.5) * 0.05;
        currentPos.z += (Math.random() - 0.5) * 0.05;
      }
    }
    
    // Create stem
    const curve = new THREE.CatmullRomCurve3(points);
    const stemGeometry = new THREE.TubeGeometry(curve, segments, this.params.stemThickness, 6, false);
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    this.group.add(stem);
    
    // Add leaves
    for (let i = 2; i < points.length - 2; i += 3) {
      if (Math.random() > this.params.density) continue;
      
      const tangent = curve.getTangent(i / segments);
      this.addLeaf(points[i], tangent, leafMaterial);
    }
  }

  /**
   * Add a leaf at position
   */
  private addLeaf(position: THREE.Vector3, direction: THREE.Vector3, material: THREE.Material): void {
    if (!this.leafGeometry) return;
    
    const leaf = new THREE.Mesh(this.leafGeometry, material);
    leaf.position.copy(position);
    
    // Orient leaf
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, direction).normalize();
    const angle = Math.acos(Math.min(1, up.dot(direction)));
    
    if (!isNaN(angle)) {
      leaf.quaternion.setFromAxisAngle(axis, angle);
    }
    
    // Add variation
    leaf.rotation.z = (Math.random() - 0.5) * 0.5;
    leaf.scale.setScalar(0.8 + Math.random() * 0.4);
    
    // Height variation
    leaf.position.y = Math.random() * this.params.maxHeight;
    
    this.group.add(leaf);
  }

  /**
   * Get the generated group
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Update parameters and regenerate
   */
  updateParams(params: Partial<CreeperParams>): void {
    this.params = { ...this.params, ...params };
    this.generate();
  }

  /**
   * Export to JSON
   */
  toJSON(): Record<string, any> {
    return {
      type: 'Creeper',
      params: {
        ...this.params,
        leafColor: this.params.leafColor.getHex(),
        stemColor: this.params.stemColor.getHex(),
      },
    };
  }
}

export default CreeperGenerator;
