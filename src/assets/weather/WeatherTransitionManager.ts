/**
 * Weather Transition Manager
 *
 * Manages smooth transitions between weather states with lerp-based
 * interpolation over configurable duration. Each weather state defines
 * target values for cloud coverage, precipitation, fog, wind, and lighting.
 *
 * @module WeatherTransitionManager
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Weather State Types
// ---------------------------------------------------------------------------

export type WeatherStateType =
  | 'Clear'
  | 'PartlyCloudy'
  | 'Overcast'
  | 'Rain'
  | 'Storm'
  | 'Snow'
  | 'Fog';

export interface WeatherStateValues {
  cloudCoverage: number;    // 0-1
  cloudDensity: number;     // 0-1
  precipitationIntensity: number; // 0-1
  fogDensity: number;       // 0-1
  fogColor: THREE.Color;
  windSpeed: number;        // m/s
  windDirection: THREE.Vector3;
  sunIntensityMultiplier: number; // 0-1
  ambientColorShift: THREE.Color;
  temperature: number;      // Celsius
}

// ---------------------------------------------------------------------------
// Preset Weather State Definitions
// ---------------------------------------------------------------------------

const WEATHER_PRESETS: Record<WeatherStateType, WeatherStateValues> = {
  Clear: {
    cloudCoverage: 0.05,
    cloudDensity: 0.1,
    precipitationIntensity: 0.0,
    fogDensity: 0.0,
    fogColor: new THREE.Color(0xc8ddf0),
    windSpeed: 2,
    windDirection: new THREE.Vector3(1, 0, 0.2).normalize(),
    sunIntensityMultiplier: 1.0,
    ambientColorShift: new THREE.Color(0xffffff),
    temperature: 22,
  },
  PartlyCloudy: {
    cloudCoverage: 0.4,
    cloudDensity: 0.35,
    precipitationIntensity: 0.0,
    fogDensity: 0.02,
    fogColor: new THREE.Color(0xc0d0e0),
    windSpeed: 5,
    windDirection: new THREE.Vector3(1, 0, 0.5).normalize(),
    sunIntensityMultiplier: 0.8,
    ambientColorShift: new THREE.Color(0xf0f0f0),
    temperature: 19,
  },
  Overcast: {
    cloudCoverage: 0.85,
    cloudDensity: 0.7,
    precipitationIntensity: 0.0,
    fogDensity: 0.06,
    fogColor: new THREE.Color(0xaab0b8),
    windSpeed: 8,
    windDirection: new THREE.Vector3(1, 0, 0.8).normalize(),
    sunIntensityMultiplier: 0.4,
    ambientColorShift: new THREE.Color(0xd0d0d0),
    temperature: 16,
  },
  Rain: {
    cloudCoverage: 0.9,
    cloudDensity: 0.8,
    precipitationIntensity: 0.7,
    fogDensity: 0.1,
    fogColor: new THREE.Color(0x8890a0),
    windSpeed: 12,
    windDirection: new THREE.Vector3(1, 0, 0.6).normalize(),
    sunIntensityMultiplier: 0.25,
    ambientColorShift: new THREE.Color(0xb0b8c8),
    temperature: 13,
  },
  Storm: {
    cloudCoverage: 1.0,
    cloudDensity: 1.0,
    precipitationIntensity: 1.0,
    fogDensity: 0.15,
    fogColor: new THREE.Color(0x606878),
    windSpeed: 25,
    windDirection: new THREE.Vector3(1, 0, 1).normalize(),
    sunIntensityMultiplier: 0.1,
    ambientColorShift: new THREE.Color(0x8090a0),
    temperature: 10,
  },
  Snow: {
    cloudCoverage: 0.75,
    cloudDensity: 0.6,
    precipitationIntensity: 0.6,
    fogDensity: 0.08,
    fogColor: new THREE.Color(0xd0d8e8),
    windSpeed: 6,
    windDirection: new THREE.Vector3(1, 0, 0.3).normalize(),
    sunIntensityMultiplier: 0.5,
    ambientColorShift: new THREE.Color(0xe0e8f0),
    temperature: -3,
  },
  Fog: {
    cloudCoverage: 0.5,
    cloudDensity: 0.3,
    precipitationIntensity: 0.0,
    fogDensity: 0.4,
    fogColor: new THREE.Color(0x9098a0),
    windSpeed: 1,
    windDirection: new THREE.Vector3(0.5, 0, 0.2).normalize(),
    sunIntensityMultiplier: 0.3,
    ambientColorShift: new THREE.Color(0xc8c8d0),
    temperature: 8,
  },
};

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type WeatherEventType = 'stateChange' | 'transitionStart' | 'transitionComplete';

export interface WeatherEvent {
  type: WeatherEventType;
  from: WeatherStateType;
  to: WeatherStateType;
  progress: number;
  currentValues: WeatherStateValues;
}

type WeatherEventListener = (event: WeatherEvent) => void;

// ---------------------------------------------------------------------------
// WeatherTransitionManager
// ---------------------------------------------------------------------------

export class WeatherTransitionManager {
  private currentState: WeatherStateType;
  private targetState: WeatherStateType;
  private currentValues: WeatherStateValues;
  private startValues: WeatherStateValues;
  private targetValues: WeatherStateValues;

  private transitionProgress: number = 1.0;
  private transitionDuration: number = 5.0; // seconds
  private isTransitioning: boolean = false;

  private listeners: Map<WeatherEventType, WeatherEventListener[]> = new Map();

  constructor(initialState: WeatherStateType = 'Clear') {
    this.currentState = initialState;
    this.targetState = initialState;

    const preset = WEATHER_PRESETS[initialState];
    this.currentValues = this.cloneValues(preset);
    this.startValues = this.cloneValues(preset);
    this.targetValues = this.cloneValues(preset);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Transition to a new weather state over the specified duration.
   */
  transitionTo(state: WeatherStateType, durationSeconds: number = 5.0): void {
    if (state === this.currentState && !this.isTransitioning) return;

    this.startValues = this.cloneValues(this.currentValues);
    this.targetValues = this.cloneValues(WEATHER_PRESETS[state]);
    this.targetState = state;
    this.transitionProgress = 0;
    this.transitionDuration = durationSeconds;
    this.isTransitioning = true;

    this.emit('transitionStart', {
      type: 'transitionStart',
      from: this.currentState,
      to: state,
      progress: 0,
      currentValues: this.currentValues,
    });
  }

  /**
   * Update transition progress. Call once per frame with deltaTime in seconds.
   */
  update(deltaTime: number): void {
    if (!this.isTransitioning) return;

    this.transitionProgress += deltaTime / this.transitionDuration;

    if (this.transitionProgress >= 1.0) {
      this.transitionProgress = 1.0;
      this.isTransitioning = false;
      this.currentState = this.targetState;
      this.currentValues = this.cloneValues(this.targetValues);

      this.emit('stateChange', {
        type: 'stateChange',
        from: this.currentState,
        to: this.targetState,
        progress: 1.0,
        currentValues: this.currentValues,
      });

      this.emit('transitionComplete', {
        type: 'transitionComplete',
        from: this.currentState,
        to: this.targetState,
        progress: 1.0,
        currentValues: this.currentValues,
      });
    } else {
      const t = this.easeInOutCubic(this.transitionProgress);
      this.interpolateValues(this.startValues, this.targetValues, t, this.currentValues);

      this.emit('stateChange', {
        type: 'stateChange',
        from: this.currentState,
        to: this.targetState,
        progress: this.transitionProgress,
        currentValues: this.currentValues,
      });
    }
  }

  /**
   * Get the current interpolated weather values.
   */
  getCurrentValues(): WeatherStateValues {
    return this.currentValues;
  }

  /**
   * Get the current weather state type.
   */
  getCurrentState(): WeatherStateType {
    return this.currentState;
  }

  /**
   * Get the target weather state type (may differ during transition).
   */
  getTargetState(): WeatherStateType {
    return this.targetState;
  }

  /**
   * Get transition progress (0-1), or 1 if not transitioning.
   */
  getTransitionProgress(): number {
    return this.transitionProgress;
  }

  /**
   * Check if a transition is in progress.
   */
  getIsTransitioning(): boolean {
    return this.isTransitioning;
  }

  /**
   * Get all available weather state types.
   */
  getAvailableStates(): WeatherStateType[] {
    return Object.keys(WEATHER_PRESETS) as WeatherStateType[];
  }

  /**
   * Get a specific preset by name.
   */
  getPreset(state: WeatherStateType): WeatherStateValues {
    return this.cloneValues(WEATHER_PRESETS[state]);
  }

  // -------------------------------------------------------------------------
  // Event System
  // -------------------------------------------------------------------------

  /**
   * Subscribe to weather events.
   */
  on(event: WeatherEventType, listener: WeatherEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  /**
   * Unsubscribe from weather events.
   */
  off(event: WeatherEventType, listener: WeatherEventListener): void {
    const list = this.listeners.get(event);
    if (list) {
      const idx = list.indexOf(listener);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  private emit(event: WeatherEventType, data: WeatherEvent): void {
    const list = this.listeners.get(event);
    if (list) {
      for (const listener of list) {
        listener(data);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Interpolation Helpers
  // -------------------------------------------------------------------------

  private interpolateValues(
    from: WeatherStateValues,
    to: WeatherStateValues,
    t: number,
    out: WeatherStateValues
  ): void {
    out.cloudCoverage = this.lerp(from.cloudCoverage, to.cloudCoverage, t);
    out.cloudDensity = this.lerp(from.cloudDensity, to.cloudDensity, t);
    out.precipitationIntensity = this.lerp(from.precipitationIntensity, to.precipitationIntensity, t);
    out.fogDensity = this.lerp(from.fogDensity, to.fogDensity, t);
    out.fogColor.copy(from.fogColor).lerp(to.fogColor, t);
    out.windSpeed = this.lerp(from.windSpeed, to.windSpeed, t);
    out.windDirection.copy(from.windDirection).lerp(to.windDirection, t).normalize();
    out.sunIntensityMultiplier = this.lerp(from.sunIntensityMultiplier, to.sunIntensityMultiplier, t);
    out.ambientColorShift.copy(from.ambientColorShift).lerp(to.ambientColorShift, t);
    out.temperature = this.lerp(from.temperature, to.temperature, t);
  }

  private cloneValues(v: WeatherStateValues): WeatherStateValues {
    return {
      cloudCoverage: v.cloudCoverage,
      cloudDensity: v.cloudDensity,
      precipitationIntensity: v.precipitationIntensity,
      fogDensity: v.fogDensity,
      fogColor: v.fogColor.clone(),
      windSpeed: v.windSpeed,
      windDirection: v.windDirection.clone(),
      sunIntensityMultiplier: v.sunIntensityMultiplier,
      ambientColorShift: v.ambientColorShift.clone(),
      temperature: v.temperature,
    };
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

export default WeatherTransitionManager;
