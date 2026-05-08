/**
 * Socket Types for the Node System
 *
 * Defines the type system for node sockets — the typed connection points
 * on procedural generation nodes that determine what can be wired together.
 *
 * Consolidated from the original Blender-oriented mapping:
 * - Removed redundant aliases (INT→INTEGER, RGB/RGBA→COLOR, UV→VECTOR)
 * - Removed Blender-internal types with no R3F equivalent (LIGHT_PROBE,
 *   LINE_STYLE, MASK, MOVIE_CLIP, SPEAKER, etc.)
 * - Kept geometry subtypes that carry real semantic meaning in a
 *   Three.js / R3F pipeline
 *
 * @module core/nodes/registry/socket-types
 */

// ---------------------------------------------------------------------------
// SocketType enum
// ---------------------------------------------------------------------------

/**
 * Enumerates every socket type recognised by the node editor.
 *
 * Values are upper-cased strings so they survive serialisation round-trips
 * (JSON, storage, network) without extra mapping logic.
 */
export enum SocketType {
  /** Generic geometry — may contain any combination of mesh/curve/points/volume/instances */
  GEOMETRY = 'GEOMETRY',
  /** 3-component direction / position vector */
  VECTOR = 'VECTOR',
  /** RGB or RGBA colour value */
  COLOR = 'COLOR',
  /** Single-precision floating-point scalar */
  FLOAT = 'FLOAT',
  /** 32-bit integer scalar */
  INTEGER = 'INTEGER',
  /** True / false flag */
  BOOLEAN = 'BOOLEAN',
  /** Short text string (identifier, label, etc.) */
  STRING = 'STRING',
  /** Texture sampler reference */
  TEXTURE = 'TEXTURE',
  /** Material definition reference */
  MATERIAL = 'MATERIAL',
  /** Shader program reference (vertex / fragment / compute) */
  SHADER = 'SHADER',
  /** Volumetric data grid */
  VOLUME = 'VOLUME',
  /** Generic numeric value — implicitly convertible to FLOAT or INTEGER */
  VALUE = 'VALUE',
  /** Polygon mesh geometry */
  MESH = 'MESH',
  /** Spline / curve geometry */
  CURVE = 'CURVE',
  /** Point cloud geometry */
  POINTS = 'POINTS',
  /** Instanced geometry reference */
  INSTANCE = 'INSTANCE',
  /** Scene object reference */
  OBJECT = 'OBJECT',
  /** Collection / group of objects */
  COLLECTION = 'COLLECTION',
  /** 2-D image buffer */
  IMAGE = 'IMAGE',
  /** Euler or axis-angle rotation */
  ROTATION = 'ROTATION',
  /** 4×4 transformation matrix */
  MATRIX = 'MATRIX',
  /** Quaternion rotation */
  QUATERNION = 'QUATERNION',
  /** Decomposed transform (translation + rotation + scale) */
  TRANSFORM = 'TRANSFORM',
}

// ---------------------------------------------------------------------------
// GeometryDataType
// ---------------------------------------------------------------------------

/**
 * Discriminant for the kind of data a GEOMETRY socket carries.
 *
 * When a socket is typed as `GEOMETRY` it may hold any of these; nodes
 * like "Separate Geometry" or "Join Geometry" use this to filter or
 * combine streams.
 */
export type GeometryDataType =
  | 'mesh'
  | 'curve'
  | 'point_cloud'
  | 'volume'
  | 'instances';

// ---------------------------------------------------------------------------
// SocketDefinition — declarative metadata for a socket on a node *type*
// ---------------------------------------------------------------------------

/**
 * Describes a single socket as declared in a node-type definition.
 *
 * This is the *blueprint* — it lives on the node registry, not on a live
 * node instance.  Runtime values and connections are modelled by
 * {@link NodeSocket} instead.
 */
export interface SocketDefinition {
  /** Human-readable name shown in the editor UI */
  name: string;
  /** Type identifier used for connection compatibility checks */
  type: SocketType;
  /** Default value when the socket is unconnected and no override is set */
  defaultValue?: unknown;
  /** Minimum allowed numeric value (applies to FLOAT / INTEGER only) */
  min?: number;
  /** Maximum allowed numeric value (applies to FLOAT / INTEGER only) */
  max?: number;
  /** Short explanation of what the socket provides or expects */
  description?: string;
}

// ---------------------------------------------------------------------------
// NodeSocket — runtime socket on a node *instance*
// ---------------------------------------------------------------------------

/**
 * Represents a live socket on a concrete node in the editor graph.
 *
 * Complements {@link SocketDefinition} with runtime state: the current
 * value and any active connection.
 *
 * @typeParam T - The concrete type of the socket's value.  Defaults to
 *   `unknown` for type-safe usage; legacy code may use `any`.
 */
export interface NodeSocket<T = unknown> {
  /** Unique socket identifier */
  id?: string;
  /** Human-readable name (matches the corresponding SocketDefinition) */
  name: string;
  /** Type identifier — determines connection compatibility */
  type: SocketType;
  /** Current value; `undefined` when the socket is connected (value flows from upstream) */
  value?: T;
  /** Default value when unconnected and no override is set */
  defaultValue?: T;
  /** Legacy alias for defaultValue */
  default?: T;
  /** ID of the socket this one is wired to, or `undefined` if unconnected */
  connectedTo?: string;
  /** `true` for input sockets, `false` for output sockets */
  isInput: boolean;
  /** Reference to the blueprint this socket was created from */
  definition?: SocketDefinition;
  /** Whether the socket requires a connection */
  required?: boolean;
  /** Minimum allowed numeric value (applies to FLOAT / INTEGER only) */
  min?: number;
  /** Maximum allowed numeric value (applies to FLOAT / INTEGER only) */
  max?: number;
  /** Short explanation of what the socket provides or expects */
  description?: string;
}

// ---------------------------------------------------------------------------
// Helper: default values
// ---------------------------------------------------------------------------

/** Mapping from socket type to its idiomatic default value. */
const DEFAULT_VALUES: Readonly<Record<SocketType, unknown>> = {
  [SocketType.GEOMETRY]:  null,
  [SocketType.VECTOR]:    [0, 0, 0],
  [SocketType.COLOR]:     [0, 0, 0, 1],   // RGBA — black, fully opaque
  [SocketType.FLOAT]:     0.0,
  [SocketType.INTEGER]:   0,
  [SocketType.BOOLEAN]:   false,
  [SocketType.STRING]:    '',
  [SocketType.TEXTURE]:   null,
  [SocketType.MATERIAL]:  null,
  [SocketType.SHADER]:    null,
  [SocketType.VOLUME]:    null,
  [SocketType.VALUE]:     0.0,
  [SocketType.MESH]:      null,
  [SocketType.CURVE]:     null,
  [SocketType.POINTS]:    null,
  [SocketType.INSTANCE]:  null,
  [SocketType.OBJECT]:    null,
  [SocketType.COLLECTION]: null,
  [SocketType.IMAGE]:     null,
  [SocketType.ROTATION]:  [0, 0, 0],       // Euler XYZ in radians
  [SocketType.MATRIX]:    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], // identity 4×4 (row-major)
  [SocketType.QUATERNION]: [0, 0, 0, 1],   // xyzw identity quaternion
  [SocketType.TRANSFORM]: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
};

/**
 * Returns the idiomatic default value for a given socket type.
 *
 * Reference types (GEOMETRY, MATERIAL, SHADER, OBJECT, etc.) default to
 * `null`.  Value types return a sensible zero / identity constant.
 *
 * @param type - The socket type to look up.
 * @returns A default value suitable for the type. Callers should **not**
 *          mutate the returned value for reference types.
 */
export function getDefaultValueForType(type: SocketType): unknown {
  return DEFAULT_VALUES[type];
}

// ---------------------------------------------------------------------------
// Helper: compatibility check
// ---------------------------------------------------------------------------

/**
 * Implicit conversion rules.
 *
 * Each entry maps a *source* type to the set of *target* types it may
 * automatically convert to.  A direct type match is always allowed and
 * does not need to be listed here.
 */
const IMPLICIT_CONVERSIONS: Readonly<Record<SocketType, ReadonlySet<SocketType>>> = {
  [SocketType.GEOMETRY]:   new Set([SocketType.MESH, SocketType.CURVE, SocketType.POINTS, SocketType.VOLUME, SocketType.INSTANCE]),
  [SocketType.VALUE]:      new Set([SocketType.FLOAT, SocketType.INTEGER]),
  [SocketType.FLOAT]:      new Set([SocketType.VALUE, SocketType.INTEGER]),
  [SocketType.INTEGER]:    new Set([SocketType.VALUE, SocketType.FLOAT]),
  [SocketType.COLOR]:      new Set([SocketType.VECTOR]),    // colour → XYZ components
  [SocketType.VECTOR]:     new Set([SocketType.COLOR]),     // vector → RGB components
  [SocketType.QUATERNION]: new Set([SocketType.ROTATION, SocketType.MATRIX]),
  [SocketType.ROTATION]:   new Set([SocketType.QUATERNION, SocketType.MATRIX]),
  [SocketType.MATRIX]:     new Set([SocketType.TRANSFORM]),
  [SocketType.TRANSFORM]:  new Set([SocketType.MATRIX]),
  [SocketType.OBJECT]:     new Set([SocketType.GEOMETRY, SocketType.COLLECTION]),
  // Types with no implicit conversions — must match exactly
  [SocketType.BOOLEAN]:    new Set(),
  [SocketType.STRING]:     new Set(),
  [SocketType.TEXTURE]:    new Set(),
  [SocketType.MATERIAL]:   new Set(),
  [SocketType.SHADER]:     new Set(),
  [SocketType.VOLUME]:     new Set(),
  [SocketType.MESH]:       new Set([SocketType.GEOMETRY]),
  [SocketType.CURVE]:      new Set([SocketType.GEOMETRY]),
  [SocketType.POINTS]:     new Set([SocketType.GEOMETRY]),
  [SocketType.INSTANCE]:   new Set([SocketType.GEOMETRY]),
  [SocketType.COLLECTION]: new Set([SocketType.OBJECT]),
  [SocketType.IMAGE]:      new Set([SocketType.TEXTURE]),
};

/**
 * Determines whether a source socket can be connected to a target socket,
 * taking implicit type-conversion rules into account.
 *
 * Two sockets are compatible when:
 * 1. They are the **same type**, or
 * 2. The source type has a listed implicit conversion to the target type.
 *
 * @param source - The type of the output (upstream) socket.
 * @param target - The type of the input (downstream) socket.
 * @returns `true` if the connection is allowed.
 */
export function areSocketsCompatible(source: SocketType, target: SocketType): boolean {
  if (source === target) return true;
  return IMPLICIT_CONVERSIONS[source]?.has(target) ?? false;
}
