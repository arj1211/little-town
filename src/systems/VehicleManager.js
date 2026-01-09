import * as PIXI from 'pixi.js';

export class VehicleManager {
  constructor(container, townData, timeManager, peopleManager) {
    this.container = container;
    this.townData = townData;
    this.timeManager = timeManager;
    this.peopleManager = peopleManager;
    this.vehicles = [];
    
    // Create layer for vehicles
    this.vehiclesLayer = new PIXI.Container();
    this.container.addChild(this.vehiclesLayer);
    
    this.createVehicles();
  }
  
  createVehicles() {
    // Scale vehicle count based on number of people (1-4 people per car)
    const numPeople = this.peopleManager ? this.peopleManager.getPeopleCount() : 50;
    const peoplePerCar = 2 + Math.random() * 2; // Average 2-4 people per car
    const numVehicles = Math.max(10, Math.floor(numPeople / peoplePerCar));
    
    console.log(`Creating ${numVehicles} vehicles for ${numPeople} people (ratio: ${peoplePerCar.toFixed(1)} people/car)`);
    
    for (let i = 0; i < numVehicles; i++) {
      this.createVehicle(i);
    }
  }
  
  createVehicle(id) {
    const carColors = [
      0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf7b731,
      0x5f27cd, 0x00d2d3, 0xff9ff3, 0x54a0ff,
      0x48dbfb, 0xff6348, 0x1dd1a1, 0xfeca57,
      0xffffff, 0x333333, 0xee5a6f, 0xc23616
    ];
    
    // Create simple rectangle sprite for car
    const graphics = new PIXI.Graphics();
    graphics.rect(-1, -0.6, 2, 1.2);
    graphics.fill(carColors[Math.floor(Math.random() * carColors.length)]);
    
    // Start at a random road node
    if (this.townData.roadGraph.length === 0) {
      console.warn('No roads available for vehicle', id);
      return;
    }
    
    const startNode = this.townData.roadGraph[Math.floor(Math.random() * this.townData.roadGraph.length)];
    
    graphics.x = startNode.x;
    graphics.y = startNode.y;
    
    this.vehiclesLayer.addChild(graphics);
    
    const vehicle = {
      id,
      graphics,
      speed: 10 + Math.random() * 5,
      currentLocation: { position: { x: startNode.x, y: startNode.y } },
      targetLocation: null,
      roadPath: [],
      pathIndex: 0,
      state: 'parked', // parked, driving
      waitTimer: Math.random() * 5,
      rotation: 0
    };
    
    this.vehicles.push(vehicle);
  }
  
  update(deltaTime) {
    this.vehicles.forEach(vehicle => {
      this.updateVehicle(vehicle, deltaTime);
    });
  }
  
  updateVehicle(vehicle, deltaTime) {
    if (vehicle.state === 'parked') {
      vehicle.waitTimer -= deltaTime;
      
      if (vehicle.waitTimer <= 0) {
        // Pick a new destination (building zone)
        const destinations = this.townData.zones.filter(z => z.type !== 'park');
        if (destinations.length > 0) {
          const targetZone = destinations[Math.floor(Math.random() * destinations.length)];
          
          // Find parking spot at building perimeter near a road
          const parkingSpot = this.findParkingSpot(targetZone);
          
          if (parkingSpot) {
            vehicle.targetLocation = { position: parkingSpot.position };
            vehicle.roadPath = this.findRoadPath(
              vehicle.currentLocation.position, 
              parkingSpot.position,
              parkingSpot.nearestRoadNode
            );
            vehicle.pathIndex = 0;
            vehicle.state = 'driving';
          } else {
            // No parking available, wait longer
            vehicle.waitTimer = 2;
          }
        } else {
          // No buildings, just drive to random road node
          const randomNode = this.townData.roadGraph[Math.floor(Math.random() * this.townData.roadGraph.length)];
          vehicle.targetLocation = { position: { x: randomNode.x, y: randomNode.y } };
          vehicle.roadPath = this.findRoadPath(
            vehicle.currentLocation.position, 
            vehicle.targetLocation.position,
            randomNode
          );
          vehicle.pathIndex = 0;
          vehicle.state = 'driving';
        }
      }
    } else if (vehicle.state === 'driving') {
      if (vehicle.roadPath.length > 0 && vehicle.pathIndex < vehicle.roadPath.length) {
        const target = vehicle.roadPath[vehicle.pathIndex];
        const dx = target.x - vehicle.graphics.x;
        const dy = target.y - vehicle.graphics.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Update rotation to face direction of travel
        vehicle.rotation = Math.atan2(dy, dx);
        vehicle.graphics.rotation = vehicle.rotation;
        
        if (distance < 1) {
          vehicle.pathIndex++;
          if (vehicle.pathIndex >= vehicle.roadPath.length) {
            // Reached destination
            vehicle.currentLocation = vehicle.targetLocation;
            vehicle.targetLocation = null;
            vehicle.state = 'parked';
            vehicle.waitTimer = 3 + Math.random() * 7;
          }
        } else {
          const moveDistance = vehicle.speed * deltaTime;
          
          // Apply right-side offset for North American style driving
          const roadOffset = 2; // Offset to right side of road
          const perpAngle = vehicle.rotation + Math.PI / 2; // Perpendicular to road
          const offsetX = Math.cos(perpAngle) * roadOffset;
          const offsetY = Math.sin(perpAngle) * roadOffset;
          
          vehicle.graphics.x += (dx / distance) * moveDistance;
          vehicle.graphics.y += (dy / distance) * moveDistance;
        }
      } else {
        // No path - go back to parked
        vehicle.state = 'parked';
        vehicle.waitTimer = 3 + Math.random() * 7;
      }
    }
  }
  
  findParkingSpot(zone) {
    // Find nearest roads to this zone
    if (!zone.nearestRoads || zone.nearestRoads.length === 0) {
      return null;
    }
    
    // Use the nearest road connection
    const nearestRoad = zone.nearestRoads[0];
    const roadNode = this.findNearestRoadNode(nearestRoad.connectionPoint);
    
    if (!roadNode) return null;
    
    // Calculate parking position on the zone perimeter near the road
    // Position car slightly off the road, at the zone edge
    const dx = zone.centerX - roadNode.x;
    const dy = zone.centerY - roadNode.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist === 0) return null;
    
    // Move from road toward zone edge
    const parkingDistance = 8; // Distance from road to parking spot
    const parkingX = roadNode.x + (dx / dist) * parkingDistance;
    const parkingY = roadNode.y + (dy / dist) * parkingDistance;
    
    return {
      position: { x: parkingX, y: parkingY },
      nearestRoadNode: roadNode
    };
  }
  
  findRoadPath(startPos, targetPos, targetRoadNode) {
    // Find nearest road nodes
    const startNode = this.findNearestRoadNode(startPos);
    const endNode = targetRoadNode || this.findNearestRoadNode(targetPos);
    
    if (!startNode || !endNode) {
      return [targetPos];
    }
    
    // A* pathfinding on road graph - ONLY use road nodes
    const path = this.aStarRoadPath(startNode, endNode);
    
    // Only add final destination if it's close to a road (parking spot)
    const distToRoad = Math.sqrt(
      Math.pow(targetPos.x - endNode.x, 2) + 
      Math.pow(targetPos.y - endNode.y, 2)
    );
    
    if (distToRoad < 15) {
      // Close enough to add final parking position
      path.push(targetPos);
    }
    
    return path;
  }
  
  findNearestRoadNode(position) {
    let nearest = null;
    let nearestDist = Infinity;
    
    this.townData.roadGraph.forEach(node => {
      const dist = Math.sqrt(
        Math.pow(node.x - position.x, 2) + 
        Math.pow(node.y - position.y, 2)
      );
      
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = node;
      }
    });
    
    return nearest;
  }
  
  aStarRoadPath(startNode, endNode) {
    const openSet = [{ node: startNode, g: 0, f: 0, parent: null }];
    const closedSet = new Set();
    
    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();
      
      if (current.node === endNode) {
        // Reconstruct path
        const path = [];
        let node = current;
        while (node) {
          path.unshift({ x: node.node.x, y: node.node.y });
          node = node.parent;
        }
        return path;
      }
      
      const nodeKey = `${current.node.x},${current.node.y}`;
      closedSet.add(nodeKey);
      
      current.node.connections.forEach(connIdx => {
        const neighbor = this.townData.roadGraph[connIdx];
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        
        if (closedSet.has(neighborKey)) return;
        
        const g = current.g + Math.sqrt(
          Math.pow(neighbor.x - current.node.x, 2) + 
          Math.pow(neighbor.y - current.node.y, 2)
        );
        
        const h = Math.sqrt(
          Math.pow(neighbor.x - endNode.x, 2) + 
          Math.pow(neighbor.y - endNode.y, 2)
        );
        
        const f = g + h;
        
        const existingInOpen = openSet.find(item => item.node === neighbor);
        
        if (!existingInOpen) {
          openSet.push({ node: neighbor, g, f, parent: current });
        } else if (g < existingInOpen.g) {
          existingInOpen.g = g;
          existingInOpen.f = f;
          existingInOpen.parent = current;
        }
      });
    }
    
    return [{ x: endNode.x, y: endNode.y }];
  }
  
  getVehicleCount() {
    return this.vehicles.length;
  }
  
  destroy() {
    this.vehicles.forEach(vehicle => {
      if (vehicle.graphics) {
        vehicle.graphics.destroy();
      }
    });
    this.vehicles = [];
    if (this.vehiclesLayer) {
      this.vehiclesLayer.destroy({ children: true });
    }
  }
}
