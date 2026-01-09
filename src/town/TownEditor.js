import * as PIXI from 'pixi.js';

export class TownEditor {
  constructor(container, app) {
    this.container = container;
    this.app = app;
    this.currentTool = 'road';
    this.currentZoneType = 'residential';
    this.isDrawing = false;
    this.drawStart = null;
    this.previewGraphics = new PIXI.Graphics();
    
    this.roads = [];
    this.zones = [];
    this.buildings = [];
    this.roadGraph = [];
    
    // Grid system
    this.gridSize = 20; // Each tile is 20x20 units
    this.gridData = {}; // Store zone type per tile
    
    // Layers
    this.terrainLayer = new PIXI.Container();
    this.zonesLayer = new PIXI.Container();
    this.roadsLayer = new PIXI.Container();
    this.buildingsLayer = new PIXI.Container();
    this.uiLayer = new PIXI.Container();
    
    container.addChild(this.terrainLayer);
    container.addChild(this.zonesLayer);
    container.addChild(this.roadsLayer);
    container.addChild(this.buildingsLayer);
    container.addChild(this.uiLayer);
    container.addChild(this.previewGraphics);
    
    this.createTerrain();
    this.setupInteraction();
  }
  
  createTerrain() {
    const terrain = new PIXI.Graphics();
    terrain.rect(-500, -500, 1000, 1000);
    terrain.fill(0xa5d6a7);
    this.terrainLayer.addChild(terrain);
  }
  
  setupInteraction() {
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    
    this.app.stage.on('pointerdown', (e) => this.onPointerDown(e));
    this.app.stage.on('pointermove', (e) => this.onPointerMove(e));
    this.app.stage.on('pointerup', (e) => this.onPointerUp(e));
    
    // Draw grid
    this.drawGrid();
  }
  
  drawGrid() {
    const gridGraphics = new PIXI.Graphics();
    const gridExtent = 500;
    const halfGrid = this.gridSize / 2;
    
    // Draw vertical lines - offset by half grid so lines are at tile edges
    for (let x = -gridExtent - halfGrid; x <= gridExtent + halfGrid; x += this.gridSize) {
      gridGraphics.moveTo(x, -gridExtent - halfGrid);
      gridGraphics.lineTo(x, gridExtent + halfGrid);
      gridGraphics.stroke({ width: 0.5, color: 0x000000, alpha: 0.15 });
    }
    
    // Draw horizontal lines
    for (let y = -gridExtent - halfGrid; y <= gridExtent + halfGrid; y += this.gridSize) {
      gridGraphics.moveTo(-gridExtent - halfGrid, y);
      gridGraphics.lineTo(gridExtent + halfGrid, y);
      gridGraphics.stroke({ width: 0.5, color: 0x000000, alpha: 0.15 });
    }
    
    this.terrainLayer.addChild(gridGraphics);
  }
  
  snapToGrid(pos) {
    return {
      x: Math.round(pos.x / this.gridSize) * this.gridSize,
      y: Math.round(pos.y / this.gridSize) * this.gridSize
    };
  }
  
  onPointerDown(e) {
    // Ignore middle/right mouse button
    if (e.button === 1 || e.button === 2) {
      return;
    }
    
    const globalPos = e.global;
    const localPos = this.container.toLocal(globalPos);
    
    this.isDrawing = true;
    this.drawStart = { x: localPos.x, y: localPos.y };
  }
  
  onPointerMove(e) {
    if (!this.isDrawing) return;
    
    const globalPos = e.global;
    const localPos = this.container.toLocal(globalPos);
    
    this.previewGraphics.clear();
    
    if (this.currentTool === 'road') {
      this.previewRoad(this.drawStart, localPos);
    } else if (this.currentTool === 'zone') {
      this.previewZoneBrush(localPos);
      // Continuous painting - paint while dragging
      this.createZone(this.drawStart, localPos);
    } else if (this.currentTool === 'erase') {
      // Continuous erasing
      this.eraseAt(localPos);
    }
  }
  
  onPointerUp(e) {
    if (!this.isDrawing) return;
    
    const globalPos = e.global;
    const localPos = this.container.toLocal(globalPos);
    
    if (this.currentTool === 'road') {
      this.createRoad(this.drawStart, localPos);
    } else if (this.currentTool === 'zone') {
      this.createZone(this.drawStart, localPos);
    } else if (this.currentTool === 'erase') {
      this.eraseAt(localPos);
    }
    
    this.isDrawing = false;
    this.drawStart = null;
    this.previewGraphics.clear();
  }
  
  previewRoad(start, end) {
    const snappedStart = this.snapToGrid(start);
    const snappedEnd = this.snapToGrid(end);
    
    this.previewGraphics.moveTo(snappedStart.x, snappedStart.y);
    this.previewGraphics.lineTo(snappedEnd.x, snappedEnd.y);
    this.previewGraphics.stroke({ width: 12, color: 0x404040, alpha: 0.5 });
  }
  
  previewZoneBrush(pos) {
    const snapped = this.snapToGrid(pos);
    const color = this.getZoneColor(this.currentZoneType);
    
    // Show tile being painted
    this.previewGraphics.rect(
      snapped.x - this.gridSize / 2,
      snapped.y - this.gridSize / 2,
      this.gridSize,
      this.gridSize
    );
    this.previewGraphics.fill({ color, alpha: 0.5 });
    this.previewGraphics.stroke({ width: 1, color: 0x000000, alpha: 0.7 });
  }
  
  createRoad(start, end) {
    // Snap to grid first
    const gridStart = this.snapToGrid(start);
    const gridEnd = this.snapToGrid(end);
    
    // Check if any NON-ROAD zones occupy these tiles
    const tilesOnRoad = this.getTilesAlongLine(gridStart, gridEnd);
    for (const tile of tilesOnRoad) {
      const key = `${tile.x},${tile.y}`;
      // Only block if tile has a zone (not empty, not already a road)
      if (this.gridData[key] && this.gridData[key] !== 'road') {
        alert('Cannot place road through zones! Please erase zones first.');
        return;
      }
    }
    
    // Then snap to nearby road endpoints
    const snapDistance = this.gridSize;
    const snappedStart = this.snapToNearbyPoint(gridStart, snapDistance);
    const snappedEnd = this.snapToNearbyPoint(gridEnd, snapDistance);
    
    // Mark road tiles as occupied
    for (const tile of tilesOnRoad) {
      const key = `${tile.x},${tile.y}`;
      this.gridData[key] = 'road';
    }
    
    const graphics = new PIXI.Graphics();
    graphics.moveTo(snappedStart.x, snappedStart.y);
    graphics.lineTo(snappedEnd.x, snappedEnd.y);
    graphics.stroke({ width: 12, color: 0x404040 });
    this.roadsLayer.addChild(graphics);
    
    this.roads.push({
      graphics,
      start: { ...snappedStart },
      end: { ...snappedEnd },
      width: 12,
      angle: Math.atan2(snappedEnd.y - snappedStart.y, snappedEnd.x - snappedStart.x)
    });
    
    // Add to road graph with snapping
    this.addOrUpdateRoadNode(snappedStart);
    this.addOrUpdateRoadNode(snappedEnd);
    this.updateRoadGraph();
  }
  
  snapToNearbyPoint(point, snapDistance) {
    // Check all existing road endpoints
    for (const road of this.roads) {
      const distToStart = Math.sqrt((point.x - road.start.x) ** 2 + (point.y - road.start.y) ** 2);
      if (distToStart < snapDistance) {
        return { ...road.start };
      }
      
      const distToEnd = Math.sqrt((point.x - road.end.x) ** 2 + (point.y - road.end.y) ** 2);
      if (distToEnd < snapDistance) {
        return { ...road.end };
      }
    }
    return point;
  }
  
  addOrUpdateRoadNode(point) {
    // Check if node already exists at this location
    const existing = this.roadGraph.find(node => 
      Math.abs(node.x - point.x) < 1 && Math.abs(node.y - point.y) < 1
    );
    
    if (!existing) {
      this.roadGraph.push({ x: point.x, y: point.y, connections: [] });
    }
  }
  
  createZone(start, pos) {
    // Paint zone tiles with brush
    const snapped = this.snapToGrid(pos);
    const key = `${snapped.x},${snapped.y}`;
    
    // Check if tile is occupied by road
    if (this.gridData[key] === 'road') {
      return; // Can't place zone on road
    }
    
    // Set this tile to the current zone type
    this.gridData[key] = this.currentZoneType;
    
    // Redraw all zones from grid data
    this.rebuildZonesFromGrid();
  }
  
  getTilesAlongLine(start, end) {
    const tiles = [];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) / this.gridSize;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round((start.x + dx * t) / this.gridSize) * this.gridSize;
      const y = Math.round((start.y + dy * t) / this.gridSize) * this.gridSize;
      const key = `${x},${y}`;
      if (!tiles.find(tile => `${tile.x},${tile.y}` === key)) {
        tiles.push({ x, y });
      }
    }
    
    return tiles;
  }
  
  rebuildZonesFromGrid() {
    // Clear existing zones and buildings
    this.zones.forEach(z => z.graphics.destroy());
    this.buildings.forEach(b => b.graphics.destroy());
    this.zones = [];
    this.buildings = [];
    
    // Group tiles by zone type (exclude roads)
    const zoneGroups = {};
    
    Object.entries(this.gridData).forEach(([key, type]) => {
      if (type === 'road') return; // Skip roads
      if (!zoneGroups[type]) zoneGroups[type] = [];
      const [x, y] = key.split(',').map(Number);
      zoneGroups[type].push({ x, y });
    });
    
    // Create zones from groups
    Object.entries(zoneGroups).forEach(([type, tiles]) => {
      // Find connected regions
      const regions = this.findConnectedRegions(tiles);
      
      regions.forEach(region => {
        const xs = region.map(t => t.x);
        const ys = region.map(t => t.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        const x = minX - this.gridSize / 2;
        const y = minY - this.gridSize / 2;
        const w = (maxX - minX) + this.gridSize;
        const h = (maxY - minY) + this.gridSize;
        
        const color = this.getZoneColor(type);
        const graphics = new PIXI.Graphics();
        
        // Draw individual tiles
        region.forEach(tile => {
          graphics.rect(
            tile.x - this.gridSize / 2,
            tile.y - this.gridSize / 2,
            this.gridSize,
            this.gridSize
          );
        });
        
        graphics.fill(color);
        graphics.stroke({ width: 0.5, color: 0x000000, alpha: 0.3 });
        this.zonesLayer.addChild(graphics);
        
        const zone = {
          graphics,
          type,
          x, y, w, h,
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2,
          tiles: region
        };
        
        // Find nearest roads to this zone
        zone.nearestRoads = this.findNearestRoads(zone);
        
        this.zones.push(zone);
        
        // Auto-fill with buildings
        this.fillZoneWithBuildings(zone);
      });
    });
  }
  
  findConnectedRegions(tiles) {
    const visited = new Set();
    const regions = [];
    
    tiles.forEach(tile => {
      const key = `${tile.x},${tile.y}`;
      if (visited.has(key)) return;
      
      const region = [];
      const queue = [tile];
      visited.add(key);
      
      while (queue.length > 0) {
        const current = queue.shift();
        region.push(current);
        
        // Check neighbors
        const neighbors = [
          { x: current.x + this.gridSize, y: current.y },
          { x: current.x - this.gridSize, y: current.y },
          { x: current.x, y: current.y + this.gridSize },
          { x: current.x, y: current.y - this.gridSize }
        ];
        
        neighbors.forEach(neighbor => {
          const nKey = `${neighbor.x},${neighbor.y}`;
          if (!visited.has(nKey) && tiles.some(t => t.x === neighbor.x && t.y === neighbor.y)) {
            visited.add(nKey);
            queue.push(neighbor);
          }
        });
      }
      
      regions.push(region);
    });
    
    return regions;
  }
  
  findNearestRoads(zone) {
    const zoneEdges = [
      { x: zone.centerX, y: zone.y }, // top
      { x: zone.centerX, y: zone.y + zone.h }, // bottom
      { x: zone.x, y: zone.centerY }, // left
      { x: zone.x + zone.w, y: zone.centerY } // right
    ];
    
    const nearestRoads = [];
    
    zoneEdges.forEach(edge => {
      let closestRoad = null;
      let closestDist = Infinity;
      
      this.roads.forEach(road => {
        const dist = this.pointToLineDistance(edge, road.start, road.end);
        if (dist < closestDist) {
          closestDist = dist;
          closestRoad = road;
        }
      });
      
      if (closestRoad && closestDist < 100) {
        // Find closest point on road
        const closestPoint = this.closestPointOnLine(edge, closestRoad.start, closestRoad.end);
        nearestRoads.push({
          road: closestRoad,
          connectionPoint: closestPoint,
          distance: closestDist
        });
      }
    });
    
    // Sort by distance and take top 3
    return nearestRoads
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }
  
  closestPointOnLine(point, lineStart, lineEnd) {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }
    
    return { x: xx, y: yy };
  }
  
  fillZoneWithBuildings(zone) {
    // Create a single building entry for each zone for simulation purposes
    // but don't add any decorative graphics - zones already have their color
    this.buildings.push({
      graphics: zone.graphics, // Reference to zone graphics
      type: zone.type,
      position: { x: zone.centerX, y: zone.centerY },
      width: zone.w,
      height: zone.h
    });
  }
  
  getZoneColor(type) {
    const colors = {
      residential: 0xffcdd2,  // Light pink
      commercial: 0xffd54f,   // Yellow
      school: 0xffee58,       // Bright yellow
      community: 0x66bb6a,    // Green
      park: 0x81c784,         // Light green
      road: 0x404040          // Dark gray
    };
    return colors[type] || 0xeeeeee;
  }
  
  eraseAt(pos) {
    const snapped = this.snapToGrid(pos);
    const key = `${snapped.x},${snapped.y}`;
    
    // Check if this tile has a zone
    if (this.gridData[key] && this.gridData[key] !== 'road') {
      // Remove this tile from gridData
      delete this.gridData[key];
      
      // Rebuild zones to reflect the change
      this.rebuildZonesFromGrid();
      return;
    }
    
    // Erase roads
    if (this.gridData[key] === 'road') {
      delete this.gridData[key];
      
      // Find and remove the road that passes through this tile
      for (let i = this.roads.length - 1; i >= 0; i--) {
        const road = this.roads[i];
        const dist = this.pointToLineDistance(pos, road.start, road.end);
        if (dist < 10) {
          // Remove road tiles from grid
          const tiles = this.getTilesAlongLine(road.start, road.end);
          tiles.forEach(tile => {
            const tileKey = `${tile.x},${tile.y}`;
            if (this.gridData[tileKey] === 'road') {
              delete this.gridData[tileKey];
            }
          });
          
          road.graphics.destroy();
          this.roads.splice(i, 1);
          this.updateRoadGraph();
          return;
        }
      }
    }
  }
  
  pointToLineDistance(point, lineStart, lineEnd) {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  updateRoadGraph() {
    // First, detect all road intersections (including mid-road crossings)
    this.detectRoadIntersections();
    
    // Rebuild connections based on actual roads
    this.roadGraph.forEach(node => {
      node.connections = [];
    });
    
    // Build connections for each road, including mid-road intersections
    this.roads.forEach(road => {
      // Find all nodes on this road (start, end, and any mid-road intersections)
      const nodesOnRoad = [];
      
      // Add start node
      const startNode = this.roadGraph.find(n => 
        Math.abs(n.x - road.start.x) < 1 && Math.abs(n.y - road.start.y) < 1
      );
      if (startNode) nodesOnRoad.push({ node: startNode, dist: 0 });
      
      // Add end node
      const endNode = this.roadGraph.find(n => 
        Math.abs(n.x - road.end.x) < 1 && Math.abs(n.y - road.end.y) < 1
      );
      if (endNode) {
        const roadLength = Math.sqrt((road.end.x - road.start.x) ** 2 + (road.end.y - road.start.y) ** 2);
        nodesOnRoad.push({ node: endNode, dist: roadLength });
      }
      
      // Add mid-road intersections
      this.roadGraph.forEach(node => {
        if (node.isMidRoad && node !== startNode && node !== endNode) {
          // Check if this node lies on this road
          const dist = this.pointToLineDistance({ x: node.x, y: node.y }, road.start, road.end);
          if (dist < 2) { // Node is on this road
            // Calculate distance from start
            const dx = node.x - road.start.x;
            const dy = node.y - road.start.y;
            const distFromStart = Math.sqrt(dx * dx + dy * dy);
            nodesOnRoad.push({ node, dist: distFromStart });
          }
        }
      });
      
      // Sort nodes by distance along the road
      nodesOnRoad.sort((a, b) => a.dist - b.dist);
      
      // Connect adjacent nodes
      for (let i = 0; i < nodesOnRoad.length - 1; i++) {
        const node1 = nodesOnRoad[i].node;
        const node2 = nodesOnRoad[i + 1].node;
        const idx1 = this.roadGraph.indexOf(node1);
        const idx2 = this.roadGraph.indexOf(node2);
        
        if (!node1.connections.includes(idx2)) {
          node1.connections.push(idx2);
        }
        if (!node2.connections.includes(idx1)) {
          node2.connections.push(idx1);
        }
      }
    });
    
    // After building connections, draw intersections
    this.drawIntersections();
  }
  
  detectRoadIntersections() {
    // Find all points where roads intersect (including mid-road crossings)
    const intersections = new Set();
    
    // Check every pair of roads for intersections
    for (let i = 0; i < this.roads.length; i++) {
      for (let j = i + 1; j < this.roads.length; j++) {
        const road1 = this.roads[i];
        const road2 = this.roads[j];
        
        const intersection = this.findLineIntersection(
          road1.start, road1.end,
          road2.start, road2.end
        );
        
        if (intersection) {
          const key = `${Math.round(intersection.x)},${Math.round(intersection.y)}`;
          intersections.add(key);
          
          // Add this intersection point to the road graph if it doesn't exist
          const existing = this.roadGraph.find(n => 
            Math.abs(n.x - intersection.x) < 1 && Math.abs(n.y - intersection.y) < 1
          );
          
          if (!existing) {
            this.roadGraph.push({ 
              x: intersection.x, 
              y: intersection.y, 
              connections: [],
              isMidRoad: true // Mark as mid-road intersection
            });
          }
        }
      }
    }
  }
  
  findLineIntersection(p1, p2, p3, p4) {
    // Find intersection point of two line segments
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    
    // Lines are parallel
    if (Math.abs(denom) < 0.001) return null;
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    // Check if intersection is within both line segments
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1)
      };
    }
    
    return null;
  }
  
  drawIntersections() {
    // Clear existing intersection graphics
    if (this.intersectionsLayer) {
      this.intersectionsLayer.removeChildren();
    } else {
      this.intersectionsLayer = new PIXI.Container();
      this.container.addChildAt(this.intersectionsLayer, this.container.getChildIndex(this.roadsLayer) + 1);
    }
    
    // Find nodes with 3+ connections (intersections)
    this.roadGraph.forEach(node => {
      if (node.connections.length >= 3) {
        this.drawIntersection(node);
      }
      
      // Draw crosswalks for nodes with 2+ connections
      if (node.connections.length > 2) {
        this.drawCrosswalks(node);
      }
    });
  }
  
  drawIntersection(node) {
    const graphics = new PIXI.Graphics();
    
    // Draw a square intersection
    const size = 14; // Slightly larger than road width
    graphics.rect(node.x - size / 2, node.y - size / 2, size, size);
    graphics.fill(0x404040); // Same color as roads
    
    // Add a subtle border
    graphics.rect(node.x - size / 2, node.y - size / 2, size, size);
    graphics.stroke({ width: 0.5, color: 0x000000, alpha: 0.3 });
    
    this.intersectionsLayer.addChild(graphics);
  }
  
  drawCrosswalks(node) {
    // Get angles to connected nodes
    const angles = node.connections.map(connIdx => {
      const connNode = this.roadGraph[connIdx];
      return Math.atan2(connNode.y - node.y, connNode.x - node.x);
    });
    
    // Sort angles
    angles.sort((a, b) => a - b);
    
    // Draw crosswalk stripes on each road segment
    angles.forEach(angle => {
      const perpAngle = angle + Math.PI / 2;
      const roadHalfWidth = 6; // Half of road width
      const crosswalkOffset = 10; // Distance from intersection center
      
      // Draw 3 white stripes across the road
      for (let i = 0; i < 3; i++) {
        const stripeOffset = crosswalkOffset + i * 2;
        const stripeLength = roadHalfWidth * 2;
        const stripeWidth = 1;
        
        const graphics = new PIXI.Graphics();
        
        const startX = node.x + Math.cos(angle) * stripeOffset + Math.cos(perpAngle) * (-stripeLength / 2);
        const startY = node.y + Math.sin(angle) * stripeOffset + Math.sin(perpAngle) * (-stripeLength / 2);
        const endX = node.x + Math.cos(angle) * stripeOffset + Math.cos(perpAngle) * (stripeLength / 2);
        const endY = node.y + Math.sin(angle) * stripeOffset + Math.sin(perpAngle) * (stripeLength / 2);
        
        graphics.moveTo(startX, startY);
        graphics.lineTo(endX, endY);
        graphics.stroke({ width: stripeWidth, color: 0xffffff, alpha: 0.8 });
        
        this.intersectionsLayer.addChild(graphics);
      }
    });
  }
  
  setTool(tool) {
    this.currentTool = tool;
  }
  
  setZoneType(type) {
    this.currentZoneType = type;
  }
  
  clearAll() {
    this.roads.forEach(r => r.graphics.destroy());
    this.zones.forEach(z => z.graphics.destroy());
    this.buildings.forEach(b => b.graphics.destroy());
    
    this.roads = [];
    this.zones = [];
    this.buildings = [];
    this.roadGraph = [];
    this.gridData = {};
  }
  
  exportTown() {
    return {
      version: 1,
      gridSize: this.gridSize,
      gridData: this.gridData,
      roads: this.roads.map(r => ({
        start: r.start,
        end: r.end,
        width: r.width
      }))
    };
  }
  
  importTown(data) {
    this.clearAll();
    
    if (data.version === 1) {
      this.gridSize = data.gridSize || 20;
      
      // First, set the zone gridData (without roads)
      this.gridData = { ...data.gridData } || {};
      console.log('Imported gridData:', Object.keys(this.gridData).length, 'tiles');
      console.log('Importing', data.roads?.length || 0, 'roads');
      
      // Recreate roads and mark tiles
      if (data.roads) {
        data.roads.forEach(roadData => {
          // Mark road tiles in gridData
          const tiles = this.getTilesAlongLine(roadData.start, roadData.end);
          tiles.forEach(tile => {
            const key = `${tile.x},${tile.y}`;
            // Only mark as road if not already a zone
            if (!this.gridData[key]) {
              this.gridData[key] = 'road';
            }
          });
          
          const graphics = new PIXI.Graphics();
          graphics.moveTo(roadData.start.x, roadData.start.y);
          graphics.lineTo(roadData.end.x, roadData.end.y);
          graphics.stroke({ width: roadData.width || 8, color: 0x404040 });
          this.roadsLayer.addChild(graphics);
          
          this.roads.push({
            graphics,
            start: roadData.start,
            end: roadData.end,
            width: roadData.width || 8,
            angle: Math.atan2(roadData.end.y - roadData.start.y, roadData.end.x - roadData.start.x)
          });
          
          this.addOrUpdateRoadNode(roadData.start);
          this.addOrUpdateRoadNode(roadData.end);
        });
        
        this.updateRoadGraph();
      }
      
      // Rebuild zones from grid data (excluding roads)
      this.rebuildZonesFromGrid();
    }
  }
  
  loadExample(exampleName) {
    const examples = {
      gridtown: this.createGridTown(),
      riverside: this.createRiverside(),
      suburban: this.createSuburban(),
      downtown: this.createDowntown(),
      village: this.createVillage()
    };
    
    if (examples[exampleName]) {
      this.importTown(examples[exampleName]);
    }
  }
  
  createGridTown() {
    const gridData = {};
    const roads = [];
    const g = this.gridSize;
    
    // Create grid roads (horizontal and vertical)
    for (let x = -200; x <= 200; x += 80) {
      roads.push({
        start: { x, y: -200 },
        end: { x, y: 200 },
        width: 12
      });
    }
    
    for (let y = -200; y <= 200; y += 80) {
      roads.push({
        start: { x: -200, y },
        end: { x: 200, y },
        width: 12
      });
    }
    
    // Mark road tiles in gridData first
    roads.forEach(road => {
      const tiles = this.getTilesAlongLine(road.start, road.end);
      tiles.forEach(tile => {
        gridData[`${tile.x},${tile.y}`] = 'road';
      });
    });
    
    // Fill in zones between roads (avoid road tiles)
    for (let x = -180; x < 200; x += g) {
      for (let y = -180; y < 200; y += g) {
        const key = `${x},${y}`;
        if (gridData[key] === 'road') continue; // Skip road tiles
        
        const blockX = Math.floor((x + 200) / 80);
        const blockY = Math.floor((y + 200) / 80);
        
        let type;
        if ((blockX + blockY) % 4 === 0) type = 'park';
        else if ((blockX + blockY) % 4 === 1) type = 'commercial';
        else if ((blockX + blockY) % 4 === 2) type = 'school';
        else type = 'residential';
        
        // More conservative margins around roads
        const localX = ((x + 200) % 80) + (x < 0 ? 80 : 0);
        const localY = ((y + 200) % 80) + (y < 0 ? 80 : 0);
        
        if (localX > 15 && localX < 65 && localY > 15 && localY < 65) {
          gridData[key] = type;
        }
      }
    }
    
    return { version: 1, gridSize: g, gridData, roads };
  }
  
  createRiverside() {
    const gridData = {};
    const roads = [];
    const g = this.gridSize;
    
    // Main road along river
    roads.push({ start: { x: -300, y: 0 }, end: { x: 300, y: 0 }, width: 12 });
    
    // Cross streets
    for (let x = -240; x <= 240; x += 80) {
      roads.push({ start: { x, y: 0 }, end: { x, y: -200 }, width: 12 });
      roads.push({ start: { x, y: 0 }, end: { x, y: 200 }, width: 12 });
    }
    
    // Mark road tiles first
    roads.forEach(road => {
      const tiles = this.getTilesAlongLine(road.start, road.end);
      tiles.forEach(tile => {
        gridData[`${tile.x},${tile.y}`] = 'road';
      });
    });
    
    // North side - residential (avoid roads)
    for (let x = -280; x < 280; x += g) {
      for (let y = -180; y < -20; y += g) {
        const key = `${x},${y}`;
        if (gridData[key] !== 'road') {
          gridData[key] = 'residential';
        }
      }
    }
    
    // South side - mixed (avoid roads)
    for (let x = -280; x < 280; x += g) {
      for (let y = 20; y < 180; y += g) {
        const key = `${x},${y}`;
        if (gridData[key] !== 'road') {
          const rand = Math.random();
          if (rand < 0.6) gridData[key] = 'residential';
          else if (rand < 0.8) gridData[key] = 'commercial';
          else gridData[key] = 'park';
        }
      }
    }
    
    // Add schools (check for roads)
    const schoolTiles = [['-160,-100'], ['-160,-80'], ['-140,-100'], ['-140,-80']];
    schoolTiles.forEach(tile => {
      if (gridData[tile] !== 'road') {
        gridData[tile] = 'school';
      }
    });
    
    return { version: 1, gridSize: g, gridData, roads };
  }
  
  createSuburban() {
    const gridData = {};
    const roads = [];
    const g = this.gridSize;
    
    // Curved main road
    for (let x = -300; x <= 300; x += 40) {
      const y = Math.sin(x / 100) * 40;
      const nextX = x + 40;
      const nextY = Math.sin(nextX / 100) * 40;
      roads.push({
        start: { x: Math.round(x / g) * g, y: Math.round(y / g) * g },
        end: { x: Math.round(nextX / g) * g, y: Math.round(nextY / g) * g },
        width: 12
      });
    }
    
    // Side streets
    for (let x = -280; x <= 280; x += 100) {
      roads.push({
        start: { x, y: -40 },
        end: { x, y: -200 },
        width: 12
      });
      roads.push({
        start: { x, y: 40 },
        end: { x, y: 200 },
        width: 12
      });
    }
    
    // Mark road tiles first
    roads.forEach(road => {
      const tiles = this.getTilesAlongLine(road.start, road.end);
      tiles.forEach(tile => {
        gridData[`${tile.x},${tile.y}`] = 'road';
      });
    });
    
    // Residential clusters (avoid roads)
    for (let x = -280; x < 280; x += g) {
      for (let y = -200; y < -60; y += g) {
        const key = `${x},${y}`;
        if (gridData[key] !== 'road' && Math.random() < 0.85) {
          gridData[key] = 'residential';
        }
      }
      for (let y = 60; y < 200; y += g) {
        const key = `${x},${y}`;
        if (gridData[key] !== 'road' && Math.random() < 0.85) {
          gridData[key] = 'residential';
        }
      }
    }
    
    // Parks (avoid roads)
    for (let x = -80; x <= 80; x += g) {
      for (let y = -180; y <= -100; y += g) {
        const key = `${x},${y}`;
        if (gridData[key] !== 'road') {
          gridData[key] = 'park';
        }
      }
    }
    
    return { version: 1, gridSize: g, gridData, roads };
  }
  
  createDowntown() {
    const gridData = {};
    const roads = [];
    const g = this.gridSize;
    
    // Dense street grid
    for (let x = -240; x <= 240; x += 60) {
      roads.push({ start: { x, y: -240 }, end: { x, y: 240 }, width: 12 });
    }
    for (let y = -240; y <= 240; y += 60) {
      roads.push({ start: { x: -240, y }, end: { x: 240, y }, width: 12 });
    }
    
    // Mark road tiles first
    roads.forEach(road => {
      const tiles = this.getTilesAlongLine(road.start, road.end);
      tiles.forEach(tile => {
        gridData[`${tile.x},${tile.y}`] = 'road';
      });
    });
    
    // Fill with commercial and some residential (avoid roads)
    for (let x = -220; x < 240; x += g) {
      for (let y = -220; y < 240; y += g) {
        const key = `${x},${y}`;
        if (gridData[key] === 'road') continue; // Skip roads
        
        const distFromCenter = Math.sqrt(x * x + y * y);
        if (distFromCenter < 100) {
          gridData[key] = 'commercial';
        } else if (distFromCenter < 200) {
          gridData[key] = Math.random() < 0.7 ? 'commercial' : 'residential';
        } else {
          gridData[key] = 'residential';
        }
      }
    }
    
    // Central park (avoid roads)
    for (let x = -40; x <= 40; x += g) {
      for (let y = -40; y <= 40; y += g) {
        const key = `${x},${y}`;
        if (gridData[key] !== 'road') {
          gridData[key] = 'park';
        }
      }
    }
    
    return { version: 1, gridSize: g, gridData, roads };
  }
  
  createVillage() {
    const gridData = {};
    const roads = [];
    const g = this.gridSize;
    
    // Circular road
    const radius = 120;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const x1 = Math.cos(angle) * radius;
      const y1 = Math.sin(angle) * radius;
      const x2 = Math.cos(angle + Math.PI / 8) * radius;
      const y2 = Math.sin(angle + Math.PI / 8) * radius;
      roads.push({
        start: { x: Math.round(x1 / g) * g, y: Math.round(y1 / g) * g },
        end: { x: Math.round(x2 / g) * g, y: Math.round(y2 / g) * g },
        width: 12
      });
    }
    
    // Radial roads
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const x1 = Math.cos(angle) * 60;
      const y1 = Math.sin(angle) * 60;
      const x2 = Math.cos(angle) * 200;
      const y2 = Math.sin(angle) * 200;
      roads.push({
        start: { x: Math.round(x1 / g) * g, y: Math.round(y1 / g) * g },
        end: { x: Math.round(x2 / g) * g, y: Math.round(y2 / g) * g },
        width: 12
      });
    }
    
    // Mark road tiles first
    roads.forEach(road => {
      const tiles = this.getTilesAlongLine(road.start, road.end);
      tiles.forEach(tile => {
        gridData[`${tile.x},${tile.y}`] = 'road';
      });
    });
    
    // Center - community (avoid roads)
    for (let x = -40; x <= 40; x += g) {
      for (let y = -40; y <= 40; y += g) {
        if (Math.sqrt(x * x + y * y) < 40) {
          const key = `${x},${y}`;
          if (gridData[key] !== 'road') {
            gridData[key] = 'community';
          }
        }
      }
    }
    
    // Ring of residential (avoid roads)
    for (let x = -180; x <= 180; x += g) {
      for (let y = -180; y <= 180; y += g) {
        const dist = Math.sqrt(x * x + y * y);
        if (dist > 60 && dist < 180) {
          const key = `${x},${y}`;
          if (gridData[key] !== 'road') {
            const rand = Math.random();
            if (rand < 0.75) {
              gridData[key] = 'residential';
            } else if (rand < 0.875) {
              gridData[key] = 'commercial';
            } else {
              gridData[key] = 'park';
            }
          }
        }
      }
    }
    
    return { version: 1, gridSize: g, gridData, roads };
  }
  
  getData() {
    // Create sidewalks for roads
    const sidewalks = [];
    this.roads.forEach(road => {
      const angle = Math.atan2(road.end.y - road.start.y, road.end.x - road.start.x);
      const perpAngle = angle + Math.PI / 2;
      const offset = road.width / 2 + 2;
      
      // Left sidewalk
      sidewalks.push({
        start: {
          x: road.start.x + Math.cos(perpAngle) * offset,
          y: road.start.y + Math.sin(perpAngle) * offset
        },
        end: {
          x: road.end.x + Math.cos(perpAngle) * offset,
          y: road.end.y + Math.sin(perpAngle) * offset
        },
        width: 2
      });
      
      // Right sidewalk
      sidewalks.push({
        start: {
          x: road.start.x - Math.cos(perpAngle) * offset,
          y: road.start.y - Math.sin(perpAngle) * offset
        },
        end: {
          x: road.end.x - Math.cos(perpAngle) * offset,
          y: road.end.y - Math.sin(perpAngle) * offset
        },
        width: 2
      });
    });
    
    // Create parks from park zones
    const parks = this.zones
      .filter(z => z.type === 'park')
      .map(z => ({
        position: { x: z.centerX, y: z.centerY },
        size: Math.min(z.w, z.h) / 2
      }));
    
    return {
      buildings: this.buildings,
      roads: this.roads,
      roadGraph: this.roadGraph,
      zones: this.zones,
      sidewalks: sidewalks,
      crosswalks: [],
      trafficLights: [],
      parks: parks,
      ponds: [],
      parkingLots: [],
      streetlights: []
    };
  }
}
