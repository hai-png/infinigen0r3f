'use client';

import dynamic from 'next/dynamic';

/**
 * Scene Page — Full-screen 3D procedural world viewer.
 *
 * Uses next/dynamic with ssr: false because:
 *  - R3F Canvas requires browser APIs (WebGL, window, document)
 *  - TerrainGenerator & OceanSurface use Three.js constructors
 *  - Sky component accesses window dimensions
 */
const InfinigenScene = dynamic(
  () => import('@/components/InfinigenScene'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg font-medium">Loading 3D Engine...</p>
          <p className="text-gray-500 text-sm mt-2">Initializing WebGL context</p>
        </div>
      </div>
    ),
  }
);

export default function ScenePage() {
  return <InfinigenScene />;
}
