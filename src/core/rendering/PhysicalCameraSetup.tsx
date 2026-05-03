'use client';

/**
 * PhysicalCameraSetup — Physical Camera for Path-Traced Rendering
 *
 * Replaces PerspectiveCamera with PhysicalCamera from three-gpu-pathtracer
 * in path-traced mode. Provides physically-based depth of field with bokeh,
 * auto-focus, and cinematic camera settings.
 *
 * Phase 9 — P9.1: PhysicalCamera Integration
 *
 * @module rendering
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRenderingMode } from '@/core/rendering/RenderingModeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhysicalCameraConfig {
  /** F-stop (1.4 - 22) */
  fStop: number;
  /** Focus distance in meters */
  focusDistance: number;
  /** Number of aperture blades (0 = circular) */
  apertureBlades: number;
  /** Aperture rotation in radians */
  apertureRotation: number;
  /** Anamorphic ratio for cinematic wide-screen DOF (>1 = wider) */
  anamorphicRatio: number;
  /** Whether to auto-focus on scene center */
  autoFocus: boolean;
  /** FOV in degrees (default: 50) */
  fov: number;
  /** Near clipping plane */
  near: number;
  /** Far clipping plane */
  far: number;
}

export const DEFAULT_PHYSICAL_CAMERA_CONFIG: PhysicalCameraConfig = {
  fStop: 2.8,
  focusDistance: 25,
  apertureBlades: 6,
  apertureRotation: 0,
  anamorphicRatio: 1,
  autoFocus: true,
  fov: 50,
  near: 0.1,
  far: 1000,
};

// ---------------------------------------------------------------------------
// PhysicalCameraSetup Component
// ---------------------------------------------------------------------------

/**
 * R3F component that configures the camera for path-traced rendering.
 * In path-trace mode, upgrades the camera to PhysicalCamera with DOF.
 * In rasterize mode, uses the standard PerspectiveCamera.
 */
export function PhysicalCameraSetup({
  config: partialConfig,
}: {
  config?: Partial<PhysicalCameraConfig>;
}) {
  const config = useMemo(
    () => ({ ...DEFAULT_PHYSICAL_CAMERA_CONFIG, ...partialConfig }),
    [partialConfig],
  );

  const { camera, scene } = useThree();
  const { mode } = useRenderingMode();
  const physicalCameraRef = useRef<any>(null);

  useEffect(() => {
    if (mode !== 'pathtrace') return;

    // Try to load PhysicalCamera from three-gpu-pathtracer
    const setupPhysicalCamera = async () => {
      try {
        const { PhysicalCamera } = await import('three-gpu-pathtracer');

        const physicalCamera = new PhysicalCamera(
          config.fov,
          (camera as THREE.PerspectiveCamera).aspect,
          config.near,
          config.far,
        );

        physicalCamera.fStop = config.fStop;
        physicalCamera.focusDistance = config.focusDistance;
        physicalCamera.apertureBlades = config.apertureBlades;
        physicalCamera.apertureRotation = config.apertureRotation;
        physicalCamera.anamorphicRatio = config.anamorphicRatio;

        // Copy existing camera transform
        physicalCamera.position.copy(camera.position);
        physicalCamera.quaternion.copy(camera.quaternion);
        physicalCamera.rotation.copy(camera.rotation);

        physicalCameraRef.current = physicalCamera;

        // Store reference for the path tracer adapter to pick up
        (camera as any)._physicalCamera = physicalCamera;
      } catch (err) {
        console.warn('[PhysicalCameraSetup] PhysicalCamera not available:', err);
      }
    };

    setupPhysicalCamera();

    return () => {
      physicalCameraRef.current = null;
      (camera as any)._physicalCamera = undefined;
    };
  }, [mode, camera, config]);

  // Auto-focus: compute focusDistance from scene depth at screen center
  useFrame(() => {
    if (mode !== 'pathtrace' || !config.autoFocus) return;

    const perspCam = camera as THREE.PerspectiveCamera;
    const raycaster = new THREE.Raycaster();

    // Cast ray from screen center
    raycaster.setFromCamera(new THREE.Vector2(0, 0), perspCam);

    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
      const focusDistance = intersects[0].distance;

      if (physicalCameraRef.current) {
        physicalCameraRef.current.focusDistance = focusDistance;
      }
    }
  });

  // Apply fStop and other settings when they change
  useEffect(() => {
    if (!physicalCameraRef.current) return;

    physicalCameraRef.current.fStop = config.fStop;
    physicalCameraRef.current.focusDistance = config.focusDistance;
    physicalCameraRef.current.apertureBlades = config.apertureBlades;
    physicalCameraRef.current.apertureRotation = config.apertureRotation;
    physicalCameraRef.current.anamorphicRatio = config.anamorphicRatio;
  }, [config]);

  return null;
}

// ---------------------------------------------------------------------------
// Frame-by-Frame Path Tracing
// ---------------------------------------------------------------------------

export interface AnimatedPathTracerConfig {
  /** Samples per animation frame (default: 1) */
  samplesPerFrame: number;
  /** Use tiles for progressive rendering (default: [1, 1]) */
  tiles: [number, number];
  /** Whether to reset accumulation each frame (default: true for animation) */
  resetEachFrame: boolean;
  /** Output: capture to canvas or offscreen buffer */
  outputMode: 'canvas' | 'offscreen';
  /** Frame rate for capture (default: 30) */
  captureFPS: number;
}

export const DEFAULT_ANIMATED_PATHTRACER_CONFIG: AnimatedPathTracerConfig = {
  samplesPerFrame: 1,
  tiles: [1, 1],
  resetEachFrame: true,
  outputMode: 'canvas',
  captureFPS: 30,
};

/**
 * Hook for frame-by-frame path-traced rendering of animated scenes.
 * Resets accumulation per frame and accumulates configurable samples.
 */
export function useAnimatedPathTracer(
  pathTracerManager: any,
  config: Partial<AnimatedPathTracerConfig> = {},
) {
  const fullConfig = { ...DEFAULT_ANIMATED_PATHTRACER_CONFIG, ...config };
  const frameCountRef = useRef(0);
  const lastCaptureTimeRef = useRef(0);

  useFrame(({ gl, camera }) => {
    if (!pathTracerManager) return;

    const now = performance.now();
    const captureInterval = 1000 / fullConfig.captureFPS;

    // Throttle to target FPS
    if (now - lastCaptureTimeRef.current < captureInterval) return;
    lastCaptureTimeRef.current = now;

    // Reset accumulation for new frame
    if (fullConfig.resetEachFrame) {
      pathTracerManager.reset();
    }

    // Update camera position for this frame
    pathTracerManager.updateCamera();

    // Render samples
    for (let i = 0; i < fullConfig.samplesPerFrame; i++) {
      pathTracerManager.renderSample();
    }

    frameCountRef.current++;
  });

  return {
    frameCount: frameCountRef.current,
  };
}

// ---------------------------------------------------------------------------
// Camera Presets
// ---------------------------------------------------------------------------

export interface CameraPreset {
  name: string;
  description: string;
  config: Partial<PhysicalCameraConfig>;
}

export const CAMERA_PRESETS: Record<string, CameraPreset> = {
  landscape: {
    name: 'Landscape',
    description: 'Wide-angle landscape photography — deep DOF, everything in focus',
    config: { fStop: 11, focusDistance: 100, apertureBlades: 7, fov: 35 },
  },
  portrait: {
    name: 'Portrait',
    description: 'Shallow DOF portrait — subject in focus, bokeh background',
    config: { fStop: 1.8, focusDistance: 5, apertureBlades: 8, fov: 85 },
  },
  macro: {
    name: 'Macro',
    description: 'Extreme close-up with razor-thin DOF',
    config: { fStop: 2.8, focusDistance: 0.5, apertureBlades: 6, fov: 100 },
  },
  cinematic: {
    name: 'Cinematic',
    description: 'Film-like anamorphic look with oval bokeh',
    config: { fStop: 2.0, focusDistance: 15, apertureBlades: 0, anamorphicRatio: 2, fov: 40 },
  },
  product: {
    name: 'Product',
    description: 'Product photography — moderate DOF, clean background',
    config: { fStop: 5.6, focusDistance: 3, apertureBlades: 8, fov: 70 },
  },
  architectural: {
    name: 'Architectural',
    description: 'Tilt-shift look — deep DOF with controlled perspective',
    config: { fStop: 16, focusDistance: 30, apertureBlades: 6, fov: 28 },
  },
};

/**
 * Get a camera preset configuration by name.
 */
export function getCameraPreset(name: string): CameraPreset | undefined {
  return CAMERA_PRESETS[name];
}

/**
 * List all available camera presets.
 */
export function listCameraPresets(): CameraPreset[] {
  return Object.values(CAMERA_PRESETS);
}
