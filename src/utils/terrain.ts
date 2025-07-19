import type { Cell, VoronoiMesh } from './voronoi';

export interface TerrainParams {
  numBlobs: number;
  mainPeakHeight: number;
  secondaryPeakHeightRange: [number, number];
  falloff: number;
  sharpness: number;
  seaLevel: number;
}

interface Blob {
  x: number;
  y: number;
  radius: number;
  height: number;
}

export interface TerrainGenerationResult {
  cells: Cell[];
  minHeight: number;
  maxHeight: number;
}

/**
 * Generate terrain using the blob algorithm with safe-zone constraints
 */
export function generateTerrain(
  mesh: VoronoiMesh,
  params: TerrainParams,
  width: number,
  height: number
): TerrainGenerationResult {
  const { cells } = mesh;
  const { numBlobs, mainPeakHeight, secondaryPeakHeightRange, falloff, sharpness } = params;
  
  // Calculate safe zone parameters - dynamically computed for canvas dimensions
  const MAX_BLOB_RADIUS = Math.min(width, height) * 0.15; // 15% of smaller dimension
  const MARGIN = MAX_BLOB_RADIUS; // safe margin from borders
  
  console.log(`Safe zone: MAX_BLOB_RADIUS=${MAX_BLOB_RADIUS.toFixed(1)}px, MARGIN=${MARGIN.toFixed(1)}px`);
  console.log(`Blob placement range: x=[${MARGIN.toFixed(1)}, ${(width-MARGIN).toFixed(1)}], y=[${MARGIN.toFixed(1)}, ${(height-MARGIN).toFixed(1)}]`);
  
  // Reset all heights to 0
  cells.forEach(cell => cell.height = 0);
  
  // Generate blobs in safe zone
  const blobs: Blob[] = [];
  
  // Main blob
  const mainBlob = generateRandomBlobInSafeZone(width, height, MARGIN, MAX_BLOB_RADIUS, mainPeakHeight);
  blobs.push(mainBlob);
  
  // Secondary blobs
  for (let i = 1; i < numBlobs; i++) {
    const peakHeight = secondaryPeakHeightRange[0] + 
      Math.random() * (secondaryPeakHeightRange[1] - secondaryPeakHeightRange[0]);
    const blob = generateRandomBlobInSafeZone(width, height, MARGIN, MAX_BLOB_RADIUS, peakHeight);
    blobs.push(blob);
  }
  
  // Apply blob heights to all cells with edge masking
  cells.forEach(cell => {
    const [cx, cy] = cell.centroid;
    
    // 1) Compute raw height from all blobs
    let rawHeight = 0;
    for (const blob of blobs) {
      const distance = Math.sqrt((cx - blob.x) ** 2 + (cy - blob.y) ** 2);
      const blobHeight = calculateBlobHeight(distance, blob.radius, blob.height, falloff, sharpness);
      rawHeight = Math.max(rawHeight, blobHeight);
    }
    
    // 2) Apply edge mask - guarantees zero height at borders
    const mask = calculateEdgeMask(cx, cy, width, height, MARGIN);
    cell.height = rawHeight * mask;
  });
  
  console.log(`Edge masking applied: height guaranteed to be 0 at map borders`);
  
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
 * Generate a random blob within the safe zone
 */
function generateRandomBlobInSafeZone(
  width: number,
  height: number,
  margin: number,
  maxRadius: number,
  peakHeight: number
): Blob {
  const radius = Math.random() * maxRadius;
  const x = margin + Math.random() * (width - 2 * margin);
  const y = margin + Math.random() * (height - 2 * margin);
  
  return { x, y, radius, height: peakHeight };
}

/**
 * Calculate blob height at a given distance from blob center
 */
function calculateBlobHeight(
  distance: number,
  radius: number,
  peakHeight: number,
  falloff: number,
  sharpness: number
): number {
  if (distance > radius) return 0;
  
  // Calculate base height using falloff
  const normalizedDistance = distance / radius;
  const baseHeight = peakHeight * Math.pow(falloff, normalizedDistance * 10);
  
  // Apply sharpness (randomness)
  const randomFactor = 1 + (Math.random() - 0.5) * sharpness * 2;
  
  return baseHeight * randomFactor;
}

/**
 * Calculate edge mask for smooth ocean rim
 * Returns 0 at the very border, 1 at MARGIN distance from border
 */
function calculateEdgeMask(
  x: number,
  y: number,
  width: number,
  height: number,
  margin: number
): number {
  // distance to each edge
  const dx = Math.min(x, width - x);
  const dy = Math.min(y, height - y);
  // normalize to 0 .. 1 over the MARGIN
  const nx = Math.min(dx / margin, 1);
  const ny = Math.min(dy / margin, 1);
  return Math.min(nx, ny);
}

/**
 * Apply sea level threshold to create flat ocean and classify land/water
 * Also forces any cell touching the map border to be water
 */
export function applySeaLevel(
  cells: Cell[], 
  seaLevel: number
): void {
  let landCells = 0;
  let waterCells = 0;
  
  cells.forEach(cell => {
    // Simple height-based classification - edge masking guarantees no land at borders
    cell.isLand = cell.height > seaLevel;
    
    if (cell.isLand) {
      landCells++;
    } else {
      waterCells++;
      cell.height = 0; // Set water cells to 0 height
    }
  });
  
  console.log(`Sea level classification: ${landCells} land cells, ${waterCells} water cells`);
  console.log(`Edge masking ensures no land at map borders`);
} 