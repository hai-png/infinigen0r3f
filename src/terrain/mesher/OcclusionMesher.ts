/**
 * OcclusionMesher.ts
 * 
 * GPU-accelerated meshing with depth testing integration.
 * Uses occlusion culling to optimize terrain mesh generation.
 * 
 * Based on original Infinigen's OcMesher adapted for Three.js/WebGL.
 */

import { 
  WebGLRenderer, 
  WebGLRenderTarget, 
  ShaderMaterial, 
  BufferGeometry,
  Vector3,
  Camera,
  Matrix4
} from 'three';

export interface OcclusionConfig {
  enableOcclusionCulling: boolean;
  occlusionThreshold: number;
  depthTestPrecision: number;
  maxVisibleChunks: number;
}

const DEFAULT_OCCLUSION_CONFIG: OcclusionConfig = {
  enableOcclusionCulling: true,
  occlusionThreshold: 0.95,
  depthTestPrecision: 0.001,
  maxVisibleChunks: 64,
};

interface DepthData {
  texture: WebGLRenderTarget;
  data: Float32Array;
}

/**
 * GPU-accelerated mesher with occlusion culling support
 */
export class OcclusionMesher {
  private renderer: WebGLRenderer;
  private config: OcclusionConfig;
  private depthTarget: WebGLRenderTarget | null;
  private depthMaterial: ShaderMaterial | null;
  private depthData: DepthData | null;

  constructor(
    renderer: WebGLRenderer,
    config: Partial<OcclusionConfig> = {}
  ) {
    this.renderer = renderer;
    this.config = { ...DEFAULT_OCCLUSION_CONFIG, ...config };
    this.depthTarget = null;
    this.depthMaterial = null;
    this.depthData = null;
  }

  /**
   * Initialize depth buffer and materials for occlusion testing
   */
  initialize(width: number, height: number): void {
    // Create depth render target
    this.depthTarget = new WebGLRenderTarget(width, height, {
      format: 0x1906, // RGBAFormat
      type: 0x1406,   // FLOAT_TYPE
      depthBuffer: true,
      stencilBuffer: false,
    });

    // Create depth test shader material
    this.depthMaterial = new ShaderMaterial({
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec4 vClipPosition;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vClipPosition = projectionMatrix * viewMatrix * worldPosition;
          gl_Position = vClipPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        varying vec4 vClipPosition;
        
        uniform float depthThreshold;
        uniform sampler2D depthTexture;
        
        void main() {
          vec2 uv = (vClipPosition.xy / vClipPosition.w) * 0.5 + 0.5;
          float sceneDepth = texture2D(depthTexture, uv).r;
          float surfaceDepth = vClipPosition.z / vClipPosition.w;
          
          if (abs(sceneDepth - surfaceDepth) < depthThreshold) {
            discard;
          }
          
          gl_FragColor = vec4(vWorldPosition, 1.0);
        }
      `,
      uniforms: {
        depthThreshold: { value: this.config.depthTestPrecision },
        depthTexture: { value: null },
      },
    });

    // Initialize depth data buffer
    const size = width * height;
    this.depthData = {
      texture: this.depthTarget,
      data: new Float32Array(size),
    };
  }

  /**
   * Render depth pass for occlusion testing
   */
  renderDepthPass(camera: Camera, sceneObjects: any[]): void {
    if (!this.depthTarget || !this.config.enableOcclusionCulling) return;

    // Save current renderer state
    const currentTarget = this.renderer.getRenderTarget();
    
    // Render to depth target
    this.renderer.setRenderTarget(this.depthTarget);
    this.renderer.clearDepth();
    
    // Render simplified geometry for depth testing
    for (const obj of sceneObjects) {
      if (obj.mesh) {
        obj.mesh.material = this.depthMaterial;
        this.renderer.render(obj.mesh, camera);
      }
    }

    // Restore renderer state
    this.renderer.setRenderTarget(currentTarget);
  }

  /**
   * Test if a point is occluded from camera view
   */
  isOccluded(
    point: Vector3,
    camera: Camera,
    viewMatrix: Matrix4,
    projectionMatrix: Matrix4
  ): boolean {
    if (!this.depthTarget || !this.depthData || !this.config.enableOcclusionCulling) {
      return false;
    }

    // Transform point to clip space
    const clipPos = point.clone().applyMatrix4(viewMatrix).applyMatrix4(projectionMatrix);
    
    // Convert to UV coordinates
    const uvX = (clipPos.x / clipPos.w) * 0.5 + 0.5;
    const uvY = (clipPos.y / clipPos.w) * 0.5 + 0.5;

    // Check bounds
    if (uvX < 0 || uvX > 1 || uvY < 0 || uvY > 1) {
      return false;
    }

    // Sample depth buffer
    const width = this.depthTarget.width;
    const height = this.depthTarget.height;
    const x = Math.floor(uvX * width);
    const y = Math.floor(uvY * height);
    const index = y * width + x;

    const sceneDepth = this.depthData.data[index];
    const pointDepth = clipPos.z / clipPos.w;

    // Point is occluded if it's behind the stored depth
    return pointDepth > sceneDepth + this.config.depthTestPrecision;
  }

  /**
   * Generate mesh with occlusion-aware sampling
   */
  generateMeshWithOcclusion(
    baseGeometry: BufferGeometry,
    camera: Camera,
    sampleDensity: number
  ): BufferGeometry {
    const positions = baseGeometry.getAttribute('position');
    if (!positions) return baseGeometry;

    const visibleVertices: number[] = [];
    const viewMatrix = camera.matrixWorldInverse;
    const projectionMatrix = camera.projectionMatrix;

    // Filter vertices based on occlusion
    for (let i = 0; i < positions.count; i++) {
      const vertex = new Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      );

      if (!this.isOccluded(vertex, camera, viewMatrix, projectionMatrix)) {
        visibleVertices.push(i);
      }
    }

    // If too many vertices are occluded, reduce mesh complexity
    if (visibleVertices.length < positions.count * this.config.occlusionThreshold) {
      return this.createReducedMesh(baseGeometry, visibleVertices);
    }

    return baseGeometry;
  }

  /**
   * Create reduced mesh from visible vertices only
   */
  private createReducedMesh(
    geometry: BufferGeometry,
    visibleIndices: number[]
  ): BufferGeometry {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const uvs = geometry.getAttribute('uv');

    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];

    for (const idx of visibleIndices) {
      newPositions.push(positions.getX(idx), positions.getY(idx), positions.getZ(idx));
      
      if (normals) {
        newNormals.push(normals.getX(idx), normals.getY(idx), normals.getZ(idx));
      }
      
      if (uvs) {
        newUvs.push(uvs.getX(idx), uvs.getY(idx));
      }
    }

    const newGeometry = new BufferGeometry();
    newGeometry.setAttribute('position', new Float32Array(newPositions));
    
    if (newNormals.length > 0) {
      newGeometry.setAttribute('normal', new Float32Array(newNormals));
    }
    
    if (newUvs.length > 0) {
      newGeometry.setAttribute('uv', new Float32Array(newUvs));
    }

    newGeometry.computeVertexNormals();
    return newGeometry;
  }

  /**
   * Update depth buffer dynamically
   */
  updateDepthBuffer(): void {
    if (!this.depthTarget || !this.depthData) return;

    // Read depth buffer from GPU
    const gl = this.renderer.getContext() as WebGLRenderingContext;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthTarget.framebuffer);
    gl.readPixels(
      0, 0,
      this.depthTarget.width,
      this.depthTarget.height,
      gl.RGBA,
      gl.FLOAT,
      this.depthData.data
    );
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.depthTarget) {
      this.depthTarget.dispose();
      this.depthTarget = null;
    }
    
    if (this.depthMaterial) {
      this.depthMaterial.dispose();
      this.depthMaterial = null;
    }
    
    this.depthData = null;
  }

  /**
   * Configure occlusion settings
   */
  setConfig(config: Partial<OcclusionConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.depthMaterial) {
      this.depthMaterial.uniforms.depthThreshold.value = this.config.depthTestPrecision;
    }
  }
}

export default OcclusionMesher;
