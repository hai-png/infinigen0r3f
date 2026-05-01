/**
 * TailGenerator - Procedural segmented tail with curl/taper options
 * Supports types: straight, curled, bushy, paddle, segmented, prehensile, scorpion
 */
import * as THREE from 'three';

export type TailType = 'straight' | 'curled' | 'bushy' | 'paddle' | 'segmented' | 'prehensile' | 'scorpion';

export interface TailConfig {
  type: TailType;
  length: number;
  segmentCount: number;
  baseRadius: number;
  taperAmount: number; // 0 = uniform, 1 = sharp taper to point
  curlAmount: number;  // 0 = straight, 1 = full spiral
  color: number;
  furColor?: number;   // For bushy tails
}

export class TailGenerator {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? 42;
  }

  generate(type: string | TailType, length: number): THREE.Mesh;
  generate(config: Partial<TailConfig>): THREE.Mesh;
  generate(typeOrConfig: string | Partial<TailConfig>, length?: number): THREE.Mesh {
    let config: TailConfig;

    if (typeof typeOrConfig === 'string') {
      config = {
        type: typeOrConfig as TailType,
        length: length ?? 1.0,
        segmentCount: 8,
        baseRadius: length ? length * 0.06 : 0.06,
        taperAmount: 0.7,
        curlAmount: 0,
        color: 0x8B4513,
      };
    } else {
      config = {
        type: 'straight',
        length: 1.0,
        segmentCount: 8,
        baseRadius: 0.06,
        taperAmount: 0.7,
        curlAmount: 0,
        color: 0x8B4513,
        ...typeOrConfig,
      };
    }

    const group = new THREE.Group();
    group.name = 'tail';

    switch (config.type) {
      case 'straight':
        this.buildStraightTail(group, config);
        break;
      case 'curled':
        this.buildCurledTail(group, config);
        break;
      case 'bushy':
        this.buildBushyTail(group, config);
        break;
      case 'paddle':
        this.buildPaddleTail(group, config);
        break;
      case 'segmented':
        this.buildSegmentedTail(group, config);
        break;
      case 'prehensile':
        this.buildPrehensileTail(group, config);
        break;
      case 'scorpion':
        this.buildScorpionTail(group, config);
        break;
      default:
        this.buildStraightTail(group, config);
    }

    return group as unknown as THREE.Mesh;
  }

  /**
   * Straight tapered tail (lizard, rat, etc.)
   */
  private buildStraightTail(group: THREE.Group, config: TailConfig): void {
    const mat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.7 });
    const { length, segmentCount, baseRadius, taperAmount } = config;

    for (let i = 0; i < segmentCount; i++) {
      const t = i / segmentCount;
      const segLen = length / segmentCount;
      const radius = Math.max(0.002, baseRadius * (1 - t * taperAmount));
      const nextRadius = Math.max(0.002, baseRadius * (1 - (t + 1 / segmentCount) * taperAmount));

      const segGeo = new THREE.CylinderGeometry(nextRadius, radius, segLen, 8);
      const segment = new THREE.Mesh(segGeo, mat);
      segment.position.set(0, 0, -length * t - segLen / 2);
      segment.name = `segment_${i}`;
      group.add(segment);
    }
  }

  /**
   * Curled/spiraling tail (pig, seahorse, chameleon)
   */
  private buildCurledTail(group: THREE.Group, config: TailConfig): void {
    const mat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.7 });
    const { length, segmentCount, baseRadius, taperAmount, curlAmount } = config;

    for (let i = 0; i < segmentCount; i++) {
      const t = i / segmentCount;
      const segLen = length / segmentCount;
      const radius = Math.max(0.002, baseRadius * (1 - t * taperAmount));
      const nextRadius = Math.max(0.002, baseRadius * (1 - (t + 1 / segmentCount) * taperAmount));

      const segGeo = new THREE.CylinderGeometry(nextRadius, radius, segLen, 8);
      const segment = new THREE.Mesh(segGeo, mat);

      // Curl: each segment rotates progressively around the Y axis
      const curlAngle = t * Math.PI * 2 * curlAmount;
      const curlRadius = length * 0.15 * (1 - t * 0.5); // Spiral tightens toward tip

      segment.position.set(
        Math.sin(curlAngle) * curlRadius,
        -Math.cos(curlAngle) * curlRadius * 0.3,
        -length * t - segLen / 2
      );
      segment.rotation.y = curlAngle;
      segment.name = `segment_${i}`;
      group.add(segment);
    }
  }

  /**
   * Bushy tail (fox, squirrel, cat) - cone with fur-like geometry
   */
  private buildBushyTail(group: THREE.Group, config: TailConfig): void {
    const furColor = config.furColor ?? config.color;
    const mat = new THREE.MeshStandardMaterial({ color: furColor, roughness: 0.9 });
    const { length, baseRadius } = config;

    // Main tail body - elongated cone that curves upward
    const tailGeo = new THREE.ConeGeometry(baseRadius * 1.5, length, 12, 8);
    // Curve the cone vertices upward
    const positions = tailGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = (y + length / 2) / length; // 0 at base, 1 at tip
      // Curve upward and backward
      positions[i + 2] -= t * length * 0.3; // Backward curve
      positions[i + 1] += t * t * length * 0.2; // Upward curve
    }
    tailGeo.computeVertexNormals();

    const tail = new THREE.Mesh(tailGeo, mat);
    tail.rotation.x = Math.PI; // Point backward and up
    tail.position.z = -length * 0.3;
    tail.name = 'bushyTail';
    group.add(tail);

    // Fur tufts at the tip
    const tuftMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(furColor).offsetHSL(0, 0, 0.15),
      roughness: 0.95,
    });
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const tuftGeo = new THREE.ConeGeometry(baseRadius * 0.3, length * 0.15, 4);
      const tuft = new THREE.Mesh(tuftGeo, tuftMat);
      tuft.position.set(
        Math.cos(angle) * baseRadius * 0.5,
        length * 0.35 + Math.sin(angle) * baseRadius * 0.3,
        -length * 0.55
      );
      tuft.rotation.x = Math.PI + (Math.random() - 0.5) * 0.3;
      tuft.rotation.z = angle * 0.2;
      tuft.name = `tuft_${i}`;
      group.add(tuft);
    }
  }

  /**
   * Paddle/fluke tail (beaver, whale, dolphin)
   */
  private buildPaddleTail(group: THREE.Group, config: TailConfig): void {
    const mat = new THREE.MeshStandardMaterial({
      color: config.color, roughness: 0.6, side: THREE.DoubleSide,
    });
    const { length, baseRadius } = config;

    // Tail stock (narrow part connecting to body)
    const stockLen = length * 0.6;
    const stockGeo = new THREE.CylinderGeometry(baseRadius, baseRadius * 0.8, stockLen, 8);
    const stock = new THREE.Mesh(stockGeo, mat);
    stock.position.z = -stockLen / 2;
    stock.rotation.x = Math.PI / 2;
    stock.name = 'tailStock';
    group.add(stock);

    // Fluke (flat paddle at the end)
    const flukeShape = new THREE.Shape();
    const flukeWidth = length * 0.3;
    const flukeLen = length * 0.4;
    flukeShape.moveTo(0, 0);
    flukeShape.bezierCurveTo(flukeWidth * 0.5, flukeLen * 0.3, flukeWidth * 0.6, flukeLen * 0.7, 0, flukeLen);
    flukeShape.bezierCurveTo(-flukeWidth * 0.6, flukeLen * 0.7, -flukeWidth * 0.5, flukeLen * 0.3, 0, 0);

    const flukeGeo = new THREE.ShapeGeometry(flukeShape, 8);
    const fluke = new THREE.Mesh(flukeGeo, mat);
    fluke.position.z = -stockLen - flukeLen * 0.3;
    fluke.rotation.x = -Math.PI / 6;
    fluke.name = 'fluke';
    group.add(fluke);

    // Second fluke lobe
    const fluke2 = new THREE.Mesh(flukeGeo, mat);
    fluke2.position.z = -stockLen - flukeLen * 0.3;
    fluke2.rotation.x = Math.PI + Math.PI / 6;
    fluke2.name = 'fluke2';
    group.add(fluke2);
  }

  /**
   * Segmented tail (armadillo, pangolin, some lizards)
   */
  private buildSegmentedTail(group: THREE.Group, config: TailConfig): void {
    const mat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.6 });
    const { length, segmentCount, baseRadius, taperAmount } = config;

    for (let i = 0; i < segmentCount; i++) {
      const t = i / segmentCount;
      const segLen = length / segmentCount;
      const radius = Math.max(0.003, baseRadius * (1 - t * taperAmount));

      // Ring segment (torus-like)
      const ringGeo = new THREE.TorusGeometry(radius, radius * 0.3, 6, 12);
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.set(0, 0, -length * t - segLen / 2);
      ring.rotation.y = Math.PI / 2;
      ring.name = `ring_${i}`;

      // Scale ring to create band shape
      ring.scale.set(1, 1, segLen / (radius * 0.6));
      group.add(ring);

      // Connective tissue between rings
      if (i < segmentCount - 1) {
        const nextRadius = Math.max(0.003, baseRadius * (1 - (t + 1 / segmentCount) * taperAmount));
        const connGeo = new THREE.CylinderGeometry(nextRadius, radius, segLen * 0.5, 8);
        const conn = new THREE.Mesh(connGeo, mat);
        conn.position.set(0, 0, -length * t - segLen);
        conn.rotation.x = Math.PI / 2;
        conn.name = `connector_${i}`;
        group.add(conn);
      }
    }
  }

  /**
   * Prehensile tail (monkey, chameleon) - able to grasp
   */
  private buildPrehensileTail(group: THREE.Group, config: TailConfig): void {
    const mat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.7 });
    const { length, segmentCount, baseRadius, taperAmount } = config;

    for (let i = 0; i < segmentCount; i++) {
      const t = i / segmentCount;
      const segLen = length / segmentCount;
      const radius = Math.max(0.003, baseRadius * (1 - t * taperAmount * 0.5));
      const nextRadius = Math.max(0.003, baseRadius * (1 - (t + 1 / segmentCount) * taperAmount * 0.5));

      const segGeo = new THREE.CylinderGeometry(nextRadius, radius, segLen, 8);
      const segment = new THREE.Mesh(segGeo, mat);

      // Spiral curl at the end for grasping
      const curlStart = 0.6; // Start curling at 60% of length
      if (t > curlStart) {
        const curlT = (t - curlStart) / (1 - curlStart);
        const curlAngle = curlT * Math.PI * 1.5; // 270 degree curl
        const curlRadius = length * 0.08 * (1 - curlT * 0.5);

        segment.position.set(
          Math.sin(curlAngle) * curlRadius,
          -curlT * length * 0.05,
          -length * t - segLen / 2 + Math.cos(curlAngle) * curlRadius
        );
        segment.rotation.y = curlAngle;
      } else {
        // Slight downward droop
        segment.position.set(0, -t * t * length * 0.1, -length * t - segLen / 2);
        segment.rotation.x = t * 0.2;
      }

      segment.name = `segment_${i}`;
      group.add(segment);
    }
  }

  /**
   * Scorpion tail - segments that curve dramatically upward with a stinger
   */
  private buildScorpionTail(group: THREE.Group, config: TailConfig): void {
    const mat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.5 });
    const { length, segmentCount, baseRadius, taperAmount } = config;

    for (let i = 0; i < segmentCount; i++) {
      const t = i / segmentCount;
      const segLen = length / segmentCount;
      const radius = Math.max(0.003, baseRadius * (1 - t * taperAmount * 0.4));
      const nextRadius = Math.max(0.003, baseRadius * (1 - (t + 1 / segmentCount) * taperAmount * 0.4));

      const segGeo = new THREE.CylinderGeometry(nextRadius, radius, segLen, 8);
      const segment = new THREE.Mesh(segGeo, mat);

      // Dramatic upward arch
      const archT = t < 0.5 ? t * 2 : 1;
      const height = Math.sin(t * Math.PI) * length * 0.4;
      const forward = -length * t - segLen / 2;

      segment.position.set(0, height, forward);
      // Rotate each segment to follow the arch
      segment.rotation.x = -t * Math.PI * 0.8;
      segment.name = `segment_${i}`;
      group.add(segment);
    }

    // Stinger at tip
    const stingerLen = length * 0.08;
    const stingerGeo = new THREE.ConeGeometry(baseRadius * 0.3, stingerLen, 6);
    const stingerMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 });
    const stinger = new THREE.Mesh(stingerGeo, stingerMat);
    stinger.position.set(0, Math.sin(Math.PI) * length * 0.4 + stingerLen * 0.3, -length - stingerLen * 0.3);
    stinger.rotation.x = Math.PI;
    stinger.name = 'stinger';
    group.add(stinger);
  }
}
