/**
 * DragonflyGenerator — @deprecated Adapter that delegates to the canonical
 * implementation at objects/vegetation/dragonfly/DragonflyGenerator.
 *
 * The vegetation/dragonfly version is the authoritative, more detailed
 * implementation with LatheGeometry body segments, IcosahedronGeometry
 * compound eyes, recursive wing venation, and MeshPhysicalMaterial
 * with iridescence.
 *
 * This adapter preserves backward compatibility for code that imports
 * DragonflyGenerator from the creatures/ directory and uses the
 * CreatureBase-based API.
 *
 * @deprecated Import from `@/assets/objects/vegetation/dragonfly/DragonflyGenerator` instead.
 * @module creatures
 */

import { Object3D, Group, Material, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import {
  DragonflyGenerator as CanonicalDragonflyGenerator,
  type DragonflyConfig,
} from '../vegetation/dragonfly/DragonflyGenerator';

// ── Legacy types (preserved for backward compatibility) ────────────────

export interface DragonflyParams extends CreatureParams {
  bodyColor: string;
  wingColor: string;
  wingOpacity: number;
  compoundEyeColor: string;
  abdomenPattern: 'solid' | 'striped' | 'spotted' | 'metallic';
}

// ── Adapter class ─────────────────────────────────────────────────────

/**
 * @deprecated Use `DragonflyGenerator` from `objects/vegetation/dragonfly/` instead.
 *
 * This adapter wraps the canonical DragonflyGenerator and preserves the
 * CreatureBase-based API. The `generate()` method maps legacy
 * `DragonflyParams` to the new `DragonflyConfig` and delegates to the
 * canonical implementation.
 */
export class DragonflyGenerator extends CreatureBase {
  private _params: DragonflyParams | null = null;

  constructor(params: Partial<DragonflyParams> = {}) {
    super({ ...params, seed: params.seed || 42, creatureType: CreatureType.INSECT });
  }

  getDefaultConfig(): DragonflyParams {
    return {
      ...this.params,
      creatureType: CreatureType.INVERTEBRATE,
      bodyColor: '#2E8B57',
      wingColor: '#E0F0FF',
      wingOpacity: 0.4,
      compoundEyeColor: '#4169E1',
      abdomenPattern: 'striped',
    } as DragonflyParams;
  }

  /**
   * Generate a dragonfly mesh group.
   * Delegates to the canonical DragonflyGenerator at vegetation/dragonfly/.
   *
   * @deprecated Use `new CanonicalDragonflyGenerator(seed).generate(config)` instead.
   */
  generate(params: Partial<DragonflyParams> = {}): Group {
    this._params = { ...this.getDefaultConfig(), ...params };

    // Map legacy abdomenPattern — 'spotted' has no direct equivalent in new API,
    // map to 'striped' as closest fallback
    const mappedPattern: 'solid' | 'striped' | 'metallic' =
      this._params.abdomenPattern === 'spotted' ? 'striped' : this._params.abdomenPattern;

    // Map legacy DragonflyParams → new DragonflyConfig
    const config: Partial<DragonflyConfig> = {
      size: this._params.size,
      bodyColor: this._params.bodyColor,
      wingColor: this._params.wingColor,
      wingOpacity: this._params.wingOpacity,
      compoundEyeColor: this._params.compoundEyeColor,
      abdomenPattern: mappedPattern,
      seed: this._params.seed,
    };

    const generator = new CanonicalDragonflyGenerator(this._params.seed);
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
export { type DragonflyConfig } from '../vegetation/dragonfly/DragonflyGenerator';
