'use client';

import React from 'react';
import { Palette } from 'lucide-react';
import { useEditor } from '../EditorContext';

export default function MaterialEditor() {
  const { currentMaterial, setCurrentMaterial, materialPresets, applyMaterialToSelection, selectedObjectId } = useEditor();

  return (
    <div className="p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette size={12} className="text-emerald-400" />
          <span className="text-xs font-semibold text-gray-300">PBR Material</span>
        </div>
        <button
          onClick={applyMaterialToSelection}
          disabled={!selectedObjectId}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-[10px] px-3 py-1 rounded transition-colors"
        >
          Apply to Selected
        </button>
      </div>

      {/* Preview sphere */}
      <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 flex items-center justify-center">
        <div
          className="w-20 h-20 rounded-full shadow-lg"
          style={{
            background: `radial-gradient(circle at 35% 35%, 
              rgba(${Math.min(255, currentMaterial.baseColor[0] * 255 + 80)}, ${Math.min(255, currentMaterial.baseColor[1] * 255 + 80)}, ${Math.min(255, currentMaterial.baseColor[2] * 255 + 80)}, 1) 0%,
              rgb(${currentMaterial.baseColor[0] * 255}, ${currentMaterial.baseColor[1] * 255}, ${currentMaterial.baseColor[2] * 255}) 50%,
              rgba(${Math.max(0, currentMaterial.baseColor[0] * 255 - 40)}, ${Math.max(0, currentMaterial.baseColor[1] * 255 - 40)}, ${Math.max(0, currentMaterial.baseColor[2] * 255 - 40)}, 1) 100%
            )`,
            boxShadow: currentMaterial.metallic > 0.5
              ? `0 0 20px rgba(${currentMaterial.baseColor[0] * 255}, ${currentMaterial.baseColor[1] * 255}, ${currentMaterial.baseColor[2] * 255}, 0.4)`
              : 'none',
          }}
        />
      </div>

      {/* Base Color */}
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">Base Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={`#${currentMaterial.baseColor.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`}
            onChange={(e) => {
              const hex = e.target.value;
              setCurrentMaterial({
                baseColor: [
                  parseInt(hex.slice(1, 3), 16) / 255,
                  parseInt(hex.slice(3, 5), 16) / 255,
                  parseInt(hex.slice(5, 7), 16) / 255,
                ] as [number, number, number],
              });
            }}
            className="w-8 h-6 bg-transparent border border-gray-600 rounded cursor-pointer"
          />
          <span className="text-[10px] text-gray-400 font-mono">
            {currentMaterial.baseColor.map(c => c.toFixed(2)).join(', ')}
          </span>
        </div>
      </div>

      {/* Metallic */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500">Metallic</label>
          <span className="text-[10px] text-gray-400">{currentMaterial.metallic.toFixed(2)}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          value={currentMaterial.metallic}
          onChange={(e) => setCurrentMaterial({ metallic: parseFloat(e.target.value) })}
          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
      </div>

      {/* Roughness */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500">Roughness</label>
          <span className="text-[10px] text-gray-400">{currentMaterial.roughness.toFixed(2)}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          value={currentMaterial.roughness}
          onChange={(e) => setCurrentMaterial({ roughness: parseFloat(e.target.value) })}
          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
      </div>

      {/* Emissive */}
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">Emissive Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={`#${currentMaterial.emissive.map(c => Math.round(Math.min(1, c) * 255).toString(16).padStart(2, '0')).join('')}`}
            onChange={(e) => {
              const hex = e.target.value;
              setCurrentMaterial({
                emissive: [
                  parseInt(hex.slice(1, 3), 16) / 255,
                  parseInt(hex.slice(3, 5), 16) / 255,
                  parseInt(hex.slice(5, 7), 16) / 255,
                ] as [number, number, number],
              });
            }}
            className="w-8 h-6 bg-transparent border border-gray-600 rounded cursor-pointer"
          />
          <input
            type="range" min="0" max="5" step="0.1"
            value={currentMaterial.emissiveIntensity}
            onChange={(e) => setCurrentMaterial({ emissiveIntensity: parseFloat(e.target.value) })}
            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>
      </div>

      {/* Opacity */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500">Opacity</label>
          <span className="text-[10px] text-gray-400">{currentMaterial.opacity.toFixed(2)}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          value={currentMaterial.opacity}
          onChange={(e) => setCurrentMaterial({ opacity: parseFloat(e.target.value) })}
          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
      </div>

      {/* Normal Strength */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500">Normal Strength</label>
          <span className="text-[10px] text-gray-400">{currentMaterial.normalStrength.toFixed(2)}</span>
        </div>
        <input
          type="range" min="0" max="2" step="0.01"
          value={currentMaterial.normalStrength}
          onChange={(e) => setCurrentMaterial({ normalStrength: parseFloat(e.target.value) })}
          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
      </div>

      {/* AO Strength */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500">AO Strength</label>
          <span className="text-[10px] text-gray-400">{currentMaterial.aoStrength.toFixed(2)}</span>
        </div>
        <input
          type="range" min="0" max="2" step="0.01"
          value={currentMaterial.aoStrength}
          onChange={(e) => setCurrentMaterial({ aoStrength: parseFloat(e.target.value) })}
          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
      </div>

      {/* Presets */}
      <div>
        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Presets</h4>
        <div className="grid grid-cols-2 gap-1">
          {materialPresets.map(preset => (
            <button
              key={preset.id}
              onClick={() => setCurrentMaterial({
                baseColor: preset.baseColor,
                metallic: preset.metallic,
                roughness: preset.roughness,
                emissive: preset.emissive,
                emissiveIntensity: preset.emissiveIntensity,
                opacity: preset.opacity,
                normalStrength: preset.normalStrength,
                aoStrength: preset.aoStrength,
                name: preset.name,
              })}
              className="flex items-center gap-1.5 text-left text-[10px] text-gray-300 hover:bg-gray-800 px-2 py-1 rounded border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <div
                className="w-3 h-3 rounded-full border border-gray-600"
                style={{ backgroundColor: `rgb(${preset.baseColor[0] * 255}, ${preset.baseColor[1] * 255}, ${preset.baseColor[2] * 255})` }}
              />
              {preset.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
