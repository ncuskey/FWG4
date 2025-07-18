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
 */
export function applySeaLevel(cells: Cell[], seaLevel: number): void {
  cells.forEach(cell => {
    if (cell.height < seaLevel) {
      cell.height = 0;
      cell.isLand = false;
    } else {
      cell.isLand = true;
    }
  });
} 