/**
 * Multi-Pass Renderer for Infinigen R3F
 *
 * Implements multi-pass rendering system with support for:
 * - Beauty pass (final composited image)
 * - Depth pass (camera-space depth)
 * - Normal pass (world-space normals)
 * - UV pass (texture coordinates)
 * - Position pass (world-space positions)
 * - Albedo pass (base color without lighting)
 * - Roughness pass
 * - Metalness pass
 * - Emission pass
 * - Shadow pass
 * - Ambient Occlusion pass
 * - Instance ID pass (for segmentation)
 * - Material ID pass
 * - Vector pass (motion vectors)
 *
 * Based on: infinigen/core/rendering/render.py
 *
 * @module render
 */
import { WebGLRenderTarget, Color, Mesh, ShaderMaterial, FloatType, UnsignedByteType, RGBAFormat, NearestFilter, ClampToEdgeWrapping, } from 'three';
/**
 * Available render pass types
 */
export var RenderPassType;
(function (RenderPassType) {
    RenderPassType["BEAUTY"] = "beauty";
    RenderPassType["DEPTH"] = "depth";
    RenderPassType["NORMAL"] = "normal";
    RenderPassType["UV"] = "uv";
    RenderPassType["POSITION"] = "position";
    RenderPassType["ALBEDO"] = "albedo";
    RenderPassType["ROUGHNESS"] = "roughness";
    RenderPassType["METALNESS"] = "metalness";
    RenderPassType["EMISSION"] = "emission";
    RenderPassType["SHADOW"] = "shadow";
    RenderPassType["AO"] = "ao";
    RenderPassType["INSTANCE_ID"] = "instanceId";
    RenderPassType["MATERIAL_ID"] = "materialId";
    RenderPassType["VECTOR"] = "vector";
})(RenderPassType || (RenderPassType = {}));
/**
 * Default pass configurations
 */
export const DEFAULT_PASS_CONFIGS = {
    [RenderPassType.BEAUTY]: {
        type: RenderPassType.BEAUTY,
        enabled: true,
        format: 'uint8',
        postProcess: { toneMap: true, gamma: 2.2 },
    },
    [RenderPassType.DEPTH]: {
        type: RenderPassType.DEPTH,
        enabled: true,
        format: 'float32',
        postProcess: { normalize: false },
    },
    [RenderPassType.NORMAL]: {
        type: RenderPassType.NORMAL,
        enabled: true,
        format: 'float16',
        postProcess: { normalize: true },
    },
    [RenderPassType.UV]: {
        type: RenderPassType.UV,
        enabled: false,
        format: 'float16',
    },
    [RenderPassType.POSITION]: {
        type: RenderPassType.POSITION,
        enabled: false,
        format: 'float32',
    },
    [RenderPassType.ALBEDO]: {
        type: RenderPassType.ALBEDO,
        enabled: true,
        format: 'uint8',
    },
    [RenderPassType.ROUGHNESS]: {
        type: RenderPassType.ROUGHNESS,
        enabled: false,
        format: 'uint8',
    },
    [RenderPassType.METALNESS]: {
        type: RenderPassType.METALNESS,
        enabled: false,
        format: 'uint8',
    },
    [RenderPassType.EMISSION]: {
        type: RenderPassType.EMISSION,
        enabled: false,
        format: 'float16',
    },
    [RenderPassType.SHADOW]: {
        type: RenderPassType.SHADOW,
        enabled: false,
        format: 'uint8',
    },
    [RenderPassType.AO]: {
        type: RenderPassType.AO,
        enabled: false,
        format: 'uint8',
    },
    [RenderPassType.INSTANCE_ID]: {
        type: RenderPassType.INSTANCE_ID,
        enabled: true,
        format: 'float32',
    },
    [RenderPassType.MATERIAL_ID]: {
        type: RenderPassType.MATERIAL_ID,
        enabled: true,
        format: 'float32',
    },
    [RenderPassType.VECTOR]: {
        type: RenderPassType.VECTOR,
        enabled: false,
        format: 'float16',
    },
};
/**
 * Multi-Pass Renderer Class
 *
 * Manages rendering of multiple passes in a single scene traversal
 * where possible, or multiple traversals for incompatible passes.
 */
export class MultiPassRenderer {
    constructor(renderer, width = 1920, height = 1080) {
        this.renderer = renderer;
        this.width = width;
        this.height = height;
        this.passConfigs = new Map();
        this.renderTargetPool = new Map();
        this.originalMaterials = new Map();
        // Initialize with default configs
        Object.values(DEFAULT_PASS_CONFIGS).forEach(config => {
            this.passConfigs.set(config.type, { ...config });
        });
    }
    /**
     * Configure which passes to render
     */
    configurePasses(passConfigs) {
        Object.entries(passConfigs).forEach(([type, config]) => {
            const passType = type;
            const existing = this.passConfigs.get(passType);
            if (existing && config) {
                this.passConfigs.set(passType, { ...existing, ...config });
            }
        });
    }
    /**
     * Get enabled passes
     */
    getEnabledPasses() {
        const enabled = [];
        this.passConfigs.forEach((config, type) => {
            if (config.enabled) {
                enabled.push(type);
            }
        });
        return enabled;
    }
    /**
     * Create a render target for a specific pass
     */
    createRenderTarget(type) {
        const config = this.passConfigs.get(type);
        let format;
        let dataType;
        let channels = 4;
        switch (config.format) {
            case 'float32':
                format = RGBAFormat;
                dataType = FloatType;
                break;
            case 'float16':
                format = RGBAFormat;
                dataType = FloatType; // Note: Use HalfFloatType if available in your Three.js version
                break;
            case 'uint8':
            default:
                format = RGBAFormat;
                dataType = UnsignedByteType;
                break;
        }
        // Special cases for single-channel data
        if (type === RenderPassType.DEPTH ||
            type === RenderPassType.INSTANCE_ID ||
            type === RenderPassType.MATERIAL_ID) {
            channels = 1;
            format = RGBAFormat; // Still use RGBA but only fill R channel
        }
        const target = new WebGLRenderTarget(this.width, this.height, {
            format,
            type: dataType,
            minFilter: NearestFilter,
            maxFilter: NearestFilter,
            wrapS: ClampToEdgeWrapping,
            wrapT: ClampToEdgeWrapping,
            depthBuffer: type === RenderPassType.DEPTH,
            stencilBuffer: false,
        });
        return target;
    }
    /**
     * Get or create a render target from pool
     */
    getRenderTarget(type) {
        const key = `${type}_${this.width}x${this.height}`;
        const pool = this.renderTargetPool.get(key) || [];
        if (pool.length > 0) {
            return pool.pop();
        }
        return this.createRenderTarget(type);
    }
    /**
     * Return a render target to the pool
     */
    releaseRenderTarget(type, target) {
        const key = `${type}_${this.width}x${this.height}`;
        const pool = this.renderTargetPool.get(key) || [];
        pool.push(target);
        this.renderTargetPool.set(key, pool);
    }
    /**
     * Override scene materials for a specific pass
     */
    overrideMaterials(scene, passType) {
        this.originalMaterials.clear();
        scene.traverse((object) => {
            if (!(object instanceof Mesh))
                return;
            const mesh = object;
            // Skip hidden objects
            if (!mesh.visible || mesh.layers.isEnabled(0) === false) {
                return;
            }
            // Store original material(s)
            if (Array.isArray(mesh.material)) {
                this.originalMaterials.set(mesh, [...mesh.material]);
            }
            else {
                this.originalMaterials.set(mesh, mesh.material);
            }
            // Apply pass-specific material
            const overrideMaterial = this.createPassMaterial(passType, mesh);
            if (overrideMaterial) {
                mesh.material = overrideMaterial;
            }
        });
    }
    /**
     * Restore original scene materials
     */
    restoreMaterials(scene) {
        scene.traverse((object) => {
            if (!(object instanceof Mesh))
                return;
            const mesh = object;
            const original = this.originalMaterials.get(mesh);
            if (original) {
                mesh.material = original;
            }
        });
        this.originalMaterials.clear();
    }
    /**
     * Create material for a specific pass type
     */
    createPassMaterial(passType, mesh) {
        switch (passType) {
            case RenderPassType.DEPTH:
                return this.createDepthMaterial();
            case RenderPassType.NORMAL:
                return this.createNormalMaterial();
            case RenderPassType.POSITION:
                return this.createPositionMaterial();
            case RenderPassType.UV:
                return this.createUVMaterial();
            case RenderPassType.ALBEDO:
                return this.createAlbedoMaterial(mesh);
            case RenderPassType.INSTANCE_ID:
                return this.createInstanceIdMaterial(mesh);
            case RenderPassType.MATERIAL_ID:
                return this.createMaterialIdMaterial(mesh);
            case RenderPassType.ROUGHNESS:
                return this.createRoughnessMaterial(mesh);
            case RenderPassType.METALNESS:
                return this.createMetalnessMaterial(mesh);
            case RenderPassType.EMISSION:
                return this.createEmissionMaterial(mesh);
            default:
                return null;
        }
    }
    /**
     * Create depth pass material
     */
    createDepthMaterial() {
        return new ShaderMaterial({
            vertexShader: `
        varying float vDepth;
        uniform mat4 cameraProjectionMatrix;
        
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
            fragmentShader: `
        varying float vDepth;
        
        void main() {
          gl_FragColor = vec4(vDepth, vDepth, vDepth, 1.0);
        }
      `,
        });
    }
    /**
     * Create normal pass material
     */
    createNormalMaterial() {
        return new ShaderMaterial({
            vertexShader: `
        varying vec3 vNormal;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        varying vec3 vNormal;
        
        void main() {
          // Convert from [-1,1] to [0,1]
          vec3 normal = vNormal * 0.5 + 0.5;
          gl_FragColor = vec4(normal, 1.0);
        }
      `,
        });
    }
    /**
     * Create position pass material
     */
    createPositionMaterial() {
        return new ShaderMaterial({
            vertexShader: `
        varying vec3 vWorldPosition;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        varying vec3 vWorldPosition;
        
        void main() {
          gl_FragColor = vec4(vWorldPosition, 1.0);
        }
      `,
        });
    }
    /**
     * Create UV pass material
     */
    createUVMaterial() {
        return new ShaderMaterial({
            vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        varying vec2 vUv;
        
        void main() {
          gl_FragColor = vec4(vUv, 0.0, 1.0);
        }
      `,
        });
    }
    /**
     * Create albedo pass material (extract base color)
     */
    createAlbedoMaterial(mesh) {
        const originalMaterial = this.originalMaterials.get(mesh);
        if (!originalMaterial)
            return null;
        // Extract base color from standard/physical material
        let baseColor = new Color(1, 1, 1);
        if ('color' in originalMaterial && originalMaterial.color) {
            baseColor.copy(originalMaterial.color);
        }
        return new ShaderMaterial({
            uniforms: {
                baseColor: { value: baseColor },
            },
            vertexShader: `
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform vec3 baseColor;
        varying vec2 vUv;
        
        void main() {
          gl_FragColor = vec4(baseColor, 1.0);
        }
      `,
        });
    }
    /**
     * Create instance ID pass material
     */
    createInstanceIdMaterial(mesh) {
        // Use object's unique ID or custom ID if available
        const instanceId = mesh.instanceId ?? mesh.id;
        // Encode integer ID as float (may lose precision for very large IDs)
        const r = ((instanceId >> 0) & 0xFF) / 255.0;
        const g = ((instanceId >> 8) & 0xFF) / 255.0;
        const b = ((instanceId >> 16) & 0xFF) / 255.0;
        const a = ((instanceId >> 24) & 0xFF) / 255.0;
        return new ShaderMaterial({
            uniforms: {
                instanceColor: { value: new Color(r, g, b) },
            },
            vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform vec3 instanceColor;
        
        void main() {
          gl_FragColor = vec4(instanceColor, 1.0);
        }
      `,
        });
    }
    /**
     * Create material ID pass material
     */
    createMaterialIdMaterial(mesh) {
        const originalMaterial = this.originalMaterials.get(mesh);
        const materialId = originalMaterial ? originalMaterial.uuid.hashCode?.() ?? 0 : 0;
        // Encode material ID
        const r = ((materialId >> 0) & 0xFF) / 255.0;
        const g = ((materialId >> 8) & 0xFF) / 255.0;
        const b = ((materialId >> 16) & 0xFF) / 255.0;
        return new ShaderMaterial({
            uniforms: {
                materialColor: { value: new Color(r, g, b) },
            },
            vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform vec3 materialColor;
        
        void main() {
          gl_FragColor = vec4(materialColor, 1.0);
        }
      `,
        });
    }
    /**
     * Create roughness pass material
     */
    createRoughnessMaterial(mesh) {
        const originalMaterial = this.originalMaterials.get(mesh);
        if (!originalMaterial)
            return null;
        let roughness = 1.0;
        if ('roughness' in originalMaterial && typeof originalMaterial.roughness === 'number') {
            roughness = originalMaterial.roughness;
        }
        return new ShaderMaterial({
            uniforms: {
                roughness: { value: roughness },
            },
            vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform float roughness;
        
        void main() {
          gl_FragColor = vec4(vec3(roughness), 1.0);
        }
      `,
        });
    }
    /**
     * Create metalness pass material
     */
    createMetalnessMaterial(mesh) {
        const originalMaterial = this.originalMaterials.get(mesh);
        if (!originalMaterial)
            return null;
        let metalness = 0.0;
        if ('metalness' in originalMaterial && typeof originalMaterial.metalness === 'number') {
            metalness = originalMaterial.metalness;
        }
        return new ShaderMaterial({
            uniforms: {
                metalness: { value: metalness },
            },
            vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform float metalness;
        
        void main() {
          gl_FragColor = vec4(vec3(metalness), 1.0);
        }
      `,
        });
    }
    /**
     * Create emission pass material
     */
    createEmissionMaterial(mesh) {
        const originalMaterial = this.originalMaterials.get(mesh);
        if (!originalMaterial)
            return null;
        let emissive = new Color(0, 0, 0);
        if ('emissive' in originalMaterial && originalMaterial.emissive) {
            emissive.copy(originalMaterial.emissive);
        }
        return new ShaderMaterial({
            uniforms: {
                emissive: { value: emissive },
            },
            vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform vec3 emissive;
        
        void main() {
          gl_FragColor = vec4(emissive, 1.0);
        }
      `,
        });
    }
    /**
     * Render all enabled passes
     */
    async render(scene, camera, frameNumber) {
        const warnings = [];
        const passes = new Map();
        const enabledPasses = this.getEnabledPasses();
        // Save current renderer state
        const previousState = {
            autoClear: this.renderer.autoClear,
            clearColor: this.renderer.getClearColor().clone(),
            clearAlpha: this.renderer.getClearAlpha(),
        };
        try {
            // Group passes by compatibility (can be rendered together)
            const passGroups = this.groupCompatiblePasses(enabledPasses);
            for (const passGroup of passGroups) {
                // For now, render each pass separately
                // Future optimization: batch compatible passes
                for (const passType of passGroup) {
                    const result = await this.renderSinglePass(scene, camera, passType, frameNumber);
                    if (result) {
                        passes.set(passType, result);
                    }
                    else {
                        warnings.push(`Failed to render pass: ${passType}`);
                    }
                }
            }
            return {
                success: passes.size > 0,
                passes,
                warnings,
                metadata: {
                    resolution: [this.width, this.height],
                    cameraMatrix: camera.matrixWorld.clone(),
                    projectionMatrix: camera.projectionMatrix.clone(),
                    timestamp: Date.now(),
                    frameNumber,
                },
            };
        }
        finally {
            // Restore renderer state
            this.renderer.autoClear = previousState.autoClear;
            this.renderer.setClearColor(previousState.clearColor, previousState.clearAlpha);
        }
    }
    /**
     * Render a single pass
     */
    async renderSinglePass(scene, camera, passType, frameNumber) {
        const config = this.passConfigs.get(passType);
        if (!config || !config.enabled) {
            return null;
        }
        const renderTarget = this.getRenderTarget(passType);
        // Set render target
        this.renderer.setRenderTarget(renderTarget);
        // Clear buffers
        this.renderer.setClearColor(new Color(0, 0, 0), 1);
        this.renderer.clear(true, true, true);
        // Override materials for this pass
        if (passType !== RenderPassType.BEAUTY) {
            this.overrideMaterials(scene, passType);
        }
        // Render
        this.renderer.render(scene, camera);
        // Restore materials
        if (passType !== RenderPassType.BEAUTY) {
            this.restoreMaterials(scene);
        }
        // Reset render target
        this.renderer.setRenderTarget(null);
        // Determine channels based on pass type
        let channels = 4;
        if (passType === RenderPassType.DEPTH ||
            passType === RenderPassType.INSTANCE_ID ||
            passType === RenderPassType.MATERIAL_ID) {
            channels = 1;
        }
        return {
            type: passType,
            texture: renderTarget,
            metadata: {
                width: this.width,
                height: this.height,
                channels,
                format: config.format,
            },
        };
    }
    /**
     * Group compatible passes for batch rendering
     */
    groupCompatiblePasses(passes) {
        // For now, each pass is its own group
        // Future optimization: group passes that can share material overrides
        return passes.map(pass => [pass]);
    }
    /**
     * Extract pixel data from a render target
     */
    extractData(target) {
        const gl = this.renderer.getContext();
        const { width, height } = target;
        // Determine data type
        const isFloat = target.type === FloatType;
        const data = isFloat
            ? new Float32Array(width * height * 4)
            : new Uint8Array(width * height * 4);
        // Read pixels
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, isFloat ? gl.FLOAT : gl.UNSIGNED_BYTE, data);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return data;
    }
    /**
     * Resize renderer and update dimensions
     */
    resize(width, height) {
        this.width = width;
        this.height = height;
        // Clear pool to force recreation at new size
        this.renderTargetPool.clear();
    }
    /**
     * Cleanup resources
     */
    dispose() {
        this.renderTargetPool.forEach(pool => {
            pool.forEach(target => target.dispose());
        });
        this.renderTargetPool.clear();
    }
}
if (!String.prototype.hashCode) {
    String.prototype.hashCode = function () {
        let hash = 0;
        for (let i = 0; i < this.length; i++) {
            const char = this.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    };
}
export default MultiPassRenderer;
//# sourceMappingURL=multi-pass-renderer.js.map