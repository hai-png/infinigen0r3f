import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', 'simplex-noise'],
};

export default nextConfig;
