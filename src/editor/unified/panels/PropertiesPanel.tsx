'use client';

import React, { useMemo } from 'react';
import { useEditor, type SceneObject } from '../EditorContext';

function findObject(objects: SceneObject[], id: string | null): SceneObject | null {
  if (!id) return null;
  for (const obj of objects) {
    if (obj.id === id) return obj;
    const found = findObject(obj.children, id);
    if (found) return found;
  }
  return null;
}

function Vec3Input({ label, value, onChange }: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
}) {
  const labels = ['X', 'Y', 'Z'];
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-500 w-16">{label}</span>
      {value.map((v, i) => (
        <div key={i} className="flex-1 flex items-center gap-0.5">
          <span className={`text-[9px] font-bold ${i === 0 ? 'text-red-400' : i === 1 ? 'text-green-400' : 'text-blue-400'}`}>
            {labels[i]}
          </span>
          <input
            type="number"
            step={0.1}
            value={v.toFixed(2)}
            onChange={(e) => {
              const newVal = [...value] as [number, number, number];
              newVal[i] = parseFloat(e.target.value) || 0;
              onChange(newVal);
            }}
            className="w-full bg-gray-800 text-gray-200 text-[10px] px-1 py-0.5 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      ))}
    </div>
  );
}

export default function PropertiesPanel() {
  const { sceneObjects, selectedObjectId, updateObjectTransform } = useEditor();

  const selectedObject = useMemo(
    () => findObject(sceneObjects, selectedObjectId),
    [sceneObjects, selectedObjectId]
  );

  if (!selectedObject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs p-4">
        <div className="text-2xl mb-2">🖱️</div>
        <p>Select an object in the scene tree to view its properties</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      {/* Object Info */}
      <div>
        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Object</h4>
        <div className="bg-gray-900 rounded border border-gray-700 p-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Name</span>
            <span className="text-xs text-gray-200">{selectedObject.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Type</span>
            <span className="text-xs text-gray-400">{selectedObject.type}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">ID</span>
            <span className="text-[10px] text-gray-500 font-mono">{selectedObject.id}</span>
          </div>
        </div>
      </div>

      {/* Transform */}
      <div>
        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Transform</h4>
        <div className="space-y-2">
          <Vec3Input
            label="Position"
            value={selectedObject.position}
            onChange={(v) => updateObjectTransform(selectedObject.id, 'position', v)}
          />
          <Vec3Input
            label="Rotation"
            value={selectedObject.rotation}
            onChange={(v) => updateObjectTransform(selectedObject.id, 'rotation', v)}
          />
          <Vec3Input
            label="Scale"
            value={selectedObject.scale}
            onChange={(v) => updateObjectTransform(selectedObject.id, 'scale', v)}
          />
        </div>
      </div>

      {/* Display */}
      <div>
        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Display</h4>
        <div className="bg-gray-900 rounded border border-gray-700 p-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Visible</span>
            <span className={`text-[10px] ${selectedObject.visible ? 'text-emerald-400' : 'text-red-400'}`}>
              {selectedObject.visible ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Locked</span>
            <span className={`text-[10px] ${selectedObject.locked ? 'text-yellow-400' : 'text-gray-400'}`}>
              {selectedObject.locked ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </div>

      {/* Material Reference */}
      {selectedObject.materialId && (
        <div>
          <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Material</h4>
          <div className="bg-gray-900 rounded border border-gray-700 p-2">
            <span className="text-xs text-gray-300">{selectedObject.materialId}</span>
          </div>
        </div>
      )}
    </div>
  );
}
