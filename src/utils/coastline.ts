import type { Cell } from './voronoi';

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
 * Find the shared edge between two adjacent cells
 */
function findSharedEdge(cell1: Cell, cell2: Cell): { start: [number, number], end: [number, number] } | null {
  const polygon1 = cell1.polygon;
  const polygon2 = cell2.polygon;
  
  // Find common vertices between the two polygons
  const commonVertices: [number, number][] = [];
  
  for (const vertex1 of polygon1) {
    for (const vertex2 of polygon2) {
      // Check if vertices are the same (with some tolerance for floating point)
      if (Math.abs(vertex1[0] - vertex2[0]) < 0.001 && Math.abs(vertex1[1] - vertex2[1]) < 0.001) {
        commonVertices.push(vertex1);
      }
    }
  }
  
  // If we have exactly 2 common vertices, they form the shared edge
  if (commonVertices.length === 2) {
    return {
      start: commonVertices[0],
      end: commonVertices[1]
    };
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
 * Assemble segments into a continuous closed loop using adjacency graph
 */
function assembleBoundaryLoop(segments: CoastlineSegment[]): [number, number][] {
  if (segments.length === 0) return [];
  
  // 1) Build adjacency map of vertex→[neighborVertices]
  const adj = new Map<string, [number, number][]>();
  function key(p: [number, number]) { 
    // round to avoid float-mismatch
    return `${p[0].toFixed(3)},${p[1].toFixed(3)}`; 
  }
  
  for (const {start, end} of segments) {
    const k1 = key(start), k2 = key(end);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1)!.push(end);
    adj.get(k2)!.push(start);
  }

  // 2) Pick the "lowest" vertex to start (min Y, then X)
  const verts = Array.from(adj.entries()).map(([k, neigh]) => {
    const [x, y] = k.split(',').map(Number);
    return {key: k, x, y, neighbors: neigh};
  });
  
  if (verts.length === 0) {
    console.warn('No vertices found for coastline loop assembly');
    return [];
  }
  
  verts.sort((a, b) => a.y - b.y || a.x - b.x);
  const start = verts[0].key;

  // 3) Walk the cycle
  const loop: [number, number][] = [];
  let prevKey: string | null = null;
  let currKey = start;
  
  // Safety check - ensure starting vertex exists in adjacency map
  if (!adj.has(start)) {
    console.warn('Starting vertex not found in adjacency map');
    return [];
  }

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
      console.warn('No valid next vertex found in coastline loop assembly');
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