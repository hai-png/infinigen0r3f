/**
 * Time of Day Presets
 *
 * Preset configurations for different times of day with smooth interpolation.
 * Each preset defines sun position, sun color, ambient color, fog color, and sky parameters.
 *
 * Time ranges:
 *   Dawn   (5-7):  warm orange horizon, long shadows
 *   Morning (7-10): bright, clear
 *   Noon   (10-14): high sun, short shadows
 *   Afternoon (14-17): warm golden light
 *   Dusk   (17-19): orange/purple horizon
 *   Night  (19-5):  moonlight, stars
 *
 * @module TimeOfDayPresets
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Preset Data
// ---------------------------------------------------------------------------

export interface TimeOfDayPreset {
  /** Name/label of this preset */
  name: string;
  /** Hour at which this preset is the dominant state */
  hour: number;
  /** Sun direction (normalized) */
  sunPosition: THREE.Vector3;
  /** Sun color */
  sunColor: THREE.Color;
  /** Sun intensity multiplier (0-1+) */
  sunIntensity: number;
  /** Ambient light color */
  ambientColor: THREE.Color;
  /** Ambient light intensity */
  ambientIntensity: number;
  /** Hemisphere sky color */
  hemisphereSkyColor: THREE.Color;
  /** Hemisphere ground color */
  hemisphereGroundColor: THREE.Color;
  /** Fog color */
  fogColor: THREE.Color;
  /** Fog near distance */
  fogNear: number;
  /** Fog far distance */
  fogFar: number;
  /** Sky turbidity */
  turbidity: number;
  /** Rayleigh scattering coefficient */
  rayleigh: number;
  /** Mie coefficient */
  mieCoefficient: number;
  /** Mie directional G */
  mieDirectionalG: number;
}

/**
 * The six core time-of-day presets
 */
export const TIME_OF_DAY_PRESETS: TimeOfDayPreset[] = [
  // Dawn (5-7)
  {
    name: 'Dawn',
    hour: 6,
    sunPosition: new THREE.Vector3(0.2, 0.15, -0.9).normalize(),
    sunColor: new THREE.Color(0xff8844),
    sunIntensity: 0.4,
    ambientColor: new THREE.Color(0x8866aa),
    ambientIntensity: 0.25,
    hemisphereSkyColor: new THREE.Color(0xff7744),
    hemisphereGroundColor: new THREE.Color(0x332211),
    fogColor: new THREE.Color(0x996655),
    fogNear: 40,
    fogFar: 200,
    turbidity: 4,
    rayleigh: 3,
    mieCoefficient: 0.01,
    mieDirectionalG: 0.8,
  },
  // Morning (7-10)
  {
    name: 'Morning',
    hour: 8.5,
    sunPosition: new THREE.Vector3(0.6, 0.5, -0.6).normalize(),
    sunColor: new THREE.Color(0xfff4e0),
    sunIntensity: 1.2,
    ambientColor: new THREE.Color(0xb8d4e8),
    ambientIntensity: 0.4,
    hemisphereSkyColor: new THREE.Color(0x87ceeb),
    hemisphereGroundColor: new THREE.Color(0x3a5f0b),
    fogColor: new THREE.Color(0xc8ddf0),
    fogNear: 80,
    fogFar: 320,
    turbidity: 2,
    rayleigh: 2,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
  },
  // Noon (10-14)
  {
    name: 'Noon',
    hour: 12,
    sunPosition: new THREE.Vector3(0.05, 0.95, 0.05).normalize(),
    sunColor: new THREE.Color(0xffffff),
    sunIntensity: 1.6,
    ambientColor: new THREE.Color(0xc8ddf0),
    ambientIntensity: 0.45,
    hemisphereSkyColor: new THREE.Color(0x87ceeb),
    hemisphereGroundColor: new THREE.Color(0x3a5f0b),
    fogColor: new THREE.Color(0xd0e8f8),
    fogNear: 100,
    fogFar: 380,
    turbidity: 1.5,
    rayleigh: 1,
    mieCoefficient: 0.003,
    mieDirectionalG: 0.8,
  },
  // Afternoon (14-17)
  {
    name: 'Afternoon',
    hour: 15.5,
    sunPosition: new THREE.Vector3(-0.6, 0.5, 0.6).normalize(),
    sunColor: new THREE.Color(0xffe8b0),
    sunIntensity: 1.3,
    ambientColor: new THREE.Color(0xd0c8a0),
    ambientIntensity: 0.4,
    hemisphereSkyColor: new THREE.Color(0xa0c0e0),
    hemisphereGroundColor: new THREE.Color(0x556622),
    fogColor: new THREE.Color(0xd0d8c0),
    fogNear: 70,
    fogFar: 300,
    turbidity: 2.5,
    rayleigh: 2,
    mieCoefficient: 0.006,
    mieDirectionalG: 0.75,
  },
  // Dusk (17-19)
  {
    name: 'Dusk',
    hour: 18,
    sunPosition: new THREE.Vector3(-0.3, 0.1, 0.9).normalize(),
    sunColor: new THREE.Color(0xff5522),
    sunIntensity: 0.5,
    ambientColor: new THREE.Color(0x664488),
    ambientIntensity: 0.2,
    hemisphereSkyColor: new THREE.Color(0xcc5533),
    hemisphereGroundColor: new THREE.Color(0x221111),
    fogColor: new THREE.Color(0x775544),
    fogNear: 30,
    fogFar: 180,
    turbidity: 6,
    rayleigh: 4,
    mieCoefficient: 0.015,
    mieDirectionalG: 0.85,
  },
  // Night (19-5)
  {
    name: 'Night',
    hour: 0,
    sunPosition: new THREE.Vector3(0, -0.9, 0).normalize(),
    sunColor: new THREE.Color(0x4466aa),
    sunIntensity: 0.05,
    ambientColor: new THREE.Color(0x112244),
    ambientIntensity: 0.1,
    hemisphereSkyColor: new THREE.Color(0x0a0a30),
    hemisphereGroundColor: new THREE.Color(0x050510),
    fogColor: new THREE.Color(0x101025),
    fogNear: 20,
    fogFar: 120,
    turbidity: 0.5,
    rayleigh: 0.5,
    mieCoefficient: 0.001,
    mieDirectionalG: 0.9,
  },
];

// ---------------------------------------------------------------------------
// Interpolation Utility
// ---------------------------------------------------------------------------

/**
 * Get interpolated time-of-day values for any hour (0-24).
 *
 * Finds the two nearest presets by hour and linearly interpolates between them.
 * The hour ordering wraps around midnight (Night preset at hour 0).
 */
export function getInterpolatedPreset(hour: number): TimeOfDayPreset {
  // Normalize hour to 0-24
  hour = ((hour % 24) + 24) % 24;

  // Sort presets by hour for interpolation
  // Night preset is at hour 0, so we need to handle the wrap-around
  const sorted = [...TIME_OF_DAY_PRESETS].sort((a, b) => a.hour - b.hour);

  // Find the two presets that bracket the given hour
  let prevIdx = 0;
  let nextIdx = 1;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (hour >= sorted[i].hour && hour < sorted[i + 1].hour) {
      prevIdx = i;
      nextIdx = i + 1;
      break;
    }
  }

  // Handle wrap-around at midnight
  if (hour >= sorted[sorted.length - 1].hour || hour < sorted[0].hour) {
    prevIdx = sorted.length - 1;
    nextIdx = 0;
  }

  const prev = sorted[prevIdx];
  const next = sorted[nextIdx];

  // Calculate interpolation factor
  let range: number;
  let offset: number;

  if (nextIdx > prevIdx) {
    range = next.hour - prev.hour;
    offset = hour - prev.hour;
  } else {
    // Wrap-around: prev is the last preset, next is the first
    range = (24 - prev.hour) + next.hour;
    offset = hour >= prev.hour ? hour - prev.hour : (24 - prev.hour) + hour;
  }

  const t = range > 0 ? offset / range : 0;

  return interpolatePresets(prev, next, t, hour);
}

/**
 * Compute sun position from hour using a simple sinusoidal model.
 * This provides a more physically accurate sun path than preset interpolation.
 */
export function computeSunPosition(hour: number): THREE.Vector3 {
  // Sun rises at ~6, peaks at ~12, sets at ~18
  const angle = ((hour - 6) / 12) * Math.PI; // 0 at 6am, PI at 6pm
  const elevation = Math.sin(angle);
  const azimuth = -Math.cos(angle);

  // Below horizon at night
  const y = Math.max(-0.5, elevation);
  return new THREE.Vector3(azimuth, y, 0.2).normalize();
}

/**
 * Linearly interpolate between two presets.
 */
function interpolatePresets(
  a: TimeOfDayPreset,
  b: TimeOfDayPreset,
  t: number,
  targetHour: number
): TimeOfDayPreset {
  // Smooth the interpolation
  const st = smoothstep(t);

  return {
    name: t < 0.5 ? a.name : b.name,
    hour: targetHour,
    sunPosition: computeSunPosition(targetHour),
    sunColor: a.sunColor.clone().lerp(b.sunColor, st),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, st),
    ambientColor: a.ambientColor.clone().lerp(b.ambientColor, st),
    ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, st),
    hemisphereSkyColor: a.hemisphereSkyColor.clone().lerp(b.hemisphereSkyColor, st),
    hemisphereGroundColor: a.hemisphereGroundColor.clone().lerp(b.hemisphereGroundColor, st),
    fogColor: a.fogColor.clone().lerp(b.fogColor, st),
    fogNear: lerp(a.fogNear, b.fogNear, st),
    fogFar: lerp(a.fogFar, b.fogFar, st),
    turbidity: lerp(a.turbidity, b.turbidity, st),
    rayleigh: lerp(a.rayleigh, b.rayleigh, st),
    mieCoefficient: lerp(a.mieCoefficient, b.mieCoefficient, st),
    mieDirectionalG: lerp(a.mieDirectionalG, b.mieDirectionalG, st),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export default TIME_OF_DAY_PRESETS;
