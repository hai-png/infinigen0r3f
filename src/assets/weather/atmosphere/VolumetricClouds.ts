/**
 * Volumetric Cloud System
 * 
 * Implements procedural volumetric clouds inspired by Infinigen's atmosphere system.
 * Uses raymarching through 3D noise fields for realistic cloud rendering.
 * 
 * Features:
 * - Multiple cloud layers (cirrus, cumulus, stratus)
 * - Dynamic lighting with self-shadowing
 * - Wind-driven animation
 * - LOD-based performance optimization
 * 
 * BUG-02 FIX: Cloud layer parameters are now passed as flat uniform arrays
 * instead of GLSL struct arrays, which WebGL cannot bind from JS objects.
 * 
 * @see https://github.com/princeton-vl/infinigen
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';

/** Maximum number of cloud layers supported by the shader */
const MAX_CLOUD_LAYERS = 4;

export interface CloudParams {
  // Layer configuration
  layerCount: number;
  baseHeight: number;
  layerThickness: number;
  
  // Density controls
  density: number;
  coverage: number;
  detail: number;
  
  // Lighting
  lightAbsorption: number;
  shadowIntensity: number;
  albedo: THREE.Color;
  
  // Animation
  windSpeed: THREE.Vector3;
  timeScale: number;
  
  // Performance
  raySteps: number;
  lightSteps: number;
}

const DEFAULT_CLOUD_PARAMS: CloudParams = {
  layerCount: 3,
  baseHeight: 2000,
  layerThickness: 800,
  density: 1.5,
  coverage: 0.6,
  detail: 4.0,
  lightAbsorption: 0.35,
  shadowIntensity: 0.75,
  albedo: new THREE.Color(0xffffff),
  windSpeed: new THREE.Vector3(10, 0, 5),
  timeScale: 1.0,
  raySteps: 64,
  lightSteps: 4,
};

/**
 * Cloud layer definition with specific characteristics
 */
export class CloudLayer {
  type: 'cirrus' | 'cumulus' | 'stratus';
  height: number;
  thickness: number;
  density: number;
  coverage: number;
  scale: number;
  detail: number;
  windOffset: THREE.Vector3;
  
  constructor(
    type: 'cirrus' | 'cumulus' | 'stratus' = 'cumulus',
    params: Partial<CloudLayer> = {}
  ) {
    this.type = type;
    this.height = params.height ?? 2000;
    this.thickness = params.thickness ?? 800;
    this.density = params.density ?? 1.0;
    this.coverage = params.coverage ?? 0.5;
    this.scale = params.scale ?? 1.0;
    this.detail = params.detail ?? 3.0;
    this.windOffset = params.windOffset ?? new THREE.Vector3(0, 0, 0);
    
    // Apply type-specific defaults
    this.applyTypeDefaults();
  }
  
  private applyTypeDefaults(): void {
    switch (this.type) {
      case 'cirrus':
        this.height = this.height || 6000;
        this.thickness = this.thickness || 400;
        this.density = this.density || 0.4;
        this.coverage = this.coverage || 0.3;
        this.scale = this.scale || 3.0;
        this.detail = this.detail || 5.0;
        break;
        
      case 'cumulus':
        this.height = this.height || 2000;
        this.thickness = this.thickness || 1200;
        this.density = this.density || 1.5;
        this.coverage = this.coverage || 0.5;
        this.scale = this.scale || 1.0;
        this.detail = this.detail || 3.0;
        break;
        
      case 'stratus':
        this.height = this.height || 1000;
        this.thickness = this.thickness || 600;
        this.density = this.density || 0.8;
        this.coverage = this.coverage || 0.8;
        this.scale = this.scale || 2.0;
        this.detail = this.detail || 2.0;
        break;
    }
  }
  
  toJSON(): Record<string, any> {
    return {
      type: this.type,
      height: this.height,
      thickness: this.thickness,
      density: this.density,
      coverage: this.coverage,
      scale: this.scale,
      detail: this.detail,
      windOffset: this.windOffset.toArray(),
    };
  }
}

/**
 * Helper to create a padded float array of MAX_CLOUD_LAYERS length
 */
function padFloatArray(values: number[], defaultValue: number = 0): number[] {
  const result = new Array(MAX_CLOUD_LAYERS).fill(defaultValue);
  for (let i = 0; i < Math.min(values.length, MAX_CLOUD_LAYERS); i++) {
    result[i] = values[i];
  }
  return result;
}

/**
 * Helper to create a padded Vector3 array of MAX_CLOUD_LAYERS length
 */
function padVec3Array(values: THREE.Vector3[]): THREE.Vector3[] {
  const result: THREE.Vector3[] = [];
  for (let i = 0; i < MAX_CLOUD_LAYERS; i++) {
    result.push(i < values.length ? values[i].clone() : new THREE.Vector3(0, 0, 0));
  }
  return result;
}

/**
 * Volumetric cloud renderer using raymarching
 */
export class VolumetricClouds {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  
  private cloudMesh: THREE.Mesh;
  private cloudMaterial: THREE.ShaderMaterial;
  private layers: CloudLayer[];
  private params: CloudParams;
  
  private timeUniform: number = 0;
  private sunDirection: THREE.Vector3;
  
  // Noise textures for GPU
  private noiseTexture3D: THREE.Data3DTexture;
  private noiseTexture2D: THREE.DataTexture;
  
  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    params: Partial<CloudParams> = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    this.params = { ...DEFAULT_CLOUD_PARAMS, ...params };
    this.layers = [];
    this.sunDirection = new THREE.Vector3(1, 0.5, 0).normalize();
    
    // Initialize permutation table for Perlin noise
    this.p = new Array(512);
    const permutation = [
      151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
      140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
      247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
      57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
      74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
      60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
      65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
      200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
      52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
      207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
      119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
      129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
      218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
      81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
      184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
      222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180
    ];
    
    for (let i = 0; i < 256; i++) {
      this.p[256 + i] = this.p[i] = permutation[i];
    }
    
    // Initialize noise textures
    this.createNoiseTextures();
    
    // Create cloud geometry and material
    this.cloudMaterial = this.createCloudMaterial();
    const cloudGeometry = new THREE.SphereGeometry(1, 64, 32);
    this.cloudMesh = new THREE.Mesh(cloudGeometry, this.cloudMaterial);
    this.cloudMesh.scale.setScalar(this.params.baseHeight * 3);
    this.cloudMesh.position.y = this.params.baseHeight;
    
    this.scene.add(this.cloudMesh);
    
    // Initialize default layers
    this.addLayer(new CloudLayer('cirrus'));
    this.addLayer(new CloudLayer('cumulus'));
    this.addLayer(new CloudLayer('stratus'));
    
    this.updateUniforms();
  }
  
  /**
   * Create 3D and 2D noise textures for GPU sampling
   */
  private createNoiseTextures(): void {
    const size3D = 128;
    const data3D = new Float32Array(size3D * size3D * size3D);
    
    // Generate 3D noise volume
    for (let z = 0; z < size3D; z++) {
      for (let y = 0; y < size3D; y++) {
        for (let x = 0; x < size3D; x++) {
          const idx = x + y * size3D + z * size3D * size3D;
          data3D[idx] = this.generatePerlinNoise3D(
            x / size3D * 4,
            y / size3D * 4,
            z / size3D * 4
          );
        }
      }
    }
    
    this.noiseTexture3D = new THREE.Data3DTexture(data3D, size3D, size3D, size3D);
    this.noiseTexture3D.format = THREE.RedFormat;
    this.noiseTexture3D.type = THREE.FloatType;
    this.noiseTexture3D.minFilter = THREE.LinearFilter;
    this.noiseTexture3D.magFilter = THREE.LinearFilter;
    this.noiseTexture3D.wrapS = THREE.RepeatWrapping;
    this.noiseTexture3D.wrapT = THREE.RepeatWrapping;
    this.noiseTexture3D.wrapR = THREE.RepeatWrapping;
    this.noiseTexture3D.needsUpdate = true;
    
    // Generate 2D noise for weathering details
    const size2D = 512;
    const data2D = new Float32Array(size2D * size2D * 4);
    
    for (let y = 0; y < size2D; y++) {
      for (let x = 0; x < size2D; x++) {
        const idx = (x + y * size2D) * 4;
        const noise = this.generatePerlinNoise2D(x / size2D * 8, y / size2D * 8);
        data2D[idx] = noise;
        data2D[idx + 1] = noise;
        data2D[idx + 2] = noise;
        data2D[idx + 3] = 1;
      }
    }
    
    this.noiseTexture2D = new THREE.DataTexture(data2D, size2D, size2D);
    this.noiseTexture2D.format = THREE.RGBAFormat;
    this.noiseTexture2D.type = THREE.FloatType;
    this.noiseTexture2D.minFilter = THREE.LinearFilter;
    this.noiseTexture2D.magFilter = THREE.LinearFilter;
    this.noiseTexture2D.wrapS = THREE.RepeatWrapping;
    this.noiseTexture2D.wrapT = THREE.RepeatWrapping;
    this.noiseTexture2D.needsUpdate = true;
  }
  
  private generatePerlinNoise3D(x: number, y: number, z: number): number {
    // Simplified Perlin noise implementation
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    
    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);
    
    const A = this.p[X] + Y;
    const AA = this.p[A] + Z;
    const AB = this.p[A + 1] + Z;
    const B = this.p[X + 1] + Y;
    const BA = this.p[B] + Z;
    const BB = this.p[B + 1] + Z;
    
    return this.lerp(
      w,
      this.lerp(
        v,
        this.lerp(u, this.grad(AA, x, y, z), this.grad(BA, x - 1, y, z)),
        this.lerp(u, this.grad(AB, x, y - 1, z), this.grad(BB, x - 1, y - 1, z))
      ),
      this.lerp(
        v,
        this.lerp(u, this.grad(AA + 1, x, y, z - 1), this.grad(BA + 1, x - 1, y, z - 1)),
        this.lerp(u, this.grad(AB + 1, x, y - 1, z - 1), this.grad(BB + 1, x - 1, y - 1, z - 1))
      )
    );
  }
  
  private generatePerlinNoise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    const u = this.fade(x);
    const v = this.fade(y);
    
    const A = this.p[X] + Y;
    const B = this.p[X + 1] + Y;
    
    return this.lerp(
      v,
      this.lerp(u, this.grad2D(A, x, y), this.grad2D(B, x - 1, y)),
      this.lerp(u, this.grad2D(A + 1, x, y - 1), this.grad2D(B + 1, x - 1, y - 1))
    );
  }
  
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  
  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }
  
  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  
  private grad2D(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  
  private p: number[] = [];
  
  /**
   * Create the cloud shader material with raymarching.
   *
   * BUG-02 FIX: Cloud layer parameters are passed as individual flat uniform
   * arrays (u_layerHeight[4], u_layerCoverage[4], etc.) instead of a
   * GLSL struct array. WebGL cannot bind JS objects to GLSL struct uniforms.
   */
  private createCloudMaterial(): THREE.ShaderMaterial {
    const vertexShader = /* glsl */`
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    
    const fragmentShader = /* glsl */`
      precision highp float;
      precision highp int;
      precision highp sampler3D;

      uniform float time;
      uniform vec3 sunDirection;
      uniform vec3 albedo;
      uniform float density;
      uniform float coverage;
      uniform float detail;
      uniform float lightAbsorption;
      uniform float shadowIntensity;
      uniform int raySteps;
      uniform int lightSteps;
      uniform sampler3D noiseTexture3D;
      uniform sampler2D noiseTexture2D;
      
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      
      #define MAX_CLOUD_LAYERS 4
      #define MAX_STEPS 128
      #define LIGHT_STEPS 8
      
      // BUG-02 FIX: Flattened cloud layer parameters as individual uniform arrays.
      // WebGL cannot bind JavaScript objects to GLSL struct array uniforms.
      // Each layer property is stored in its own array, indexed by layer number.
      uniform int u_layerCount;
      uniform float u_layerHeight[MAX_CLOUD_LAYERS];
      uniform float u_layerThickness[MAX_CLOUD_LAYERS];
      uniform float u_layerDensity[MAX_CLOUD_LAYERS];
      uniform float u_layerCoverage[MAX_CLOUD_LAYERS];
      uniform float u_layerScale[MAX_CLOUD_LAYERS];
      uniform float u_layerDetail[MAX_CLOUD_LAYERS];
      uniform vec3 u_layerWindOffset[MAX_CLOUD_LAYERS];
      uniform float u_layerType[MAX_CLOUD_LAYERS]; // 0=cirrus, 1=cumulus, 2=stratus
      
      // Hash function for noise
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      
      // 3D Noise from texture
      float noise3D(vec3 p) {
        vec3 size = vec3(textureSize(noiseTexture3D, 0));
        vec3 uvw = fract(p) * (1.0 - 1.0 / size);
        vec3 texCoord = (floor(p) + uvw) / size;
        return texture(noiseTexture3D, texCoord).r;
      }
      
      // Fractal Brownian Motion
      float fbm(vec3 p, float detailLevel) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for (int i = 0; i < 6; i++) {
          if (float(i) >= detailLevel) break;
          value += amplitude * noise3D(p * frequency);
          amplitude *= 0.5;
          frequency *= 2.0;
        }
        
        return value;
      }
      
      // Cloud density function for a single layer (by index into flat arrays)
      float cloudDensity(vec3 pos, int layerIdx) {
        float layerHeight = u_layerHeight[layerIdx];
        float layerThickness = u_layerThickness[layerIdx];
        float layerDensity = u_layerDensity[layerIdx];
        float layerCoverage = u_layerCoverage[layerIdx];
        float layerScale = u_layerScale[layerIdx];
        float layerDetail = u_layerDetail[layerIdx];
        vec3 layerWindOffset = u_layerWindOffset[layerIdx];
        
        // Guard: skip layers with zero thickness (padding slots)
        if (layerThickness <= 0.0) return 0.0;
        
        // Height-based falloff
        float heightFraction = (pos.y - layerHeight) / layerThickness;
        float heightFactor = smoothstep(0.0, 0.2, heightFraction) *
                            smoothstep(1.0, 0.8, heightFraction);
        
        // Animated noise
        vec3 noisePos = pos * layerScale + layerWindOffset * time;
        float noise = fbm(noisePos, layerDetail);
        
        // Coverage mask
        float coverageMask = step(1.0 - layerCoverage, noise);
        
        // Final density
        float d = (noise - (1.0 - layerCoverage)) * layerDensity * heightFactor * coverageMask;
        return max(d, 0.0);
      }
      
      // Total cloud density at position
      float getTotalDensity(vec3 pos) {
        float totalDensity = 0.0;
        int count = min(u_layerCount, MAX_CLOUD_LAYERS);
        
        for (int i = 0; i < MAX_CLOUD_LAYERS; i++) {
          if (i >= count) break;
          totalDensity += cloudDensity(pos, i);
        }
        
        return totalDensity;
      }
      
      // Light marching to compute self-shadowing
      float lightMarch(vec3 pos, vec3 lightDir) {
        float totalTransmittance = 1.0;
        float stepSize = 200.0 / float(LIGHT_STEPS);
        
        for (int i = 0; i < LIGHT_STEPS; i++) {
          pos += lightDir * stepSize;
          float d = getTotalDensity(pos);
          totalTransmittance *= exp(-d * lightAbsorption * stepSize);
        }
        
        return totalTransmittance;
      }
      
      void main() {
        vec3 rayOrigin = vWorldPosition;
        vec3 rayDir = normalize(vViewPosition);
        
        // Calculate ray bounds through cloud sphere
        float sphereRadius = 10000.0;
        float sphereCenterY = 3000.0;
        
        vec3 sphereCenter = vec3(0.0, sphereCenterY, 0.0);
        vec3 oc = rayOrigin - sphereCenter;
        
        float b = dot(oc, rayDir);
        float c = dot(oc, oc) - sphereRadius * sphereRadius;
        float discriminant = b * b - c;
        
        if (discriminant < 0.0) {
          discard;
        }
        
        float tMin = max(-b - sqrt(discriminant), 0.0);
        float tMax = -b + sqrt(discriminant);
        
        if (tMin > tMax) {
          discard;
        }
        
        // Raymarching through clouds
        float stepSize = (tMax - tMin) / float(MAX_STEPS);
        vec3 step = rayDir * stepSize;
        vec3 pos = rayOrigin + rayDir * tMin;
        
        vec3 accumulatedColor = vec3(0.0);
        float transmittance = 1.0;
        
        for (int i = 0; i < MAX_STEPS; i++) {
          if (i >= raySteps) break;
          
          float d = getTotalDensity(pos);
          
          if (d > 0.001) {
            // Compute lighting with self-shadowing
            float lightVisibility = lightMarch(pos, sunDirection);
            
            // Simple lighting model
            vec3 lightColor = vec3(1.0, 0.95, 0.9) * lightVisibility;
            float diffuse = max(dot(sunDirection, normalize(pos)), 0.0) * 0.5 + 0.5;
            
            vec3 sampleColor = albedo * lightColor * diffuse * d;
            
            // Accumulate with alpha blending
            float alpha = 1.0 - exp(-d * lightAbsorption * stepSize);
            accumulatedColor += sampleColor * transmittance * alpha;
            transmittance *= (1.0 - alpha);
            
            if (transmittance < 0.01) break;
          }
          
          pos += step;
        }
        
        gl_FragColor = vec4(accumulatedColor, 1.0 - transmittance);
      }
    `;
    
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        time: { value: 0 },
        sunDirection: { value: new THREE.Vector3(1, 0.5, 0).normalize() },
        albedo: { value: new THREE.Color(0xffffff) },
        density: { value: 1.0 },
        coverage: { value: 0.5 },
        detail: { value: 3.0 },
        lightAbsorption: { value: 0.35 },
        shadowIntensity: { value: 0.75 },
        raySteps: { value: 64 },
        lightSteps: { value: 4 },
        noiseTexture3D: { value: this.noiseTexture3D },
        noiseTexture2D: { value: this.noiseTexture2D },
        // BUG-02 FIX: Flattened layer uniform arrays replace the broken
        // `layers: { value: [] }` struct array that WebGL could not bind.
        u_layerCount: { value: 0 },
        u_layerHeight: { value: padFloatArray([], 0) },
        u_layerThickness: { value: padFloatArray([], 0) },
        u_layerDensity: { value: padFloatArray([], 0) },
        u_layerCoverage: { value: padFloatArray([], 0) },
        u_layerScale: { value: padFloatArray([], 0) },
        u_layerDetail: { value: padFloatArray([], 0) },
        u_layerWindOffset: { value: padVec3Array([]) },
        u_layerType: { value: padFloatArray([], 0) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
  }
  
  /**
   * Add a cloud layer
   */
  addLayer(layer: CloudLayer): void {
    if (this.layers.length >= MAX_CLOUD_LAYERS) {
      console.warn(
        `VolumetricClouds: Maximum ${MAX_CLOUD_LAYERS} layers reached. Ignoring additional layer.`
      );
      return;
    }
    this.layers.push(layer);
    this.updateUniforms();
  }
  
  /**
   * Remove a cloud layer by index
   */
  removeLayer(index: number): void {
    if (index >= 0 && index < this.layers.length) {
      this.layers.splice(index, 1);
      this.updateUniforms();
    }
  }
  
  /**
   * Update shader uniforms.
   *
   * BUG-02 FIX: Cloud layer parameters are now written into flat uniform
   * arrays (u_layerHeight, u_layerCoverage, etc.) instead of being packed
   * into JavaScript objects under a single `layers` uniform that WebGL
   * cannot bind to a GLSL struct array.
   */
  private updateUniforms(): void {
    const uniforms = this.cloudMaterial.uniforms;
    
    uniforms.time.value = this.timeUniform;
    uniforms.sunDirection.value.copy(this.sunDirection);
    uniforms.albedo.value.copy(this.params.albedo);
    uniforms.density.value = this.params.density;
    uniforms.coverage.value = this.params.coverage;
    uniforms.detail.value = this.params.detail;
    uniforms.lightAbsorption.value = this.params.lightAbsorption;
    uniforms.shadowIntensity.value = this.params.shadowIntensity;
    uniforms.raySteps.value = Math.min(this.params.raySteps, 128);
    uniforms.lightSteps.value = Math.min(this.params.lightSteps, 8);
    
    // Clamp layer count to MAX_CLOUD_LAYERS
    const activeLayers = Math.min(this.layers.length, MAX_CLOUD_LAYERS);
    uniforms.u_layerCount.value = activeLayers;
    
    // Flatten each layer's properties into dedicated uniform arrays,
    // padded to MAX_CLOUD_LAYERS length with safe default values.
    const heights: number[] = [];
    const thicknesses: number[] = [];
    const densities: number[] = [];
    const coverages: number[] = [];
    const scales: number[] = [];
    const details: number[] = [];
    const windOffsets: THREE.Vector3[] = [];
    const types: number[] = [];
    
    for (let i = 0; i < activeLayers; i++) {
      const layer = this.layers[i];
      heights.push(layer.height);
      thicknesses.push(layer.thickness);
      densities.push(layer.density);
      coverages.push(layer.coverage);
      scales.push(layer.scale);
      details.push(layer.detail);
      windOffsets.push(layer.windOffset);
      types.push(
        layer.type === 'cirrus' ? 0 : layer.type === 'cumulus' ? 1 : 2
      );
    }
    
    // Write padded arrays into uniforms
    uniforms.u_layerHeight.value = padFloatArray(heights, 0);
    uniforms.u_layerThickness.value = padFloatArray(thicknesses, 0);
    uniforms.u_layerDensity.value = padFloatArray(densities, 0);
    uniforms.u_layerCoverage.value = padFloatArray(coverages, 0);
    uniforms.u_layerScale.value = padFloatArray(scales, 0);
    uniforms.u_layerDetail.value = padFloatArray(details, 0);
    uniforms.u_layerWindOffset.value = padVec3Array(windOffsets);
    uniforms.u_layerType.value = padFloatArray(types, 0);
    
    this.cloudMaterial.needsUpdate = true;
  }
  
  /**
   * Update cloud parameters
   */
  updateParams(params: Partial<CloudParams>): void {
    this.params = { ...this.params, ...params };
    this.updateUniforms();
  }
  
  /**
   * Set sun direction for lighting
   */
  setSunDirection(direction: THREE.Vector3): void {
    this.sunDirection.copy(direction).normalize();
    this.updateUniforms();
  }
  
  /**
   * Animate clouds based on time and wind
   */
  animate(deltaTime: number): void {
    this.timeUniform += deltaTime * this.params.timeScale;
    
    // Update wind offsets for each layer
    for (const layer of this.layers) {
      layer.windOffset.addScaledVector(this.params.windSpeed, deltaTime * 0.001);
    }
    
    this.updateUniforms();
    
    // Keep cloud mesh facing camera (billboard effect for distant clouds)
    this.cloudMesh.lookAt(this.camera.position);
  }
  
  /**
   * Cleanup resources
   */
  dispose(): void {
    this.scene.remove(this.cloudMesh);
    this.cloudMesh.geometry.dispose();
    this.cloudMaterial.dispose();
    this.noiseTexture3D.dispose();
    this.noiseTexture2D.dispose();
  }
}

export default VolumetricClouds;
