'use client';

import React, { useState } from 'react';
import { Sparkles, Plus, Trash2 } from 'lucide-react';
import { useEditor, type ParticleSystemConfig } from '../EditorContext';

export default function ParticlePanel() {
  const { particleSystems, addParticleSystem, removeParticleSystem, updateParticleSystem } = useEditor();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = particleSystems.find(s => s.id === selectedId);

  const handleAdd = () => {
    const id = `ps_${Date.now()}`;
    addParticleSystem({
      name: `Particle System ${particleSystems.length + 1}`,
      count: 100,
      speed: 1,
      size: 0.1,
      lifetime: 5,
      color: [0.5, 0.8, 1],
      emissionRate: 10,
    });
    setSelectedId(id);
  };

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-emerald-400" />
          <span className="text-xs font-semibold text-gray-300">Particles</span>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-[10px] px-2 py-1 rounded transition-colors"
        >
          <Plus size={10} /> Add System
        </button>
      </div>

      {/* System list */}
      {particleSystems.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-xs">
          <Sparkles size={24} className="mx-auto mb-2 opacity-30" />
          <p>No particle systems</p>
          <p className="text-[10px] mt-1">Click "Add System" to create one</p>
        </div>
      ) : (
        <div className="space-y-1">
          {particleSystems.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-left text-xs px-2 py-1.5 rounded border transition-colors ${selectedId === s.id ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300' : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Selected system editor */}
      {selected && (
        <div className="bg-gray-900 rounded border border-gray-700 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-200">{selected.name}</span>
            <button onClick={() => { removeParticleSystem(selected.id); setSelectedId(null); }} className="text-gray-500 hover:text-red-400">
              <Trash2 size={12} />
            </button>
          </div>

          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Count</label>
            <input
              type="number" min={1} max={10000}
              value={selected.count}
              onChange={(e) => updateParticleSystem(selected.id, { count: parseInt(e.target.value) || 1 })}
              className="w-full bg-gray-800 text-gray-200 text-[10px] px-2 py-1 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500">Speed</label>
              <span className="text-[10px] text-gray-400">{selected.speed.toFixed(1)}</span>
            </div>
            <input type="range" min={0} max={10} step={0.1} value={selected.speed}
              onChange={(e) => updateParticleSystem(selected.id, { speed: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500">Size</label>
              <span className="text-[10px] text-gray-400">{selected.size.toFixed(2)}</span>
            </div>
            <input type="range" min={0.01} max={2} step={0.01} value={selected.size}
              onChange={(e) => updateParticleSystem(selected.id, { size: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500">Lifetime</label>
              <span className="text-[10px] text-gray-400">{selected.lifetime.toFixed(1)}s</span>
            </div>
            <input type="range" min={0.1} max={30} step={0.1} value={selected.lifetime}
              onChange={(e) => updateParticleSystem(selected.id, { lifetime: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Color</label>
            <input
              type="color"
              value={`#${selected.color.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`}
              onChange={(e) => {
                const hex = e.target.value;
                updateParticleSystem(selected.id, {
                  color: [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255],
                });
              }}
              className="w-8 h-6 bg-transparent border border-gray-600 rounded cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500">Emission Rate</label>
              <span className="text-[10px] text-gray-400">{selected.emissionRate}/s</span>
            </div>
            <input type="range" min={1} max={100} step={1} value={selected.emissionRate}
              onChange={(e) => updateParticleSystem(selected.id, { emissionRate: parseInt(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
