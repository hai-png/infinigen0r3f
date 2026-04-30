/**
 * Kinematic Node - Joint and bone representation for kinematic chains
 * 
 * Used by the KinematicCompiler for building articulated structures
 * like robot arms, character skeletons, and mechanical linkages.
 */

import * as THREE from 'three';

export enum KinematicType {
  NONE = 'none',
  JOINT = 'joint',
  DUPLICATE = 'duplicate',
  SWITCH = 'switch',
  ASSET = 'asset',
  Revolute = 'revolute',
  Prismatic = 'prismatic',
  Fixed = 'fixed',
  Continuous = 'continuous',
  Planar = 'planar',
  Floating = 'floating',
}

export enum JointType {
  NONE = 'none',
  HINGE = 'hinge',
  WELD = 'weld',
  SLIDING = 'sliding',
  Hinge = 'hinge',
  Ball = 'ball',
  Slider = 'slider',
  Universal = 'universal',
  Cylindrical = 'cylindrical',
  Screw = 'screw',
}

export interface KinematicNodeConfig {
  name: string;
  type: KinematicType;
  jointType: JointType;
  parent: string | null;
  axis: THREE.Vector3;
  origin: THREE.Vector3;
  limits: { lower: number; upper: number };
  damping: number;
  friction: number;
  maxVelocity: number;
  maxEffort: number;
}

export class KinematicNode {
  public name: string;
  public type: KinematicType;
  public kinematicType: KinematicType;
  public jointType: JointType;
  public parent: KinematicNode | null;
  public children: KinematicNode[];
  public axis: THREE.Vector3;
  public origin: THREE.Vector3;
  public limits: { lower: number; upper: number };
  public currentValue: number;
  public transform: THREE.Matrix4;
  public idn: number;
  private static _nextIdn = 0;

  constructor(config: Partial<KinematicNodeConfig> & { name: string }) {
    this.name = config.name;
    this.type = config.type || KinematicType.Revolute;
    this.kinematicType = this.type;
    this.jointType = config.jointType || JointType.Hinge;
    this.parent = null;
    this.children = [];
    this.axis = config.axis || new THREE.Vector3(0, 1, 0);
    this.origin = config.origin || new THREE.Vector3();
    this.limits = config.limits || { lower: -Math.PI, upper: Math.PI };
    this.currentValue = 0;
    this.transform = new THREE.Matrix4();
    this.idn = KinematicNode._nextIdn++;
  }

  static resetCounts(): void {
    KinematicNode._nextIdn = 0;
  }

  setIdn(idn: number): void {
    this.idn = idn;
  }

  addChild(childOrIdx: KinematicNode | number, child?: KinematicNode): void {
    if (typeof childOrIdx === 'number' && child) {
      // addChild(idx, node) form - insert at specific index
      while (this.children.length <= childOrIdx) {
        this.children.push(null as any);
      }
      this.children[childOrIdx] = child;
      child.parent = this;
    } else if (childOrIdx instanceof KinematicNode) {
      // addChild(node) form - append
      this.children.push(childOrIdx);
      childOrIdx.parent = this;
    }
  }

  /** Get all children recursively (flattened) */
  getAllChildren(): KinematicNode[] {
    const result: KinematicNode[] = [];
    for (const child of this.children) {
      if (child) {
        result.push(child);
        result.push(...child.getAllChildren());
      }
    }
    return result;
  }

  getGraph(): KinematicNode {
    let root: KinematicNode = this;
    while (root.parent) {
      root = root.parent;
    }
    return root;
  }

  setParent(parent: KinematicNode): void {
    this.parent = parent;
    parent.children.push(this);
  }

  setValue(value: number): void {
    this.currentValue = Math.max(this.limits.lower, Math.min(this.limits.upper, value));
    this.updateTransform();
  }

  protected updateTransform(): void {
    this.transform = new THREE.Matrix4();
  }

  getWorldTransform(): THREE.Matrix4 {
    if (this.parent) {
      return new THREE.Matrix4().multiplyMatrices(this.parent.getWorldTransform(), this.transform);
    }
    return this.transform.clone();
  }
}

export function kinematicNodeFactory(typeOrConfig: KinematicType | (Partial<KinematicNodeConfig> & { name: string }), jointType?: JointType): KinematicNode {
  if (typeof typeOrConfig === 'string' || Object.values(KinematicType).includes(typeOrConfig as any)) {
    // kinematicNodeFactory(kinematicType, jointType) form
    return new KinematicNode({
      name: `node_${KinematicNode['_nextIdn']}`,
      type: typeOrConfig as KinematicType,
      jointType: jointType || JointType.NONE,
    });
  }
  return new KinematicNode(typeOrConfig);
}
