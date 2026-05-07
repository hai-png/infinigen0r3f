/**
 * BeetleGenerator — @deprecated Adapter that delegates to the canonical
 * implementation at objects/vegetation/beetle/BeetleGenerator.
 *
 * The vegetation/beetle version is the authoritative, more detailed
 * implementation with species variants, canvas textures, and
 * CreatureSkinSystem integration.
 *
 * This adapter preserves backward compatibility for code that imports
 * BeetleGenerator from the creatures/ directory and uses the
 * CreatureBase-based API.
 *
 * @deprecated Import from `@/assets/objects/vegetation/beetle/BeetleGenerator` instead.
 * @module creatures
 */

import { Object3D, Group, Material, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import {
  BeetleGenerator as CanonicalBeetleGenerator,
  type BeetleConfig,
  type BeetleSpecies,
} from '../vegetation/beetle/BeetleGenerator';

// ── Legacy types (preserved for backward compatibility) ────────────────

export interface BeetleParams extends CreatureParams {
  elytraColor: string;
  mandibleSize: number; // 0-1
  glossiness: number;   // 0-1
  hornType: 'none' | 'rhinoceros' | 'stag' | 'hercules';
}

// ── Adapter class ─────────────────────────────────────────────────────

/**
 * @deprecated Use `BeetleGenerator` from `objects/vegetation/beetle/` instead.
 *
 * This adapter wraps the canonical BeetleGenerator and preserves the
 * CreatureBase-based API. The `generate()` method maps legacy
 * `BeetleParams` to the new `BeetleConfig` and delegates to the
 * canonical implementation.
 */
export class BeetleGenerator extends CreatureBase {
  private _params: BeetleParams | null = null;

  constructor(params: Partial<BeetleParams> = {}) {
    super({ ...params, seed: params.seed || 42, creatureType: CreatureType.INSECT });
  }

  getDefaultConfig(): BeetleParams {
    return {
      ...this.params,
      creatureType: CreatureType.INVERTEBRATE,
      elytraColor: '#1A1A2E',
      mandibleSize: 0.4,
      glossiness: 0.8,
      hornType: 'none',
    } as BeetleParams;
  }

  /**
   * Generate a beetle mesh group.
   * Delegates to the canonical BeetleGenerator at vegetation/beetle/.
   *
   * @deprecated Use `new CanonicalBeetleGenerator(seed).generate(config)` instead.
   */
  generate(params: Partial<BeetleParams> = {}): Group {
    this._params = { ...this.getDefaultConfig(), ...params };

    // Map legacy hornType → BeetleSpecies
    const species: BeetleSpecies = this._params.hornType === 'rhinoceros'
      ? 'rhinoceros_beetle'
      : this._params.hornType === 'stag'
        ? 'stag_beetle'
        : 'ladybug'; // 'none' and 'hercules' both map to ladybug as closest fallback

    // Map legacy params → new BeetleConfig
    const config: Partial<BeetleConfig> = {
      species,
      size: this._params.size,
      elytraColor: this._params.elytraColor,
      glossiness: this._params.glossiness,
      mandibleSize: this._params.mandibleSize,
      seed: this._params.seed,
    };

    const generator = new CanonicalBeetleGenerator(this._params.seed);
    return generator.generate(config);
  }

  // CreatureBase abstract method stubs — all generation is delegated
  // to the canonical implementation via generate().

  generateBodyCore(): Object3D {
    return new Group();
  }

  generateHead(): Object3D {
    return new Group();
  }

  generateLimbs(): Object3D[] {
    return [];
  }

  generateAppendages(): Object3D[] {
    return [];
  }

  applySkin(materials: Material[]): Material[] {
    for (const mat of materials) {
      if (mat instanceof MeshStandardMaterial) {
        mat.roughness = Math.min(mat.roughness, 1 - (this._params?.glossiness ?? 0.8) * 0.5);
        mat.metalness = Math.max(mat.metalness, 0.1);
      }
    }
    return materials;
  }
}

// Re-export canonical types for convenience
export { type BeetleConfig, type BeetleSpecies } from '../vegetation/beetle/BeetleGenerator';
