'use client';

import React, { useMemo } from 'react';
import { useEditor } from '../EditorContext';

export default function ConstraintViz() {
  const { constraints, solverRunning, solverIteration, solverEnergy, runSolver } = useEditor();

  const activeConstraints = useMemo(() => constraints.filter(c => c.active), [constraints]);
  const inactiveConstraints = useMemo(() => constraints.filter(c => !c.active), [constraints]);

  return (
    <div className="w-full h-full bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Constraint Visualization</h3>
          <p className="text-xs text-gray-500 mt-0.5">{activeConstraints.length} active constraints</p>
        </div>
        <button
          onClick={runSolver}
          disabled={solverRunning}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white text-xs px-4 py-1.5 rounded transition-colors"
        >
          {solverRunning ? `Solving... (${solverIteration})` : '▶ Run Solver'}
        </button>
      </div>

      {/* Solver Progress */}
      {solverRunning && (
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Iteration: {solverIteration}/20</span>
            <span>Energy: {solverEnergy.toFixed(1)}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-200"
              style={{ width: `${(solverIteration / 20) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 2D Constraint Diagram */}
      <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
        {/* Constraint Diagram */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 relative min-h-[200px]">
          <svg width="100%" height="200" viewBox="0 0 400 200">
            {/* Grid lines */}
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 25} x2="400" y2={i * 25} stroke="#333" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 17 }, (_, i) => (
              <line key={`v${i}`} x1={i * 25} y1="0" x2={i * 25} y2="200" stroke="#333" strokeWidth="0.5" />
            ))}

            {/* Object circles */}
            <circle cx="100" cy="80" r="15" fill="#3b82f6" fillOpacity="0.3" stroke="#3b82f6" strokeWidth="1.5" />
            <text x="100" y="84" textAnchor="middle" fill="#93c5fd" fontSize="9">Obj A</text>

            <circle cx="250" cy="80" r="15" fill="#f97316" fillOpacity="0.3" stroke="#f97316" strokeWidth="1.5" />
            <text x="250" y="84" textAnchor="middle" fill="#fdba74" fontSize="9">Obj B</text>

            <circle cx="175" cy="150" r="15" fill="#22c55e" fillOpacity="0.3" stroke="#22c55e" strokeWidth="1.5" />
            <text x="175" y="154" textAnchor="middle" fill="#86efac" fontSize="9">Obj C</text>

            {/* Constraint lines */}
            {activeConstraints.map((c, i) => {
              const y1 = 80;
              const y2 = i === 0 ? 80 : i === 1 ? 150 : 80;
              const x1 = i === 2 ? 100 : i === 0 ? 100 : 250;
              const x2 = i === 2 ? 250 : i === 0 ? 250 : 175;
              return (
                <g key={c.id}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.active ? '#22c55e' : '#666'} strokeWidth="1" strokeDasharray={c.active ? '' : '4 4'} />
                  <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle" fill={c.active ? '#86efac' : '#666'} fontSize="8">
                    {c.name.slice(0, 12)}
                  </text>
                </g>
              );
            })}

            {/* Ground plane */}
            <line x1="20" y1="180" x2="380" y2="180" stroke="#666" strokeWidth="1.5" />
            <text x="200" y="195" textAnchor="middle" fill="#666" fontSize="8">Ground Plane</text>
          </svg>
        </div>

        {/* Constraint List */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Active Constraints</h4>
          {activeConstraints.map(c => (
            <div key={c.id} className="bg-gray-900 rounded border border-gray-700 p-2 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-gray-200">{c.name}</div>
                <div className="text-[10px] text-gray-500 font-mono">{c.expression}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">w: {c.weight}</span>
                <span className="text-[10px] text-emerald-400">●</span>
              </div>
            </div>
          ))}

          {inactiveConstraints.length > 0 && (
            <>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-3">Inactive</h4>
              {inactiveConstraints.map(c => (
                <div key={c.id} className="bg-gray-900/50 rounded border border-gray-800 p-2 flex items-center justify-between opacity-60">
                  <div>
                    <div className="text-xs font-medium text-gray-400">{c.name}</div>
                    <div className="text-[10px] text-gray-600 font-mono">{c.expression}</div>
                  </div>
                  <span className="text-[10px] text-gray-600">○</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
