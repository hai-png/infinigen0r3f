'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Search, Folder, Leaf, Mountain, Droplets, Gem, Trees } from 'lucide-react';
import { useEditor } from '../EditorContext';

interface AssetCategory {
  id: string;
  name: string;
  icon: React.ReactNode;
  items: { id: string; name: string; type: string }[];
}

const ASSET_CATEGORIES: AssetCategory[] = [
  {
    id: 'materials',
    name: 'Materials',
    icon: <Gem size={14} />,
    items: [
      { id: 'mat_terrain', name: 'Terrain', type: 'material' },
      { id: 'mat_stone', name: 'Stone', type: 'material' },
      { id: 'mat_bark', name: 'Bark', type: 'material' },
      { id: 'mat_leaf', name: 'Leaf', type: 'material' },
      { id: 'mat_water', name: 'Water', type: 'material' },
      { id: 'mat_sand', name: 'Sand', type: 'material' },
      { id: 'mat_snow', name: 'Snow', type: 'material' },
      { id: 'mat_metal', name: 'Metal', type: 'material' },
    ],
  },
  {
    id: 'vegetation',
    name: 'Vegetation',
    icon: <Trees size={14} />,
    items: [
      { id: 'veg_oak', name: 'Oak Tree', type: 'vegetation' },
      { id: 'veg_conifer', name: 'Conifer', type: 'vegetation' },
      { id: 'veg_birch', name: 'Birch', type: 'vegetation' },
      { id: 'veg_fern', name: 'Fern', type: 'vegetation' },
      { id: 'veg_flower', name: 'Flower', type: 'vegetation' },
      { id: 'veg_mushroom', name: 'Mushroom', type: 'vegetation' },
      { id: 'veg_ivy', name: 'Ivy', type: 'vegetation' },
      { id: 'veg_grass', name: 'Grass', type: 'vegetation' },
    ],
  },
  {
    id: 'terrain',
    name: 'Terrain',
    icon: <Mountain size={14} />,
    items: [
      { id: 'ter_standard', name: 'Standard Terrain', type: 'terrain' },
      { id: 'ter_mountain', name: 'Mountain', type: 'terrain' },
      { id: 'ter_plains', name: 'Plains', type: 'terrain' },
      { id: 'ter_archipelago', name: 'Archipelago', type: 'terrain' },
    ],
  },
  {
    id: 'water',
    name: 'Water',
    icon: <Droplets size={14} />,
    items: [
      { id: 'water_ocean', name: 'Ocean', type: 'water' },
      { id: 'water_lake', name: 'Lake', type: 'water' },
      { id: 'water_river', name: 'River', type: 'water' },
    ],
  },
  {
    id: 'node_presets',
    name: 'Node Presets',
    icon: <Folder size={14} />,
    items: [
      { id: 'preset_basic_material', name: 'Basic Material', type: 'preset' },
      { id: 'preset_terrain_material', name: 'Terrain Material', type: 'preset' },
      { id: 'preset_scatter_system', name: 'Scatter System', type: 'preset' },
    ],
  },
];

export default function AssetBrowser() {
  const { loadPreset, addNode, addLog } = useEditor();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    return ASSET_CATEGORIES.map(cat => ({
      ...cat,
      items: cat.items.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase())
      ),
    })).filter(cat => {
      if (selectedCategory && cat.id !== selectedCategory) return false;
      return cat.items.length > 0;
    });
  }, [search, selectedCategory]);

  const handleItemAction = useCallback((item: { id: string; name: string; type: string }) => {
    if (item.type === 'preset') {
      const presetMap: Record<string, string> = {
        preset_basic_material: 'basic_material',
        preset_terrain_material: 'terrain_material',
        preset_scatter_system: 'scatter_system',
      };
      const presetName = presetMap[item.id];
      if (presetName) loadPreset(presetName);
    } else {
      addLog('info', `Selected asset: ${item.name}`);
    }
  }, [loadPreset, addLog]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <Leaf size={12} className="text-emerald-400" />
          <span className="text-xs font-semibold text-gray-300">Asset Browser</span>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-800 text-gray-200 text-xs pl-7 pr-2 py-1.5 rounded border border-gray-700 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 px-2 py-1 border-b border-gray-800">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`text-[10px] px-1.5 py-0.5 rounded ${!selectedCategory ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
          All
        </button>
        {ASSET_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
            className={`text-[10px] px-1.5 py-0.5 rounded ${selectedCategory === cat.id ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredCategories.map(cat => (
          <div key={cat.id} className="mb-3">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-gray-500">{cat.icon}</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{cat.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {cat.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleItemAction(item)}
                  className="text-left text-[10px] text-gray-300 hover:bg-gray-800 hover:text-emerald-300 px-2 py-1 rounded transition-colors border border-transparent hover:border-gray-700"
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
