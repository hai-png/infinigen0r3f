'use client';

/**
 * Visual Node Graph Editor Page
 * Full-screen layout with:
 *  - Left: Node graph editor (React Flow)
 *  - Right: 3D viewport preview of evaluation results
 *
 * Connected via NodeEvalContext.
 */

import dynamic from 'next/dynamic';
import React from 'react';
import { NodeEvalProvider } from '../../editor/NodeEvalContext';

// Dynamic import to avoid SSR issues with React Flow
const NodeGraphEditorWithPreview = dynamic(
  () => import('../../editor/EditorLayout'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-gray-400">Loading Node Graph Editor...</p>
        </div>
      </div>
    ),
  },
);

export default function EditorPage() {
  return (
    <NodeEvalProvider>
      <NodeGraphEditorWithPreview />
    </NodeEvalProvider>
  );
}
