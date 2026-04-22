import * as THREE from 'three';

/**
 * Procedural Rock Generator
 * Creates various rock formations using geometry manipulation
 */
export class RockGenerator {
  
  /**
   * Generate a random boulder
   */
  static createBoulder(
    size: number = 1,
    detail: number = 3,
    seed?: number
  ): THREE.Mesh {
    const geometry = new THREE.IcosahedronGeometry(size, detail);
    this.displaceVertices(geometry, seed, 0.3);
    
    const material = new THREE.MeshStandardMaterial({
      color: 0x8B7D82,
      roughness: 0.8,
      metalness: 0.1,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Generate a rock cluster
   */
  static createRockCluster(
    count: number = 5,
    spread: number = 2,
    seed?: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    for (let i = 0; i < count; i++) {
      const size = 0.5 + Math.random() * 1.5;
      const boulder = this.createBoulder(size, 2, seed);
      
      boulder.position.set(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread * 0.3,
        (Math.random() - 0.5) * spread
      );
      
      boulder.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      
      group.add(boulder);
    }
    
    return group;
  }

  /**
   * Generate a cliff face segment
   */
  static createCliffSegment(
    width: number = 5,
    height: number = 10,
    depth: number = 3,
    seed?: number
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, depth, 8, 12, 4);
    this.displaceVertices(geometry, seed, 0.5, true);
    
    const material = new THREE.MeshStandardMaterial({
      color: 0x5C5C5C,
      roughness: 0.7,
      metalness: 0.2,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Displace vertices using noise
   */
  private static displaceVertices(
    geometry: THREE.BufferGeometry,
    seed?: number,
    intensity: number = 0.3,
    directional: boolean = false
  ): void {
    const positionAttribute = geometry.getAttribute('position');
    const positions = positionAttribute.array as Float32Array;
    const normals = geometry.getAttribute('normal');
    
    // Simple pseudo-random displacement
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Create displacement based on position
      const noise = this.simpleNoise(x, y, z, seed);
      const displacement = noise * intensity;
      
      if (directional && normals) {
        const nx = normals.array[i];
        const ny = normals.array[i + 1];
        const nz = normals.array[i + 2];
        
        positions[i] += nx * displacement;
        positions[i + 1] += ny * displacement;
        positions[i + 2] += nz * displacement;
      } else {
        positions[i] += (Math.random() - 0.5) * displacement;
        positions[i + 1] += (Math.random() - 0.5) * displacement;
        positions[i + 2] += (Math.random() - 0.5) * displacement;
      }
    }
    
    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  /**
   * Simple noise function
   */
  private static simpleNoise(
    x: number,
    y: number,
    z: number,
    seed?: number
  ): number {
    const s = seed || 1;
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.5432 + s) * 43758.5453;
    return n - Math.floor(n);
  }
}

/**
 * Procedural Tree Generator
 */
export class TreeGenerator {
  
  /**
   * Generate a simple low-poly tree
   */
  static createTree(
    height: number = 5,
    canopyRadius: number = 2,
    trunkRadius: number = 0.3,
    seed?: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(
      trunkRadius,
      trunkRadius * 1.2,
      height * 0.6,
      6
    );
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x5C4033,
      roughness: 0.9,
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = height * 0.3;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);
    
    // Canopy (multiple spheres for fuller look)
    const canopyMaterial = new THREE.MeshStandardMaterial({
      color: 0x228B22,
      roughness: 0.8,
    });
    
    const mainCanopy = new THREE.SphereGeometry(canopyRadius, 6, 6);
    const mainCanopyMesh = new THREE.Mesh(mainCanopy, canopyMaterial);
    mainCanopyMesh.position.y = height * 0.8;
    mainCanopyMesh.castShadow = true;
    mainCanopyMesh.receiveShadow = true;
    group.add(mainCanopyMesh);
    
    // Add smaller canopy spheres
    const offsetPositions = [
      { x: canopyRadius * 0.6, y: height * 0.7, z: 0 },
      { x: -canopyRadius * 0.6, y: height * 0.75, z: 0 },
      { x: 0, y: height * 0.75, z: canopyRadius * 0.6 },
      { x: 0, y: height * 0.75, z: -canopyRadius * 0.6 },
    ];
    
    offsetPositions.forEach(pos => {
      const smallCanopy = new THREE.SphereGeometry(canopyRadius * 0.5, 5, 5);
      const mesh = new THREE.Mesh(smallCanopy, canopyMaterial);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    
    // Random rotation
    group.rotation.y = Math.random() * Math.PI * 2;
    
    return group;
  }

  /**
   * Generate a forest of trees
   */
  static createForest(
    count: number = 10,
    areaSize: number = 20,
    seed?: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    for (let i = 0; i < count; i++) {
      const height = 3 + Math.random() * 4;
      const tree = this.createTree(height, height * 0.4, height * 0.06, seed);
      
      tree.position.set(
        (Math.random() - 0.5) * areaSize,
        0,
        (Math.random() - 0.5) * areaSize
      );
      
      group.add(tree);
    }
    
    return group;
  }
}

/**
 * Procedural Vegetation Generator
 */
export class VegetationGenerator {
  
  /**
   * Generate grass blades
   */
  static createGrassPatch(
    width: number = 2,
    depth: number = 2,
    density: number = 50,
    seed?: number
  ): THREE.InstancedMesh {
    const bladeGeometry = new THREE.PlaneGeometry(0.1, 0.3);
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x4CAF50,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    
    const instancedMesh = new THREE.InstancedMesh(
      bladeGeometry,
      bladeMaterial,
      density
    );
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < density; i++) {
      const x = (Math.random() - 0.5) * width;
      const z = (Math.random() - 0.5) * depth;
      const y = 0;
      
      dummy.position.set(x, y, z);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.rotation.x = (Math.random() - 0.5) * 0.2;
      
      const scale = 0.8 + Math.random() * 0.4;
      dummy.scale.set(scale, scale, scale);
      
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    
    return instancedMesh;
  }

  /**
   * Generate bushes
   */
  static createBush(
    size: number = 1,
    seed?: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    const bushMaterial = new THREE.MeshStandardMaterial({
      color: 0x2E8B57,
      roughness: 0.8,
    });
    
    // Create multiple spheres for bush shape
    const sphereCount = 5;
    for (let i = 0; i < sphereCount; i++) {
      const radius = size * (0.3 + Math.random() * 0.4);
      const geometry = new THREE.SphereGeometry(radius, 6, 6);
      const mesh = new THREE.Mesh(geometry, bushMaterial);
      
      mesh.position.set(
        (Math.random() - 0.5) * size * 0.5,
        radius * 0.5,
        (Math.random() - 0.5) * size * 0.5
      );
      
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    
    return group;
  }
}
