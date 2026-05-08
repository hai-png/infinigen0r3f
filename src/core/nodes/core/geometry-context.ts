/**
 * GeometryContext - Holds all attribute streams for a geometry.
 *
 * This is what flows through the node graph as the "Geometry" type.
 * Analogous to Blender's geometry set with its attribute layers.
 *
 * The design keeps the core system framework-agnostic (using AttributeStream)
 * while providing conversion helpers to / from THREE.BufferGeometry for
 * interoperability with the rendering layer.
 *
 * Port of: Princeton Infinigen's geometry data container
 */

import * as THREE from 'three';
import { AttributeStream, AttributeDomain, AttributeDataType } from './attribute-stream';

export class GeometryContext {
  private attributes: Map<string, AttributeStream>;
  private positionStream: AttributeStream; // vertex positions – VECTOR domain=point
  private normalStream: AttributeStream;   // vertex normals – VECTOR domain=point
  private uvStream: AttributeStream | null; // UV coordinates – FLOAT×2 per vertex (stored as VECTOR with z=0)
  private indexBuffer: Uint32Array;        // triangle indices

  readonly vertexCount: number;
  readonly faceCount: number;
  readonly edgeCount: number;

  constructor(vertexCount: number, faceCount: number, edgeCount: number) {
    this.vertexCount = vertexCount;
    this.faceCount = faceCount;
    this.edgeCount = edgeCount;
    this.attributes = new Map();
    this.indexBuffer = new Uint32Array(0);

    // Pre-allocate built-in streams
    this.positionStream = new AttributeStream('position', 'point', 'VECTOR', vertexCount);
    this.normalStream = new AttributeStream('normal', 'point', 'VECTOR', vertexCount);
    this.uvStream = null;

    // Register built-in streams in the attribute map
    this.attributes.set('position', this.positionStream);
    this.attributes.set('normal', this.normalStream);
  }

  // -----------------------------------------------------------------------
  // Attribute management
  // -----------------------------------------------------------------------

  addAttribute(stream: AttributeStream): void {
    this.attributes.set(stream.name, stream);

    // Keep built-in references in sync
    if (stream.name === 'position' && stream.domain === 'point') {
      (this as any).positionStream = stream;
    } else if (stream.name === 'normal' && stream.domain === 'point') {
      (this as any).normalStream = stream;
    } else if (stream.name === 'uv' || stream.name === 'UVMap') {
      (this as any).uvStream = stream;
    }
  }

  getAttribute(name: string): AttributeStream | undefined {
    return this.attributes.get(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    // Prevent removal of built-in position / normal streams
    if (name === 'position' || name === 'normal') return;
    this.attributes.delete(name);
    if (name === 'uv' || name === 'UVMap') {
      (this as any).uvStream = null;
    }
  }

  listAttributes(): string[] {
    return Array.from(this.attributes.keys());
  }

  // -----------------------------------------------------------------------
  // Built-in attribute accessors – Position
  // -----------------------------------------------------------------------

  getPosition(index: number): [number, number, number] {
    return this.positionStream.getVector(index);
  }

  setPosition(index: number, value: [number, number, number]): void {
    this.positionStream.setVector(index, value);
  }

  // -----------------------------------------------------------------------
  // Built-in attribute accessors – Normal
  // -----------------------------------------------------------------------

  getNormal(index: number): [number, number, number] {
    return this.normalStream.getVector(index);
  }

  setNormal(index: number, value: [number, number, number]): void {
    this.normalStream.setVector(index, value);
  }

  // -----------------------------------------------------------------------
  // Built-in attribute accessors – UV
  // -----------------------------------------------------------------------

  getUV(index: number): [number, number] {
    if (!this.uvStream) return [0, 0];
    const vec = this.uvStream.getVector(index);
    return [vec[0], vec[1]];
  }

  setUV(index: number, value: [number, number]): void {
    if (!this.uvStream) {
      // Lazily create UV stream
      const uv = new AttributeStream('uv', 'point', 'VECTOR', this.vertexCount);
      this.addAttribute(uv);
    }
    this.uvStream!.setVector(index, [value[0], value[1], 0]);
  }

  // -----------------------------------------------------------------------
  // Index buffer (triangle faces)
  // -----------------------------------------------------------------------

  getIndexBuffer(): Uint32Array {
    return this.indexBuffer;
  }

  setIndexBuffer(indices: Uint32Array): void {
    this.indexBuffer = indices;
  }

  // -----------------------------------------------------------------------
  // Face / edge queries
  // -----------------------------------------------------------------------

  /** Get the vertex indices of a triangle face */
  getFaceVertices(faceIndex: number): number[] {
    const base = faceIndex * 3;
    if (base + 2 >= this.indexBuffer.length) {
      throw new Error(`Face index ${faceIndex} out of bounds`);
    }
    return [this.indexBuffer[base], this.indexBuffer[base + 1], this.indexBuffer[base + 2]];
  }

  /** Get the two vertex indices of an edge */
  getEdgeVertices(edgeIndex: number): [number, number] {
    // Edges are derived from the index buffer: each triangle has 3 edges
    const triangleIndex = Math.floor(edgeIndex / 3);
    const edgeInTriangle = edgeIndex % 3;
    const base = triangleIndex * 3;

    if (base + 2 >= this.indexBuffer.length) {
      throw new Error(`Edge index ${edgeIndex} out of bounds`);
    }

    const v0 = this.indexBuffer[base + edgeInTriangle];
    const v1 = this.indexBuffer[base + ((edgeInTriangle + 1) % 3)];
    return [v0, v1];
  }

  // -----------------------------------------------------------------------
  // Three.js BufferGeometry conversion
  // -----------------------------------------------------------------------

  /**
   * Convert this GeometryContext to a THREE.BufferGeometry.
   * Copies all attribute streams into Three.js buffer attributes.
   */
  toBufferGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    // Position
    const posData = this.positionStream.getRawData();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(posData), 3),
    );

    // Normal
    const normData = this.normalStream.getRawData();
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(normData), 3),
    );

    // UV
    if (this.uvStream) {
      const uvRaw = this.uvStream.getRawData();
      // UV stream is stored as VECTOR (3 components) but we need only 2
      const uv2 = new Float32Array(this.vertexCount * 2);
      for (let i = 0; i < this.vertexCount; i++) {
        uv2[i * 2] = uvRaw[i * 3];
        uv2[i * 2 + 1] = uvRaw[i * 3 + 1];
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv2, 2));
    }

    // Color
    const colorAttr = this.attributes.get('color');
    if (colorAttr && colorAttr.dataType === 'COLOR') {
      const colorData = colorAttr.getRawData();
      geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(colorData), 4),
      );
    }

    // Custom float attributes
    for (const [name, stream] of this.attributes.entries()) {
      if (name === 'position' || name === 'normal' || name === 'uv' || name === 'color') continue;
      if (stream.dataType === 'FLOAT') {
        geometry.setAttribute(
          name,
          new THREE.BufferAttribute(new Float32Array(stream.getRawData()), 1),
        );
      } else if (stream.dataType === 'VECTOR') {
        geometry.setAttribute(
          name,
          new THREE.BufferAttribute(new Float32Array(stream.getRawData()), 3),
        );
      }
    }

    // Index buffer
    if (this.indexBuffer.length > 0) {
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(this.indexBuffer), 1));
    } else {
      // If no index buffer, compute flat normals
      geometry.computeVertexNormals();
    }

    return geometry;
  }

  /**
   * Create a GeometryContext from an existing THREE.BufferGeometry.
   * Extracts position, normal, UV, color, and any named custom attributes.
   */
  static fromBufferGeometry(geometry: THREE.BufferGeometry): GeometryContext {
    const posAttr = geometry.getAttribute('position');
    const vertexCount = posAttr ? posAttr.count : 0;

    // Compute face and edge counts from index buffer or vertex count
    let faceCount = 0;
    let edgeCount = 0;
    const idx = geometry.getIndex();
    if (idx) {
      faceCount = Math.floor(idx.count / 3);
      edgeCount = faceCount * 3; // upper bound (deduplication would reduce)
    } else {
      faceCount = Math.floor(vertexCount / 3);
      edgeCount = faceCount * 3;
    }

    const ctx = new GeometryContext(vertexCount, faceCount, edgeCount);

    // Copy position data
    if (posAttr) {
      const posData = ctx.positionStream.getRawData();
      for (let i = 0; i < vertexCount; i++) {
        posData[i * 3] = posAttr.getX(i);
        posData[i * 3 + 1] = posAttr.getY(i);
        posData[i * 3 + 2] = posAttr.getZ(i);
      }
    }

    // Copy normal data
    const normAttr = geometry.getAttribute('normal');
    if (normAttr) {
      const normData = ctx.normalStream.getRawData();
      for (let i = 0; i < vertexCount; i++) {
        normData[i * 3] = normAttr.getX(i);
        normData[i * 3 + 1] = normAttr.getY(i);
        normData[i * 3 + 2] = normAttr.getZ(i);
      }
    } else {
      // Compute normals if missing
      const tempGeo = geometry.clone();
      tempGeo.computeVertexNormals();
      const computedNormals = tempGeo.getAttribute('normal');
      if (computedNormals) {
        const normData = ctx.normalStream.getRawData();
        for (let i = 0; i < vertexCount; i++) {
          normData[i * 3] = computedNormals.getX(i);
          normData[i * 3 + 1] = computedNormals.getY(i);
          normData[i * 3 + 2] = computedNormals.getZ(i);
        }
      }
      tempGeo.dispose();
    }

    // Copy UV data
    const uvAttr = geometry.getAttribute('uv');
    if (uvAttr) {
      const uvStream = new AttributeStream('uv', 'point', 'VECTOR', vertexCount);
      const uvData = uvStream.getRawData();
      for (let i = 0; i < vertexCount; i++) {
        uvData[i * 3] = uvAttr.getX(i);
        uvData[i * 3 + 1] = uvAttr.getY(i);
        uvData[i * 3 + 2] = 0;
      }
      ctx.addAttribute(uvStream);
    }

    // Copy color data
    const colorAttr = geometry.getAttribute('color');
    if (colorAttr) {
      const hasAlpha = colorAttr.itemSize === 4;
      if (hasAlpha) {
        const colorStream = new AttributeStream('color', 'point', 'COLOR', vertexCount);
        const colorData = colorStream.getRawData();
        for (let i = 0; i < vertexCount; i++) {
          colorData[i * 4] = colorAttr.getX(i);
          colorData[i * 4 + 1] = colorAttr.getY(i);
          colorData[i * 4 + 2] = colorAttr.getZ(i);
          colorData[i * 4 + 3] = colorAttr.getW(i);
        }
        ctx.addAttribute(colorStream);
      } else {
        // RGB → RGBA with alpha=1
        const colorStream = new AttributeStream('color', 'point', 'COLOR', vertexCount);
        const colorData = colorStream.getRawData();
        for (let i = 0; i < vertexCount; i++) {
          colorData[i * 4] = colorAttr.getX(i);
          colorData[i * 4 + 1] = colorAttr.getY(i);
          colorData[i * 4 + 2] = colorAttr.getZ(i);
          colorData[i * 4 + 3] = 1;
        }
        ctx.addAttribute(colorStream);
      }
    }

    // Copy index buffer
    if (idx) {
      const indexArray = new Uint32Array(idx.count);
      for (let i = 0; i < idx.count; i++) {
        indexArray[i] = idx.getX(i);
      }
      ctx.setIndexBuffer(indexArray);
    }

    // Copy custom float attributes (skip built-in ones)
    const builtinNames = new Set(['position', 'normal', 'uv', 'uv1', 'uv2', 'color', 'tangent']);
    const attributeNames = Object.keys((geometry as any).attributes || {});
    for (const attrName of attributeNames) {
      if (builtinNames.has(attrName)) continue;
      const attr = geometry.getAttribute(attrName);
      if (!attr) continue;
      const itemSize = attr.itemSize;
      if (itemSize === 1) {
        const stream = new AttributeStream(attrName, 'point', 'FLOAT', attr.count);
        const streamData = stream.getRawData();
        for (let i = 0; i < attr.count; i++) {
          streamData[i] = attr.getX(i);
        }
        ctx.addAttribute(stream);
      } else if (itemSize === 3) {
        const stream = new AttributeStream(attrName, 'point', 'VECTOR', attr.count);
        const streamData = stream.getRawData();
        for (let i = 0; i < attr.count; i++) {
          streamData[i * 3] = attr.getX(i);
          streamData[i * 3 + 1] = attr.getY(i);
          streamData[i * 3 + 2] = attr.getZ(i);
        }
        ctx.addAttribute(stream);
      }
    }

    return ctx;
  }

  // -----------------------------------------------------------------------
  // Clone
  // -----------------------------------------------------------------------

  clone(): GeometryContext {
    const ctx = new GeometryContext(this.vertexCount, this.faceCount, this.edgeCount);

    // Clone built-in streams
    (ctx as any).positionStream = this.positionStream.clone();
    (ctx as any).normalStream = this.normalStream.clone();
    if (this.uvStream) {
      (ctx as any).uvStream = this.uvStream.clone();
    }

    // Rebuild attribute map from cloned built-ins + cloned customs
    ctx.attributes = new Map();
    ctx.attributes.set('position', ctx.positionStream);
    ctx.attributes.set('normal', ctx.normalStream);
    if (ctx.uvStream) {
      ctx.attributes.set('uv', ctx.uvStream);
    }

    // Clone custom attributes
    for (const [name, stream] of this.attributes.entries()) {
      if (name === 'position' || name === 'normal' || name === 'uv') continue;
      ctx.attributes.set(name, stream.clone());
    }

    // Clone index buffer
    if (this.indexBuffer.length > 0) {
      ctx.setIndexBuffer(new Uint32Array(this.indexBuffer));
    }

    return ctx;
  }
}

export default GeometryContext;
