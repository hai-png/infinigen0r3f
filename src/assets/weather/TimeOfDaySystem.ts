/**
 * Time-of-Day System — P7.2: Time-of-Day System
 *
 * Implements a full day/night cycle with sky model integration.
 * Interpolates sun elevation, ambient color temperature, fog density,
 * and shadow direction across the day. Supports the WeatherTransitionManager
 * for smooth weather + time transitions.
 *
 * @module weather
 * @phase 7
 * @p-number P7.2
 */

import * as THREE from 'three';
import type { WeatherTransitionManager, WeatherStateValues } from './WeatherTransitionManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The current state of the time-of-day system.
 */
export type TimeOfDayState = 'night' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'evening';

/**
 * Configuration for the Time-of-Day system.
 */
export interface TimeOfDayConfig {
  /** Starting hour (0-24). Default: 10 */
  startHour: number;
  /** Day cycle duration in real seconds (full 24h). Default: 600 (10 min) */
  cycleDuration: number;
  /** Whether the cycle auto-advances. Default: true */
  autoAdvance: boolean;
  /** Sun color at zenith (noon). Default: 0xFFFFEE */
  sunColorNoon: THREE.ColorRepresentation;
  /** Sun color at horizon (sunrise/sunset). Default: 0xFF8844 */
  sunColorHorizon: THREE.ColorRepresentation;
  /** Moon color. Default: 0x8899BB */
  moonColor: THREE.ColorRepresentation;
  /** Sun intensity at noon (cd). Default: 100000 */
  sunIntensityNoon: number;
  /** Moon intensity (cd). Default: 500 */
  moonIntensity: number;
  /** Ambient color temperature at noon (Kelvin). Default: 6500 */
  ambientColorTempNoon: number;
  /** Ambient color temperature at dawn/dusk (Kelvin). Default: 2500 */
  ambientColorTempHorizon: number;
  /** Ambient color temperature at night (Kelvin). Default: 8000 */
  ambientColorTempNight: number;
  /** Ambient intensity at noon. Default: 0.5 */
  ambientIntensityNoon: number;
  /** Ambient intensity at night. Default: 0.05 */
  ambientIntensityNight: number;
  /** Fog density at noon. Default: 0.0005 */
  fogDensityNoon: number;
  /** Fog density at night. Default: 0.002 */
  fogDensityNight: number;
  /** Fog color at noon. Default: 0xD0E8F8 */
  fogColorNoon: THREE.ColorRepresentation;
  /** Fog color at night. Default: 0x101025 */
  fogColorNight: THREE.ColorRepresentation;
  /** Shadow direction offset from sun (degrees). Default: 0 */
  shadowDirectionOffset: number;
  /** Whether to apply night sky color (stars, moon). Default: true */
  enableNightSky: boolean;
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: TimeOfDayConfig = {
  startHour: 10,
  cycleDuration: 600,
  autoAdvance: true,
  sunColorNoon: 0xffffee,
  sunColorHorizon: 0xff8844,
  moonColor: 0x8899bb,
  sunIntensityNoon: 100000,
  moonIntensity: 500,
  ambientColorTempNoon: 6500,
  ambientColorTempHorizon: 2500,
  ambientColorTempNight: 8000,
  ambientIntensityNoon: 0.5,
  ambientIntensityNight: 0.05,
  fogDensityNoon: 0.0005,
  fogDensityNight: 0.002,
  fogColorNoon: 0xd0e8f8,
  fogColorNight: 0x101025,
  shadowDirectionOffset: 0,
  enableNightSky: true,
};

// ---------------------------------------------------------------------------
// Color Temperature Utility
// ---------------------------------------------------------------------------

/**
 * Convert a color temperature in Kelvin to a THREE.Color.
 * Approximation based on Tanner Helland's algorithm.
 */
function colorTemperatureToColor(kelvin: number): THREE.Color {
  const temp = kelvin / 100;
  let r: number, g: number, b: number;

  // Red
  if (temp <= 66) {
    r = 255;
  } else {
    r = temp - 60;
    r = 329.698727446 * Math.pow(r, -0.1332047592);
    r = THREE.MathUtils.clamp(r, 0, 255);
  }

  // Green
  if (temp <= 66) {
    g = temp;
    g = 99.4708025861 * Math.log(g) - 161.1195681661;
    g = THREE.MathUtils.clamp(g, 0, 255);
  } else {
    g = temp - 60;
    g = 288.1221695283 * Math.pow(g, -0.0755148492);
    g = THREE.MathUtils.clamp(g, 0, 255);
  }

  // Blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = temp - 10;
    b = 138.5177312231 * Math.log(b) - 305.0447927307;
    b = THREE.MathUtils.clamp(b, 0, 255);
  }

  return new THREE.Color(r / 255, g / 255, b / 255);
}

// ---------------------------------------------------------------------------
// Time-of-Day State Lookup
// ---------------------------------------------------------------------------

/**
 * Determine the named time-of-day state from an hour value.
 */
export function getTimeOfDayState(hour: number): TimeOfDayState {
  hour = ((hour % 24) + 24) % 24;

  if (hour >= 5 && hour < 6.5) return 'dawn';
  if (hour >= 6.5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 19) return 'dusk';
  if (hour >= 19 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Get the sun elevation angle (degrees) for a given hour.
 * Uses a sinusoidal model: rises at 6h, peaks at 12h, sets at 18h.
 */
export function getSunElevation(hour: number): number {
  hour = ((hour % 24) + 24) % 24;
  if (hour < 5 || hour > 19) return -10; // Below horizon
  const dayProgress = (hour - 5) / 14; // 0 at 5am, 1 at 7pm
  return Math.sin(dayProgress * Math.PI) * 85;
}

/**
 * Get the sun azimuth angle (degrees) for a given hour.
 * Sun rises in the east (90°), transits south (180°), sets west (270°).
 */
export function getSunAzimuth(hour: number): number {
  hour = ((hour % 24) + 24) % 24;
  // Linear interpolation: 5am=90° (east), 12pm=180° (south), 19pm=270° (west)
  if (hour < 5) return 90;
  if (hour > 19) return 270;
  return 90 + ((hour - 5) / 14) * 180;
}

// ---------------------------------------------------------------------------
// Interpolation Helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return a.clone().lerp(b, t);
}

function smoothstep(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

// ---------------------------------------------------------------------------
// TimeOfDaySystem Class
// ---------------------------------------------------------------------------

/**
 * Manages a full day/night cycle with sky model integration.
 *
 * Drives:
 * - Sun position (elevation + azimuth)
 * - Sun color and intensity
 * - Ambient light color temperature and intensity
 * - Fog density and color
 * - Shadow direction
 * - Scene background color
 *
 * Integrates with WeatherTransitionManager for combined time+weather transitions.
 *
 * @phase 7
 * @p-number P7.2
 */
export class TimeOfDaySystem {
  private config: TimeOfDayConfig;
  private currentHour: number;
  private weatherManager: WeatherTransitionManager | null = null;

  // THREE.js scene references
  private scene: THREE.Scene | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;

  // Computed values (updated each frame)
  private _sunElevation = 0;
  private _sunAzimuth = 0;
  private _sunColor = new THREE.Color();
  private _ambientColor = new THREE.Color();
  private _fogColor = new THREE.Color();
  private _fogDensity = 0;
  private _shadowDirection = new THREE.Vector3();

  // Callbacks for custom integrations
  private onTimeChangeCallbacks: Array<(hour: number, state: TimeOfDayState) => void> = [];

  constructor(config: Partial<TimeOfDayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentHour = this.config.startHour;
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  /**
   * Attach the time-of-day system to a THREE.js scene with standard lights.
   */
  attachToScene(scene: THREE.Scene): void {
    this.scene = scene;

    // Create or reuse sun directional light
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 500;
    this.sunLight.shadow.camera.left = -50;
    this.sunLight.shadow.camera.right = 50;
    this.sunLight.shadow.camera.top = 50;
    this.sunLight.shadow.camera.bottom = -50;
    this.sunLight.name = 'tod_sun';
    scene.add(this.sunLight);

    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.ambientLight.name = 'tod_ambient';
    scene.add(this.ambientLight);

    // Hemisphere light (sky + ground)
    this.hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x3a5f0b, 0.3);
    this.hemisphereLight.name = 'tod_hemisphere';
    scene.add(this.hemisphereLight);

    // Apply initial state
    this.applyToScene();
  }

  /**
   * Attach a WeatherTransitionManager for weather-aware transitions.
   */
  setWeatherManager(manager: WeatherTransitionManager): void {
    this.weatherManager = manager;
  }

  // -------------------------------------------------------------------------
  // Time Control
  // -------------------------------------------------------------------------

  /**
   * Set the current hour (0-24).
   */
  setHour(hour: number): void {
    this.currentHour = ((hour % 24) + 24) % 24;
    this.computeValues();
    this.applyToScene();
    this.fireTimeChange();
  }

  /**
   * Get the current hour.
   */
  getHour(): number {
    return this.currentHour;
  }

  /**
   * Get the current time-of-day state.
   */
  getState(): TimeOfDayState {
    return getTimeOfDayState(this.currentHour);
  }

  // -------------------------------------------------------------------------
  // Frame Update
  // -------------------------------------------------------------------------

  /**
   * Update the time-of-day system. Call once per frame.
   * @param deltaTime - Time elapsed since last frame in seconds
   */
  update(deltaTime: number): void {
    if (!this.config.autoAdvance) return;

    // Advance time: 24 game hours = cycleDuration real seconds
    const hoursPerSecond = 24 / this.config.cycleDuration;
    this.currentHour += deltaTime * hoursPerSecond;
    this.currentHour = ((this.currentHour % 24) + 24) % 24;

    this.computeValues();
    this.applyToScene();
    this.fireTimeChange();
  }

  // -------------------------------------------------------------------------
  // Computed Value Accessors
  // -------------------------------------------------------------------------

  getSunElevation(): number { return this._sunElevation; }
  getSunAzimuth(): number { return this._sunAzimuth; }
  getSunColor(): THREE.Color { return this._sunColor; }
  getAmbientColor(): THREE.Color { return this._ambientColor; }
  getFogColor(): THREE.Color { return this._fogColor; }
  getFogDensity(): number { return this._fogDensity; }
  getShadowDirection(): THREE.Vector3 { return this._shadowDirection; }

  /**
   * Get the sun position as a Vector3 in world space.
   */
  getSunPosition(): THREE.Vector3 {
    const elevRad = this._sunElevation * (Math.PI / 180);
    const azimRad = this._sunAzimuth * (Math.PI / 180);
    const r = 100;

    return new THREE.Vector3(
      r * Math.cos(elevRad) * Math.sin(azimRad),
      r * Math.sin(elevRad),
      -r * Math.cos(elevRad) * Math.cos(azimRad)
    );
  }

  // -------------------------------------------------------------------------
  // Callback Registration
  // -------------------------------------------------------------------------

  /**
   * Register a callback for time changes.
   */
  onTimeChange(callback: (hour: number, state: TimeOfDayState) => void): void {
    this.onTimeChangeCallbacks.push(callback);
  }

  /**
   * Remove a time change callback.
   */
  offTimeChange(callback: (hour: number, state: TimeOfDayState) => void): void {
    const idx = this.onTimeChangeCallbacks.indexOf(callback);
    if (idx >= 0) this.onTimeChangeCallbacks.splice(idx, 1);
  }

  // -------------------------------------------------------------------------
  // Config Access
  // -------------------------------------------------------------------------

  getConfig(): Readonly<TimeOfDayConfig> {
    return { ...this.config };
  }

  updateConfig(partial: Partial<TimeOfDayConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  // -------------------------------------------------------------------------
  // Private: Compute Interpolated Values
  // -------------------------------------------------------------------------

  private computeValues(): void {
    const hour = this.currentHour;
    const elevation = getSunElevation(hour);
    const azimuth = getSunAzimuth(hour);

    this._sunElevation = elevation;
    this._sunAzimuth = azimuth;

    // Day factor: 0 at night, 1 at noon
    const dayFactor = smoothstep(elevation / 90);
    const horizonFactor = 1 - dayFactor; // Strong at horizon

    // Sun color: blend between horizon and noon colors
    const sunColorHorizon = new THREE.Color(this.config.sunColorHorizon);
    const sunColorNoon = new THREE.Color(this.config.sunColorNoon);
    this._sunColor = lerpColor(sunColorHorizon, sunColorNoon, dayFactor);

    // Ambient color from temperature
    const tempHorizon = this.config.ambientColorTempHorizon;
    const tempNoon = this.config.ambientColorTempNoon;
    const tempNight = this.config.ambientColorTempNight;

    let ambientTemp: number;
    if (elevation > 0) {
      ambientTemp = lerp(tempHorizon, tempNoon, dayFactor);
    } else {
      const nightFactor = smoothstep(-elevation / 30);
      ambientTemp = lerp(tempHorizon, tempNight, nightFactor);
    }
    this._ambientColor = colorTemperatureToColor(ambientTemp);

    // Fog interpolation
    const nightFactor = 1 - dayFactor;
    this._fogDensity = lerp(this.config.fogDensityNoon, this.config.fogDensityNight, nightFactor);
    this._fogColor = lerpColor(
      new THREE.Color(this.config.fogColorNoon),
      new THREE.Color(this.config.fogColorNight),
      nightFactor
    );

    // Shadow direction from sun position
    const shadowAzimOffset = this.config.shadowDirectionOffset * (Math.PI / 180);
    this._shadowDirection.set(
      Math.cos(elevation * Math.PI / 180) * Math.sin(azimuth * Math.PI / 180 + shadowAzimOffset),
      -1, // Downward
      Math.cos(elevation * Math.PI / 180) * Math.cos(azimuth * Math.PI / 180 + shadowAzimOffset)
    ).normalize();

    // Apply weather modifier if available
    if (this.weatherManager) {
      const weather = this.weatherManager.getCurrentValues();
      this._fogDensity = lerp(this._fogDensity, weather.fogDensity * 0.01, 0.5);
      this._ambientColor.multiplyScalar(weather.sunIntensityMultiplier);
    }
  }

  // -------------------------------------------------------------------------
  // Private: Apply Computed Values to Scene
  // -------------------------------------------------------------------------

  private applyToScene(): void {
    if (!this.scene) return;

    // Sun light
    if (this.sunLight) {
      const sunPos = this.getSunPosition();
      this.sunLight.position.copy(sunPos);
      this.sunLight.color.copy(this._sunColor);

      // Sun intensity based on elevation
      const dayFactor = smoothstep(this._sunElevation / 90);
      this.sunLight.intensity = lerp(0, this.config.sunIntensityNoon / 100000, dayFactor);

      // Shadow direction
      if (this.sunLight.shadow) {
        this.sunLight.shadow.bias = -0.001;
      }

      // Hide sun below horizon
      this.sunLight.visible = this._sunElevation > 0;
    }

    // Ambient light
    if (this.ambientLight) {
      this.ambientLight.color.copy(this._ambientColor);
      const dayFactor = smoothstep(this._sunElevation / 90);
      this.ambientLight.intensity = lerp(this.config.ambientIntensityNight, this.config.ambientIntensityNoon, dayFactor);
    }

    // Hemisphere light
    if (this.hemisphereLight) {
      const dayFactor = smoothstep(this._sunElevation / 90);
      const skyColor = lerpColor(
        new THREE.Color(0x0a0a30),
        new THREE.Color(0x87ceeb),
        dayFactor
      );
      const groundColor = lerpColor(
        new THREE.Color(0x050510),
        new THREE.Color(0x3a5f0b),
        dayFactor
      );
      this.hemisphereLight.color.copy(skyColor);
      this.hemisphereLight.groundColor.copy(groundColor);
      this.hemisphereLight.intensity = lerp(0.1, 0.4, dayFactor);
    }

    // Fog
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = this._fogDensity;
      this.scene.fog.color.copy(this._fogColor);
    } else if (this._fogDensity > 0) {
      this.scene.fog = new THREE.FogExp2(this._fogColor.getHex(), this._fogDensity);
    }

    // Scene background color (fallback if no sky texture)
    if (!this.scene.environment) {
      const dayFactor = smoothstep(this._sunElevation / 90);
      const bgColor = lerpColor(
        new THREE.Color(0x050510),
        new THREE.Color(0x87ceeb),
        dayFactor
      );
      this.scene.background = bgColor;
    }
  }

  // -------------------------------------------------------------------------
  // Private: Fire Callbacks
  // -------------------------------------------------------------------------

  private fireTimeChange(): void {
    const state = this.getState();
    for (const cb of this.onTimeChangeCallbacks) {
      cb(this.currentHour, state);
    }
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  /**
   * Remove all lights from the scene and clean up.
   */
  dispose(): void {
    if (this.scene) {
      if (this.sunLight) {
        this.scene.remove(this.sunLight);
        this.sunLight.dispose();
      }
      if (this.ambientLight) {
        this.scene.remove(this.ambientLight);
      }
      if (this.hemisphereLight) {
        this.scene.remove(this.hemisphereLight);
      }
    }

    this.sunLight = null;
    this.ambientLight = null;
    this.hemisphereLight = null;
    this.scene = null;
    this.weatherManager = null;
    this.onTimeChangeCallbacks = [];
  }
}

export default TimeOfDaySystem;
