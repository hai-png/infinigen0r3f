'use client';

import React, { useState } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { useEditor, type CameraRig } from '../EditorContext';

export default function CameraPanel() {
  const { cameraRigs, activeCameraId, addCameraRig, removeCameraRig, setActiveCamera } = useEditor();
  const [selectedId, setSelectedId] = useState<string | null>(activeCameraId);

  const selected = cameraRigs.find(r => r.id === selectedId);

  const typeIcons: Record<string, string> = {
    orbit: '🔄', dolly: '🎬', crane: '🏗️', handheld: '🙋',
  };

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2">
        <Camera size={12} className="text-emerald-400" />
        <span className="text-xs font-semibold text-gray-300">Camera Rigs</span>
      </div>

      {/* Camera list */}
      <div className="space-y-1">
        {cameraRigs.map(rig => (
          <div
            key={rig.id}
            onClick={() => { setSelectedId(rig.id); setActiveCamera(rig.id); }}
            className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border cursor-pointer transition-colors ${
              activeCameraId === rig.id
                ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300'
                : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span className="text-sm">{typeIcons[rig.type] ?? '📷'}</span>
            <div className="flex-1 min-w-0">
              <div className="truncate">{rig.name}</div>
              <div className="text-[9px] text-gray-500">{rig.type} • FOV {rig.fov}°</div>
            </div>
            {activeCameraId === rig.id && <span className="text-[8px] text-emerald-400 bg-emerald-900/50 px-1 rounded">ACTIVE</span>}
            <button
              onClick={(e) => { e.stopPropagation(); removeCameraRig(rig.id); if (selectedId === rig.id) setSelectedId(null); }}
              className="text-gray-500 hover:text-red-400 p-0.5"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* Add camera */}
      <button
        onClick={() => {
          const id = `cam_${Date.now()}`;
          addCameraRig({
            name: `Camera ${cameraRigs.length + 1}`,
            type: 'orbit',
            position: [50, 30, 50],
            target: [0, 5, 0],
            fov: 50,
          });
          setSelectedId(id);
        }}
        className="w-full flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[10px] px-2 py-1.5 rounded border border-gray-700 transition-colors"
      >
        <Plus size={10} /> Add Camera
      </button>

      {/* Selected camera details */}
      {selected && (
        <div className="bg-gray-900 rounded border border-gray-700 p-3 space-y-3">
          <h4 className="text-xs font-semibold text-emerald-400">{selected.name}</h4>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-gray-500">Pos X</label>
              <input type="number" value={selected.position[0]}
                className="w-full bg-gray-800 text-gray-200 text-[10px] px-1 py-0.5 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none" readOnly />
            </div>
            <div>
              <label className="text-[9px] text-gray-500">Pos Y</label>
              <input type="number" value={selected.position[1]}
                className="w-full bg-gray-800 text-gray-200 text-[10px] px-1 py-0.5 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none" readOnly />
            </div>
            <div>
              <label className="text-[9px] text-gray-500">Pos Z</label>
              <input type="number" value={selected.position[2]}
                className="w-full bg-gray-800 text-gray-200 text-[10px] px-1 py-0.5 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none" readOnly />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-gray-500">Target X</label>
              <input type="number" value={selected.target[0]}
                className="w-full bg-gray-800 text-gray-200 text-[10px] px-1 py-0.5 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none" readOnly />
            </div>
            <div>
              <label className="text-[9px] text-gray-500">Target Y</label>
              <input type="number" value={selected.target[1]}
                className="w-full bg-gray-800 text-gray-200 text-[10px] px-1 py-0.5 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none" readOnly />
            </div>
            <div>
              <label className="text-[9px] text-gray-500">Target Z</label>
              <input type="number" value={selected.target[2]}
                className="w-full bg-gray-800 text-gray-200 text-[10px] px-1 py-0.5 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none" readOnly />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500">FOV</label>
              <span className="text-[10px] text-gray-400">{selected.fov}°</span>
            </div>
            <input type="range" min={10} max={120} step={1} value={selected.fov}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" readOnly />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Type:</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-900/30 px-1.5 py-0.5 rounded">{selected.type}</span>
          </div>
        </div>
      )}
    </div>
  );
}
