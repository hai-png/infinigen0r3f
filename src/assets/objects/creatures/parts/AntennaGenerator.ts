/**
 * AntennaGenerator - Procedural antenna generation with segments,
 * type variation (filiform/clubbed/feathery/elbowed), and getSegmentPosition()
 */
import * as THREE from 'three';

export type AntennaType = 'filiform' | 'clubbed' | 'feathery' | 'elbowed';

export class AntennaGenerator {
  private seed: number;
  private segmentPositions: THREE.Vector3[];

  constructor(seed?: number) {
    this.seed = seed ?? 42;
    this.segmentPositions = [];
  }

  /**
   * Generate a pair of antennae
   */
  generate(type: AntennaType | string, length: number): THREE.Group {
    const antennas = new THREE.Group();
    antennas.name = 'antennas';
    this.segmentPositions = [];

    const antennaType = type as AntennaType;

    // Generate left and right antenna
    for (const side of [-1, 1]) {
      const antenna = this.createSingleAntenna(antennaType, length, side);
      antenna.position.x = side * length * 0.05;
      antennas.add(antenna);
    }

    return antennas;
  }

  /**
   * Get the world-space position of a segment by index (0 = base, last = tip)
   * Returns Vector3 for the requested segment
   */
  getSegmentPosition(index: number): THREE.Vector3 {
    if (index < 0 || index >= this.segmentPositions.length) {
      return new THREE.Vector3();
    }
    return this.segmentPositions[index].clone();
  }

  /**
   * Get all segment positions
   */
  getAllSegmentPositions(): THREE.Vector3[] {
    return this.segmentPositions.map(p => p.clone());
  }

  private createSingleAntenna(type: AntennaType, length: number, side: number): THREE.Group {
    const group = new THREE.Group();
    group.name = side === -1 ? 'leftAntenna' : 'rightAntenna';

    const segmentCount = 8;
    const segmentLength = length / segmentCount;

    // Materials for the antenna
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x3a3a2a, roughness: 0.6 });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.5 });

    let currentPos = new THREE.Vector3(0, 0, 0);
    let currentAngle = -side * 0.3; // Angle outward from center

    for (let i = 0; i < segmentCount; i++) {
      const t = i / segmentCount;
      const radius = this.getSegmentRadius(type, t, length);
      const segGeo = new THREE.CylinderGeometry(
        Math.max(0.001, radius * 0.8),
        Math.max(0.001, radius),
        segmentLength, 6
      );

      const mat = t > 0.7 ? tipMat : baseMat;
      const segment = new THREE.Mesh(segGeo, mat);
      segment.name = `segment_${i}`;

      // Position each segment along the antenna path
      currentPos = new THREE.Vector3(
        currentPos.x + Math.sin(currentAngle) * segmentLength,
        currentPos.y + Math.cos(currentAngle) * segmentLength,
        0
      );
      segment.position.copy(currentPos);
      segment.position.y -= segmentLength / 2;
      segment.rotation.z = currentAngle;
      group.add(segment);

      // Store segment position
      this.segmentPositions.push(currentPos.clone());

      // Adjust angle for type-specific curvature
      currentAngle += this.getAngleIncrement(type, t, side);
    }

    // Add type-specific decorations at the tip
    this.addTipDecoration(group, type, length, side, currentPos, currentAngle);

    return group;
  }

  private getSegmentRadius(type: AntennaType, t: number, length: number): number {
    const baseRadius = length * 0.015;
    switch (type) {
      case 'filiform':
        // Uniform thickness, slightly tapering
        return baseRadius * (1 - t * 0.3);
      case 'clubbed':
        // Thin then widens at the tip (club shape)
        return t > 0.7
          ? baseRadius * (0.6 + (t - 0.7) / 0.3 * 2.0)
          : baseRadius * (1 - t * 0.4);
      case 'feathery':
        // Moderate thickness with side branches
        return baseRadius * (1 - t * 0.2);
      case 'elbowed':
        // Thin base, thicker after the elbow
        return t > 0.3
          ? baseRadius * 0.9
          : baseRadius * (1 - t * 0.3);
      default:
        return baseRadius * (1 - t * 0.3);
    }
  }

  private getAngleIncrement(type: AntennaType, t: number, side: number): number {
    switch (type) {
      case 'filiform':
        // Gentle upward curve
        return -side * 0.02;
      case 'clubbed':
        // Slight outward curve
        return -side * 0.03;
      case 'feathery':
        // Gentle S-curve
        return -side * 0.015 * Math.sin(t * Math.PI);
      case 'elbowed':
        // Sharp bend at ~30% of length
        return t > 0.25 && t < 0.35
          ? -side * 0.5 // Sharp elbow
          : -side * 0.02;
      default:
        return -side * 0.02;
    }
  }

  private addTipDecoration(
    group: THREE.Group,
    type: AntennaType,
    length: number,
    side: number,
    tipPos: THREE.Vector3,
    tipAngle: number
  ): void {
    switch (type) {
      case 'clubbed': {
        // Club head at tip
        const clubGeo = new THREE.SphereGeometry(length * 0.04, 8, 8);
        const clubMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.5 });
        const club = new THREE.Mesh(clubGeo, clubMat);
        club.position.copy(tipPos);
        club.name = 'club';
        group.add(club);
        break;
      }
      case 'feathery': {
        // Side branches (pectinate) along the antenna
        const branchMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.6 });
        const branchCount = 6;
        for (let i = 0; i < branchCount; i++) {
          const t = 0.3 + (i / branchCount) * 0.65;
          const segIdx = Math.floor(t * 8);
          if (segIdx < this.segmentPositions.length) {
            const pos = this.segmentPositions[segIdx];
            const branchLen = length * 0.1 * (1 - t * 0.5);
            const branchGeo = new THREE.CylinderGeometry(
              Math.max(0.001, length * 0.003),
              Math.max(0.001, length * 0.005),
              branchLen, 4
            );
            for (const branchSide of [-1, 1]) {
              const branch = new THREE.Mesh(branchGeo, branchMat);
              branch.position.copy(pos);
              branch.position.z += branchSide * branchLen * 0.4;
              branch.rotation.x = branchSide * Math.PI / 4;
              branch.name = `branch_${i}_${branchSide}`;
              group.add(branch);
            }
          }
        }
        break;
      }
      case 'elbowed': {
        // Small sensor at tip
        const sensorGeo = new THREE.SphereGeometry(length * 0.02, 6, 6);
        const sensorMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.5 });
        const sensor = new THREE.Mesh(sensorGeo, sensorMat);
        sensor.position.copy(tipPos);
        sensor.name = 'sensor';
        group.add(sensor);
        break;
      }
      default:
        break;
    }
  }
}
