import * as THREE from 'three';

/**
 * Configuration for procedural plant generation
 */
export interface PlantConfig {
  // Stem properties
  stemHeight: number;
  stemRadius: number;
  stemSegments: number;
  stemColor: THREE.Color;
  stemCurvature: number;
  
  // Leaf properties
  leafCount: number;
  leafSize: number;
  leafWidth: number;
  leafLength: number;
  leafColor: THREE.Color;
  leafShape: 'oval' | 'lanceolate' | 'cordate' | 'linear';
  leafArrangement: 'alternate' | 'opposite' | 'whorled';
  
  // Flower properties (optional)
  hasFlower: boolean;
  flowerSize: number;
  flowerColor: THREE.Color;
  petalCount: number;
  
  // Variation
  randomness: number;
  seed?: number;
}

/**
 * Procedural Plant Generator
 * Generates various types of plants, flowers, and small vegetation
 */
export class PlantGenerator {
  private config: PlantConfig;
  
  constructor(config: Partial<PlantConfig> = {}) {
    this.config = {
      stemHeight: 0.5,
      stemRadius: 0.02,
      stemSegments: 8,
      stemColor: new THREE.Color(0x228b22),
      stemCurvature: 0.1,
      leafCount: 6,
      leafSize: 0.1,
      leafWidth: 0.05,
      leafLength: 0.15,
      leafColor: new THREE.Color(0x2d5a27),
      leafShape: 'lanceolate',
      leafArrangement: 'alternate',
      hasFlower: false,
      flowerSize: 0.08,
      flowerColor: new THREE.Color(0xff69b4),
      petalCount: 5,
      randomness: 0.2,
      ...config
    };
  }

  /**
   * Generate a complete plant mesh
   */
  generate(): THREE.Group {
    const group = new THREE.Group();
    
    // Generate stem
    const stem = this.createStem();
    if (stem) {
      group.add(stem);
    }
    
    // Generate leaves
    const leaves = this.createLeaves();
    if (leaves) {
      group.add(leaves);
    }
    
    // Generate flower if enabled
    if (this.config.hasFlower) {
      const flower = this.createFlower();
      if (flower) {
        group.add(flower);
      }
    }
    
    return group;
  }

  /**
   * Create curved stem using tube geometry
   */
  private createStem(): THREE.Mesh | null {
    // Create a curved path for the stem
    const points: THREE.Vector3[] = [];
    const segments = 10;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t * this.config.stemHeight;
      
      // Add curvature
      const curveAmount = Math.sin(t * Math.PI) * this.config.stemCurvature;
      const x = curveAmount * Math.cos(Math.random() * Math.PI * 2);
      const z = curveAmount * Math.sin(Math.random() * Math.PI * 2);
      
      points.push(new THREE.Vector3(x, y, z));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    
    const geometry = new THREE.TubeGeometry(
      curve,
      this.config.stemSegments,
      this.config.stemRadius,
      8,
      false
    );
    
    const material = new THREE.MeshStandardMaterial({
      color: this.config.stemColor,
      roughness: 0.7,
      side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Create leaves arranged along the stem
   */
  private createLeaves(): THREE.Group | null {
    const leavesGroup = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: this.config.leafColor,
      roughness: 0.8,
      side: THREE.DoubleSide
    });
    
    const leafGeometry = this.createLeafGeometry();
    
    for (let i = 0; i < this.config.leafCount; i++) {
      const t = (i + 1) / (this.config.leafCount + 1); // Distribute along stem
      const y = t * this.config.stemHeight * 0.8; // Don't go all the way to top
      
      // Determine arrangement pattern
      let angle: number;
      switch (this.config.leafArrangement) {
        case 'opposite':
          angle = (i % 2) * Math.PI;
          break;
        case 'whorled':
          angle = (i * (Math.PI * 2 / 3)) % (Math.PI * 2);
          break;
        case 'alternate':
        default:
          angle = i * 137.5 * (Math.PI / 180); // Golden angle
          break;
      }
      
      // Add randomness
      if (this.config.randomness > 0) {
        angle += (Math.random() - 0.5) * this.config.randomness;
      }
      
      const leaf = leafGeometry.clone();
      
      // Position leaf
      const radius = this.config.stemRadius + 0.02;
      leaf.translate(radius, y, 0);
      
      // Rotate to face outward
      leaf.rotateY(-angle);
      
      // Tilt upward slightly
      leaf.rotateX(-Math.PI / 6);
      
      // Random scale variation
      const scale = 0.8 + Math.random() * 0.4;
      leaf.scale(scale, scale, scale);
      
      const mesh = new THREE.Mesh(leaf, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      leavesGroup.add(mesh);
    }
    
    return leavesGroup;
  }

  /**
   * Create leaf geometry based on shape
   */
  private createLeafGeometry(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const w = this.config.leafWidth;
    const l = this.config.leafLength;
    
    switch (this.config.leafShape) {
      case 'oval':
        shape.ellipse(0, 0, w, l, 0, 0, Math.PI * 2);
        break;
        
      case 'lanceolate':
        shape.moveTo(0, -l);
        shape.quadraticCurveTo(w, 0, 0, l);
        shape.quadraticCurveTo(-w, 0, 0, -l);
        break;
        
      case 'cordate': // Heart-shaped
        shape.moveTo(0, l);
        shape.bezierCurveTo(w, l, w, 0, 0, -l);
        shape.bezierCurveTo(-w, 0, -w, l, 0, l);
        break;
        
      case 'linear':
      default:
        shape.moveTo(-w / 2, -l);
        shape.lineTo(w / 2, -l);
        shape.lineTo(w / 2, l);
        shape.lineTo(-w / 2, l);
        shape.closePath();
        break;
    }
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.002,
      bevelEnabled: false
    });
    
    // Center the geometry
    geometry.center();
    
    return geometry;
  }

  /**
   * Create flower at top of stem
   */
  private createFlower(): THREE.Group | null {
    const flowerGroup = new THREE.Group();
    
    // Create petals
    const petalMaterial = new THREE.MeshStandardMaterial({
      color: this.config.flowerColor,
      roughness: 0.6,
      side: THREE.DoubleSide
    });
    
    const petalShape = new THREE.Shape();
    petalShape.moveTo(0, 0);
    petalShape.quadraticCurveTo(
      this.config.flowerSize * 0.3,
      this.config.flowerSize * 0.5,
      0,
      this.config.flowerSize
    );
    petalShape.quadraticCurveTo(
      -this.config.flowerSize * 0.3,
      this.config.flowerSize * 0.5,
      0,
      0
    );
    
    const petalGeometry = new THREE.ExtrudeGeometry(petalShape, {
      depth: 0.002,
      bevelEnabled: false
    });
    petalGeometry.center();
    
    // Arrange petals in circle
    for (let i = 0; i < this.config.petalCount; i++) {
      const angle = (i / this.config.petalCount) * Math.PI * 2;
      const petal = petalGeometry.clone();
      
      petal.translate(0, this.config.flowerSize * 0.3, 0);
      petal.rotateZ(angle);
      
      const mesh = new THREE.Mesh(petal, petalMaterial);
      mesh.castShadow = true;
      flowerGroup.add(mesh);
    }
    
    // Add center
    const centerGeometry = new THREE.SphereGeometry(
      this.config.flowerSize * 0.3,
      8,
      8
    );
    const centerMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffd700), // Gold center
      roughness: 0.5
    });
    const center = new THREE.Mesh(centerGeometry, centerMaterial);
    center.position.y = this.config.flowerSize * 0.1;
    flowerGroup.add(center);
    
    // Position flower at top of stem
    flowerGroup.position.y = this.config.stemHeight;
    
    return flowerGroup;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<PlantConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
