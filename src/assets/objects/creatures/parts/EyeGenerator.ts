/**
 * EyeGenerator - Procedural eye generation
 * Compound eye for insects (faceted surface), iris/pupil for vertebrates
 */
import * as THREE from 'three';

export type EyeType = 'compound' | 'camera';

export interface EyeConfig {
  type: EyeType;
  count: number;     // number of eyes (2 for most, more for spiders)
  size: number;      // radius of the eye
  color: number;     // iris or overall color
  scleraColor?: number;   // white of eye for vertebrates
  pupilColor?: number;    // pupil color for vertebrates
  facetCount?: number;    // number of facets for compound eyes
  spacing?: number;       // distance between eyes
}

export class EyeGenerator {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? 42;
  }

  generate(type: 'compound' | 'camera' | string, count: number, size: number): THREE.Group;
  generate(config: Partial<EyeConfig>): THREE.Group;
  generate(typeOrConfig: string | Partial<EyeConfig>, count?: number, size?: number): THREE.Group {
    let config: EyeConfig;

    if (typeof typeOrConfig === 'string') {
      config = {
        type: typeOrConfig as EyeType,
        count: count ?? 2,
        size: size ?? 0.05,
        color: 0x000000,
        scleraColor: 0xeeeeee,
        pupilColor: 0x111111,
        facetCount: 50,
        spacing: size ? size * 2 : 0.1,
      };
    } else {
      config = {
        type: 'camera',
        count: 2,
        size: 0.05,
        color: 0x442200,
        scleraColor: 0xeeeeee,
        pupilColor: 0x111111,
        facetCount: 50,
        spacing: 0.1,
        ...typeOrConfig,
      };
    }

    const eyes = new THREE.Group();
    eyes.name = 'eyes';

    switch (config.type) {
      case 'compound':
        this.buildCompoundEyes(eyes, config);
        break;
      case 'camera':
      default:
        this.buildCameraEyes(eyes, config);
        break;
    }

    return eyes;
  }

  /**
   * Compound eyes (insect): large, faceted hemispheres covering much of the head
   */
  private buildCompoundEyes(eyes: THREE.Group, config: EyeConfig): void {
    const { count, size, color, facetCount, spacing } = config;

    for (let i = 0; i < count; i++) {
      const side = i === 0 ? -1 : 1;
      const eyeGroup = new THREE.Group();
      eyeGroup.name = `compoundEye_${i}`;

      // Main hemisphere of the compound eye
      const eyeGeo = new THREE.SphereGeometry(size, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
      });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.name = 'compoundEyeSurface';
      eyeGroup.add(eye);

      // Facet bumps on the surface
      const facetMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).offsetHSL(0, 0, 0.1),
        roughness: 0.15,
        metalness: 0.1,
      });
      const actualFacetCount = facetCount ?? 50;
      for (let f = 0; f < actualFacetCount; f++) {
        // Distribute facets on the hemisphere
        const phi = Math.acos(1 - Math.random() * 0.6); // upper hemisphere
        const theta = Math.random() * Math.PI * 2;
        const facetRadius = size * (0.06 + Math.random() * 0.04);

        const facetGeo = new THREE.SphereGeometry(facetRadius, 6, 4);
        const facet = new THREE.Mesh(facetGeo, facetMat);

        // Position on the hemisphere surface
        const r = size * 0.95;
        facet.position.set(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta)
        );
        facet.name = `facet_${f}`;
        eyeGroup.add(facet);
      }

      // Position each eye
      eyeGroup.position.set(side * (spacing ?? size * 2), size * 0.2, size * 0.6);
      eyes.add(eyeGroup);
    }
  }

  /**
   * Camera/vertebrate eyes: sclera + iris + pupil with realistic layering
   */
  private buildCameraEyes(eyes: THREE.Group, config: EyeConfig): void {
    const { count, size, color, scleraColor, pupilColor, spacing } = config;
    const irisColor = color;
    const white = scleraColor ?? 0xeeeeee;
    const dark = pupilColor ?? 0x111111;

    for (let i = 0; i < count; i++) {
      const side = i === 0 ? -1 : 1;
      const eyeGroup = new THREE.Group();
      eyeGroup.name = `eye_${i}`;

      // Sclera (white of the eye)
      const scleraGeo = new THREE.SphereGeometry(size, 16, 16);
      const scleraMat = new THREE.MeshStandardMaterial({
        color: white,
        roughness: 0.3,
        metalness: 0.0,
      });
      const sclera = new THREE.Mesh(scleraGeo, scleraMat);
      sclera.name = 'sclera';
      eyeGroup.add(sclera);

      // Iris (colored ring) - slightly raised disc on the front of the eye
      const irisRadius = size * 0.55;
      const irisGeo = new THREE.CircleGeometry(irisRadius, 24);
      const irisMat = new THREE.MeshStandardMaterial({
        color: irisColor,
        roughness: 0.4,
        metalness: 0.1,
      });
      const iris = new THREE.Mesh(irisGeo, irisMat);
      iris.position.z = size * 0.95;
      iris.name = 'iris';
      eyeGroup.add(iris);

      // Iris detail ring (darker outer edge)
      const irisRingGeo = new THREE.RingGeometry(irisRadius * 0.85, irisRadius, 24);
      const irisRingMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(irisColor).multiplyScalar(0.6),
        roughness: 0.5,
        side: THREE.DoubleSide,
      });
      const irisRing = new THREE.Mesh(irisRingGeo, irisRingMat);
      irisRing.position.z = size * 0.96;
      irisRing.name = 'irisRing';
      eyeGroup.add(irisRing);

      // Pupil (dark center)
      const pupilRadius = size * 0.25;
      const pupilGeo = new THREE.CircleGeometry(pupilRadius, 16);
      const pupilMat = new THREE.MeshStandardMaterial({
        color: dark,
        roughness: 0.2,
        metalness: 0.0,
      });
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.z = size * 0.97;
      pupil.name = 'pupil';
      eyeGroup.add(pupil);

      // Cornea (transparent dome over the front)
      const corneaGeo = new THREE.SphereGeometry(size * 0.95, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.4);
      const corneaMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.15,
        roughness: 0.1,
        metalness: 0.1,
      });
      const cornea = new THREE.Mesh(corneaGeo, corneaMat);
      cornea.rotation.x = Math.PI;
      cornea.position.z = size * 0.1;
      cornea.name = 'cornea';
      eyeGroup.add(cornea);

      // Specular highlight (tiny bright dot)
      const highlightGeo = new THREE.SphereGeometry(size * 0.06, 6, 6);
      const highlightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.0,
        metalness: 0.0,
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
      });
      const highlight = new THREE.Mesh(highlightGeo, highlightMat);
      highlight.position.set(size * 0.2, size * 0.25, size * 0.9);
      highlight.name = 'highlight';
      eyeGroup.add(highlight);

      // Position each eye
      eyeGroup.position.set(side * (spacing ?? size * 2), 0, size * 0.5);
      eyes.add(eyeGroup);
    }
  }
}
