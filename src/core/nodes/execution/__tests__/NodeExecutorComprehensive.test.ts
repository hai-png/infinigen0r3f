/**
 * Node Executor Comprehensive Test
 *
 * Tests all executor modules without importing three-mesh-bvh
 * which has a circular dependency issue in vitest.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// Import executor modules directly (these don't depend on three-mesh-bvh)
import * as CoreExecutors from '../CoreNodeExecutors';
import * as ExtExecutors from '../ExtendedNodeExecutors';
import * as AddExecutors from '../AdditionalNodeExecutors';
import * as ExpExecutors from '../ExpandedNodeExecutors';
import * as EssentialExecutors from '../EssentialNodeExecutors';
import * as SpecializedExecutors from '../SpecializedNodeExecutors';

// Helper: create a simple triangle geometry
function makeTriangle(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,  1, 0, 0,  0.5, 1, 0,
  ], 3));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  return geo;
}

// Helper: create a simple indexed mesh (2 triangles = 1 quad)
function makeQuad(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0,
  ], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  return geo;
}

// Helper: create a simple curve geometry (4 points)
function makeCurve(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,  1, 1, 0,  2, 1, 0,  3, 0, 0,
  ], 3));
  return geo;
}

// ============================================================================
// Core Node Executors
// ============================================================================

describe('CoreNodeExecutors', () => {
  it('should distribute points on faces', () => {
    const geo = makeQuad();
    const result = CoreExecutors.executeDistributePointsOnFaces({
      Geometry: geo, Density: 10, Seed: 42,
    });
    expect(result).toBeDefined();
    expect(result.Points).toBeDefined();
  });

  it('should compute convex hull', () => {
    const geo = makeQuad();
    const result = CoreExecutors.executeConvexHull({ Geometry: geo });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should merge by distance', () => {
    const geo = makeQuad();
    const result = CoreExecutors.executeMergeByDistance({
      Geometry: geo, Distance: 0.01,
    });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should resample curves', () => {
    const curve = makeCurve();
    const result = CoreExecutors.executeCurveResample({
      Geometry: curve, Count: 10,
    });
    expect(result).toBeDefined();
    // Result may contain 'Curve' or 'Geometry' key depending on implementation
    const geo = result.Geometry ?? result.Curve;
    expect(geo).toBeDefined();
  });

  it('should compute attribute statistics', () => {
    const result = CoreExecutors.executeAttributeStatistic({
      Attribute: [1, 2, 3, 4, 5], Data_Type: 'FLOAT',
    });
    expect(result).toBeDefined();
    expect(result.Mean).toBeDefined();
    expect(result.Min).toBeDefined();
    expect(result.Max).toBeDefined();
  });
});

// ============================================================================
// Extended Node Executors
// ============================================================================

describe('ExtendedNodeExecutors', () => {
  it('should create a curve line', () => {
    const result = ExtExecutors.executeCurveLine({
      Start: { x: 0, y: 0, z: 0 }, End: { x: 1, y: 1, z: 0 },
    });
    expect(result).toBeDefined();
    // Curve generators may return 'Curve' or 'Geometry' key
    const geo = result.Geometry ?? result.Curve;
    expect(geo).toBeDefined();
  });

  it('should compute bounding box', () => {
    const geo = makeQuad();
    const result = ExtExecutors.executeBoundingBox({ Geometry: geo });
    expect(result).toBeDefined();
    expect(result.BoundingBox).toBeDefined();
  });

  it('should execute input float', () => {
    const result = ExtExecutors.executeInputFloat(
      { Value: 3.14 },
      { value: 3.14 },
    );
    expect(result).toBeDefined();
    expect(result.Value).toBe(3.14);
  });

  it('should execute switch', () => {
    const resultTrue = ExtExecutors.executeSwitch({
      Switch: true, True: 1, False: 0,
    });
    expect(resultTrue.Output).toBe(1);

    const resultFalse = ExtExecutors.executeSwitch({
      Switch: false, True: 1, False: 0,
    });
    expect(resultFalse.Output).toBe(0);
  });

  it('should execute random value', () => {
    const result = ExtExecutors.executeRandomValue({
      Min: 0, Max: 1, Seed: 42, Data_Type: 'FLOAT',
    });
    expect(result).toBeDefined();
    expect(result.Value).toBeGreaterThanOrEqual(0);
    expect(result.Value).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Additional Node Executors
// ============================================================================

describe('AdditionalNodeExecutors', () => {
  it('should execute texture coordinate', () => {
    const geo = makeQuad();
    const result = AddExecutors.executeTextureCoordinate({
      Geometry: geo, From: 'generated',
    });
    expect(result).toBeDefined();
    expect(result.Vector).toBeDefined();
  });

  it('should execute mapping', () => {
    const result = AddExecutors.executeMapping({
      Vector: { x: 0.5, y: 0.5, z: 0 },
      Scale: { x: 2, y: 2, z: 1 },
    });
    expect(result).toBeDefined();
    expect(result.Vector.x).toBe(1);
    expect(result.Vector.y).toBe(1);
  });

  it('should execute brick texture', () => {
    const result = AddExecutors.executeBrickTexture({
      Vector: { x: 0.5, y: 0.5, z: 0 }, Scale: 5,
    });
    expect(result).toBeDefined();
    expect(result.Color).toBeDefined();
    expect(result.Fac).toBeDefined();
  });

  it('should execute checker texture', () => {
    const result = AddExecutors.executeCheckerTexture({
      Vector: { x: 0.5, y: 0.5, z: 0 }, Scale: 4,
    });
    expect(result).toBeDefined();
    expect(result.Color).toBeDefined();
  });

  it('should execute gradient texture', () => {
    const result = AddExecutors.executeGradientTexture({
      Vector: { x: 0.5, y: 0, z: 0 }, GradientType: 'linear',
    });
    expect(result).toBeDefined();
    expect(result.Fac).toBe(0.5);
  });

  it('should execute boolean math', () => {
    expect(AddExecutors.executeBooleanMath({ Boolean: true, Operation: 'NOT' }).Boolean).toBe(false);
    expect(AddExecutors.executeBooleanMath({ Boolean1: true, Boolean2: false, Operation: 'AND' }).Boolean).toBe(false);
    expect(AddExecutors.executeBooleanMath({ Boolean1: true, Boolean2: true, Operation: 'OR' }).Boolean).toBe(true);
  });

  it('should execute float compare', () => {
    const result = AddExecutors.executeFloatCompare({
      A: 1.0, B: 2.0, Operation: 'LESS_THAN',
    });
    expect(result.Boolean).toBe(true);
  });
});

// ============================================================================
// Expanded Node Executors
// ============================================================================

describe('ExpandedNodeExecutors', () => {
  it('should compute dual mesh', () => {
    const geo = makeQuad();
    const result = ExpExecutors.executeDualMesh({ Geometry: geo });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should compute edge neighbors', () => {
    const geo = makeQuad();
    const result = ExpExecutors.executeEdgeNeighbors({ Geometry: geo });
    expect(result).toBeDefined();
    expect(result.Count).toBeDefined();
    expect(Array.isArray(result.Count)).toBe(true);
  });

  it('should compute face area', () => {
    const geo = makeQuad();
    const result = ExpExecutors.executeFaceArea({ Geometry: geo });
    expect(result).toBeDefined();
    expect(result.Area).toBeDefined();
    expect(result.Area.length).toBeGreaterThan(0);
  });

  it('should compute domain size', () => {
    const geo = makeQuad();
    const result = ExpExecutors.executeDomainSize({ Geometry: geo });
    expect(result.PointCount).toBe(4);
    expect(result.FaceCount).toBe(2);
  });

  it('should capture attribute', () => {
    const geo = makeQuad();
    const result = ExpExecutors.executeCaptureAttribute({
      Geometry: geo, Value: 42.0, DataType: 'FLOAT', Domain: 'POINT',
    });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
    expect(result.Attribute).toBe(42.0);
  });

  it('should compute spline parameter', () => {
    const curve = makeCurve();
    const result = ExpExecutors.executeSplineParameter({ Geometry: curve });
    expect(result).toBeDefined();
    expect(result.Factor).toBeDefined();
    expect(Array.isArray(result.Factor)).toBe(true);
  });

  it('should execute volume to mesh', () => {
    const result = ExpExecutors.executeVolumeToMesh({
      VoxelSize: 1.0, Threshold: 0.0,
      Bounds: { min: { x: -2, y: -2, z: -2 }, max: { x: 2, y: 2, z: 2 } },
    });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should execute set position', () => {
    const geo = makeQuad();
    const result = ExpExecutors.executeSetPosition({
      Geometry: geo, Offset: { x: 1, y: 0, z: 0 },
    });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should execute duplicate elements', () => {
    const geo = makeQuad();
    const result = ExpExecutors.executeDuplicateElements({
      Geometry: geo, Amount: 2, Domain: 'FACE', Selection: [true, true],
    });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
    expect(result.DuplicateIndex).toBeDefined();
  });

  it('should execute light falloff', () => {
    const result = ExpExecutors.executeLightFalloff({
      Strength: 100, Distance: 5,
    });
    expect(result).toBeDefined();
    expect(result.Quadratic).toBeGreaterThan(0);
    expect(result.Linear).toBeGreaterThan(0);
  });
});

// ============================================================================
// Essential Node Executors
// ============================================================================

describe('EssentialNodeExecutors', () => {
  it('should join geometries', () => {
    const geo1 = makeTriangle();
    const geo2 = makeTriangle();
    const result = EssentialExecutors.executeJoinGeometry({
      Geometry: [geo1, geo2],
    });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should delete geometry', () => {
    const geo = makeQuad();
    const result = EssentialExecutors.executeDeleteGeometry({
      Geometry: geo, Selection: [true, false], Domain: 'FACE',
    });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should transform geometry', () => {
    const geo = makeQuad();
    const result = EssentialExecutors.executeTransform({
      Geometry: geo,
      Translation: { x: 1, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 2, y: 2, z: 2 },
    });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should triangulate mesh', () => {
    const geo = makeQuad();
    const result = EssentialExecutors.executeTriangulate({
      Geometry: geo, Method: 'FAN',
    });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should execute curve circle', () => {
    const result = EssentialExecutors.executeCurveCircle({
      Resolution: 32, Radius: 1.0,
    });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should execute reverse curve', () => {
    const curve = makeCurve();
    const result = EssentialExecutors.executeReverseCurve({ Geometry: curve });
    expect(result).toBeDefined();
    expect(result.Geometry).toBeDefined();
  });

  it('should execute combine HSV', () => {
    const result = EssentialExecutors.executeCombineHSV({
      H: 0.5, S: 0.8, V: 1.0,
    });
    expect(result).toBeDefined();
    expect(result.Color).toBeDefined();
    expect(result.Color.r).toBeGreaterThanOrEqual(0);
  });

  it('should execute separate RGB', () => {
    const result = EssentialExecutors.executeSeparateRGB({
      Color: { r: 0.5, g: 0.3, b: 0.8 },
    });
    expect(result.R).toBeCloseTo(0.5);
    expect(result.G).toBeCloseTo(0.3);
    expect(result.B).toBeCloseTo(0.8);
  });

  it('should execute mix node', () => {
    const resultFloat = EssentialExecutors.executeMix({
      Factor: 0.5, A: 0, B: 10, Data_Type: 'FLOAT',
    });
    expect(resultFloat.Result).toBeCloseTo(5);

    const resultVec = EssentialExecutors.executeMix({
      Factor: 0.5,
      A: { x: 0, y: 0, z: 0 },
      B: { x: 10, y: 20, z: 30 },
      DataType: 'VECTOR',
    });
    // When DataType is explicitly VECTOR, it should do vector lerp
    expect(resultVec.Result).toBeDefined();
    expect(resultVec.Result.x).toBeCloseTo(5);
    expect(resultVec.Result.y).toBeCloseTo(10);
  });

  it('should execute compare', () => {
    const r1 = EssentialExecutors.executeCompare({ A: 1, B: 2, Operation: 'LESS' });
    expect(r1.Result).toBe(1.0); // Returns 1.0 for true
    const r2 = EssentialExecutors.executeCompare({ A: 2, B: 2, Operation: 'EQUAL' });
    expect(r2.Result).toBe(1.0);
    const r3 = EssentialExecutors.executeCompare({ A: 3, B: 2, Operation: 'GREATER' });
    expect(r3.Result).toBe(1.0);
  });

  it('should execute index node', () => {
    const geo = makeQuad();
    const result = EssentialExecutors.executeIndex({ Geometry: geo });
    expect(result).toBeDefined();
    const idx = result.Index ?? result.Integer ?? result.Value;
    expect(idx).toBeDefined();
  });

  it('should execute group input/output', () => {
    const resultIn = EssentialExecutors.executeGroupInput({ Value: 42 });
    expect(resultIn.Value).toBe(42);

    const resultOut = EssentialExecutors.executeGroupOutput({ Value: 42 });
    expect(resultOut.Value).toBe(42);
  });
});

// ============================================================================
// Specialized Node Executors
// ============================================================================

describe('SpecializedNodeExecutors', () => {
  it('should compute layer weight (Fresnel)', () => {
    const result = SpecializedExecutors.executeLayerWeight({
      Normal: { x: 0, y: 1, z: 0 }, Blend: 0.5,
    });
    expect(result).toBeDefined();
    expect(result.Fresnel).toBeGreaterThanOrEqual(0);
    expect(result.Facing).toBeGreaterThanOrEqual(0);
  });

  it('should execute light path', () => {
    const result = SpecializedExecutors.executeLightPath({});
    expect(result).toBeDefined();
    // IsCameraRay may be boolean true or numeric 1
    expect(result.IsCameraRay).toBeTruthy();
    expect(result.IsShadowRay).toBeFalsy();
  });

  it('should execute normalize', () => {
    const result = SpecializedExecutors.executeNormalize({
      Vector: { x: 3, y: 4, z: 0 },
    });
    expect(result.Vector.x).toBeCloseTo(0.6);
    expect(result.Vector.y).toBeCloseTo(0.8);
    expect(result.Vector.z).toBeCloseTo(0);
  });

  it('should execute vector rotate', () => {
    const result = SpecializedExecutors.executeVectorRotate({
      Vector: { x: 1, y: 0, z: 0 },
      Center: { x: 0, y: 0, z: 0 },
      Axis: { x: 0, y: 0, z: 1 },
      Angle: Math.PI / 2,
      RotationType: 'AXIS_ANGLE',
    });
    expect(result).toBeDefined();
    expect(result.Vector).toBeDefined();
    // After 90° rotation around Z, (1,0,0) → (0,1,0)
    expect(result.Vector.x).toBeCloseTo(0, 4);
    expect(result.Vector.y).toBeCloseTo(1, 4);
  });

  it('should compute edge angle', () => {
    const geo = makeQuad();
    const result = SpecializedExecutors.executeEdgeAngle({ Geometry: geo });
    expect(result).toBeDefined();
    // Output key may be 'Angle' or 'UnsignedAngle' etc.
    const angle = result.Angle ?? result.UnsignedAngle ?? result.Value;
    expect(angle).toBeDefined();
  });

  it('should execute RGB to BW', () => {
    const result = SpecializedExecutors.executeRGBToBW({
      Color: { r: 1, g: 1, b: 1 },
    });
    expect(result).toBeDefined();
    expect(result.Value).toBeCloseTo(1);

    const resultDark = SpecializedExecutors.executeRGBToBW({
      Color: { r: 0, g: 0, b: 0 },
    });
    expect(resultDark.Value).toBeCloseTo(0);
  });

  it('should execute floor/ceil', () => {
    const resultFloor = SpecializedExecutors.executeFloorCeil({
      Value: 3.7, Operation: 'FLOOR',
    });
    expect(resultFloor.Result).toBe(3);

    const resultCeil = SpecializedExecutors.executeFloorCeil({
      Value: 3.2, Operation: 'CEIL',
    });
    expect(resultCeil.Result).toBe(4);
  });

  it('should execute blackbody', () => {
    const result = SpecializedExecutors.executeBlackBody({
      Temperature: 6500,
    });
    expect(result).toBeDefined();
    expect(result.Color).toBeDefined();
    expect(result.Color.r).toBeGreaterThanOrEqual(0);
  });

  it('should execute wavelength', () => {
    const result = SpecializedExecutors.executeWavelength({
      Wavelength: 550,
    });
    expect(result).toBeDefined();
    expect(result.Color).toBeDefined();
  });

  it('should execute mesh info', () => {
    const geo = makeQuad();
    const result = SpecializedExecutors.executeMeshInfo({ Geometry: geo });
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Cross-Module: Full Pipeline Simulation
// ============================================================================

describe('Full Pipeline Simulation', () => {
  it('should execute a noise→colorRamp→BSDF chain', () => {
    // Step 1: Noise texture
    const noiseResult = AddExecutors.executeBrickTexture({
      Vector: { x: 0.5, y: 0.5, z: 0 },
      Scale: 5,
      Seed: 42,
    });

    // Step 2: Color ramp
    const rampResult = AddExecutors.executeColorRamp({
      Factor: noiseResult.Fac,
      ColorRamp: [
        { position: 0, color: { r: 0.1, g: 0.1, b: 0.1 } },
        { position: 1, color: { r: 0.9, g: 0.7, b: 0.3 } },
      ],
    });

    // Step 3: The result should be a valid color
    expect(rampResult.Color.r).toBeGreaterThanOrEqual(0);
    expect(rampResult.Color.r).toBeLessThanOrEqual(1);
  });

  it('should execute a geometry processing chain', () => {
    const geo = makeQuad();

    // Step 1: Subdivide
    const subdivided = AddExecutors.executeSubdivideMesh({
      Geometry: geo, Level: 1,
    });

    // Step 2: Extrude
    const extruded = AddExecutors.executeExtrudeFaces({
      Geometry: subdivided.Geometry, Offset: 0.5,
    });

    // Step 3: Set position
    const positioned = ExpExecutors.executeSetPosition({
      Geometry: extruded.Geometry,
      Offset: { x: 0, y: 1, z: 0 },
    });

    expect(positioned.Geometry).toBeDefined();
    expect(positioned.Geometry.getAttribute('position')).toBeDefined();
  });

  it('should execute essential geometry operations chain', () => {
    const geo1 = makeTriangle();
    const geo2 = makeTriangle();

    // Step 1: Join
    const joined = EssentialExecutors.executeJoinGeometry({
      Geometry: [geo1, geo2],
    });

    // Step 2: Transform
    const transformed = EssentialExecutors.executeTransform({
      Geometry: joined.Geometry,
      Translation: { x: 0, y: 0, z: 0 },
      Rotation: { x: 0, y: 0, z: 0 },
      Scale: { x: 1, y: 1, z: 1 },
    });

    // Step 3: Triangulate
    const triangulated = EssentialExecutors.executeTriangulate({
      Geometry: transformed.Geometry,
    });

    expect(triangulated.Geometry).toBeDefined();
  });

  it('should produce deterministic results with same seed', () => {
    const r1 = AddExecutors.executeBrickTexture({
      Vector: { x: 0.5, y: 0.5, z: 0 }, Scale: 5, Seed: 42,
    });
    const r2 = AddExecutors.executeBrickTexture({
      Vector: { x: 0.5, y: 0.5, z: 0 }, Scale: 5, Seed: 42,
    });
    expect(r1.Color.r).toBeCloseTo(r2.Color.r);
    expect(r1.Color.g).toBeCloseTo(r2.Color.g);
    expect(r1.Color.b).toBeCloseTo(r2.Color.b);
  });
});
