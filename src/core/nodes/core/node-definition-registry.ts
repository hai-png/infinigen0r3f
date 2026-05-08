/**
 * Node Definition Registry
 * Central registry mapping node types to their proper socket definitions.
 *
 * Every member of the NodeTypes enum receives a definition with correct
 * inputs, outputs, properties, and Blender-default values.
 *
 * Based on Blender 3.x / 4.x node socket specifications and
 * infinigen/core/nodes/node_info.py mappings.
 */

import { NodeTypes } from './node-types';
import { SocketType, SocketDefinition } from './socket-types';
import type { NodeWrangler } from './node-wrangler';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface PropertyDefinition {
  type: 'float' | 'int' | 'boolean' | 'enum' | 'vector' | 'color' | 'string';
  default: any;
  min?: number;
  max?: number;
  items?: string[]; // For enum type
  description?: string;
}

export interface NodeDefinitionEntry {
  type: string;
  category: string;
  label: string;
  inputs: SocketDefinition[];
  outputs: SocketDefinition[];
  properties?: Record<string, PropertyDefinition>;
}

// ---------------------------------------------------------------------------
// Shorthand helpers – keep the definitions table compact
// ---------------------------------------------------------------------------

const S = SocketType;

/** Shorthand to create an input socket definition */
function inp(name: string, type: SocketType | string, defaultValue?: any, min?: number, max?: number): SocketDefinition {
  const def: SocketDefinition = { name, type };
  if (defaultValue !== undefined) def.defaultValue = defaultValue;
  if (defaultValue !== undefined) def.default = defaultValue;
  if (min !== undefined) def.min = min;
  if (max !== undefined) def.max = max;
  return def;
}

/** Shorthand to create an output socket definition */
function out(name: string, type: SocketType | string): SocketDefinition {
  return { name, type };
}

// ---------------------------------------------------------------------------
// Definition table – one entry per unique NodeTypes string value
// ---------------------------------------------------------------------------

const definitions: [string, NodeDefinitionEntry][] = [
  // ========================================================================
  // MIX
  // ========================================================================
  ['MixNode', {
    type: 'MixNode',
    category: 'UTILITY',
    label: 'Mix',
    inputs: [
      inp('Factor', S.FLOAT, 0.5, 0, 1),
      inp('A', S.ANY),
      inp('B', S.ANY),
    ],
    outputs: [out('Result', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'COLOR', 'BOOLEAN'] },
      blend_type: { type: 'enum', default: 'MIX', items: ['MIX','DARKEN','MULTIPLY','BURN','LIGHTEN','SCREEN','DODGE','ADD','OVERLAY','SOFT_LIGHT','LINEAR_LIGHT','DIFFERENCE','EXCLUSION','SUBTRACT','DIVIDE','HUE','SATURATION','COLOR','VALUE'] },
      clamp_factor: { type: 'boolean', default: true },
      clamp_result: { type: 'boolean', default: false },
    },
  }],

  // ========================================================================
  // ATTRIBUTE
  // ========================================================================
  ['AttributeNode', {
    type: 'AttributeNode',
    category: 'ATTRIBUTE',
    label: 'Attribute',
    inputs: [],
    outputs: [out('Attribute', S.ANY)],
    properties: {
      attribute_name: { type: 'string', default: '' },
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER', 'CURVE', 'INSTANCE'] },
    },
  }],
  ['CaptureAttributeNode', {
    type: 'CaptureAttributeNode',
    category: 'ATTRIBUTE',
    label: 'Capture Attribute',
    inputs: [
      inp('Geometry', S.GEOMETRY),
      inp('Value', S.ANY),
    ],
    outputs: [out('Geometry', S.GEOMETRY), out('Attribute', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER', 'CURVE', 'INSTANCE'] },
    },
  }],
  ['AttributeStatisticNode', {
    type: 'AttributeStatisticNode',
    category: 'ATTRIBUTE',
    label: 'Attribute Statistic',
    inputs: [
      inp('Geometry', S.GEOMETRY),
      inp('Selection', S.BOOLEAN, true),
    ],
    outputs: [out('Mean', S.FLOAT), out('Median', S.FLOAT), out('Min', S.FLOAT), out('Max', S.FLOAT), out('Range', S.FLOAT), out('Standard Deviation', S.FLOAT), out('Variance', S.FLOAT)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'FLOAT_VECTOR'] },
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER', 'CURVE', 'INSTANCE'] },
      attribute_name: { type: 'string', default: '' },
    },
  }],
  ['TransferAttributeNode', {
    type: 'TransferAttributeNode',
    category: 'ATTRIBUTE',
    label: 'Transfer Attribute',
    inputs: [
      inp('Source', S.GEOMETRY),
      inp('Index', S.INTEGER, 0),
      inp('Source Position', S.VECTOR),
      inp('Attribute', S.ANY),
    ],
    outputs: [out('Attribute', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER', 'CURVE', 'INSTANCE'] },
      mapping: { type: 'enum', default: 'NEAREST_FACE_INTERPOLATED', items: ['NEAREST_FACE_INTERPOLATED', 'NEAREST', 'INDEX'] },
    },
  }],
  ['DomainSizeNode', {
    type: 'DomainSizeNode',
    category: 'ATTRIBUTE',
    label: 'Domain Size',
    inputs: [],
    outputs: [out('Point Count', S.INTEGER), out('Edge Count', S.INTEGER), out('Face Count', S.INTEGER), out('Spline Count', S.INTEGER), out('Instance Count', S.INTEGER)],
    properties: {
      component: { type: 'enum', default: 'MESH', items: ['MESH', 'CURVE', 'INSTANCES', 'POINT_CLOUD'] },
    },
  }],
  ['StoreNamedAttributeNode', {
    type: 'StoreNamedAttributeNode',
    category: 'ATTRIBUTE',
    label: 'Store Named Attribute',
    inputs: [
      inp('Geometry', S.GEOMETRY),
      inp('Selection', S.BOOLEAN, true),
      inp('Value', S.ANY),
    ],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN', 'BYTE_COLOR', 'STRING', 'QUATERNION', 'FLOAT2'] },
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER', 'CURVE', 'INSTANCE'] },
      attribute_name: { type: 'string', default: '' },
    },
  }],
  ['NamedAttributeNode', {
    type: 'NamedAttributeNode',
    category: 'ATTRIBUTE',
    label: 'Named Attribute',
    inputs: [],
    outputs: [out('Attribute', S.ANY), out('Exists', S.BOOLEAN)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
      attribute_name: { type: 'string', default: '' },
    },
  }],
  ['RemoveAttributeNode', {
    type: 'RemoveAttributeNode',
    category: 'ATTRIBUTE',
    label: 'Remove Attribute',
    inputs: [inp('Geometry', S.GEOMETRY)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      attribute_name: { type: 'string', default: '' },
    },
  }],
  ['SampleIndexNode', {
    type: 'SampleIndexNode',
    category: 'ATTRIBUTE',
    label: 'Sample Index',
    inputs: [
      inp('Geometry', S.GEOMETRY),
      inp('Index', S.INTEGER, 0),
      inp('Value', S.ANY),
    ],
    outputs: [out('Value', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER', 'CURVE', 'INSTANCE'] },
      clamp: { type: 'boolean', default: false },
    },
  }],
  ['SampleNearestNode', {
    type: 'SampleNearestNode',
    category: 'ATTRIBUTE',
    label: 'Sample Nearest',
    inputs: [
      inp('Geometry', S.GEOMETRY),
      inp('Sample Position', S.VECTOR),
    ],
    outputs: [out('Index', S.INTEGER)],
    properties: {
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER', 'CURVE', 'INSTANCE'] },
    },
  }],
  ['SampleNearestSurfaceNode', {
    type: 'SampleNearestSurfaceNode',
    category: 'ATTRIBUTE',
    label: 'Sample Nearest Surface',
    inputs: [
      inp('Geometry', S.GEOMETRY),
      inp('Sample Position', S.VECTOR),
      inp('Value', S.ANY),
    ],
    outputs: [out('Value', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],

  // ========================================================================
  // COLOR
  // ========================================================================
  ['ColorRampNode', {
    type: 'ColorRampNode',
    category: 'COLOR',
    label: 'ColorRamp',
    inputs: [inp('Fac', S.FLOAT, 0.5, 0, 1)],
    outputs: [out('Color', S.COLOR), out('Alpha', S.FLOAT)],
    properties: {
      color_mode: { type: 'enum', default: 'RGB', items: ['RGB', 'HSV', 'HSL'] },
      interpolation: { type: 'enum', default: 'LINEAR', items: ['EASE','CARDINAL','LINEAR','B_SPLINE','CONSTANT'] },
    },
  }],
  ['MixRGBNode', {
    type: 'MixRGBNode',
    category: 'COLOR',
    label: 'MixRGB',
    inputs: [
      inp('Fac', S.FLOAT, 0.5, 0, 1),
      inp('Color1', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 }),
      inp('Color2', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 }),
    ],
    outputs: [out('Color', S.COLOR)],
    properties: {
      blend_type: { type: 'enum', default: 'MIX', items: ['MIX','DARKEN','MULTIPLY','BURN','LIGHTEN','SCREEN','DODGE','ADD','OVERLAY','SOFT_LIGHT','LINEAR_LIGHT','DIFFERENCE','EXCLUSION','SUBTRACT','DIVIDE','HUE','SATURATION','COLOR','VALUE'] },
      use_alpha: { type: 'boolean', default: false },
      use_clamp: { type: 'boolean', default: false },
    },
  }],
  ['RGBCurveNode', {
    type: 'RGBCurveNode',
    category: 'COLOR',
    label: 'RGB Curves',
    inputs: [inp('Fac', S.FLOAT, 1, 0, 1), inp('Color', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 })],
    outputs: [out('Color', S.COLOR)],
    properties: {},
  }],
  ['BrightContrastNode', {
    type: 'BrightContrastNode',
    category: 'COLOR',
    label: 'Bright/Contrast',
    inputs: [
      inp('Color', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 }),
      inp('Bright', S.FLOAT, 0),
      inp('Contrast', S.FLOAT, 0),
    ],
    outputs: [out('Color', S.COLOR)],
    properties: {},
  }],
  ['ExposureNode', {
    type: 'ExposureNode',
    category: 'COLOR',
    label: 'Exposure',
    inputs: [
      inp('Color', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 }),
      inp('Exposure', S.FLOAT, 0),
    ],
    outputs: [out('Color', S.COLOR)],
    properties: {},
  }],
  ['CombineHSVNode', {
    type: 'CombineHSVNode',
    category: 'COLOR',
    label: 'Combine HSV',
    inputs: [inp('H', S.FLOAT, 0), inp('S', S.FLOAT, 0), inp('V', S.FLOAT, 0)],
    outputs: [out('Color', S.COLOR)],
    properties: {},
  }],
  ['SeparateRGBNode', {
    type: 'SeparateRGBNode',
    category: 'COLOR',
    label: 'Separate RGB',
    inputs: [inp('Color', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 })],
    outputs: [out('R', S.FLOAT), out('G', S.FLOAT), out('B', S.FLOAT)],
    properties: {},
  }],
  ['SeparateColorNode', {
    type: 'SeparateColorNode',
    category: 'COLOR',
    label: 'Separate Color',
    inputs: [inp('Color', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 })],
    outputs: [out('Red', S.FLOAT), out('Green', S.FLOAT), out('Blue', S.FLOAT), out('Alpha', S.FLOAT)],
    properties: {
      mode: { type: 'enum', default: 'RGB', items: ['RGB', 'HSV', 'HSL'] },
    },
  }],
  ['CombineRGBNode', {
    type: 'CombineRGBNode',
    category: 'COLOR',
    label: 'Combine RGB',
    inputs: [inp('R', S.FLOAT, 0), inp('G', S.FLOAT, 0), inp('B', S.FLOAT, 0)],
    outputs: [out('Color', S.COLOR)],
    properties: {},
  }],
  ['CombineColorNode', {
    type: 'CombineColorNode',
    category: 'COLOR',
    label: 'Combine Color',
    inputs: [inp('Red', S.FLOAT, 0), inp('Green', S.FLOAT, 0), inp('Blue', S.FLOAT, 0), inp('Alpha', S.FLOAT, 1)],
    outputs: [out('Color', S.COLOR)],
    properties: {
      mode: { type: 'enum', default: 'RGB', items: ['RGB', 'HSV', 'HSL'] },
    },
  }],

  // ========================================================================
  // CURVE
  // ========================================================================
  ['CurveToMeshNode', {
    type: 'CurveToMeshNode',
    category: 'CURVE',
    label: 'Curve to Mesh',
    inputs: [inp('Curve', S.GEOMETRY), inp('Profile Curve', S.GEOMETRY), inp('Fill Caps', S.BOOLEAN, false)],
    outputs: [out('Mesh', S.MESH)],
    properties: {},
  }],
  ['CurveToPointsNode', {
    type: 'CurveToPointsNode',
    category: 'CURVE',
    label: 'Curve to Points',
    inputs: [inp('Curve', S.GEOMETRY), inp('Count', S.INTEGER, 10, 1), inp('Length', S.FLOAT, 0.1, 0.001)],
    outputs: [out('Points', S.POINTS), out('Tangent', S.VECTOR), out('Normal', S.VECTOR), out('Rotation', S.ROTATION)],
    properties: {
      mode: { type: 'enum', default: 'COUNT', items: ['EVALUATED', 'COUNT', 'LENGTH'] },
    },
  }],
  ['MeshToCurveNode', {
    type: 'MeshToCurveNode',
    category: 'CURVE',
    label: 'Mesh to Curve',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Curve', S.CURVE)],
    properties: {},
  }],
  ['SampleCurveNode', {
    type: 'SampleCurveNode',
    category: 'CURVE',
    label: 'Sample Curve',
    inputs: [inp('Curves', S.GEOMETRY), inp('Factor', S.FLOAT, 0, 0, 1), inp('Length', S.FLOAT, 0), inp('Curve Index', S.INTEGER, 0)],
    outputs: [out('Position', S.VECTOR), out('Tangent', S.VECTOR), out('Normal', S.VECTOR)],
    properties: {
      mode: { type: 'enum', default: 'FACTOR', items: ['FACTOR', 'LENGTH'] },
      use_all_curves: { type: 'boolean', default: false },
    },
  }],
  ['SetCurveRadiusNode', {
    type: 'SetCurveRadiusNode',
    category: 'CURVE',
    label: 'Set Curve Radius',
    inputs: [inp('Curve', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Radius', S.FLOAT, 1)],
    outputs: [out('Curve', S.GEOMETRY)],
    properties: {},
  }],
  ['SetCurveTiltNode', {
    type: 'SetCurveTiltNode',
    category: 'CURVE',
    label: 'Set Curve Tilt',
    inputs: [inp('Curve', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Tilt', S.FLOAT, 0)],
    outputs: [out('Curve', S.GEOMETRY)],
    properties: {},
  }],
  ['CurveLengthNode', {
    type: 'CurveLengthNode',
    category: 'CURVE',
    label: 'Curve Length',
    inputs: [inp('Curve', S.GEOMETRY)],
    outputs: [out('Length', S.FLOAT)],
    properties: {},
  }],
  ['CurveSplineTypeNode', {
    type: 'CurveSplineTypeNode',
    category: 'CURVE',
    label: 'Set Spline Type',
    inputs: [inp('Curve', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Curve', S.GEOMETRY)],
    properties: {
      spline_type: { type: 'enum', default: 'POLY', items: ['CATMULL_ROM', 'POLY', 'BEZIER', 'NURBS'] },
      use_bezier_handles: { type: 'boolean', default: false },
      use_bezier_radius: { type: 'boolean', default: false },
    },
  }],
  ['SetHandlePositionsNode', {
    type: 'SetHandlePositionsNode',
    category: 'CURVE',
    label: 'Set Handle Positions',
    inputs: [inp('Curve', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Position', S.VECTOR), inp('Offset', S.VECTOR)],
    outputs: [out('Curve', S.GEOMETRY)],
    properties: {
      mode: { type: 'enum', default: 'LEFT', items: ['LEFT', 'RIGHT'] },
    },
  }],
  ['SplineParameterNode', {
    type: 'SplineParameterNode',
    category: 'CURVE',
    label: 'Spline Parameter',
    inputs: [],
    outputs: [out('Factor', S.FLOAT), out('Length', S.FLOAT), out('Index', S.INTEGER)],
    properties: {},
  }],
  ['SubdivideCurveNode', {
    type: 'SubdivideCurveNode',
    category: 'CURVE',
    label: 'Subdivide Curve',
    inputs: [inp('Curve', S.GEOMETRY), inp('Cuts', S.INTEGER, 1, 0)],
    outputs: [out('Curve', S.GEOMETRY)],
    properties: {},
  }],
  ['ResampleCurveNode', {
    type: 'ResampleCurveNode',
    category: 'CURVE',
    label: 'Resample Curve',
    inputs: [inp('Curve', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Count', S.INTEGER, 10, 1), inp('Length', S.FLOAT, 0.1, 0.001)],
    outputs: [out('Curve', S.GEOMETRY)],
    properties: {
      mode: { type: 'enum', default: 'COUNT', items: ['EVALUATED', 'COUNT', 'LENGTH'] },
    },
  }],
  ['TrimCurveNode', {
    type: 'TrimCurveNode',
    category: 'CURVE',
    label: 'Trim Curve',
    inputs: [inp('Curve', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Start', S.FLOAT, 0), inp('End', S.FLOAT, 1)],
    outputs: [out('Curve', S.GEOMETRY)],
    properties: {
      mode: { type: 'enum', default: 'FACTOR', items: ['FACTOR', 'LENGTH'] },
    },
  }],
  ['ReverseCurveNode', {
    type: 'ReverseCurveNode',
    category: 'CURVE',
    label: 'Reverse Curve',
    inputs: [inp('Curve', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Curve', S.GEOMETRY)],
    properties: {},
  }],
  ['FillCurveNode', {
    type: 'FillCurveNode',
    category: 'CURVE',
    label: 'Fill Curve',
    inputs: [inp('Curve', S.GEOMETRY)],
    outputs: [out('Mesh', S.MESH)],
    properties: {
      mode: { type: 'enum', default: 'TRIANGLES', items: ['TRIANGLES', 'NGONS'] },
    },
  }],
  ['FilletCurveNode', {
    type: 'FilletCurveNode',
    category: 'CURVE',
    label: 'Fillet Curve',
    inputs: [inp('Curve', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Radius', S.FLOAT, 0.25, 0), inp('Count', S.INTEGER, 1, 1)],
    outputs: [out('Curve', S.GEOMETRY)],
    properties: {
      mode: { type: 'enum', default: 'BEZIER', items: ['BEZIER', 'POLY'] },
      use_limit_radius: { type: 'boolean', default: false },
      limit_radius: { type: 'float', default: 1.0 },
    },
  }],

  // ========================================================================
  // CURVE PRIMITIVES
  // ========================================================================
  ['QuadraticBezierNode', {
    type: 'QuadraticBezierNode',
    category: 'CURVE_PRIMITIVES',
    label: 'Quadratic Bezier',
    inputs: [inp('Resolution', S.INTEGER, 10, 1), inp('Start', S.VECTOR), inp('Middle', S.VECTOR), inp('End', S.VECTOR)],
    outputs: [out('Curve', S.CURVE)],
    properties: {},
  }],
  ['CurveCircleNode', {
    type: 'CurveCircleNode',
    category: 'CURVE_PRIMITIVES',
    label: 'Curve Circle',
    inputs: [inp('Resolution', S.INTEGER, 32, 1), inp('Radius', S.FLOAT, 1, 0), inp('Point 1', S.VECTOR), inp('Point 2', S.VECTOR), inp('Point 3', S.VECTOR)],
    outputs: [out('Curve', S.CURVE)],
    properties: {
      mode: { type: 'enum', default: 'RADIUS', items: ['RADIUS', 'POINTS'] },
    },
  }],
  ['CurveLineNode', {
    type: 'CurveLineNode',
    category: 'CURVE_PRIMITIVES',
    label: 'Curve Line',
    inputs: [inp('Start', S.VECTOR), inp('End', S.VECTOR)],
    outputs: [out('Curve', S.CURVE)],
    properties: {
      mode: { type: 'enum', default: 'POINTS', items: ['POINTS', 'DIRECTION'] },
      direction: { type: 'vector', default: [0, 0, 1] },
    },
  }],
  ['CurveBezierSegmentNode', {
    type: 'CurveBezierSegmentNode',
    category: 'CURVE_PRIMITIVES',
    label: 'Bezier Segment',
    inputs: [inp('Resolution', S.INTEGER, 16, 1), inp('Start', S.VECTOR), inp('Start Handle', S.VECTOR), inp('End Handle', S.VECTOR), inp('End', S.VECTOR)],
    outputs: [out('Curve', S.CURVE)],
    properties: {
      mode: { type: 'enum', default: 'POSITION', items: ['POSITION', 'OFFSET'] },
    },
  }],

  // ========================================================================
  // GEOMETRY
  // ========================================================================
  ['SetPositionNode', {
    type: 'SetPositionNode',
    category: 'GEOMETRY',
    label: 'Set Position',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Position', S.VECTOR), inp('Offset', S.VECTOR)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {},
  }],
  ['JoinGeometryNode', {
    type: 'JoinGeometryNode',
    category: 'GEOMETRY',
    label: 'Join Geometry',
    inputs: [], // Multi-input – accepts N geometry inputs
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {},
  }],
  ['MergeByDistanceNode', {
    type: 'MergeByDistanceNode',
    category: 'GEOMETRY',
    label: 'Merge by Distance',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Distance', S.FLOAT, 0.001, 0)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      mode: { type: 'enum', default: 'ALL', items: ['ALL', 'CONNECTED'] },
    },
  }],
  ['SeparateGeometryNode', {
    type: 'SeparateGeometryNode',
    category: 'GEOMETRY',
    label: 'Separate Geometry',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Selection', S.GEOMETRY), out('Inverted', S.GEOMETRY)],
    properties: {
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER', 'CURVE', 'INSTANCE'] },
    },
  }],
  ['BoundingBoxNode', {
    type: 'BoundingBoxNode',
    category: 'GEOMETRY',
    label: 'Bounding Box',
    inputs: [inp('Geometry', S.GEOMETRY)],
    outputs: [out('Bounding Box', S.GEOMETRY), out('Min', S.VECTOR), out('Max', S.VECTOR)],
    properties: {},
  }],
  ['TransformNode', {
    type: 'TransformNode',
    category: 'GEOMETRY',
    label: 'Transform',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Translation', S.VECTOR), inp('Rotation', S.VECTOR), inp('Scale', S.VECTOR, { x: 1, y: 1, z: 1 })],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {},
  }],
  ['DeleteGeometryNode', {
    type: 'DeleteGeometryNode',
    category: 'GEOMETRY',
    label: 'Delete Geometry',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER', 'CURVE', 'INSTANCE'] },
      mode: { type: 'enum', default: 'ALL', items: ['ALL', 'EDGE_FACE', 'ONLY_FACE'] },
    },
  }],
  ['ProximityNode', {
    type: 'ProximityNode',
    category: 'GEOMETRY',
    label: 'Geometry Proximity',
    inputs: [inp('Target', S.GEOMETRY), inp('Source Position', S.VECTOR)],
    outputs: [out('Position', S.VECTOR), out('Distance', S.FLOAT), out('Is Valid', S.BOOLEAN)],
    properties: {
      target_element: { type: 'enum', default: 'FACES', items: ['FACES', 'POINTS', 'EDGES'] },
    },
  }],
  ['ConvexHullNode', {
    type: 'ConvexHullNode',
    category: 'GEOMETRY',
    label: 'Convex Hull',
    inputs: [inp('Geometry', S.GEOMETRY)],
    outputs: [out('Convex Hull', S.MESH)],
    properties: {},
  }],
  ['RaycastNode', {
    type: 'RaycastNode',
    category: 'GEOMETRY',
    label: 'Raycast',
    inputs: [inp('Target Geometry', S.GEOMETRY), inp('Source Position', S.VECTOR), inp('Ray Direction', S.VECTOR, { x: 0, y: 0, z: -1 }), inp('Ray Length', S.FLOAT, 100), inp('Is Hit', S.BOOLEAN), inp('Hit Position', S.VECTOR), inp('Hit Normal', S.VECTOR), inp('Hit Distance', S.FLOAT), inp('Attribute', S.ANY)],
    outputs: [out('Is Hit', S.BOOLEAN), out('Hit Position', S.VECTOR), out('Hit Normal', S.VECTOR), out('Hit Distance', S.FLOAT), out('Attribute', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
      mapping: { type: 'enum', default: 'INTERPOLATED', items: ['INTERPOLATED', 'NEAREST'] },
    },
  }],
  ['DuplicateElementsNode', {
    type: 'DuplicateElementsNode',
    category: 'GEOMETRY',
    label: 'Duplicate Elements',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Amount', S.INTEGER, 1, 0)],
    outputs: [out('Geometry', S.GEOMETRY), out('Duplicate Index', S.INTEGER)],
    properties: {
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CURVE', 'INSTANCE'] },
    },
  }],
  ['TriangulateNode', {
    type: 'TriangulateNode',
    category: 'GEOMETRY',
    label: 'Triangulate',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Min Vertices', S.INTEGER, 4, 3)],
    outputs: [out('Mesh', S.MESH)],
    properties: {
      quad_method: { type: 'enum', default: 'SHORTEST_DIAGONAL', items: ['BEAUTY', 'FIXED', 'FIXED_ALTERNATE', 'SHORTEST_DIAGONAL'] },
      ngon_method: { type: 'enum', default: 'BEAUTY', items: ['BEAUTY', 'CLIP'] },
    },
  }],

  // ========================================================================
  // INPUT
  // ========================================================================
  ['GroupInputNode', {
    type: 'GroupInputNode',
    category: 'INPUT',
    label: 'Group Input',
    inputs: [], // Dynamic – populated from group interface
    outputs: [], // Dynamic – populated from group interface
    properties: {},
  }],
  ['RGBNode', {
    type: 'RGBNode',
    category: 'INPUT',
    label: 'RGB',
    inputs: [],
    outputs: [out('Color', S.COLOR)],
    properties: {
      default_value: { type: 'color', default: { r: 0.5, g: 0.5, b: 0.5, a: 1 } },
    },
  }],
  ['BooleanNode', {
    type: 'BooleanNode',
    category: 'INPUT',
    label: 'Boolean',
    inputs: [],
    outputs: [out('Boolean', S.BOOLEAN)],
    properties: {
      boolean: { type: 'boolean', default: false },
    },
  }],
  ['ValueNode', {
    type: 'ValueNode',
    category: 'INPUT',
    label: 'Value',
    inputs: [],
    outputs: [out('Value', S.FLOAT)],
    properties: {
      default_value: { type: 'float', default: 0 },
    },
  }],
  ['RandomValueNode', {
    type: 'RandomValueNode',
    category: 'INPUT',
    label: 'Random Value',
    inputs: [inp('Min', S.FLOAT, 0), inp('Max', S.FLOAT, 1), inp('ID', S.INTEGER), inp('Seed', S.INTEGER, 0)],
    outputs: [out('Value', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'BOOLEAN'] },
    },
  }],
  ['CollectionInfoNode', {
    type: 'CollectionInfoNode',
    category: 'INPUT',
    label: 'Collection Info',
    inputs: [],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      collection: { type: 'string', default: '' },
      separate_children: { type: 'boolean', default: false },
      reset_children: { type: 'boolean', default: true },
    },
  }],
  ['ObjectInfoNode', {
    type: 'ObjectInfoNode',
    category: 'INPUT',
    label: 'Object Info',
    inputs: [],
    outputs: [out('Location', S.VECTOR), out('Rotation', S.VECTOR), out('Scale', S.VECTOR), out('Geometry', S.GEOMETRY)],
    properties: {
      object: { type: 'string', default: '' },
      transform_space: { type: 'enum', default: 'ORIGINAL', items: ['ORIGINAL', 'RELATIVE'] },
      as_instance: { type: 'boolean', default: false },
    },
  }],
  ['VectorNode', {
    type: 'VectorNode',
    category: 'INPUT',
    label: 'Vector',
    inputs: [],
    outputs: [out('Vector', S.VECTOR)],
    properties: {
      default_value: { type: 'vector', default: [0, 0, 0] },
    },
  }],
  ['InputIDNode', {
    type: 'InputIDNode',
    category: 'INPUT',
    label: 'ID',
    inputs: [],
    outputs: [out('ID', S.INTEGER)],
    properties: {},
  }],
  ['InputPositionNode', {
    type: 'InputPositionNode',
    category: 'INPUT',
    label: 'Position',
    inputs: [],
    outputs: [out('Position', S.VECTOR)],
    properties: {},
  }],
  ['InputNormalNode', {
    type: 'InputNormalNode',
    category: 'INPUT',
    label: 'Normal',
    inputs: [],
    outputs: [out('Normal', S.VECTOR)],
    properties: {},
  }],
  ['InputEdgeVerticesNode', {
    type: 'InputEdgeVerticesNode',
    category: 'INPUT',
    label: 'Edge Vertices',
    inputs: [],
    outputs: [out('Vertex Index 1', S.INTEGER), out('Vertex Index 2', S.INTEGER), out('Position 1', S.VECTOR), out('Position 2', S.VECTOR)],
    properties: {},
  }],
  ['InputEdgeAngleNode', {
    type: 'InputEdgeAngleNode',
    category: 'INPUT',
    label: 'Edge Angle',
    inputs: [],
    outputs: [out('Unsigned Angle', S.FLOAT), out('Signed Angle', S.FLOAT)],
    properties: {},
  }],
  ['InputColorNode', {
    type: 'InputColorNode',
    category: 'INPUT',
    label: 'Color',
    inputs: [],
    outputs: [out('Color', S.COLOR)],
    properties: {
      color: { type: 'color', default: { r: 0.5, g: 0.5, b: 0.5, a: 1 } },
    },
  }],
  ['InputMeshFaceAreaNode', {
    type: 'InputMeshFaceAreaNode',
    category: 'INPUT',
    label: 'Face Area',
    inputs: [],
    outputs: [out('Area', S.FLOAT)],
    properties: {},
  }],
  ['TextureCoordNode', {
    type: 'TextureCoordNode',
    category: 'INPUT',
    label: 'Texture Coordinate',
    inputs: [],
    outputs: [out('Generated', S.VECTOR), out('Normal', S.VECTOR), out('UV', S.VECTOR), out('Object', S.VECTOR), out('Camera', S.VECTOR), out('Window', S.VECTOR), out('Reflection', S.VECTOR)],
    properties: {
      from_instancer: { type: 'boolean', default: false },
    },
  }],
  ['IndexNode', {
    type: 'IndexNode',
    category: 'INPUT',
    label: 'Index',
    inputs: [],
    outputs: [out('Index', S.INTEGER)],
    properties: {},
  }],
  ['AmbientOcclusionNode', {
    type: 'AmbientOcclusionNode',
    category: 'SHADER_INPUT',
    label: 'Ambient Occlusion',
    inputs: [inp('Color', S.COLOR, { r: 1, g: 1, b: 1, a: 1 }), inp('Distance', S.FLOAT, 1), inp('Normal', S.VECTOR)],
    outputs: [out('Color', S.COLOR), out('AO', S.FLOAT)],
    properties: {
      samples: { type: 'int', default: 8, min: 1, max: 128 },
      inside: { type: 'boolean', default: false },
      only_local: { type: 'boolean', default: false },
    },
  }],
  ['IntegerNode', {
    type: 'IntegerNode',
    category: 'INPUT',
    label: 'Integer',
    inputs: [],
    outputs: [out('Integer', S.INTEGER)],
    properties: {
      integer: { type: 'int', default: 0 },
    },
  }],
  ['HueSaturationNode', {
    type: 'HueSaturationNode',
    category: 'COLOR',
    label: 'Hue/Saturation/Value',
    inputs: [inp('Hue', S.FLOAT, 0.5, 0, 1), inp('Saturation', S.FLOAT, 1), inp('Value', S.FLOAT, 1), inp('Fac', S.FLOAT, 1, 0, 1), inp('Color', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 })],
    outputs: [out('Color', S.COLOR)],
    properties: {},
  }],
  ['BlackBodyNode', {
    type: 'BlackBodyNode',
    category: 'SHADER_INPUT',
    label: 'Blackbody',
    inputs: [inp('Temperature', S.FLOAT, 5000, 800, 40000)],
    outputs: [out('Color', S.COLOR)],
    properties: {},
  }],

  // ========================================================================
  // INSTANCES
  // ========================================================================
  ['RealizeInstancesNode', {
    type: 'RealizeInstancesNode',
    category: 'INSTANCES',
    label: 'Realize Instances',
    inputs: [inp('Geometry', S.GEOMETRY)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      legacy_behavior: { type: 'boolean', default: false },
    },
  }],
  ['InstanceOnPointsNode', {
    type: 'InstanceOnPointsNode',
    category: 'INSTANCES',
    label: 'Instance on Points',
    inputs: [inp('Points', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Instance', S.GEOMETRY), inp('Pick Instance', S.BOOLEAN, false), inp('Instance Index', S.INTEGER), inp('Rotation', S.VECTOR), inp('Scale', S.VECTOR, { x: 1, y: 1, z: 1 })],
    outputs: [out('Instances', S.INSTANCES)],
    properties: {},
  }],
  ['TranslateInstancesNode', {
    type: 'TranslateInstancesNode',
    category: 'INSTANCES',
    label: 'Translate Instances',
    inputs: [inp('Instances', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Translation', S.VECTOR), inp('Local Space', S.BOOLEAN, false)],
    outputs: [out('Instances', S.GEOMETRY)],
    properties: {},
  }],
  ['RotateInstancesNode', {
    type: 'RotateInstancesNode',
    category: 'INSTANCES',
    label: 'Rotate Instances',
    inputs: [inp('Instances', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Rotation', S.VECTOR), inp('Local Space', S.BOOLEAN, false)],
    outputs: [out('Instances', S.GEOMETRY)],
    properties: {},
  }],
  ['ScaleInstancesNode', {
    type: 'ScaleInstancesNode',
    category: 'INSTANCES',
    label: 'Scale Instances',
    inputs: [inp('Instances', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Scale', S.VECTOR, { x: 1, y: 1, z: 1 }), inp('Local Space', S.BOOLEAN, false)],
    outputs: [out('Instances', S.GEOMETRY)],
    properties: {},
  }],

  // ========================================================================
  // MATERIAL
  // ========================================================================
  ['SetMaterialNode', {
    type: 'SetMaterialNode',
    category: 'MATERIAL',
    label: 'Set Material',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Material', S.MATERIAL)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      material: { type: 'string', default: '' },
    },
  }],
  ['SetMaterialIndexNode', {
    type: 'SetMaterialIndexNode',
    category: 'MATERIAL',
    label: 'Set Material Index',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Material Index', S.INTEGER)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {},
  }],
  ['MaterialIndexNode', {
    type: 'MaterialIndexNode',
    category: 'INPUT',
    label: 'Material Index',
    inputs: [],
    outputs: [out('Material Index', S.INTEGER)],
    properties: {},
  }],

  // ========================================================================
  // MESH
  // ========================================================================
  ['SubdivideMeshNode', {
    type: 'SubdivideMeshNode',
    category: 'MESH',
    label: 'Subdivide Mesh',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Level', S.INTEGER, 1, 0)],
    outputs: [out('Mesh', S.MESH)],
    properties: {},
  }],
  ['MeshToVolumeNode', {
    type: 'MeshToVolumeNode',
    category: 'MESH',
    label: 'Mesh to Volume',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Density', S.FLOAT, 1, 0), inp('Voxel Size', S.FLOAT, 0.3, 0.001), inp('Voxel Amount', S.FLOAT, 64, 1), inp('Interior Band Width', S.FLOAT, 0.1, 0)],
    outputs: [out('Volume', S.VOLUME)],
    properties: {
      resolution_mode: { type: 'enum', default: 'VOXEL_SIZE', items: ['VOXEL_SIZE', 'VOXEL_AMOUNT'] },
    },
  }],
  ['MeshToPointsNode', {
    type: 'MeshToPointsNode',
    category: 'MESH',
    label: 'Mesh to Points',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Position', S.VECTOR), inp('Radius', S.FLOAT, 0.05, 0)],
    outputs: [out('Points', S.POINTS)],
    properties: {
      mode: { type: 'enum', default: 'VERTICES', items: ['VERTICES', 'EDGES', 'FACES', 'CORNERS'] },
    },
  }],
  ['SetMeshNormalsNode', {
    type: 'SetMeshNormalsNode',
    category: 'MESH',
    label: 'Set Mesh Normals',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Custom Normal', S.VECTOR)],
    outputs: [out('Mesh', S.GEOMETRY)],
    properties: {},
  }],
  ['DualMeshNode', {
    type: 'DualMeshNode',
    category: 'MESH',
    label: 'Dual Mesh',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Dual Mesh', S.MESH)],
    properties: {},
  }],
  ['ExtrudeMeshNode', {
    type: 'ExtrudeMeshNode',
    category: 'MESH',
    label: 'Extrude Mesh',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Offset Scale', S.FLOAT, 0.5), inp('Offset', S.VECTOR)],
    outputs: [out('Mesh', S.MESH), out('Top', S.BOOLEAN), out('Side', S.BOOLEAN)],
    properties: {
      mode: { type: 'enum', default: 'FACES', items: ['VERTICES', 'EDGES', 'FACES'] },
      individual: { type: 'boolean', default: false },
    },
  }],
  ['ExtrudeMeshAlongNormalNode', {
    type: 'ExtrudeMeshAlongNormalNode',
    category: 'MESH',
    label: 'Extrude Along Normal',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Offset Scale', S.FLOAT, 0.5)],
    outputs: [out('Mesh', S.MESH), out('Top', S.BOOLEAN), out('Side', S.BOOLEAN)],
    properties: {},
  }],
  ['OffsetMeshNode', {
    type: 'OffsetMeshNode',
    category: 'MESH',
    label: 'Offset Mesh',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Offset', S.VECTOR)],
    outputs: [out('Mesh', S.GEOMETRY)],
    properties: {},
  }],
  ['FlipFacesNode', {
    type: 'FlipFacesNode',
    category: 'MESH',
    label: 'Flip Faces',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Mesh', S.GEOMETRY)],
    properties: {},
  }],
  ['FaceAreaNode', {
    type: 'FaceAreaNode',
    category: 'MESH',
    label: 'Face Area',
    inputs: [],
    outputs: [out('Area', S.FLOAT)],
    properties: {},
  }],
  ['EdgeNeighborsNode', {
    type: 'EdgeNeighborsNode',
    category: 'MESH',
    label: 'Edge Neighbors',
    inputs: [],
    outputs: [out('Face Count', S.INTEGER), out('Vertex Count', S.INTEGER)],
    properties: {},
  }],
  ['EdgesOfVertexNode', {
    type: 'EdgesOfVertexNode',
    category: 'MESH',
    label: 'Edges of Vertex',
    inputs: [inp('Vertex Index', S.INTEGER, 0), inp('Weights', S.FLOAT)],
    outputs: [out('Edge Index', S.INTEGER), out('Total', S.INTEGER)],
    properties: {
      sort_index: { type: 'int', default: 0 },
    },
  }],
  ['VerticesOfEdgeNode', {
    type: 'VerticesOfEdgeNode',
    category: 'MESH',
    label: 'Vertices of Edge',
    inputs: [inp('Edge Index', S.INTEGER, 0), inp('Weights', S.FLOAT)],
    outputs: [out('Vertex Index', S.INTEGER), out('Total', S.INTEGER)],
    properties: {
      sort_index: { type: 'int', default: 0 },
    },
  }],
  ['VerticesOfFaceNode', {
    type: 'VerticesOfFaceNode',
    category: 'MESH',
    label: 'Vertices of Face',
    inputs: [inp('Face Index', S.INTEGER, 0), inp('Weights', S.FLOAT)],
    outputs: [out('Vertex Index', S.INTEGER), out('Total', S.INTEGER)],
    properties: {
      sort_index: { type: 'int', default: 0 },
    },
  }],
  ['EdgesOfFaceNode', {
    type: 'EdgesOfFaceNode',
    category: 'MESH',
    label: 'Edges of Face',
    inputs: [inp('Face Index', S.INTEGER, 0), inp('Weights', S.FLOAT)],
    outputs: [out('Edge Index', S.INTEGER), out('Total', S.INTEGER)],
    properties: {
      sort_index: { type: 'int', default: 0 },
    },
  }],
  ['FacesOfEdgeNode', {
    type: 'FacesOfEdgeNode',
    category: 'MESH',
    label: 'Faces of Edge',
    inputs: [inp('Edge Index', S.INTEGER, 0), inp('Weights', S.FLOAT)],
    outputs: [out('Face Index', S.INTEGER), out('Total', S.INTEGER)],
    properties: {
      sort_index: { type: 'int', default: 0 },
    },
  }],
  ['FacesOfVertexNode', {
    type: 'FacesOfVertexNode',
    category: 'MESH',
    label: 'Faces of Vertex',
    inputs: [inp('Vertex Index', S.INTEGER, 0), inp('Weights', S.FLOAT)],
    outputs: [out('Face Index', S.INTEGER), out('Total', S.INTEGER)],
    properties: {
      sort_index: { type: 'int', default: 0 },
    },
  }],
  ['EdgeAngleNode', {
    type: 'EdgeAngleNode',
    category: 'MESH',
    label: 'Edge Angle',
    inputs: [],
    outputs: [out('Unsigned Angle', S.FLOAT), out('Signed Angle', S.FLOAT)],
    properties: {},
  }],
  ['EdgeVerticesNode', {
    type: 'EdgeVerticesNode',
    category: 'MESH',
    label: 'Edge Vertices',
    inputs: [],
    outputs: [out('Vertex Index 1', S.INTEGER), out('Vertex Index 2', S.INTEGER), out('Position 1', S.VECTOR), out('Position 2', S.VECTOR)],
    properties: {},
  }],
  ['FaceCornersNode', {
    type: 'FaceCornersNode',
    category: 'MESH',
    label: 'Face Corners',
    inputs: [inp('Face Index', S.INTEGER, 0), inp('Weights', S.FLOAT)],
    outputs: [out('Corner Index', S.INTEGER), out('Total', S.INTEGER)],
    properties: {
      sort_index: { type: 'int', default: 0 },
    },
  }],
  ['NamedCornerNode', {
    type: 'NamedCornerNode',
    category: 'MESH',
    label: 'Named Corner',
    inputs: [],
    outputs: [out('Index', S.INTEGER)],
    properties: {},
  }],
  ['CornerNormalNode', {
    type: 'CornerNormalNode',
    category: 'MESH',
    label: 'Corner Normal',
    inputs: [],
    outputs: [out('Normal', S.VECTOR)],
    properties: {},
  }],
  ['CornerAngleNode', {
    type: 'CornerAngleNode',
    category: 'MESH',
    label: 'Corner Angle',
    inputs: [],
    outputs: [out('Angle', S.FLOAT)],
    properties: {},
  }],
  ['CornerVertexIndexNode', {
    type: 'CornerVertexIndexNode',
    category: 'MESH',
    label: 'Corner Vertex Index',
    inputs: [],
    outputs: [out('Vertex Index', S.INTEGER)],
    properties: {},
  }],
  ['CornerEdgeIndexNode', {
    type: 'CornerEdgeIndexNode',
    category: 'MESH',
    label: 'Corner Edge Index',
    inputs: [],
    outputs: [out('Edge Index', S.INTEGER)],
    properties: {},
  }],
  ['CornerFaceIndexNode', {
    type: 'CornerFaceIndexNode',
    category: 'MESH',
    label: 'Corner Face Index',
    inputs: [],
    outputs: [out('Face Index', S.INTEGER)],
    properties: {},
  }],
  ['UVMapNode', {
    type: 'UVMapNode',
    category: 'MESH',
    label: 'UV Map',
    inputs: [],
    outputs: [out('UV', S.VECTOR)],
    properties: {
      uv_map: { type: 'string', default: '' },
      from_instancer: { type: 'boolean', default: false },
    },
  }],
  ['UVWarpNode', {
    type: 'UVWarpNode',
    category: 'MESH',
    label: 'UV Warp',
    inputs: [inp('Vector', S.VECTOR), inp('Scale', S.VECTOR, { x: 1, y: 1, z: 1 }), inp('Rotation', S.FLOAT, 0), inp('Translation', S.VECTOR)],
    outputs: [out('Vector', S.VECTOR)],
    properties: {},
  }],
  ['SetUVNode', {
    type: 'SetUVNode',
    category: 'MESH',
    label: 'Set UV Map',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('UV', S.VECTOR)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      uv_map: { type: 'string', default: '' },
    },
  }],

  // ========================================================================
  // POINT
  // ========================================================================
  ['DistributePointsInVolumeNode', {
    type: 'DistributePointsInVolumeNode',
    category: 'POINT',
    label: 'Distribute Points in Volume',
    inputs: [inp('Volume', S.VOLUME), inp('Density', S.FLOAT, 1, 0), inp('Seed', S.INTEGER, 0)],
    outputs: [out('Points', S.POINTS)],
    properties: {
      mode: { type: 'enum', default: 'DENSITY', items: ['DENSITY', 'DENSITY_AND_AMOUNT'] },
    },
  }],
  ['DistributePointsOnFacesNode', {
    type: 'DistributePointsOnFacesNode',
    category: 'POINT',
    label: 'Distribute Points on Faces',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Distance Min', S.FLOAT, 0, 0), inp('Density Max', S.FLOAT, 10, 0), inp('Density', S.FLOAT, 10, 0), inp('Density Factor', S.FLOAT, 1, 0, 1), inp('Seed', S.INTEGER, 0)],
    outputs: [out('Points', S.POINTS), out('Normal', S.VECTOR), out('Rotation', S.ROTATION)],
    properties: {
      distribute_method: { type: 'enum', default: 'RANDOM', items: ['RANDOM', 'POISSON'] },
    },
  }],
  ['PointsToCurvesNode', {
    type: 'PointsToCurvesNode',
    category: 'POINT',
    label: 'Points to Curves',
    inputs: [inp('Points', S.GEOMETRY), inp('Curve Group ID', S.INTEGER), inp('Weight', S.FLOAT)],
    outputs: [out('Curves', S.CURVE)],
    properties: {},
  }],
  ['PointsToVolumesNode', {
    type: 'PointsToVolumesNode',
    category: 'POINT',
    label: 'Points to Volume',
    inputs: [inp('Points', S.GEOMETRY), inp('Density', S.FLOAT, 1, 0), inp('Voxel Size', S.FLOAT, 0.3, 0.001), inp('Voxel Amount', S.FLOAT, 64, 1), inp('Radius', S.FLOAT, 0.5, 0)],
    outputs: [out('Volume', S.VOLUME)],
    properties: {
      resolution_mode: { type: 'enum', default: 'VOXEL_SIZE', items: ['VOXEL_SIZE', 'VOXEL_AMOUNT'] },
    },
  }],
  ['PointsToVerticesNode', {
    type: 'PointsToVerticesNode',
    category: 'POINT',
    label: 'Points to Vertices',
    inputs: [inp('Points', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Mesh', S.MESH)],
    properties: {},
  }],
  ['PointsNode', {
    type: 'PointsNode',
    category: 'POINT',
    label: 'Points',
    inputs: [inp('Count', S.INTEGER, 1, 0), inp('Position', S.VECTOR), inp('Radius', S.FLOAT, 0.05, 0)],
    outputs: [out('Geometry', S.POINTS)],
    properties: {},
  }],
  ['PointDomainNode', {
    type: 'PointDomainNode',
    category: 'POINT',
    label: 'Point Domain',
    inputs: [],
    outputs: [out('Domain', S.STRING)],
    properties: {},
  }],
  ['PointDomainSizeNode', {
    type: 'PointDomainSizeNode',
    category: 'POINT',
    label: 'Point Domain Size',
    inputs: [],
    outputs: [out('Point Count', S.INTEGER)],
    properties: {},
  }],
  ['PointIndexNode', {
    type: 'PointIndexNode',
    category: 'POINT',
    label: 'Point Index',
    inputs: [],
    outputs: [out('Index', S.INTEGER)],
    properties: {},
  }],
  ['PointPositionNode', {
    type: 'PointPositionNode',
    category: 'POINT',
    label: 'Point Position',
    inputs: [],
    outputs: [out('Position', S.VECTOR)],
    properties: {},
  }],
  ['PointVelocityNode', {
    type: 'PointVelocityNode',
    category: 'POINT',
    label: 'Point Velocity',
    inputs: [],
    outputs: [out('Velocity', S.VECTOR)],
    properties: {},
  }],
  ['PointRotationNode', {
    type: 'PointRotationNode',
    category: 'POINT',
    label: 'Point Rotate',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Rotation', S.VECTOR), inp('Axis', S.VECTOR), inp('Angle', S.FLOAT, 0)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      type: { type: 'enum', default: 'EULER', items: ['EULER', 'AXIS_ANGLE'] },
      space: { type: 'enum', default: 'OBJECT', items: ['OBJECT', 'LOCAL'] },
    },
  }],
  ['PointScaleNode', {
    type: 'PointScaleNode',
    category: 'POINT',
    label: 'Point Scale',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true), inp('Scale', S.VECTOR, { x: 1, y: 1, z: 1 })],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      field_type: { type: 'enum', default: 'FLOAT_VECTOR', items: ['FLOAT_VECTOR', 'FLOAT', 'BOOLEAN'] },
    },
  }],
  ['PointCountNode', {
    type: 'PointCountNode',
    category: 'POINT',
    label: 'Point Count',
    inputs: [],
    outputs: [out('Point Count', S.INTEGER)],
    properties: {},
  }],
  ['PointMaterialIndexNode', {
    type: 'PointMaterialIndexNode',
    category: 'POINT',
    label: 'Point Material Index',
    inputs: [],
    outputs: [out('Material Index', S.INTEGER)],
    properties: {},
  }],
  ['PointNamedAttributeNode', {
    type: 'PointNamedAttributeNode',
    category: 'POINT',
    label: 'Point Named Attribute',
    inputs: [],
    outputs: [out('Attribute', S.ANY), out('Exists', S.BOOLEAN)],
    properties: {
      attribute_name: { type: 'string', default: '' },
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],
  ['PointCaptureAttributeNode', {
    type: 'PointCaptureAttributeNode',
    category: 'POINT',
    label: 'Point Capture Attribute',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Value', S.ANY)],
    outputs: [out('Geometry', S.GEOMETRY), out('Attribute', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],
  ['PointTransferAttributeNode', {
    type: 'PointTransferAttributeNode',
    category: 'POINT',
    label: 'Point Transfer Attribute',
    inputs: [inp('Source', S.GEOMETRY), inp('Attribute', S.ANY), inp('Index', S.INTEGER, 0), inp('Source Position', S.VECTOR)],
    outputs: [out('Attribute', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
      mapping: { type: 'enum', default: 'NEAREST_FACE_INTERPOLATED', items: ['NEAREST_FACE_INTERPOLATED', 'NEAREST', 'INDEX'] },
    },
  }],
  ['PointStoreNamedAttributeNode', {
    type: 'PointStoreNamedAttributeNode',
    category: 'POINT',
    label: 'Point Store Named Attribute',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Value', S.ANY)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      attribute_name: { type: 'string', default: '' },
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],
  ['PointSampleIndexNode', {
    type: 'PointSampleIndexNode',
    category: 'POINT',
    label: 'Point Sample Index',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Index', S.INTEGER, 0), inp('Value', S.ANY)],
    outputs: [out('Value', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
      clamp: { type: 'boolean', default: false },
    },
  }],
  ['PointSampleNearestNode', {
    type: 'PointSampleNearestNode',
    category: 'POINT',
    label: 'Point Sample Nearest',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Sample Position', S.VECTOR)],
    outputs: [out('Index', S.INTEGER)],
    properties: {},
  }],
  ['PointSampleNearestSurfaceNode', {
    type: 'PointSampleNearestSurfaceNode',
    category: 'POINT',
    label: 'Point Sample Nearest Surface',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Sample Position', S.VECTOR), inp('Value', S.ANY)],
    outputs: [out('Value', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],
  ['PointAttributeStatisticNode', {
    type: 'PointAttributeStatisticNode',
    category: 'POINT',
    label: 'Point Attribute Statistic',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Mean', S.FLOAT), out('Min', S.FLOAT), out('Max', S.FLOAT), out('Range', S.FLOAT), out('Standard Deviation', S.FLOAT)],
    properties: {},
  }],
  ['PointBlurAttributeNode', {
    type: 'PointBlurAttributeNode',
    category: 'POINT',
    label: 'Point Blur Attribute',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Value', S.ANY), inp('Radius', S.FLOAT, 1)],
    outputs: [out('Geometry', S.GEOMETRY), out('Value', S.ANY)],
    properties: {},
  }],
  ['PointAccumulateAttributeNode', {
    type: 'PointAccumulateAttributeNode',
    category: 'POINT',
    label: 'Point Accumulate Attribute',
    inputs: [inp('Value', S.FLOAT), inp('Group Index', S.INTEGER)],
    outputs: [out('Leading', S.FLOAT), out('Trailing', S.FLOAT), out('Total', S.FLOAT)],
    properties: {},
  }],
  ['PointEvaluateonDomainNode', {
    type: 'PointEvaluateonDomainNode',
    category: 'POINT',
    label: 'Point Evaluate on Domain',
    inputs: [inp('Value', S.ANY)],
    outputs: [out('Value', S.ANY)],
    properties: {
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER', 'CURVE', 'INSTANCE'] },
    },
  }],
  ['PointInterpolateCurvesNode', {
    type: 'PointInterpolateCurvesNode',
    category: 'POINT',
    label: 'Interpolate Curves',
    inputs: [inp('Guide Curves', S.GEOMETRY), inp('Guide Positions', S.VECTOR), inp('Guide Rest Positions', S.VECTOR), inp('Guide Up', S.VECTOR), inp('Point Positions', S.VECTOR), inp('Point Rest Positions', S.VECTOR), inp('Point Up', S.VECTOR), inp('Max Neighbors', S.INTEGER, 4, 1)],
    outputs: [out('Curves', S.CURVE)],
    properties: {},
  }],
  ['PointSampleUVSurfaceNode', {
    type: 'PointSampleUVSurfaceNode',
    category: 'POINT',
    label: 'Sample UV Surface',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Value', S.ANY), inp('UV', S.VECTOR)],
    outputs: [out('Value', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],
  ['PointIsViewportNode', {
    type: 'PointIsViewportNode',
    category: 'POINT',
    label: 'Is Viewport',
    inputs: [],
    outputs: [out('Is Viewport', S.BOOLEAN)],
    properties: {},
  }],
  ['PointImageInfoNode', {
    type: 'PointImageInfoNode',
    category: 'POINT',
    label: 'Image Info',
    inputs: [],
    outputs: [out('Width', S.INTEGER), out('Height', S.INTEGER), out('Has Alpha', S.BOOLEAN), out('Frame Count', S.INTEGER)],
    properties: {},
  }],
  ['PointCurveofPointNode', {
    type: 'PointCurveofpointNode',
    category: 'POINT',
    label: 'Curve of Point',
    inputs: [inp('Point Index', S.INTEGER, 0)],
    outputs: [out('Curve Index', S.INTEGER), out('Index in Curve', S.INTEGER)],
    properties: {},
  }],
  ['PointCurvesInfoNode', {
    type: 'PointCurvesInfoNode',
    category: 'POINT',
    label: 'Curves Info',
    inputs: [inp('Curve Index', S.INTEGER, 0)],
    outputs: [out('Point Count', S.INTEGER), out('Cyclic', S.BOOLEAN)],
    properties: {},
  }],
  ['PointRadiusNode', {
    type: 'PointRadiusNode',
    category: 'POINT',
    label: 'Radius',
    inputs: [],
    outputs: [out('Radius', S.FLOAT)],
    properties: {},
  }],
  ['PointEndpointSelectionNode', {
    type: 'PointEndpointSelectionNode',
    category: 'POINT',
    label: 'Endpoint Selection',
    inputs: [inp('Start Size', S.INTEGER, 1, 0), inp('End Size', S.INTEGER, 1, 0)],
    outputs: [out('Selection', S.BOOLEAN)],
    properties: {},
  }],
  ['PointsofCurveNode', {
    type: 'PointsofCurveNode',
    category: 'POINT',
    label: 'Points of Curve',
    inputs: [inp('Curve Index', S.INTEGER, 0), inp('Weights', S.FLOAT)],
    outputs: [out('Point Index', S.INTEGER), out('Total', S.INTEGER)],
    properties: {
      sort_index: { type: 'int', default: 0 },
    },
  }],
  ['PointSplineResolutionNode', {
    type: 'PointSplineResolutionNode',
    category: 'POINT',
    label: 'Spline Resolution',
    inputs: [],
    outputs: [out('Resolution', S.INTEGER)],
    properties: {},
  }],
  ['PointOffsetPointinCurveNode', {
    type: 'PointOffsetPointinCurveNode',
    category: 'POINT',
    label: 'Offset Point in Curve',
    inputs: [inp('Point Index', S.INTEGER, 0), inp('Offset', S.INTEGER, 0)],
    outputs: [out('Is Valid', S.BOOLEAN), out('Point Index', S.INTEGER)],
    properties: {},
  }],
  ['PointSplineTypeNode', {
    type: 'PointSplineTypeNode',
    category: 'POINT',
    label: 'Set Spline Type',
    inputs: [inp('Curve', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Curve', S.GEOMETRY)],
    properties: {
      spline_type: { type: 'enum', default: 'POLY', items: ['CATMULL_ROM', 'POLY', 'BEZIER', 'NURBS'] },
    },
  }],
  ['PointSplineLengthNode', {
    type: 'PointSplineLengthNode',
    category: 'POINT',
    label: 'Spline Length',
    inputs: [],
    outputs: [out('Length', S.FLOAT)],
    properties: {},
  }],
  ['PointCurveTangentNode', {
    type: 'PointCurveTangentNode',
    category: 'POINT',
    label: 'Curve Tangent',
    inputs: [],
    outputs: [out('Tangent', S.VECTOR)],
    properties: {},
  }],

  // ========================================================================
  // VOLUME
  // ========================================================================
  ['VolumeToMeshNode', {
    type: 'VolumeToMeshNode',
    category: 'VOLUME',
    label: 'Volume to Mesh',
    inputs: [inp('Volume', S.VOLUME), inp('Voxel Size', S.FLOAT, 0.3, 0.001), inp('Voxel Amount', S.FLOAT, 64, 1), inp('Adaptivity', S.FLOAT, 0, 0, 1), inp('Threshold', S.FLOAT, 0.1)],
    outputs: [out('Mesh', S.MESH)],
    properties: {
      resolution_mode: { type: 'enum', default: 'VOXEL_SIZE', items: ['VOXEL_SIZE', 'VOXEL_AMOUNT'] },
    },
  }],
  ['VolumeToPointsNode', {
    type: 'VolumeToPointsNode',
    category: 'VOLUME',
    label: 'Volume to Points',
    inputs: [inp('Volume', S.VOLUME), inp('Density', S.FLOAT, 1, 0), inp('Voxel Size', S.FLOAT, 0.3, 0.001), inp('Seed', S.INTEGER, 0)],
    outputs: [out('Points', S.POINTS)],
    properties: {},
  }],
  ['VolumeToCurveNode', {
    type: 'VolumeToCurveNode',
    category: 'VOLUME',
    label: 'Volume to Curve',
    inputs: [inp('Volume', S.VOLUME), inp('Density', S.FLOAT, 1, 0), inp('Voxel Size', S.FLOAT, 0.3, 0.001)],
    outputs: [out('Curve', S.CURVE)],
    properties: {},
  }],
  ['VolumeSampleNode', {
    type: 'VolumeSampleNode',
    category: 'VOLUME',
    label: 'Volume Sample',
    inputs: [inp('Volume', S.VOLUME), inp('Position', S.VECTOR), inp('Grid', S.STRING)],
    outputs: [out('Value', S.FLOAT)],
    properties: {
      grid: { type: 'string', default: 'density' },
      interpolation: { type: 'enum', default: 'TRILINEAR', items: ['TRILINEAR', 'TRICUBIC'] },
    },
  }],
  ['VolumeValueNode', {
    type: 'VolumeValueNode',
    category: 'VOLUME',
    label: 'Volume Value',
    inputs: [],
    outputs: [out('Value', S.FLOAT)],
    properties: {},
  }],
  ['VolumeDensityNode', {
    type: 'VolumeDensityNode',
    category: 'VOLUME',
    label: 'Volume Density',
    inputs: [],
    outputs: [out('Density', S.FLOAT)],
    properties: {},
  }],
  ['VolumeEmissionNode', {
    type: 'VolumeEmissionNode',
    category: 'SHADER',
    label: 'Volume Emission',
    inputs: [inp('Color', S.COLOR, { r: 1, g: 1, b: 1, a: 1 }), inp('Strength', S.FLOAT, 1, 0)],
    outputs: [out('Volume', S.SHADER)],
    properties: {},
  }],
  ['VolumeAbsorptionNode', {
    type: 'VolumeAbsorptionNode',
    category: 'SHADER',
    label: 'Volume Absorption',
    inputs: [inp('Color', S.COLOR, { r: 0, g: 0, b: 0, a: 1 }), inp('Density', S.FLOAT, 1, 0)],
    outputs: [out('Volume', S.SHADER)],
    properties: {},
  }],
  ['VolumeScatteringNode', {
    type: 'VolumeScatteringNode',
    category: 'SHADER',
    label: 'Volume Scatter',
    inputs: [inp('Color', S.COLOR, { r: 0.8, g: 0.8, b: 0.8, a: 1 }), inp('Density', S.FLOAT, 1, 0), inp('Anisotropy', S.FLOAT, 0, -1, 1)],
    outputs: [out('Volume', S.SHADER)],
    properties: {},
  }],
  ['VolumePrincipledNode', {
    type: 'VolumePrincipledNode',
    category: 'SHADER',
    label: 'Principled Volume',
    inputs: [inp('Color', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 }), inp('Density', S.FLOAT, 1, 0), inp('Emission', S.COLOR, { r: 0, g: 0, b: 0, a: 1 }), inp('Emission Strength', S.FLOAT, 0), inp('Blackbody Intensity', S.FLOAT, 0), inp('Blackbody Tint', S.COLOR, { r: 1, g: 1, b: 1, a: 1 }), inp('Temperature', S.FLOAT, 1000), inp('Anisotropy', S.FLOAT, 0, -1, 1)],
    outputs: [out('Volume', S.SHADER)],
    properties: {},
  }],
  ['VolumeInfoNode', {
    type: 'VolumeInfoNode',
    category: 'VOLUME',
    label: 'Volume Info',
    inputs: [],
    outputs: [out('Density', S.FLOAT), out('Color', S.COLOR), out('Flame', S.FLOAT), out('Temperature', S.FLOAT)],
    properties: {},
  }],
  ['VolumeMaterialIndexNode', {
    type: 'VolumeMaterialIndexNode',
    category: 'VOLUME',
    label: 'Volume Material Index',
    inputs: [],
    outputs: [out('Material Index', S.INTEGER)],
    properties: {},
  }],
  ['VolumeNamedAttributeNode', {
    type: 'VolumeNamedAttributeNode',
    category: 'VOLUME',
    label: 'Volume Named Attribute',
    inputs: [],
    outputs: [out('Attribute', S.ANY), out('Exists', S.BOOLEAN)],
    properties: {
      attribute_name: { type: 'string', default: '' },
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],
  ['VolumeCaptureAttributeNode', {
    type: 'VolumeCaptureAttributeNode',
    category: 'VOLUME',
    label: 'Volume Capture Attribute',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Value', S.ANY)],
    outputs: [out('Geometry', S.GEOMETRY), out('Attribute', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],
  ['VolumeTransferAttributeNode', {
    type: 'VolumeTransferAttributeNode',
    category: 'VOLUME',
    label: 'Volume Transfer Attribute',
    inputs: [inp('Source', S.GEOMETRY), inp('Attribute', S.ANY), inp('Source Position', S.VECTOR)],
    outputs: [out('Attribute', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
      mapping: { type: 'enum', default: 'NEAREST', items: ['NEAREST', 'INTERPOLATED'] },
    },
  }],
  ['VolumeStoreNamedAttributeNode', {
    type: 'VolumeStoreNamedAttributeNode',
    category: 'VOLUME',
    label: 'Volume Store Named Attribute',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Value', S.ANY)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {
      attribute_name: { type: 'string', default: '' },
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],
  ['VolumeSampleIndexNode', {
    type: 'VolumeSampleIndexNode',
    category: 'VOLUME',
    label: 'Volume Sample Index',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Value', S.ANY), inp('Index', S.INTEGER, 0)],
    outputs: [out('Value', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],
  ['VolumeSampleNearestNode', {
    type: 'VolumeSampleNearestNode',
    category: 'VOLUME',
    label: 'Volume Sample Nearest',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Sample Position', S.VECTOR)],
    outputs: [out('Index', S.INTEGER)],
    properties: {},
  }],
  ['VolumeSampleNearestSurfaceNode', {
    type: 'VolumeSampleNearestSurfaceNode',
    category: 'VOLUME',
    label: 'Volume Sample Nearest Surface',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Sample Position', S.VECTOR), inp('Value', S.ANY)],
    outputs: [out('Value', S.ANY)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'FLOAT_COLOR', 'BOOLEAN'] },
    },
  }],
  ['VolumeAttributeStatisticNode', {
    type: 'VolumeAttributeStatisticNode',
    category: 'VOLUME',
    label: 'Volume Attribute Statistic',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Selection', S.BOOLEAN, true)],
    outputs: [out('Mean', S.FLOAT), out('Min', S.FLOAT), out('Max', S.FLOAT)],
    properties: {},
  }],
  ['VolumeBlurAttributeNode', {
    type: 'VolumeBlurAttributeNode',
    category: 'VOLUME',
    label: 'Volume Blur Attribute',
    inputs: [inp('Geometry', S.GEOMETRY), inp('Value', S.ANY), inp('Radius', S.FLOAT, 1)],
    outputs: [out('Geometry', S.GEOMETRY), out('Value', S.ANY)],
    properties: {},
  }],
  ['VolumeAccumulateAttributeNode', {
    type: 'VolumeAccumulateAttributeNode',
    category: 'VOLUME',
    label: 'Volume Accumulate Attribute',
    inputs: [inp('Value', S.FLOAT), inp('Group Index', S.INTEGER)],
    outputs: [out('Leading', S.FLOAT), out('Trailing', S.FLOAT), out('Total', S.FLOAT)],
    properties: {},
  }],
  ['VolumeEvaluateonDomainNode', {
    type: 'VolumeEvaluateonDomainNode',
    category: 'VOLUME',
    label: 'Volume Evaluate on Domain',
    inputs: [inp('Value', S.ANY)],
    outputs: [out('Value', S.ANY)],
    properties: {
      domain: { type: 'enum', default: 'POINT', items: ['POINT', 'EDGE', 'FACE', 'CORNER'] },
    },
  }],

  // ========================================================================
  // TEXTURE
  // ========================================================================
  ['TextureBrickNode', {
    type: 'TextureBrickNode',
    category: 'TEXTURE',
    label: 'Brick Texture',
    inputs: [inp('Vector', S.VECTOR), inp('Color1', S.COLOR, { r: 0.8, g: 0.8, b: 0.8, a: 1 }), inp('Color2', S.COLOR, { r: 0.2, g: 0.2, b: 0.2, a: 1 }), inp('Mortar', S.COLOR, { r: 0, g: 0, b: 0, a: 1 }), inp('Scale', S.FLOAT, 5), inp('Mortar Size', S.FLOAT, 0.02, 0, 1), inp('Bias', S.FLOAT, 0, -1, 1), inp('Brick Width', S.FLOAT, 0.5, 0.01, 100), inp('Row Height', S.FLOAT, 0.25, 0.01, 100)],
    outputs: [out('Color', S.COLOR), out('Fac', S.FLOAT)],
    properties: {
      offset: { type: 'float', default: 0.5 },
      offset_frequency: { type: 'int', default: 2, min: 1, max: 99 },
      squash: { type: 'float', default: 1.0 },
      squash_frequency: { type: 'int', default: 2, min: 1, max: 99 },
    },
  }],
  ['TextureCheckerNode', {
    type: 'TextureCheckerNode',
    category: 'TEXTURE',
    label: 'Checker Texture',
    inputs: [inp('Vector', S.VECTOR), inp('Color1', S.COLOR, { r: 0.8, g: 0.8, b: 0.8, a: 1 }), inp('Color2', S.COLOR, { r: 0.2, g: 0.2, b: 0.2, a: 1 }), inp('Scale', S.FLOAT, 5)],
    outputs: [out('Color', S.COLOR), out('Fac', S.FLOAT)],
    properties: {},
  }],
  ['TextureGradientNode', {
    type: 'TextureGradientNode',
    category: 'TEXTURE',
    label: 'Gradient Texture',
    inputs: [inp('Vector', S.VECTOR)],
    outputs: [out('Color', S.COLOR), out('Fac', S.FLOAT)],
    properties: {
      gradient_type: { type: 'enum', default: 'LINEAR', items: ['LINEAR', 'QUADRATIC', 'EASING', 'DIAGONAL', 'SPHERICAL', 'QUADRATIC_SPHERE', 'RADIAL'] },
    },
  }],
  ['TextureMagicNode', {
    type: 'TextureMagicNode',
    category: 'TEXTURE',
    label: 'Magic Texture',
    inputs: [inp('Vector', S.VECTOR), inp('Scale', S.FLOAT, 5), inp('Distortion', S.FLOAT, 1)],
    outputs: [out('Color', S.COLOR), out('Fac', S.FLOAT)],
    properties: {
      turbulence_depth: { type: 'int', default: 2, min: 1, max: 10 },
    },
  }],
  ['TextureNoiseNode', {
    type: 'TextureNoiseNode',
    category: 'TEXTURE',
    label: 'Noise Texture',
    inputs: [inp('Vector', S.VECTOR), inp('Scale', S.FLOAT, 5), inp('Detail', S.FLOAT, 2, 0, 16), inp('Roughness', S.FLOAT, 0.5, 0, 1), inp('Distortion', S.FLOAT, 0)],
    outputs: [out('Fac', S.FLOAT), out('Color', S.COLOR)],
    properties: {
      noise_dimensions: { type: 'enum', default: '3D', items: ['1D', '2D', '3D', '4D'] },
      normalize: { type: 'boolean', default: true },
    },
  }],
  ['TextureVoronoiNode', {
    type: 'TextureVoronoiNode',
    category: 'TEXTURE',
    label: 'Voronoi Texture',
    inputs: [inp('Vector', S.VECTOR), inp('Scale', S.FLOAT, 5), inp('Detail', S.FLOAT, 0, 0, 16), inp('Roughness', S.FLOAT, 0.5, 0, 1), inp('Lacunarity', S.FLOAT, 2, 0), inp('Distance', S.FLOAT, 0), inp('Color', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 }), inp('Position', S.VECTOR), inp('Radius', S.FLOAT, 0.5, 0, 1), inp('W', S.FLOAT, 0)],
    outputs: [out('Distance', S.FLOAT), out('Color', S.COLOR), out('Position', S.VECTOR), out('Radius', S.FLOAT)],
    properties: {
      voronoi_dimensions: { type: 'enum', default: '3D', items: ['1D', '2D', '3D', '4D'] },
      distance: { type: 'enum', default: 'EUCLIDEAN', items: ['EUCLIDEAN', 'MANHATTAN', 'CHEBYCHEV', 'MINKOWSKI'] },
      feature: { type: 'enum', default: 'F1', items: ['F1', 'F2', 'SMOOTH_F1', 'DISTANCE_TO_EDGE', 'N_SPHERE_RADIUS'] },
      normalize: { type: 'boolean', default: false },
    },
  }],
  ['TextureWaveNode', {
    type: 'TextureWaveNode',
    category: 'TEXTURE',
    label: 'Wave Texture',
    inputs: [inp('Vector', S.VECTOR), inp('Scale', S.FLOAT, 5), inp('Distortion', S.FLOAT, 0), inp('Detail', S.FLOAT, 2, 0, 16), inp('Detail Scale', S.FLOAT, 1), inp('Detail Roughness', S.FLOAT, 0.5, 0, 1), inp('Phase', S.FLOAT, 0)],
    outputs: [out('Color', S.COLOR), out('Fac', S.FLOAT)],
    properties: {
      wave_type: { type: 'enum', default: 'BANDS', items: ['BANDS', 'RINGS'] },
      bands_direction: { type: 'enum', default: 'X', items: ['X', 'Y', 'Z', 'DIAGONAL'] },
      rings_direction: { type: 'enum', default: 'X', items: ['X', 'Y', 'Z', 'SPHERICAL'] },
      wave_profile: { type: 'enum', default: 'SIN', items: ['SIN', 'SAW', 'TRI'] },
    },
  }],
  ['TextureWhiteNoiseNode', {
    type: 'TextureWhiteNoiseNode',
    category: 'TEXTURE',
    label: 'White Noise Texture',
    inputs: [inp('Vector', S.VECTOR), inp('W', S.FLOAT, 0)],
    outputs: [out('Value', S.FLOAT), out('Color', S.COLOR)],
    properties: {
      noise_dimensions: { type: 'enum', default: '3D', items: ['1D', '2D', '3D', '4D'] },
    },
  }],
  ['TextureMusgraveNode', {
    type: 'TextureMusgraveNode',
    category: 'TEXTURE',
    label: 'Musgrave Texture',
    inputs: [inp('Vector', S.VECTOR), inp('Scale', S.FLOAT, 5), inp('Detail', S.FLOAT, 2, 0, 16), inp('Dimension', S.FLOAT, 2, 0, 1), inp('Lacunarity', S.FLOAT, 2), inp('Offset', S.FLOAT, 0), inp('Gain', S.FLOAT, 1)],
    outputs: [out('Fac', S.FLOAT)],
    properties: {
      musgrave_dimensions: { type: 'enum', default: '3D', items: ['1D', '2D', '3D', '4D'] },
      musgrave_type: { type: 'enum', default: 'FBM', items: ['MULTIFRACTAL', 'FBM', 'RIDGED_MULTIFRACTAL', 'HYBRID_MULTIFRACTAL', 'HETERO_TERRAIN'] },
    },
  }],
  ['TextureGaborNode', {
    type: 'TextureGaborNode',
    category: 'TEXTURE',
    label: 'Gabor Noise',
    inputs: [inp('Vector', S.VECTOR), inp('Scale', S.FLOAT, 5), inp('Frequency', S.FLOAT, 2), inp('Anisotropy', S.FLOAT, 1, 0, 1), inp('Orientation', S.VECTOR), inp('Seed', S.INTEGER, 0)],
    outputs: [out('Fac', S.FLOAT), out('Color', S.COLOR)],
    properties: {
      gabor_type: { type: 'enum', default: '2D', items: ['2D', '3D'] },
    },
  }],

  // ========================================================================
  // VECTOR
  // ========================================================================
  ['VectorMathNode', {
    type: 'VectorMathNode',
    category: 'VECTOR',
    label: 'Vector Math',
    inputs: [inp('Vector', S.VECTOR), inp('Vector 2', S.VECTOR), inp('Vector 3', S.VECTOR), inp('Scale', S.FLOAT, 1)],
    outputs: [out('Vector', S.VECTOR), out('Value', S.FLOAT)],
    properties: {
      operation: { type: 'enum', default: 'ADD', items: ['ADD','SUBTRACT','MULTIPLY','DIVIDE','MULTIPLY_ADD','CROSS_PRODUCT','PROJECT','REFLECT','REFRACT','FACEFORWARD','DOT_PRODUCT','DISTANCE','LENGTH','SCALE','NORMALIZE','ABSOLUTE','MINIMUM','MAXIMUM','FLOOR','CEIL','FRACTION','MODULO','WRAP','SINE','COSINE','TANGENT','SNAP','FLOOR','CEIL','WRAP'] },
    },
  }],
  ['VectorRotateNode', {
    type: 'VectorRotateNode',
    category: 'VECTOR',
    label: 'Vector Rotate',
    inputs: [inp('Vector', S.VECTOR), inp('Center', S.VECTOR), inp('Axis', S.VECTOR, { x: 0, y: 0, z: 1 }), inp('Angle', S.FLOAT, 0), inp('Rotation', S.VECTOR)],
    outputs: [out('Vector', S.VECTOR)],
    properties: {
      rotation_type: { type: 'enum', default: 'AXIS_ANGLE', items: ['AXIS_ANGLE', 'X_AXIS', 'Y_AXIS', 'Z_AXIS', 'EULER_XYZ'] },
      invert: { type: 'boolean', default: false },
    },
  }],
  ['VectorTransformNode', {
    type: 'VectorTransformNode',
    category: 'VECTOR',
    label: 'Vector Transform',
    inputs: [inp('Vector', S.VECTOR)],
    outputs: [out('Vector', S.VECTOR)],
    properties: {
      convert_from: { type: 'enum', default: 'WORLD', items: ['WORLD', 'OBJECT', 'CAMERA'] },
      convert_to: { type: 'enum', default: 'OBJECT', items: ['WORLD', 'OBJECT', 'CAMERA'] },
      vector_type: { type: 'enum', default: 'VECTOR', items: ['VECTOR', 'POINT', 'NORMAL'] },
    },
  }],
  ['NormalMapNode', {
    type: 'NormalMapNode',
    category: 'VECTOR',
    label: 'Normal Map',
    inputs: [inp('Strength', S.FLOAT, 1, 0, 10), inp('Color', S.COLOR, { r: 0.5, g: 0.5, b: 1, a: 1 })],
    outputs: [out('Normal', S.VECTOR)],
    properties: {
      space: { type: 'enum', default: 'TANGENT', items: ['TANGENT', 'OBJECT', 'WORLD', 'BLENDER_OBJECT', 'BLENDER_WORLD'] },
      uv_map: { type: 'string', default: '' },
    },
  }],
  ['NormalNode', {
    type: 'NormalNode',
    category: 'VECTOR',
    label: 'Normal',
    inputs: [],
    outputs: [out('Normal', S.VECTOR), out('Dot', S.FLOAT)],
    properties: {
      output: { type: 'vector', default: [0, 0, 1] },
    },
  }],
  ['TangentNode', {
    type: 'TangentNode',
    category: 'VECTOR',
    label: 'Tangent',
    inputs: [],
    outputs: [out('Tangent', S.VECTOR)],
    properties: {
      direction_type: { type: 'enum', default: 'RADIAL', items: ['RADIAL', 'UV_MAP'] },
      axis: { type: 'enum', default: 'Z', items: ['X', 'Y', 'Z'] },
      uv_map: { type: 'string', default: '' },
    },
  }],
  ['TrueNormalNode', {
    type: 'TrueNormalNode',
    category: 'VECTOR',
    label: 'True Normal',
    inputs: [],
    outputs: [out('Normal', S.VECTOR)],
    properties: {},
  }],
  ['GeometryNode', {
    type: 'GeometryNode',
    category: 'SHADER_INPUT',
    label: 'Geometry',
    inputs: [],
    outputs: [out('Position', S.VECTOR), out('Normal', S.VECTOR), out('Tangent', S.VECTOR), out('True Normal', S.VECTOR), out('Incoming', S.VECTOR), out('Parametric', S.VECTOR), out('Backfacing', S.BOOLEAN), out('Pointiness', S.FLOAT), out('Random Per Island', S.FLOAT)],
    properties: {},
  }],
  ['HairInfoNode', {
    type: 'HairInfoNode',
    category: 'SHADER_INPUT',
    label: 'Hair Info',
    inputs: [],
    outputs: [out('Is Strand', S.BOOLEAN), out('Intercept', S.FLOAT), out('Length', S.FLOAT), out('Thickness', S.FLOAT), out('Tangent Normal', S.VECTOR), out('Random', S.FLOAT)],
    properties: {},
  }],
  ['ParticleInfoNode', {
    type: 'ParticleInfoNode',
    category: 'SHADER_INPUT',
    label: 'Particle Info',
    inputs: [],
    outputs: [out('Index', S.FLOAT), out('Random', S.FLOAT), out('Age', S.FLOAT), out('Lifetime', S.FLOAT), out('Location', S.VECTOR), out('Size', S.FLOAT), out('Velocity', S.VECTOR), out('Angular Velocity', S.VECTOR)],
    properties: {},
  }],
  ['WireframeNode', {
    type: 'WireframeNode',
    category: 'SHADER_INPUT',
    label: 'Wireframe',
    inputs: [inp('Size', S.FLOAT, 0.01, 0)],
    outputs: [out('Fac', S.FLOAT)],
    properties: {
      use_pixel_size: { type: 'boolean', default: false },
    },
  }],
  ['WavelengthNode', {
    type: 'WavelengthNode',
    category: 'SHADER_INPUT',
    label: 'Wavelength',
    inputs: [inp('Wavelength', S.FLOAT, 500, 380, 780)],
    outputs: [out('Color', S.COLOR)],
    properties: {},
  }],
  ['LightPathNode', {
    type: 'LightPathNode',
    category: 'SHADER_INPUT',
    label: 'Light Path',
    inputs: [],
    outputs: [out('Is Camera Ray', S.FLOAT), out('Is Shadow Ray', S.FLOAT), out('Is Diffuse Ray', S.FLOAT), out('Is Glossy Ray', S.FLOAT), out('Is Singular Ray', S.FLOAT), out('Is Reflection Ray', S.FLOAT), out('Is Transmission Ray', S.FLOAT), out('Ray Length', S.FLOAT), out('Ray Depth', S.FLOAT), out('Diffuse Depth', S.FLOAT), out('Glossy Depth', S.FLOAT), out('Transparent Depth', S.FLOAT), out('Transmission Depth', S.FLOAT)],
    properties: {},
  }],
  ['ShaderObjectInfoNode', {
    type: 'ShaderObjectInfoNode',
    category: 'SHADER_INPUT',
    label: 'Object Info',
    inputs: [],
    outputs: [out('Location', S.VECTOR), out('Color', S.COLOR), out('Object Index', S.FLOAT), out('Material Index', S.FLOAT), out('Random', S.FLOAT)],
    properties: {},
  }],
  ['ParticleInfoShaderNode', {
    type: 'ParticleInfoShaderNode',
    category: 'SHADER_INPUT',
    label: 'Particle Info (Shader)',
    inputs: [],
    outputs: [out('Index', S.FLOAT), out('Age', S.FLOAT), out('Lifetime', S.FLOAT), out('Location', S.VECTOR), out('Size', S.FLOAT), out('Velocity', S.VECTOR)],
    properties: {},
  }],
  ['LayerWeightNode', {
    type: 'LayerWeightNode',
    category: 'SHADER_INPUT',
    label: 'Layer Weight',
    inputs: [inp('Blend', S.FLOAT, 0.5, 0, 1), inp('Normal', S.VECTOR)],
    outputs: [out('Fresnel', S.FLOAT), out('Facing', S.FLOAT)],
    properties: {},
  }],
  ['UVMapShaderNode', {
    type: 'UVMapShaderNode',
    category: 'SHADER_INPUT',
    label: 'UV Map (Shader)',
    inputs: [],
    outputs: [out('UV', S.VECTOR)],
    properties: {
      uv_map: { type: 'string', default: '' },
      from_instancer: { type: 'boolean', default: false },
    },
  }],
  ['TextureCoordShaderNode', {
    type: 'TextureCoordShaderNode',
    category: 'SHADER_INPUT',
    label: 'Texture Coordinate (Shader)',
    inputs: [],
    outputs: [out('Generated', S.VECTOR), out('Normal', S.VECTOR), out('UV', S.VECTOR), out('Object', S.VECTOR), out('Camera', S.VECTOR), out('Window', S.VECTOR), out('Reflection', S.VECTOR)],
    properties: {
      from_instancer: { type: 'boolean', default: false },
    },
  }],
  ['BevelNode', {
    type: 'BevelNode',
    category: 'SHADER_INPUT',
    label: 'Bevel',
    inputs: [inp('Radius', S.FLOAT, 0.05, 0), inp('Normal', S.VECTOR)],
    outputs: [out('Normal', S.VECTOR)],
    properties: {
      samples: { type: 'int', default: 4, min: 1, max: 128 },
    },
  }],
  ['CameraDataNode', {
    type: 'CameraDataNode',
    category: 'SHADER_INPUT',
    label: 'Camera Data',
    inputs: [],
    outputs: [out('View Vector', S.VECTOR), out('View Z Depth', S.FLOAT), out('View Distance', S.FLOAT), out('Pixel Coordinate', S.VECTOR)],
    properties: {},
  }],
  ['NewGeometryNode', {
    type: 'NewGeometryNode',
    category: 'SHADER_INPUT',
    label: 'Geometry (Shader)',
    inputs: [],
    outputs: [out('Position', S.VECTOR), out('Normal', S.VECTOR), out('Tangent', S.VECTOR), out('True Normal', S.VECTOR), out('Incoming', S.VECTOR), out('Parametric', S.VECTOR), out('Backfacing', S.BOOLEAN), out('Pointiness', S.FLOAT)],
    properties: {},
  }],
  ['JoinGeometryShaderNode', {
    type: 'JoinGeometryShaderNode',
    category: 'SHADER',
    label: 'Add Shader',
    inputs: [inp('Shader', S.SHADER), inp('Shader 2', S.SHADER)],
    outputs: [out('Shader', S.SHADER)],
    properties: {},
  }],
  ['MeshInfoNode', {
    type: 'MeshInfoNode',
    category: 'SHADER_INPUT',
    label: 'Mesh Info',
    inputs: [],
    outputs: [out('Area', S.FLOAT), out('Is Smooth', S.BOOLEAN)],
    properties: {},
  }],
  ['MaterialInfoNode', {
    type: 'MaterialInfoNode',
    category: 'SHADER_INPUT',
    label: 'Material Info',
    inputs: [],
    outputs: [out('Color', S.COLOR), out('Roughness', S.FLOAT), out('Metallic', S.FLOAT), out('Alpha', S.FLOAT)],
    properties: {},
  }],
  ['ValueShaderNode', {
    type: 'ValueShaderNode',
    category: 'SHADER_INPUT',
    label: 'Value (Shader)',
    inputs: [],
    outputs: [out('Value', S.FLOAT)],
    properties: {
      default_value: { type: 'float', default: 0 },
    },
  }],
  ['TexCoordNode', {
    type: 'TexCoordNode',
    category: 'SHADER_INPUT',
    label: 'Texture Coordinate',
    inputs: [],
    outputs: [out('Generated', S.VECTOR), out('Normal', S.VECTOR), out('UV', S.VECTOR), out('Object', S.VECTOR), out('Camera', S.VECTOR), out('Window', S.VECTOR), out('Reflection', S.VECTOR)],
    properties: {
      from_instancer: { type: 'boolean', default: false },
    },
  }],
  ['ObjectIndexNode', {
    type: 'ObjectIndexNode',
    category: 'SHADER_INPUT',
    label: 'Object Index',
    inputs: [],
    outputs: [out('Index', S.INTEGER)],
    properties: {},
  }],
  ['MaterialIndexShaderNode', {
    type: 'MaterialIndexShaderNode',
    category: 'SHADER_INPUT',
    label: 'Material Index (Shader)',
    inputs: [],
    outputs: [out('Index', S.FLOAT)],
    properties: {},
  }],
  ['RandomPerIslandNode', {
    type: 'RandomPerIslandNode',
    category: 'SHADER_INPUT',
    label: 'Random Per Island',
    inputs: [],
    outputs: [out('Value', S.FLOAT)],
    properties: {},
  }],
  // Ray type shader input nodes
  ['IsCameraRayNode', {
    type: 'IsCameraRayNode',
    category: 'SHADER_INPUT',
    label: 'Is Camera Ray',
    inputs: [],
    outputs: [out('Value', S.BOOLEAN)],
    properties: {},
  }],
  ['IsShadowRayNode', {
    type: 'IsShadowRayNode',
    category: 'SHADER_INPUT',
    label: 'Is Shadow Ray',
    inputs: [],
    outputs: [out('Value', S.BOOLEAN)],
    properties: {},
  }],
  ['IsDiffuseRayNode', {
    type: 'IsDiffuseRayNode',
    category: 'SHADER_INPUT',
    label: 'Is Diffuse Ray',
    inputs: [],
    outputs: [out('Value', S.BOOLEAN)],
    properties: {},
  }],
  ['IsGlossyRayNode', {
    type: 'IsGlossyRayNode',
    category: 'SHADER_INPUT',
    label: 'Is Glossy Ray',
    inputs: [],
    outputs: [out('Value', S.BOOLEAN)],
    properties: {},
  }],
  ['IsTransmissionRayNode', {
    type: 'IsTransmissionRayNode',
    category: 'SHADER_INPUT',
    label: 'Is Transmission Ray',
    inputs: [],
    outputs: [out('Value', S.BOOLEAN)],
    properties: {},
  }],
  ['IsVolumeRayNode', {
    type: 'IsVolumeRayNode',
    category: 'SHADER_INPUT',
    label: 'Is Volume Ray',
    inputs: [],
    outputs: [out('Value', S.BOOLEAN)],
    properties: {},
  }],
  ['IsReflectionRayNode', {
    type: 'IsReflectionRayNode',
    category: 'SHADER_INPUT',
    label: 'Is Reflection Ray',
    inputs: [],
    outputs: [out('Value', S.BOOLEAN)],
    properties: {},
  }],
  ['IsRefractionRayNode', {
    type: 'IsRefractionRayNode',
    category: 'SHADER_INPUT',
    label: 'Is Refraction Ray',
    inputs: [],
    outputs: [out('Value', S.BOOLEAN)],
    properties: {},
  }],
  ['RayDepthNode', {
    type: 'RayDepthNode',
    category: 'SHADER_INPUT',
    label: 'Ray Depth',
    inputs: [],
    outputs: [out('Value', S.INTEGER)],
    properties: {},
  }],
  ['RayLengthNode', {
    type: 'RayLengthNode',
    category: 'SHADER_INPUT',
    label: 'Ray Length',
    inputs: [],
    outputs: [out('Value', S.FLOAT)],
    properties: {},
  }],

  // ========================================================================
  // OUTPUT
  // ========================================================================
  ['GroupOutputNode', {
    type: 'GroupOutputNode',
    category: 'OUTPUT',
    label: 'Group Output',
    inputs: [], // Dynamic – populated from group interface
    outputs: [],
    properties: {
      is_active_output: { type: 'boolean', default: true },
    },
  }],
  ['MaterialOutputNode', {
    type: 'MaterialOutputNode',
    category: 'SHADER_OUTPUT',
    label: 'Material Output',
    inputs: [inp('Surface', S.SHADER), inp('Volume', S.SHADER), inp('Displacement', S.VECTOR)],
    outputs: [],
    properties: {
      is_active_output: { type: 'boolean', default: true },
      target: { type: 'enum', default: 'ALL', items: ['ALL', 'EEVEE', 'CYCLES'] },
    },
  }],
  ['ViewerNode', {
    type: 'ViewerNode',
    category: 'OUTPUT',
    label: 'Viewer',
    inputs: [inp('Geometry', S.GEOMETRY)],
    outputs: [],
    properties: {},
  }],
  ['CompositeNode', {
    type: 'CompositeNode',
    category: 'OUTPUT',
    label: 'Composite',
    inputs: [inp('Image', S.COLOR), inp('Alpha', S.FLOAT)],
    outputs: [],
    properties: {
      is_active_output: { type: 'boolean', default: true },
      use_alpha: { type: 'boolean', default: false },
    },
  }],
  ['ViewLevelNode', {
    type: 'ViewLevelNode',
    category: 'OUTPUT',
    label: 'View Level',
    inputs: [inp('Geometry', S.GEOMETRY)],
    outputs: [],
    properties: {},
  }],
  ['SplitViewerNode', {
    type: 'SplitViewerNode',
    category: 'OUTPUT',
    label: 'Split Viewer',
    inputs: [inp('Image', S.COLOR), inp('Alpha', S.FLOAT)],
    outputs: [],
    properties: {},
  }],
  ['DepthOutputNode', {
    type: 'DepthOutputNode',
    category: 'OUTPUT',
    label: 'Depth Output',
    inputs: [inp('Depth', S.FLOAT)],
    outputs: [],
    properties: {},
  }],
  ['NormalOutputNode', {
    type: 'NormalOutputNode',
    category: 'OUTPUT',
    label: 'Normal Output',
    inputs: [inp('Normal', S.VECTOR)],
    outputs: [],
    properties: {},
  }],
  ['AOOutputNode', {
    type: 'AOOutputNode',
    category: 'OUTPUT',
    label: 'AO Output',
    inputs: [inp('AO', S.FLOAT)],
    outputs: [],
    properties: {},
  }],
  ['EmissionOutputNode', {
    type: 'EmissionOutputNode',
    category: 'OUTPUT',
    label: 'Emission Output',
    inputs: [inp('Emission', S.COLOR)],
    outputs: [],
    properties: {},
  }],
  ['AlbedoOutputNode', {
    type: 'AlbedoOutputNode',
    category: 'OUTPUT',
    label: 'Albedo Output',
    inputs: [inp('Color', S.COLOR)],
    outputs: [],
    properties: {},
  }],
  ['DiffuseOutputNode', {
    type: 'DiffuseOutputNode',
    category: 'OUTPUT',
    label: 'Diffuse Output',
    inputs: [inp('Color', S.COLOR)],
    outputs: [],
    properties: {},
  }],
  ['GlossyOutputNode', {
    type: 'GlossyOutputNode',
    category: 'OUTPUT',
    label: 'Glossy Output',
    inputs: [inp('Color', S.COLOR)],
    outputs: [],
    properties: {},
  }],
  ['TransmissionOutputNode', {
    type: 'TransmissionOutputNode',
    category: 'OUTPUT',
    label: 'Transmission Output',
    inputs: [inp('Color', S.COLOR)],
    outputs: [],
    properties: {},
  }],
  ['VolumeOutputNode', {
    type: 'VolumeOutputNode',
    category: 'OUTPUT',
    label: 'Volume Output',
    inputs: [inp('Volume', S.SHADER)],
    outputs: [],
    properties: {},
  }],
  ['ShadowOutputNode', {
    type: 'ShadowOutputNode',
    category: 'OUTPUT',
    label: 'Shadow Output',
    inputs: [inp('Shadow', S.FLOAT)],
    outputs: [],
    properties: {},
  }],
  ['CryptomatteOutputNode', {
    type: 'CryptomatteOutputNode',
    category: 'OUTPUT',
    label: 'Cryptomatte Output',
    inputs: [inp('Image', S.COLOR)],
    outputs: [],
    properties: {},
  }],
  ['CryptomatteMatteOutputNode', {
    type: 'CryptomatteMatteOutputNode',
    category: 'OUTPUT',
    label: 'Cryptomatte Matte Output',
    inputs: [inp('Image', S.COLOR)],
    outputs: [],
    properties: {},
  }],
  ['FileOutputNode', {
    type: 'FileOutputNode',
    category: 'OUTPUT',
    label: 'File Output',
    inputs: [], // Dynamic – file slots
    outputs: [],
    properties: {
      base_path: { type: 'string', default: '' },
      file_slots: { type: 'string', default: '' },
    },
  }],
  ['ImageOutputNode', {
    type: 'ImageOutputNode',
    category: 'OUTPUT',
    label: 'Image Output',
    inputs: [inp('Image', S.COLOR)],
    outputs: [],
    properties: {},
  }],
  ['MovieOutputNode', {
    type: 'MovieOutputNode',
    category: 'OUTPUT',
    label: 'Movie Output',
    inputs: [inp('Image', S.COLOR)],
    outputs: [],
    properties: {},
  }],
  ['SoundOutputNode', {
    type: 'SoundOutputNode',
    category: 'OUTPUT',
    label: 'Sound Output',
    inputs: [],
    outputs: [],
    properties: {},
  }],
  ['LevelOfDetailNode', {
    type: 'LevelOfDetailNode',
    category: 'OUTPUT',
    label: 'Level of Detail',
    inputs: [inp('Geometry', S.GEOMETRY)],
    outputs: [out('Geometry', S.GEOMETRY)],
    properties: {},
  }],
  ['RenderLayerNode', {
    type: 'RenderLayerNode',
    category: 'OUTPUT',
    label: 'Render Layers',
    inputs: [],
    outputs: [out('Image', S.COLOR), out('Alpha', S.FLOAT), out('Depth', S.FLOAT)],
    properties: {},
  }],
  ['UVOutputNode', {
    type: 'UVOutputNode',
    category: 'OUTPUT',
    label: 'UV Output',
    inputs: [inp('UV', S.VECTOR)],
    outputs: [],
    properties: {},
  }],
  ['InstanceOutputNode', {
    type: 'InstanceOutputNode',
    category: 'OUTPUT',
    label: 'Instance Output',
    inputs: [inp('Instances', S.INSTANCES)],
    outputs: [],
    properties: {},
  }],
  ['PointCloudOutputNode', {
    type: 'PointCloudOutputNode',
    category: 'OUTPUT',
    label: 'Point Cloud Output',
    inputs: [inp('Points', S.POINTS)],
    outputs: [],
    properties: {},
  }],
  ['TextOutputNode', {
    type: 'TextOutputNode',
    category: 'OUTPUT',
    label: 'Text Output',
    inputs: [inp('Text', S.STRING)],
    outputs: [],
    properties: {},
  }],
  ['BoundingBoxOutputNode', {
    type: 'BoundingBoxOutputNode',
    category: 'OUTPUT',
    label: 'Bounding Box Output',
    inputs: [inp('Geometry', S.GEOMETRY)],
    outputs: [],
    properties: {},
  }],
  ['WireframeOutputNode', {
    type: 'WireframeOutputNode',
    category: 'OUTPUT',
    label: 'Wireframe Output',
    inputs: [inp('Fac', S.FLOAT)],
    outputs: [],
    properties: {},
  }],
  ['DebugOutputNode', {
    type: 'DebugOutputNode',
    category: 'OUTPUT',
    label: 'Debug Output',
    inputs: [inp('Value', S.ANY)],
    outputs: [],
    properties: {},
  }],

  // ========================================================================
  // LIGHT
  // ========================================================================
  ['PointLightNode', {
    type: 'PointLightNode',
    category: 'SHADER',
    label: 'Point Light',
    inputs: [inp('Color', S.COLOR, { r: 1, g: 1, b: 1, a: 1 }), inp('Strength', S.FLOAT, 100, 0), inp('Radius', S.FLOAT, 0.25, 0)],
    outputs: [out('Light', S.LIGHT)],
    properties: {},
  }],
  ['SpotLightNode', {
    type: 'SpotLightNode',
    category: 'SHADER',
    label: 'Spot Light',
    inputs: [inp('Color', S.COLOR, { r: 1, g: 1, b: 1, a: 1 }), inp('Strength', S.FLOAT, 100, 0), inp('Radius', S.FLOAT, 0.25, 0), inp('Angle', S.FLOAT, 45, 0, 90), inp('Blend', S.FLOAT, 0.15, 0, 1)],
    outputs: [out('Light', S.LIGHT)],
    properties: {},
  }],
  ['SunLightNode', {
    type: 'SunLightNode',
    category: 'SHADER',
    label: 'Sun Light',
    inputs: [inp('Color', S.COLOR, { r: 1, g: 1, b: 1, a: 1 }), inp('Strength', S.FLOAT, 1, 0), inp('Angle', S.FLOAT, 0.5, 0, 180)],
    outputs: [out('Light', S.LIGHT)],
    properties: {},
  }],
  ['AreaLightNode', {
    type: 'AreaLightNode',
    category: 'SHADER',
    label: 'Area Light',
    inputs: [inp('Color', S.COLOR, { r: 1, g: 1, b: 1, a: 1 }), inp('Strength', S.FLOAT, 100, 0), inp('Width', S.FLOAT, 1, 0), inp('Height', S.FLOAT, 1, 0)],
    outputs: [out('Light', S.LIGHT)],
    properties: {
      shape: { type: 'enum', default: 'RECTANGLE', items: ['RECTANGLE', 'SQUARE', 'DISK', 'ELLIPSE'] },
    },
  }],
  ['LightFalloffNode', {
    type: 'LightFalloffNode',
    category: 'SHADER',
    label: 'Light Falloff',
    inputs: [inp('Strength', S.FLOAT, 100, 0), inp('Smooth', S.FLOAT, 0, 0)],
    outputs: [out('Quadratic', S.FLOAT), out('Linear', S.FLOAT), out('Constant', S.FLOAT)],
    properties: {},
  }],
  ['LightAttenuationNode', {
    type: 'LightAttenuationNode',
    category: 'SHADER',
    label: 'Light Attenuation',
    inputs: [inp('Distance', S.FLOAT, 1, 0), inp('Quadratic', S.FLOAT, 1), inp('Linear', S.FLOAT, 0), inp('Constant', S.FLOAT, 0)],
    outputs: [out('Value', S.FLOAT)],
    properties: {},
  }],

  // ========================================================================
  // BOOLEAN (MESH)
  // ========================================================================
  ['BooleanUnionNode', {
    type: 'BooleanUnionNode',
    category: 'MESH',
    label: 'Boolean Union',
    inputs: [inp('Mesh 1', S.GEOMETRY), inp('Mesh 2', S.GEOMETRY), inp('Self Intersection', S.BOOLEAN, false), inp('Hole Tolerant', S.BOOLEAN, false)],
    outputs: [out('Mesh', S.MESH)],
    properties: {
      operation: { type: 'enum', default: 'UNION', items: ['UNION'] },
      solver: { type: 'enum', default: 'EXACT', items: ['EXACT', 'FAST'] },
    },
  }],
  ['BooleanIntersectNode', {
    type: 'BooleanIntersectNode',
    category: 'MESH',
    label: 'Boolean Intersect',
    inputs: [inp('Mesh 1', S.GEOMETRY), inp('Mesh 2', S.GEOMETRY), inp('Self Intersection', S.BOOLEAN, false), inp('Hole Tolerant', S.BOOLEAN, false)],
    outputs: [out('Mesh', S.MESH)],
    properties: {
      operation: { type: 'enum', default: 'INTERSECT', items: ['INTERSECT'] },
      solver: { type: 'enum', default: 'EXACT', items: ['EXACT', 'FAST'] },
    },
  }],
  ['BooleanDifferenceNode', {
    type: 'BooleanDifferenceNode',
    category: 'MESH',
    label: 'Boolean Difference',
    inputs: [inp('Mesh 1', S.GEOMETRY), inp('Mesh 2', S.GEOMETRY), inp('Self Intersection', S.BOOLEAN, false), inp('Hole Tolerant', S.BOOLEAN, false)],
    outputs: [out('Mesh', S.MESH)],
    properties: {
      operation: { type: 'enum', default: 'DIFFERENCE', items: ['DIFFERENCE'] },
      solver: { type: 'enum', default: 'EXACT', items: ['EXACT', 'FAST'] },
    },
  }],

  // ========================================================================
  // EXTENDED VECTOR / MATH / CONVERTER
  // ========================================================================
  ['CombineXYZNode', {
    type: 'CombineXYZNode',
    category: 'CONVERTER',
    label: 'Combine XYZ',
    inputs: [inp('X', S.FLOAT, 0), inp('Y', S.FLOAT, 0), inp('Z', S.FLOAT, 0)],
    outputs: [out('Vector', S.VECTOR)],
    properties: {},
  }],
  ['SeparateXYZNode', {
    type: 'SeparateXYZNode',
    category: 'CONVERTER',
    label: 'Separate XYZ',
    inputs: [inp('Vector', S.VECTOR)],
    outputs: [out('X', S.FLOAT), out('Y', S.FLOAT), out('Z', S.FLOAT)],
    properties: {},
  }],
  ['NormalizeNode', {
    type: 'NormalizeNode',
    category: 'CONVERTER',
    label: 'Normalize',
    inputs: [inp('Vector', S.VECTOR)],
    outputs: [out('Vector', S.VECTOR)],
    properties: {},
  }],
  ['MappingNode', {
    type: 'MappingNode',
    category: 'VECTOR',
    label: 'Mapping',
    inputs: [inp('Vector', S.VECTOR), inp('Location', S.VECTOR), inp('Rotation', S.VECTOR), inp('Scale', S.VECTOR, { x: 1, y: 1, z: 1 })],
    outputs: [out('Vector', S.VECTOR)],
    properties: {
      vector_type: { type: 'enum', default: 'POINT', items: ['POINT', 'TEXTURE', 'VECTOR', 'NORMAL'] },
    },
  }],
  ['AlignEulerToVectorNode', {
    type: 'AlignEulerToVectorNode',
    category: 'VECTOR',
    label: 'Align Euler to Vector',
    inputs: [inp('Rotation', S.VECTOR), inp('Factor', S.FLOAT, 1, 0, 1), inp('Vector', S.VECTOR)],
    outputs: [out('Rotation', S.VECTOR)],
    properties: {
      axis: { type: 'enum', default: 'Z', items: ['X', 'Y', 'Z'] },
      pivot_axis: { type: 'enum', default: 'AUTO', items: ['AUTO', 'X', 'Y', 'Z'] },
    },
  }],
  ['RotateEulerNode', {
    type: 'RotateEulerNode',
    category: 'VECTOR',
    label: 'Rotate Euler',
    inputs: [inp('Rotation', S.VECTOR), inp('Rotate By', S.VECTOR), inp('Axis', S.VECTOR), inp('Angle', S.FLOAT, 0)],
    outputs: [out('Rotation', S.VECTOR)],
    properties: {
      type: { type: 'enum', default: 'EULER', items: ['EULER', 'AXIS_ANGLE'] },
      space: { type: 'enum', default: 'OBJECT', items: ['OBJECT', 'LOCAL'] },
    },
  }],
  ['BumpNode', {
    type: 'BumpNode',
    category: 'VECTOR',
    label: 'Bump',
    inputs: [inp('Strength', S.FLOAT, 1, 0, 10), inp('Distance', S.FLOAT, 1, 0), inp('Height', S.FLOAT, 1), inp('Normal', S.VECTOR)],
    outputs: [out('Normal', S.VECTOR)],
    properties: {
      invert: { type: 'boolean', default: false },
      normalize: { type: 'boolean', default: false },
    },
  }],
  ['DisplacementNode', {
    type: 'DisplacementNode',
    category: 'VECTOR',
    label: 'Displacement',
    inputs: [inp('Height', S.FLOAT, 0), inp('Midlevel', S.FLOAT, 0.5, 0, 1), inp('Scale', S.FLOAT, 1, 0), inp('Normal', S.VECTOR)],
    outputs: [out('Displacement', S.VECTOR)],
    properties: {
      space: { type: 'enum', default: 'TANGENT', items: ['TANGENT', 'OBJECT'] },
    },
  }],
  ['QuaternionNode', {
    type: 'QuaternionNode',
    category: 'VECTOR',
    label: 'Quaternion',
    inputs: [inp('W', S.FLOAT, 1), inp('X', S.FLOAT, 0), inp('Y', S.FLOAT, 0), inp('Z', S.FLOAT, 0)],
    outputs: [out('Quaternion', S.QUATERNION)],
    properties: {},
  }],
  ['MatrixTransformNode', {
    type: 'MatrixTransformNode',
    category: 'VECTOR',
    label: 'Matrix Transform',
    inputs: [inp('Matrix', S.MATRIX), inp('Vector', S.VECTOR)],
    outputs: [out('Vector', S.VECTOR)],
    properties: {},
  }],
  ['DirectionToPointNode', {
    type: 'DirectionToPointNode',
    category: 'VECTOR',
    label: 'Direction to Point',
    inputs: [inp('Direction', S.VECTOR), inp('Distance', S.FLOAT, 1)],
    outputs: [out('Point', S.VECTOR)],
    properties: {},
  }],
  ['ReflectNode', {
    type: 'ReflectNode',
    category: 'VECTOR',
    label: 'Reflect',
    inputs: [inp('Vector', S.VECTOR), inp('Normal', S.VECTOR)],
    outputs: [out('Vector', S.VECTOR)],
    properties: {},
  }],
  ['RefractNode', {
    type: 'RefractNode',
    category: 'VECTOR',
    label: 'Refract',
    inputs: [inp('Vector', S.VECTOR), inp('Normal', S.VECTOR), inp('IOR', S.FLOAT, 1.5)],
    outputs: [out('Vector', S.VECTOR)],
    properties: {},
  }],
  ['FaceForwardNode', {
    type: 'FaceForwardNode',
    category: 'VECTOR',
    label: 'Face Forward',
    inputs: [inp('Vector', S.VECTOR), inp('Incident', S.VECTOR), inp('Reference', S.VECTOR)],
    outputs: [out('Vector', S.VECTOR)],
    properties: {},
  }],
  ['WrapNode', {
    type: 'WrapNode',
    category: 'CONVERTER',
    label: 'Wrap',
    inputs: [inp('Value', S.FLOAT, 0), inp('Min', S.FLOAT, 0), inp('Max', S.FLOAT, 1)],
    outputs: [out('Result', S.FLOAT)],
    properties: {},
  }],
  ['SnapNode', {
    type: 'SnapNode',
    category: 'CONVERTER',
    label: 'Snap',
    inputs: [inp('Value', S.FLOAT, 0), inp('Increment', S.FLOAT, 1)],
    outputs: [out('Result', S.FLOAT)],
    properties: {},
  }],
  ['FloorCeilNode', {
    type: 'FloorCeilNode',
    category: 'CONVERTER',
    label: 'Floor/Ceil',
    inputs: [inp('Value', S.FLOAT, 0)],
    outputs: [out('Floor', S.FLOAT), out('Ceil', S.FLOAT)],
    properties: {},
  }],
  ['ModuloNode', {
    type: 'ModuloNode',
    category: 'CONVERTER',
    label: 'Modulo',
    inputs: [inp('Value', S.FLOAT, 0), inp('Divisor', S.FLOAT, 1)],
    outputs: [out('Result', S.FLOAT)],
    properties: {},
  }],
  ['FractionNode', {
    type: 'FractionNode',
    category: 'CONVERTER',
    label: 'Fraction',
    inputs: [inp('Value', S.FLOAT, 0)],
    outputs: [out('Result', S.FLOAT)],
    properties: {},
  }],
  ['AbsoluteNode', {
    type: 'AbsoluteNode',
    category: 'CONVERTER',
    label: 'Absolute',
    inputs: [inp('Value', S.FLOAT, 0)],
    outputs: [out('Result', S.FLOAT)],
    properties: {},
  }],
  ['MinMaxNode', {
    type: 'MinMaxNode',
    category: 'CONVERTER',
    label: 'Min/Max',
    inputs: [inp('Value', S.FLOAT, 0), inp('Value 2', S.FLOAT, 0)],
    outputs: [out('Min', S.FLOAT), out('Max', S.FLOAT)],
    properties: {},
  }],
  ['TrigonometryNode', {
    type: 'TrigonometryNode',
    category: 'CONVERTER',
    label: 'Trigonometry',
    inputs: [inp('Value', S.FLOAT, 0)],
    outputs: [out('Result', S.FLOAT)],
    properties: {
      operation: { type: 'enum', default: 'SINE', items: ['SINE','COSINE','TANGENT','ARCSINE','ARCCOSINE','ARCTANGENT','ARCTAN2','HYPERBOLIC_SINE','HYPERBOLIC_COSINE','HYPERBOLIC_TANGENT'] },
      use_degrees: { type: 'boolean', default: true },
    },
  }],
  ['PowerLogNode', {
    type: 'PowerLogNode',
    category: 'CONVERTER',
    label: 'Power/Log',
    inputs: [inp('Base', S.FLOAT, 2), inp('Exponent', S.FLOAT, 2)],
    outputs: [out('Result', S.FLOAT)],
    properties: {
      operation: { type: 'enum', default: 'POWER', items: ['POWER', 'LOGARITHM', 'SQRT', 'INV_SQRT', 'EXPONENT'] },
    },
  }],
  ['SignNode', {
    type: 'SignNode',
    category: 'CONVERTER',
    label: 'Sign',
    inputs: [inp('Value', S.FLOAT, 0)],
    outputs: [out('Result', S.FLOAT)],
    properties: {},
  }],
  ['CompareNode', {
    type: 'CompareNode',
    category: 'UTILITY',
    label: 'Compare',
    inputs: [inp('A', S.FLOAT, 0), inp('B', S.FLOAT, 0), inp('C', S.FLOAT, 0)],
    outputs: [out('Result', S.BOOLEAN)],
    properties: {
      data_type: { type: 'enum', default: 'FLOAT', items: ['FLOAT', 'INT', 'FLOAT_VECTOR', 'STRING', 'RGBA'] },
      operation: { type: 'enum', default: 'GREATER_THAN', items: ['LESS_THAN','LESS_EQUAL','GREATER_THAN','GREATER_EQUAL','EQUAL','NOT_EQUAL','COLOR_BRIGHTER','COLOR_DARKER'] },
      mode: { type: 'enum', default: 'ELEMENT', items: ['ELEMENT', 'LENGTH', 'AVERAGE', 'DOT_PRODUCT', 'DIRECTION'] },
    },
  }],
  ['SmoothMinMaxNode', {
    type: 'SmoothMinMaxNode',
    category: 'CONVERTER',
    label: 'Smooth Min/Max',
    inputs: [inp('Value', S.FLOAT, 0), inp('Value 2', S.FLOAT, 0), inp('Distance', S.FLOAT, 1)],
    outputs: [out('Result', S.FLOAT)],
    properties: {
      operation: { type: 'enum', default: 'SMOOTH_MIN', items: ['SMOOTH_MIN', 'SMOOTH_MAX'] },
    },
  }],
  ['AngleBetweenNode', {
    type: 'AngleBetweenNode',
    category: 'VECTOR',
    label: 'Angle Between',
    inputs: [inp('Vector A', S.VECTOR), inp('Vector B', S.VECTOR)],
    outputs: [out('Angle', S.FLOAT)],
    properties: {},
  }],
  ['SlerpNode', {
    type: 'SlerpNode',
    category: 'VECTOR',
    label: 'Slerp',
    inputs: [inp('Vector A', S.VECTOR), inp('Vector B', S.VECTOR), inp('Factor', S.FLOAT, 0.5, 0, 1)],
    outputs: [out('Result', S.VECTOR)],
    properties: {},
  }],
  ['PolarToCartNode', {
    type: 'PolarToCartNode',
    category: 'VECTOR',
    label: 'Polar to Cartesian',
    inputs: [inp('Radius', S.FLOAT, 1), inp('Angle', S.FLOAT, 0)],
    outputs: [out('X', S.FLOAT), out('Y', S.FLOAT)],
    properties: {},
  }],
  ['CartToPolarNode', {
    type: 'CartToPolarNode',
    category: 'VECTOR',
    label: 'Cartesian to Polar',
    inputs: [inp('X', S.FLOAT, 0), inp('Y', S.FLOAT, 0)],
    outputs: [out('Radius', S.FLOAT), out('Angle', S.FLOAT)],
    properties: {},
  }],

  // ========================================================================
  // SUBDIVISION
  // ========================================================================
  ['SubdivisionSurfaceNode', {
    type: 'SubdivisionSurfaceNode',
    category: 'MODIFIERS',
    label: 'Subdivision Surface',
    inputs: [inp('Mesh', S.GEOMETRY), inp('Level', S.INTEGER, 2, 0, 6), inp('Edge Crease', S.FLOAT, 0, 0, 1), inp('Vertex Crease', S.FLOAT, 0, 0, 1), inp('UV Smooth', S.BOOLEAN, true)],
    outputs: [out('Mesh', S.MESH)],
    properties: {
      boundary_smooth: { type: 'enum', default: 'PRESERVE_CORNERS', items: ['PRESERVE_CORNERS', 'KEEP_BOUNDARY'] },
      uv_smooth: { type: 'enum', default: 'PRESERVE_BOUNDARIES', items: ['NONE', 'PRESERVE_CORNERS', 'PRESERVE_CORNERS_AND_JUNCTIONS', 'PRESERVE_BOUNDARIES', 'SMOOTH_ALL'] },
    },
  }],

  // ========================================================================
  // ALIAS-ONLY TYPES (unique string values not covered above)
  // ========================================================================
  ['RadiusInputNode', {
    type: 'RadiusInputNode',
    category: 'INPUT',
    label: 'Radius',
    inputs: [],
    outputs: [out('Radius', S.FLOAT)],
    properties: {},
  }],
  ['PrincipledBSDFNode', {
    type: 'PrincipledBSDFNode',
    category: 'SHADER',
    label: 'Principled BSDF',
    inputs: [
      inp('Base Color', S.COLOR, { r: 0.8, g: 0.8, b: 0.8, a: 1 }),
      inp('Metallic', S.FLOAT, 0, 0, 1),
      inp('Roughness', S.FLOAT, 0.5, 0, 1),
      inp('IOR', S.FLOAT, 1.5),
      inp('Alpha', S.FLOAT, 1, 0, 1),
      inp('Normal', S.VECTOR),
      inp('Emission Color', S.COLOR, { r: 0, g: 0, b: 0, a: 1 }),
      inp('Emission Strength', S.FLOAT, 0, 0),
      inp('Coat Weight', S.FLOAT, 0, 0, 1),
      inp('Coat Roughness', S.FLOAT, 0, 0, 1),
      inp('Coat IOR', S.FLOAT, 1.5),
      inp('Coat Normal', S.VECTOR),
      inp('Coat Tint', S.COLOR, { r: 1, g: 1, b: 1, a: 1 }),
      inp('Sheen Weight', S.FLOAT, 0, 0, 1),
      inp('Sheen Roughness', S.FLOAT, 0.5, 0, 1),
      inp('Sheen Tint', S.COLOR, { r: 1, g: 1, b: 1, a: 1 }),
      inp('Subsurface Weight', S.FLOAT, 0, 0, 1),
      inp('Subsurface Scale', S.FLOAT, 0.05, 0),
      inp('Subsurface IOR', S.FLOAT, 1.4),
      inp('Subsurface Anisotropy', S.FLOAT, 0, -1, 1),
      inp('Subsurface Radius', S.VECTOR, { x: 1, y: 0.2, z: 0.1 }),
      inp('Transmission Weight', S.FLOAT, 0, 0, 1),
      inp('Specular IOR Level', S.FLOAT, 0.5, 0, 1),
      inp('Specular Tint', S.COLOR, { r: 1, g: 1, b: 1, a: 1 }),
      inp('Tangent', S.VECTOR),
      inp('Anisotropic', S.FLOAT, 0, 0, 1),
      inp('Anisotropic Rotation', S.FLOAT, 0, 0, 1),
      inp('Clearcoat', S.FLOAT, 0, 0, 1),
      inp('Clearcoat Roughness', S.FLOAT, 0, 0, 1),
      inp('Clearcoat Normal', S.VECTOR),
      inp('IOR Level', S.FLOAT, 0.5, 0, 1),
    ],
    outputs: [out('BSDF', S.SHADER)],
    properties: {
      distribution: { type: 'enum', default: 'MULTI_GGX', items: ['MULTI_GGX', 'GGX'] },
      subsurface_method: { type: 'enum', default: 'RANDOM_WALK', items: ['RANDOM_WALK', 'BURLEY', 'RANDOM_WALK_FIXED_RADIUS'] },
    },
  }],
  ['InvertNode', {
    type: 'InvertNode',
    category: 'COLOR',
    label: 'Invert',
    inputs: [inp('Fac', S.FLOAT, 1, 0, 1), inp('Color', S.COLOR, { r: 0.5, g: 0.5, b: 0.5, a: 1 })],
    outputs: [out('Color', S.COLOR)],
    properties: {},
  }],
  ['BooleanMathNode', {
    type: 'BooleanMathNode',
    category: 'UTILITY',
    label: 'Boolean Math',
    inputs: [inp('Boolean', S.BOOLEAN), inp('Boolean 2', S.BOOLEAN)],
    outputs: [out('Result', S.BOOLEAN)],
    properties: {
      operation: { type: 'enum', default: 'AND', items: ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XNOR', 'XOR', 'IMPLY', 'NIMPLY'] },
    },
  }],
];

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

class NodeDefinitionRegistry {
  private definitions: Map<string, NodeDefinitionEntry>;

  constructor() {
    this.definitions = new Map();
    for (const [type, entry] of definitions) {
      this.definitions.set(type, entry);
    }
  }

  /** Register a new node definition (or overwrite an existing one) */
  register(type: string, definition: NodeDefinitionEntry): void {
    this.definitions.set(type, definition);
  }

  /** Retrieve a node definition by type string */
  get(type: string): NodeDefinitionEntry | undefined {
    return this.definitions.get(type);
  }

  /** Get all definitions in a given category */
  getByCategory(category: string): NodeDefinitionEntry[] {
    const results: NodeDefinitionEntry[] = [];
    for (const entry of this.definitions.values()) {
      if (entry.category === category) {
        results.push(entry);
      }
    }
    return results;
  }

  /** Get every registered definition */
  getAll(): NodeDefinitionEntry[] {
    return Array.from(this.definitions.values());
  }

  /** Check whether a type is registered */
  has(type: string): boolean {
    return this.definitions.has(type);
  }

  /** Total number of registered definitions */
  get size(): number {
    return this.definitions.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const nodeDefinitionRegistry = new NodeDefinitionRegistry();

// ---------------------------------------------------------------------------
// Convenience function: create a node from the registry
// ---------------------------------------------------------------------------

/**
 * Create a node using the registry definition to initialise sockets and
 * properties with the correct defaults.
 */
export function createNodeFromRegistry(
  nw: NodeWrangler,
  type: string,
  name?: string,
  location?: [number, number],
  props?: Record<string, any>,
): any {
  const node = nw.newNode(type as any, name, location);
  const entry = nodeDefinitionRegistry.get(type);

  if (entry && props) {
    // Merge caller-supplied properties on top of the node instance
    for (const [k, v] of Object.entries(props)) {
      node.properties[k] = v;
    }
  }

  return node;
}

// ---------------------------------------------------------------------------
// Validation helper – ensure every NodeTypes member has a registered definition
// ---------------------------------------------------------------------------

/** Returns a list of NodeTypes values that have no registered definition. */
export function findMissingDefinitions(): string[] {
  const missing: string[] = [];
  const enumValues = new Set<string>();

  // Collect all unique string values from the NodeTypes enum
  for (const value of Object.values(NodeTypes)) {
    if (typeof value === 'string') {
      enumValues.add(value);
    }
  }

  for (const typeStr of enumValues) {
    if (!nodeDefinitionRegistry.has(typeStr)) {
      missing.push(typeStr);
    }
  }

  return missing;
}
