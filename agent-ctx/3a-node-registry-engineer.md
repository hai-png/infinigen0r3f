# Task 3-a: Node Definition Registry

## Agent: 3a-node-registry-engineer

## Summary

Built the comprehensive node definitions registry that was the biggest gap in the node system. The previous `NodeWrangler.getNodeDefinition()` was a stub returning `{Value input, Value output}` for ALL node types. Now every single one of the 299 unique NodeTypes values has a proper Blender-style socket definition.

## Files Created
- `src/core/nodes/core/node-definition-registry.ts` (~2600 lines)

## Files Modified
- `src/core/nodes/core/node-wrangler.ts` — Replaced stub `getNodeDefinition()` with registry lookup
- `src/core/nodes/core/index.ts` — Added export for registry module

## Key Implementation Details

### Registry Architecture
- `NodeDefinitionRegistry` class with `register()`, `get()`, `getByCategory()`, `getAll()`, `has()`, `size`
- Singleton export: `nodeDefinitionRegistry`
- `PropertyDefinition` interface: `float | int | boolean | enum | vector | color | string` with min/max/items/description
- `inp()` / `out()` shorthand helpers for compact definition table

### Coverage: 299/299 NodeTypes (100%)
All categories populated with Blender-default socket definitions:
- Input nodes (22), Texture (10), Geometry (12), Curve (16), Curve Primitives (4)
- Color (10), Mesh (30+), Point (30+), Volume (24), Vector (30+)
- Shader/BSDF (PrincipledBSDF with 30+ inputs), Light (6), Output (28)
- Boolean (3), Converter/Math (20+), Subdivision (1), Aliases (4)

### NodeWrangler Integration
- `getNodeDefinition()` now calls `nodeDefinitionRegistry.get(String(type))`
- Converts `PropertyDefinition` entries to flat `default` value map
- Graceful fallback to `{type, inputs: [], outputs: []}` for unknown types

### Helpers
- `createNodeFromRegistry(nw, type, name?, location?, props?)` — convenience node creation
- `findMissingDefinitions()` — validation utility (returns `[]` after this work)

## Verification
- `npx tsc --noEmit`: 0 errors
- `findMissingDefinitions()`: returns `[]`
- Registry size: 299 entries
