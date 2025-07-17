import * as d3 from 'd3';

export interface Cell {
  id: number;
  centroid: [number, number];
  polygon: [number, number][];
  neighbors: number[];
  height: number;
}

export interface VoronoiMesh {
  cells: Cell[];
  width: number;
  height: number;
}

/**
 * Generate evenly distributed points using jittered grid sampling
 */
export function generatePoints(
  width: number,
  height: number,
  numPoints: number
): [number, number][] {
  const points: [number, number][] = [];
  const cols = Math.ceil(Math.sqrt(numPoints * (width / height)));
  const rows = Math.ceil(numPoints / cols);
  
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      // Add jitter to avoid perfect grid
      const x = j * cellWidth + (Math.random() - 0.5) * cellWidth * 0.8;
      const y = i * cellHeight + (Math.random() - 0.5) * cellHeight * 0.8;
      
      // Ensure points stay within bounds
      if (x >= 0 && x < width && y >= 0 && y < height) {
        points.push([x, y]);
      }
    }
  }
  
  return points;
}

/**
 * Generate Voronoi diagram from points and convert to our cell format
 */
export function generateVoronoiMesh(
  width: number,
  height: number,
  numPoints: number
): VoronoiMesh {
  const points = generatePoints(width, height, numPoints);
  
  // Create Delaunay triangulation
  const delaunay = d3.Delaunay.from(points);
  
  // Get Voronoi diagram
  const voronoi = delaunay.voronoi([0, 0, width, height]);
  
  // Convert to our cell format
  const cells: Cell[] = [];
  
  for (let i = 0; i < points.length; i++) {
    const polygon = voronoi.cellPolygon(i);
    if (polygon) {
      // Get neighbors from Delaunay triangulation
      const neighbors: number[] = [];
      const triangles = delaunay.triangles;
      
      // Find all triangles that contain this point
      for (let j = 0; j < triangles.length; j += 3) {
        if (triangles[j] === i || triangles[j + 1] === i || triangles[j + 2] === i) {
          // Add the other two points in this triangle as neighbors
          for (let k = 0; k < 3; k++) {
            const pointIndex = triangles[j + k];
            if (pointIndex !== i && !neighbors.includes(pointIndex)) {
              neighbors.push(pointIndex);
            }
          }
        }
      }
      
      cells.push({
        id: i,
        centroid: points[i],
        polygon: polygon as [number, number][],
        neighbors,
        height: 0
      });
    }
  }
  
  return {
    cells,
    width,
    height
  };
} 