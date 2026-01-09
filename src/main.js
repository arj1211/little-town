import './style.css';
import * as PIXI from 'pixi.js';
import { TownModel } from './town/TownModel.js';
import { TownRenderer } from './town/TownRenderer.js';
import { InputController } from './town/InputController.js';
import { PeopleManager } from './systems/PeopleManager.js';
import { VehicleManager } from './systems/VehicleManager.js';
import { TimeManager } from './systems/TimeManager.js';

// Create the application
const app = new PIXI.Application();
await app.init({
  width: window.innerWidth - 280, // Subtract sidebar width
  height: window.innerHeight,
  backgroundColor: 0x87ceeb,
  antialias: true,
  resizeTo: window
});

// Canvas is appended to the container
document.querySelector('#canvas-container').appendChild(app.canvas);

// Camera controls
const worldContainer = new PIXI.Container();
app.stage.addChild(worldContainer);

let scale = 1.5;
let isDragging = false;
let dragStart = { x: 0, y: 0 };

worldContainer.x = app.screen.width / 2;
worldContainer.y = app.screen.height / 2;
worldContainer.scale.set(scale);

// Zoom limits
const minZoom = 0.4;
const maxZoom = 5;

// Initialize Architecture
const model = new TownModel();
const renderer = new TownRenderer(model, worldContainer, app);
const inputController = new InputController(model, renderer, app);

// Load Example Town by default
model.loadExample();

// Simulation systems
let peopleManager = null;
let vehicleManager = null;
let timeManager = null;
let isSimulating = false;

// UI Controls
const toolButtons = {
  road: document.getElementById('tool-road'),
  zone: document.getElementById('tool-zone'),
  erase: document.getElementById('tool-erase')
};

const zoneButtons = {
  residential: document.getElementById('zone-residential'),
  commercial: document.getElementById('zone-commercial'),
  school: document.getElementById('zone-school'),
  community: document.getElementById('zone-community'),
  park: document.getElementById('zone-park')
};

const zoneTypesDiv = document.getElementById('zone-types');
const btnSave = document.getElementById('btn-save');
const btnLoad = document.getElementById('btn-load');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const btnClear = document.getElementById('btn-clear');
const btnSimulate = document.getElementById('btn-simulate');
const statsText = document.getElementById('stats-text');

// Tool selection
Object.entries(toolButtons).forEach(([tool, btn]) => {
  btn.addEventListener('click', () => {
    Object.values(toolButtons).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    inputController.setTool(tool);

    if (tool === 'zone') {
      zoneTypesDiv.style.display = 'flex';
    } else {
      zoneTypesDiv.style.display = 'none';
    }
  });
});

// Zone type selection
Object.entries(zoneButtons).forEach(([type, btn]) => {
  btn.addEventListener('click', () => {
    Object.values(zoneButtons).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    inputController.setZoneType(type);
  });
});

// Save/Load buttons
btnSave.addEventListener('click', () => {
  const townData = model.exportTown();
  localStorage.setItem('savedTown', JSON.stringify(townData));
  statsText.textContent = 'Town saved!';
  setTimeout(() => {
    statsText.textContent = 'Draw roads and zones to build your town!';
  }, 2000);
});

btnLoad.addEventListener('click', () => {
  const savedData = localStorage.getItem('savedTown');
  if (savedData) {
    try {
      const townData = JSON.parse(savedData);
      model.importTown(townData);
      statsText.textContent = 'Town loaded!';
      setTimeout(() => {
        statsText.textContent = 'Draw roads and zones to build your town!';
      }, 2000);
    } catch (e) {
      alert('Error loading town: ' + e.message);
    }
  } else {
    alert('No saved town found!');
  }
});

btnExport.addEventListener('click', () => {
  const townData = model.exportTown();
  const dataStr = JSON.stringify(townData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-town.json';
  a.click();
  URL.revokeObjectURL(url);
  statsText.textContent = 'Town exported!';
});

btnImport.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const townData = JSON.parse(event.target.result);
        model.importTown(townData);
        statsText.textContent = 'Town imported!';
      } catch (error) {
        alert('Error importing town: ' + error.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

// Example town buttons - Disabled for refactor unless implemented
const exampleButtons = {
  gridtown: document.getElementById('btn-gridtown'),
  riverside: document.getElementById('btn-riverside'),
  suburban: document.getElementById('btn-suburban'),
  downtown: document.getElementById('btn-downtown'),
  village: document.getElementById('btn-village')
};

Object.entries(exampleButtons).forEach(([name, btn]) => {
  btn.addEventListener('click', () => {
    console.log('Loading example:', name);
    model.loadExample(name);
    statsText.textContent = `Loaded ${name} example! (Note: Examples WIP)`;
  });
});

// Clear button
btnClear.addEventListener('click', () => {
  if (confirm('Clear all roads and zones?')) {
    model.clearAll();
    if (isSimulating) {
      stopSimulation();
    }
    statsText.textContent = 'Town cleared. Draw roads and zones to rebuild!';
  }
});

// Simulate button
btnSimulate.addEventListener('click', () => {
  if (!isSimulating) {
    startSimulation();
  } else {
    stopSimulation();
  }
});

const speedSlider = document.getElementById('speed-slider');

speedSlider.addEventListener('input', (e) => {
  const speed = parseInt(e.target.value);
  if (timeManager) {
    timeManager.timeScale = speed;
  }
});

function startSimulation() {
  const townData = model.getData();

  if (townData.buildings.length === 0) {
    alert('Please create some zones first!');
    return;
  }

  if (townData.roads.length === 0) {
    alert('Please create some roads first!');
    return;
  }

  // Create simulation managers
  timeManager = new TimeManager();
  timeManager.timeScale = parseInt(speedSlider.value);

  // Pass model directly
  peopleManager = new PeopleManager(worldContainer, model, timeManager);
  vehicleManager = new VehicleManager(worldContainer, model, timeManager, peopleManager);

  isSimulating = true;
  btnSimulate.textContent = '⏸️ Stop Simulation';
  btnSimulate.classList.remove('highlight');
  statsText.textContent = 'Simulation running...';
}

function stopSimulation() {
  if (peopleManager) {
    peopleManager.destroy();
    peopleManager = null;
  }
  if (vehicleManager) {
    vehicleManager.destroy();
    vehicleManager = null;
  }

  isSimulating = false;
  btnSimulate.textContent = '▶️ Start Simulation';
  btnSimulate.classList.add('highlight');
  statsText.textContent = 'Simulation stopped.';
}

// Camera controls & Input
// InputController handles map interaction (draw road/zone).
// We still need camera panning/zooming.
app.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  scale *= delta;
  scale = Math.max(minZoom, Math.min(maxZoom, scale));
  worldContainer.scale.set(scale);
});

app.canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1 || e.button === 2) {
    isDragging = true;
    dragStart = { x: e.clientX - worldContainer.x, y: e.clientY - worldContainer.y };
    app.canvas.style.cursor = 'grabbing';
    e.preventDefault();
  }
});

app.canvas.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    // Limits
    const worldSize = 1000;
    const buffer = 200;
    const minX = -(worldSize / 2 + buffer) * scale + app.screen.width / 2;
    const maxX = (worldSize / 2 + buffer) * scale + app.screen.width / 2;
    const minY = -(worldSize / 2 + buffer) * scale + app.screen.height / 2;
    const maxY = (worldSize / 2 + buffer) * scale + app.screen.height / 2;
    worldContainer.x = Math.max(minX, Math.min(maxX, newX));
    worldContainer.y = Math.max(minY, Math.min(maxY, newY));
  }
});

app.canvas.addEventListener('mouseup', (e) => {
  if (e.button === 1 || e.button === 2) {
    isDragging = false;
    app.canvas.style.cursor = 'default';
  }
});

app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Visuals for Day/Night
// Ensure darkness overlay is ON TOP of the town
const darknessOverlay = new PIXI.Graphics();
darknessOverlay.rect(-2000, -2000, 4000, 4000);
darknessOverlay.fill({ color: 0x000000, alpha: 0 });
// Add to worldContainer, which already has renderer layers. 
// It will be added last, so on top. Perfect.
worldContainer.addChild(darknessOverlay);

// Helpers
function getSkyColor(timeOfDay) {
  if (timeOfDay >= 6 && timeOfDay < 7) {
    return interpolateColor(0x1a1a3e, 0x87ceeb, timeOfDay - 6);
  } else if (timeOfDay >= 7 && timeOfDay < 18) {
    return 0x87ceeb;
  } else if (timeOfDay >= 18 && timeOfDay < 20) {
    const t = (timeOfDay - 18) / 2;
    return t < 0.5 ? interpolateColor(0x87ceeb, 0xff6b35, t * 2) : interpolateColor(0xff6b35, 0x1a1a3e, (t - 0.5) * 2);
  } else {
    return 0x1a1a3e;
  }
}

function interpolateColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  return (Math.round(r1 + (r2 - r1) * t) << 16) | (Math.round(g1 + (g2 - g1) * t) << 8) | Math.round(b1 + (b2 - b1) * t);
}

function getAmbientAlpha(timeOfDay) {
  if (timeOfDay >= 7 && timeOfDay < 18) return 0;
  if (timeOfDay >= 18 && timeOfDay < 20) return ((timeOfDay - 18) / 2) * 0.4;
  if (timeOfDay >= 20 || timeOfDay < 6) return 0.4;
  return 0.4 - ((timeOfDay - 6) * 0.4);
}

// Stats Panel (Sidebar)
const sidebar = document.createElement('div');
sidebar.style.position = 'absolute';
sidebar.style.top = '10px';
sidebar.style.right = '10px';
sidebar.style.width = '250px';
sidebar.style.background = 'rgba(0, 0, 0, 0.8)';
sidebar.style.color = 'white';
sidebar.style.padding = '15px';
sidebar.style.borderRadius = '8px';
sidebar.style.fontFamily = 'monospace';
sidebar.style.display = 'none'; // Hidden by default
document.body.appendChild(sidebar);

// Add Tab Button
const btnStats = document.createElement('button');
btnStats.textContent = '📊 Stats';
btnStats.className = 'control-btn';
btnStats.style.marginLeft = '10px';
document.querySelector('#controls').appendChild(btnStats);

btnStats.addEventListener('click', () => {
  sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
});


// Loop
let lastTime = performance.now();
app.ticker.add(() => {
  const currentTime = performance.now();
  let deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  // Safety cap on deltaTime to prevent spiral of death if frame lags
  if (deltaTime > 0.1) deltaTime = 0.1;

  if (isSimulating && timeManager && peopleManager && vehicleManager) {
    timeManager.update(deltaTime);
    peopleManager.update(deltaTime, timeManager);
    vehicleManager.update(deltaTime);

    const timeOfDay = timeManager.getTimeOfDay();
    const isDaytime = timeOfDay >= 6 && timeOfDay < 20;

    app.renderer.background.color = getSkyColor(timeOfDay);

    const darkness = getAmbientAlpha(timeOfDay);
    darknessOverlay.clear();
    darknessOverlay.rect(-2000, -2000, 4000, 4000); // Updated size
    darknessOverlay.fill({ color: 0x000000, alpha: darkness });

    const timeEmoji = isDaytime ? '☀️' : '🌙';
    statsText.textContent = `${timeEmoji} ${timeManager.getTimeString()} | People: ${peopleManager.people.length} | Cars: ${vehicleManager.vehicles.length}`;

    // Update Sidebar Stats
    if (sidebar.style.display !== 'none') {
      const zones = model.zones;
      const residential = zones.filter(z => z.type === 'residential').length;
      const commercial = zones.filter(z => z.type === 'commercial').length;

      sidebar.innerHTML = `
        <h3>Town Metrics</h3>
        <p>Time: ${timeManager.getTimeString()}</p>
        <p>Population: ${peopleManager.people.length}</p>
        <p>Vehicles: ${vehicleManager.vehicles.length}</p>
        <hr>
        <p>Zones:</p>
        <ul>
          <li>Residential: ${residential}</li>
          <li>Commercial: ${commercial}</li>
          <li>Industrial: ${zones.filter(z => z.type === 'industrial').length}</li>
        </ul>
        <p>Active Agents: ${peopleManager.people.filter(p => p.currentLocation === null).length}</p>
        `;
    }
  }
});

console.log('Interactive Town Editor loaded! Draw roads and zones, then click "Start Simulation"');
