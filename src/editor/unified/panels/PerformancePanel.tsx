'use client';

import React from 'react';
import { Activity } from 'lucide-react';
import { useEditor } from '../EditorContext';

export default function PerformancePanel() {
  const { performanceMetrics } = useEditor();

  const metrics = [
    { label: 'FPS', value: performanceMetrics.fps, unit: '', color: performanceMetrics.fps >= 50 ? 'text-emerald-400' : performanceMetrics.fps >= 30 ? 'text-yellow-400' : 'text-red-400' },
    { label: 'Frame Time', value: performanceMetrics.frameTime, unit: 'ms', color: 'text-gray-300' },
    { label: 'Draw Calls', value: performanceMetrics.drawCalls, unit: '', color: 'text-gray-300' },
    { label: 'Triangles', value: performanceMetrics.triangles, unit: '', color: 'text-gray-300' },
    { label: 'Geometries', value: performanceMetrics.geometries, unit: '', color: 'text-gray-300' },
    { label: 'Textures', value: performanceMetrics.textures, unit: '', color: 'text-gray-300' },
    { label: 'Programs', value: performanceMetrics.programs, unit: '', color: 'text-gray-300' },
  ];

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Activity size={12} className="text-emerald-400" />
        <span className="text-xs font-semibold text-gray-300">Performance Metrics</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {metrics.map(m => (
          <div key={m.label} className="bg-gray-900 rounded border border-gray-700 p-2 text-center">
            <div className={`text-sm font-bold ${m.color}`}>
              {typeof m.value === 'number' ? (m.value > 9999 ? `${(m.value / 1000).toFixed(1)}k` : m.value) : m.value}
              {m.unit && <span className="text-[9px] text-gray-500 ml-0.5">{m.unit}</span>}
            </div>
            <div className="text-[9px] text-gray-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* FPS Graph */}
      <div>
        <h4 className="text-[10px] text-gray-500 mb-1">FPS History</h4>
        <div className="bg-gray-900 rounded border border-gray-700 p-2 h-16 flex items-end gap-px">
          {Array.from({ length: 30 }, (_, i) => {
            const fps = performanceMetrics.fps + (Math.sin(i * 0.5 + performanceMetrics.fps * 0.01) * 5);
            const height = Math.min(100, Math.max(5, (fps / 60) * 100));
            return (
              <div
                key={i}
                className={`flex-1 rounded-t ${fps >= 50 ? 'bg-emerald-500' : fps >= 30 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
