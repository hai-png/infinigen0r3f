'use client';

import React, { Suspense } from 'react';
import {
  Box, GitBranch, ShieldCheck, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, PanelBottomClose, PanelBottomOpen,
  TreePine, FolderSearch, Wrench, Palette, Mountain, Shield, Film,
  Sparkles, Camera, Activity, Clock, Info,
} from 'lucide-react';
import { EditorProvider, useEditor, type CenterViewMode, type LeftTab, type RightTab, type BottomTab } from './EditorContext';

// ---- Lazy loaded components ----
import Viewport3D from './viewport/Viewport3D';
import NodeGraphView from './viewport/NodeGraphView';
import ConstraintViz from './viewport/ConstraintViz';
import SceneTree from './panels/SceneTree';
import AssetBrowser from './panels/AssetBrowser';
import PropertiesPanel from './panels/PropertiesPanel';
import MaterialEditor from './panels/MaterialEditor';
import TerrainEditor from './panels/TerrainEditor';
import ConstraintPanel from './panels/ConstraintPanel';
import AnimationPanel from './panels/AnimationPanel';
import ParticlePanel from './panels/ParticlePanel';
import CameraPanel from './panels/CameraPanel';
import PerformancePanel from './panels/PerformancePanel';
import TimelinePanel from './panels/TimelinePanel';
import StatusBar from './panels/StatusBar';

// ============================================================================
// Top Toolbar
// ============================================================================

function TopToolbar() {
  const { centerView, setCenterView, toggleLeftPanel, toggleRightPanel, toggleBottomPanel,
    leftPanelOpen, rightPanelOpen, bottomPanelOpen, addLog } = useEditor();

  const viewModes: { id: CenterViewMode; icon: React.ReactNode; label: string }[] = [
    { id: 'viewport3d', icon: <Box size={14} />, label: '3D Viewport' },
    { id: 'nodeGraph', icon: <GitBranch size={14} />, label: 'Node Graph' },
    { id: 'constraintViz', icon: <ShieldCheck size={14} />, label: 'Constraints' },
  ];

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center text-white text-xs font-bold">
          ∞
        </div>
        <span className="text-xs font-semibold text-gray-200 hidden sm:inline">Infinigen Editor</span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-gray-700" />

      {/* View mode tabs */}
      <div className="flex items-center bg-gray-800 rounded-md p-0.5 gap-0.5">
        {viewModes.map(mode => (
          <button
            key={mode.id}
            onClick={() => setCenterView(mode.id)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded transition-colors ${
              centerView === mode.id
                ? 'bg-emerald-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            {mode.icon}
            <span className="hidden md:inline">{mode.label}</span>
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Panel toggles */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleLeftPanel}
          className={`p-1.5 rounded transition-colors ${leftPanelOpen ? 'text-emerald-400 bg-emerald-900/30' : 'text-gray-500 hover:text-gray-300'}`}
          title="Toggle Left Panel"
        >
          {leftPanelOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </button>
        <button
          onClick={toggleBottomPanel}
          className={`p-1.5 rounded transition-colors ${bottomPanelOpen ? 'text-emerald-400 bg-emerald-900/30' : 'text-gray-500 hover:text-gray-300'}`}
          title="Toggle Bottom Panel"
        >
          {bottomPanelOpen ? <PanelBottomClose size={14} /> : <PanelBottomOpen size={14} />}
        </button>
        <button
          onClick={toggleRightPanel}
          className={`p-1.5 rounded transition-colors ${rightPanelOpen ? 'text-emerald-400 bg-emerald-900/30' : 'text-gray-500 hover:text-gray-300'}`}
          title="Toggle Right Panel"
        >
          {rightPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Left Sidebar
// ============================================================================

function LeftSidebar() {
  const { leftTab, setLeftTab } = useEditor();

  const tabs: { id: LeftTab; icon: React.ReactNode; label: string }[] = [
    { id: 'sceneTree', icon: <TreePine size={14} />, label: 'Scene' },
    { id: 'assetBrowser', icon: <FolderSearch size={14} />, label: 'Assets' },
  ];

  return (
    <div className="flex h-full">
      {/* Tab strip */}
      <div className="w-9 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-2 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setLeftTab(tab.id)}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              leftTab === tab.id
                ? 'bg-emerald-600 text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
            title={tab.label}
          >
            {tab.icon}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="w-52 bg-gray-950 border-r border-gray-800 overflow-hidden">
        {leftTab === 'sceneTree' && <SceneTree />}
        {leftTab === 'assetBrowser' && <AssetBrowser />}
      </div>
    </div>
  );
}

// ============================================================================
// Right Sidebar
// ============================================================================

function RightSidebar() {
  const { rightTab, setRightTab } = useEditor();

  const tabs: { id: RightTab; icon: React.ReactNode; label: string }[] = [
    { id: 'properties', icon: <Wrench size={14} />, label: 'Properties' },
    { id: 'material', icon: <Palette size={14} />, label: 'Material' },
    { id: 'terrain', icon: <Mountain size={14} />, label: 'Terrain' },
    { id: 'constraints', icon: <Shield size={14} />, label: 'Constraints' },
    { id: 'animation', icon: <Film size={14} />, label: 'Animation' },
    { id: 'particles', icon: <Sparkles size={14} />, label: 'Particles' },
    { id: 'camera', icon: <Camera size={14} />, label: 'Camera' },
  ];

  return (
    <div className="flex h-full">
      {/* Content */}
      <div className="w-64 bg-gray-950 border-l border-gray-800 overflow-y-auto">
        {rightTab === 'properties' && <PropertiesPanel />}
        {rightTab === 'material' && <MaterialEditor />}
        {rightTab === 'terrain' && <TerrainEditor />}
        {rightTab === 'constraints' && <ConstraintPanel />}
        {rightTab === 'animation' && <AnimationPanel />}
        {rightTab === 'particles' && <ParticlePanel />}
        {rightTab === 'camera' && <CameraPanel />}
      </div>

      {/* Tab strip */}
      <div className="w-9 bg-gray-900 border-l border-gray-800 flex flex-col items-center py-2 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setRightTab(tab.id)}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              rightTab === tab.id
                ? 'bg-emerald-600 text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
            title={tab.label}
          >
            {tab.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Bottom Panel
// ============================================================================

function BottomPanel() {
  const { bottomTab, setBottomTab } = useEditor();

  const tabs: { id: BottomTab; icon: React.ReactNode; label: string }[] = [
    { id: 'timeline', icon: <Clock size={12} />, label: 'Timeline' },
    { id: 'performance', icon: <Activity size={12} />, label: 'Performance' },
    { id: 'status', icon: <Info size={12} />, label: 'Status' },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-950 border-t border-gray-800">
      {/* Tab bar */}
      <div className="flex items-center h-7 bg-gray-900 border-b border-gray-800 px-2 gap-1 shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setBottomTab(tab.id)}
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors ${
              bottomTab === tab.id
                ? 'bg-emerald-600 text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {bottomTab === 'timeline' && <TimelinePanel />}
        {bottomTab === 'performance' && <PerformancePanel />}
        {bottomTab === 'status' && <StatusBar />}
      </div>
    </div>
  );
}

// ============================================================================
// Center Viewport
// ============================================================================

function CenterViewport() {
  const { centerView } = useEditor();

  return (
    <div className="flex-1 relative overflow-hidden">
      {centerView === 'viewport3d' && <Viewport3D />}
      {centerView === 'nodeGraph' && <NodeGraphView />}
      {centerView === 'constraintViz' && <ConstraintViz />}

      {/* Viewport overlay */}
      <div className="absolute top-2 left-2 text-[10px] text-gray-500 bg-gray-900/80 px-2 py-0.5 rounded pointer-events-none">
        {centerView === 'viewport3d' && '3D Viewport'}
        {centerView === 'nodeGraph' && 'Node Graph Editor'}
        {centerView === 'constraintViz' && 'Constraint Visualization'}
      </div>
    </div>
  );
}

// ============================================================================
// Main Editor Layout
// ============================================================================

function EditorLayout() {
  const { leftPanelOpen, rightPanelOpen, bottomPanelOpen } = useEditor();

  return (
    <div className="w-screen h-screen bg-gray-950 flex flex-col overflow-hidden text-gray-200">
      {/* Top Toolbar */}
      <TopToolbar />

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        {leftPanelOpen && <LeftSidebar />}

        {/* Center + Bottom */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Center viewport */}
          <CenterViewport />

          {/* Bottom panel */}
          {bottomPanelOpen && (
            <div className="h-32 shrink-0">
              <BottomPanel />
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        {rightPanelOpen && <RightSidebar />}
      </div>
    </div>
  );
}

// ============================================================================
// Exported Component
// ============================================================================

export default function InfinigenEditor() {
  return (
    <EditorProvider>
      <EditorLayout />
    </EditorProvider>
  );
}
