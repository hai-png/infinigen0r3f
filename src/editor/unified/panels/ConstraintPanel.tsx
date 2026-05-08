'use client';

import React, { useState } from 'react';
import { Shield, Plus, Trash2, Play } from 'lucide-react';
import { useEditor, type ConstraintEntry } from '../EditorContext';

export default function ConstraintPanel() {
  const {
    constraints, solverRunning, solverIteration, solverEnergy,
    addConstraint, removeConstraint, toggleConstraint, runSolver,
  } = useEditor();

  const [newName, setNewName] = useState('');
  const [newExpr, setNewExpr] = useState('');
  const [newWeight, setNewWeight] = useState(5);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addConstraint({
      name: newName.trim(),
      type: 'custom',
      expression: newExpr.trim() || 'true',
      weight: newWeight,
      active: true,
    });
    setNewName('');
    setNewExpr('');
  };

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2">
        <Shield size={12} className="text-emerald-400" />
        <span className="text-xs font-semibold text-gray-300">Constraints</span>
      </div>

      {/* Solver Controls */}
      <div className="bg-gray-900 rounded border border-gray-700 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-gray-400">Simulated Annealing Solver</span>
          <button
            onClick={runSolver}
            disabled={solverRunning}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white text-[10px] px-2 py-1 rounded transition-colors"
          >
            <Play size={10} />
            {solverRunning ? `Iter ${solverIteration}` : 'Solve'}
          </button>
        </div>
        {solverRunning && (
          <div>
            <div className="flex justify-between text-[9px] text-gray-500 mb-1">
              <span>Energy: {solverEnergy.toFixed(1)}</span>
              <span>Progress: {solverIteration}/20</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-1">
              <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${(solverIteration / 20) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Add Constraint */}
      <div className="bg-gray-900 rounded border border-gray-700 p-2 space-y-2">
        <input
          type="text"
          placeholder="Constraint name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full bg-gray-800 text-gray-200 text-[10px] px-2 py-1 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Expression (e.g. obj.x >= 0)"
          value={newExpr}
          onChange={(e) => setNewExpr(e.target.value)}
          className="w-full bg-gray-800 text-gray-200 text-[10px] px-2 py-1 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none font-mono"
        />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">Weight:</span>
          <input
            type="number" min={0} max={100}
            value={newWeight}
            onChange={(e) => setNewWeight(parseInt(e.target.value) || 1)}
            className="w-16 bg-gray-800 text-gray-200 text-[10px] px-2 py-0.5 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            className="flex-1 flex items-center justify-center gap-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-[10px] px-2 py-1 rounded transition-colors"
          >
            <Plus size={10} /> Add
          </button>
        </div>
      </div>

      {/* Constraint List */}
      <div className="space-y-1">
        {constraints.map(c => (
          <div
            key={c.id}
            className={`bg-gray-900 rounded border p-2 ${c.active ? 'border-gray-700' : 'border-gray-800 opacity-50'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <button
                onClick={() => toggleConstraint(c.id)}
                className="flex items-center gap-1.5"
              >
                <span className={`w-2 h-2 rounded-full ${c.active ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                <span className="text-xs text-gray-200">{c.name}</span>
              </button>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-500">w: {c.weight}</span>
                <button
                  onClick={() => removeConstraint(c.id)}
                  className="text-gray-500 hover:text-red-400 p-0.5"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
            <div className="text-[9px] text-gray-500 font-mono truncate">{c.expression}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
