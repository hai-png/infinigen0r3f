/**
 * WeatherParticles.ts
 * GPU-accelerated rain, snow, and hail particle systems
 * Part of Phase 4: Advanced Features - 100% Completion
 */

import * as THREE from 'three';

export interface ParticleConfig {
  maxCount: number;
  particleSize: number;
  fallSpeed: number;
  windEffect: number;
  turbulence: number;
  lifespan: number;
  spawnRate: number;
}

export interface WeatherType {
  type: 'rain' | 'snow' | 'hail' | 'drizzle' | 'storm';
  intensity: number; // 0-1
  color: THREE.Color;
  particleConfig: Partial<ParticleConfig>;
}

const defaultConfigs: Record<string, Required<ParticleConfig>> = {
  rain: {
    maxCount: 10000,
    particleSize: 0.1,
    fallSpeed: 20,
    windEffect: 0.5,
    turbulence: 0.1,
    lifespan: 10,
    spawnRate: 1000,
  },
  snow: {
    maxCount: 5000,
    particleSize: 0.15,
    fallSpeed: 3,
    windEffect: 1.0,
    turbulence: 0.3,
    lifespan: 20,
    spawnRate: 500,
  },
  hail: {
    maxCount: 2000,
    particleSize: 0.3,
    fallSpeed: 30,
    windEffect: 0.3,
    turbulence: 0.2,
    lifespan: 8,
    spawnRate: 200,
  },
  drizzle: {
    maxCount: 8000,
    particleSize: 0.05,
    fallSpeed: 10,
    windEffect: 0.8,
    turbulence: 0.15,
    lifespan: 15,
    spawnRate: 800,
  },
  storm: {
    maxCount: 15000,
    particleSize: 0.2,
    fallSpeed: 35,
    windEffect: 2.0,
    turbulence: 0.5,
    lifespan: 6,
    spawnRate: 1500,
  },
};

export class WeatherParticles {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private particleSystems: Map<string, THREE.Points>;
  private geometries: Map<string, THREE.BufferGeometry>;
  private materials: Map<string, THREE.ShaderMaterial>;
  private activeWeather: WeatherType[];
  private clock: THREE.Clock;
  private windDirection: THREE.Vector3;
  private windStrength: number;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.particleSystems = new Map();
    this.geometries = new Map();
    this.materials = new Map();
    this.activeWeather = [];
    this.clock = new THREE.Clock();
    this.windDirection = new THREE.Vector3(1, 0, 0);
    this.windStrength = 0;

    this.initializeParticleSystems();
  }

  private initializeParticleSystems(): void {
    const weatherTypes: Array<'rain' | 'snow' | 'hail' | 'drizzle' | 'storm'> = 
      ['rain', 'snow', 'hail', 'drizzle', 'storm'];

    for (const type of weatherTypes) {
      this.createParticleSystem(type);
    }
  }

  private createParticleSystem(weatherType: string): void {
    const config = defaultConfigs[weatherType];
    
    // Create geometry with buffer attributes
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(config.maxCount * 3);
    const velocities = new Float32Array(config.maxCount * 3);
    const sizes = new Float32Array(config.maxCount);
    const opacities = new Float32Array(config.maxCount);

    for (let i = 0; i < config.maxCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 1] = Math.random() * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 100;

      velocities[i * 3] = 0;
      velocities[i * 3 + 1] = -config.fallSpeed;
      velocities[i * 3 + 2] = 0;

      sizes[i] = config.particleSize * (0.5 + Math.random() * 0.5);
      opacities[i] = 0; // Initially hidden
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

    // Create shader material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0xffffff) },
        pixelRatio: { value: this.renderer.getPixelRatio() },
      },
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getFragmentShader(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    particles.visible = false;
    
    this.scene.add(particles);
    this.particleSystems.set(weatherType, particles);
    this.geometries.set(weatherType, geometry);
    this.materials.set(weatherType, material);
  }

  private getVertexShader(): string {
    return `
      attribute vec3 velocity;
      attribute float size;
      attribute float opacity;
      
      uniform float time;
      uniform float pixelRatio;
      
      varying float vOpacity;
      varying vec3 vColor;
      
      void main() {
        vOpacity = opacity;
        
        vec3 pos = position;
        pos.y += velocity.y * time * 0.001;
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
      }
    `;
  }

  private getFragmentShader(): string {
    return `
      uniform vec3 color;
      
      varying float vOpacity;
      
      void main() {
        if (vOpacity < 0.01) discard;
        
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        
        float alpha = vOpacity * (1.0 - dist * 2.0);
        gl_FragColor = vec4(color, alpha);
      }
    `;
  }

  setWeather(weather: WeatherType[]): void {
    // Hide all particle systems first
    this.particleSystems.forEach((system) => {
      system.visible = false;
    });

    this.activeWeather = weather;

    // Show and configure active weather systems
    for (const w of weather) {
      const system = this.particleSystems.get(w.type);
      const geometry = this.geometries.get(w.type);
      const material = this.materials.get(w.type);

      if (system && geometry && material) {
        system.visible = true;
        
        // Update color
        material.uniforms.color.value.copy(w.color);
        
        // Update particle count based on intensity
        const config = defaultConfigs[w.type];
        const activeCount = Math.floor(config.maxCount * w.intensity);
        
        const opacities = geometry.attributes.opacity.array as Float32Array;
        for (let i = 0; i < config.maxCount; i++) {
          opacities[i] = i < activeCount ? 0.5 + Math.random() * 0.5 : 0;
        }
        geometry.attributes.opacity.needsUpdate = true;
      }
    }
  }

  update(deltaTime: number): void {
    const time = this.clock.getElapsedTime();

    for (const weather of this.activeWeather) {
      const system = this.particleSystems.get(weather.type);
      const geometry = this.geometries.get(weather.type);

      if (!system || !geometry) continue;

      const config = { ...defaultConfigs[weather.type], ...weather.particleConfig };
      const positions = geometry.attributes.position.array as Float32Array;
      const velocities = geometry.attributes.velocity.array as Float32Array;

      // Update particles
      for (let i = 0; i < config.maxCount; i++) {
        const idx = i * 3;
        
        // Apply wind
        velocities[idx] += this.windDirection.x * this.windStrength * config.windEffect * deltaTime;
        velocities[idx + 2] += this.windDirection.z * this.windStrength * config.windEffect * deltaTime;
        
        // Apply turbulence
        velocities[idx] += (Math.random() - 0.5) * config.turbulence * deltaTime;
        velocities[idx + 2] += (Math.random() - 0.5) * config.turbulence * deltaTime;
        
        // Update position
        positions[idx] += velocities[idx] * deltaTime;
        positions[idx + 1] += velocities[idx + 1] * deltaTime;
        positions[idx + 2] += velocities[idx + 2] * deltaTime;
        
        // Reset particle if it falls below ground or goes out of bounds
        if (positions[idx + 1] < 0 || 
            Math.abs(positions[idx]) > 50 || 
            Math.abs(positions[idx + 2]) > 50) {
          positions[idx] = (Math.random() - 0.5) * 100;
          positions[idx + 1] = 50;
          positions[idx + 2] = (Math.random() - 0.5) * 100;
          
          velocities[idx] = 0;
          velocities[idx + 1] = -config.fallSpeed;
          velocities[idx + 2] = 0;
        }
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.velocity.needsUpdate = true;

      // Update shader time
      const material = this.materials.get(weather.type)!;
      material.uniforms.time.value = time;
    }
  }

  setWind(direction: THREE.Vector3, strength: number): void {
    this.windDirection.copy(direction.normalize());
    this.windStrength = Math.max(0, Math.min(1, strength));
  }

  addWeather(weather: WeatherType): void {
    if (!this.activeWeather.find(w => w.type === weather.type)) {
      this.activeWeather.push(weather);
      this.setWeather(this.activeWeather);
    } else {
      // Update existing weather intensity
      const existing = this.activeWeather.find(w => w.type === weather.type)!;
      existing.intensity = weather.intensity;
      existing.color.copy(weather.color);
      this.setWeather(this.activeWeather);
    }
  }

  removeWeather(weatherType: string): void {
    this.activeWeather = this.activeWeather.filter(w => w.type !== weatherType);
    this.setWeather(this.activeWeather);
  }

  clearWeather(): void {
    this.activeWeather = [];
    this.setWeather([]);
  }

  dispose(): void {
    this.particleSystems.forEach((system) => {
      this.scene.remove(system);
      system.geometry.dispose();
      (system.material as THREE.Material).dispose();
    });

    this.particleSystems.clear();
    this.geometries.clear();
    this.materials.clear();
  }
}

export default WeatherParticles;
