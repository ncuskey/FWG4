import React, { useState, useCallback, useMemo } from 'react';
import { generateVoronoiMesh } from '../utils/voronoi';
import { generateTerrain, applySeaLevel, type TerrainParams } from '../utils/terrain';
import { applyColorsToCells } from '../utils/color';
import { 
  findCoastalEdges, 
  markCoastalCells, 
  labelFeatures, 
  buildCoastlinePaths, 
  boundaryToSVGPath,
  type Feature 
} from '../utils/coastline';
import type { Cell } from '../utils/voronoi';

interface MapGeneratorProps {
  width: number;
  height: number;
}

const DEFAULT_PARAMS: TerrainParams = {
  numBlobs: 8,
  mainPeakHeight: 1.0,
  secondaryPeakHeightRange: [0.3, 0.7],
  falloff: 0.85,
  sharpness: 0.1,
  seaLevel: 0.2
};

export const MapGenerator: React.FC<MapGeneratorProps> = ({ width, height }) => {
  const [params, setParams] = useState<TerrainParams>(DEFAULT_PARAMS);
  const [numPoints, setNumPoints] = useState(8000);
  const [cells, setCells] = useState<Cell[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateMap = useCallback(() => {
    setIsGenerating(true);
    
    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      try {
        console.log('Starting map generation...');
        
        // Generate Voronoi mesh
        console.log('Generating Voronoi mesh...');
        const mesh = generateVoronoiMesh(width, height, numPoints);
        console.log('Voronoi mesh generated:', mesh.cells.length, 'cells');
        
        // Generate terrain
        console.log('Generating terrain...');
        const terrainResult = generateTerrain(mesh, params, width, height);
        console.log('Terrain generated');
        
        // Apply sea level and classify land/water
        console.log('Applying sea level...');
        applySeaLevel(terrainResult.cells, params.seaLevel);
        console.log('Sea level applied');
        
        // Debug: Check for any land cells touching the border
        const EDGE_EPS = 20; // Much larger epsilon to catch edge cells
        const bad = terrainResult.cells.filter(cell =>
          cell.isLand &&
          cell.polygon.some(([x, y]) =>
            x <= EDGE_EPS || x >= width - EDGE_EPS ||
            y <= EDGE_EPS || y >= height - EDGE_EPS
          )
        );

        if (bad.length) {
          console.warn(`🔥 ${bad.length} land cells touching the border!`, bad.map(c => c.id));
          // Log details of first few bad cells
          bad.slice(0, 3).forEach(cell => {
            const [cx, cy] = cell.centroid;
            console.warn(`Bad cell ${cell.id}: centroid(${cx.toFixed(1)}, ${cy.toFixed(1)}), height=${cell.height.toFixed(3)}`);
          });
        } else {
          console.log(`✅ No land cells touching the border - edge masking working correctly`);
        }
        
        // Final safety clamp: Force any border-touching cell to water
        let clampedCount = 0;
        terrainResult.cells.forEach(cell => {
          if (
            cell.polygon.some(([x, y]) =>
              x <= EDGE_EPS || x >= width - EDGE_EPS ||
              y <= EDGE_EPS || y >= height - EDGE_EPS
            )
          ) {
            if (cell.isLand) {
              cell.isLand = false;
              cell.height = 0; // Also force height to 0
              clampedCount++;
            }
          }
        });
        
        if (clampedCount > 0) {
          console.log(`🔧 Safety clamp: ${clampedCount} border cells forced to water`);
        }
        
        // Additional verification: Check ALL cells near borders
        const nearBorderCells = terrainResult.cells.filter(cell => {
          const [cx, cy] = cell.centroid;
          return cx <= 50 || cx >= width - 50 || cy <= 50 || cy >= height - 50;
        });
        
        const landNearBorder = nearBorderCells.filter(cell => cell.isLand);
        console.log(`🔍 Verification: ${nearBorderCells.length} cells within 50px of border`);
        console.log(`🔍 Verification: ${landNearBorder.length} of those are land cells`);
        
        // Check polygon vertices that extend beyond borders
        const cellsWithBorderVertices = terrainResult.cells.filter(cell => {
          if (!cell.polygon || cell.polygon.length < 3) return false;
          return cell.polygon.some(([x, y]) => 
            x <= 10 || x >= width - 10 || y <= 10 || y >= height - 10
          );
        });
        
        const landWithBorderVertices = cellsWithBorderVertices.filter(cell => cell.isLand);
        console.log(`🔍 Polygon check: ${cellsWithBorderVertices.length} cells have vertices within 10px of border`);
        console.log(`🔍 Polygon check: ${landWithBorderVertices.length} of those are land cells`);
        
        if (landWithBorderVertices.length > 0) {
          console.warn(`🚨 LAND CELLS WITH BORDER VERTICES:`, landWithBorderVertices.map(c => ({
            id: c.id,
            centroid: [c.centroid[0].toFixed(1), c.centroid[1].toFixed(1)],
            vertices: c.polygon?.map(([x, y]) => [x.toFixed(1), y.toFixed(1)]),
            height: c.height.toFixed(3),
            isLand: c.isLand
          })));
          
          // Force these cells to water
          landWithBorderVertices.forEach(cell => {
            cell.isLand = false;
            cell.height = 0;
          });
          console.log(`🔧 Forced ${landWithBorderVertices.length} cells with border vertices to water`);
        }
        
        // Final safety: Force ALL cells within 100px of borders to be water
        const finalBorderCheck = terrainResult.cells.filter(cell => {
          const [cx, cy] = cell.centroid;
          return cx <= 100 || cx >= width - 100 || cy <= 100 || cy >= height - 100;
        });
        
        const finalLandNearBorder = finalBorderCheck.filter(cell => cell.isLand);
        if (finalLandNearBorder.length > 0) {
          console.warn(`🚨 FINAL CHECK: ${finalLandNearBorder.length} land cells within 100px of border - forcing to water`);
          finalLandNearBorder.forEach(cell => {
            cell.isLand = false;
            cell.height = 0;
          });
        }
        
        if (landNearBorder.length > 0) {
          console.warn(`🚨 LAND CELLS NEAR BORDER:`, landNearBorder.map(c => ({
            id: c.id,
            centroid: [c.centroid[0].toFixed(1), c.centroid[1].toFixed(1)],
            height: c.height.toFixed(3),
            isLand: c.isLand,
            distanceFromBorder: Math.min(
              c.centroid[0], 
              c.centroid[1], 
              width - c.centroid[0], 
              height - c.centroid[1]
            ).toFixed(1)
          })));
          
          // Force these cells to water
          landNearBorder.forEach(cell => {
            cell.isLand = false;
            cell.height = 0;
          });
          console.log(`🔧 Forced ${landNearBorder.length} near-border land cells to water`);
        }
        
        // Generate coastlines
        console.log('Generating coastlines...');
        markCoastalCells(terrainResult.cells);
        const coastalSegments = findCoastalEdges(terrainResult.cells);
        console.log('Found', coastalSegments.length, 'coastal segments');
        
        const generatedFeatures = labelFeatures(terrainResult.cells, width, height);
        console.log('Labeled features:', generatedFeatures.length);
        
        buildCoastlinePaths(coastalSegments, generatedFeatures, terrainResult.cells);
        console.log('Coastline paths built');
        
        // Apply colors
        console.log('Applying colors...');
        applyColorsToCells(terrainResult.cells, params.seaLevel);
        console.log('Colors applied');
        
        setCells(terrainResult.cells);
        setFeatures(generatedFeatures);
        console.log('Map generation complete!');
      } catch (error) {
        console.error('Error generating map:', error);
      } finally {
        setIsGenerating(false);
      }
    }, 0);
  }, [width, height, numPoints, params]);

  // Generate initial map on mount
  React.useEffect(() => {
    generateMap();
  }, []);

  const svgPaths = useMemo(() => {
    return cells.map(cell => {
      if (!cell.polygon || cell.polygon.length < 3) return null;
      
      const pathData = cell.polygon
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`)
        .join(' ') + ' Z';
      
      // Debug: Check if this cell is being rendered near borders
      const hasBorderVertices = cell.polygon.some(([x, y]) => 
        x <= 10 || x >= width - 10 || y <= 10 || y >= height - 10
      );
      
      if (hasBorderVertices && cell.isLand) {
        console.warn(`🎨 RENDERING LAND CELL WITH BORDER VERTICES:`, {
          id: cell.id,
          centroid: [cell.centroid[0].toFixed(1), cell.centroid[1].toFixed(1)],
          vertices: cell.polygon.map(([x, y]) => [x.toFixed(1), y.toFixed(1)]),
          color: cell.color,
          isLand: cell.isLand
        });
      }
      
      return (
        <path
          key={cell.id}
          d={pathData}
          fill={cell.color || '#000'}
          stroke="none"
        />
      );
    }).filter(Boolean);
  }, [cells, width, height]);

  const coastlinePaths = useMemo(() => {
    return features
      .filter(feature => feature.boundary && feature.boundary.length > 0)
      .map(feature => {
        const pathData = boundaryToSVGPath(feature.boundary!);
        const strokeColor = feature.type === 'lake' ? '#666' : '#222';
        const strokeWidth = feature.type === 'lake' ? 1 : 2;
        
        return (
          <path
            key={`coastline-${feature.id}`}
            d={pathData}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      });
  }, [features]);

  return (
    <div className="map-generator">
      <div className="controls">
        <button 
          onClick={generateMap} 
          disabled={isGenerating}
          className="generate-btn"
        >
          {isGenerating ? 'Generating...' : 'Generate New Map'}
        </button>
        
        <div className="param-controls">
          <div className="param-group">
            <label>Points: {numPoints}</label>
            <input
              type="range"
              min="1000"
              max="8000"
              step="500"
              value={numPoints}
              onChange={(e) => setNumPoints(Number(e.target.value))}
            />
          </div>
          
          <div className="param-group">
            <label>Blobs: {params.numBlobs}</label>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={params.numBlobs}
              onChange={(e) => setParams(prev => ({ ...prev, numBlobs: Number(e.target.value) }))}
            />
          </div>
          
          <div className="param-group">
            <label>Falloff: {params.falloff.toFixed(2)}</label>
            <input
              type="range"
              min="0.7"
              max="0.95"
              step="0.01"
              value={params.falloff}
              onChange={(e) => setParams(prev => ({ ...prev, falloff: Number(e.target.value) }))}
            />
          </div>
          
          <div className="param-group">
            <label>Sharpness: {params.sharpness.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="0.3"
              step="0.01"
              value={params.sharpness}
              onChange={(e) => setParams(prev => ({ ...prev, sharpness: Number(e.target.value) }))}
            />
          </div>
          
          <div className="param-group">
            <label>Sea Level: {params.seaLevel.toFixed(2)}</label>
            <input
              type="range"
              min="0.1"
              max="0.4"
              step="0.01"
              value={params.seaLevel}
              onChange={(e) => setParams(prev => ({ ...prev, seaLevel: Number(e.target.value) }))}
            />
          </div>
        </div>
        
        <div className="map-info">
          <p>Features: {features.length} (Ocean: 1, Lakes: {features.filter(f => f.type === 'lake').length}, Islands: {features.filter(f => f.type === 'island').length})</p>
          <p>Coastal Cells: {cells.filter(c => c.isCoastal).length}</p>
        </div>
      </div>
      
      <div className="map-container">
        <svg width={width} height={height} className="heightmap">
          <defs>
            <clipPath id="mapClip">
              <rect width={width} height={height} />
            </clipPath>
          </defs>
          
          {/* Water background */}
          <rect width={width} height={height} fill="#1e3a8a" />
          
          {/* Land polygons - clipped to canvas */}
          <g clipPath="url(#mapClip)">
            {svgPaths}
          </g>
          
          {/* Coastline paths - clipped to canvas */}
          <g clipPath="url(#mapClip)">
            {coastlinePaths}
          </g>
        </svg>
      </div>
    </div>
  );
}; 