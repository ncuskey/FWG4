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
  
  // Calculate safe zone parameters - adjusted for 2:1 aspect ratio
  const MAX_BLOB_RADIUS = 120; // maximum falloff radius of any blob
  const MARGIN = MAX_BLOB_RADIUS; // safe margin from borders
  
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
  
  // Apply blob heights to all cells
  cells.forEach(cell => {
    const [cx, cy] = cell.centroid;
    
    // Calculate height from all blobs
    let maxHeight = 0;
    for (const blob of blobs) {
      const distance = Math.sqrt((cx - blob.x) ** 2 + (cy - blob.y) ** 2);
      const blobHeight = calculateBlobHeight(distance, blob.radius, blob.height, falloff, sharpness);
      maxHeight = Math.max(maxHeight, blobHeight);
    }
    
    // Apply edge mask for smooth ocean rim
    const edgeMask = calculateEdgeMask(cx, cy, width, height, MARGIN);
    cell.height = maxHeight * edgeMask;
  });
  
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
 */
function calculateEdgeMask(
  x: number,
  y: number,
  width: number,
  height: number,
  margin: number
): number {
  const dx = Math.min(x, width - x) / margin;
  const dy = Math.min(y, height - y) / margin;
  // dx, dy go 0→1 as you move from border to margin inside
  return Math.min(dx, dy, 1);
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
  const BORDER_EPSILON = 20; // increased epsilon for larger canvas
  
  let borderCellsForced = 0;
  let totalCells = 0;
  
  cells.forEach(cell => {
    totalCells++;
    
    // 1) first classify by height
    const aboveSea = cell.height > seaLevel;

    // 2) then check: does this cell *touch* the map border?
    const poly = cell.polygon;
    const touchesBorder = poly.some(([x, y]) =>
      x <= BORDER_EPSILON || x >= width - BORDER_EPSILON ||
      y <= BORDER_EPSILON || y >= height - BORDER_EPSILON
    );

    // 3) final land flag: must be above sea *and* not touch the edge
    const wasLand = aboveSea;
    cell.isLand = aboveSea && !touchesBorder;
    
    if (wasLand && !cell.isLand) {
      borderCellsForced++;
    }
    
    // Set height to 0 for water cells
    if (!cell.isLand) {
      cell.height = 0;
    }
  });
  
  console.log(`Border forcing: ${borderCellsForced} cells forced to water out of ${totalCells} total cells`);
} 