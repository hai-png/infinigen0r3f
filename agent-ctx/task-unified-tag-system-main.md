# Task: Unified Tag System

## Summary

Created `src/core/UnifiedTagSystem.ts` — a single file that consolidates the 3 competing tag implementations into one coherent system.

## What was done

1. **Read all 3 source files** to understand their designs:
   - `src/core/tags.ts` — Abstract Tag hierarchy with Semantics/Subpart enums, NegatedTag, FromGeneratorTag
   - `src/core/constraints/unified/UnifiedConstraintSystem.ts` — Concrete Tag with `negated: boolean`, TagSet with negation-aware matching
   - `src/core/util/TaggingSystem.ts` — Tag interface with hierarchy (parent/children), type categorization, object-tagging registry

2. **Created `src/core/UnifiedTagSystem.ts`** with:
   - **`Tag` class** — concrete class combining:
     - From tags.ts: `negate()` method, `Semantics`/`Subpart` factory methods, `FromGenerator` support, `-` prefix parsing
     - From UnifiedConstraintSystem: `name`, `negated: boolean`, `matches()`, `equals()`, `toKey()`, `!` prefix
     - From TaggingSystem: `type: TagType` categorization, `parentId` for hierarchy, `metadata` extensibility
   - **`TagSet` class** with:
     - `add(tag)`, `remove(tag)` — Map-based storage
     - `contains(tag)` — **negation-aware**: if `!TagA` is in the set, `contains(TagA)` returns `false` even if TagA is also present
     - `contains(tag)` — **hierarchy-aware**: if "chair"'s parent is "furniture" and "chair" is in the set, `contains(Tag("furniture"))` returns `true`
     - `matches(query)`, `matchesAll()`, `matchesAny()` — query evaluation
     - `overlaps(other)` — check if two sets share any effective tags
     - `negate(tag)` — add a negated tag
     - `decompose()`, `hasContradiction()`, `satisfies()` — from tags.ts algebra
     - Set operations: `union()`, `intersect()`, `difference()`, `isSubsetOf()`
     - Type filtering: `getTagsByType()`, `getPositiveNames()`, `getNegatedNames()`
     - Hierarchy utilities: `getAncestors()`, `getDescendants()`, `setParent()`, `removeParent()`
   - **Re-exported `Semantics` and `Subpart` enums** from tags.ts, preserved as-is
   - **`UnifiedTaggingSystem` class** — object tagging registry with hierarchy support (migrated from TaggingSystem)
   - **Conversion utilities**: `toUnifiedTag()`, `toUnifiedTagSet()`
   - **Deprecated aliases**: `DeprecatedSemantics`, `DeprecatedSubpart`, `DeprecatedConstraintTag`, `DeprecatedTagInfo` with JSDoc `@deprecated` annotations pointing to the new system

3. **Verified compilation** — `npx tsc --noEmit` passes with zero errors

## Files changed

- **NEW**: `src/core/UnifiedTagSystem.ts` (~1290 lines)
- **UNCHANGED**: `src/core/tags.ts`
- **UNCHANGED**: `src/core/constraints/unified/UnifiedConstraintSystem.ts`
- **UNCHANGED**: `src/core/util/TaggingSystem.ts`
- **UNCHANGED**: `src/core/index.ts`
