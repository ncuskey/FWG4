# Fantasy World Generator 4 (FWG4)

A React-based fantasy map heightmap generator inspired by Azgaar's Fantasy Map Generator. Generate beautiful, interactive 2D heightmaps with realistic coastlines and natural terrain.

## Features

### 🌍 **Natural Terrain Generation**
- **Voronoi-based mesh**: Natural cell distribution using jittered grid sampling
- **Blob algorithm**: Realistic heightmaps with BFS height propagation
- **Safe-zone seeding**: Prevents terrain from spilling over map edges
- **Gradual edge masking**: Smooth ocean rim with natural coastlines
- **Continental mode**: Generate large continents or scattered islands
- **Adaptive sea level**: Smart height threshold for guaranteed land coverage
- **Water margin control**: Configurable edge buffer for clean ocean borders

### 🏝️ **Coastline Detection & Rendering**
- **Automatic coastline detection**: Identifies land-water boundaries
- **Feature classification**: Distinguishes oceans, lakes, and islands/continents
- **Natural boundary assembly**: Creates smooth, closed coastline loops
- **SVG rendering**: Crisp, scalable coastline paths
- **Robust edge detection**: Unique-edge counting for reliable boundary identification
- **Open-chain walker**: Handles both closed loops and continental coasts

### 🛡️ **Border Protection System**
- **Multi-layer safety**: Guarantees no land touches map edges
- **Gradual falloff**: Natural height transitions near borders
- **Smooth interpolation**: Eliminates unnatural straight edges
- **Robust verification**: Multiple safety checks ensure clean borders
- **Water margin control**: Configurable edge buffer (0-100px)
- **Border carving**: Applied after coastline computation for true geometry

### 🎨 **Interactive Controls**
- **Real-time generation**: Generate new maps instantly
- **Parameter adjustment**: Fine-tune terrain characteristics
- **Responsive layout**: Controls on left, map on right
- **Visual feedback**: Live feature counts and statistics

## Technical Architecture

### Core Technologies
- **React 18** with TypeScript
- **Vite** build system
- **D3.js** for Voronoi diagrams and Delaunay triangulation
- **SVG** for crisp, scalable rendering

### Key Algorithms
1. **Voronoi Mesh Generation**: Jittered grid sampling for natural cell distribution
2. **Blob Terrain**: BFS height propagation with safe-zone constraints
3. **Coastline Detection**: Unique edge extraction with adjacency graph traversal
4. **Border Protection**: Multi-layer safety system with gradual edge masking
5. **Continental Generation**: Low-frequency terrain with adaptive sea level
6. **Tiny Island Removal**: Post-processing to eliminate small features
7. **Robust Edge Detection**: Unique-edge counting for reliable boundaries
8. **Open-Chain Walker**: Handles both closed loops and continental coasts

### Data Structures
- **Cell**: Voronoi cell with height, isLand, neighbors, polygon, centroid
- **Feature**: Geographic feature (ocean, lake, island) with boundary and metadata
- **CoastlineSegment**: Edge segment between land and water cells

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation
```bash
git clone https://github.com/ncuskey/FWG4.git
cd FWG4/fwg4-heightmap
npm install
```

### Development
```bash
npm run dev
```
Open http://localhost:5173 (or the port shown in terminal)

### Build
```bash
npm run build
```

## Usage

### Basic Map Generation
1. Click "Generate New Map" to create a new heightmap
2. Adjust parameters using the sliders:
   - **Points**: Number of Voronoi cells (1000-8000)
   - **Blobs**: Number of terrain features (1-20, fewer for continents)
   - **Falloff**: Terrain smoothness (0.7-4.0, higher for gentle plateaus)
   - **Sharpness**: Terrain randomness (0-0.3)
   - **Sea Level**: Water level threshold (0.1-0.4)
   - **Water Margin**: Edge buffer for ocean borders (0-100px)
3. **Continental Mode**: Toggle for large continents vs scattered islands

### Understanding the Output
- **Blue areas**: Ocean and water bodies
- **Green to brown gradients**: Land with elevation-based coloring
- **Dark outlines**: Coastlines separating land from water
- **Feature counts**: Displayed in the controls panel

## Project Structure

```
fwg4-heightmap/
├── src/
│   ├── components/
│   │   └── MapGenerator.tsx    # Main React component
│   ├── utils/
│   │   ├── voronoi.ts          # Voronoi mesh generation
│   │   ├── terrain.ts          # Terrain generation with blob algorithm
│   │   ├── coastline.ts        # Coastline detection and assembly
│   │   └── color.ts            # Color mapping functions
│   ├── App.tsx                 # Main app component
│   └── App.css                 # Styling
├── DEVLOG.md                   # Development history
├── COASTLINE.md                # Coastline implementation details
└── README.md                   # This file
```

## Development History

See [DEVLOG.md](DEVLOG.md) for detailed development phases and technical decisions.

## Coastline Implementation

See [COASTLINE.md](COASTLINE.md) for detailed information about the coastline detection and rendering system.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Inspired by [Azgaar's Fantasy Map Generator](https://azgaar.github.io/Fantasy-Map-Generator/)
- Built with modern React and TypeScript
- Uses D3.js for geometric algorithms
