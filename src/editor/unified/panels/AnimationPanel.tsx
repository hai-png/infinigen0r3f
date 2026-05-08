'use client';

import React from 'react';
import { Film, Play, Pause, Plus, Trash2 } from 'lucide-react';
import { useEditor } from '../EditorContext';

export default function AnimationPanel() {
  const { keyframes, playbackTime, isPlaying, totalDuration, addKeyframe, removeKeyframe, setPlaybackTime, togglePlayback, selectedObjectId } = useEditor();

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2">
        <Film size={12} className="text-emerald-400" />
        <span className="text-xs font-semibold text-gray-300">Animation</span>
      </div>

      {/* Playback controls */}
      <div className="bg-gray-900 rounded border border-gray-700 p-2">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={togglePlayback}
            className="bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded transition-colors"
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <div className="flex-1">
            <input
              type="range" min={0} max={totalDuration} step={0.01}
              value={playbackTime}
              onChange={(e) => setPlaybackTime(parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
          <span className="text-[10px] text-gray-400 font-mono w-16 text-right">
            {playbackTime.toFixed(2)}s / {totalDuration}s
          </span>
        </div>
      </div>

      {/* Add keyframe */}
      <div>
        <button
          onClick={() => {
            if (selectedObjectId) {
              addKeyframe({
                time: playbackTime,
                objectId: selectedObjectId,
                property: 'position.y',
                value: 0,
              });
            }
          }}
          disabled={!selectedObjectId}
          className="w-full flex items-center justify-center gap-1 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 text-gray-200 text-[10px] px-2 py-1.5 rounded border border-gray-700 transition-colors"
        >
          <Plus size={10} /> Add Keyframe at {playbackTime.toFixed(2)}s
        </button>
      </div>

      {/* Keyframe list */}
      <div>
        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Keyframes</h4>
        {keyframes.length === 0 ? (
          <p className="text-[10px] text-gray-500 text-center py-4">No keyframes yet</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {keyframes.sort((a, b) => a.time - b.time).map(kf => (
              <div key={kf.id} className="bg-gray-900 rounded border border-gray-700 p-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <div>
                    <div className="text-[10px] text-gray-300">{kf.objectId} → {kf.property}</div>
                    <div className="text-[9px] text-gray-500">t={kf.time.toFixed(2)}s val={kf.value.toFixed(2)}</div>
                  </div>
                </div>
                <button onClick={() => removeKeyframe(kf.id)} className="text-gray-500 hover:text-red-400">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline visualization */}
      <div>
        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Timeline</h4>
        <div className="bg-gray-900 rounded border border-gray-700 p-2 h-12 relative">
          {/* Time markers */}
          {Array.from({ length: totalDuration + 1 }, (_, i) => (
            <div key={i} className="absolute top-0 h-full" style={{ left: `${(i / totalDuration) * 100}%` }}>
              <div className="w-px h-full bg-gray-700" />
              <span className="absolute -bottom-3 left-0 text-[8px] text-gray-600 -translate-x-1/2">{i}s</span>
            </div>
          ))}
          {/* Playhead */}
          <div className="absolute top-0 h-full w-0.5 bg-emerald-400 z-10" style={{ left: `${(playbackTime / totalDuration) * 100}%` }} />
          {/* Keyframe markers */}
          {keyframes.map(kf => (
            <div
              key={kf.id}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-yellow-400 rotate-45 z-5"
              style={{ left: `${(kf.time / totalDuration) * 100}%` }}
              title={`${kf.objectId} → ${kf.property} = ${kf.value}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
