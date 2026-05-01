# Task 13-d: SSGI, PCSS Soft Shadows, Python Bridge Binary Transfer

**Agent**: rendering-bridge-engineer
**Status**: COMPLETE

## Files Created

### `src/core/rendering/postprocess/SSGIPass.ts` (507 lines)
- SSGIConfig: radius=0.5, intensity=0.5, samples=8, thickness=0.1, resolution=0.5
- SSGIPass class with two-pass pipeline (half-res SSGI → full-res composite)
- Fragment shader: world position reconstruction, hemisphere ray sampling with golden-angle + jitter, screen-space ray marching (32 steps), depth thickness test, Lambert-weighted indirect accumulation, 3×3 bilateral blur
- API: render(), setNormalTexture(), setDepthTexture(), setConfig(), setSize(), dispose()

### `src/core/rendering/postprocess/SSAOPass.ts` (452 lines)
- SSAOConfig: radius=0.5, intensity=1.0, samples=16, bias=0.025, resolution=0.5, blurSharpness=8.0
- SSAOPass class with three-pass pipeline (AO → bilateral blur → composite)
- AO shader: view-space position reconstruction, tangent frame, hemisphere sampling, depth range-check smoothing
- 7×7 bilateral blur with depth-aware + spatial Gaussian weighting
- API: render(), setNormalTexture(), setDepthTexture(), setConfig(), setSize(), dispose()

### `src/core/rendering/shadows/PCSSShadow.ts` (423 lines)
- PCSSConfig: lightSize=0.01, blockerSearchSamples=16, pcfSamples=32, maxSearchWidth=20
- Three-step PCSS in fragment shader: blocker search → penumbra estimation → adaptive PCF
- 32 pre-computed Poisson disk samples
- Custom depth material + receiver material with shadow matrix
- API: applyToLight(), update(), setConfig(), getShadowMap(), getShadowMatrix(), dispose()

## Files Modified

### `src/integration/bridge/hybrid-bridge.ts`
- Added BridgeMethod union type (3 new binary methods)
- Added BinaryMessage interface with wire format documentation
- Binary frame protocol: [4-byte LE header length][JSON header][binary payload]
- WebSocket binaryType='arraybuffer', handleBinaryFrame(), encodeBinaryMessage(), routeBinaryMessage()
- sendRaw() sends binary frames when binaryPayload present
- onBinary() for custom binary message handlers
- transferImage(), transferGeometry(), transferHeightMap() RPC methods

### `src/integration/bridge/index.ts`
- Added BridgeMethod and BinaryMessage to exports

### `python/bridge_server.py`
- Added struct/os imports, decode_binary_frame(), encode_binary_frame()
- handle_message() detects binary frames (isinstance bytes)
- handle_binary_frame() decodes + dispatches
- handle_transfer_image(): saves PNG/raw, supports rgba8/rgb8/float16
- handle_transfer_geometry(): saves GLB/OBJ/STL/PLY, trimesh inspection
- handle_transfer_heightmap(): Float32 reshape, numpy .npy save

### `src/core/rendering/index.ts`
- Added SSGIPass, SSAOPass, PCSSShadow + config type exports

## Verification
- TypeScript: `npx tsc --noEmit` — zero errors in new files
- Python: `python3 -c "import ast; ast.parse(...)"` — OK
- All imports use `@/core/util/MathUtils` for SeededRandom
