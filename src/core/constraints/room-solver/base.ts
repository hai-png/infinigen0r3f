/**
 * Infinigen R3F Port - Room Graph Base
 * 
 * Ports: core/indoor/room_graph.py
 * Status: 100% portable - Pure graph representation
 */

export interface RoomNode {
  id: string;
  type: string;
  level: number;
  area?: number;
  centroid?: [number, number];
  metadata?: Record<string, any>;
}

/** Neighbor type for room graph edges */
export type NeighborType = 'adjacent' | 'diagonal' | 'cardinal' | 'all';

export interface RoomEdge {
  from: string;
  to: string;
  type: 'adjacent' | 'connected' | 'visible';
}

export class RoomGraph {
  rooms: RoomNode[];
  edges: RoomEdge[];
  private adjacencyMap: Map<string, Set<string>>;
  /** Map from room ID to room node for quick lookup */
  private roomMap: Map<string, RoomNode>;

  constructor(rooms: RoomNode[] = [], edges: RoomEdge[] = []) {
    this.rooms = rooms;
    this.edges = edges;
    this.adjacencyMap = new Map();
    this.roomMap = new Map();
    
    for (const room of rooms) {
      this.adjacencyMap.set(room.id, new Set());
      this.roomMap.set(room.id, room);
    }
    
    for (const edge of edges) {
      if (edge.type === 'adjacent') {
        this.adjacencyMap.get(edge.from)?.add(edge.to);
        this.adjacencyMap.get(edge.to)?.add(edge.from);
      }
    }
  }

  /** Get a room by ID */
  get(id: string): RoomNode | undefined {
    return this.roomMap.get(id);
  }

  /** Get all room IDs */
  keys(): IterableIterator<string> {
    return this.roomMap.keys();
  }

  /** Remove an edge between rooms */
  removeEdge(from: string, to: string): void {
    this.edges = this.edges.filter(e => !(e.from === from && e.to === to) && !(e.from === to && e.to === from));
    this.adjacencyMap.get(from)?.delete(to);
    this.adjacencyMap.get(to)?.delete(from);
  }

  getNeighbours(roomId: string): string[] {
    return Array.from(this.adjacencyMap.get(roomId) || []);
  }

  addRoom(room: RoomNode): void {
    this.rooms.push(room);
    this.adjacencyMap.set(room.id, new Set());
  }

  addEdge(from: string, to: string, type: 'adjacent' | 'connected' | 'visible' = 'adjacent'): void {
    this.edges.push({ from, to, type });
    if (type === 'adjacent') {
      this.adjacencyMap.get(from)?.add(to);
      this.adjacencyMap.get(to)?.add(from);
    }
  }

  isPlanar(): boolean {
    const n = this.rooms.length;
    const e = this.edges.filter(e => e.type === 'adjacent').length;
    return e <= 3 * n - 6;
  }

  computeCycleBasis(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const parent = new Map<string, string | null>();
    
    if (this.rooms.length === 0) return cycles;
    
    const queue: string[] = [this.rooms[0].id];
    parent.set(queue[0], null);
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      
      const neighbours = this.getNeighbours(current);
      for (const neighbour of neighbours) {
        if (!parent.has(neighbour)) {
          parent.set(neighbour, current);
          queue.push(neighbour);
        } else if (neighbour !== parent.get(current)) {
          const cycle = this.extractCycle(current, neighbour, parent);
          if (cycle.length > 0 && !this.cycleExists(cycle, cycles)) {
            cycles.push(cycle);
          }
        }
      }
    }
    
    return cycles;
  }

  private extractCycle(node1: string, node2: string, parent: Map<string, string | null>): string[] {
    const path1: string[] = [];
    const path2: string[] = [];
    
    let current: string | null = node1;
    while (current !== null) {
      path1.push(current);
      current = parent.get(current) || null;
    }
    
    current = node2;
    while (current !== null) {
      path2.push(current);
      current = parent.get(current) || null;
    }
    
    const set1 = new Set(path1);
    const lca = path2.find(n => set1.has(n));
    if (!lca) return [];
    
    const cycle: string[] = [];
    for (const n of path1) {
      cycle.push(n);
      if (n === lca) break;
    }
    
    for (let i = path2.indexOf(lca) - 1; i >= 0; i--) {
      cycle.push(path2[i]);
    }
    
    return cycle;
  }

  private cycleExists(cycle: string[], cycles: string[][]): boolean {
    const cycleSet = new Set(cycle);
    for (const existing of cycles) {
      if (existing.length === cycle.length) {
        const existingSet = new Set(existing);
        let same = true;
        for (const node of cycle) {
          if (!existingSet.has(node)) {
            same = false;
            break;
          }
        }
        if (same) return true;
      }
    }
    return false;
  }

  getValidNeighbours(roomId: string, validTypes?: string[]): string[] {
    const neighbours = this.getNeighbours(roomId);
    if (!validTypes) return neighbours;
    return neighbours.filter(id => {
      const room = this.rooms.find(r => r.id === id);
      return room && validTypes.includes(room.type);
    });
  }

  toJSON(): object {
    return { rooms: this.rooms, edges: this.edges };
  }

  static fromJSON(json: any): RoomGraph {
    return new RoomGraph(json.rooms || [], json.edges || []);
  }

  /**
   * Clone this graph
   */
  clone(): RoomGraph {
    return new RoomGraph(
      this.rooms.map(r => ({ ...r })),
      this.edges.map(e => ({ ...e }))
    );
  }

  /**
   * Get adjacency list as a Map
   */
  getAdjacencyList(): Map<string, Set<string>> {
    return new Map(this.adjacencyMap);
  }

  /**
   * Check if two rooms are neighbors
   */
  areNeighbors(room1Id: string, room2Id: string): boolean {
    return this.adjacencyMap.get(room1Id)?.has(room2Id) ?? false;
  }

  /**
   * Check if the graph is fully connected
   */
  isConnected(): boolean {
    if (this.rooms.length === 0) return true;
    const visited = new Set<string>();
    const queue = [this.rooms[0].id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of this.getNeighbours(current)) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    return visited.size === this.rooms.length;
  }
}
