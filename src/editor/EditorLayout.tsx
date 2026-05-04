'use client';

/**
 * EditorLayout — Split-pane layout combining NodeGraphEditor + NodeEvalPreview
 *
 * Left side: NodeGraphEditor (React Flow canvas)
 * Right side: NodeEvalPreview (3D viewport)
 *
 * Connected via NodeEvalContext so evaluation results flow from
 * the editor into the 3D preview automatically.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NodeGraphEditor } from './NodeGraphEditor';
import { NodeEvalPreview } from './NodeEvalPreview';
import { useNodeEvalContext } from './NodeEvalContext';
import { useRouter } from 'next/navigation';

export default function EditorLayout() {
  const { setOnApplyToScene, setOnSceneViewRequested, processedResult } = useNodeEvalContext();
  const router = useRouter();
  const [showPreview, setShowPreview] = useState(true);

  // Wire up "Apply to Scene" callback
  useEffect(() => {
    setOnApplyToScene((result, targetObjects) => {
      // For now, just log it. A full implementation would traverse
      // the InfinigenScene and apply the material/geometry/texture.
      console.log(
        '[EditorLayout] Apply to scene:',
        result.raw.mode,
        targetObjects ?? '(all objects)',
      );
    });

    setOnSceneViewRequested(() => {
      // Navigate to the full scene page
      router.push('/scene');
    });
  }, [setOnApplyToScene, setOnSceneViewRequested, router]);

  // Toggle preview panel
  const togglePreview = useCallback(() => {
    setShowPreview((prev) => !prev);
  }, []);

  return (
    <div className="w-full h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Top toolbar with toggle */}
      <div className="h-10 flex items-center justify-between px-4 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-emerald-400">Infinigen Editor</h1>
          <span className="text-[10px] text-gray-500">Node Graph + 3D Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePreview}
            className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
              showPreview
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {showPreview ? 'Preview On' : 'Preview Off'}
          </button>
        </div>
      </div>

      {/* Main content: split layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Node Graph Editor */}
        <div className={`flex-1 min-w-0 ${showPreview ? '' : 'w-full'}`}>
          <NodeGraphEditor />
        </div>

        {/* Right: 3D Preview */}
        {showPreview && (
          <div className="w-96 flex-shrink-0 border-l border-gray-800">
            <NodeEvalPreview />
          </div>
        )}
      </div>
    </div>
  );
}
