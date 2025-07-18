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
 * Assemble segments into a continuous closed loop
 */
function assembleBoundaryLoop(segments: CoastlineSegment[]): [number, number][] {
  if (segments.length === 0) return [];
  
  const loop: [number, number][] = [];
  const remaining = [...segments];
  
  // Start with the first segment
  const firstSegment = remaining.shift()!;
  loop.push(firstSegment.start, firstSegment.end);
  
  // Walk through segments end-to-start to build the loop
  while (remaining.length > 0) {
    const tail = loop[loop.length - 1];
    
    // Find the next segment that connects to the current end
    const nextIndex = remaining.findIndex(segment => 
      pointsEqual(segment.start, tail) || pointsEqual(segment.end, tail)
    );
    
    if (nextIndex === -1) {
      // If we can't find a connecting segment, try to close the loop
      if (pointsEqual(tail, loop[0])) {
        break; // Loop is closed
      }
      
      // If we can't close the loop, just add remaining segments
      for (const segment of remaining) {
        loop.push(segment.start, segment.end);
      }
      break;
    }
    
    // Get the connecting segment
    const [nextSegment] = remaining.splice(nextIndex, 1);
    
    // Add the other endpoint (not the one we're already at)
    const nextPoint = pointsEqual(nextSegment.start, tail) 
      ? nextSegment.end 
      : nextSegment.start;
    
    loop.push(nextPoint);
  }
  
  return loop;
}

/**
 * Check if two points are equal (with tolerance for floating point)
 */
function pointsEqual(p1: [number, number], p2: [number, number]): boolean {
  return Math.abs(p1[0] - p2[0]) < 0.001 && Math.abs(p1[1] - p2[1]) < 0.001;
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