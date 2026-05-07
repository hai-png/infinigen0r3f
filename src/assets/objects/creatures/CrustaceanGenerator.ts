/**
 * CrustaceanGenerator — @deprecated Adapter that delegates to the canonical
 * implementation at objects/vegetation/crustacean/CrustaceanGenerator.
 *
 * The vegetation/crustacean version is the authoritative, more detailed
 * implementation with 3 species (crab, lobster, shrimp), LatheGeometry
 * body segments, articulated claws, and CreatureSkinSystem integration.
 *
 * This adapter preserves backward compatibility for code that imports
 * CrustaceanGenerator from the creatures/ directory and uses the
 * CreatureBase-based API with the two-argument generate(species, params).
 *
 * @deprecated Import from `@/assets/objects/vegetation/crustacean/CrustaceanGenerator` instead.
 * @module creatures
 */

import { Object3D, Group, Material, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import {
  CrustaceanGenerator as CanonicalCrustaceanGenerator,
  type CrustaceanConfig,
  type CrustaceanSpecies,
} from '../vegetation/crustacean/CrustaceanGenerator';

// ── Legacy types (preserved for backward compatibility) ────────────────

export type { CrustaceanSpecies };

export interface CrustaceanParams extends CreatureParams {
  species: CrustaceanSpecies;
  hasShell: boolean;
  shellColor: string;
  legCount: number;
  clawSize: number; // 0-1 relative to body
  antennaLength: number;
  tailFanSize: number; // 0 for crab, >0 for lobster/shrimp
}

// ── Adapter class ─────────────────────────────────────────────────────

/**
 * @deprecated Use `CrustaceanGenerator` from `objects/vegetation/crustacean/` instead.
 *
 * This adapter wraps the canonical CrustaceanGenerator and preserves the
 * CreatureBase-based API. The `generate()` method maps legacy
 * `CrustaceanParams` to the new `CrustaceanConfig` and delegates to the
 * canonical implementation.
 */
export class CrustaceanGenerator extends CreatureBase {
  private _currentSpecies: CrustaceanSpecies = 'crab';
  private _currentParams: CrustaceanParams | null = null;

  constructor(params: Partial<CrustaceanParams> = {}) {
    super({ ...params, seed: params.seed || 42, creatureType: CreatureType.INVERTEBRATE });
  }

  getDefaultConfig(): CrustaceanParams {
    return {
      ...this.params,
      creatureType: CreatureType.INVERTEBRATE,
      species: 'crab',
      hasShell: true,
      shellColor: '#FF6347',
      legCount: 8,
      clawSize: 0.6,
      antennaLength: 0.3,
      tailFanSize: 0,
    } as CrustaceanParams;
  }

  /**
   * Generate a crustacean mesh group.
   * Delegates to the canonical CrustaceanGenerator at vegetation/crustacean/.
   *
   * Note: The legacy API accepts (species, params) as two arguments.
   * This adapter handles both the two-argument form and the single-argument form.
   *
   * @deprecated Use `new CanonicalCrustaceanGenerator(seed).generate(config)` instead.
   */
  generate(speciesOrParams: CrustaceanSpecies | Partial<CrustaceanParams> = 'crab', params?: Partial<CrustaceanParams>): Group {
    let species: CrustaceanSpecies;
    let mergedParams: CrustaceanParams;

    if (typeof speciesOrParams === 'string') {
      // Legacy two-argument form: generate('crab', { ... })
      species = speciesOrParams;
      const defaults = this.getDefaultConfig();
      mergedParams = { ...defaults, ...params, species } as CrustaceanParams;
    } else {
      // Single-argument form: generate({ species: 'crab', ... })
      const defaults = this.getDefaultConfig();
      mergedParams = { ...defaults, ...speciesOrParams } as CrustaceanParams;
      species = mergedParams.species;
    }

    this._currentSpecies = species;
    this._currentParams = mergedParams;

    // Map legacy CrustaceanParams → new CrustaceanConfig
    const config: Partial<CrustaceanConfig> = {
      species,
      size: mergedParams.size,
      shellColor: mergedParams.shellColor,
      legCount: mergedParams.legCount,
      clawSize: mergedParams.clawSize,
      antennaLength: mergedParams.antennaLength,
      tailFanSize: mergedParams.tailFanSize,
      seed: mergedParams.seed,
    };

    const generator = new CanonicalCrustaceanGenerator(mergedParams.seed);
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
        mat.roughness = Math.min(mat.roughness, 0.5);
        mat.metalness = Math.max(mat.metalness, 0.05);
      }
    }
    return materials;
  }
}

// Re-export canonical types for convenience
export { type CrustaceanConfig } from '../vegetation/crustacean/CrustaceanGenerator';
