'use client';

import React, { Suspense, useRef, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sky, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useEditor } from '../EditorContext';

// ---- Terrain mesh (simplified for editor) ----
function EditorTerrain() {
  const { terrainParams, selectObject } = useEditor();

  const geometry = useMemo(() => {
    const size = 200;
    const segments = 64;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    // Simple procedural heightmap
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let h = 0;
      let amp = terrainParams.heightScale;
      let freq = terrainParams.scale / 100;
      for (let o = 0; o < terrainParams.octaves; o++) {
        h += amp * Math.sin(x * freq + terrainParams.seed) * Math.cos(z * freq + terrainParams.seed * 0.7);
        amp *= terrainParams.persistence;
        freq *= terrainParams.lacunarity;
      }
      pos.setY(i, h);
    }
    geo.computeVertexNormals();
    return geo;
  }, [terrainParams]);

  const handleClick = useCallback((e: any) => {
    e.stopPropagation();
    selectObject('terrain');
  }, [selectObject]);

  return (
    <mesh
      geometry={geometry}
      receiveShadow
      castShadow
      onClick={handleClick}
      userData={{ editorId: 'terrain' }}
    >
      <meshStandardMaterial
        color="#4a7a2e"
        roughness={0.9}
        metalness={0}
      />
    </mesh>
  );
}

// ---- Water plane ----
function EditorWater() {
  const { terrainParams, selectObject } = useEditor();
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.position.y = terrainParams.seaLevel * terrainParams.heightScale;
    }
  });

  const handleClick = useCallback((e: any) => {
    e.stopPropagation();
    selectObject('ocean');
  }, [selectObject]);

  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onClick={handleClick}
      userData={{ editorId: 'ocean' }}
    >
      <planeGeometry args={[500, 500]} />
      <meshPhysicalMaterial
        color="#1a4a7a"
        roughness={0.1}
        metalness={0.1}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

// ---- Simple box for selected object marker ----
function findObjInTree(objects: any[], id: string): any {
  for (const obj of objects) {
    if (obj.id === id) return obj;
    const found = findObjInTree(obj.children, id);
    if (found) return found;
  }
  return null;
}

function SelectionIndicator() {
  const { selectedObjectId, sceneObjects } = useEditor();

  const selected = selectedObjectId ? findObjInTree(sceneObjects, selectedObjectId) : null;

  if (!selected || selected.type === 'group') return null;

  return (
    <mesh position={selected.position}>
      <boxGeometry args={[2, 2, 2]} />
      <meshBasicMaterial color="#22c55e" wireframe transparent opacity={0.3} />
    </mesh>
  );
}

// ---- Lighting ----
function EditorLighting() {
  return (
    <>
      <ambientLight intensity={0.4} color="#b8d4e8" />
      <hemisphereLight args={['#87ceeb', '#3a5f0b', 0.35]} />
      <directionalLight
        position={[60, 100, 40]}
        intensity={1.8}
        color="#fffbe6"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
    </>
  );
}

// ---- Fog ----
function EditorFog() {
  const sceneRef = useRef<THREE.Fog | null>(null);
  useFrame(({ scene }) => {
    if (!sceneRef.current) {
      sceneRef.current = new THREE.Fog('#c8ddf0', 100, 350);
      scene.fog = sceneRef.current;
    }
  });
  return null;
}

// ---- Performance tracker ----
function PerformanceTracker() {
  const { updatePerformanceMetrics } = useEditor();
  const { gl } = useThree();
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useFrame(() => {
    frameCount.current++;
    const now = performance.now();
    if (now - lastTime.current >= 1000) {
      const fps = Math.round(frameCount.current * 1000 / (now - lastTime.current));
      const info = gl.info;
      updatePerformanceMetrics({
        fps,
        frameTime: Math.round(1000 / Math.max(fps, 1)),
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
      });
      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  return null;
}

// ---- Scene setup ----
function SceneContent() {
  const { setThreeScene } = useEditor();
  const { scene } = useThree();

  useEffect(() => {
    setThreeScene(scene);
    return () => setThreeScene(null);
  }, [scene, setThreeScene]);

  return (
    <>
      <EditorFog />
      <EditorLighting />
      <Suspense fallback={null}>
        <EditorTerrain />
      </Suspense>
      <EditorWater />
      <SelectionIndicator />
      <Sky
        distance={450000}
        sunPosition={[60, 100, 40]}
        inclination={0.52}
        azimuth={0.25}
        rayleigh={2}
        turbidity={8}
      />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={10}
        maxDistance={400}
        maxPolarAngle={Math.PI / 2 - 0.02}
        target={[0, 5, 0]}
      />
      <Grid
        args={[200, 40]}
        position={[0, 0.01, 0]}
        cellColor="#333"
        sectionColor="#555"
        fadeDistance={200}
        fadeStrength={1}
        infiniteGrid
      />
      <PerformanceTracker />
    </>
  );
}

// ---- Main Component ----
export default function Viewport3D() {
  return (
    <div className="w-full h-full bg-gray-950">
      <Canvas
        shadows
        camera={{ position: [80, 60, 80], fov: 50, near: 0.1, far: 1000 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#1a1a2e'));
        }}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
