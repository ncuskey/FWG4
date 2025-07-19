import { MapGenerator } from './components/MapGenerator';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Fantasy Heightmap Generator</h1>
        <p>Generate procedural fantasy maps using Voronoi diagrams and blob algorithms</p>
      </header>
      
      <main>
        <MapGenerator width={1000} height={500} />
      </main>
      
      <footer>
        <p>Inspired by Azgaar's Fantasy Map Generator</p>
      </footer>
    </div>
  );
}

export default App;
