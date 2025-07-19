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
      
      return (
        <path
          key={cell.id}
          d={pathData}
          fill={cell.color || '#000'}
          stroke="none"
        />
      );
    }).filter(Boolean);
  }, [cells]);

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
          {/* Water background */}
          <rect width={width} height={height} fill="#1e3a8a" />
          
          {/* Land polygons */}
          {svgPaths}
          
          {/* Coastline paths */}
          {coastlinePaths}
        </svg>
      </div>
    </div>
  );
}; 