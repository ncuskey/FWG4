# FWG4 - Fantasy Heightmap Generator

A React-based procedural fantasy map heightmap generator inspired by Azgaar's Fantasy Map Generator. This tool generates realistic-looking terrain using Voronoi diagrams and blob algorithms, creating color-coded elevation maps entirely in the browser.

## Features

- **Procedural Generation**: Creates unique maps using Voronoi diagrams and blob algorithms
- **Interactive Controls**: Real-time parameter adjustment for terrain generation
- **Realistic Terrain**: Uses graph-based heightmap generation for natural-looking coastlines
- **Automatic Coastlines**: Clear visual separation between land and water with feature classification
- **Clean Coastline Rendering**: Ordered loop assembly for smooth, professional outlines
- **Color-Coded Elevation**: Visual representation with blue (water) to white (peaks) color scheme
- **Responsive Design**: Works on desktop and mobile devices
- **No Server Required**: Runs entirely in the browser

## How It Works

### Voronoi Mesh Generation
- Uses jittered grid sampling to create evenly distributed points
- Generates a Voronoi diagram from these points to create irregular polygonal cells
- Each cell represents a region of the map with its own elevation

### Terrain Generation (Blob Algorithm)
- Creates multiple "blobs" of terrain starting from random peak points
- Each blob spreads height to neighboring cells with gradual falloff
- Adds randomness (sharpness) to create irregular, realistic coastlines
- Combines multiple blobs to form complex landmasses

### Color Mapping
- Maps elevation values to colors: deep blue (water) → light blue → green → brown → white (peaks)
- Applies sea level threshold to distinguish land from water
- Creates smooth color transitions for natural appearance

### Coastline Rendering
- Identifies all land-water boundaries using shared polygon edges
- Groups coastline segments by geographical feature (island, lake, etc.)
- Assembles segments into ordered, continuous loops for clean outlines
- Renders each feature's coastline as a single SVG path (no crisscrossing lines)

## Controls

- **Points**: Number of Voronoi cells (1000-8000) - affects map detail
- **Blobs**: Number of terrain peaks (1-20) - affects landmass complexity
- **Falloff**: How quickly height decreases from peaks (0.7-0.95) - affects terrain steepness
- **Sharpness**: Randomness in height propagation (0-0.3) - affects coastline irregularity
- **Sea Level**: Height threshold for water (0.1-0.4) - affects land/water ratio

## Getting Started

### Prerequisites
- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone or download this project
2. Navigate to the project directory:
   ```bash
   cd fwg4-heightmap
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

This creates a `dist` folder with the production-ready files that can be served by any static file server.

## Technical Details

### Architecture
- **React 18** with TypeScript for the UI
- **D3.js** for Voronoi diagram generation and geometric operations
- **Vite** for fast development and building
- **CSS Grid/Flexbox** for responsive layout

### Key Components
- `MapGenerator`: Main component that orchestrates the generation process
- `voronoi.ts`: Handles point sampling and Voronoi diagram creation
- `terrain.ts`: Implements the blob algorithm for terrain generation
- `color.ts`: Maps elevation values to colors
- `coastline.ts`: Generates coastlines and classifies geographical features

### Performance
- Optimized for 3000-8000 cells (good balance of detail and performance)
- Uses React's `useMemo` and `useCallback` for efficient rendering
- Asynchronous generation to prevent UI blocking

## Future Enhancements

- **River Systems**: Water flow simulation ending at coastline segments
- **Biome Generation**: Add climate and vegetation layers with coastal effects
- **3D Terrain View**: WebGL rendering for 3D visualization
- **Coastline Smoothing**: Natural curve interpolation for smoother coastlines
- **Map Export**: Save generated maps as images
- **Interactive Editing**: Click to add/remove terrain features
- **Custom Color Schemes**: User-defined color palettes

## Inspiration

This project is inspired by [Azgaar's Fantasy Map Generator](https://azgaar.wordpress.com/), particularly the heightmap generation techniques described in their blog posts about procedural map generation.

## License

This project is open source and available under the MIT License.

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the heightmap generator!

---

*This repository was originally created as FWG4 and has been expanded to include a complete fantasy heightmap generator implementation.*
