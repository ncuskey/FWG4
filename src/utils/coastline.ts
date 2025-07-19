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
 * Find coastal edges using unique-edge counting method
 * More robust than shared edge detection
 * Now includes explicit map border edges
 */
export function findCoastalEdges(cells: Cell[], width: number, height: number): CoastlineSegment[] {
  const segments: CoastlineSegment[] = [];
  const edgeMap = new Map<string, number>(); // key = "x1,y1|x2,y2", count occurrences
  
  // Build edge map: count occurrences of each edge across all land-cell polygons
  for (const cell of cells) {
    if (!cell.isLand || !cell.polygon || cell.polygon.length < 3) continue;
    
    const polygon = cell.polygon;
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
      
      // Create normalized edge key (sorted coordinates)
      const [x1, y1] = start;
      const [x2, y2] = end;
      const key = x1 < x2 || (x1 === x2 && y1 < y2) 
        ? `${x1.toFixed(2)},${y1.toFixed(2)}|${x2.toFixed(2)},${y2.toFixed(2)}`
        : `${x2.toFixed(2)},${y2.toFixed(2)}|${x1.toFixed(2)},${y1.toFixed(2)}`;
      
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }
  }
  
  // Find edges that appear only once (unique edges = coastline)
  for (const [edgeKey, count] of edgeMap.entries()) {
    if (count === 1) {
      const [startStr, endStr] = edgeKey.split('|');
      const start = startStr.split(',').map(Number) as [number, number];
      const end = endStr.split(',').map(Number) as [number, number];
      
      // Find the land cell that contains this edge
      const landCell = cells.find(cell => 
        cell.isLand && 
        cell.polygon && 
        cell.polygon.some((point, i) => {
          const nextPoint = cell.polygon![(i + 1) % cell.polygon!.length];
          return (point[0] === start[0] && point[1] === start[1] && 
                  nextPoint[0] === end[0] && nextPoint[1] === end[1]) ||
                 (point[0] === end[0] && point[1] === end[1] && 
                  nextPoint[0] === start[0] && nextPoint[1] === start[1]);
        })
      );
      
      if (landCell) {
        // Find the water cell on the other side of this edge
        const waterCell = findAdjacentWaterCell(landCell, start, end, cells);
        
        if (waterCell) {
          segments.push({
            start,
            end,
            landCellId: landCell.id,
            waterCellId: waterCell.id
          });
        }
      }
    }
  }
  
  // Now add explicit map border edges
  for (const cell of cells) {
    if (!cell.isLand || !cell.polygon || cell.polygon.length < 3) continue;
    
    const polygon = cell.polygon;
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
      
      // Check if either endpoint lies exactly on the map border
      const [x1, y1] = start;
      const [x2, y2] = end;
      
      const isBorderEdge = 
        x1 === 0 || x1 === width || y1 === 0 || y1 === height ||
        x2 === 0 || x2 === width || y2 === 0 || y2 === height;
      
      if (isBorderEdge) {
        // Normalize start/end to exact border coordinates
        const normalizedStart: [number, number] = [
          x1 === 0 ? 0 : x1 === width ? width : x1,
          y1 === 0 ? 0 : y1 === height ? height : y1
        ];
        const normalizedEnd: [number, number] = [
          x2 === 0 ? 0 : x2 === width ? width : x2,
          y2 === 0 ? 0 : y2 === height ? height : y2
        ];
        
        segments.push({
          start: normalizedStart,
          end: normalizedEnd,
          landCellId: cell.id,
          waterCellId: -1, // Special ID for map border
          featureId: cell.featureId
        });
      }
    }
  }
  
  return segments;
}

/**
 * Find a water cell adjacent to the given edge
 */
function findAdjacentWaterCell(
  landCell: Cell, 
  edgeStart: [number, number], 
  edgeEnd: [number, number], 
  cells: Cell[]
): Cell | null {
  // Check neighbors of the land cell
  for (const neighborId of landCell.neighbors) {
    const neighbor = cells.find(c => c.id === neighborId);
    if (neighbor && !neighbor.isLand) {
      // Check if this neighbor shares the edge
      if (neighbor.polygon) {
        for (let i = 0; i < neighbor.polygon.length; i++) {
          const point = neighbor.polygon[i];
          const nextPoint = neighbor.polygon[(i + 1) % neighbor.polygon.length];
          
          if ((point[0] === edgeStart[0] && point[1] === edgeStart[1] && 
               nextPoint[0] === edgeEnd[0] && nextPoint[1] === edgeEnd[1]) ||
              (point[0] === edgeEnd[0] && point[1] === edgeEnd[1] && 
               nextPoint[0] === edgeStart[0] && nextPoint[1] === edgeStart[1])) {
            return neighbor;
          }
        }
      }
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
 * Assemble segments into a continuous path using open-chain walker
 * Handles both closed loops and open chains (continental coasts)
 */
function assembleBoundaryLoop(segments: CoastlineSegment[]): [number, number][] {
  if (segments.length === 0) return [];
  
  const PRECISION = 2;
  
  function norm([x, y]: [number, number]): string {
    return `${x.toFixed(PRECISION)},${y.toFixed(PRECISION)}`;
  }
  
  // 1) Dedupe by normalized keys
  const seen = new Set<string>();
  const dedupedSegments: CoastlineSegment[] = [];
  
  for (const seg of segments) {
    const k1 = `${norm(seg.start)}|${norm(seg.end)}`;
    const k2 = `${norm(seg.end)}|${norm(seg.start)}`;
    if (!seen.has(k1) && !seen.has(k2)) {
      seen.add(k1);
      seen.add(k2);
      dedupedSegments.push(seg);
    }
  }
  
  if (dedupedSegments.length === 0) return [];
  
  // 2) Build Map<vertexKey, neighborPoints>
  const adj = new Map<string, [number, number][]>();
  
  for (const { start, end } of dedupedSegments) {
    const k1 = norm(start), k2 = norm(end);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1)!.push(end);
    adj.get(k2)!.push(start);
  }
  
  // 3) Find endpoints (degree === 1)
  const endpoints: string[] = [];
  for (const [vertex, neighbors] of adj.entries()) {
    if (neighbors.length === 1) {
      endpoints.push(vertex);
    }
  }
  
  // 4) Pick start: first endpoint if two exist, else lowest (minY, minX)
  let startKey: string;
  if (endpoints.length >= 2) {
    // Open chain - start from first endpoint
    startKey = endpoints[0];
  } else {
    // Closed loop - pick lowest vertex
    const verts = Array.from(adj.entries()).map(([k, neigh]) => {
      const [x, y] = k.split(',').map(Number);
      return { key: k, x, y, neighbors: neigh };
    });
    
    if (verts.length === 0) return [];
    
    verts.sort((a, b) => a.y - b.y || a.x - b.x);
    startKey = verts[0].key;
  }
  
  // 5) Walk: at each step pick neighbor ≠ prevKey; stop on no neighbor (open) or back to start (closed)
  const path: [number, number][] = [];
  let prevKey: string | null = null;
  let currKey = startKey;
  const visited = new Set<string>();
  
  do {
    // Add current point to path
    const [cx, cy] = currKey.split(',').map(Number);
    path.push([cx, cy]);
    visited.add(currKey);
    
    const neighbors = adj.get(currKey)!;
    // Pick the next vertex that isn't the one we just came from
    const nextKey = neighbors
      .map(p => norm(p))
      .find(k => k !== prevKey && !visited.has(k));
    
    // Safety check - if no valid next key, break to avoid infinite loop
    if (!nextKey) {
      break;
    }
    
    prevKey = currKey;
    currKey = nextKey;
    
    // Safety to avoid infinite loop
    if (path.length > dedupedSegments.length + 2) break;
  } while (currKey !== startKey && !visited.has(currKey));
  
  return path;
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