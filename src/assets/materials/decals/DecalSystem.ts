import { createCanvas } from '../../utils/CanvasUtils';
/**
 * Decal Application System - Logo placement, labels, projected decals
 */
import { Texture, CanvasTexture, Color, Vector3, Mesh, BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Euler, MeshStandardMaterial, DoubleSide, Uint16BufferAttribute } from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';

export interface DecalParams {
  type: 'logo' | 'label' | 'warning' | 'custom';
  color: Color;
  opacity: number;
  scale: Vector3;
  rotation: number;
  text?: string;
}

export interface DecalPlacement {
  position: Vector3;
  normal: Vector3;
  rotation: number;
  scale: number;
}

export interface DecalConfig {
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  texture: Texture;
  opacity?: number;
}

export class DecalSystem {
  generateDecal(params: DecalParams, seed: number): Texture {
    const rng = new SeededRandom(seed);
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Transparent background
    ctx.clearRect(0, 0, size, size);

    switch (params.type) {
      case 'logo':
        this.drawLogo(ctx, size, params, rng);
        break;
      case 'label':
        this.drawLabel(ctx, size, params, rng);
        break;
      case 'warning':
        this.drawWarning(ctx, size, params, rng);
        break;
      case 'custom':
        this.drawCustom(ctx, size, params, rng);
        break;
    }

    return new CanvasTexture(canvas);
  }

  private drawLogo(ctx: CanvasRenderingContext2D, size: number, params: DecalParams, rng: SeededRandom): void {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(params.rotation);

    ctx.fillStyle = `rgba(${Math.floor(params.color.r * 255)}, ${Math.floor(params.color.g * 255)}, ${Math.floor(params.color.b * 255)}, ${params.opacity})`;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOGO', 0, 0);

    ctx.restore();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, size: number, params: DecalParams, rng: SeededRandom): void {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(params.rotation);

    // Label background
    ctx.fillStyle = `rgba(${Math.floor(params.color.r * 255)}, ${Math.floor(params.color.g * 255)}, ${Math.floor(params.color.b * 255)}, ${params.opacity})`;
    const w = size * 0.8;
    const h = size * 0.3;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Label border
    ctx.strokeStyle = `rgba(0, 0, 0, ${params.opacity * 0.5})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Label text
    ctx.fillStyle = '#000000';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(params.text || 'LABEL', 0, 0);

    ctx.restore();
  }

  private drawWarning(ctx: CanvasRenderingContext2D, size: number, params: DecalParams, rng: SeededRandom): void {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(params.rotation);

    // Yellow triangle
    ctx.fillStyle = `rgba(255, 255, 0, ${params.opacity})`;
    ctx.strokeStyle = `rgba(0, 0, 0, ${params.opacity})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.35);
    ctx.lineTo(size * 0.3, size * 0.3);
    ctx.lineTo(-size * 0.3, size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Exclamation mark
    ctx.fillStyle = `rgba(0, 0, 0, ${params.opacity})`;
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 10);

    ctx.restore();
  }

  private drawCustom(ctx: CanvasRenderingContext2D, size: number, params: DecalParams, rng: SeededRandom): void {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(params.rotation);

    // Custom decal: rounded rectangle with text
    const w = size * 0.7;
    const h = size * 0.5;
    const radius = 20;

    ctx.fillStyle = `rgba(${Math.floor(params.color.r * 255)}, ${Math.floor(params.color.g * 255)}, ${Math.floor(params.color.b * 255)}, ${params.opacity})`;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + radius, -h / 2);
    ctx.lineTo(w / 2 - radius, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + radius);
    ctx.lineTo(w / 2, h / 2 - radius);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - radius, h / 2);
    ctx.lineTo(-w / 2 + radius, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - radius);
    ctx.lineTo(-w / 2, -h / 2 + radius);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + radius, -h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(params.text || 'CUSTOM', 0, 0);

    ctx.restore();
  }

  calculatePlacement(surfaceNormal: Vector3, offset: number, seed: number = 0): DecalPlacement {
    const rng = new SeededRandom(seed);
    return {
      position: surfaceNormal.clone().normalize().multiplyScalar(offset),
      normal: surfaceNormal.clone().normalize(),
      rotation: rng.nextFloat() * Math.PI * 2,
      scale: 1.0,
    };
  }

  getDefaultParams(): DecalParams {
    return {
      type: 'label',
      color: new Color(0xffffff),
      opacity: 0.9,
      scale: new Vector3(1, 1, 1),
      rotation: 0,
    };
  }

  /**
   * Project a decal onto a target mesh using a Three.js DecalGeometry approach.
   * Computes a projection matrix from the decal's position/rotation/scale,
   * transforms vertices into the decal's local space, clips those within
   * the projection volume, and creates a clipped geometry with the decal texture.
   */
  projectDecal(decal: DecalConfig, targetMesh: Mesh): Mesh {
    // Build the projection matrix: world -> decal local space
    const decalWorldMatrix = new Matrix4();
    decalWorldMatrix.compose(
      decal.position,
      new Quaternion().setFromEuler(
        new Euler(decal.rotation.x, decal.rotation.y, decal.rotation.z)
      ),
      decal.scale
    );

    const inverseProjection = new Matrix4().copy(decalWorldMatrix).invert();

    // Get the target mesh geometry in world space
    const sourceGeometry = targetMesh.geometry as BufferGeometry;
    const sourcePosition = sourceGeometry.attributes.position;
    const sourceNormal = sourceGeometry.attributes.normal;
    const sourceUV = sourceGeometry.attributes.uv;
    const sourceIndex = sourceGeometry.index;

    // Get world matrix of target mesh
    const meshWorldMatrix = targetMesh.matrixWorld;

    // Transform vertices to decal local space and collect those inside the unit cube [-0.5, 0.5]
    const clippedPositions: number[] = [];
    const clippedNormals: number[] = [];
    const clippedUVs: number[] = [];
    const clippedIndices: number[] = [];
    const vertexMap = new Map<number, number>(); // original index -> clipped index
    let nextIndex = 0;

    const v = new Vector3();
    const n = new Vector3();

    // Process triangles
    const triCount = sourceIndex ? sourceIndex.count / 3 : sourcePosition.count / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = sourceIndex ? sourceIndex.getX(t * 3) : t * 3;
      const i1 = sourceIndex ? sourceIndex.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = sourceIndex ? sourceIndex.getX(t * 3 + 2) : t * 3 + 2;

      const indices = [i0, i1, i2];
      const triVerts: Vector3[] = [];
      const triNormals: Vector3[] = [];
      const inside = [false, false, false];

      for (let vi = 0; vi < 3; vi++) {
        const idx = indices[vi];
        v.set(sourcePosition.getX(idx), sourcePosition.getY(idx), sourcePosition.getZ(idx));
        v.applyMatrix4(meshWorldMatrix); // world space
        v.applyMatrix4(inverseProjection); // decal local space
        triVerts.push(v.clone());

        // Check if inside unit cube [-0.5, 0.5]
        inside[vi] = (
          v.x >= -0.5 && v.x <= 0.5 &&
          v.y >= -0.5 && v.y <= 0.5 &&
          v.z >= -0.5 && v.z <= 0.5
        );

        if (sourceNormal) {
          n.set(sourceNormal.getX(idx), sourceNormal.getY(idx), sourceNormal.getZ(idx));
          // Transform normal to decal local space (use normalMatrix)
          const normalMatrix = new Matrix4().copy(inverseProjection).transpose();
          n.applyMatrix4(normalMatrix).normalize();
          triNormals.push(n.clone());
        } else {
          triNormals.push(new Vector3(0, 0, 1));
        }
      }

      // If any vertex of the triangle is inside, include it
      if (inside[0] || inside[1] || inside[2]) {
        for (let vi = 0; vi < 3; vi++) {
          const idx = indices[vi];
          if (!vertexMap.has(idx)) {
            vertexMap.set(idx, nextIndex);
            const vert = triVerts[vi];
            clippedPositions.push(vert.x, vert.y, vert.z);
            const norm = triNormals[vi];
            clippedNormals.push(norm.x, norm.y, norm.z);
            // Map position in decal space to UV [0,1]
            clippedUVs.push(vert.x + 0.5, 1.0 - (vert.y + 0.5));
            nextIndex++;
          }
          clippedIndices.push(vertexMap.get(idx)!);
        }
      }
    }

    // Create the decal geometry
    const decalGeometry = new BufferGeometry();
    decalGeometry.setAttribute('position', new Float32BufferAttribute(clippedPositions, 3));
    decalGeometry.setAttribute('normal', new Float32BufferAttribute(clippedNormals, 3));
    decalGeometry.setAttribute('uv', new Float32BufferAttribute(clippedUVs, 2));
    if (clippedIndices.length > 0) {
      decalGeometry.setIndex(new Uint16BufferAttribute(clippedIndices, 1));
    }

    // Create material with the decal texture
    const decalMaterial = new MeshStandardMaterial({
      map: decal.texture,
      transparent: true,
      opacity: decal.opacity ?? 1.0,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // Transform decal geometry back to world space
    decalGeometry.applyMatrix4(decalWorldMatrix);

    const decalMesh = new Mesh(decalGeometry, decalMaterial);
    return decalMesh;
  }
}
