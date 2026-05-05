'use client';

import React from 'react';
import { Clock, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useEditor } from '../EditorContext';

export default function TimelinePanel() {
  const { playbackTime, isPlaying, totalDuration, setPlaybackTime, togglePlayback, keyframes } = useEditor();

  const fps = 24;
  const currentFrame = Math.round(playbackTime * fps);
  const totalFrames = totalDuration * fps;

  return (
    <div className="flex items-center gap-3 px-4 py-2 h-full">
      {/* Transport controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPlaybackTime(0)}
          className="text-gray-400 hover:text-gray-200 p-1"
        >
          <SkipBack size={14} />
        </button>
        <button
          onClick={togglePlayback}
          className="bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded transition-colors"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={() => setPlaybackTime(totalDuration)}
          className="text-gray-400 hover:text-gray-200 p-1"
        >
          <SkipForward size={14} />
        </button>
      </div>

      {/* Time display */}
      <div className="text-xs text-gray-400 font-mono min-w-[80px]">
        {formatTime(playbackTime)} / {formatTime(totalDuration)}
      </div>

      {/* Frame display */}
      <div className="text-[10px] text-gray-500 font-mono min-w-[60px]">
        F{currentFrame}/{totalFrames}
      </div>

      {/* Timeline scrubber */}
      <div className="flex-1 relative h-6 bg-gray-800 rounded border border-gray-700 overflow-hidden">
        {/* Frame markers */}
        {Array.from({ length: totalDuration + 1 }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 h-full"
            style={{ left: `${(i / totalDuration) * 100}%` }}
          >
            <div className="w-px h-full bg-gray-600" />
          </div>
        ))}

        {/* Keyframe diamonds */}
        {keyframes.map(kf => (
          <div
            key={kf.id}
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-yellow-400 rotate-45 z-10"
            style={{ left: `${(kf.time / totalDuration) * 100}%` }}
            title={`${kf.property} = ${kf.value}`}
          />
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-emerald-400 z-20"
          style={{ left: `${(playbackTime / totalDuration) * 100}%` }}
        />

        {/* Click to seek */}
        <input
          type="range"
          min={0}
          max={totalDuration}
          step={0.01}
          value={playbackTime}
          onChange={(e) => setPlaybackTime(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
