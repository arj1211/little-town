import './style.css';
import * as PIXI from 'pixi.js';
import { TownEditor } from './town/TownEditor.js';
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

document.querySelector('#app').innerHTML = `
  <div id="game-container">
    <div id="toolbar">
      <h2 style="color: #fff; margin: 0 0 10px 0; font-size: 18px; border-bottom: 2px solid #444; padding-bottom: 10px;">🏘️ Little Town</h2>
      
      <div class="tool-section" style="flex-direction: column; align-items: stretch; border: none; padding: 0;">
        <label style="margin-bottom: 8px;">Tools</label>
        <button id="tool-road" class="tool-btn active" style="width: 100%; margin-bottom: 6px;">🛣️ Road</button>
        <button id="tool-zone" class="tool-btn" style="width: 100%; margin-bottom: 6px;">🏘️ Zone</button>
        <button id="tool-erase" class="tool-btn" style="width: 100%;">❌ Erase</button>
      </div>
      
      <div class="tool-section" id="zone-types" style="flex-direction: column; align-items: stretch; border: none; padding: 0; display: none;">
        <label style="margin-bottom: 8px;">Zone Type</label>
        <button id="zone-residential" class="zone-btn active" style="width: 100%; margin-bottom: 6px;">🏠 Residential</button>
        <button id="zone-commercial" class="zone-btn" style="width: 100%; margin-bottom: 6px;">🏢 Commercial</button>
        <button id="zone-school" class="zone-btn" style="width: 100%; margin-bottom: 6px;">🏫 School</button>
        <button id="zone-community" class="zone-btn" style="width: 100%; margin-bottom: 6px;">🏛️ Community</button>
        <button id="zone-park" class="zone-btn" style="width: 100%;">🌳 Park</button>
      </div>
      
      <div class="tool-section" style="flex-direction: column; align-items: stretch; border: none; padding: 0;">
        <label style="margin-bottom: 8px;">File</label>
        <button id="btn-save" style="width: 100%; margin-bottom: 6px;">💾 Save</button>
        <button id="btn-load" style="width: 100%; margin-bottom: 6px;">📂 Load</button>
        <button id="btn-export" style="width: 100%; margin-bottom: 6px;">📤 Export</button>
        <button id="btn-import" style="width: 100%;">📥 Import</button>
      </div>
      
      <div class="tool-section" style="flex-direction: column; align-items: stretch; border: none; padding: 0;">
        <label style="margin-bottom: 8px;">Examples</label>
        <button id="btn-gridtown" class="example-btn" style="width: 100%; margin-bottom: 6px;">Grid Town</button>
        <button id="btn-riverside" class="example-btn" style="width: 100%; margin-bottom: 6px;">Riverside</button>
        <button id="btn-suburban" class="example-btn" style="width: 100%; margin-bottom: 6px;">Suburban</button>
        <button id="btn-downtown" class="example-btn" style="width: 100%; margin-bottom: 6px;">Downtown</button>
        <button id="btn-village" class="example-btn" style="width: 100%;">Village</button>
      </div>
      
      <div class="tool-section" style="flex-direction: column; align-items: stretch; border: none; padding: 0;">
        <button id="btn-clear" style="width: 100%; margin-bottom: 10px;">🗑️ Clear All</button>
        <button id="btn-simulate" class="highlight" style="width: 100%; font-size: 15px; padding: 12px;">▶️ Start Simulation</button>
      </div>
      
      <div class="stats" style="text-align: left; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 6px; margin-top: auto;">
        <span id="stats-text" style="font-size: 12px; line-height: 1.6;">Draw roads and zones to build your town!</span>
      </div>
    </div>
    <div id="canvas-container"></div>
  </div>
`;

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
const minZoom = 0.4; // Can see entire 1000x1000 area (increased to see more)
const maxZoom = 5;   // Can see ~9 houses (residential grid is 12x12, so ~36 units width)

// Create town editor
const editor = new TownEditor(worldContainer, app);

// Simulation systems (not running yet)
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
const exampleTowns = document.getElementById('example-towns');
const btnClear = document.getElementById('btn-clear');
const btnSimulate = document.getElementById('btn-simulate');
const statsText = document.getElementById('stats-text');

console.log('exampleTowns element:', exampleTowns);
console.log('Has change listener:', exampleTowns !== null);

// Tool selection
Object.entries(toolButtons).forEach(([tool, btn]) => {
  btn.addEventListener('click', () => {
    Object.values(toolButtons).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    editor.setTool(tool);
    
    // Show/hide zone types based on tool
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
    editor.setZoneType(type);
  });
});

// Save/Load buttons
btnSave.addEventListener('click', () => {
  const townData = editor.exportTown();
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
      editor.importTown(townData);
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
  const townData = editor.exportTown();
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
        editor.importTown(townData);
        statsText.textContent = 'Town imported!';
      } catch (error) {
        alert('Error importing town: ' + error.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

// Example town buttons
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
    editor.loadExample(name);
    statsText.textContent = `Loaded ${name} example!`;
    setTimeout(() => {
      if (!isSimulating) {
        statsText.textContent = 'Click "Start Simulation" to see your town come alive!';
      }
    }, 2000);
  });
});

// Clear button
btnClear.addEventListener('click', () => {
  if (confirm('Clear all roads and zones?')) {
    editor.clearAll();
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

function startSimulation() {
  const townData = editor.getData();
  
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
  peopleManager = new PeopleManager(worldContainer, townData, timeManager);
  vehicleManager = new VehicleManager(worldContainer, townData, timeManager, peopleManager);
  
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

// Camera controls
app.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  scale *= delta;
  scale = Math.max(minZoom, Math.min(maxZoom, scale));
  worldContainer.scale.set(scale);
});

app.canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1 || e.button === 2) { // Middle or right click
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
    
    // Apply pan limits - allow slight panning beyond the 1000x1000 world area
    const worldSize = 1000;
    const buffer = 200; // Extra buffer for panning
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

// Day/night cycle colors
function getSkyColor(timeOfDay) {
  // Transition sky color based on time of day
  if (timeOfDay >= 6 && timeOfDay < 7) {
    // Dawn (6-7 AM): Transition from dark blue to light blue
    const t = (timeOfDay - 6);
    return interpolateColor(0x1a1a3e, 0x87ceeb, t);
  } else if (timeOfDay >= 7 && timeOfDay < 18) {
    // Day (7 AM - 6 PM): Light blue sky
    return 0x87ceeb;
  } else if (timeOfDay >= 18 && timeOfDay < 20) {
    // Dusk (6-8 PM): Transition to orange then dark blue
    const t = (timeOfDay - 18) / 2;
    if (t < 0.5) {
      // First hour: blue to orange
      return interpolateColor(0x87ceeb, 0xff6b35, t * 2);
    } else {
      // Second hour: orange to dark blue
      return interpolateColor(0xff6b35, 0x1a1a3e, (t - 0.5) * 2);
    }
  } else {
    // Night (8 PM - 6 AM): Dark blue
    return 0x1a1a3e;
  }
}

function interpolateColor(color1, color2, t) {
  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;
  
  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;
  
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  
  return (r << 16) | (g << 8) | b;
}

function getAmbientAlpha(timeOfDay) {
  // Darkness overlay alpha based on time
  if (timeOfDay >= 7 && timeOfDay < 18) {
    // Full daylight
    return 0;
  } else if (timeOfDay >= 18 && timeOfDay < 20) {
    // Getting darker (dusk)
    return ((timeOfDay - 18) / 2) * 0.4;
  } else if (timeOfDay >= 20 || timeOfDay < 6) {
    // Night
    return 0.4;
  } else if (timeOfDay >= 6 && timeOfDay < 7) {
    // Getting lighter (dawn)
    return 0.4 - ((timeOfDay - 6) * 0.4);
  }
  return 0;
}

// Create darkness overlay for night
const darknessOverlay = new PIXI.Graphics();
darknessOverlay.rect(-1000, -1000, 2000, 2000);
darknessOverlay.fill({ color: 0x000000, alpha: 0 });
worldContainer.addChild(darknessOverlay);

// Animation loop
let lastTime = performance.now();
app.ticker.add(() => {
  const currentTime = performance.now();
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  
  if (isSimulating && timeManager && peopleManager && vehicleManager) {
    timeManager.update(deltaTime);
    peopleManager.update(deltaTime, timeManager);
    vehicleManager.update(deltaTime);
    
    const timeOfDay = timeManager.getTimeOfDay();
    const isDaytime = timeOfDay >= 6 && timeOfDay < 20;
    
    // Update sky color based on time of day
    app.renderer.background.color = getSkyColor(timeOfDay);
    
    // Update darkness overlay
    const darkness = getAmbientAlpha(timeOfDay);
    darknessOverlay.clear();
    darknessOverlay.rect(-1000, -1000, 2000, 2000);
    darknessOverlay.fill({ color: 0x000000, alpha: darkness });
    
    // Update stats
    const timeEmoji = isDaytime ? '☀️' : '🌙';
    statsText.textContent = `${timeEmoji} ${timeManager.getTimeString()} | People: ${peopleManager.people.length} | Cars: ${vehicleManager.vehicles.length}`;
  }
});

console.log('Interactive Town Editor loaded! Draw roads and zones, then click "Start Simulation"');
