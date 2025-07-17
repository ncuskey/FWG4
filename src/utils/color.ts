import type { Cell } from './voronoi';

/**
 * Color scheme for the heightmap
 */
export const HEIGHT_COLORS = {
  deepWater: '#1e3a8a',    // Dark blue
  shallowWater: '#3b82f6', // Light blue
  lowland: '#22c55e',      // Green
  highland: '#a16207',     // Brown
  peak: '#ffffff'          // White
};

/**
 * Map height to color using a custom gradient
 */
export function heightToColor(height: number, seaLevel: number): string {
  if (height < seaLevel) {
    // Water gradient
    const waterRatio = height / seaLevel;
    return interpolateColor(HEIGHT_COLORS.deepWater, HEIGHT_COLORS.shallowWater, waterRatio);
  } else {
    // Land gradient
    const landRatio = (height - seaLevel) / (1 - seaLevel);
    if (landRatio < 0.3) {
      // Lowland to highland
      const lowlandRatio = landRatio / 0.3;
      return interpolateColor(HEIGHT_COLORS.lowland, HEIGHT_COLORS.highland, lowlandRatio);
    } else {
      // Highland to peak
      const highlandRatio = (landRatio - 0.3) / 0.7;
      return interpolateColor(HEIGHT_COLORS.highland, HEIGHT_COLORS.peak, highlandRatio);
    }
  }
}

/**
 * Interpolate between two hex colors
 */
function interpolateColor(color1: string, color2: string, ratio: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Apply colors to all cells based on their heights
 */
export function applyColorsToCells(cells: Cell[], seaLevel: number): void {
  cells.forEach(cell => {
    cell.color = heightToColor(cell.height, seaLevel);
  });
}

// Extend the Cell interface to include color
declare module './voronoi' {
  interface Cell {
    color?: string;
  }
} 