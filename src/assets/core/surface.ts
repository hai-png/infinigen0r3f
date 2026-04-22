/**
 * Surface Module - Core Functions
 * Ported from infinigen/core/surface.py
 * 
 * Provides utilities for reading/writing mesh attributes in Three.js
 * Maps Blender geometry node operations to Three.js BufferAttribute operations
 */

import * as THREE from 'three';
import { Mesh, BufferGeometry, BufferAttribute } from 'three';

/**
 * Domain types for attribute operations
 * Maps to Blender's attribute domains
 */
export enum AttributeDomain {
  POINT = 'POINT',      // Vertex domain
  EDGE = 'EDGE',        // Edge domain (limited support in Three.js)
  FACE = 'FACE',        // Face/polygon domain
  CORNER = 'CORNER',    // Corner/loop domain
  INSTANCE = 'INSTANCE' // Instance domain
}

/**
 * Data types for attributes
 * Maps to Blender's attribute data types
 */
export enum AttributeDataType {
  FLOAT = 'FLOAT',
  FLOAT2 = 'FLOAT2',
  FLOAT3 = 'FLOAT3',
  FLOAT4 = 'FLOAT4',
  INT = 'INT',
  INT2 = 'INT2',
  INT3 = 'INT3',
  INT4 = 'INT4',
  BOOLEAN = 'BOOLEAN',
  COLOR = 'COLOR'
}

/**
 * Mapping from AttributeDataType to component count
 */
export const DATATYPE_DIMS: Record<AttributeDataType, number> = {
  [AttributeDataType.FLOAT]: 1,
  [AttributeDataType.FLOAT2]: 2,
  [AttributeDataType.FLOAT3]: 3,
  [AttributeDataType.FLOAT4]: 4,
  [AttributeDataType.INT]: 1,
  [AttributeDataType.INT2]: 2,
  [AttributeDataType.INT3]: 3,
  [AttributeDataType.INT4]: 4,
  [AttributeDataType.BOOLEAN]: 1,
  [AttributeDataType.COLOR]: 4
};

/**
 * Mapping from AttributeDataType to TypedArray constructor
 */
export const DATATYPE_TO_ARRAY: Record<AttributeDataType, new (size: number) => ArrayLike<number>> = {
  [AttributeDataType.FLOAT]: Float32Array,
  [AttributeDataType.FLOAT2]: Float32Array,
  [AttributeDataType.FLOAT3]: Float32Array,
  [AttributeDataType.FLOAT4]: Float32Array,
  [AttributeDataType.INT]: Int32Array,
  [AttributeDataType.INT2]: Int32Array,
  [AttributeDataType.INT3]: Int32Array,
  [AttributeDataType.INT4]: Int32Array,
  [AttributeDataType.BOOLEAN]: Uint8Array,
  [AttributeDataType.COLOR]: Float32Array
};

/**
 * Interface for attribute info
 */
export interface AttributeInfo {
  name: string;
  domain: AttributeDomain;
  dataType: AttributeDataType;
  data: BufferAttribute;
}

/**
 * Remove all materials from an object
 * Equivalent to Blender's remove_materials
 */
export function removeMaterials(obj: Mesh): void {
  obj.material = null;
  
  if (obj.geometry) {
    // Clear material index attribute if it exists
    const materialIndexAttr = obj.geometry.getAttribute('materialIndex');
    if (materialIndexAttr) {
      obj.geometry.deleteAttribute('materialIndex');
    }
  }
}

/**
 * Write attribute data to a mesh
 * 
 * @param obj - Target mesh object
 * @param name - Attribute name
 * @param data - Data array to write
 * @param dataType - Type of the data
 * @param domain - Domain of the attribute (POINT, FACE, etc.)
 * @returns The created/updated attribute
 */
export function writeAttributeData(
  obj: Mesh,
  name: string,
  data: ArrayLike<number>,
  dataType: AttributeDataType = AttributeDataType.FLOAT,
  domain: AttributeDomain = AttributeDomain.POINT
): BufferAttribute {
  const geometry = obj.geometry;
  const dims = DATATYPE_DIMS[dataType];
  
  // Determine the size based on domain
  let size: number;
  switch (domain) {
    case AttributeDomain.POINT:
      size = geometry.attributes.position.count;
      break;
    case AttributeDomain.FACE:
      // For face domain, we need to store per-face data
      // Three.js doesn't natively support this, so we use a custom attribute
      size = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
      break;
    case AttributeDomain.CORNER:
      // Corner domain = loop domain in Three.js
      size = geometry.attributes.position.count;
      break;
    default:
      console.warn(`Unsupported domain ${domain}, falling back to POINT`);
      size = geometry.attributes.position.count;
  }
  
  // Check if attribute already exists
  const existingAttr = geometry.getAttribute(name);
  if (existingAttr) {
    // Update existing attribute
    const array = existingAttr.array as ArrayLike<number>;
    for (let i = 0; i < Math.min(data.length, array.length); i++) {
      array[i] = data[i];
    }
    existingAttr.needsUpdate = true;
    return existingAttr;
  } else {
    // Create new attribute
    const ArrayConstructor = DATATYPE_TO_ARRAY[dataType];
    const newArray = new ArrayConstructor(size * dims);
    
    // Copy data
    for (let i = 0; i < Math.min(data.length, newArray.length); i++) {
      newArray[i] = data[i];
    }
    
    const newAttr = new BufferAttribute(newArray, dims);
    geometry.setAttribute(name, newAttr);
    return newAttr;
  }
}

/**
 * Read attribute data from a mesh
 * 
 * @param obj - Source mesh object
 * @param attrName - Name of the attribute or the attribute itself
 * @param domain - Expected domain (auto-detected if not provided)
 * @returns Array of attribute data
 */
export function readAttributeData(
  obj: Mesh,
  attrName: string | BufferAttribute,
  domain?: AttributeDomain
): Float32Array | Int32Array | Uint8Array {
  const geometry = obj.geometry;
  
  // Get the attribute
  const attr = typeof attrName === 'string' 
    ? geometry.getAttribute(attrName)
    : attrName;
  
  if (!attr) {
    throw new Error(`Attribute not found: ${typeof attrName === 'string' ? attrName : 'unknown'}`);
  }
  
  // Auto-detect domain if not provided
  if (!domain) {
    domain = detectAttributeDomain(geometry, attr.name);
  }
  
  // Return the data as a typed array
  return attr.array as Float32Array | Int32Array | Uint8Array;
}

/**
 * Detect the domain of an attribute based on its size
 */
export function detectAttributeDomain(
  geometry: BufferGeometry,
  attrName: string
): AttributeDomain {
  const attr = geometry.getAttribute(attrName);
  if (!attr) {
    throw new Error(`Attribute ${attrName} not found`);
  }
  
  const vertexCount = geometry.attributes.position.count;
  const faceCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3;
  const attrSize = attr.count;
  
  if (attrSize === vertexCount) {
    return AttributeDomain.POINT;
  } else if (attrSize === faceCount) {
    return AttributeDomain.FACE;
  } else {
    // Default to point domain
    return AttributeDomain.POINT;
  }
}

/**
 * Create a new attribute on a mesh
 * 
 * @param obj - Target mesh
 * @param name - Attribute name
 * @param dataType - Data type
 * @param domain - Domain
 * @param data - Initial data (optional)
 * @returns The created attribute
 */
export function createAttribute(
  obj: Mesh,
  name: string,
  dataType: AttributeDataType = AttributeDataType.FLOAT,
  domain: AttributeDomain = AttributeDomain.POINT,
  data?: ArrayLike<number>
): BufferAttribute {
  const geometry = obj.geometry;
  const dims = DATATYPE_DIMS[dataType];
  
  // Determine size based on domain
  let size: number;
  switch (domain) {
    case AttributeDomain.POINT:
      size = geometry.attributes.position.count;
      break;
    case AttributeDomain.FACE:
      size = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
      break;
    case AttributeDomain.CORNER:
      size = geometry.attributes.position.count;
      break;
    default:
      size = geometry.attributes.position.count;
  }
  
  const ArrayConstructor = DATATYPE_TO_ARRAY[dataType];
  const array = data ? new ArrayConstructor(data.buffer) : new ArrayConstructor(size * dims);
  
  const attr = new BufferAttribute(array, dims);
  geometry.setAttribute(name, attr);
  
  return attr;
}

/**
 * Smooth an attribute value across the mesh (Laplacian smoothing)
 * Equivalent to Blender's smooth_attribute
 * 
 * @param obj - Target mesh
 * @param attrName - Name of the attribute to smooth
 * @param iterations - Number of smoothing iterations
 * @param weight - Smoothing weight (0-1)
 */
export function smoothAttribute(
  obj: Mesh,
  attrName: string,
  iterations: number = 20,
  weight: number = 0.05
): void {
  const geometry = obj.geometry;
  const attr = geometry.getAttribute(attrName);
  
  if (!attr) {
    throw new Error(`Attribute ${attrName} not found`);
  }
  
  // Get edge connectivity
  const edges = getEdgeConnectivity(geometry);
  
  // Get current data
  const data = attr.array as Float32Array;
  const dims = attr.itemSize;
  const vertexCount = geometry.attributes.position.count;
  
  // Perform smoothing iterations
  for (let iter = 0; iter < iterations; iter++) {
    const dataOut = new Float32Array(data.length);
    const vertexWeight = new Float32Array(vertexCount).fill(1);
    
    // Copy original data
    dataOut.set(data);
    
    // Apply smoothing along edges
    for (let i = 0; i < edges.length; i += 2) {
      const v0 = edges[i];
      const v1 = edges[i + 1];
      
      // Add weighted contribution from neighbor
      for (let d = 0; d < dims; d++) {
        dataOut[v0 * dims + d] += data[v1 * dims + d] * weight;
        dataOut[v1 * dims + d] += data[v0 * dims + d] * weight;
      }
      
      vertexWeight[v0] += weight;
      vertexWeight[v1] += weight;
    }
    
    // Normalize by vertex weight
    for (let v = 0; v < vertexCount; v++) {
      for (let d = 0; d < dims; d++) {
        data[v * dims + d] = dataOut[v * dims + d] / vertexWeight[v];
      }
    }
  }
  
  attr.needsUpdate = true;
}

/**
 * Get edge connectivity from geometry
 * Returns a flat array of vertex indices [v0, v1, v2, v3, ...] where each pair is an edge
 */
export function getEdgeConnectivity(geometry: BufferGeometry): number[] {
  const edges = new Map<string, [number, number]>();
  
  if (geometry.index) {
    const indices = geometry.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      const v0 = indices[i];
      const v1 = indices[i + 1];
      const v2 = indices[i + 2];
      
      // Add edges (sorted to avoid duplicates)
      addEdge(edges, Math.min(v0, v1), Math.max(v0, v1));
      addEdge(edges, Math.min(v1, v2), Math.max(v1, v2));
      addEdge(edges, Math.min(v2, v0), Math.max(v2, v0));
    }
  } else {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 3) {
      const v0 = i;
      const v1 = i + 1;
      const v2 = i + 2;
      
      addEdge(edges, Math.min(v0, v1), Math.max(v0, v1));
      addEdge(edges, Math.min(v1, v2), Math.max(v1, v2));
      addEdge(edges, Math.min(v2, v0), Math.max(v2, v0));
    }
  }
  
  // Convert to flat array
  const result: number[] = [];
  for (const [v0, v1] of edges.values()) {
    result.push(v0, v1);
  }
  
  return result;
}

function addEdge(
  edges: Map<string, [number, number]>,
  v0: number,
  v1: number
): void {
  const key = `${v0}-${v1}`;
  if (!edges.has(key)) {
    edges.set(key, [v0, v1]);
  }
}

/**
 * Transfer attributes from one mesh to another
 * Based on proximity (nearest point/vertex)
 * 
 * @param sourceObj - Source mesh
 * @param targetObj - Target mesh
 * @param attrName - Attribute to transfer
 * @param method - Transfer method ('nearest', 'interpolated')
 */
export function transferAttribute(
  sourceObj: Mesh,
  targetObj: Mesh,
  attrName: string,
  method: 'nearest' | 'interpolated' = 'nearest'
): void {
  const sourceGeom = sourceObj.geometry;
  const targetGeom = targetObj.geometry;
  
  const sourceAttr = sourceGeom.getAttribute(attrName);
  if (!sourceAttr) {
    throw new Error(`Source attribute ${attrName} not found`);
  }
  
  const sourcePositions = sourceGeom.attributes.position;
  const targetPositions = targetGeom.attributes.position;
  
  // Create target attribute if it doesn't exist
  let targetAttr = targetGeom.getAttribute(attrName);
  if (!targetAttr) {
    targetAttr = createAttribute(
      targetObj,
      attrName,
      AttributeDataType.FLOAT,
      AttributeDomain.POINT
    );
  }
  
  const dims = sourceAttr.itemSize;
  
  if (method === 'nearest') {
    // Simple nearest neighbor transfer
    for (let i = 0; i < targetPositions.count; i++) {
      const targetPos = new THREE.Vector3(
        targetPositions.getX(i),
        targetPositions.getY(i),
        targetPositions.getZ(i)
      );
      
      // Find nearest source vertex
      let nearestIdx = 0;
      let nearestDist = Infinity;
      
      for (let j = 0; j < sourcePositions.count; j++) {
        const sourcePos = new THREE.Vector3(
          sourcePositions.getX(j),
          sourcePositions.getY(j),
          sourcePositions.getZ(j)
        );
        
        const dist = targetPos.distanceToSquared(sourcePos);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = j;
        }
      }
      
      // Copy attribute value
      for (let d = 0; d < dims; d++) {
        targetAttr.setComponent(i, d, sourceAttr.getComponent(nearestIdx, d));
      }
    }
  }
  
  targetAttr.needsUpdate = true;
}

/**
 * Capture attribute helper
 * Creates a named attribute and returns both the geometry and attribute reference
 * Similar to Blender's CaptureAttribute node
 * 
 * @param obj - Target mesh
 * @param name - Attribute name
 * @param valueFunc - Function that computes the attribute value
 * @param dataType - Data type
 */
export function captureAttribute<T extends number | number[]>(
  obj: Mesh,
  name: string,
  valueFunc: (index: number, position: THREE.Vector3, normal: THREE.Vector3) => T,
  dataType: AttributeDataType = AttributeDataType.FLOAT
): BufferAttribute {
  const geometry = obj.geometry;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const dims = DATATYPE_DIMS[dataType];
  
  const ArrayConstructor = DATATYPE_TO_ARRAY[dataType];
  const data = new ArrayConstructor(positions.count * dims);
  
  const pos = new THREE.Vector3();
  const norm = new THREE.Vector3();
  
  for (let i = 0; i < positions.count; i++) {
    pos.fromBufferAttribute(positions, i);
    if (normals) {
      norm.fromBufferAttribute(normals, i);
    } else {
      norm.set(0, 1, 0);
    }
    
    const value = valueFunc(i, pos, norm);
    
    if (Array.isArray(value)) {
      for (let d = 0; d < Math.min(dims, value.length); d++) {
        data[i * dims + d] = value[d];
      }
    } else {
      data[i * dims] = value as number;
    }
  }
  
  const attr = new BufferAttribute(data, dims);
  geometry.setAttribute(name, attr);
  
  return attr;
}

/**
 * Store named attribute
 * Direct equivalent of Blender's StoreNamedAttribute node
 * 
 * @param obj - Target mesh
 * @param name - Attribute name
 * @param data - Data to store
 * @param domain - Attribute domain
 * @param dataType - Data type
 */
export function storeNamedAttribute(
  obj: Mesh,
  name: string,
  data: ArrayLike<number>,
  domain: AttributeDomain = AttributeDomain.POINT,
  dataType: AttributeDataType = AttributeDataType.FLOAT
): BufferAttribute {
  return writeAttributeData(obj, name, data, dataType, domain);
}

/**
 * Get all attributes from a mesh
 */
export function getAllAttributes(obj: Mesh): AttributeInfo[] {
  const geometry = obj.geometry;
  const attributes: AttributeInfo[] = [];
  
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    attributes.push({
      name,
      domain: detectAttributeDomain(geometry, name),
      dataType: inferAttributeDataType(attr),
      data: attr
    });
  }
  
  return attributes;
}

/**
 * Infer attribute data type from BufferAttribute
 */
export function inferAttributeDataType(attr: BufferAttribute): AttributeDataType {
  const dims = attr.itemSize;
  const arrayType = attr.array.constructor.name;
  
  if (arrayType === 'Uint8Array') {
    return AttributeDataType.BOOLEAN;
  } else if (arrayType === 'Int32Array') {
    switch (dims) {
      case 1: return AttributeDataType.INT;
      case 2: return AttributeDataType.INT2;
      case 3: return AttributeDataType.INT3;
      case 4: return AttributeDataType.INT4;
    }
  } else {
    // Float32Array
    switch (dims) {
      case 1: return AttributeDataType.FLOAT;
      case 2: return AttributeDataType.FLOAT2;
      case 3: return AttributeDataType.FLOAT3;
      case 4: return AttributeDataType.FLOAT4;
    }
  }
  
  // Default
  return AttributeDataType.FLOAT;
}

/**
 * Delete an attribute from a mesh
 */
export function deleteAttribute(obj: Mesh, attrName: string): void {
  obj.geometry.deleteAttribute(attrName);
}

/**
 * Check if an attribute exists on a mesh
 */
export function hasAttribute(obj: Mesh, attrName: string): boolean {
  return obj.geometry.hasAttribute(attrName);
}

/**
 * Rename an attribute
 */
export function renameAttribute(
  obj: Mesh,
  oldName: string,
  newName: string
): void {
  const geometry = obj.geometry;
  const attr = geometry.getAttribute(oldName);
  
  if (!attr) {
    throw new Error(`Attribute ${oldName} not found`);
  }
  
  if (geometry.hasAttribute(newName)) {
    throw new Error(`Attribute ${newName} already exists`);
  }
  
  geometry.deleteAttribute(oldName);
  geometry.setAttribute(newName, attr);
}

/**
 * Convert attribute between domains
 * Limited support - mainly POINT ↔ CORNER
 */
export function convertAttributeDomain(
  obj: Mesh,
  attrName: string,
  fromDomain: AttributeDomain,
  toDomain: AttributeDomain
): BufferAttribute {
  const geometry = obj.geometry;
  const attr = geometry.getAttribute(attrName);
  
  if (!attr) {
    throw new Error(`Attribute ${attrName} not found`);
  }
  
  if (fromDomain === toDomain) {
    return attr;
  }
  
  // POINT to CORNER: duplicate values for each corner
  if (fromDomain === AttributeDomain.POINT && toDomain === AttributeDomain.CORNER) {
    const newData = new Float32Array(attr.array);
    const newAttr = new BufferAttribute(newData, attr.itemSize);
    geometry.setAttribute(attrName, newAttr);
    return newAttr;
  }
  
  // CORNER to POINT: average corner values per vertex
  if (fromDomain === AttributeDomain.CORNER && toDomain === AttributeDomain.POINT) {
    const vertexCount = geometry.attributes.position.count;
    const newData = new Float32Array(vertexCount * attr.itemSize);
    const counts = new Uint32Array(vertexCount);
    
    // This is a simplification - proper implementation would track loops
    for (let i = 0; i < attr.count; i++) {
      const vertexIdx = i % vertexCount;
      for (let d = 0; d < attr.itemSize; d++) {
        newData[vertexIdx * attr.itemSize + d] += attr.getX(i);
      }
      counts[vertexIdx]++;
    }
    
    // Average
    for (let v = 0; v < vertexCount; v++) {
      if (counts[v] > 0) {
        for (let d = 0; d < attr.itemSize; d++) {
          newData[v * attr.itemSize + d] /= counts[v];
        }
      }
    }
    
    const newAttr = new BufferAttribute(newData, attr.itemSize);
    geometry.setAttribute(attrName, newAttr);
    return newAttr;
  }
  
  console.warn(`Domain conversion ${fromDomain} → ${toDomain} not fully supported`);
  return attr;
}

// Export all functions and types
export default {
  AttributeDomain,
  AttributeDataType,
  DATATYPE_DIMS,
  DATATYPE_TO_ARRAY,
  removeMaterials,
  writeAttributeData,
  readAttributeData,
  createAttribute,
  smoothAttribute,
  transferAttribute,
  captureAttribute,
  storeNamedAttribute,
  getAllAttributes,
  deleteAttribute,
  hasAttribute,
  renameAttribute,
  convertAttributeDomain,
  detectAttributeDomain,
  inferAttributeDataType,
  getEdgeConnectivity
};
