# Task: Tag-based Material Assignment System and Face Tagging System

## Agent: main

## Summary

Created a complete Tag-based Material Assignment System and Face Tagging System for the infinigen-r3f project, porting Infinigen's `tagging.py` and `material_assignments.py` systems to Three.js/R3F.

## Files Created

### 1. Tag System
- **`/home/z/my-project/infinigen-r3f/src/core/tags/TagSystem.ts`**
  - `SemanticTag` enum: 60+ semantic tags for rooms, furniture, object roles
  - `SubpartTag` enum: 26 geometry region tags (Top, Bottom, Front, Back, Left, Right, SupportSurface, etc.)
  - `Tag` class: Unified tag with type discriminator, value, negation support, factory methods, parse()
  - `TagSet` class: Collection of tags with negation-aware matching, set operations (intersect, union, difference)
  - `TagQuery` class: Declarative include/exclude query with string parsing

### 2. Face Tagger
- **`/home/z/my-project/infinigen-r3f/src/core/tags/FaceTagger.ts`**
  - `FaceTagger` class for per-face tag assignment on Three.js meshes
  - `tagFaces()` / `untagFaces()`: Tag specific face indices
  - `tagCanonicalSurfaces()`: Auto-tag Top/Bottom/Front/Back/Left/Right from face normals
  - `tagSupportSurfaces()`: Tag +Y normal faces as SupportSurface
  - `getTaggedFaces()` / `getTaggedFaceMask()`: Query tagged faces by TagQuery
  - Tag data stored on `Object3D.userData.__infinigen_face_tags__`

### 3. Barrel Exports
- **`/home/z/my-project/infinigen-r3f/src/core/tags/index.ts`**
  - Re-exports all types, enums, classes, and utility functions

### 4. Material Assignment System
- **`/home/z/my-project/infinigen-r3f/src/assets/materials/assignment/MaterialAssignmentSystem.ts`**
  - `MaterialAssignmentEntry`: factory name, preset, params, weight, tag filter
  - `MaterialAssignmentList`: Named list of weighted entries
  - `MaterialAssignmentSystem` class with:
    - Factory registry for material creation functions
    - Built-in factory registration for 20+ generator types
    - Weighted random selection via seeded RNG
    - Per-face material assignment via FaceTagger
    - `autoTagAndAssign()`: One-shot tag + assign pipeline
  - 17 built-in assignment lists matching Infinigen's material_assignments.py:
    - Material categories: woods, metals, fabrics, stones, ceramics, plastics
    - Context lists: floor, wall, kitchen_wall, bathroom_wall, exterior, terrain, roof, ceiling, countertop, furniture, upholstery, appliance, fixture

### 5. Material Assignment Barrel Export
- **`/home/z/my-project/infinigen-r3f/src/assets/materials/assignment/index.ts`**
  - Re-exports all types and classes

## Type Check
All files pass `tsc --noEmit` with zero errors.

## Design Decisions
- New TagSystem builds independently from UnifiedTagSystem.ts (avoids circular deps with constraint system)
- SemanticTag and SubpartTag use lowercase string values matching Infinigen conventions
- FaceTagger stores tag data in Object3D.userData to avoid modifying BufferGeometry
- MaterialAssignmentSystem uses a factory registry pattern to decouple from specific generator classes
- Built-in factories create MeshStandardMaterial instances with sensible defaults
- `param()` helper function safely extracts typed values from `Record<string, unknown>` params
