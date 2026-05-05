'use client';

import React from 'react';
import { Mountain } from 'lucide-react';
import { useEditor, type TerrainParams } from '../EditorContext';

function SliderField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] text-gray-500">{label}</label>
        <span className="text-[10px] text-gray-400 font-mono">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
    </div>
  );
}

function generateTerrainPath(params: TerrainParams): string {
  const { seed, scale, octaves, persistence, heightScale } = params;
  const points: string[] = ['M0,80'];
  const w = 240;

  for (let x = 0; x <= w; x += 2) {
    let h = 0;
    let amp = (heightScale / 100) * 0.5;
    let freq = (scale / 100) * 3;
    for (let o = 0; o < octaves; o++) {
      h += amp * Math.sin(x * freq / w * Math.PI * 2 + seed + o * 1.3);
      amp *= persistence;
      freq *= 2;
    }
    const y = 80 - (h * 0.5 + 0.5) * 60 - 10;
    points.push(`L${x},${y}`);
  }
  points.push(`L${w},80 Z`);
  return points.join(' ');
}

export default function TerrainEditor() {
  const { terrainParams, setTerrainParams } = useEditor();

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2">
        <Mountain size={12} className="text-emerald-400" />
        <span className="text-xs font-semibold text-gray-300">Terrain Parameters</span>
      </div>

      <SliderField label="Seed" value={terrainParams.seed} min={0} max={999} step={1} onChange={(v) => setTerrainParams({ seed: v })} />
      <SliderField label="Scale" value={terrainParams.scale} min={10} max={200} step={1} onChange={(v) => setTerrainParams({ scale: v })} />
      <SliderField label="Octaves" value={terrainParams.octaves} min={1} max={12} step={1} onChange={(v) => setTerrainParams({ octaves: v })} />
      <SliderField label="Persistence" value={terrainParams.persistence} min={0.1} max={1} step={0.01} onChange={(v) => setTerrainParams({ persistence: v })} />
      <SliderField label="Lacunarity" value={terrainParams.lacunarity} min={1} max={4} step={0.1} onChange={(v) => setTerrainParams({ lacunarity: v })} />
      <SliderField label="Erosion" value={terrainParams.erosionStrength} min={0} max={1} step={0.01} onChange={(v) => setTerrainParams({ erosionStrength: v })} />
      <SliderField label="Sea Level" value={terrainParams.seaLevel} min={0} max={0.8} step={0.01} onChange={(v) => setTerrainParams({ seaLevel: v })} />
      <SliderField label="Height Scale" value={terrainParams.heightScale} min={5} max={100} step={1} onChange={(v) => setTerrainParams({ heightScale: v })} />

      {/* Terrain preview */}
      <div>
        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Preview</h4>
        <div className="bg-gray-900 rounded-lg border border-gray-700 p-2">
          <svg width="100%" height="80" viewBox="0 0 240 80">
            <defs>
              <linearGradient id="terrainGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#1a4a7a" />
                <stop offset="30%" stopColor="#76b84e" />
                <stop offset="60%" stopColor="#4a7a2e" />
                <stop offset="80%" stopColor="#7a6a52" />
                <stop offset="100%" stopColor="#e0e8f0" />
              </linearGradient>
            </defs>
            <path
              d={generateTerrainPath(terrainParams)}
              fill="url(#terrainGrad)"
              stroke="#4a7a2e"
              strokeWidth="1"
            />
            <line
              x1="0"
              y1={80 - terrainParams.seaLevel * 80}
              x2="240"
              y2={80 - terrainParams.seaLevel * 80}
              stroke="#3b82f6"
              strokeWidth="1"
              strokeDasharray="4 2"
            />
          </svg>
        </div>
      </div>

      {/* Quick presets */}
      <div>
        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Presets</h4>
        <div className="grid grid-cols-2 gap-1">
          {[
            { name: 'Flat Plains', params: { seed: 42, scale: 30, octaves: 2, persistence: 0.3, lacunarity: 2, erosionStrength: 0.1, seaLevel: 0.1, heightScale: 10 } },
            { name: 'Rolling Hills', params: { seed: 42, scale: 60, octaves: 4, persistence: 0.5, lacunarity: 2, erosionStrength: 0.3, seaLevel: 0.25, heightScale: 30 } },
            { name: 'Mountains', params: { seed: 42, scale: 80, octaves: 8, persistence: 0.6, lacunarity: 2.5, erosionStrength: 0.5, seaLevel: 0.3, heightScale: 60 } },
            { name: 'Islands', params: { seed: 42, scale: 50, octaves: 6, persistence: 0.5, lacunarity: 2, erosionStrength: 0.4, seaLevel: 0.5, heightScale: 40 } },
          ].map(preset => (
            <button
              key={preset.name}
              onClick={() => setTerrainParams(preset.params)}
              className="text-[10px] text-gray-300 hover:bg-gray-800 px-2 py-1.5 rounded border border-gray-700 hover:border-gray-600 transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
