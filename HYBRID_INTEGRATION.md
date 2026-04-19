# Infinigen Hybrid Integration Guide

This document explains how to integrate the R3F (React Three Fiber) port with the original Infinigen Python/Blender backend for capabilities that cannot be ported to JavaScript.

## Architecture Overview

```
┌─────────────────────┐         WebSocket          ┌──────────────────────┐
│   R3F Frontend      │ ◄──────────────────────►  │  Python Bridge Server│
│   (TypeScript)      │                            │  (asyncio/websockets)│
│                     │                            │                      │
│ - Constraint Solver │                            │ - Geometry Gen       │
│ - Placement Logic   │                            │ - Physics Sim        │
│ - Real-time Render  │                            │ - Cycles Rendering   │
│                     │                            │ - bpy operations     │
└─────────────────────┘                            └──────────┬───────────┘
                                                             │
                                                             ▼
                                                    ┌──────────────────────┐
                                                    │   Blender/Infinigen  │
                                                    │   (bpy API)          │
                                                    └──────────────────────┘
```

## What Gets Offloaded?

### ✅ Handled by R3F (TypeScript)
- Constraint language evaluation
- Greedy/Simulated Annealing solving
- Object placement logic
- Real-time three.js visualization
- Interactive editing

### 🔄 Offloaded to Python Backend
- **Geometry Generation**: Boolean operations, Geometry Nodes, complex mesh creation
- **Physics Simulation**: RBD, fluids, cloth (bpy.physics)
- **High-Fidelity Rendering**: Cycles path tracing
- **Asset Baking**: UV unwrapping, texture baking, LOD generation

## Setup Instructions

### 1. Start the Python Bridge Server

```bash
cd r3f_port/python

# Install dependencies
pip install websockets

# Start server (default: ws://localhost:8765)
python bridge_server.py --port 8765
```

### 2. Configure R3F Application

```typescript
import { InfinigenBridge } from '@infinigen/r3f-port/integration';

// Initialize bridge in your React component
const bridge = new InfinigenBridge({
  endpoint: 'ws://localhost:8765',
  timeoutMs: 30000,
  autoConnect: true
});

// Use in solver workflow
const handleGenerate = async () => {
  try {
    // 1. Solve constraints locally in TS
    const solvedState = await solver.solve(constraints);
    
    // 2. Offload geometry generation to Python
    const { assetUrl, stateUpdate } = await bridge.generateGeometry(
      serializeState(solvedState),
      { detail: 'high', format: 'glb' }
    );
    
    // 3. Load generated assets into three.js scene
    loadAssets(assetUrl);
    
  } catch (error) {
    console.error('Hybrid workflow failed:', error);
  }
};
```

## API Reference

### TypeScript Side (`InfinigenBridge`)

#### `generateGeometry(objects, options)`
Offload mesh generation to Blender.

```typescript
const result = await bridge.generateGeometry(
  [{ id: 'chair_1', type: 'chair', pose: [0,0,0] }],
  { detail: 'high', format: 'glb' }
);
// Returns: { assetUrl: string, stateUpdate: Partial<SolverState> }
```

#### `runSimulation(initialState, duration, fps)`
Run physics simulation and bake caches.

```typescript
const result = await bridge.runSimulation(state, 5.0, 60);
// Returns: { assetUrl: string (animated glb), stateUpdate: {...} }
```

#### `renderImage(sceneState, settings)`
Request photorealistic render from Cycles.

```typescript
const result = await bridge.renderImage(state, {
  resolution: [1920, 1080],
  samples: 256
});
// Returns: { imageUrl: string }
```

### Python Side (Bridge Server)

The server automatically routes tasks to appropriate handlers:

- `GENERATE_GEOMETRY` → `generate_geometry()`
- `RUN_SIMULATION` → `run_simulation()`
- `RENDER_IMAGE` → `render_image()`
- `BAKE_PHYSICS` → `bake_physics()`

To customize behavior, extend `InfinigenBridgeServer` and override these methods.

## Example: Full Workflow

```typescript
// App.tsx
import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { InfinigenBridge } from './integration/bridge';
import { useInfinigenSolver } from './integration/use-solver';

const bridge = new InfinigenBridge();

function SceneGenerator() {
  const { state, solved } = useInfinigenSolver(myConstraints);
  const [assets, setAssets] = useState<string[]>([]);

  useEffect(() => {
    if (solved && state) {
      // Auto-generate geometry when solution is found
      bridge.generateGeometry(
        state.objects.map(o => ({ id: o.id, type: o.tag, pose: o.pose })),
        { detail: 'medium', format: 'glb' }
      ).then(({ assetUrl }) => {
        setAssets(prev => [...prev, assetUrl]);
      });
    }
  }, [solved, state]);

  return (
    <Canvas>
      {/* Load generated assets */}
      {assets.map((url, i) => (
        <Primitive key={i} object={useGLTF(url).scene} />
      ))}
      
      {/* Real-time constraint visualization */}
      <ConstraintDebugger state={state} />
    </Canvas>
  );
}
```

## Running with Blender

For full geometry generation, run the bridge server inside Blender's Python environment:

```bash
# From Blender installation directory
./blender --background --python python/bridge_server.py
```

Or import Infinigen modules directly in the server:

```python
# In bridge_server.py
import sys
sys.path.append('/path/to/infinigen')

from infinigen.core import generate_meshes
from infinigen.assets import load_asset

async def generate_geometry(self, payload):
    # Actual Infinigen integration
    objects = payload['objects']
    meshes = generate_meshes(objects)  # Uses bpy internally
    output_path = export_to_glb(meshes)
    return {'assetUrl': output_path}
```

## Troubleshooting

### Connection Refused
Ensure the Python server is running:
```bash
ps aux | grep bridge_server
```

### Task Timeout
Increase timeout in bridge config:
```typescript
new InfinigenBridge({ timeoutMs: 60000 })
```

### Missing Assets
Check that Python server has write access to `/assets` directory.

## Performance Tips

1. **Batch Requests**: Combine multiple geometry generations into one task
2. **Progressive Loading**: Request low-detail first, refine in background
3. **Local Caching**: Cache generated GLBs in IndexedDB
4. **Worker Threads**: Run bridge communication in Web Worker

## Future Enhancements

- [ ] HTTP fallback for environments without WebSocket support
- [ ] Binary protocol (MessagePack) for faster serialization
- [ ] Distributed task queue for multiple Blender instances
- [ ] Real-time streaming of simulation frames

---

**Repository**: https://github.com/hai-png/infinigen-r3f  
**License**: MIT
