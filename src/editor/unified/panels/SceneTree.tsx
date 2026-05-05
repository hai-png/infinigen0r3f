'use client';

import React, { useCallback } from 'react';
import { ChevronRight, ChevronDown, Eye, EyeOff, Lock, Unlock, MousePointer2 } from 'lucide-react';
import { useEditor, type SceneObject } from '../EditorContext';

function TreeNode({ obj, depth = 0 }: { obj: SceneObject; depth?: number }) {
  const { selectedObjectId, selectObject, toggleObjectVisibility, toggleObjectLock } = useEditor();
  const [expanded, setExpanded] = React.useState(true);
  const hasChildren = obj.children.length > 0;
  const isSelected = obj.id === selectedObjectId;

  const typeIcon: Record<string, string> = {
    mesh: '▣', light: '☀', camera: '📷', group: '📁',
    terrain: '⛰', ocean: '🌊', vegetation: '🌿', creature: '🦌',
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer hover:bg-gray-800 transition-colors text-xs ${isSelected ? 'bg-emerald-900/40 text-emerald-300' : 'text-gray-300'}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => selectObject(obj.id)}
      >
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="text-gray-500 hover:text-gray-300">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <span className="text-[10px] text-gray-500">{typeIcon[obj.type] ?? '○'}</span>
        <span className="flex-1 truncate">{obj.name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); toggleObjectVisibility(obj.id); }}
          className="text-gray-500 hover:text-gray-300 p-0.5"
        >
          {obj.visible ? <Eye size={10} /> : <EyeOff size={10} className="text-red-400" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleObjectLock(obj.id); }}
          className="text-gray-500 hover:text-gray-300 p-0.5"
        >
          {obj.locked ? <Lock size={10} className="text-yellow-400" /> : <Unlock size={10} />}
        </button>
      </div>
      {expanded && hasChildren && obj.children.map(child => (
        <TreeNode key={child.id} obj={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function SceneTree() {
  const { sceneObjects } = useEditor();

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center gap-2">
        <MousePointer2 size={12} className="text-emerald-400" />
        <span className="text-xs font-semibold text-gray-300">Scene Tree</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {sceneObjects.map(obj => (
          <TreeNode key={obj.id} obj={obj} />
        ))}
      </div>
    </div>
  );
}
