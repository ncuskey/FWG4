import type { Cell } from './voronoi';

const PRECISION = 2;

export interface CoastlineSegment {
  start: [number, number];
  end: [number, number];
  landCellId: number;
  waterCellId: number;
  featureId?: number; // The land feature this coastline borders
  type?: 'ocean' | 'lake';
}

export interface Feature {
  id: number;
  type: 'ocean' | 'lake' | 'island';
  land: boolean;
  border: boolean;
  name?: string;
  size?: number;
  boundary?: [number, number][];
  cells: number[]; // Array of cell IDs belonging to this feature
}

/**
 * Find all coastal edges (edges between land and water cells)
 */
export function findCoastalEdges(cells: Cell[]): CoastlineSegment[] {
  const segments: CoastlineSegment[] = [];
  
  for (const landCell of cells) {
    if (!landCell.isLand) continue;
    
    for (const neighborId of landCell.neighbors) {
      const neighbor = cells.find(c => c.id === neighborId);
      if (!neighbor || neighbor.isLand) continue;
      
      // Found a coastal edge: land cell adjacent to water cell
      // We need to find the shared edge between these two cells
      const edge = findSharedEdge(landCell, neighbor);
      if (edge) {
        segments.push({
          start: edge.start,
          end: edge.end,
          landCellId: landCell.id,
          waterCellId: neighbor.id
        });
      }
    }
  }
  
  return segments;
}

/**
 * Find the shared edge between two adjacent cells using set intersection
 */
function findSharedEdge(cell1: Cell, cell2: Cell): { start: [number, number], end: [number, number] } | null {
  const polygon1 = cell1.polygon;
  const polygon2 = cell2.polygon;
  
  // Build sets of rounded vertex keys for each polygon
  const set1 = new Set<string>();
  const set2 = new Set<string>();
  
  // Helper function to create rounded vertex keys
  function vertexKey(vertex: [number, number]): string {
    return `${vertex[0].toFixed(PRECISION)},${vertex[1].toFixed(PRECISION)}`;
  }
  
  // Add all vertices from polygon1 to set1
  for (const vertex of polygon1) {
    set1.add(vertexKey(vertex));
  }
  
  // Add all vertices from polygon2 to set2
  for (const vertex of polygon2) {
    set2.add(vertexKey(vertex));
  }
  
  // Find intersection of the two sets
  const commonKeys = new Set<string>();
  for (const key of set1) {
    if (set2.has(key)) {
      commonKeys.add(key);
    }
  }
  
  // If we have at least 2 common vertices, they form the shared edge
  if (commonKeys.size >= 2) {
    // Convert keys back to coordinates and find the original vertices
    const commonVertices: [number, number][] = [];
    
    // Find original vertices from polygon1 that match the common keys
    for (const vertex of polygon1) {
      const key = vertexKey(vertex);
      if (commonKeys.has(key)) {
        commonVertices.push(vertex);
      }
    }
    
    // If we found exactly 2 vertices, return them as the edge
    if (commonVertices.length === 2) {
      return {
        start: commonVertices[0],
        end: commonVertices[1]
      };
    }
  }
  
  return null;
}

/**
 * Mark cells as coastal (land cells adjacent to water)
 */
export function markCoastalCells(cells: Cell[]): void {
  cells.forEach(cell => {
    if (!cell.isLand) {
      cell.isCoastal = false;
      cell.coastalNeighborsCount = 0;
      return;
    }
    
    let coastalCount = 0;
    for (const neighborId of cell.neighbors) {
      const neighbor = cells.find(c => c.id === neighborId);
      if (neighbor && !neighbor.isLand) {
        coastalCount++;
      }
    }
    
    cell.isCoastal = coastalCount > 0;
    cell.coastalNeighborsCount = coastalCount;
  });
}

/**
 * Label connected regions using flood-fill (BFS)
 */
export function labelFeatures(cells: Cell[], width: number, height: number): Feature[] {
  const features: Feature[] = [];
  let nextFeatureId = 0;
  
  // Reset feature assignments
  cells.forEach(cell => {
    cell.featureId = undefined;
  });
  
  // 1. Label Ocean (start from border water cells)
  const oceanFeature = labelOcean(cells, width, height, nextFeatureId++);
  features.push(oceanFeature);
  
  // 2. Label remaining water as Lakes
  const lakeFeatures = labelLakes(cells, nextFeatureId);
  features.push(...lakeFeatures);
  nextFeatureId += lakeFeatures.length;
  
  // 3. Label land as Islands/Continents
  const islandFeatures = labelIslands(cells, width, height, nextFeatureId);
  features.push(...islandFeatures);
  
  return features;
}

/**
 * Label the ocean (all water connected to map borders)
 */
function labelOcean(cells: Cell[], width: number, height: number, featureId: number): Feature {
  const oceanCells: number[] = [];
  const visited = new Set<number>();
  
  // Find border water cells to start flood-fill
  const borderWaterCells = cells.filter(cell => 
    !cell.isLand && (
      cell.centroid[0] <= 10 || cell.centroid[0] >= width - 10 ||
      cell.centroid[1] <= 10 || cell.centroid[1] >= height - 10
    )
  );
  
  // Flood-fill from border water cells
  for (const startCell of borderWaterCells) {
    if (visited.has(startCell.id)) continue;
    
    const queue = [startCell];
    visited.add(startCell.id);
    
    while (queue.length > 0) {
      const cell = queue.shift()!;
      oceanCells.push(cell.id);
      cell.featureId = featureId;
      
      // Add unvisited water neighbors
      for (const neighborId of cell.neighbors) {
        const neighbor = cells.find(c => c.id === neighborId);
        if (neighbor && !neighbor.isLand && !visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          queue.push(neighbor);
        }
      }
    }
  }
  
  return {
    id: featureId,
    type: 'ocean',
    land: false,
    border: true,
    name: 'Ocean',
    size: oceanCells.length,
    cells: oceanCells
  };
}

/**
 * Label remaining water as lakes
 */
function labelLakes(cells: Cell[], startFeatureId: number): Feature[] {
  const lakeFeatures: Feature[] = [];
  const visited = new Set<number>();
  let nextFeatureId = startFeatureId;
  
  // Find unvisited water cells (these must be lakes)
  for (const cell of cells) {
    if (cell.isLand || visited.has(cell.id) || cell.featureId !== undefined) continue;
    
    // Start flood-fill for new lake
    const lakeCells: number[] = [];
    const queue = [cell];
    visited.add(cell.id);
    
    while (queue.length > 0) {
      const currentCell = queue.shift()!;
      lakeCells.push(currentCell.id);
      currentCell.featureId = nextFeatureId;
      
      // Add unvisited water neighbors
      for (const neighborId of currentCell.neighbors) {
        const neighbor = cells.find(c => c.id === neighborId);
        if (neighbor && !neighbor.isLand && !visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          queue.push(neighbor);
        }
      }
    }
    
    // Create lake feature
    lakeFeatures.push({
      id: nextFeatureId,
      type: 'lake',
      land: false,
      border: false,
      name: `Lake ${lakeFeatures.length + 1}`,
      size: lakeCells.length,
      cells: lakeCells
    });
    
    nextFeatureId++;
  }
  
  return lakeFeatures;
}

/**
 * Label land as islands/continents
 */
function labelIslands(cells: Cell[], width: number, height: number, startFeatureId: number): Feature[] {
  const islandFeatures: Feature[] = [];
  const visited = new Set<number>();
  let nextFeatureId = startFeatureId;
  
  // Find unvisited land cells
  for (const cell of cells) {
    if (!cell.isLand || visited.has(cell.id) || cell.featureId !== undefined) continue;
    
    // Start flood-fill for new island/continent
    const islandCells: number[] = [];
    const queue = [cell];
    visited.add(cell.id);
    
    while (queue.length > 0) {
      const currentCell = queue.shift()!;
      islandCells.push(currentCell.id);
      currentCell.featureId = nextFeatureId;
      
      // Add unvisited land neighbors
      for (const neighborId of currentCell.neighbors) {
        const neighbor = cells.find(c => c.id === neighborId);
        if (neighbor && neighbor.isLand && !visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          queue.push(neighbor);
        }
      }
    }
    
    // Check if this landmass touches the border
    const touchesBorder = islandCells.some(cellId => {
      const landCell = cells.find(c => c.id === cellId);
      return landCell && (
        landCell.centroid[0] <= 10 || landCell.centroid[0] >= width - 10 ||
        landCell.centroid[1] <= 10 || landCell.centroid[1] >= height - 10
      );
    });
    
    // Create island/continent feature
    islandFeatures.push({
      id: nextFeatureId,
      type: 'island',
      land: true,
      border: touchesBorder,
      name: touchesBorder ? `Continent ${islandFeatures.length + 1}` : `Island ${islandFeatures.length + 1}`,
      size: islandCells.length,
      cells: islandCells
    });
    
    nextFeatureId++;
  }
  
  return islandFeatures;
}

/**
 * Assemble coastline segments into continuous closed loops for each feature
 */
export function buildCoastlinePaths(
  segments: CoastlineSegment[], 
  features: Feature[], 
  cells: Cell[]
): void {
  // Group segments by the land feature they border
  const segmentsByFeature = new Map<number, CoastlineSegment[]>();
  
  for (const segment of segments) {
    const landCell = cells.find(c => c.id === segment.landCellId);
    if (landCell && landCell.featureId !== undefined) {
      if (!segmentsByFeature.has(landCell.featureId)) {
        segmentsByFeature.set(landCell.featureId, []);
      }
      segmentsByFeature.get(landCell.featureId)!.push(segment);
    }
  }

  // Print sample segments for each feature
  console.log("\n--- Coastline Segments by Feature ---");
  for (const [featureId, featureSegments] of segmentsByFeature.entries()) {
    console.log(`Feature ID: ${featureId}`);
    console.table(featureSegments.slice(0, 10)); // Print up to 10 segments
  }
  
  // Build boundary for each feature
  for (const feature of features) {
    if (feature.type === 'ocean') continue; // Ocean doesn't need a coastline boundary
    
    const featureSegments = segmentsByFeature.get(feature.id) || [];
    if (featureSegments.length > 0) {
      feature.boundary = assembleBoundaryLoop(featureSegments);
    }
  }
}

/**
 * Assemble segments into a continuous closed loop using adjacency-map walker
 */
function assembleBoundaryLoop(segments: CoastlineSegment[]): [number, number][] {
  if (segments.length === 0) return [];

  // Dedupe segments by rounded start/end keys
  const seen = new Set<string>();
  const dedupedSegments: CoastlineSegment[] = [];
  for (const seg of segments) {
    const k1 = `${seg.start[0].toFixed(PRECISION)},${seg.start[1].toFixed(PRECISION)}|${seg.end[0].toFixed(PRECISION)},${seg.end[1].toFixed(PRECISION)}`;
    const k2 = `${seg.end[0].toFixed(PRECISION)},${seg.end[1].toFixed(PRECISION)}|${seg.start[0].toFixed(PRECISION)},${seg.start[1].toFixed(PRECISION)}`;
    if (!seen.has(k1) && !seen.has(k2)) {
      seen.add(k1);
      seen.add(k2);
      dedupedSegments.push(seg);
    }
  }
  segments = dedupedSegments;

  // 1) Build adjacency map of vertex→[neighborVertices]
  const adj = new Map<string, [number, number][]>();
  function key(p: [number, number]) { 
    return `${p[0].toFixed(PRECISION)},${p[1].toFixed(PRECISION)}`; 
  }
  for (const {start, end} of segments) {
    const k1 = key(start), k2 = key(end);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1)!.push(end);
    adj.get(k2)!.push(start);
  }

  // Debug: check vertex degrees
  const odd = Array.from(adj.entries())
    .map(([k,neigh]) => ({vertex:k, degree: neigh.length}))
    .filter(d => d.degree !== 2);
  if (odd.length) {
    console.warn("Odd-degree vertices detected:", odd);
    odd.forEach(o => {
      console.groupCollapsed(`Vertex ${o.vertex} has degree ${o.degree}`);
      console.log("Neighbor coords:", adj.get(o.vertex)!.map(pt=>pt.map(n=>n.toFixed(1)).join(',')));
      console.groupEnd();
    });
  }

  // 2) Pick the "lowest" vertex to start (min Y, then X)
  const verts = Array.from(adj.entries()).map(([k, neigh]) => {
    const [x, y] = k.split(',').map(Number);
    return {key: k, x, y, neighbors: neigh};
  });
  
  if (verts.length === 0) {
    return [];
  }
  
  verts.sort((a, b) => a.y - b.y || a.x - b.x);
  const start = verts[0].key;

  // 3) Walk the cycle
  const loop: [number, number][] = [];
  let prevKey: string | null = null;
  let currKey = start;

  do {
    // push current point
    const [cx, cy] = currKey.split(',').map(Number);
    loop.push([cx, cy]);

    const neigh = adj.get(currKey)!;
    // pick the next vertex that isn't the one we just came from
    const nextKey = neigh
      .map(p => key(p))
      .find(k => k !== prevKey);

    // Safety check - if no valid next key, break to avoid infinite loop
    if (!nextKey) {
      break;
    }

    prevKey = currKey;
    currKey = nextKey;

    // Safety to avoid infinite loop
    if (loop.length > segments.length + 2) break;
  } while (currKey !== start);

  return loop;
}

/**
 * Convert boundary coordinates to SVG path string
 */
export function boundaryToSVGPath(boundary: [number, number][]): string {
  if (boundary.length === 0) return '';
  
  // Create a single path with move-to, line-to, and close commands
  const pathParts = boundary.map((point, index) => {
    if (index === 0) {
      return `M ${point[0]} ${point[1]}`;
    } else {
      return `L ${point[0]} ${point[1]}`;
    }
  });
  
  return pathParts.join(' ') + ' Z';
}

// Extend the Cell interface to include coastal properties
declare module './voronoi' {
  interface Cell {
    isCoastal?: boolean;
    coastalNeighborsCount?: number;
  }
} 