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
  numBlobs: 2, // Reduced from 8 for continental generation
  mainPeakHeight: 1.0,
  secondaryPeakHeightRange: [0.3, 0.7],
  falloff: 2.0, // Reduced from 2.8 for more moderate continental generation
  sharpness: 0.1,
  seaLevel: 0.15, // Reduced from 0.2 to ensure more land appears
  continentMode: true, // Enable continental generation by default
  waterMargin: 50 // New parameter for edge buffer
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
        applySeaLevel(terrainResult.cells, params.seaLevel, params.continentMode);
        console.log('Sea level applied');
        
        // Generate coastlines
        console.log('Generating coastlines...');
        markCoastalCells(terrainResult.cells);
        const coastalSegments = findCoastalEdges(terrainResult.cells);
        console.log('Found', coastalSegments.length, 'coastal segments');
        
        const generatedFeatures = labelFeatures(terrainResult.cells, width, height);
        console.log('Labeled features:', generatedFeatures.length);
        
        // Post-process: Remove tiny islands (less than 1% of total cells)
        const totalCells = terrainResult.cells.length;
        const MIN_ISLAND_CELLS = Math.floor(totalCells * 0.01); // 1% of map
        let removedIslands = 0;
        
        for (const feature of generatedFeatures) {
          if (feature.type === 'island' && !feature.border && feature.cells.length < MIN_ISLAND_CELLS) {
            // Too small to count as island → flood-fill those cells as water
            for (const cellId of feature.cells) {
              const cell = terrainResult.cells.find(c => c.id === cellId);
              if (cell) {
                cell.isLand = false;
                cell.height = 0;
              }
            }
            removedIslands++;
          }
        }
        
        if (removedIslands > 0) {
          console.log(`🧹 Removed ${removedIslands} tiny islands (less than ${MIN_ISLAND_CELLS} cells each)`);
          
          // Re-run feature labeling after removing tiny islands
          const cleanedFeatures = labelFeatures(terrainResult.cells, width, height);
          console.log(`Relabeled features: ${cleanedFeatures.length} (was ${generatedFeatures.length})`);
          
          buildCoastlinePaths(coastalSegments, cleanedFeatures, terrainResult.cells);
          setFeatures(cleanedFeatures);
        } else {
          buildCoastlinePaths(coastalSegments, generatedFeatures, terrainResult.cells);
          setFeatures(generatedFeatures);
        }
        
        // Border carving: Carve out water border after coastline computation
        // This ensures coastlines are computed from true land geometry
        let carvedCount = 0;
        terrainResult.cells.forEach(cell => {
          const [cx, cy] = cell.centroid;
          if (
            cx < params.waterMargin ||
            cx > width - params.waterMargin ||
            cy < params.waterMargin ||
            cy > height - params.waterMargin
          ) {
            if (cell.isLand) {
              cell.isLand = false;
              cell.height = 0;
              carvedCount++;
            }
          }
        });
        
        if (carvedCount > 0) {
          console.log(`🌊 Border carving: ${carvedCount} cells forced to water within ${params.waterMargin}px margin`);
        }
        
        // Apply colors
        console.log('Applying colors...');
        applyColorsToCells(terrainResult.cells, params.seaLevel);
        console.log('Colors applied');
        
        setCells(terrainResult.cells);
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
              max="4.0"
              step="0.1"
              value={params.falloff}
              onChange={(e) => setParams(prev => ({ ...prev, falloff: Number(e.target.value) }))}
            />
            <small>{params.falloff >= 2.0 ? 'Continental (gentle plateaus)' : 'Island (sharp peaks)'}</small>
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
          
          <div className="param-group">
            <label>Water Margin: {params.waterMargin}</label>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={params.waterMargin}
              onChange={(e) => setParams(prev => ({ ...prev, waterMargin: Number(e.target.value) }))}
            />
            <small>Buffer around map edges to ensure water</small>
          </div>

          <div className="param-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={params.continentMode}
                onChange={(e) => setParams(prev => ({ ...prev, continentMode: e.target.checked }))}
              />
              Continent Mode
            </label>
            <small>Generate large continents instead of scattered islands</small>
          </div>
        </div>
        
        <div className="map-info">
          <p>Features: {features.length} (Ocean: 1, Lakes: {features.filter(f => f.type === 'lake').length}, Islands: {features.filter(f => f.type === 'island').length})</p>
          <p>Coastal Cells: {cells.filter(c => c.isCoastal).length}</p>
        </div>
      </div>
      
      <div className="map-container">
        <svg 
          width={width} 
          height={height} 
          className="heightmap"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
        >
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