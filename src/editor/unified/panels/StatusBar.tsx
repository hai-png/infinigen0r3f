'use client';

import React, { useMemo } from 'react';
import { useEditor, type LogEntry } from '../EditorContext';

export default function StatusBar() {
  const { log, performanceMetrics, evaluationResult, selectedObjectId, sceneObjects, rfNodes } = useEditor();

  const lastLog = useMemo(() => log[log.length - 1], [log]);

  const levelColors: Record<LogEntry['level'], string> = {
    info: 'text-gray-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    success: 'text-emerald-400',
  };

  const totalObjects = useMemo(() => {
    let count = 0;
    function countAll(objs: typeof sceneObjects) {
      for (const o of objs) {
        count++;
        countAll(o.children);
      }
    }
    countAll(sceneObjects);
    return count;
  }, [sceneObjects]);

  return (
    <div className="flex items-center gap-4 px-4 py-1 h-full text-[10px]">
      {/* FPS indicator */}
      <div className="flex items-center gap-1">
        <div className={`w-1.5 h-1.5 rounded-full ${performanceMetrics.fps >= 50 ? 'bg-emerald-400' : performanceMetrics.fps >= 30 ? 'bg-yellow-400' : 'bg-red-400'}`} />
        <span className="text-gray-400">{performanceMetrics.fps} FPS</span>
      </div>

      <div className="w-px h-3 bg-gray-700" />

      {/* Scene stats */}
      <span className="text-gray-500">{totalObjects} objects</span>
      <span className="text-gray-500">{rfNodes.length} nodes</span>

      <div className="w-px h-3 bg-gray-700" />

      {/* Selected */}
      {selectedObjectId && (
        <>
          <span className="text-emerald-400">▸ {selectedObjectId}</span>
          <div className="w-px h-3 bg-gray-700" />
        </>
      )}

      {/* Eval status */}
      {evaluationResult && (
        <>
          <span className={evaluationResult.errors.length > 0 ? 'text-red-400' : 'text-emerald-400'}>
            {evaluationResult.errors.length > 0 ? '✗ Eval Error' : '✓ Eval OK'}
          </span>
          <div className="w-px h-3 bg-gray-700" />
        </>
      )}

      {/* Last log message */}
      {lastLog && (
        <span className={`flex-1 truncate ${levelColors[lastLog.level]}`}>
          {lastLog.message}
        </span>
      )}

      {/* Draw calls */}
      <span className="text-gray-500">{performanceMetrics.drawCalls} draws</span>
    </div>
  );
}
