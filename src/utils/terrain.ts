import type { Cell, VoronoiMesh } from './voronoi';

export interface TerrainParams {
  numBlobs: number;
  mainPeakHeight: number;
  secondaryPeakHeightRange: [number, number];
  falloff: number;
  sharpness: number;
  seaLevel: number;
  continentMode: boolean; // New parameter for continental generation
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
 * Now supports continental mode for large landmasses
 */
export function generateTerrain(
  mesh: VoronoiMesh,
  params: TerrainParams,
  width: number,
  height: number
): TerrainGenerationResult {
  const { cells } = mesh;
  const { numBlobs, mainPeakHeight, secondaryPeakHeightRange, falloff, sharpness, continentMode } = params;
  
  // Calculate safe zone parameters - dynamically computed for canvas dimensions
  const MAX_BLOB_RADIUS = Math.min(width, height) * 0.15; // 15% of smaller dimension
  const MARGIN = MAX_BLOB_RADIUS; // safe margin from borders
  
  console.log(`Canvas dimensions: ${width}x${height}`);
  console.log(`Safe zone: MAX_BLOB_RADIUS=${MAX_BLOB_RADIUS.toFixed(1)}px, MARGIN=${MARGIN.toFixed(1)}px`);
  console.log(`Continent mode: ${continentMode ? 'enabled' : 'disabled'}`);
  
  // Reset all heights to 0
  cells.forEach(cell => cell.height = 0);
  
  // Adjust parameters for continental mode
  const effectiveNumBlobs = continentMode ? Math.max(1, Math.min(3, numBlobs)) : numBlobs;
  const effectiveFalloff = continentMode ? Math.max(1.5, Math.min(3.0, falloff)) : falloff; // Reduced max falloff
  const effectiveRadius = continentMode ? MAX_BLOB_RADIUS * 2.0 : MAX_BLOB_RADIUS; // Reduced from 2.5x to 2.0x
  
  // Generate blobs in safe zone
  const blobs: Blob[] = [];
  
  // Main blob
  const mainBlob = generateRandomBlobInSafeZone(width, height, MARGIN, effectiveRadius, mainPeakHeight);
  blobs.push(mainBlob);
  
  // Secondary blobs (fewer in continental mode)
  for (let i = 1; i < effectiveNumBlobs; i++) {
    const peakHeight = secondaryPeakHeightRange[0] + 
      Math.random() * (secondaryPeakHeightRange[1] - secondaryPeakHeightRange[0]);
    const blob = generateRandomBlobInSafeZone(width, height, MARGIN, effectiveRadius, peakHeight);
    blobs.push(blob);
  }
  
  // Calculate map center for radial mask
  const mapCenterX = width / 2;
  const mapCenterY = height / 2;
  const mapDiagonal = Math.sqrt(width * width + height * height);
  
  // Apply blob heights to all cells with edge masking and radial mask
  cells.forEach(cell => {
    const [cx, cy] = cell.centroid;
    
    // 1) Compute raw height from all blobs
    let rawHeight = 0;
    for (const blob of blobs) {
      const distance = Math.sqrt((cx - blob.x) ** 2 + (cy - blob.y) ** 2);
      const blobHeight = calculateBlobHeight(distance, blob.radius, blob.height, effectiveFalloff, sharpness);
      rawHeight = Math.max(rawHeight, blobHeight);
    }
    
    // 2) Apply radial mask for continental mode (optional island mask)
    if (continentMode) {
      const distanceFromCenter = Math.sqrt((cx - mapCenterX) ** 2 + (cy - mapCenterY) ** 2);
      const normalizedDistance = distanceFromCenter / (mapDiagonal / 2);
      const radialMask = Math.max(0, 1 - normalizedDistance * normalizedDistance);
      rawHeight *= radialMask;
    }
    
    // 3) Apply edge mask - guarantees zero height at borders
    const mask = calculateEdgeMask(cx, cy, width, height, MARGIN);
    cell.height = rawHeight * mask;
  });
  
  // Find min/max heights
  const heights = cells.map(cell => cell.height);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  
  // Debug height distribution
  const nonZeroHeights = heights.filter(h => h > 0);
  if (nonZeroHeights.length > 0) {
    const sortedHeights = nonZeroHeights.sort((a, b) => a - b);
    const percentile10 = sortedHeights[Math.floor(sortedHeights.length * 0.1)];
    const percentile25 = sortedHeights[Math.floor(sortedHeights.length * 0.25)];
    const percentile50 = sortedHeights[Math.floor(sortedHeights.length * 0.5)];
    const percentile75 = sortedHeights[Math.floor(sortedHeights.length * 0.75)];
    const percentile90 = sortedHeights[Math.floor(sortedHeights.length * 0.9)];
    
    console.log(`Height distribution: min=${minHeight.toFixed(3)}, max=${maxHeight.toFixed(3)}`);
    console.log(`Non-zero heights: ${nonZeroHeights.length}/${heights.length} cells`);
    console.log(`Percentiles: 10%=${percentile10.toFixed(3)}, 25%=${percentile25.toFixed(3)}, 50%=${percentile50.toFixed(3)}, 75%=${percentile75.toFixed(3)}, 90%=${percentile90.toFixed(3)}`);
  } else {
    console.warn(`⚠️ No non-zero heights found! All cells have height 0.`);
  }
  
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
 * Updated to work with higher falloff values for continental generation
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
  
  // Use different falloff calculation for continental vs island mode
  let baseHeight: number;
  if (falloff >= 2.0) {
    // Continental mode: use exponential falloff for gentle, wide plateaus
    baseHeight = peakHeight * Math.exp(-normalizedDistance * (falloff * 0.5)); // Reduced falloff multiplier
  } else {
    // Island mode: use power falloff for sharp peaks
    baseHeight = peakHeight * Math.pow(falloff, normalizedDistance * 10);
  }
  
  // Apply sharpness (randomness) - reduced for continental mode
  const effectiveSharpness = falloff >= 2.0 ? sharpness * 0.5 : sharpness;
  const randomFactor = 1 + (Math.random() - 0.5) * effectiveSharpness * 2;
  
  return baseHeight * randomFactor;
}

/**
 * Calculate edge mask for smooth ocean rim
 * Returns 0 at the very border, 1 at MARGIN distance from border
 * Uses a more gradual falloff to prevent hard cutoffs
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
  
  // Use a smaller inner margin for hard cutoff, but gradual falloff beyond that
  const innerMargin = margin * 0.3; // 30% of the safe zone for hard cutoff
  const outerMargin = margin; // Full safe zone for gradual falloff
  
  // If within inner margin, apply hard cutoff
  if (dx <= innerMargin || dy <= innerMargin) {
    const nx = Math.min(dx / innerMargin, 1);
    const ny = Math.min(dy / innerMargin, 1);
    return Math.min(nx, ny);
  }
  
  // Beyond inner margin, use gradual falloff to outer margin
  const nx = Math.min((dx - innerMargin) / (outerMargin - innerMargin), 1);
  const ny = Math.min((dy - innerMargin) / (outerMargin - innerMargin), 1);
  
  // Use smooth interpolation (smoothstep-like)
  const smoothX = nx * nx * (3 - 2 * nx);
  const smoothY = ny * ny * (3 - 2 * ny);
  
  return Math.min(smoothX, smoothY);
}

/**
 * Apply sea level threshold to create flat ocean and classify land/water
 * Also forces any cell touching the map border to be water
 * Now uses adaptive sea level for better land/water ratios
 */
export function applySeaLevel(
  cells: Cell[], 
  seaLevel: number,
  continentMode: boolean = false
): void {
  // Calculate adaptive sea level based on actual height distribution
  const adaptiveSeaLevel = calculateAdaptiveSeaLevel(cells, seaLevel, continentMode);
  
  let landCells = 0;
  let waterCells = 0;
  
  cells.forEach(cell => {
    // Use adaptive sea level for classification
    cell.isLand = cell.height > adaptiveSeaLevel;
    
    if (cell.isLand) {
      landCells++;
    } else {
      waterCells++;
      cell.height = 0; // Set water cells to 0 height
    }
  });
  
  console.log(`Sea level classification: ${landCells} land cells, ${waterCells} water cells`);
  console.log(`Adaptive sea level: ${adaptiveSeaLevel.toFixed(3)} (target: ${seaLevel.toFixed(3)})`);
  console.log(`Land coverage: ${((landCells / cells.length) * 100).toFixed(1)}%`);
  console.log(`Edge masking ensures no land at map borders`);
} 

/**
 * Calculate adaptive sea level based on height distribution
 * Ensures reasonable land/water ratios regardless of terrain parameters
 */
function calculateAdaptiveSeaLevel(
  cells: Cell[], 
  targetSeaLevel: number,
  continentMode: boolean
): number {
  const heights = cells.map(cell => cell.height).filter(h => h > 0);
  if (heights.length === 0) return targetSeaLevel;
  
  const maxHeight = Math.max(...heights);
  const meanHeight = heights.reduce((sum, h) => sum + h, 0) / heights.length;
  
  // For continental mode, use a lower sea level to ensure more land
  if (continentMode) {
    // Use 25th percentile of heights to ensure ~25% land coverage
    const sortedHeights = heights.sort((a, b) => a - b);
    const percentile25 = sortedHeights[Math.floor(sortedHeights.length * 0.25)];
    return Math.min(targetSeaLevel, percentile25 * 0.8); // 80% of 25th percentile
  }
  
  return targetSeaLevel;
} 