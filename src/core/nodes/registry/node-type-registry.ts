/**
 * Node Type Registry — Single canonical source of truth for node type identifiers
 *
 * This module provides the definitive registry for resolving any node type alias
 * to its canonical Blender-style form. It replaces the old dual-enum system
 * (`NodeTypes` in `node-types.ts` and `NodeType` in `types.ts`) with a single,
 * clean, O(1) alias resolution mechanism.
 *
 * ## Design Principles
 *
 * 1. **Single canonical source of truth**: All node types use Blender-style
 *    identifiers (e.g., `ShaderNodeTexNoise`, `GeometryNodeSetPosition`)
 * 2. **O(1) alias resolution**: A plain object map that maps any alias to its
 *    canonical form — no if-else chains, no enum lookups
 * 3. **Runtime extensibility**: New node types can be registered at runtime
 *    via `registerNodeType()`
 * 4. **No deprecated shims**: Clean API only — no re-exports from old enums
 *
 * ## Canonical Form
 *
 * The canonical form uses Blender's native node identifier strings:
 * - `ShaderNodeTexNoise` (not `NoiseTextureNode` or `noise_texture`)
 * - `GeometryNodeSetPosition` (not `SetPositionNode` or `set_position`)
 * - `ShaderNodeBsdfPrincipled` (not `PrincipledBSDFNode` or `principled_bsdf`)
 *
 * This matches the original Infinigen Python codebase and Blender's internal
 * identifiers, making it the most stable and well-documented choice.
 *
 * ## Usage
 *
 * ```ts
 * import {
 *   resolveNodeType,
 *   isKnownNodeType,
 *   getAliasesForCanonical,
 *   registerNodeType,
 *   getCanonicalNodeTypes,
 *   getNodeCategory,
 * } from './registry/node-type-registry';
 *
 * // Resolve any alias to canonical form
 * resolveNodeType('ShaderNodeTexNoise');    // 'ShaderNodeTexNoise'
 * resolveNodeType('NoiseTextureNode');      // 'ShaderNodeTexNoise'
 * resolveNodeType('noise_texture');         // 'ShaderNodeTexNoise'
 * resolveNodeType('TextureNoise');          // 'ShaderNodeTexNoise'
 *
 * // Check if a type is known
 * isKnownNodeType('ShaderNodeTexNoise');    // true
 * isKnownNodeType('UnknownNode');           // false
 *
 * // Get all aliases for a canonical type
 * getAliasesForCanonical('ShaderNodeTexNoise');
 * // ['ShaderNodeTexNoise', 'TextureNoise', 'TextureNoiseNode', ...]
 *
 * // Extend the registry at runtime
 * registerNodeType('GeometryNodeCustomFoo', ['CustomFooNode', 'custom_foo']);
 *
 * // Get all canonical node types
 * getCanonicalNodeTypes();  // ['CompositorNodeBrightContrast', ...]
 *
 * // Get the category prefix of a node type
 * getNodeCategory('ShaderNodeTexNoise');    // 'Shader'
 * getNodeCategory('GeometryNodeSetPosition'); // 'Geometry'
 * getNodeCategory('FunctionNodeCompare');   // 'Function'
 * ```
 *
 * @module core/nodes/registry
 */

import { ALIAS_DATA } from './alias-data';

// ============================================================================
// Canonical NodeType — string type representing all Blender-style identifiers
// ============================================================================

/**
 * Canonical node type identifiers.
 *
 * These are the Blender-style names used as the single source of truth.
 * The string type union ensures type safety when the canonical form is used
 * directly in TypeScript code.
 *
 * Every member of this union has a corresponding identity entry in the
 * alias data (canonical → canonical), plus zero or more alias entries
 * that also resolve to it.
 */
export type NodeType =
  // ── Mix & Utility ──────────────────────────────────────────────────────
  | 'ShaderNodeMix'
  // ── Attribute ──────────────────────────────────────────────────────────
  | 'ShaderNodeAttribute'
  | 'GeometryNodeCaptureAttribute'
  | 'GeometryNodeAttributeStatistic'
  | 'GeometryNodeAttributeTransfer'
  | 'GeometryNodeAttributeDomainSize'
  | 'GeometryNodeStoreNamedAttribute'
  | 'GeometryNodeInputNamedAttribute'
  | 'GeometryNodeRemoveAttribute'
  | 'GeometryNodeSampleIndex'
  | 'GeometryNodeSampleNearest'
  | 'GeometryNodeSampleNearestSurface'
  // ── Color ──────────────────────────────────────────────────────────────
  | 'ShaderNodeValToRGB'
  | 'ShaderNodeMixRGB'
  | 'ShaderNodeRGBCurve'
  | 'CompositorNodeBrightContrast'
  | 'CompositorNodeExposure'
  | 'ShaderNodeCombineHSV'
  | 'ShaderNodeSeparateRGB'
  | 'ShaderNodeSeparateColor'
  | 'ShaderNodeCombineRGB'
  | 'ShaderNodeCombineColor'
  | 'FunctionNodeCombineColor'
  | 'ShaderNodeHueSaturation'
  | 'ShaderNodeInvert'
  // ── Curve ──────────────────────────────────────────────────────────────
  | 'GeometryNodeCurveToMesh'
  | 'GeometryNodeCurveToPoints'
  | 'GeometryNodeMeshToCurve'
  | 'GeometryNodeSampleCurve'
  | 'GeometryNodeSetCurveRadius'
  | 'GeometryNodeSetCurveTilt'
  | 'GeometryNodeCurveLength'
  | 'GeometryNodeCurveSplineType'
  | 'GeometryNodeSetCurveHandlePositions'
  | 'GeometryNodeSplineParameter'
  | 'GeometryNodeSubdivideCurve'
  | 'GeometryNodeResampleCurve'
  | 'GeometryNodeTrimCurve'
  | 'GeometryNodeReverseCurve'
  | 'GeometryNodeFillCurve'
  | 'GeometryNodeFilletCurve'
  // ── Curve Primitives ───────────────────────────────────────────────────
  | 'GeometryNodeCurvePrimitiveCircle'
  | 'GeometryNodeCurvePrimitiveLine'
  | 'GeometryNodeCurvePrimitiveBezierSegment'
  | 'GeometryNodeCurveQuadraticBezier'
  // ── Geometry ───────────────────────────────────────────────────────────
  | 'GeometryNodeSetPosition'
  | 'GeometryNodeJoinGeometry'
  | 'GeometryNodeMergeByDistance'
  | 'GeometryNodeSeparateGeometry'
  | 'GeometryNodeBoundBox'
  | 'GeometryNodeTransform'
  | 'GeometryNodeDeleteGeometry'
  | 'GeometryNodeProximity'
  | 'GeometryNodeConvexHull'
  | 'GeometryNodeRaycast'
  | 'GeometryNodeDuplicateElements'
  | 'GeometryNodeTriangulate'
  // ── Input ──────────────────────────────────────────────────────────────
  | 'NodeGroupInput'
  | 'ShaderNodeRGB'
  | 'FunctionNodeInputBool'
  | 'ShaderNodeValue'
  | 'FunctionNodeRandomValue'
  | 'GeometryNodeCollectionInfo'
  | 'GeometryNodeObjectInfo'
  | 'FunctionNodeInputVector'
  | 'GeometryNodeInputID'
  | 'GeometryNodeInputPosition'
  | 'GeometryNodeInputNormal'
  | 'GeometryNodeInputMeshEdgeVertices'
  | 'GeometryNodeInputMeshEdgeAngle'
  | 'FunctionNodeInputColor'
  | 'GeometryNodeInputMeshFaceArea'
  | 'ShaderNodeTexCoord'
  | 'GeometryNodeInputIndex'
  | 'ShaderNodeAmbientOcclusion'
  | 'FunctionNodeInputInt'
  | 'ShaderNodeLightPath'
  | 'ShaderNodeBlackbody'
  | 'FunctionNodeInputFloat'
  | 'GeometryNodeInputTangent'
  | 'GeometryNodeSelfObject'
  // ── Instances ──────────────────────────────────────────────────────────
  | 'GeometryNodeRealizeInstances'
  | 'GeometryNodeInstanceOnPoints'
  | 'GeometryNodeTranslateInstances'
  | 'GeometryNodeRotateInstances'
  | 'GeometryNodeScaleInstances'
  // ── Material ───────────────────────────────────────────────────────────
  | 'GeometryNodeSetMaterial'
  | 'GeometryNodeSetMaterialIndex'
  | 'GeometryNodeInputMaterialIndex'
  | 'ShaderNodeMaterialInfo'
  // ── Mesh ───────────────────────────────────────────────────────────────
  | 'GeometryNodeSubdivideMesh'
  | 'GeometryNodeMeshToVolume'
  | 'GeometryNodeMeshToPoints'
  | 'GeometryNodeSetMeshNormals'
  | 'GeometryNodeSetShadeSmooth'
  | 'GeometryNodeSplitEdges'
  | 'GeometryNodeExtrudeMesh'
  | 'GeometryNodeOffsetFace'
  | 'GeometryNodeMeshBoolean'
  | 'GeometryNodeDualMesh'
  | 'GeometryNodeScaleElements'
  | 'GeometryNodeFlipFaces'
  | 'GeometryNodeEdgeNeighbors'
  | 'GeometryNodeEdgesOfVertex'
  | 'GeometryNodeVerticesOfEdge'
  | 'GeometryNodeVerticesOfFace'
  | 'GeometryNodeEdgesOfFace'
  | 'GeometryNodeFacesOfEdge'
  | 'GeometryNodeFacesOfVertex'
  | 'GeometryNodeFaceCorners'
  | 'GeometryNodeNamedCorner'
  | 'GeometryNodeCornerNormal'
  | 'GeometryNodeCornerAngle'
  | 'GeometryNodeCornerVertexIndex'
  | 'GeometryNodeCornerEdgeIndex'
  | 'GeometryNodeCornerFaceIndex'
  | 'GeometryNodeInputUVMap'
  | 'GeometryNodeUVWarp'
  | 'GeometryNodeSetUV'
  | 'GeometryNodeMeshInfo'
  // ── Mesh Primitives ────────────────────────────────────────────────────
  | 'GeometryNodeMeshCube'
  | 'GeometryNodeMeshCylinder'
  | 'GeometryNodeMeshCone'
  | 'GeometryNodeMeshUVSphere'
  | 'GeometryNodeMeshIcoSphere'
  | 'GeometryNodeMeshTorus'
  | 'GeometryNodeMeshPlane'
  | 'GeometryNodeMeshCircle'
  | 'GeometryNodeGrid'
  | 'GeometryNodeMeshMonkey'
  | 'GeometryNodeMeshLine'
  // ── Point ──────────────────────────────────────────────────────────────
  | 'GeometryNodeDistributePointsInVolume'
  | 'GeometryNodeDistributePointsOnFaces'
  | 'GeometryNodePointsToCurves'
  | 'GeometryNodePointsToVolumes'
  | 'GeometryNodePointsToVertices'
  | 'GeometryNodePoints'
  // ── Volume ─────────────────────────────────────────────────────────────
  | 'GeometryNodeVolumeToMesh'
  | 'GeometryNodeVolumeToPoints'
  | 'GeometryNodeVolumeToCurve'
  | 'ShaderNodeVolumeInfo'
  // ── Texture ────────────────────────────────────────────────────────────
  | 'ShaderNodeTexImage'
  | 'ShaderNodeTexVoronoi'
  | 'ShaderNodeTexNoise'
  | 'ShaderNodeTexGradient'
  | 'ShaderNodeTexMagic'
  | 'ShaderNodeTexWave'
  | 'ShaderNodeTexBrick'
  | 'ShaderNodeTexChecker'
  | 'ShaderNodePointDensity'
  | 'ShaderNodeTexWhiteNoise'
  | 'ShaderNodeTexMusgrave'
  | 'ShaderNodeTexSky'
  | 'ShaderNodeTexEnvironment'
  | 'ShaderNodeTexGabor'
  // ── Converter / Math ───────────────────────────────────────────────────
  | 'ShaderNodeRGBToBW'
  | 'ShaderNodeMapRange'
  | 'ShaderNodeMath'
  | 'ShaderNodeVectorMath'
  | 'ShaderNodeFloatCurve'
  | 'ShaderNodeClamp'
  | 'ShaderNodeCombineXYZ'
  | 'ShaderNodeSeparateXYZ'
  | 'ShaderNodeCombineRGBA'
  | 'ShaderNodeSeparateRGBA'
  | 'ShaderNodeSeparateHSV'
  | 'GeometryNodeFloatToInt'
  | 'FunctionNodeCompare'
  | 'FunctionNodeBooleanMath'
  | 'FunctionNodeFloatCompare'
  // ── Vector ─────────────────────────────────────────────────────────────
  | 'ShaderNodeNormal'
  | 'ShaderNodeNormalMap'
  | 'ShaderNodeTangent'
  | 'ShaderNodeVectorRotate'
  | 'ShaderNodeVectorTransform'
  | 'ShaderNodeBump'
  | 'ShaderNodeDisplacement'
  | 'ShaderNodeMapping'
  | 'ShaderNodeTrueNormal'
  // ── Shader ─────────────────────────────────────────────────────────────
  | 'ShaderNodeBsdfDiffuse'
  | 'ShaderNodeBsdfGlossy'
  | 'ShaderNodeBsdfGlass'
  | 'ShaderNodeBsdfTransparent'
  | 'ShaderNodeBsdfRefraction'
  | 'ShaderNodeEmission'
  | 'ShaderNodeBsdfHair'
  | 'ShaderNodeHoldout'
  | 'ShaderNodeVolumeAbsorption'
  | 'ShaderNodeVolumeScatter'
  | 'ShaderNodeBsdfPrincipled'
  | 'ShaderNodeBsdfSheen'
  | 'ShaderNodeBsdfVelvet'
  | 'ShaderNodeLayerWeight'
  | 'ShaderNodeHairInfo'
  | 'ShaderNodeWireframe'
  | 'ShaderNodeObjectInfo'
  | 'ShaderNodeParticleInfo'
  | 'ShaderNodeAddShader'
  | 'ShaderNodeMixShader'
  | 'ShaderNodeBevel'
  | 'ShaderNodeCameraData'
  | 'ShaderNodeNewGeometry'
  | 'ShaderNodeWavelength'
  | 'ShaderNodeObjectIndex'
  | 'ShaderNodeMaterialIndex'
  | 'ShaderNodeRandomPerIsland'
  // ── Light Path Info ────────────────────────────────────────────────────
  | 'ShaderNodeIsCameraRay'
  | 'ShaderNodeIsShadowRay'
  | 'ShaderNodeIsDiffuseRay'
  | 'ShaderNodeIsGlossyRay'
  | 'ShaderNodeIsTransmissionRay'
  | 'ShaderNodeIsVolumeRay'
  | 'ShaderNodeIsReflectionRay'
  | 'ShaderNodeIsRefractionRay'
  | 'ShaderNodeRayDepth'
  | 'ShaderNodeRayLength'
  | 'ShaderNodeLightFalloff'
  // ── Output ─────────────────────────────────────────────────────────────
  | 'NodeGroupOutput'
  | 'ShaderNodeOutputMaterial'
  | 'ShaderNodeOutputWorld'
  | 'CompositorNodeComposite'
  | 'CompositorNodeViewer'
  | 'CompositorNodeSplitViewer'
  | 'CompositorNodeOutputFile'
  // ── Modifier ───────────────────────────────────────────────────────────
  | 'GeometryNodeArrayModifier'
  | 'GeometryNodeBevelModifier'
  | 'GeometryNodeBooleanModifier'
  | 'GeometryNodeBuildModifier'
  | 'GeometryNodeDecimateModifier'
  | 'GeometryNodeEdgeSplitModifier'
  | 'GeometryNodeMaskModifier'
  | 'GeometryNodeMirrorModifier'
  | 'GeometryNodeRemeshModifier'
  | 'GeometryNodeScrewModifier'
  | 'GeometryNodeSkinModifier'
  | 'GeometryNodeSolidifyModifier'
  | 'GeometryNodeSubdivisionSurfaceModifier'
  | 'GeometryNodeWeldModifier'
  // ── Simulate ───────────────────────────────────────────────────────────
  | 'GeometryNodeSimulateInput'
  | 'GeometryNodeRepeatZone'
  | 'GeometryNodeRepeatOutput'
  | 'GeometryNodeWhileLoop'
  // ── Text ───────────────────────────────────────────────────────────────
  | 'GeometryNodeStringJoin'
  | 'GeometryNodeStringLength'
  | 'GeometryNodeStringSlice'
  | 'GeometryNodeValueToString'
  | 'GeometryNodeFontString'
  // ── Utility ────────────────────────────────────────────────────────────
  | 'GeometryNodeSwitch'
  | 'GeometryNodeForEachElementBegin'
  | 'GeometryNodeForEachElementEnd'
  | 'GeometryNodeRotateEuler'
  | 'GeometryNodeAlignEulerToVector'
  | 'GeometryNodeSelfObject'
  // ── Light ──────────────────────────────────────────────────────────────
  | 'ShaderNodeEmission_PointLight'
  | 'ShaderNodeEmission_SpotLight'
  | 'ShaderNodeEmission_SunLight'
  | 'ShaderNodeEmission_AreaLight'
  // ── Extended Shader Helpers ────────────────────────────────────────────
  | 'ShaderNodeJoinGeometry'
  | 'ShaderNodeValueAlias'
  | 'ShaderNodeTexCoordAlias'
  | 'ShaderNodeUVMap'
  | 'ShaderNodeParticleInfoShader'
  | 'ShaderNodeMaterialIndexShader'
  // ── Misc extended ──────────────────────────────────────────────────────
  | 'GeometryNodeSmoothByAngle'
  | 'GeometryNodeSubdivisionSurface'
  | 'GeometryNodeDecimate'
  | 'GeometryNodeExtrudeFaces'
  | 'GeometryNodeInsetFaces'
  | 'GeometryNodeFlipFacesAlias'
  | 'GeometryNodeRotateMesh'
  | 'GeometryNodeScaleMesh'
  | 'GeometryNodeTranslateMesh'
  | 'GeometryNodeRotateVector'
  | 'GeometryNodeFaceSetBoundaries'
  | 'GeometryNodeInputTangent'
  | 'GeometryNodeRadiusInput'
  | 'GeometryNodeCaptureAttributeAlias'
  | 'GeometryNodeCurveResample'
  // ── Volume shader nodes (standalone) ───────────────────────────────────
  | 'ShaderNodeVolumeAbsorption_Standalone'
  | 'ShaderNodeVolumeScatter_Standalone'
  | 'ShaderNodeVolumePrincipled'
  | 'ShaderNodeVolumeEmission'
  | 'ShaderNodeVolumeDensity'
  // ── Extended output nodes ──────────────────────────────────────────────
  | 'CompositorNodeDepthOutput'
  | 'CompositorNodeNormalOutput'
  | 'CompositorNodeAOOutput'
  | 'CompositorNodeEmissionOutput'
  | 'CompositorNodeAlbedoOutput'
  | 'CompositorNodeDiffuseOutput'
  | 'CompositorNodeGlossyOutput'
  | 'CompositorNodeTransmissionOutput'
  | 'CompositorNodeVolumeOutput'
  | 'CompositorNodeShadowOutput'
  | 'CompositorNodeCryptomatteOutput'
  | 'CompositorNodeCryptomatteMatteOutput'
  | 'CompositorNodeImageOutput'
  | 'CompositorNodeMovieOutput'
  | 'CompositorNodeSoundOutput'
  | 'GeometryNodeLevelOfDetail'
  | 'CompositorNodeRenderLayer'
  | 'CompositorNodeUVOutput'
  | 'GeometryNodeInstanceOutput'
  | 'GeometryNodePointCloudOutput'
  | 'GeometryNodeTextOutput'
  | 'GeometryNodeBoundingBoxOutput'
  | 'GeometryNodeWireframeOutput'
  | 'GeometryNodeDebugOutput'
  | 'CompositorNodeViewLevel'
  // ── Extended math / vector helpers ─────────────────────────────────────
  | 'FunctionNodeNormalize'
  | 'FunctionNodeQuaternion'
  | 'FunctionNodeMatrixTransform'
  | 'FunctionNodeDirectionToPoint'
  | 'FunctionNodeReflect'
  | 'FunctionNodeRefract'
  | 'FunctionNodeFaceForward'
  | 'FunctionNodeWrap'
  | 'FunctionNodeSnap'
  | 'FunctionNodeFloorCeil'
  | 'FunctionNodeModulo'
  | 'FunctionNodeFraction'
  | 'FunctionNodeAbsolute'
  | 'FunctionNodeMinMax'
  | 'FunctionNodeTrigonometry'
  | 'FunctionNodePowerLog'
  | 'FunctionNodeSign'
  | 'FunctionNodeSmoothMinMax'
  | 'FunctionNodeAngleBetween'
  | 'FunctionNodeSlerp'
  | 'FunctionNodePolarToCart'
  | 'FunctionNodeCartToPolar'
  | 'FunctionNodeInvert'
  | 'FunctionNodeBooleanMathAlias'
  // ── Point domain specific ──────────────────────────────────────────────
  | 'GeometryNodePointDomain'
  | 'GeometryNodePointDomainSize'
  | 'GeometryNodePointIndex'
  | 'GeometryNodePointPosition'
  | 'GeometryNodePointVelocity'
  | 'GeometryNodePointRotation'
  | 'GeometryNodePointScale'
  | 'GeometryNodePointCount'
  | 'GeometryNodePointMaterialIndex'
  | 'GeometryNodePointNamedAttribute'
  | 'GeometryNodePointCaptureAttribute'
  | 'GeometryNodePointTransferAttribute'
  | 'GeometryNodePointStoreNamedAttribute'
  | 'GeometryNodePointSampleIndex'
  | 'GeometryNodePointSampleNearest'
  | 'GeometryNodePointSampleNearestSurface'
  | 'GeometryNodePointAttributeStatistic'
  | 'GeometryNodePointBlurAttribute'
  | 'GeometryNodePointAccumulateAttribute'
  | 'GeometryNodePointEvaluateOnDomain'
  | 'GeometryNodePointInterpolateCurves'
  | 'GeometryNodePointSampleUVSurface'
  | 'GeometryNodePointIsViewport'
  | 'GeometryNodePointImageInfo'
  | 'GeometryNodePointCurveOfPoint'
  | 'GeometryNodePointCurvesInfo'
  | 'GeometryNodePointRadius'
  | 'GeometryNodePointEndpointSelection'
  | 'GeometryNodePointsOfCurve'
  | 'GeometryNodePointSplineResolution'
  | 'GeometryNodePointOffsetPointInCurve'
  | 'GeometryNodePointSplineType'
  | 'GeometryNodePointSplineLength'
  | 'GeometryNodePointCurveTangent'
  // ── Volume domain specific ─────────────────────────────────────────────
  | 'GeometryNodeVolumeToMeshAlias'
  | 'GeometryNodeVolumeToPointsAlias'
  | 'GeometryNodeVolumeToCurveAlias'
  | 'GeometryNodeVolumeSample'
  | 'GeometryNodeVolumeValue'
  | 'GeometryNodeVolumeDensity'
  | 'GeometryNodeVolumeEmission'
  | 'GeometryNodeVolumeAbsorptionAlias'
  | 'GeometryNodeVolumeScattering'
  | 'GeometryNodeVolumePrincipledAlias'
  | 'GeometryNodeVolumeInfo'
  | 'GeometryNodeVolumeMaterialIndex'
  | 'GeometryNodeVolumeNamedAttribute'
  | 'GeometryNodeVolumeCaptureAttribute'
  | 'GeometryNodeVolumeTransferAttribute'
  | 'GeometryNodeVolumeStoreNamedAttribute'
  | 'GeometryNodeVolumeSampleIndex'
  | 'GeometryNodeVolumeSampleNearest'
  | 'GeometryNodeVolumeSampleNearestSurface'
  | 'GeometryNodeVolumeAttributeStatistic'
  | 'GeometryNodeVolumeBlurAttribute'
  | 'GeometryNodeVolumeAccumulateAttribute'
  | 'GeometryNodeVolumeEvaluateOnDomain'
  // ── Boolean operations ─────────────────────────────────────────────────
  | 'GeometryNodeBooleanUnion'
  | 'GeometryNodeBooleanIntersect'
  | 'GeometryNodeBooleanDifference';

// ============================================================================
// Internal: Mutable extension registry (for runtime registrations)
// ============================================================================

/**
 * Mutable map for runtime-registered node types.
 * Checked after the static alias data.
 */
const extensionRegistry: Map<string, string> = new Map();

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolve any node type alias to its canonical Blender-style form.
 *
 * Performs an O(1) lookup against the static alias data first, then
 * falls back to the runtime extension registry. If neither contains
 * the alias, the input string is returned as-is (pass-through for
 * unknown types that may already be in Blender-style format).
 *
 * @param alias - Any known alias for a node type
 * @returns The canonical Blender-style node type identifier
 *
 * @example
 * ```ts
 * resolveNodeType('ShaderNodeTexNoise');    // 'ShaderNodeTexNoise'
 * resolveNodeType('NoiseTextureNode');      // 'ShaderNodeTexNoise'
 * resolveNodeType('noise_texture');         // 'ShaderNodeTexNoise'
 * resolveNodeType('TextureNoise');          // 'ShaderNodeTexNoise'
 * resolveNodeType('TextureNoiseNode');      // 'ShaderNodeTexNoise'
 * ```
 */
export function resolveNodeType(alias: string): string {
  // 1. Check static alias data (O(1) object lookup)
  const staticResult = ALIAS_DATA[alias];
  if (staticResult !== undefined) return staticResult;

  // 2. Check runtime extension registry
  const extResult = extensionRegistry.get(alias);
  if (extResult !== undefined) return extResult;

  // 3. Pass-through for unknown types (may already be canonical)
  return alias;
}

/**
 * Check if a node type string is a known, registered type.
 *
 * @param alias - Any alias string to check
 * @returns `true` if the alias maps to a known canonical type
 *
 * @example
 * ```ts
 * isKnownNodeType('ShaderNodeTexNoise');    // true
 * isKnownNodeType('NoiseTextureNode');      // true
 * isKnownNodeType('UnknownNode');           // false
 * ```
 */
export function isKnownNodeType(alias: string): boolean {
  return alias in ALIAS_DATA || extensionRegistry.has(alias);
}

/**
 * Get all aliases that resolve to a given canonical type.
 *
 * Scans both the static alias data and the runtime extension registry
 * for all keys that map to the specified canonical form.
 *
 * @param canonical - The canonical Blender-style identifier
 * @returns Array of all aliases that map to this canonical type (sorted)
 *
 * @example
 * ```ts
 * getAliasesForCanonical('ShaderNodeTexNoise');
 * // ['NoiseTexture', 'NoiseTextureNode', 'ShaderNodeTexNoise',
 * //  'TEX_NOISE', 'TextureNoise', 'TextureNoiseNode', 'noise_texture']
 * ```
 */
export function getAliasesForCanonical(canonical: string): string[] {
  const aliases: string[] = [];

  // Scan static alias data
  for (const [alias, target] of Object.entries(ALIAS_DATA)) {
    if (target === canonical) {
      aliases.push(alias);
    }
  }

  // Scan extension registry
  for (const [alias, target] of extensionRegistry.entries()) {
    if (target === canonical) {
      aliases.push(alias);
    }
  }

  return aliases.sort();
}

/**
 * Register a new node type with its canonical name and aliases.
 *
 * This is used for extending the registry at runtime (e.g., for plugins
 * or custom node types). The canonical name is registered as an identity
 * mapping, and each additional alias is registered to resolve to it.
 *
 * @param canonical - The canonical Blender-style identifier
 * @param aliases - Additional aliases that should resolve to the canonical form
 *
 * @example
 * ```ts
 * registerNodeType('GeometryNodeCustomFoo', ['CustomFooNode', 'custom_foo', 'CustomFoo']);
 * resolveNodeType('CustomFooNode');  // 'GeometryNodeCustomFoo'
 * resolveNodeType('custom_foo');     // 'GeometryNodeCustomFoo'
 * isKnownNodeType('CustomFooNode');  // true
 * ```
 */
export function registerNodeType(canonical: string, aliases: string[]): void {
  // Register the canonical name as identity
  extensionRegistry.set(canonical, canonical);

  // Register each alias
  for (const alias of aliases) {
    extensionRegistry.set(alias, canonical);
  }
}

/**
 * Get all canonical node type strings from the registry.
 *
 * Returns a sorted array of unique canonical Blender-style identifiers
 * from both the static alias data and any runtime-registered types.
 *
 * @returns Sorted array of all canonical node type identifiers
 *
 * @example
 * ```ts
 * const types = getCanonicalNodeTypes();
 * // ['CompositorNodeBrightContrast', 'CompositorNodeComposite', ...]
 * ```
 */
export function getCanonicalNodeTypes(): string[] {
  const canonicalNames = new Set<string>();

  // Collect from static alias data
  for (const value of Object.values(ALIAS_DATA)) {
    canonicalNames.add(value);
  }

  // Collect from extension registry
  for (const value of extensionRegistry.values()) {
    canonicalNames.add(value);
  }

  return Array.from(canonicalNames).sort();
}

/**
 * Get the category prefix of a node type string.
 *
 * Extracts the Blender-style category prefix from a canonical node type
 * identifier. For example:
 * - `ShaderNodeTexNoise` → `'Shader'`
 * - `GeometryNodeSetPosition` → `'Geometry'`
 * - `FunctionNodeCompare` → `'Function'`
 * - `CompositorNodeComposite` → `'Compositor'`
 * - `NodeGroupOutput` → `'Node'`
 *
 * The category is determined by the prefix before the first `Node` occurrence.
 * If no `Node` prefix pattern is found, returns `'Unknown'`.
 *
 * @param nodeType - A node type string (canonical or alias)
 * @returns The category prefix string
 *
 * @example
 * ```ts
 * getNodeCategory('ShaderNodeTexNoise');       // 'Shader'
 * getNodeCategory('GeometryNodeSetPosition');   // 'Geometry'
 * getNodeCategory('FunctionNodeCompare');       // 'Function'
 * getNodeCategory('CompositorNodeComposite');   // 'Compositor'
 * getNodeCategory('NodeGroupOutput');           // 'Node'
 * ```
 */
export function getNodeCategory(nodeType: string): string {
  // Resolve to canonical form first to handle aliases
  const canonical = resolveNodeType(nodeType);

  // Match the category prefix before "Node"
  const match = canonical.match(/^([A-Z][a-zA-Z]*?)Node/);
  if (match) {
    return match[1];
  }

  return 'Unknown';
}
