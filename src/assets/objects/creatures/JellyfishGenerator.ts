/**
 * JellyfishGenerator — @deprecated Adapter that delegates to the canonical
 * implementation at objects/vegetation/jellyfish/JellyfishGenerator.
 *
 * The vegetation/jellyfish version is the authoritative, more detailed
 * implementation with 3 species variants (moon_jelly, box_jelly, lions_mane),
 * MeshPhysicalMaterial with transmission, and CatmullRomCurve3 tentacles.
 *
 * This adapter preserves backward compatibility for code that imports
 * JellyfishGenerator from the creatures/ directory and uses the
 * CreatureBase-based API.
 *
 * @deprecated Import from `@/assets/objects/vegetation/jellyfish/JellyfishGenerator` instead.
 * @module creatures
 */

import { Object3D, Group, Material, MeshStandardMaterial } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import {
  JellyfishGenerator as CanonicalJellyfishGenerator,
  type JellyfishConfig,
  type JellyfishVariant,
} from '../vegetation/jellyfish/JellyfishGenerator';

// ── Legacy types (preserved for backward compatibility) ────────────────

export interface JellyfishParams extends CreatureParams {
  bellColor: string;
  innerBellColor: string;
  tentacleColor: string;
  bellRadius: number;
  bellHeight: number;
  tentacleCount: number;
  tentacleLength: number;
  oralArmCount: number;
  oralArmLength: number;
  transparency: number; // 0-1
  pulseSpeed: number;   // pulses per second
  radialCanalCount: number;
  bioluminescence: boolean;
  bioluminescenceColor: string;
}

// ── Adapter class ─────────────────────────────────────────────────────

/**
 * @deprecated Use `JellyfishGenerator` from `objects/vegetation/jellyfish/` instead.
 *
 * This adapter wraps the canonical JellyfishGenerator and preserves the
 * CreatureBase-based API. The `generate()` method maps legacy
 * `JellyfishParams` to the new `JellyfishConfig` and delegates to the
 * canonical implementation.
 */
export class JellyfishGenerator extends CreatureBase {
  private _params: JellyfishParams | null = null;

  constructor(params: Partial<JellyfishParams> = {}) {
    super({ ...params, seed: params.seed || 42, creatureType: CreatureType.INVERTEBRATE });
  }

  getDefaultConfig(): JellyfishParams {
    return {
      ...this.params,
      creatureType: CreatureType.INVERTEBRATE,
      bellColor: '#FF69B4',
      innerBellColor: '#FFFFFF',
      tentacleColor: '#FFB6C1',
      bellRadius: 0.15,
      bellHeight: 0.12,
      tentacleCount: 16,
      tentacleLength: 0.4,
      oralArmCount: 4,
      oralArmLength: 0.2,
      transparency: 0.7,
      pulseSpeed: 0.8,
      radialCanalCount: 8,
      bioluminescence: false,
      bioluminescenceColor: '#00FFFF',
    } as JellyfishParams;
  }

  /**
   * Generate a jellyfish mesh group.
   * Delegates to the canonical JellyfishGenerator at vegetation/jellyfish/.
   *
   * @deprecated Use `new CanonicalJellyfishGenerator(seed).generate(config)` instead.
   */
  generate(params: Partial<JellyfishParams> = {}): Group {
    this._params = { ...this.getDefaultConfig(), ...params };

    // Map legacy pulseSpeed → bellContractAmount + pulseFrequency
    const config: Partial<JellyfishConfig> = {
      variant: 'moon_jelly' as JellyfishVariant,
      size: this._params.size,
      bellColor: this._params.bellColor,
      innerBellColor: this._params.innerBellColor,
      tentacleColor: this._params.tentacleColor,
      bellRadius: this._params.bellRadius,
      bellHeight: this._params.bellHeight,
      tentacleCount: this._params.tentacleCount,
      tentacleLength: this._params.tentacleLength,
      oralArmCount: this._params.oralArmCount,
      oralArmLength: this._params.oralArmLength,
      bellContractAmount: 0.15,
      pulseFrequency: this._params.pulseSpeed,
      radialCanalCount: this._params.radialCanalCount,
      bioluminescence: this._params.bioluminescence,
      bioluminescenceColor: this._params.bioluminescenceColor,
      transmission: this._params.transparency,
      seed: this._params.seed,
    };

    const generator = new CanonicalJellyfishGenerator(this._params.seed);
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
        mat.roughness = Math.min(mat.roughness, 0.3);
        mat.transparent = true;
        mat.opacity = Math.min(mat.opacity ?? 1.0, 0.75);
        mat.side = 2; // DoubleSide
      }
    }
    return materials;
  }
}

// Re-export canonical types for convenience
export { type JellyfishConfig, type JellyfishVariant } from '../vegetation/jellyfish/JellyfishGenerator';
