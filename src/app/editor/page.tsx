'use client';
import dynamic from 'next/dynamic';
import { EditorProvider } from '../../editor/unified/EditorContext';

const UnifiedEditor = dynamic(
  () => import('../../editor/unified/InfinigenEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-gray-400">Loading Infinigen Editor...</p>
        </div>
      </div>
    ),
  },
);

export default function EditorPage() {
  return (
    <EditorProvider>
      <UnifiedEditor />
    </EditorProvider>
  );
}
