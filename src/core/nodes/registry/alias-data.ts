/**
 * Alias Data — Node type alias-to-canonical mappings
 *
 * This file contains the complete static alias registry that maps every known
 * alias (Blender-style, custom-style, snake_case, PascalCase enum keys, etc.)
 * to its canonical Blender-style form.
 *
 * This data is separated from the registry API for maintainability:
 * - Adding new aliases only requires editing this file
 * - The registry API remains stable
 * - The data can be validated independently
 *
 * ## Alias Sources
 *
 * 1. NodeType enum (types.ts) — key → Blender value
 * 2. NodeTypes enum (node-types.ts) — key → custom value
 * 3. snake_case aliases observed in NodeEvaluator if-else chains
 * 4. Cross-references and aliases from NodeTypes enum alias entries
 *
 * @module core/nodes/registry
 */

/**
 * The core alias registry. Each key is an alias string, and the value is the
 * canonical Blender-style node type identifier.
 *
 * This is a plain object (not a Map) for maximum performance and tree-shaking.
 * Identity entries (canonical → canonical) ensure that canonical names also
 * resolve to themselves in a single O(1) lookup.
 */
export const ALIAS_DATA: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════════
  // Mix & Utility
  // ═══════════════════════════════════════════════════════════════════════
  'ShaderNodeMix': 'ShaderNodeMix',
  'MixNode': 'ShaderNodeMix',
  'Mix': 'ShaderNodeMix',
  'mix': 'ShaderNodeMix',

  // ═══════════════════════════════════════════════════════════════════════
  // Attribute Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'ShaderNodeAttribute': 'ShaderNodeAttribute',
  'AttributeNode': 'ShaderNodeAttribute',
  'Attribute': 'ShaderNodeAttribute',
  'attribute': 'ShaderNodeAttribute',

  'GeometryNodeCaptureAttribute': 'GeometryNodeCaptureAttribute',
  'CaptureAttributeNode': 'GeometryNodeCaptureAttribute',
  'CaptureAttribute': 'GeometryNodeCaptureAttribute',
  'capture_attribute': 'GeometryNodeCaptureAttribute',

  'GeometryNodeAttributeStatistic': 'GeometryNodeAttributeStatistic',
  'AttributeStatisticNode': 'GeometryNodeAttributeStatistic',
  'AttributeStatistic': 'GeometryNodeAttributeStatistic',
  'attribute_statistic': 'GeometryNodeAttributeStatistic',

  'GeometryNodeAttributeTransfer': 'GeometryNodeAttributeTransfer',
  'TransferAttributeNode': 'GeometryNodeAttributeTransfer',
  'TransferAttribute': 'GeometryNodeAttributeTransfer',
  'AttributeTransfer': 'GeometryNodeAttributeTransfer',
  'attribute_transfer': 'GeometryNodeAttributeTransfer',

  'GeometryNodeAttributeDomainSize': 'GeometryNodeAttributeDomainSize',
  'DomainSizeNode': 'GeometryNodeAttributeDomainSize',
  'DomainSize': 'GeometryNodeAttributeDomainSize',
  'domain_size': 'GeometryNodeAttributeDomainSize',

  'GeometryNodeStoreNamedAttribute': 'GeometryNodeStoreNamedAttribute',
  'StoreNamedAttributeNode': 'GeometryNodeStoreNamedAttribute',
  'StoreNamedAttribute': 'GeometryNodeStoreNamedAttribute',
  'store_named_attribute': 'GeometryNodeStoreNamedAttribute',

  'GeometryNodeInputNamedAttribute': 'GeometryNodeInputNamedAttribute',
  'NamedAttributeNode': 'GeometryNodeInputNamedAttribute',
  'NamedAttribute': 'GeometryNodeInputNamedAttribute',
  'named_attribute': 'GeometryNodeInputNamedAttribute',

  'GeometryNodeRemoveAttribute': 'GeometryNodeRemoveAttribute',
  'RemoveAttributeNode': 'GeometryNodeRemoveAttribute',
  'RemoveAttribute': 'GeometryNodeRemoveAttribute',
  'remove_attribute': 'GeometryNodeRemoveAttribute',

  'GeometryNodeSampleIndex': 'GeometryNodeSampleIndex',
  'SampleIndexNode': 'GeometryNodeSampleIndex',
  'SampleIndex': 'GeometryNodeSampleIndex',
  'sample_index': 'GeometryNodeSampleIndex',

  'GeometryNodeSampleNearest': 'GeometryNodeSampleNearest',
  'SampleNearestNode': 'GeometryNodeSampleNearest',
  'SampleNearest': 'GeometryNodeSampleNearest',
  'sample_nearest': 'GeometryNodeSampleNearest',

  'GeometryNodeSampleNearestSurface': 'GeometryNodeSampleNearestSurface',
  'SampleNearestSurfaceNode': 'GeometryNodeSampleNearestSurface',
  'SampleNearestSurface': 'GeometryNodeSampleNearestSurface',
  'sample_nearest_surface': 'GeometryNodeSampleNearestSurface',

  // ═══════════════════════════════════════════════════════════════════════
  // Color Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'ShaderNodeValToRGB': 'ShaderNodeValToRGB',
  'ColorRampNode': 'ShaderNodeValToRGB',
  'ColorRamp': 'ShaderNodeValToRGB',
  'ValToRGB': 'ShaderNodeValToRGB',
  'color_ramp': 'ShaderNodeValToRGB',
  'COLOR_RAMP': 'ShaderNodeValToRGB',

  'ShaderNodeMixRGB': 'ShaderNodeMixRGB',
  'MixRGBNode': 'ShaderNodeMixRGB',
  'MixRGB': 'ShaderNodeMixRGB',
  'mix_rgb': 'ShaderNodeMixRGB',

  'ShaderNodeRGBCurve': 'ShaderNodeRGBCurve',
  'RGBCurveNode': 'ShaderNodeRGBCurve',
  'RGBCurve': 'ShaderNodeRGBCurve',
  'rgb_curve': 'ShaderNodeRGBCurve',

  'CompositorNodeBrightContrast': 'CompositorNodeBrightContrast',
  'BrightContrastNode': 'CompositorNodeBrightContrast',
  'BrightContrast': 'CompositorNodeBrightContrast',
  'bright_contrast': 'CompositorNodeBrightContrast',

  'CompositorNodeExposure': 'CompositorNodeExposure',
  'ExposureNode': 'CompositorNodeExposure',
  'Exposure': 'CompositorNodeExposure',
  'exposure': 'CompositorNodeExposure',

  'ShaderNodeCombineHSV': 'ShaderNodeCombineHSV',
  'CombineHSVNode': 'ShaderNodeCombineHSV',
  'CombineHSV': 'ShaderNodeCombineHSV',
  'combine_hsv': 'ShaderNodeCombineHSV',

  'ShaderNodeSeparateRGB': 'ShaderNodeSeparateRGB',
  'SeparateRGBNode': 'ShaderNodeSeparateRGB',
  'SeparateRGB': 'ShaderNodeSeparateRGB',
  'separate_rgb': 'ShaderNodeSeparateRGB',

  'ShaderNodeSeparateColor': 'ShaderNodeSeparateColor',
  'SeparateColorNode': 'ShaderNodeSeparateColor',
  'SeparateColor': 'ShaderNodeSeparateColor',
  'separate_color': 'ShaderNodeSeparateColor',

  'ShaderNodeCombineRGB': 'ShaderNodeCombineRGB',
  'CombineRGBNode': 'ShaderNodeCombineRGB',
  'CombineRGB': 'ShaderNodeCombineRGB',
  'combine_rgb': 'ShaderNodeCombineRGB',

  'ShaderNodeCombineColor': 'ShaderNodeCombineColor',
  'CombineColorNode': 'ShaderNodeCombineColor',
  'CombineColor': 'ShaderNodeCombineColor',
  'combine_color': 'ShaderNodeCombineColor',

  'FunctionNodeCombineColor': 'FunctionNodeCombineColor',
  'FunctionCombineColor': 'FunctionNodeCombineColor',

  'ShaderNodeHueSaturation': 'ShaderNodeHueSaturation',
  'HueSaturationNode': 'ShaderNodeHueSaturation',
  'HueSaturationValue': 'ShaderNodeHueSaturation',
  'hue_saturation': 'ShaderNodeHueSaturation',
  'hue_saturation_value': 'ShaderNodeHueSaturation',

  'ShaderNodeInvert': 'ShaderNodeInvert',
  'InvertNode': 'ShaderNodeInvert',
  'Invert': 'ShaderNodeInvert',
  'invert': 'ShaderNodeInvert',

  // ═══════════════════════════════════════════════════════════════════════
  // Curve Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeCurveToMesh': 'GeometryNodeCurveToMesh',
  'CurveToMeshNode': 'GeometryNodeCurveToMesh',
  'CurveToMesh': 'GeometryNodeCurveToMesh',
  'curve_to_mesh': 'GeometryNodeCurveToMesh',

  'GeometryNodeCurveToPoints': 'GeometryNodeCurveToPoints',
  'CurveToPointsNode': 'GeometryNodeCurveToPoints',
  'CurveToPoints': 'GeometryNodeCurveToPoints',
  'curve_to_points': 'GeometryNodeCurveToPoints',

  'GeometryNodeMeshToCurve': 'GeometryNodeMeshToCurve',
  'MeshToCurveNode': 'GeometryNodeMeshToCurve',
  'MeshToCurve': 'GeometryNodeMeshToCurve',
  'mesh_to_curve': 'GeometryNodeMeshToCurve',

  'GeometryNodeSampleCurve': 'GeometryNodeSampleCurve',
  'SampleCurveNode': 'GeometryNodeSampleCurve',
  'SampleCurve': 'GeometryNodeSampleCurve',
  'sample_curve': 'GeometryNodeSampleCurve',

  'GeometryNodeSetCurveRadius': 'GeometryNodeSetCurveRadius',
  'SetCurveRadiusNode': 'GeometryNodeSetCurveRadius',
  'SetCurveRadius': 'GeometryNodeSetCurveRadius',
  'set_curve_radius': 'GeometryNodeSetCurveRadius',

  'GeometryNodeSetCurveTilt': 'GeometryNodeSetCurveTilt',
  'SetCurveTiltNode': 'GeometryNodeSetCurveTilt',
  'SetCurveTilt': 'GeometryNodeSetCurveTilt',
  'set_curve_tilt': 'GeometryNodeSetCurveTilt',

  'GeometryNodeCurveLength': 'GeometryNodeCurveLength',
  'CurveLengthNode': 'GeometryNodeCurveLength',
  'CurveLength': 'GeometryNodeCurveLength',
  'curve_length': 'GeometryNodeCurveLength',

  'GeometryNodeCurveSplineType': 'GeometryNodeCurveSplineType',
  'CurveSplineTypeNode': 'GeometryNodeCurveSplineType',
  'CurveSplineType': 'GeometryNodeCurveSplineType',

  'GeometryNodeSetCurveHandlePositions': 'GeometryNodeSetCurveHandlePositions',
  'SetHandlePositionsNode': 'GeometryNodeSetCurveHandlePositions',
  'SetHandlePositions': 'GeometryNodeSetCurveHandlePositions',

  'GeometryNodeSplineParameter': 'GeometryNodeSplineParameter',
  'SplineParameterNode': 'GeometryNodeSplineParameter',
  'SplineParameter': 'GeometryNodeSplineParameter',

  'GeometryNodeSubdivideCurve': 'GeometryNodeSubdivideCurve',
  'SubdivideCurveNode': 'GeometryNodeSubdivideCurve',
  'SubdivideCurve': 'GeometryNodeSubdivideCurve',
  'subdivide_curve': 'GeometryNodeSubdivideCurve',

  'GeometryNodeResampleCurve': 'GeometryNodeResampleCurve',
  'ResampleCurveNode': 'GeometryNodeResampleCurve',
  'ResampleCurve': 'GeometryNodeResampleCurve',
  'resample_curve': 'GeometryNodeResampleCurve',
  'curve_resample': 'GeometryNodeResampleCurve',

  'GeometryNodeTrimCurve': 'GeometryNodeTrimCurve',
  'TrimCurveNode': 'GeometryNodeTrimCurve',
  'TrimCurve': 'GeometryNodeTrimCurve',
  'trim_curve': 'GeometryNodeTrimCurve',

  'GeometryNodeReverseCurve': 'GeometryNodeReverseCurve',
  'ReverseCurveNode': 'GeometryNodeReverseCurve',
  'ReverseCurve': 'GeometryNodeReverseCurve',

  'GeometryNodeFillCurve': 'GeometryNodeFillCurve',
  'FillCurveNode': 'GeometryNodeFillCurve',
  'FillCurve': 'GeometryNodeFillCurve',
  'fill_curve': 'GeometryNodeFillCurve',

  'GeometryNodeFilletCurve': 'GeometryNodeFilletCurve',
  'FilletCurveNode': 'GeometryNodeFilletCurve',
  'FilletCurve': 'GeometryNodeFilletCurve',

  // ═══════════════════════════════════════════════════════════════════════
  // Curve Primitives
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeCurvePrimitiveCircle': 'GeometryNodeCurvePrimitiveCircle',
  'CurveCircleNode': 'GeometryNodeCurvePrimitiveCircle',
  'CurveCircle': 'GeometryNodeCurvePrimitiveCircle',

  'GeometryNodeCurvePrimitiveLine': 'GeometryNodeCurvePrimitiveLine',
  'CurveLineNode': 'GeometryNodeCurvePrimitiveLine',
  'CurveLine': 'GeometryNodeCurvePrimitiveLine',
  'curve_line': 'GeometryNodeCurvePrimitiveLine',

  'GeometryNodeCurvePrimitiveBezierSegment': 'GeometryNodeCurvePrimitiveBezierSegment',
  'CurveBezierSegmentNode': 'GeometryNodeCurvePrimitiveBezierSegment',
  'CurveBezierSegment': 'GeometryNodeCurvePrimitiveBezierSegment',
  'bezier_segment': 'GeometryNodeCurvePrimitiveBezierSegment',

  'GeometryNodeCurveQuadraticBezier': 'GeometryNodeCurveQuadraticBezier',
  'QuadraticBezierNode': 'GeometryNodeCurveQuadraticBezier',
  'QuadraticBezier': 'GeometryNodeCurveQuadraticBezier',
  'quadratic_bezier': 'GeometryNodeCurveQuadraticBezier',

  // ═══════════════════════════════════════════════════════════════════════
  // Geometry Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeSetPosition': 'GeometryNodeSetPosition',
  'SetPositionNode': 'GeometryNodeSetPosition',
  'SetPosition': 'GeometryNodeSetPosition',
  'set_position': 'GeometryNodeSetPosition',

  'GeometryNodeJoinGeometry': 'GeometryNodeJoinGeometry',
  'JoinGeometryNode': 'GeometryNodeJoinGeometry',
  'JoinGeometry': 'GeometryNodeJoinGeometry',
  'join_geometry': 'GeometryNodeJoinGeometry',

  'GeometryNodeMergeByDistance': 'GeometryNodeMergeByDistance',
  'MergeByDistanceNode': 'GeometryNodeMergeByDistance',
  'MergeByDistance': 'GeometryNodeMergeByDistance',
  'merge_by_distance': 'GeometryNodeMergeByDistance',

  'GeometryNodeSeparateGeometry': 'GeometryNodeSeparateGeometry',
  'SeparateGeometryNode': 'GeometryNodeSeparateGeometry',
  'SeparateGeometry': 'GeometryNodeSeparateGeometry',
  'separate_geometry': 'GeometryNodeSeparateGeometry',

  'GeometryNodeBoundBox': 'GeometryNodeBoundBox',
  'BoundingBoxNode': 'GeometryNodeBoundBox',
  'BoundingBox': 'GeometryNodeBoundBox',
  'bounding_box': 'GeometryNodeBoundBox',

  'GeometryNodeTransform': 'GeometryNodeTransform',
  'TransformNode': 'GeometryNodeTransform',
  'Transform': 'GeometryNodeTransform',
  'transform': 'GeometryNodeTransform',

  'GeometryNodeDeleteGeometry': 'GeometryNodeDeleteGeometry',
  'DeleteGeometryNode': 'GeometryNodeDeleteGeometry',
  'DeleteGeometry': 'GeometryNodeDeleteGeometry',
  'delete_geometry': 'GeometryNodeDeleteGeometry',

  'GeometryNodeProximity': 'GeometryNodeProximity',
  'ProximityNode': 'GeometryNodeProximity',
  'Proximity': 'GeometryNodeProximity',
  'proximity': 'GeometryNodeProximity',
  'geometry_proximity': 'GeometryNodeProximity',
  'GeometryProximityNode': 'GeometryNodeProximity',

  'GeometryNodeConvexHull': 'GeometryNodeConvexHull',
  'ConvexHullNode': 'GeometryNodeConvexHull',
  'ConvexHull': 'GeometryNodeConvexHull',
  'convex_hull': 'GeometryNodeConvexHull',

  'GeometryNodeRaycast': 'GeometryNodeRaycast',
  'RaycastNode': 'GeometryNodeRaycast',
  'Raycast': 'GeometryNodeRaycast',
  'raycast': 'GeometryNodeRaycast',

  'GeometryNodeDuplicateElements': 'GeometryNodeDuplicateElements',
  'DuplicateElementsNode': 'GeometryNodeDuplicateElements',
  'DuplicateElements': 'GeometryNodeDuplicateElements',
  'duplicate_elements': 'GeometryNodeDuplicateElements',

  'GeometryNodeTriangulate': 'GeometryNodeTriangulate',
  'TriangulateNode': 'GeometryNodeTriangulate',
  'Triangulate': 'GeometryNodeTriangulate',

  // ═══════════════════════════════════════════════════════════════════════
  // Input Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'NodeGroupInput': 'NodeGroupInput',
  'GroupInputNode': 'NodeGroupInput',
  'GroupInput': 'NodeGroupInput',

  'ShaderNodeRGB': 'ShaderNodeRGB',
  'RGBNode': 'ShaderNodeRGB',
  'RGB': 'ShaderNodeRGB',
  'rgb': 'ShaderNodeRGB',

  'FunctionNodeInputBool': 'FunctionNodeInputBool',
  'BooleanNode': 'FunctionNodeInputBool',
  'Boolean': 'FunctionNodeInputBool',
  'input_bool': 'FunctionNodeInputBool',
  'InputBoolNode': 'FunctionNodeInputBool',

  'ShaderNodeValue': 'ShaderNodeValue',
  'ValueNode': 'ShaderNodeValue',
  'Value': 'ShaderNodeValue',
  'value': 'ShaderNodeValue',

  'FunctionNodeRandomValue': 'FunctionNodeRandomValue',
  'RandomValueNode': 'FunctionNodeRandomValue',
  'RandomValue': 'FunctionNodeRandomValue',
  'random_value': 'FunctionNodeRandomValue',

  'GeometryNodeCollectionInfo': 'GeometryNodeCollectionInfo',
  'CollectionInfoNode': 'GeometryNodeCollectionInfo',
  'CollectionInfo': 'GeometryNodeCollectionInfo',
  'collection_info': 'GeometryNodeCollectionInfo',

  'GeometryNodeObjectInfo': 'GeometryNodeObjectInfo',
  'ObjectInfoNode': 'GeometryNodeObjectInfo',
  'ObjectInfo': 'GeometryNodeObjectInfo',
  'object_info': 'GeometryNodeObjectInfo',

  'FunctionNodeInputVector': 'FunctionNodeInputVector',
  'VectorNode': 'FunctionNodeInputVector',
  'Vector': 'FunctionNodeInputVector',
  'input_vector': 'FunctionNodeInputVector',
  'InputVectorNode': 'FunctionNodeInputVector',
  'NodeInputVector': 'FunctionNodeInputVector',

  'GeometryNodeInputID': 'GeometryNodeInputID',
  'InputIDNode': 'GeometryNodeInputID',
  'InputID': 'GeometryNodeInputID',
  'input_id': 'GeometryNodeInputID',
  'IdInput': 'GeometryNodeInputID',
  'IDNode': 'GeometryNodeInputID',

  'GeometryNodeInputPosition': 'GeometryNodeInputPosition',
  'InputPositionNode': 'GeometryNodeInputPosition',
  'InputPosition': 'GeometryNodeInputPosition',
  'input_position': 'GeometryNodeInputPosition',
  'PositionInput': 'GeometryNodeInputPosition',
  'Position': 'GeometryNodeInputPosition',

  'GeometryNodeInputNormal': 'GeometryNodeInputNormal',
  'InputNormalNode': 'GeometryNodeInputNormal',
  'InputNormal': 'GeometryNodeInputNormal',
  'input_normal': 'GeometryNodeInputNormal',
  'NormalInput': 'GeometryNodeInputNormal',
  'Normal': 'ShaderNodeNormal',

  'GeometryNodeInputMeshEdgeVertices': 'GeometryNodeInputMeshEdgeVertices',
  'InputEdgeVerticesNode': 'GeometryNodeInputMeshEdgeVertices',
  'InputEdgeVertices': 'GeometryNodeInputMeshEdgeVertices',
  'EdgeVertices': 'GeometryNodeInputMeshEdgeVertices',
  'EdgeVerticesNode': 'GeometryNodeInputMeshEdgeVertices',
  'edge_vertices': 'GeometryNodeInputMeshEdgeVertices',

  'GeometryNodeInputMeshEdgeAngle': 'GeometryNodeInputMeshEdgeAngle',
  'InputEdgeAngleNode': 'GeometryNodeInputMeshEdgeAngle',
  'InputEdgeAngle': 'GeometryNodeInputMeshEdgeAngle',
  'EdgeAngle': 'GeometryNodeInputMeshEdgeAngle',
  'EdgeAngleNode': 'GeometryNodeInputMeshEdgeAngle',
  'edge_angle': 'GeometryNodeInputMeshEdgeAngle',

  'FunctionNodeInputColor': 'FunctionNodeInputColor',
  'InputColorNode': 'FunctionNodeInputColor',
  'InputColor': 'FunctionNodeInputColor',
  'input_color': 'FunctionNodeInputColor',
  'ColorInput': 'FunctionNodeInputColor',

  'GeometryNodeInputMeshFaceArea': 'GeometryNodeInputMeshFaceArea',
  'InputMeshFaceAreaNode': 'GeometryNodeInputMeshFaceArea',
  'InputMeshFaceArea': 'GeometryNodeInputMeshFaceArea',
  'FaceArea': 'GeometryNodeInputMeshFaceArea',
  'FaceAreaNode': 'GeometryNodeInputMeshFaceArea',
  'face_area': 'GeometryNodeInputMeshFaceArea',

  'ShaderNodeTexCoord': 'ShaderNodeTexCoord',
  'TextureCoordinateNode': 'ShaderNodeTexCoord',
  'TextureCoordinate': 'ShaderNodeTexCoord',
  'TextureCoord': 'ShaderNodeTexCoord',
  'TextureCoordNode': 'ShaderNodeTexCoord',
  'texture_coordinate': 'ShaderNodeTexCoord',
  'TexCoordNode': 'ShaderNodeTexCoord',
  'TexCoord': 'ShaderNodeTexCoord',
  'TEX_COORD': 'ShaderNodeTexCoord',
  'TextureCoordShaderNode': 'ShaderNodeTexCoord',
  'TextureCoord_Shader': 'ShaderNodeTexCoord',

  'GeometryNodeInputIndex': 'GeometryNodeInputIndex',
  'IndexNode': 'GeometryNodeInputIndex',
  'Index': 'GeometryNodeInputIndex',
  'IndexInput': 'GeometryNodeInputIndex',
  'input_index': 'GeometryNodeInputIndex',

  'ShaderNodeAmbientOcclusion': 'ShaderNodeAmbientOcclusion',
  'AmbientOcclusionNode': 'ShaderNodeAmbientOcclusion',
  'AmbientOcclusion': 'ShaderNodeAmbientOcclusion',
  'AmbientOcclusionOutput': 'ShaderNodeAmbientOcclusion',

  'FunctionNodeInputInt': 'FunctionNodeInputInt',
  'IntegerNode': 'FunctionNodeInputInt',
  'Integer': 'FunctionNodeInputInt',
  'input_int': 'FunctionNodeInputInt',
  'InputIntNode': 'FunctionNodeInputInt',

  'ShaderNodeLightPath': 'ShaderNodeLightPath',
  'LightPathNode': 'ShaderNodeLightPath',
  'LightPath': 'ShaderNodeLightPath',

  'ShaderNodeBlackbody': 'ShaderNodeBlackbody',
  'BlackBodyNode': 'ShaderNodeBlackbody',
  'BlackBody': 'ShaderNodeBlackbody',

  'FunctionNodeInputFloat': 'FunctionNodeInputFloat',
  'InputFloatNode': 'FunctionNodeInputFloat',
  'input_float': 'FunctionNodeInputFloat',

  'GeometryNodeInputTangent': 'GeometryNodeInputTangent',
  'InputTangentNode': 'GeometryNodeInputTangent',
  'input_tangent': 'GeometryNodeInputTangent',
  'TangentInput': 'GeometryNodeInputTangent',

  'GeometryNodeSelfObject': 'GeometryNodeSelfObject',
  'SelfObjectNode': 'GeometryNodeSelfObject',
  'SelfObject': 'GeometryNodeSelfObject',
  'self_object': 'GeometryNodeSelfObject',

  // ═══════════════════════════════════════════════════════════════════════
  // Instance Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeRealizeInstances': 'GeometryNodeRealizeInstances',
  'RealizeInstancesNode': 'GeometryNodeRealizeInstances',
  'RealizeInstances': 'GeometryNodeRealizeInstances',
  'realize_instances': 'GeometryNodeRealizeInstances',

  'GeometryNodeInstanceOnPoints': 'GeometryNodeInstanceOnPoints',
  'InstanceOnPointsNode': 'GeometryNodeInstanceOnPoints',
  'InstanceOnPoints': 'GeometryNodeInstanceOnPoints',
  'instance_on_points': 'GeometryNodeInstanceOnPoints',

  'GeometryNodeTranslateInstances': 'GeometryNodeTranslateInstances',
  'TranslateInstancesNode': 'GeometryNodeTranslateInstances',
  'TranslateInstances': 'GeometryNodeTranslateInstances',
  'translate_instances': 'GeometryNodeTranslateInstances',

  'GeometryNodeRotateInstances': 'GeometryNodeRotateInstances',
  'RotateInstancesNode': 'GeometryNodeRotateInstances',
  'RotateInstances': 'GeometryNodeRotateInstances',
  'rotate_instances': 'GeometryNodeRotateInstances',

  'GeometryNodeScaleInstances': 'GeometryNodeScaleInstances',
  'ScaleInstancesNode': 'GeometryNodeScaleInstances',
  'ScaleInstances': 'GeometryNodeScaleInstances',
  'scale_instances': 'GeometryNodeScaleInstances',

  // ═══════════════════════════════════════════════════════════════════════
  // Material Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeSetMaterial': 'GeometryNodeSetMaterial',
  'SetMaterialNode': 'GeometryNodeSetMaterial',
  'SetMaterial': 'GeometryNodeSetMaterial',
  'SetMaterialNodes': 'GeometryNodeSetMaterial',

  'GeometryNodeSetMaterialIndex': 'GeometryNodeSetMaterialIndex',
  'SetMaterialIndexNode': 'GeometryNodeSetMaterialIndex',
  'SetMaterialIndex': 'GeometryNodeSetMaterialIndex',

  'GeometryNodeInputMaterialIndex': 'GeometryNodeInputMaterialIndex',
  'MaterialIndexNode': 'GeometryNodeInputMaterialIndex',
  'MaterialIndex': 'GeometryNodeInputMaterialIndex',

  'ShaderNodeMaterialInfo': 'ShaderNodeMaterialInfo',
  'MaterialInfoNode': 'ShaderNodeMaterialInfo',
  'MaterialInfo': 'ShaderNodeMaterialInfo',

  // ═══════════════════════════════════════════════════════════════════════
  // Mesh Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeSubdivideMesh': 'GeometryNodeSubdivideMesh',
  'SubdivideMeshNode': 'GeometryNodeSubdivideMesh',
  'SubdivideMesh': 'GeometryNodeSubdivideMesh',
  'subdivide_mesh': 'GeometryNodeSubdivideMesh',

  'GeometryNodeSetShadeSmooth': 'GeometryNodeSetShadeSmooth',
  'SetShadeSmoothNode': 'GeometryNodeSetShadeSmooth',
  'SetShadeSmooth': 'GeometryNodeSetShadeSmooth',

  'GeometryNodeSplitEdges': 'GeometryNodeSplitEdges',
  'EdgeSplitNode': 'GeometryNodeSplitEdges',
  'SplitEdges': 'GeometryNodeSplitEdges',
  'edge_split': 'GeometryNodeSplitEdges',

  'GeometryNodeExtrudeMesh': 'GeometryNodeExtrudeMesh',
  'ExtrudeMeshNode': 'GeometryNodeExtrudeMesh',
  'ExtrudeMesh': 'GeometryNodeExtrudeMesh',
  'ExtrudeMeshFace': 'GeometryNodeExtrudeMesh',
  'ExtrudeMeshFaceNode': 'GeometryNodeExtrudeMesh',
  'ExtrudeMeshAlongNormalNode': 'GeometryNodeExtrudeMesh',
  'ExtrudeMeshAlongNormal': 'GeometryNodeExtrudeMesh',
  'extrude_faces': 'GeometryNodeExtrudeMesh',
  'ExtrudeFaces': 'GeometryNodeExtrudeMesh',
  'ExtrudeFacesNode': 'GeometryNodeExtrudeMesh',

  'GeometryNodeOffsetFace': 'GeometryNodeOffsetFace',
  'OffsetFace': 'GeometryNodeOffsetFace',
  'OffsetMeshNode': 'GeometryNodeOffsetFace',
  'OffsetMesh': 'GeometryNodeOffsetFace',

  'GeometryNodeMeshBoolean': 'GeometryNodeMeshBoolean',
  'MeshBooleanNode': 'GeometryNodeMeshBoolean',
  'MeshBoolean': 'GeometryNodeMeshBoolean',
  'mesh_boolean': 'GeometryNodeMeshBoolean',
  'BooleanUnionNode': 'GeometryNodeMeshBoolean',
  'BooleanUnion': 'GeometryNodeMeshBoolean',
  'BooleanIntersectNode': 'GeometryNodeMeshBoolean',
  'BooleanIntersect': 'GeometryNodeMeshBoolean',
  'BooleanDifferenceNode': 'GeometryNodeMeshBoolean',
  'BooleanDifference': 'GeometryNodeMeshBoolean',

  'GeometryNodeMeshToPoints': 'GeometryNodeMeshToPoints',
  'MeshToPointsNode': 'GeometryNodeMeshToPoints',
  'MeshToPoints': 'GeometryNodeMeshToPoints',
  'mesh_to_points': 'GeometryNodeMeshToPoints',

  'GeometryNodeDualMesh': 'GeometryNodeDualMesh',
  'DualMeshNode': 'GeometryNodeDualMesh',
  'DualMesh': 'GeometryNodeDualMesh',

  'GeometryNodeScaleElements': 'GeometryNodeScaleElements',
  'ScaleElements': 'GeometryNodeScaleElements',

  'GeometryNodeMeshToVolume': 'GeometryNodeMeshToVolume',
  'MeshToVolumeNode': 'GeometryNodeMeshToVolume',
  'MeshToVolume': 'GeometryNodeMeshToVolume',
  'mesh_to_volume': 'GeometryNodeMeshToVolume',

  'GeometryNodeSetMeshNormals': 'GeometryNodeSetMeshNormals',
  'SetMeshNormalsNode': 'GeometryNodeSetMeshNormals',
  'SetMeshNormals': 'GeometryNodeSetMeshNormals',

  'GeometryNodeFlipFaces': 'GeometryNodeFlipFaces',
  'FlipFacesNode': 'GeometryNodeFlipFaces',
  'FlipFaces': 'GeometryNodeFlipFaces',
  'flip_faces': 'GeometryNodeFlipFaces',

  'GeometryNodeEdgeNeighbors': 'GeometryNodeEdgeNeighbors',
  'EdgeNeighborsNode': 'GeometryNodeEdgeNeighbors',
  'EdgeNeighbors': 'GeometryNodeEdgeNeighbors',

  'GeometryNodeEdgesOfVertex': 'GeometryNodeEdgesOfVertex',
  'EdgesOfVertexNode': 'GeometryNodeEdgesOfVertex',
  'EdgesOfVertex': 'GeometryNodeEdgesOfVertex',

  'GeometryNodeVerticesOfEdge': 'GeometryNodeVerticesOfEdge',
  'VerticesOfEdgeNode': 'GeometryNodeVerticesOfEdge',
  'VerticesOfEdge': 'GeometryNodeVerticesOfEdge',

  'GeometryNodeVerticesOfFace': 'GeometryNodeVerticesOfFace',
  'VerticesOfFaceNode': 'GeometryNodeVerticesOfFace',
  'VerticesOfFace': 'GeometryNodeVerticesOfFace',

  'GeometryNodeEdgesOfFace': 'GeometryNodeEdgesOfFace',
  'EdgesOfFaceNode': 'GeometryNodeEdgesOfFace',
  'EdgesOfFace': 'GeometryNodeEdgesOfFace',

  'GeometryNodeFacesOfEdge': 'GeometryNodeFacesOfEdge',
  'FacesOfEdgeNode': 'GeometryNodeFacesOfEdge',
  'FacesOfEdge': 'GeometryNodeFacesOfEdge',

  'GeometryNodeFacesOfVertex': 'GeometryNodeFacesOfVertex',
  'FacesOfVertexNode': 'GeometryNodeFacesOfVertex',
  'FacesOfVertex': 'GeometryNodeFacesOfVertex',

  'GeometryNodeFaceCorners': 'GeometryNodeFaceCorners',
  'FaceCornersNode': 'GeometryNodeFaceCorners',
  'FaceCorners': 'GeometryNodeFaceCorners',

  'GeometryNodeNamedCorner': 'GeometryNodeNamedCorner',
  'NamedCornerNode': 'GeometryNodeNamedCorner',
  'NamedCorner': 'GeometryNodeNamedCorner',

  'GeometryNodeCornerNormal': 'GeometryNodeCornerNormal',
  'CornerNormalNode': 'GeometryNodeCornerNormal',
  'CornerNormal': 'GeometryNodeCornerNormal',

  'GeometryNodeCornerAngle': 'GeometryNodeCornerAngle',
  'CornerAngleNode': 'GeometryNodeCornerAngle',
  'CornerAngle': 'GeometryNodeCornerAngle',

  'GeometryNodeCornerVertexIndex': 'GeometryNodeCornerVertexIndex',
  'CornerVertexIndexNode': 'GeometryNodeCornerVertexIndex',
  'CornerVertexIndex': 'GeometryNodeCornerVertexIndex',

  'GeometryNodeCornerEdgeIndex': 'GeometryNodeCornerEdgeIndex',
  'CornerEdgeIndexNode': 'GeometryNodeCornerEdgeIndex',
  'CornerEdgeIndex': 'GeometryNodeCornerEdgeIndex',

  'GeometryNodeCornerFaceIndex': 'GeometryNodeCornerFaceIndex',
  'CornerFaceIndexNode': 'GeometryNodeCornerFaceIndex',
  'CornerFaceIndex': 'GeometryNodeCornerFaceIndex',

  'GeometryNodeInputUVMap': 'GeometryNodeInputUVMap',
  'UVMapNode': 'GeometryNodeInputUVMap',
  'UVMap': 'GeometryNodeInputUVMap',
  'uv_map': 'GeometryNodeInputUVMap',
  'UVMapInput': 'GeometryNodeInputUVMap',
  'UVMapShaderNode': 'GeometryNodeInputUVMap',
  'UVMap_Shader': 'GeometryNodeInputUVMap',

  'GeometryNodeUVWarp': 'GeometryNodeUVWarp',
  'UVWarpNode': 'GeometryNodeUVWarp',
  'UVWarp': 'GeometryNodeUVWarp',

  'GeometryNodeSetUV': 'GeometryNodeSetUV',
  'SetUVNode': 'GeometryNodeSetUV',
  'SetUV': 'GeometryNodeSetUV',

  'GeometryNodeMeshInfo': 'GeometryNodeMeshInfo',
  'MeshInfoNode': 'GeometryNodeMeshInfo',
  'MeshInfo': 'GeometryNodeMeshInfo',

  // ═══════════════════════════════════════════════════════════════════════
  // Mesh Primitives
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeMeshCube': 'GeometryNodeMeshCube',
  'MeshCubeNode': 'GeometryNodeMeshCube',
  'MeshCube': 'GeometryNodeMeshCube',
  'Cube': 'GeometryNodeMeshCube',

  'GeometryNodeMeshCylinder': 'GeometryNodeMeshCylinder',
  'MeshCylinderNode': 'GeometryNodeMeshCylinder',
  'MeshCylinder': 'GeometryNodeMeshCylinder',
  'Cylinder': 'GeometryNodeMeshCylinder',

  'GeometryNodeMeshCone': 'GeometryNodeMeshCone',
  'MeshConeNode': 'GeometryNodeMeshCone',
  'MeshCone': 'GeometryNodeMeshCone',
  'Cone': 'GeometryNodeMeshCone',

  'GeometryNodeMeshUVSphere': 'GeometryNodeMeshUVSphere',
  'MeshUVSphereNode': 'GeometryNodeMeshUVSphere',
  'MeshUVSphere': 'GeometryNodeMeshUVSphere',
  'Sphere': 'GeometryNodeMeshUVSphere',

  'GeometryNodeMeshIcoSphere': 'GeometryNodeMeshIcoSphere',
  'MeshIcoSphereNode': 'GeometryNodeMeshIcoSphere',
  'MeshIcoSphere': 'GeometryNodeMeshIcoSphere',
  'Icosphere': 'GeometryNodeMeshIcoSphere',

  'GeometryNodeMeshTorus': 'GeometryNodeMeshTorus',
  'MeshTorusNode': 'GeometryNodeMeshTorus',
  'MeshTorus': 'GeometryNodeMeshTorus',
  'Torus': 'GeometryNodeMeshTorus',

  'GeometryNodeMeshPlane': 'GeometryNodeMeshPlane',
  'Plane': 'GeometryNodeMeshPlane',

  'GeometryNodeMeshCircle': 'GeometryNodeMeshCircle',
  'MeshCircleNode': 'GeometryNodeMeshCircle',
  'MeshCircle': 'GeometryNodeMeshCircle',
  'Circle': 'GeometryNodeMeshCircle',

  'GeometryNodeGrid': 'GeometryNodeGrid',
  'MeshGridNode': 'GeometryNodeGrid',
  'MeshGrid': 'GeometryNodeGrid',
  'Grid': 'GeometryNodeGrid',

  'GeometryNodeMeshMonkey': 'GeometryNodeMeshMonkey',
  'Monkey': 'GeometryNodeMeshMonkey',

  'GeometryNodeMeshLine': 'GeometryNodeMeshLine',
  'MeshLineNode': 'GeometryNodeMeshLine',
  'MeshLine': 'GeometryNodeMeshLine',

  // ═══════════════════════════════════════════════════════════════════════
  // Point Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeDistributePointsInVolume': 'GeometryNodeDistributePointsInVolume',
  'DistributePointsInVolumeNode': 'GeometryNodeDistributePointsInVolume',
  'DistributePointsInVolume': 'GeometryNodeDistributePointsInVolume',

  'GeometryNodeDistributePointsOnFaces': 'GeometryNodeDistributePointsOnFaces',
  'DistributePointsOnFacesNode': 'GeometryNodeDistributePointsOnFaces',
  'DistributePointsOnFaces': 'GeometryNodeDistributePointsOnFaces',
  'distribute_points_on_faces': 'GeometryNodeDistributePointsOnFaces',

  'GeometryNodePointsToCurves': 'GeometryNodePointsToCurves',
  'PointsToCurvesNode': 'GeometryNodePointsToCurves',
  'PointsToCurves': 'GeometryNodePointsToCurves',
  'points_to_curves': 'GeometryNodePointsToCurves',

  'GeometryNodePointsToVolumes': 'GeometryNodePointsToVolumes',
  'PointsToVolumesNode': 'GeometryNodePointsToVolumes',
  'PointsToVolumes': 'GeometryNodePointsToVolumes',

  'GeometryNodePointsToVertices': 'GeometryNodePointsToVertices',
  'PointsToVerticesNode': 'GeometryNodePointsToVertices',
  'PointsToVertices': 'GeometryNodePointsToVertices',
  'points_to_vertices': 'GeometryNodePointsToVertices',

  'GeometryNodePoints': 'GeometryNodePoints',
  'PointsNode': 'GeometryNodePoints',
  'Points': 'GeometryNodePoints',

  // ═══════════════════════════════════════════════════════════════════════
  // Volume Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeVolumeToMesh': 'GeometryNodeVolumeToMesh',
  'VolumeToMeshNode': 'GeometryNodeVolumeToMesh',
  'VolumeToMesh': 'GeometryNodeVolumeToMesh',
  'volume_to_mesh': 'GeometryNodeVolumeToMesh',

  'GeometryNodeVolumeToPoints': 'GeometryNodeVolumeToPoints',
  'VolumeToPointsNode': 'GeometryNodeVolumeToPoints',
  'VolumeToPoints': 'GeometryNodeVolumeToPoints',

  'GeometryNodeVolumeToCurve': 'GeometryNodeVolumeToCurve',
  'VolumeToCurveNode': 'GeometryNodeVolumeToCurve',
  'VolumeToCurve': 'GeometryNodeVolumeToCurve',

  // ═══════════════════════════════════════════════════════════════════════
  // Texture Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'ShaderNodeTexImage': 'ShaderNodeTexImage',
  'ImageTextureNode': 'ShaderNodeTexImage',
  'ImageTexture': 'ShaderNodeTexImage',
  'image_texture': 'ShaderNodeTexImage',

  'ShaderNodeTexVoronoi': 'ShaderNodeTexVoronoi',
  'VoronoiTextureNode': 'ShaderNodeTexVoronoi',
  'VoronoiTexture': 'ShaderNodeTexVoronoi',
  'TextureVoronoiNode': 'ShaderNodeTexVoronoi',
  'TextureVoronoi': 'ShaderNodeTexVoronoi',
  'voronoi_texture': 'ShaderNodeTexVoronoi',
  'TEX_VORONOI': 'ShaderNodeTexVoronoi',

  'ShaderNodeTexNoise': 'ShaderNodeTexNoise',
  'NoiseTextureNode': 'ShaderNodeTexNoise',
  'NoiseTexture': 'ShaderNodeTexNoise',
  'TextureNoiseNode': 'ShaderNodeTexNoise',
  'TextureNoise': 'ShaderNodeTexNoise',
  'noise_texture': 'ShaderNodeTexNoise',
  'TEX_NOISE': 'ShaderNodeTexNoise',

  'ShaderNodeTexGradient': 'ShaderNodeTexGradient',
  'GradientTextureNode': 'ShaderNodeTexGradient',
  'GradientTexture': 'ShaderNodeTexGradient',
  'TextureGradientNode': 'ShaderNodeTexGradient',
  'TextureGradient': 'ShaderNodeTexGradient',
  'gradient_texture': 'ShaderNodeTexGradient',

  'ShaderNodeTexMagic': 'ShaderNodeTexMagic',
  'MagicTextureNode': 'ShaderNodeTexMagic',
  'MagicTexture': 'ShaderNodeTexMagic',
  'TextureMagicNode': 'ShaderNodeTexMagic',
  'TextureMagic': 'ShaderNodeTexMagic',
  'magic_texture': 'ShaderNodeTexMagic',

  'ShaderNodeTexWave': 'ShaderNodeTexWave',
  'WaveTextureNode': 'ShaderNodeTexWave',
  'WaveTexture': 'ShaderNodeTexWave',
  'TextureWaveNode': 'ShaderNodeTexWave',
  'TextureWave': 'ShaderNodeTexWave',
  'wave_texture': 'ShaderNodeTexWave',

  'ShaderNodeTexBrick': 'ShaderNodeTexBrick',
  'BrickTextureNode': 'ShaderNodeTexBrick',
  'BrickTexture': 'ShaderNodeTexBrick',
  'TextureBrickNode': 'ShaderNodeTexBrick',
  'TextureBrick': 'ShaderNodeTexBrick',
  'brick_texture': 'ShaderNodeTexBrick',

  'ShaderNodeTexChecker': 'ShaderNodeTexChecker',
  'CheckerTextureNode': 'ShaderNodeTexChecker',
  'CheckerTexture': 'ShaderNodeTexChecker',
  'TextureCheckerNode': 'ShaderNodeTexChecker',
  'TextureChecker': 'ShaderNodeTexChecker',
  'checker_texture': 'ShaderNodeTexChecker',

  'ShaderNodePointDensity': 'ShaderNodePointDensity',
  'PointDensity': 'ShaderNodePointDensity',

  'ShaderNodeTexWhiteNoise': 'ShaderNodeTexWhiteNoise',
  'WhiteNoiseTextureNode': 'ShaderNodeTexWhiteNoise',
  'WhiteNoiseTexture': 'ShaderNodeTexWhiteNoise',
  'TextureWhiteNoiseNode': 'ShaderNodeTexWhiteNoise',
  'TextureWhiteNoise': 'ShaderNodeTexWhiteNoise',
  'white_noise_texture': 'ShaderNodeTexWhiteNoise',

  'ShaderNodeTexMusgrave': 'ShaderNodeTexMusgrave',
  'MusgraveTextureNode': 'ShaderNodeTexMusgrave',
  'MusgraveTexture': 'ShaderNodeTexMusgrave',
  'TextureMusgraveNode': 'ShaderNodeTexMusgrave',
  'TextureMusgrave': 'ShaderNodeTexMusgrave',
  'musgrave_texture': 'ShaderNodeTexMusgrave',

  'ShaderNodeTexSky': 'ShaderNodeTexSky',
  'SkyTexture': 'ShaderNodeTexSky',

  'ShaderNodeTexEnvironment': 'ShaderNodeTexEnvironment',
  'EnvironmentTexture': 'ShaderNodeTexEnvironment',

  'ShaderNodeTexGabor': 'ShaderNodeTexGabor',
  'TextureGaborNode': 'ShaderNodeTexGabor',
  'TextureGabor': 'ShaderNodeTexGabor',

  // ═══════════════════════════════════════════════════════════════════════
  // Converter / Math Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'ShaderNodeRGBToBW': 'ShaderNodeRGBToBW',
  'RGBToBW': 'ShaderNodeRGBToBW',

  'ShaderNodeMapRange': 'ShaderNodeMapRange',
  'MapRangeNode': 'ShaderNodeMapRange',
  'MapRange': 'ShaderNodeMapRange',
  'map_range': 'ShaderNodeMapRange',

  'ShaderNodeMath': 'ShaderNodeMath',
  'MathNode': 'ShaderNodeMath',
  'Math': 'ShaderNodeMath',
  'math': 'ShaderNodeMath',

  'ShaderNodeVectorMath': 'ShaderNodeVectorMath',
  'VectorMathNode': 'ShaderNodeVectorMath',
  'VectorMath': 'ShaderNodeVectorMath',
  'vector_math': 'ShaderNodeVectorMath',
  'VECTOR_MATH': 'ShaderNodeVectorMath',

  'ShaderNodeFloatCurve': 'ShaderNodeFloatCurve',
  'FloatCurveNode': 'ShaderNodeFloatCurve',
  'FloatCurve': 'ShaderNodeFloatCurve',

  'ShaderNodeClamp': 'ShaderNodeClamp',
  'ClampNode': 'ShaderNodeClamp',
  'Clamp': 'ShaderNodeClamp',
  'clamp': 'ShaderNodeClamp',

  'ShaderNodeCombineXYZ': 'ShaderNodeCombineXYZ',
  'CombineXYZNode': 'ShaderNodeCombineXYZ',
  'CombineXYZ': 'ShaderNodeCombineXYZ',
  'combine_xyz': 'ShaderNodeCombineXYZ',

  'ShaderNodeSeparateXYZ': 'ShaderNodeSeparateXYZ',
  'SeparateXYZNode': 'ShaderNodeSeparateXYZ',
  'SeparateXYZ': 'ShaderNodeSeparateXYZ',
  'separate_xyz': 'ShaderNodeSeparateXYZ',

  'ShaderNodeCombineRGBA': 'ShaderNodeCombineRGBA',
  'CombineRGBA': 'ShaderNodeCombineRGBA',

  'ShaderNodeSeparateRGBA': 'ShaderNodeSeparateRGBA',
  'SeparateRGBA': 'ShaderNodeSeparateRGBA',

  'ShaderNodeSeparateHSV': 'ShaderNodeSeparateHSV',
  'SeparateHSV': 'ShaderNodeSeparateHSV',
  'separate_hsv': 'ShaderNodeSeparateHSV',

  'GeometryNodeFloatToInt': 'GeometryNodeFloatToInt',
  'FloatToIntNode': 'GeometryNodeFloatToInt',
  'float_to_int': 'GeometryNodeFloatToInt',

  'FunctionNodeCompare': 'FunctionNodeCompare',
  'CompareNode': 'FunctionNodeCompare',
  'Compare': 'FunctionNodeCompare',
  'compare': 'FunctionNodeCompare',

  'FunctionNodeBooleanMath': 'FunctionNodeBooleanMath',
  'BooleanMathNode': 'FunctionNodeBooleanMath',
  'BooleanMath': 'FunctionNodeBooleanMath',
  'boolean_math': 'FunctionNodeBooleanMath',

  'FunctionNodeFloatCompare': 'FunctionNodeFloatCompare',
  'FloatCompareNode': 'FunctionNodeFloatCompare',
  'FloatCompare': 'FunctionNodeFloatCompare',
  'float_compare': 'FunctionNodeFloatCompare',

  // --- Blender-compatible alias names for Math/Converter nodes ---
  // These are the Blender-style names the parity tests look for.
  'ShaderNodeBooleanMath': 'FunctionNodeBooleanMath',
  'ShaderNodeCompare': 'FunctionNodeCompare',
  'ShaderNodeFloatToInt': 'GeometryNodeFloatToInt',
  'ShaderNodeFieldAtIndex': 'ShaderNodeFieldAtIndex',
  'FieldAtIndexNode': 'ShaderNodeFieldAtIndex',
  'FieldAtIndex': 'ShaderNodeFieldAtIndex',
  'field_at_index': 'ShaderNodeFieldAtIndex',
  'ShaderNodeAccumulateField': 'ShaderNodeAccumulateField',
  'AccumulateFieldNode': 'ShaderNodeAccumulateField',
  'AccumulateField': 'ShaderNodeAccumulateField',
  'accumulate_field': 'ShaderNodeAccumulateField',

  // ═══════════════════════════════════════════════════════════════════════
  // Vector Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'ShaderNodeNormal': 'ShaderNodeNormal',
  'NormalNode': 'ShaderNodeNormal',

  'ShaderNodeNormalMap': 'ShaderNodeNormalMap',
  'NormalMapNode': 'ShaderNodeNormalMap',
  'NormalMap': 'ShaderNodeNormalMap',
  'normal_map': 'ShaderNodeNormalMap',
  'NORMAL_MAP': 'ShaderNodeNormalMap',

  'ShaderNodeTangent': 'ShaderNodeTangent',
  'TangentNode': 'ShaderNodeTangent',
  'Tangent': 'ShaderNodeTangent',

  'ShaderNodeVectorRotate': 'ShaderNodeVectorRotate',
  'VectorRotateNode': 'ShaderNodeVectorRotate',
  'VectorRotate': 'ShaderNodeVectorRotate',

  'ShaderNodeVectorTransform': 'ShaderNodeVectorTransform',
  'VectorTransformNode': 'ShaderNodeVectorTransform',
  'VectorTransform': 'ShaderNodeVectorTransform',

  'ShaderNodeBump': 'ShaderNodeBump',
  'BumpNode': 'ShaderNodeBump',
  'Bump': 'ShaderNodeBump',
  'bump': 'ShaderNodeBump',
  'BUMP': 'ShaderNodeBump',

  'ShaderNodeDisplacement': 'ShaderNodeDisplacement',
  'DisplacementNode': 'ShaderNodeDisplacement',
  'Displacement': 'ShaderNodeDisplacement',
  'displacement': 'ShaderNodeDisplacement',

  'ShaderNodeMapping': 'ShaderNodeMapping',
  'MappingNode': 'ShaderNodeMapping',
  'Mapping': 'ShaderNodeMapping',
  'mapping': 'ShaderNodeMapping',
  'MAPPING': 'ShaderNodeMapping',

  'ShaderNodeTrueNormal': 'ShaderNodeTrueNormal',
  'TrueNormalNode': 'ShaderNodeTrueNormal',
  'TrueNormal': 'ShaderNodeTrueNormal',

  // ═══════════════════════════════════════════════════════════════════════
  // Shader Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'ShaderNodeBsdfDiffuse': 'ShaderNodeBsdfDiffuse',
  'DiffuseBSDFNode': 'ShaderNodeBsdfDiffuse',
  'DiffuseBSDF': 'ShaderNodeBsdfDiffuse',
  'bsdf_diffuse': 'ShaderNodeBsdfDiffuse',

  'ShaderNodeBsdfGlossy': 'ShaderNodeBsdfGlossy',
  'GlossyBSDFNode': 'ShaderNodeBsdfGlossy',
  'GlossyBSDF': 'ShaderNodeBsdfGlossy',
  'bsdf_glossy': 'ShaderNodeBsdfGlossy',

  'ShaderNodeBsdfGlass': 'ShaderNodeBsdfGlass',
  'GlassBSDFNode': 'ShaderNodeBsdfGlass',
  'GlassBSDF': 'ShaderNodeBsdfGlass',
  'bsdf_glass': 'ShaderNodeBsdfGlass',

  'ShaderNodeBsdfTransparent': 'ShaderNodeBsdfTransparent',
  'TransparentBSDF': 'ShaderNodeBsdfTransparent',

  'ShaderNodeBsdfRefraction': 'ShaderNodeBsdfRefraction',
  'RefractionBSDF': 'ShaderNodeBsdfRefraction',

  'ShaderNodeEmission': 'ShaderNodeEmission',
  'EmissionNode': 'ShaderNodeEmission',
  'Emission': 'ShaderNodeEmission',
  'emission': 'ShaderNodeEmission',

  'ShaderNodeBsdfHair': 'ShaderNodeBsdfHair',
  'HairBSDF': 'ShaderNodeBsdfHair',

  'ShaderNodeHoldout': 'ShaderNodeHoldout',
  'Holdout': 'ShaderNodeHoldout',

  'ShaderNodeVolumeAbsorption': 'ShaderNodeVolumeAbsorption',
  'VolumeAbsorption': 'ShaderNodeVolumeAbsorption',
  'VolumeAbsorptionNode': 'ShaderNodeVolumeAbsorption',

  'ShaderNodeVolumeScatter': 'ShaderNodeVolumeScatter',
  'VolumeScatter': 'ShaderNodeVolumeScatter',
  'VolumeScatteringNode': 'ShaderNodeVolumeScatter',
  'VolumeScatterNode': 'ShaderNodeVolumeScatter',

  'ShaderNodeBsdfPrincipled': 'ShaderNodeBsdfPrincipled',
  'PrincipledBSDFNode': 'ShaderNodeBsdfPrincipled',
  'PrincipledBSDF': 'ShaderNodeBsdfPrincipled',
  'BSDF_PRINCIPLED': 'ShaderNodeBsdfPrincipled',
  'principled_bsdf': 'ShaderNodeBsdfPrincipled',

  'ShaderNodeBsdfSheen': 'ShaderNodeBsdfSheen',
  'SheenBSDF': 'ShaderNodeBsdfSheen',

  'ShaderNodeBsdfVelvet': 'ShaderNodeBsdfVelvet',
  'VelvetBSDF': 'ShaderNodeBsdfVelvet',

  'ShaderNodeLayerWeight': 'ShaderNodeLayerWeight',
  'LayerWeightNode': 'ShaderNodeLayerWeight',
  'LayerWeight': 'ShaderNodeLayerWeight',
  'LAYER_WEIGHT': 'ShaderNodeLayerWeight',

  'ShaderNodeHairInfo': 'ShaderNodeHairInfo',
  'HairInfoNode': 'ShaderNodeHairInfo',
  'HairInfo': 'ShaderNodeHairInfo',

  'ShaderNodeWireframe': 'ShaderNodeWireframe',
  'WireframeNode': 'ShaderNodeWireframe',
  'Wireframe': 'ShaderNodeWireframe',

  'ShaderNodeObjectInfo': 'ShaderNodeObjectInfo',
  'ShaderObjectInfoNode': 'ShaderNodeObjectInfo',
  'ShaderObjectInfo': 'ShaderNodeObjectInfo',

  'ShaderNodeParticleInfo': 'ShaderNodeParticleInfo',
  'ParticleInfoNode': 'ShaderNodeParticleInfo',
  'ParticleInfo': 'ShaderNodeParticleInfo',
  'ParticleInfoShaderNode': 'ShaderNodeParticleInfo',
  'ParticleInfo_Shader': 'ShaderNodeParticleInfo',

  'ShaderNodeAddShader': 'ShaderNodeAddShader',
  'AddShaderNode': 'ShaderNodeAddShader',
  'AddShader': 'ShaderNodeAddShader',
  'add_shader': 'ShaderNodeAddShader',

  'ShaderNodeMixShader': 'ShaderNodeMixShader',
  'MixShaderNode': 'ShaderNodeMixShader',
  'MixShader': 'ShaderNodeMixShader',
  'mix_shader': 'ShaderNodeMixShader',

  'ShaderNodeBevel': 'ShaderNodeBevel',
  'BevelNode': 'ShaderNodeBevel',
  'Bevel': 'ShaderNodeBevel',

  'ShaderNodeCameraData': 'ShaderNodeCameraData',
  'CameraDataNode': 'ShaderNodeCameraData',
  'CameraData': 'ShaderNodeCameraData',

  'ShaderNodeNewGeometry': 'ShaderNodeNewGeometry',
  'NewGeometryNode': 'ShaderNodeNewGeometry',
  'NewGeometry': 'ShaderNodeNewGeometry',
  'Geometry': 'ShaderNodeNewGeometry',
  'GeometryNode': 'ShaderNodeNewGeometry',

  'ShaderNodeJoinGeometry': 'ShaderNodeJoinGeometry',
  'JoinGeometryShaderNode': 'ShaderNodeJoinGeometry',
  'JoinGeometry_Shader': 'ShaderNodeJoinGeometry',

  'ShaderNodeValueAlias': 'ShaderNodeValueAlias',
  'ValueShaderNode': 'ShaderNodeValueAlias',
  'Value_Shader': 'ShaderNodeValueAlias',

  'ShaderNodeWavelength': 'ShaderNodeWavelength',
  'WavelengthNode': 'ShaderNodeWavelength',
  'Wavelength': 'ShaderNodeWavelength',

  'ShaderNodeObjectIndex': 'ShaderNodeObjectIndex',
  'ObjectIndexNode': 'ShaderNodeObjectIndex',
  'ObjectIndex': 'ShaderNodeObjectIndex',

  'ShaderNodeMaterialIndex': 'ShaderNodeMaterialIndex',
  'MaterialIndexShaderNode': 'ShaderNodeMaterialIndex',
  'MaterialIndex_Shader': 'ShaderNodeMaterialIndex',

  'ShaderNodeRandomPerIsland': 'ShaderNodeRandomPerIsland',
  'RandomPerIslandNode': 'ShaderNodeRandomPerIsland',
  'RandomPerIsland': 'ShaderNodeRandomPerIsland',

  // ═══════════════════════════════════════════════════════════════════════
  // Light Path Info
  // ═══════════════════════════════════════════════════════════════════════
  'ShaderNodeIsCameraRay': 'ShaderNodeIsCameraRay',
  'IsCameraRayNode': 'ShaderNodeIsCameraRay',
  'IsCameraRay': 'ShaderNodeIsCameraRay',

  'ShaderNodeIsShadowRay': 'ShaderNodeIsShadowRay',
  'IsShadowRayNode': 'ShaderNodeIsShadowRay',
  'IsShadowRay': 'ShaderNodeIsShadowRay',

  'ShaderNodeIsDiffuseRay': 'ShaderNodeIsDiffuseRay',
  'IsDiffuseRayNode': 'ShaderNodeIsDiffuseRay',
  'IsDiffuseRay': 'ShaderNodeIsDiffuseRay',

  'ShaderNodeIsGlossyRay': 'ShaderNodeIsGlossyRay',
  'IsGlossyRayNode': 'ShaderNodeIsGlossyRay',
  'IsGlossyRay': 'ShaderNodeIsGlossyRay',

  'ShaderNodeIsTransmissionRay': 'ShaderNodeIsTransmissionRay',
  'IsTransmissionRayNode': 'ShaderNodeIsTransmissionRay',
  'IsTransmissionRay': 'ShaderNodeIsTransmissionRay',

  'ShaderNodeIsVolumeRay': 'ShaderNodeIsVolumeRay',
  'IsVolumeRayNode': 'ShaderNodeIsVolumeRay',
  'IsVolumeRay': 'ShaderNodeIsVolumeRay',

  'ShaderNodeIsReflectionRay': 'ShaderNodeIsReflectionRay',
  'IsReflectionRayNode': 'ShaderNodeIsReflectionRay',
  'IsReflectionRay': 'ShaderNodeIsReflectionRay',

  'ShaderNodeIsRefractionRay': 'ShaderNodeIsRefractionRay',
  'IsRefractionRayNode': 'ShaderNodeIsRefractionRay',
  'IsRefractionRay': 'ShaderNodeIsRefractionRay',

  'ShaderNodeRayDepth': 'ShaderNodeRayDepth',
  'RayDepthNode': 'ShaderNodeRayDepth',
  'RayDepth': 'ShaderNodeRayDepth',

  'ShaderNodeRayLength': 'ShaderNodeRayLength',
  'RayLengthNode': 'ShaderNodeRayLength',
  'RayLength': 'ShaderNodeRayLength',

  'ShaderNodeLightFalloff': 'ShaderNodeLightFalloff',
  'LightFalloffNode': 'ShaderNodeLightFalloff',
  'LightFalloff': 'ShaderNodeLightFalloff',

  'ShaderNodeEmission_PointLight': 'ShaderNodeEmission_PointLight',
  'PointLightNode': 'ShaderNodeEmission_PointLight',
  'PointLight': 'ShaderNodeEmission_PointLight',

  'ShaderNodeEmission_SpotLight': 'ShaderNodeEmission_SpotLight',
  'SpotLightNode': 'ShaderNodeEmission_SpotLight',
  'SpotLight': 'ShaderNodeEmission_SpotLight',

  'ShaderNodeEmission_SunLight': 'ShaderNodeEmission_SunLight',
  'SunLightNode': 'ShaderNodeEmission_SunLight',
  'SunLight': 'ShaderNodeEmission_SunLight',

  'ShaderNodeEmission_AreaLight': 'ShaderNodeEmission_AreaLight',
  'AreaLightNode': 'ShaderNodeEmission_AreaLight',
  'AreaLight': 'ShaderNodeEmission_AreaLight',

  'LightAttenuationNode': 'ShaderNodeLightFalloff',
  'LightAttenuation': 'ShaderNodeLightFalloff',

  // ═══════════════════════════════════════════════════════════════════════
  // Output Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'NodeGroupOutput': 'NodeGroupOutput',
  'GroupOutputNode': 'NodeGroupOutput',
  'GroupOutput': 'NodeGroupOutput',
  'LODGroupOutput': 'NodeGroupOutput',
  'LOD_GROUP_OUTPUT': 'NodeGroupOutput',

  'ShaderNodeOutputMaterial': 'ShaderNodeOutputMaterial',
  'MaterialOutputNode': 'ShaderNodeOutputMaterial',
  'MaterialOutput': 'ShaderNodeOutputMaterial',
  'OUTPUT_MATERIAL': 'ShaderNodeOutputMaterial',

  'ShaderNodeOutputWorld': 'ShaderNodeOutputWorld',
  'WorldOutput': 'ShaderNodeOutputWorld',

  'CompositorNodeComposite': 'CompositorNodeComposite',
  'CompositeNode': 'CompositorNodeComposite',
  'Composite': 'CompositorNodeComposite',
  'CompositeOutput': 'CompositorNodeComposite',
  'COMPOSITE_OUTPUT': 'CompositorNodeComposite',

  'CompositorNodeViewer': 'CompositorNodeViewer',
  'ViewerNode': 'CompositorNodeViewer',
  'Viewer': 'CompositorNodeViewer',

  'CompositorNodeSplitViewer': 'CompositorNodeSplitViewer',
  'SplitViewerNode': 'CompositorNodeSplitViewer',
  'SplitViewer': 'CompositorNodeSplitViewer',

  'CompositorNodeOutputFile': 'CompositorNodeOutputFile',
  'FileOutputNode': 'CompositorNodeOutputFile',
  'FileOutput': 'CompositorNodeOutputFile',
  'LineOutput': 'CompositorNodeOutputFile',
  'LINE_OUTPUT': 'CompositorNodeOutputFile',

  // ═══════════════════════════════════════════════════════════════════════
  // Modifier Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeArrayModifier': 'GeometryNodeArrayModifier',
  'ArrayModifier': 'GeometryNodeArrayModifier',

  'GeometryNodeBevelModifier': 'GeometryNodeBevelModifier',
  'BevelModifier': 'GeometryNodeBevelModifier',

  'GeometryNodeBooleanModifier': 'GeometryNodeBooleanModifier',
  'BooleanModifier': 'GeometryNodeBooleanModifier',

  'GeometryNodeBuildModifier': 'GeometryNodeBuildModifier',
  'BuildModifier': 'GeometryNodeBuildModifier',

  'GeometryNodeDecimateModifier': 'GeometryNodeDecimateModifier',
  'DecimateModifier': 'GeometryNodeDecimateModifier',
  'DecimateMeshNode': 'GeometryNodeDecimateModifier',
  'DecimateMesh': 'GeometryNodeDecimateModifier',
  'decimate_mesh': 'GeometryNodeDecimateModifier',

  'GeometryNodeEdgeSplitModifier': 'GeometryNodeEdgeSplitModifier',
  'EdgeSplitModifier': 'GeometryNodeEdgeSplitModifier',

  'GeometryNodeMaskModifier': 'GeometryNodeMaskModifier',
  'MaskModifier': 'GeometryNodeMaskModifier',

  'GeometryNodeMirrorModifier': 'GeometryNodeMirrorModifier',
  'MirrorModifier': 'GeometryNodeMirrorModifier',

  'GeometryNodeRemeshModifier': 'GeometryNodeRemeshModifier',
  'RemeshModifier': 'GeometryNodeRemeshModifier',

  'GeometryNodeScrewModifier': 'GeometryNodeScrewModifier',
  'ScrewModifier': 'GeometryNodeScrewModifier',

  'GeometryNodeSkinModifier': 'GeometryNodeSkinModifier',
  'SkinModifier': 'GeometryNodeSkinModifier',

  'GeometryNodeSolidifyModifier': 'GeometryNodeSolidifyModifier',
  'SolidifyModifier': 'GeometryNodeSolidifyModifier',

  'GeometryNodeSubdivisionSurfaceModifier': 'GeometryNodeSubdivisionSurfaceModifier',
  'SubdivisionSurfaceModifier': 'GeometryNodeSubdivisionSurfaceModifier',

  'GeometryNodeWeldModifier': 'GeometryNodeWeldModifier',
  'WeldModifier': 'GeometryNodeWeldModifier',

  // ═══════════════════════════════════════════════════════════════════════
  // Simulate Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeSimulateInput': 'GeometryNodeSimulateInput',
  'SimulateInput': 'GeometryNodeSimulateInput',

  'GeometryNodeRepeatZone': 'GeometryNodeRepeatZone',
  'RepeatZone': 'GeometryNodeRepeatZone',

  'GeometryNodeRepeatOutput': 'GeometryNodeRepeatOutput',
  'RepeatOutput': 'GeometryNodeRepeatOutput',

  'GeometryNodeWhileLoop': 'GeometryNodeWhileLoop',
  'WhileLoop': 'GeometryNodeWhileLoop',

  // ═══════════════════════════════════════════════════════════════════════
  // Text Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeStringJoin': 'GeometryNodeStringJoin',
  'StringJoin': 'GeometryNodeStringJoin',

  'GeometryNodeStringLength': 'GeometryNodeStringLength',
  'StringLength': 'GeometryNodeStringLength',

  'GeometryNodeStringSlice': 'GeometryNodeStringSlice',
  'StringSlice': 'GeometryNodeStringSlice',

  'GeometryNodeValueToString': 'GeometryNodeValueToString',
  'ValueToString': 'GeometryNodeValueToString',

  'GeometryNodeFontString': 'GeometryNodeFontString',
  'FontString': 'GeometryNodeFontString',

  // ═══════════════════════════════════════════════════════════════════════
  // Utility Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeSwitch': 'GeometryNodeSwitch',
  'SwitchNode': 'GeometryNodeSwitch',
  'Switch': 'GeometryNodeSwitch',
  'switch': 'GeometryNodeSwitch',

  'GeometryNodeForEachElementBegin': 'GeometryNodeForEachElementBegin',
  'ForEachElementBegin': 'GeometryNodeForEachElementBegin',

  'GeometryNodeForEachElementEnd': 'GeometryNodeForEachElementEnd',
  'ForEachElementEnd': 'GeometryNodeForEachElementEnd',

  'GeometryNodeRotateEuler': 'GeometryNodeRotateEuler',
  'RotateEulerNode': 'GeometryNodeRotateEuler',
  'RotateEuler': 'GeometryNodeRotateEuler',
  'rotate_euler': 'GeometryNodeRotateEuler',

  'GeometryNodeAlignEulerToVector': 'GeometryNodeAlignEulerToVector',
  'AlignEulerToVectorNode': 'GeometryNodeAlignEulerToVector',
  'AlignEulerToVector': 'GeometryNodeAlignEulerToVector',
  'align_euler_to_vector': 'GeometryNodeAlignEulerToVector',

  'GeometryNodeSmoothByAngle': 'GeometryNodeSmoothByAngle',
  'SmoothByAngleNode': 'GeometryNodeSmoothByAngle',
  'smooth_by_angle': 'GeometryNodeSmoothByAngle',

  'GeometryNodeSubdivisionSurface': 'GeometryNodeSubdivisionSurface',
  'SubdivisionSurfaceNode': 'GeometryNodeSubdivisionSurface',
  'SubdivisionSurface': 'GeometryNodeSubdivisionSurface',
  'subdivision_surface': 'GeometryNodeSubdivisionSurface',

  'GeometryNodeFaceSetBoundaries': 'GeometryNodeFaceSetBoundaries',
  'FaceSetBoundariesNode': 'GeometryNodeFaceSetBoundaries',
  'FaceSetBoundaries': 'GeometryNodeFaceSetBoundaries',
  'face_set_boundaries': 'GeometryNodeFaceSetBoundaries',

  // ═══════════════════════════════════════════════════════════════════════
  // Extended Math / Vector Helpers
  // ═══════════════════════════════════════════════════════════════════════
  'FunctionNodeNormalize': 'FunctionNodeNormalize',
  'NormalizeNode': 'FunctionNodeNormalize',
  'Normalize': 'FunctionNodeNormalize',

  'FunctionNodeQuaternion': 'FunctionNodeQuaternion',
  'QuaternionNode': 'FunctionNodeQuaternion',
  'Quaternion': 'FunctionNodeQuaternion',

  'FunctionNodeMatrixTransform': 'FunctionNodeMatrixTransform',
  'MatrixTransformNode': 'FunctionNodeMatrixTransform',
  'MatrixTransform': 'FunctionNodeMatrixTransform',

  'FunctionNodeDirectionToPoint': 'FunctionNodeDirectionToPoint',
  'DirectionToPointNode': 'FunctionNodeDirectionToPoint',
  'DirectionToPoint': 'FunctionNodeDirectionToPoint',

  'FunctionNodeReflect': 'FunctionNodeReflect',
  'ReflectNode': 'FunctionNodeReflect',
  'Reflect': 'FunctionNodeReflect',

  'FunctionNodeRefract': 'FunctionNodeRefract',
  'RefractNode': 'FunctionNodeRefract',
  'Refract': 'FunctionNodeRefract',

  'FunctionNodeFaceForward': 'FunctionNodeFaceForward',
  'FaceForwardNode': 'FunctionNodeFaceForward',
  'FaceForward': 'FunctionNodeFaceForward',

  'FunctionNodeWrap': 'FunctionNodeWrap',
  'WrapNode': 'FunctionNodeWrap',
  'Wrap': 'FunctionNodeWrap',

  'FunctionNodeSnap': 'FunctionNodeSnap',
  'SnapNode': 'FunctionNodeSnap',
  'Snap': 'FunctionNodeSnap',

  'FunctionNodeFloorCeil': 'FunctionNodeFloorCeil',
  'FloorCeilNode': 'FunctionNodeFloorCeil',
  'FloorCeil': 'FunctionNodeFloorCeil',

  'FunctionNodeModulo': 'FunctionNodeModulo',
  'ModuloNode': 'FunctionNodeModulo',
  'Modulo': 'FunctionNodeModulo',

  'FunctionNodeFraction': 'FunctionNodeFraction',
  'FractionNode': 'FunctionNodeFraction',
  'Fraction': 'FunctionNodeFraction',

  'FunctionNodeAbsolute': 'FunctionNodeAbsolute',
  'AbsoluteNode': 'FunctionNodeAbsolute',
  'Absolute': 'FunctionNodeAbsolute',

  'FunctionNodeMinMax': 'FunctionNodeMinMax',
  'MinMaxNode': 'FunctionNodeMinMax',
  'MinMax': 'FunctionNodeMinMax',

  'FunctionNodeTrigonometry': 'FunctionNodeTrigonometry',
  'TrigonometryNode': 'FunctionNodeTrigonometry',
  'Trigonometry': 'FunctionNodeTrigonometry',

  'FunctionNodePowerLog': 'FunctionNodePowerLog',
  'PowerLogNode': 'FunctionNodePowerLog',
  'PowerLog': 'FunctionNodePowerLog',

  'FunctionNodeSign': 'FunctionNodeSign',
  'SignNode': 'FunctionNodeSign',
  'Sign': 'FunctionNodeSign',

  'FunctionNodeSmoothMinMax': 'FunctionNodeSmoothMinMax',
  'SmoothMinMaxNode': 'FunctionNodeSmoothMinMax',
  'SmoothMinMax': 'FunctionNodeSmoothMinMax',

  'FunctionNodeAngleBetween': 'FunctionNodeAngleBetween',
  'AngleBetweenNode': 'FunctionNodeAngleBetween',
  'AngleBetween': 'FunctionNodeAngleBetween',

  'FunctionNodeSlerp': 'FunctionNodeSlerp',
  'SlerpNode': 'FunctionNodeSlerp',
  'Slerp': 'FunctionNodeSlerp',

  'FunctionNodePolarToCart': 'FunctionNodePolarToCart',
  'PolarToCartNode': 'FunctionNodePolarToCart',
  'PolarToCart': 'FunctionNodePolarToCart',

  'FunctionNodeCartToPolar': 'FunctionNodeCartToPolar',
  'CartToPolarNode': 'FunctionNodeCartToPolar',
  'CartToPolar': 'FunctionNodeCartToPolar',

  // ═══════════════════════════════════════════════════════════════════════
  // Point Domain Specific Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodePointDomain': 'GeometryNodePointDomain',
  'PointDomainNode': 'GeometryNodePointDomain',
  'PointDomain': 'GeometryNodePointDomain',

  'GeometryNodePointDomainSize': 'GeometryNodePointDomainSize',
  'PointDomainSizeNode': 'GeometryNodePointDomainSize',
  'PointDomainSize': 'GeometryNodePointDomainSize',

  'GeometryNodePointIndex': 'GeometryNodePointIndex',
  'PointIndexNode': 'GeometryNodePointIndex',
  'PointIndex': 'GeometryNodePointIndex',

  'GeometryNodePointPosition': 'GeometryNodePointPosition',
  'PointPositionNode': 'GeometryNodePointPosition',
  'PointPosition': 'GeometryNodePointPosition',

  'GeometryNodePointVelocity': 'GeometryNodePointVelocity',
  'PointVelocityNode': 'GeometryNodePointVelocity',
  'PointVelocity': 'GeometryNodePointVelocity',

  'GeometryNodePointRotation': 'GeometryNodePointRotation',
  'PointRotationNode': 'GeometryNodePointRotation',
  'PointRotation': 'GeometryNodePointRotation',

  'GeometryNodePointScale': 'GeometryNodePointScale',
  'PointScaleNode': 'GeometryNodePointScale',
  'PointScale': 'GeometryNodePointScale',

  'GeometryNodePointCount': 'GeometryNodePointCount',
  'PointCountNode': 'GeometryNodePointCount',
  'PointCount': 'GeometryNodePointCount',

  'GeometryNodePointMaterialIndex': 'GeometryNodePointMaterialIndex',
  'PointMaterialIndexNode': 'GeometryNodePointMaterialIndex',
  'PointMaterialIndex': 'GeometryNodePointMaterialIndex',

  'GeometryNodePointNamedAttribute': 'GeometryNodePointNamedAttribute',
  'PointNamedAttributeNode': 'GeometryNodePointNamedAttribute',
  'PointNamedAttribute': 'GeometryNodePointNamedAttribute',

  'GeometryNodePointCaptureAttribute': 'GeometryNodePointCaptureAttribute',
  'PointCaptureAttributeNode': 'GeometryNodePointCaptureAttribute',
  'PointCaptureAttribute': 'GeometryNodePointCaptureAttribute',

  'GeometryNodePointTransferAttribute': 'GeometryNodePointTransferAttribute',
  'PointTransferAttributeNode': 'GeometryNodePointTransferAttribute',
  'PointTransferAttribute': 'GeometryNodePointTransferAttribute',

  'GeometryNodePointStoreNamedAttribute': 'GeometryNodePointStoreNamedAttribute',
  'PointStoreNamedAttributeNode': 'GeometryNodePointStoreNamedAttribute',
  'PointStoreNamedAttribute': 'GeometryNodePointStoreNamedAttribute',

  'GeometryNodePointSampleIndex': 'GeometryNodePointSampleIndex',
  'PointSampleIndexNode': 'GeometryNodePointSampleIndex',
  'PointSampleIndex': 'GeometryNodePointSampleIndex',

  'GeometryNodePointSampleNearest': 'GeometryNodePointSampleNearest',
  'PointSampleNearestNode': 'GeometryNodePointSampleNearest',
  'PointSampleNearest': 'GeometryNodePointSampleNearest',

  'GeometryNodePointSampleNearestSurface': 'GeometryNodePointSampleNearestSurface',
  'PointSampleNearestSurfaceNode': 'GeometryNodePointSampleNearestSurface',
  'PointSampleNearestSurface': 'GeometryNodePointSampleNearestSurface',

  'GeometryNodePointAttributeStatistic': 'GeometryNodePointAttributeStatistic',
  'PointAttributeStatisticNode': 'GeometryNodePointAttributeStatistic',
  'PointAttributeStatistic': 'GeometryNodePointAttributeStatistic',

  'GeometryNodePointBlurAttribute': 'GeometryNodePointBlurAttribute',
  'PointBlurAttributeNode': 'GeometryNodePointBlurAttribute',
  'PointBlurAttribute': 'GeometryNodePointBlurAttribute',

  'GeometryNodePointAccumulateAttribute': 'GeometryNodePointAccumulateAttribute',
  'PointAccumulateAttributeNode': 'GeometryNodePointAccumulateAttribute',
  'PointAccumulateAttribute': 'GeometryNodePointAccumulateAttribute',

  'GeometryNodePointEvaluateOnDomain': 'GeometryNodePointEvaluateOnDomain',
  'PointEvaluateonDomainNode': 'GeometryNodePointEvaluateOnDomain',
  'PointEvaluateonDomain': 'GeometryNodePointEvaluateOnDomain',

  'GeometryNodePointInterpolateCurves': 'GeometryNodePointInterpolateCurves',
  'PointInterpolateCurvesNode': 'GeometryNodePointInterpolateCurves',
  'PointInterpolateCurves': 'GeometryNodePointInterpolateCurves',

  'GeometryNodePointSampleUVSurface': 'GeometryNodePointSampleUVSurface',
  'PointSampleUVSurfaceNode': 'GeometryNodePointSampleUVSurface',
  'PointSampleUVSurface': 'GeometryNodePointSampleUVSurface',

  'GeometryNodePointIsViewport': 'GeometryNodePointIsViewport',
  'PointIsViewportNode': 'GeometryNodePointIsViewport',
  'PointIsViewport': 'GeometryNodePointIsViewport',

  'GeometryNodePointImageInfo': 'GeometryNodePointImageInfo',
  'PointImageInfoNode': 'GeometryNodePointImageInfo',
  'PointImageInfo': 'GeometryNodePointImageInfo',

  'GeometryNodePointCurveOfPoint': 'GeometryNodePointCurveOfPoint',
  'PointCurveofPointNode': 'GeometryNodePointCurveOfPoint',
  'PointCurveofPoint': 'GeometryNodePointCurveOfPoint',

  'GeometryNodePointCurvesInfo': 'GeometryNodePointCurvesInfo',
  'PointCurvesInfoNode': 'GeometryNodePointCurvesInfo',
  'PointCurvesInfo': 'GeometryNodePointCurvesInfo',

  'GeometryNodePointRadius': 'GeometryNodePointRadius',
  'PointRadiusNode': 'GeometryNodePointRadius',
  'PointRadius': 'GeometryNodePointRadius',
  'RadiusInput': 'GeometryNodePointRadius',
  'RadiusInputNode': 'GeometryNodePointRadius',

  'GeometryNodePointEndpointSelection': 'GeometryNodePointEndpointSelection',
  'PointEndpointSelectionNode': 'GeometryNodePointEndpointSelection',
  'PointEndpointSelection': 'GeometryNodePointEndpointSelection',

  'GeometryNodePointsOfCurve': 'GeometryNodePointsOfCurve',
  'PointsofCurveNode': 'GeometryNodePointsOfCurve',
  'PointsofCurve': 'GeometryNodePointsOfCurve',

  'GeometryNodePointSplineResolution': 'GeometryNodePointSplineResolution',
  'PointSplineResolutionNode': 'GeometryNodePointSplineResolution',
  'PointSplineResolution': 'GeometryNodePointSplineResolution',

  'GeometryNodePointOffsetPointInCurve': 'GeometryNodePointOffsetPointInCurve',
  'PointOffsetPointinCurveNode': 'GeometryNodePointOffsetPointInCurve',
  'PointOffsetPointinCurve': 'GeometryNodePointOffsetPointInCurve',

  'GeometryNodePointSplineType': 'GeometryNodePointSplineType',
  'PointSplineTypeNode': 'GeometryNodePointSplineType',
  'PointSplineType': 'GeometryNodePointSplineType',

  'GeometryNodePointSplineLength': 'GeometryNodePointSplineLength',
  'PointSplineLengthNode': 'GeometryNodePointSplineLength',
  'PointSplineLength': 'GeometryNodePointSplineLength',

  'GeometryNodePointCurveTangent': 'GeometryNodePointCurveTangent',
  'PointCurveTangentNode': 'GeometryNodePointCurveTangent',
  'PointCurveTangent': 'GeometryNodePointCurveTangent',

  // ═══════════════════════════════════════════════════════════════════════
  // Volume Domain Specific Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeVolumeSample': 'GeometryNodeVolumeSample',
  'VolumeSampleNode': 'GeometryNodeVolumeSample',
  'VolumeSample': 'GeometryNodeVolumeSample',

  'GeometryNodeVolumeValue': 'GeometryNodeVolumeValue',
  'VolumeValueNode': 'GeometryNodeVolumeValue',
  'VolumeValue': 'GeometryNodeVolumeValue',

  'GeometryNodeVolumeDensity': 'GeometryNodeVolumeDensity',
  'VolumeDensityNode': 'GeometryNodeVolumeDensity',
  'VolumeDensity': 'GeometryNodeVolumeDensity',

  'GeometryNodeVolumeEmission': 'GeometryNodeVolumeEmission',
  'VolumeEmissionNode': 'GeometryNodeVolumeEmission',
  'VolumeEmission': 'GeometryNodeVolumeEmission',

  'GeometryNodeVolumeAbsorptionAlias': 'GeometryNodeVolumeAbsorptionAlias',

  'GeometryNodeVolumeScattering': 'GeometryNodeVolumeScattering',

  'GeometryNodeVolumePrincipledAlias': 'GeometryNodeVolumePrincipledAlias',
  'VolumePrincipledNode': 'GeometryNodeVolumePrincipledAlias',
  'VolumePrincipled': 'GeometryNodeVolumePrincipledAlias',

  'GeometryNodeVolumeInfo': 'GeometryNodeVolumeInfo',
  'VolumeInfoNode': 'GeometryNodeVolumeInfo',
  'VolumeInfo': 'GeometryNodeVolumeInfo',

  'GeometryNodeVolumeMaterialIndex': 'GeometryNodeVolumeMaterialIndex',
  'VolumeMaterialIndexNode': 'GeometryNodeVolumeMaterialIndex',
  'VolumeMaterialIndex': 'GeometryNodeVolumeMaterialIndex',

  'GeometryNodeVolumeNamedAttribute': 'GeometryNodeVolumeNamedAttribute',
  'VolumeNamedAttributeNode': 'GeometryNodeVolumeNamedAttribute',
  'VolumeNamedAttribute': 'GeometryNodeVolumeNamedAttribute',

  'GeometryNodeVolumeCaptureAttribute': 'GeometryNodeVolumeCaptureAttribute',
  'VolumeCaptureAttributeNode': 'GeometryNodeVolumeCaptureAttribute',
  'VolumeCaptureAttribute': 'GeometryNodeVolumeCaptureAttribute',

  'GeometryNodeVolumeTransferAttribute': 'GeometryNodeVolumeTransferAttribute',
  'VolumeTransferAttributeNode': 'GeometryNodeVolumeTransferAttribute',
  'VolumeTransferAttribute': 'GeometryNodeVolumeTransferAttribute',

  'GeometryNodeVolumeStoreNamedAttribute': 'GeometryNodeVolumeStoreNamedAttribute',
  'VolumeStoreNamedAttributeNode': 'GeometryNodeVolumeStoreNamedAttribute',
  'VolumeStoreNamedAttribute': 'GeometryNodeVolumeStoreNamedAttribute',

  'GeometryNodeVolumeSampleIndex': 'GeometryNodeVolumeSampleIndex',
  'VolumeSampleIndexNode': 'GeometryNodeVolumeSampleIndex',
  'VolumeSampleIndex': 'GeometryNodeVolumeSampleIndex',

  'GeometryNodeVolumeSampleNearest': 'GeometryNodeVolumeSampleNearest',
  'VolumeSampleNearestNode': 'GeometryNodeVolumeSampleNearest',
  'VolumeSampleNearest': 'GeometryNodeVolumeSampleNearest',

  'GeometryNodeVolumeSampleNearestSurface': 'GeometryNodeVolumeSampleNearestSurface',
  'VolumeSampleNearestSurfaceNode': 'GeometryNodeVolumeSampleNearestSurface',
  'VolumeSampleNearestSurface': 'GeometryNodeVolumeSampleNearestSurface',

  'GeometryNodeVolumeAttributeStatistic': 'GeometryNodeVolumeAttributeStatistic',
  'VolumeAttributeStatisticNode': 'GeometryNodeVolumeAttributeStatistic',
  'VolumeAttributeStatistic': 'GeometryNodeVolumeAttributeStatistic',

  'GeometryNodeVolumeBlurAttribute': 'GeometryNodeVolumeBlurAttribute',
  'VolumeBlurAttributeNode': 'GeometryNodeVolumeBlurAttribute',
  'VolumeBlurAttribute': 'GeometryNodeVolumeBlurAttribute',

  'GeometryNodeVolumeAccumulateAttribute': 'GeometryNodeVolumeAccumulateAttribute',
  'VolumeAccumulateAttributeNode': 'GeometryNodeVolumeAccumulateAttribute',
  'VolumeAccumulateAttribute': 'GeometryNodeVolumeAccumulateAttribute',

  'GeometryNodeVolumeEvaluateOnDomain': 'GeometryNodeVolumeEvaluateOnDomain',
  'VolumeEvaluateonDomainNode': 'GeometryNodeVolumeEvaluateOnDomain',
  'VolumeEvaluateonDomain': 'GeometryNodeVolumeEvaluateOnDomain',

  // ═══════════════════════════════════════════════════════════════════════
  // Extended Output Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'CompositorNodeDepthOutput': 'CompositorNodeDepthOutput',
  'DepthOutputNode': 'CompositorNodeDepthOutput',
  'DepthOutput': 'CompositorNodeDepthOutput',

  'CompositorNodeNormalOutput': 'CompositorNodeNormalOutput',
  'NormalOutputNode': 'CompositorNodeNormalOutput',
  'NormalOutput': 'CompositorNodeNormalOutput',
  'OUTPUT_NORMAL': 'CompositorNodeNormalOutput',

  'CompositorNodeAOOutput': 'CompositorNodeAOOutput',
  'AOOutputNode': 'CompositorNodeAOOutput',
  'AOOutput': 'CompositorNodeAOOutput',

  'CompositorNodeEmissionOutput': 'CompositorNodeEmissionOutput',
  'EmissionOutputNode': 'CompositorNodeEmissionOutput',
  'EmissionOutput': 'CompositorNodeEmissionOutput',

  'CompositorNodeAlbedoOutput': 'CompositorNodeAlbedoOutput',
  'AlbedoOutputNode': 'CompositorNodeAlbedoOutput',
  'AlbedoOutput': 'CompositorNodeAlbedoOutput',
  'OUTPUT_COLOR': 'CompositorNodeAlbedoOutput',

  'CompositorNodeDiffuseOutput': 'CompositorNodeDiffuseOutput',
  'DiffuseOutputNode': 'CompositorNodeDiffuseOutput',
  'DiffuseOutput': 'CompositorNodeDiffuseOutput',

  'CompositorNodeGlossyOutput': 'CompositorNodeGlossyOutput',
  'GlossyOutputNode': 'CompositorNodeGlossyOutput',
  'GlossyOutput': 'CompositorNodeGlossyOutput',

  'CompositorNodeTransmissionOutput': 'CompositorNodeTransmissionOutput',
  'TransmissionOutputNode': 'CompositorNodeTransmissionOutput',
  'TransmissionOutput': 'CompositorNodeTransmissionOutput',

  'CompositorNodeVolumeOutput': 'CompositorNodeVolumeOutput',
  'VolumeOutputNode': 'CompositorNodeVolumeOutput',
  'VolumeOutput': 'CompositorNodeVolumeOutput',

  'CompositorNodeShadowOutput': 'CompositorNodeShadowOutput',
  'ShadowOutputNode': 'CompositorNodeShadowOutput',
  'ShadowOutput': 'CompositorNodeShadowOutput',

  'CompositorNodeCryptomatteOutput': 'CompositorNodeCryptomatteOutput',
  'CryptomatteOutputNode': 'CompositorNodeCryptomatteOutput',
  'CryptomatteOutput': 'CompositorNodeCryptomatteOutput',

  'CompositorNodeCryptomatteMatteOutput': 'CompositorNodeCryptomatteMatteOutput',
  'CryptomatteMatteOutputNode': 'CompositorNodeCryptomatteMatteOutput',
  'CryptomatteMatteOutput': 'CompositorNodeCryptomatteMatteOutput',

  'CompositorNodeImageOutput': 'CompositorNodeImageOutput',
  'ImageOutputNode': 'CompositorNodeImageOutput',
  'ImageOutput': 'CompositorNodeImageOutput',

  'CompositorNodeMovieOutput': 'CompositorNodeMovieOutput',
  'MovieOutputNode': 'CompositorNodeMovieOutput',
  'MovieOutput': 'CompositorNodeMovieOutput',

  'CompositorNodeSoundOutput': 'CompositorNodeSoundOutput',
  'SoundOutputNode': 'CompositorNodeSoundOutput',
  'SoundOutput': 'CompositorNodeSoundOutput',

  'GeometryNodeLevelOfDetail': 'GeometryNodeLevelOfDetail',
  'LevelOfDetailNode': 'GeometryNodeLevelOfDetail',
  'LevelOfDetail': 'GeometryNodeLevelOfDetail',

  'CompositorNodeRenderLayer': 'CompositorNodeRenderLayer',
  'RenderLayerNode': 'CompositorNodeRenderLayer',
  'RenderLayer': 'CompositorNodeRenderLayer',

  'CompositorNodeUVOutput': 'CompositorNodeUVOutput',
  'UVOutputNode': 'CompositorNodeUVOutput',
  'UVOutput': 'CompositorNodeUVOutput',

  'GeometryNodeInstanceOutput': 'GeometryNodeInstanceOutput',
  'InstanceOutputNode': 'GeometryNodeInstanceOutput',
  'InstanceOutput': 'GeometryNodeInstanceOutput',

  'GeometryNodePointCloudOutput': 'GeometryNodePointCloudOutput',
  'PointCloudOutputNode': 'GeometryNodePointCloudOutput',
  'PointCloudOutput': 'GeometryNodePointCloudOutput',

  'GeometryNodeTextOutput': 'GeometryNodeTextOutput',
  'TextOutputNode': 'GeometryNodeTextOutput',
  'TextOutput': 'GeometryNodeTextOutput',

  'GeometryNodeBoundingBoxOutput': 'GeometryNodeBoundingBoxOutput',
  'BoundingBoxOutputNode': 'GeometryNodeBoundingBoxOutput',
  'BoundingBoxOutput': 'GeometryNodeBoundingBoxOutput',

  'GeometryNodeWireframeOutput': 'GeometryNodeWireframeOutput',
  'WireframeOutputNode': 'GeometryNodeWireframeOutput',
  'WireframeOutput': 'GeometryNodeWireframeOutput',

  'GeometryNodeDebugOutput': 'GeometryNodeDebugOutput',
  'DebugOutputNode': 'GeometryNodeDebugOutput',
  'DebugOutput': 'GeometryNodeDebugOutput',

  'CompositorNodeViewLevel': 'CompositorNodeViewLevel',
  'ViewLevelNode': 'CompositorNodeViewLevel',
  'ViewLevel': 'CompositorNodeViewLevel',

  // ═══════════════════════════════════════════════════════════════════════
  // Additional Geometry Nodes
  // ═══════════════════════════════════════════════════════════════════════
  'GeometryNodeInsetFaces': 'GeometryNodeInsetFaces',
  'InsetFacesNode': 'GeometryNodeInsetFaces',
  'InsetFaces': 'GeometryNodeInsetFaces',
  'inset_faces': 'GeometryNodeInsetFaces',

  'GeometryNodeRotateMesh': 'GeometryNodeRotateMesh',
  'RotateMeshNode': 'GeometryNodeRotateMesh',
  'RotateMesh': 'GeometryNodeRotateMesh',
  'rotate_mesh': 'GeometryNodeRotateMesh',

  'GeometryNodeScaleMesh': 'GeometryNodeScaleMesh',
  'ScaleMeshNode': 'GeometryNodeScaleMesh',
  'ScaleMesh': 'GeometryNodeScaleMesh',
  'scale_mesh': 'GeometryNodeScaleMesh',

  'GeometryNodeTranslateMesh': 'GeometryNodeTranslateMesh',
  'TranslateMeshNode': 'GeometryNodeTranslateMesh',
  'TranslateMesh': 'GeometryNodeTranslateMesh',
  'translate_mesh': 'GeometryNodeTranslateMesh',

  'GeometryNodeRotateVector': 'GeometryNodeRotateVector',
  'RotateVectorNode': 'GeometryNodeRotateVector',
  'RotateVector': 'GeometryNodeRotateVector',
  'rotate_vector': 'GeometryNodeRotateVector',
};
