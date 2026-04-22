import * as THREE from 'three';

/**
 * Preset material configurations for common Infinigen materials
 */
export class MaterialPresets {
  
  /**
   * Rock Materials
   */
  static granite(): THREE.MeshStandardMaterial {
    return {
      name: 'granite',
      color: 0x8B7D82,
      roughness: 0.7,
      metalness: 0.1,
    } as THREE.MeshStandardMaterial;
  }

  static basalt(): THREE.MeshStandardMaterial {
    return {
      name: 'basalt',
      color: 0x3C3C3C,
      roughness: 0.6,
      metalness: 0.2,
    } as THREE.MeshStandardMaterial;
  }

  static limestone(): THREE.MeshStandardMaterial {
    return {
      name: 'limestone',
      color: 0xC8C8C8,
      roughness: 0.8,
      metalness: 0.0,
    } as THREE.MeshStandardMaterial;
  }

  static sandstone(): THREE.MeshStandardMaterial {
    return {
      name: 'sandstone',
      color: 0xD2B48C,
      roughness: 0.9,
      metalness: 0.0,
    } as THREE.MeshStandardMaterial;
  }

  static slate(): THREE.MeshStandardMaterial {
    return {
      name: 'slate',
      color: 0x4A5568,
      roughness: 0.5,
      metalness: 0.3,
    } as THREE.MeshStandardMaterial;
  }

  /**
   * Soil Materials
   */
  static topsoil(): THREE.MeshStandardMaterial {
    return {
      name: 'topsoil',
      color: 0x5C4033,
      roughness: 1.0,
      metalness: 0.0,
    } as THREE.MeshStandardMaterial;
  }

  static clay(): THREE.MeshStandardMaterial {
    return {
      name: 'clay',
      color: 0xB7410E,
      roughness: 0.8,
      metalness: 0.0,
    } as THREE.MeshStandardMaterial;
  }

  static sand(): THREE.MeshStandardMaterial {
    return {
      name: 'sand',
      color: 0xF4E4C1,
      roughness: 1.0,
      metalness: 0.0,
    } as THREE.MeshStandardMaterial;
  }

  static gravel(): THREE.MeshStandardMaterial {
    return {
      name: 'gravel',
      color: 0x808080,
      roughness: 0.9,
      metalness: 0.1,
    } as THREE.MeshStandardMaterial;
  }

  /**
   * Vegetation Materials
   */
  static grass(): THREE.MeshStandardMaterial {
    return {
      name: 'grass',
      color: 0x4CAF50,
      roughness: 0.9,
      metalness: 0.0,
    } as THREE.MeshStandardMaterial;
  }

  static moss(): THREE.MeshStandardMaterial {
    return {
      name: 'moss',
      color: 0x6B8E23,
      roughness: 1.0,
      metalness: 0.0,
    } as THREE.MeshStandardMaterial;
  }

  static bark(): THREE.MeshStandardMaterial {
    return {
      name: 'bark',
      color: 0x5C4033,
      roughness: 0.95,
      metalness: 0.0,
    } as THREE.MeshStandardMaterial;
  }

  static leaf(): THREE.MeshStandardMaterial {
    return {
      name: 'leaf',
      color: 0x228B22,
      roughness: 0.7,
      metalness: 0.0,
    } as THREE.MeshStandardMaterial;
  }

  /**
   * Water & Ice Materials
   */
  static water(): THREE.MeshStandardMaterial {
    return {
      name: 'water',
      color: 0x1E90FF,
      roughness: 0.1,
      metalness: 0.5,
      transparent: true,
      opacity: 0.7,
    } as THREE.MeshStandardMaterial;
  }

  static deepWater(): THREE.MeshStandardMaterial {
    return {
      name: 'deepWater',
      color: 0x006994,
      roughness: 0.05,
      metalness: 0.7,
      transparent: true,
      opacity: 0.8,
    } as THREE.MeshStandardMaterial;
  }

  static ice(): THREE.MeshStandardMaterial {
    return {
      name: 'ice',
      color: 0xA5F2F3,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.6,
    } as THREE.MeshStandardMaterial;
  }

  static snow(): THREE.MeshStandardMaterial {
    return {
      name: 'snow',
      color: 0xFFFAFA,
      roughness: 0.9,
      metalness: 0.0,
    } as THREE.MeshStandardMaterial;
  }

  /**
   * Special Materials
   */
  static lava(): THREE.MeshStandardMaterial {
    return {
      name: 'lava',
      color: 0xFF4500,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0xFF4500,
      emissiveIntensity: 0.5,
    } as THREE.MeshStandardMaterial;
  }

  static obsidian(): THREE.MeshStandardMaterial {
    return {
      name: 'obsidian',
      color: 0x1C1C1C,
      roughness: 0.1,
      metalness: 0.9,
    } as THREE.MeshStandardMaterial;
  }

  /**
   * Get all rock presets
   */
  static getRockPresets(): Record<string, THREE.MeshStandardMaterial> {
    return {
      granite: this.granite(),
      basalt: this.basalt(),
      limestone: this.limestone(),
      sandstone: this.sandstone(),
      slate: this.slate(),
    };
  }

  /**
   * Get all soil presets
   */
  static getSoilPresets(): Record<string, THREE.MeshStandardMaterial> {
    return {
      topsoil: this.topsoil(),
      clay: this.clay(),
      sand: this.sand(),
      gravel: this.gravel(),
    };
  }

  /**
   * Get all vegetation presets
   */
  static getVegetationPresets(): Record<string, THREE.MeshStandardMaterial> {
    return {
      grass: this.grass(),
      moss: this.moss(),
      bark: this.bark(),
      leaf: this.leaf(),
    };
  }

  /**
   * Get all water/ice presets
   */
  static getWaterPresets(): Record<string, THREE.MeshStandardMaterial> {
    return {
      water: this.water(),
      deepWater: this.deepWater(),
      ice: this.ice(),
      snow: this.snow(),
    };
  }

  /**
   * Get all special presets
   */
  static getSpecialPresets(): Record<string, THREE.MeshStandardMaterial> {
    return {
      lava: this.lava(),
      obsidian: this.obsidian(),
    };
  }

  /**
   * Get all presets
   */
  static getAllPresets(): Record<string, THREE.MeshStandardMaterial> {
    return {
      ...this.getRockPresets(),
      ...this.getSoilPresets(),
      ...this.getVegetationPresets(),
      ...this.getWaterPresets(),
      ...this.getSpecialPresets(),
    };
  }
}
