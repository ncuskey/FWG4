import type { Cell, VoronoiMesh } from './voronoi';

export interface TerrainParams {
  numBlobs: number;
  mainPeakHeight: number;
  secondaryPeakHeightRange: [number, number];
  falloff: number;
  sharpness: number;
  seaLevel: number;
}

export interface TerrainGenerationResult {
  cells: Cell[];
  minHeight: number;
  maxHeight: number;
}

/**
 * Generate terrain using the blob algorithm
 */
export function generateTerrain(
  mesh: VoronoiMesh,
  params: TerrainParams
): TerrainGenerationResult {
  const { cells } = mesh;
  const { numBlobs, mainPeakHeight, secondaryPeakHeightRange, falloff, sharpness, seaLevel } = params;
  
  // Reset all heights to 0
  cells.forEach(cell => cell.height = 0);
  
  // Generate main blob
  const mainPeakIndex = Math.floor(Math.random() * cells.length);
  generateBlob(cells, mainPeakIndex, mainPeakHeight, falloff, sharpness);
  
  // Generate additional blobs
  for (let i = 1; i < numBlobs; i++) {
    const peakHeight = secondaryPeakHeightRange[0] + 
      Math.random() * (secondaryPeakHeightRange[1] - secondaryPeakHeightRange[0]);
    
    // Pick a random cell that's mostly water (low height)
    const waterCells = cells.filter(cell => cell.height < seaLevel * 0.5);
    if (waterCells.length > 0) {
      const randomWaterCell = waterCells[Math.floor(Math.random() * waterCells.length)];
      const peakIndex = cells.findIndex(cell => cell.id === randomWaterCell.id);
      generateBlob(cells, peakIndex, peakHeight, falloff, sharpness);
    }
  }
  
  // Find min/max heights
  const heights = cells.map(cell => cell.height);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  
  return {
    cells,
    minHeight,
    maxHeight
  };
}

/**
 * Generate a single blob of terrain starting from a peak
 */
function generateBlob(
  cells: Cell[],
  peakIndex: number,
  peakHeight: number,
  falloff: number,
  sharpness: number
): void {
  const queue: { cellIndex: number; height: number }[] = [
    { cellIndex: peakIndex, height: peakHeight }
  ];
  
  const visited = new Set<number>();
  
  while (queue.length > 0) {
    const { cellIndex, height } = queue.shift()!;
    
    if (visited.has(cellIndex) || height < 0.01) {
      continue;
    }
    
    visited.add(cellIndex);
    
    // Only update if new height is greater than current height
    if (height > cells[cellIndex].height) {
      cells[cellIndex].height = height;
    }
    
    // Propagate to neighbors
    const cell = cells[cellIndex];
    for (const neighborId of cell.neighbors) {
      const neighborIndex = cells.findIndex(c => c.id === neighborId);
      if (neighborIndex !== -1 && !visited.has(neighborIndex)) {
        // Apply falloff with randomness
        const randomFactor = 1 + (Math.random() - 0.5) * sharpness * 2;
        const newHeight = height * falloff * randomFactor;
        
        queue.push({
          cellIndex: neighborIndex,
          height: newHeight
        });
      }
    }
  }
}

/**
 * Apply sea level threshold to create flat ocean and classify land/water
 * Also forces any cell touching the map border to be water
 */
export function applySeaLevel(
  cells: Cell[], 
  seaLevel: number, 
  width: number, 
  height: number
): void {
  const BORDER_EPSILON = 1; // small epsilon for border detection
  
  cells.forEach(cell => {
    // 1) first classify by height
    const aboveSea = cell.height > seaLevel;

    // 2) then check: does this cell *touch* the map border?
    const poly = cell.polygon;
    const touchesBorder = poly.some(([x, y]) =>
      x <= BORDER_EPSILON || x >= width - BORDER_EPSILON ||
      y <= BORDER_EPSILON || y >= height - BORDER_EPSILON
    );

    // 3) final land flag: must be above sea *and* not touch the edge
    cell.isLand = aboveSea && !touchesBorder;
    
    // Set height to 0 for water cells
    if (!cell.isLand) {
      cell.height = 0;
    }
  });
} 