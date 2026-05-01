/**
 * AttributeStream - Per-vertex data container for the node evaluation system
 *
 * A typed array of values, one per element in a geometry domain.
 * This is the fundamental data unit that flows between nodes in the per-vertex
 * evaluation model.
 *
 * Analogous to Blender's attribute system where data is stored per-vertex /
 * face / corner. Internally backed by a Float32Array for performance with
 * large meshes (100k+ vertices).
 *
 * Port of: Princeton Infinigen's per-element attribute streaming
 */

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/** Data types that an attribute can carry – mirrors Blender's attribute types */
export type AttributeDataType =
  | 'FLOAT'
  | 'INT'
  | 'BOOLEAN'
  | 'VECTOR'
  | 'COLOR'
  | 'QUATERNION'
  | 'MATRIX'
  | 'STRING';

/** Domains that an attribute can live on – mirrors Blender's attribute domains */
export type AttributeDomain =
  | 'point'
  | 'edge'
  | 'face'
  | 'face_corner'
  | 'curve'
  | 'instance';

// ---------------------------------------------------------------------------
// Component-count lookup
// ---------------------------------------------------------------------------

const COMPONENT_COUNT: Record<AttributeDataType, number> = {
  FLOAT: 1,
  INT: 1,
  BOOLEAN: 1,
  VECTOR: 3,
  COLOR: 4,
  QUATERNION: 4,
  MATRIX: 16,
  STRING: 1, // stored as an index; actual strings kept externally
};

// ---------------------------------------------------------------------------
// AttributeStream class
// ---------------------------------------------------------------------------

export class AttributeStream {
  readonly name: string;
  readonly domain: AttributeDomain;
  readonly dataType: AttributeDataType;
  readonly size: number; // number of elements
  private data: Float32Array; // flat typed array – components stored contiguously

  constructor(
    name: string,
    domain: AttributeDomain,
    dataType: AttributeDataType,
    size: number,
    data?: Float32Array,
  ) {
    this.name = name;
    this.domain = domain;
    this.dataType = dataType;
    this.size = size;

    const totalFloats = size * COMPONENT_COUNT[dataType];
    if (data) {
      if (data.length !== totalFloats) {
        throw new Error(
          `AttributeStream "${name}": expected ${totalFloats} floats for ${size} elements of ${dataType}, got ${data.length}`,
        );
      }
      this.data = data;
    } else {
      this.data = new Float32Array(totalFloats);
    }
  }

  // -----------------------------------------------------------------------
  // Component count
  // -----------------------------------------------------------------------

  /** Number of float components per element */
  get componentCount(): number {
    return COMPONENT_COUNT[this.dataType];
  }

  // -----------------------------------------------------------------------
  // Float accessors (1 component per element)
  // -----------------------------------------------------------------------

  getFloat(index: number): number {
    return this.data[index];
  }

  setFloat(index: number, value: number): void {
    this.data[index] = value;
  }

  // -----------------------------------------------------------------------
  // Vector accessors (3 components per element)
  // -----------------------------------------------------------------------

  getVector(index: number): [number, number, number] {
    const base = index * 3;
    return [this.data[base], this.data[base + 1], this.data[base + 2]];
  }

  setVector(index: number, value: [number, number, number]): void {
    const base = index * 3;
    this.data[base] = value[0];
    this.data[base + 1] = value[1];
    this.data[base + 2] = value[2];
  }

  // -----------------------------------------------------------------------
  // Color accessors (4 components per element)
  // -----------------------------------------------------------------------

  getColor(index: number): { r: number; g: number; b: number; a: number } {
    const base = index * 4;
    return {
      r: this.data[base],
      g: this.data[base + 1],
      b: this.data[base + 2],
      a: this.data[base + 3],
    };
  }

  setColor(index: number, value: { r: number; g: number; b: number; a: number }): void {
    const base = index * 4;
    this.data[base] = value.r;
    this.data[base + 1] = value.g;
    this.data[base + 2] = value.b;
    this.data[base + 3] = value.a;
  }

  // -----------------------------------------------------------------------
  // Int accessors (1 component, stored as float but semantically integer)
  // -----------------------------------------------------------------------

  getInt(index: number): number {
    return Math.round(this.data[index]);
  }

  setInt(index: number, value: number): void {
    this.data[index] = value;
  }

  // -----------------------------------------------------------------------
  // Boolean accessors (1 component, 0 = false, nonzero = true)
  // -----------------------------------------------------------------------

  getBoolean(index: number): boolean {
    return this.data[index] !== 0;
  }

  setBoolean(index: number, value: boolean): void {
    this.data[index] = value ? 1 : 0;
  }

  // -----------------------------------------------------------------------
  // Quaternion accessors (4 components)
  // -----------------------------------------------------------------------

  getQuaternion(index: number): [number, number, number, number] {
    const base = index * 4;
    return [this.data[base], this.data[base + 1], this.data[base + 2], this.data[base + 3]];
  }

  setQuaternion(index: number, value: [number, number, number, number]): void {
    const base = index * 4;
    this.data[base] = value[0];
    this.data[base + 1] = value[1];
    this.data[base + 2] = value[2];
    this.data[base + 3] = value[3];
  }

  // -----------------------------------------------------------------------
  // Matrix accessors (16 components, row-major)
  // -----------------------------------------------------------------------

  getMatrix(index: number): number[] {
    const base = index * 16;
    return Array.from(this.data.subarray(base, base + 16));
  }

  setMatrix(index: number, value: number[]): void {
    const base = index * 16;
    for (let i = 0; i < 16; i++) {
      this.data[base + i] = value[i];
    }
  }

  // -----------------------------------------------------------------------
  // Bulk operations
  // -----------------------------------------------------------------------

  /** Fill every component with the same value */
  fill(value: number): void {
    this.data.fill(value);
  }

  /** Return the underlying Float32Array (read-only reference) */
  getRawData(): Float32Array {
    return this.data;
  }

  /** Replace the underlying data array (must match expected length) */
  setRawData(data: Float32Array): void {
    const expected = this.size * COMPONENT_COUNT[this.dataType];
    if (data.length !== expected) {
      throw new Error(
        `AttributeStream "${this.name}": setRawData expected ${expected} floats, got ${data.length}`,
      );
    }
    this.data = data;
  }

  // -----------------------------------------------------------------------
  // Transform operations — return a *new* AttributeStream
  // -----------------------------------------------------------------------

  /**
   * Apply a function to every float element, returning a new FLOAT stream.
   * For FLOAT / INT / BOOLEAN streams only.
   */
  mapFloat(fn: (value: number, index: number) => number): AttributeStream {
    const out = new AttributeStream(this.name + '_mapped', this.domain, 'FLOAT', this.size);
    const src = this.data;
    const dst = out.getRawData();
    const cc = this.componentCount;

    if (cc === 1) {
      for (let i = 0; i < this.size; i++) {
        dst[i] = fn(src[i], i);
      }
    } else {
      // For multi-component types, apply to the first component only
      for (let i = 0; i < this.size; i++) {
        dst[i] = fn(src[i * cc], i);
      }
    }
    return out;
  }

  /**
   * Apply a function to every vector element, returning a new VECTOR stream.
   * For VECTOR streams only.
   */
  mapVector(
    fn: (x: number, y: number, z: number, index: number) => [number, number, number],
  ): AttributeStream {
    const out = new AttributeStream(this.name + '_mapped', this.domain, 'VECTOR', this.size);
    const dst = out.getRawData();
    for (let i = 0; i < this.size; i++) {
      const base = i * 3;
      const [nx, ny, nz] = fn(this.data[base], this.data[base + 1], this.data[base + 2], i);
      dst[base] = nx;
      dst[base + 1] = ny;
      dst[base + 2] = nz;
    }
    return out;
  }

  /**
   * Apply a function to every color element, returning a new COLOR stream.
   * For COLOR streams only.
   */
  mapColor(
    fn: (
      r: number,
      g: number,
      b: number,
      a: number,
      index: number,
    ) => { r: number; g: number; b: number; a: number },
  ): AttributeStream {
    const out = new AttributeStream(this.name + '_mapped', this.domain, 'COLOR', this.size);
    const dst = out.getRawData();
    for (let i = 0; i < this.size; i++) {
      const base = i * 4;
      const result = fn(
        this.data[base],
        this.data[base + 1],
        this.data[base + 2],
        this.data[base + 3],
        i,
      );
      dst[base] = result.r;
      dst[base + 1] = result.g;
      dst[base + 2] = result.b;
      dst[base + 3] = result.a;
    }
    return out;
  }

  // -----------------------------------------------------------------------
  // Reduction operations
  // -----------------------------------------------------------------------

  /**
   * Reduce all scalar values (first component of each element) into a single
   * number using the supplied reducer function.
   */
  reduceFloat(fn: (acc: number, value: number, index: number) => number, initial: number): number {
    let acc = initial;
    const cc = this.componentCount;
    for (let i = 0; i < this.size; i++) {
      acc = fn(acc, this.data[i * cc], i);
    }
    return acc;
  }

  /** Minimum value across all scalar components */
  min(): number {
    let m = Infinity;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] < m) m = this.data[i];
    }
    return m;
  }

  /** Maximum value across all scalar components */
  max(): number {
    let m = -Infinity;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] > m) m = this.data[i];
    }
    return m;
  }

  /** Mean of all scalar components */
  mean(): number {
    if (this.data.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      sum += this.data[i];
    }
    return sum / this.data.length;
  }

  // -----------------------------------------------------------------------
  // Clone / subset
  // -----------------------------------------------------------------------

  /** Deep-copy the stream */
  clone(): AttributeStream {
    return new AttributeStream(
      this.name,
      this.domain,
      this.dataType,
      this.size,
      new Float32Array(this.data),
    );
  }

  /** Create a new stream covering elements [start, end) */
  slice(start: number, end: number): AttributeStream {
    const cc = this.componentCount;
    const newSize = end - start;
    if (newSize < 0 || start < 0 || end > this.size) {
      throw new Error(
        `AttributeStream "${this.name}": slice(${start}, ${end}) out of bounds for size ${this.size}`,
      );
    }
    const srcOffset = start * cc;
    const srcEnd = end * cc;
    return new AttributeStream(
      this.name + '_slice',
      this.domain,
      this.dataType,
      newSize,
      new Float32Array(this.data.subarray(srcOffset, srcEnd)),
    );
  }
}

export default AttributeStream;
