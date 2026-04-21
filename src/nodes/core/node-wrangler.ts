/**
 * Node Wrangler - Core Node Graph Management
 * 
 * Ports: infinigen/core/nodes/node_wrangler.py
 * 
 * Provides a high-level API for creating and manipulating node graphs,
 * similar to Blender's NodeWrangler addon but adapted for TypeScript/R3F.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  NodeType,
  NodeTree,
  NodeInstance,
  NodeLink,
  NodeGroup,
  NodeGroupInterface,
  NodeSocket,
  SocketType,
  NodeCategory,
  areSocketsCompatible,
  getDefaultValueForType,
} from './types.js';

export interface NodeWranglerOptions {
  autoValidate?: boolean;
  autoLayout?: boolean;
}

const DEFAULT_OPTIONS: Required<NodeWranglerOptions> = {
  autoValidate: false,
  autoLayout: true,
};

/**
 * Main class for managing node graphs
 */
export class NodeWrangler {
  public tree: NodeTree;
  private options: Required<NodeWranglerOptions>;
  private nodeCounter: number = 0;

  constructor(
    name: string,
    type: 'GeometryNodeTree' | 'ShaderNodeTree' | 'CompositorNodeTree' = 'GeometryNodeTree',
    options: Partial<NodeWranglerOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    this.tree = {
      id: uuidv4(),
      name,
      type,
      nodes: new Map(),
      links: [],
      groups: new Map(),
      interface: {
        inputs: new Map(),
        outputs: new Map(),
      },
    };

    // Create default input/output nodes for geometry trees
    if (type === 'GeometryNodeTree') {
      this.createDefaultGeometryIO();
    }
  }

  /**
   * Create default Group Input and Group Output nodes
   */
  private createDefaultGeometryIO(): void {
    const inputNode = this.addNode(NodeType.GroupInput, 'Group Input', { x: -400, y: 0 });
    const outputNode = this.addNode(NodeType.GroupOutput, 'Group Output', { x: 400, y: 0 });
    
    // Set the output node as active
    outputNode.settings.isActiveOutput = true;
  }

  /**
   * Add a node to the graph
   */
  addNode(
    type: NodeType,
    name?: string,
    position: { x: number; y: number } = { x: 0, y: 0 }
  ): NodeInstance {
    const nodeId = `node_${this.nodeCounter++}_${uuidv4().substring(0, 8)}`;
    const nodeName = name || type.toString();

    const node: NodeInstance = {
      id: nodeId,
      type,
      name: nodeName,
      position,
      settings: {},
      inputs: new Map(),
      outputs: new Map(),
    };

    // Initialize with default values based on node type
    this.initializeNodeDefaults(node);

    this.tree.nodes.set(nodeId, node);
    return node;
  }

  /**
   * Initialize node with type-specific defaults
   */
  private initializeNodeDefaults(node: NodeInstance): void {
    switch (node.type) {
      case NodeType.Value:
        node.settings.value = 0.5;
        break;
      case NodeType.RGB:
        node.settings.color = [1, 1, 1, 1];
        break;
      case NodeType.Boolean:
        node.settings.boolean = true;
        break;
      case NodeType.Integer:
        node.settings.integer = 0;
        break;
      case NodeType.RandomValue:
        node.settings.dataType = 'FLOAT';
        node.settings.min = 0;
        node.settings.max = 1;
        node.settings.seed = Math.floor(Math.random() * 10000);
        break;
      case NodeType.PrincipledBSDF:
        node.settings.baseColor = [0.8, 0.8, 0.8, 1];
        node.settings.subsurface = 0;
        node.settings.metallic = 0;
        node.settings.roughness = 0.5;
        break;
      case NodeType.Transform:
        node.settings.translation = [0, 0, 0];
        node.settings.rotation = [0, 0, 0];
        node.settings.scale = [1, 1, 1];
        break;
      default:
        break;
    }
  }

  /**
   * Remove a node from the graph
   */
  removeNode(nodeId: string): void {
    const node = this.tree.nodes.get(nodeId);
    if (!node) return;

    // Remove all links connected to this node
    this.tree.links = this.tree.links.filter(
      link => link.fromNode !== nodeId && link.toNode !== nodeId
    );

    this.tree.nodes.delete(nodeId);
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): NodeInstance | undefined {
    return this.tree.nodes.get(nodeId);
  }

  /**
   * Find nodes by type
   */
  findNodesByType(type: NodeType): NodeInstance[] {
    return Array.from(this.tree.nodes.values()).filter(node => node.type === type);
  }

  /**
   * Link two nodes together
   */
  link(
    fromNode: string | NodeInstance,
    fromSocket: string,
    toNode: string | NodeInstance,
    toSocket: string
  ): NodeLink | null {
    const fromNodeId = typeof fromNode === 'string' ? fromNode : fromNode.id;
    const toNodeId = typeof toNode === 'string' ? toNode : toNode.id;

    const fromNodeInst = this.tree.nodes.get(fromNodeId);
    const toNodeInst = this.tree.nodes.get(toNodeId);

    if (!fromNodeInst || !toNodeInst) {
      console.warn(`Cannot link: one or both nodes not found`);
      return null;
    }

    // Validate socket compatibility if auto-validate is enabled
    if (this.options.autoValidate) {
      // In a full implementation, we'd check actual socket types here
      console.log(`Validating link: ${fromSocket} -> ${toSocket}`);
    }

    const link: NodeLink = {
      fromNode: fromNodeId,
      fromSocket,
      toNode: toNodeId,
      toSocket,
    };

    this.tree.links.push(link);
    return link;
  }

  /**
   * Remove a link
   */
  unlink(link: NodeLink): void {
    const index = this.tree.links.indexOf(link);
    if (index !== -1) {
      this.tree.links.splice(index, 1);
    }
  }

  /**
   * Set a node's input value (for literal values, not links)
   */
  setInputValue(
    node: string | NodeInstance,
    socketName: string,
    value: any
  ): void {
    const nodeId = typeof node === 'string' ? node : node.id;
    const nodeInst = this.tree.nodes.get(nodeId);
    
    if (!nodeInst) {
      console.warn(`Cannot set input: node ${nodeId} not found`);
      return;
    }

    nodeInst.inputs.set(socketName, value);
  }

  /**
   * Get a node's output value (if it's been evaluated)
   */
  getOutputValue(
    node: string | NodeInstance,
    socketName: string
  ): any {
    const nodeId = typeof node === 'string' ? node : node.id;
    const nodeInst = this.tree.nodes.get(nodeId);
    
    if (!nodeInst) {
      console.warn(`Cannot get output: node ${nodeId} not found`);
      return undefined;
    }

    return nodeInst.outputs.get(socketName);
  }

  /**
   * Expose an input from a node group
   */
  exposeInput(
    node: string | NodeInstance,
    socketName: string,
    exposedName?: string
  ): NodeSocket | null {
    const nodeId = typeof node === 'string' ? node : node.id;
    const nodeInst = this.tree.nodes.get(nodeId);
    
    if (!nodeInst) {
      console.warn(`Cannot expose input: node ${nodeId} not found`);
      return null;
    }

    const name = exposedName || `${nodeInst.name}_${socketName}`;
    
    // Create a new interface socket
    const interfaceSocket: NodeSocket = {
      name,
      type: SocketType.FLOAT, // Would need to infer from actual socket
      defaultValue: nodeInst.inputs.get(socketName),
    };

    this.tree.interface.inputs.set(name, interfaceSocket);
    return interfaceSocket;
  }

  /**
   * Expose an output from a node group
   */
  exposeOutput(
    node: string | NodeInstance,
    socketName: string,
    exposedName?: string
  ): NodeSocket | null {
    const nodeId = typeof node === 'string' ? node : node.id;
    const nodeInst = this.tree.nodes.get(nodeId);
    
    if (!nodeInst) {
      console.warn(`Cannot expose output: node ${nodeId} not found`);
      return null;
    }

    const name = exposedName || `${nodeInst.name}_${socketName}`;
    
    const interfaceSocket: NodeSocket = {
      name,
      type: SocketType.FLOAT, // Would need to infer from actual socket
    };

    this.tree.interface.outputs.set(name, interfaceSocket);
    return interfaceSocket;
  }

  /**
   * Create a node group from selected nodes
   */
  createNodeGroup(
    nodeIds: string[],
    groupName: string
  ): NodeGroup | null {
    const nodesToGroup = nodeIds
      .map(id => this.tree.nodes.get(id))
      .filter((n): n is NodeInstance => n !== undefined);

    if (nodesToGroup.length === 0) {
      console.warn('No valid nodes to group');
      return null;
    }

    const groupId = `group_${uuidv4().substring(0, 8)}`;
    
    const group: NodeGroup = {
      id: groupId,
      name: groupName,
      nodes: new Map(nodesToGroup.map(n => [n.id, n])),
      links: this.tree.links.filter(
        link => nodeIds.includes(link.fromNode) && nodeIds.includes(link.toNode)
      ),
      interface: {
        inputs: new Map(),
        outputs: new Map(),
      },
    };

    this.tree.groups.set(groupId, group);

    // Remove grouped nodes from main tree
    nodeIds.forEach(id => this.tree.nodes.delete(id));
    
    // Remove internal links from main tree
    this.tree.links = this.tree.links.filter(
      link => !nodeIds.includes(link.fromNode) || !nodeIds.includes(link.toNode)
    );

    // Create a group instance node in the main tree
    const groupNode = this.addNode(
      NodeType.GroupInput, // Placeholder - would need a proper GroupInstance type
      groupName,
      {
        x: nodesToGroup[0].position.x,
        y: nodesToGroup[0].position.y,
      }
    );
    groupNode.settings.groupId = groupId;

    return group;
  }

  /**
   * Auto-layout nodes in the graph
   */
  autoLayout(): void {
    if (!this.options.autoLayout) return;

    // Simple grid-based layout
    const nodes = Array.from(this.tree.nodes.values());
    const gridSize = 200;
    const cols = Math.ceil(Math.sqrt(nodes.length));
    
    nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      node.position.x = col * gridSize;
      node.position.y = row * gridSize;
    });
  }

  /**
   * Validate the node graph
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for orphaned links
    this.tree.links.forEach(link => {
      if (!this.tree.nodes.has(link.fromNode)) {
        errors.push(`Link references non-existent source node: ${link.fromNode}`);
      }
      if (!this.tree.nodes.has(link.toNode)) {
        errors.push(`Link references non-existent target node: ${link.toNode}`);
      }
    });

    // Check for cycles (simplified check)
    // A full implementation would do proper cycle detection

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export the node tree to JSON
   */
  toJSON(): object {
    return {
      id: this.tree.id,
      name: this.tree.name,
      type: this.tree.type,
      nodes: Array.from(this.tree.nodes.entries()).map(([id, node]) => ({
        id,
        type: node.type,
        name: node.name,
        position: node.position,
        settings: node.settings,
        inputs: Object.fromEntries(node.inputs),
        outputs: Object.fromEntries(node.outputs),
      })),
      links: this.tree.links,
      interface: {
        inputs: Object.fromEntries(
          Array.from(this.tree.interface.inputs.entries()).map(([k, v]) => [k, { ...v }])
        ),
        outputs: Object.fromEntries(
          Array.from(this.tree.interface.outputs.entries()).map(([k, v]) => [k, { ...v }])
        ),
      },
    };
  }

  /**
   * Import a node tree from JSON
   */
  static fromJSON(json: any): NodeWrangler {
    const wrangler = new NodeWrangler(json.name, json.type);
    wrangler.tree.id = json.id;

    // Restore nodes
    json.nodes.forEach((nodeData: any) => {
      const node: NodeInstance = {
        id: nodeData.id,
        type: nodeData.type,
        name: nodeData.name,
        position: nodeData.position,
        settings: nodeData.settings,
        inputs: new Map(Object.entries(nodeData.inputs || {})),
        outputs: new Map(Object.entries(nodeData.outputs || {})),
      };
      wrangler.tree.nodes.set(nodeData.id, node);
    });

    // Restore links
    wrangler.tree.links = json.links || [];

    return wrangler;
  }

  /**
   * Clear the entire node tree
   */
  clear(): void {
    this.tree.nodes.clear();
    this.tree.links = [];
    this.tree.groups.clear();
    this.tree.interface.inputs.clear();
    this.tree.interface.outputs.clear();
    this.nodeCounter = 0;
    
    // Recreate default IO
    if (this.tree.type === 'GeometryNodeTree') {
      this.createDefaultGeometryIO();
    }
  }
}

/**
 * Create a new node wrangler for shader/material trees
 */
export function createMaterialNodeTree(name: string): NodeWrangler {
  return new NodeWrangler(name, 'ShaderNodeTree');
}

/**
 * Create a new node wrangler for geometry trees
 */
export function createGeometryNodeTree(name: string): NodeWrangler {
  return new NodeWrangler(name, 'GeometryNodeTree');
}

/**
 * Create a new node wrangler for compositor trees
 */
export function createCompositorNodeTree(name: string): NodeWrangler {
  return new NodeWrangler(name, 'CompositorNodeTree');
}
