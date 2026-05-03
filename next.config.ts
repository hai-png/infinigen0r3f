import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  transpilePackages: [
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    'simplex-noise',
    'three-gpu-pathtracer',
    'three-bvh-csg',
    'three-mesh-bvh',
    '@react-three/gpu-pathtracer',
  ],
};

export default nextConfig;
