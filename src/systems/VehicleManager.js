import * as PIXI from 'pixi.js';

export class VehicleManager {
  constructor(container, model, timeManager, peopleManager) {
    this.container = container;
    this.model = model;
    this.timeManager = timeManager;
    this.peopleManager = peopleManager;
    this.vehicles = [];

    // Create layer for vehicles
    this.vehiclesLayer = new PIXI.Container();
    this.container.addChild(this.vehiclesLayer);

    this.createVehicles();

    this.model.events.on('graphUpdated', () => {
      // If graph changes, respawn vehicles to ensure they are on valid roads
      this.clearVehicles();
      this.createVehicles();
    });
  }

  clearVehicles() {
    this.vehicles.forEach(v => v.graphics.destroy());
    this.vehicles = [];
  }

  createVehicles() {
    // Scale vehicle count based on number of people
    const numPeople = this.peopleManager ? this.peopleManager.getPeopleCount() : 50;
    // User requested 1 car for 1-4 people.
    // Let's aim for 1 car per 2 people (0.5 ratio)
    const numVehicles = Math.max(10, Math.floor(numPeople / 2));

    if (numVehicles > 500) numVehicles = 500; // Cap

    console.log(`Creating ${numVehicles} vehicles`);

    for (let i = 0; i < numVehicles; i++) {
      this.createVehicle(i);
    }
  }

  createVehicle(id) {
    const carColors = [
      0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf7b731, 0x5f27cd, 0x00d2d3
    ];

    const graphics = new PIXI.Graphics();
    // Resized car: Bigger (5x2.5)
    graphics.rect(-2.5, -1.25, 5, 2.5);
    graphics.fill(carColors[Math.floor(Math.random() * carColors.length)]);

    const startNode = this.getRandomRoadNode();
    if (!startNode) return;

    graphics.x = startNode.x;
    graphics.y = startNode.y;

    this.vehiclesLayer.addChild(graphics);

    const vehicle = {
      id,
      graphics,
      baseSpeed: 15 + Math.random() * 10,
      currentLocation: { position: { x: startNode.x, y: startNode.y } },
      targetLocation: null,
      roadPath: [],
      pathIndex: 0,
      state: 'parked',
      waitTimer: Math.random() * 5,
      stopSignTimer: 0,
      lastStoppedNodeId: -1,
      rotation: 0
    };

    this.vehicles.push(vehicle);
  }

  getRandomRoadNode() {
    const graph = this.model.roadGraph;
    if (!graph || graph.length === 0) return null;
    return graph[Math.floor(Math.random() * graph.length)];
  }

  update(deltaTime) {
    const speedScale = Math.max(1, this.timeManager.timeScale / 60);

    this.vehicles.forEach(vehicle => {
      this.updateVehicle(vehicle, deltaTime, speedScale);
    });
  }

  updateVehicle(vehicle, deltaTime, speedScale) {
    if (vehicle.state === 'parked') {
      vehicle.waitTimer -= deltaTime;

      if (vehicle.waitTimer <= 0) {
        this.pickNewDestination(vehicle);
      }
    } else if (vehicle.state === 'driving') {

      if (vehicle.roadPath.length > 0 && vehicle.pathIndex < vehicle.roadPath.length) {
        const target = vehicle.roadPath[vehicle.pathIndex];
        const dx = target.x - vehicle.currentLocation.position.x;
        const dy = target.y - vehicle.currentLocation.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Face direction
        vehicle.rotation = Math.atan2(dy, dx);
        vehicle.graphics.rotation = vehicle.rotation;

        let currentSpeed = vehicle.baseSpeed * speedScale;

        // --- Traffic Logic ---
        // Determine if we are approaching an intersection
        if (distance < 25) { // Increased distance check for smoother stopping
          const approachingNode = this.findNearestRoadNode(target);

          if (approachingNode) {
            // Determine Approach Axis (Horizontal vs Vertical)
            // Cos is X-component. If |Cos| > |Sin|, we are moving horizontally.
            const isHorizontal = Math.abs(Math.cos(vehicle.rotation)) > Math.abs(Math.sin(vehicle.rotation));

            const time = this.timeManager.getTimeOfDay() * 3600;
            const cycleLength = 120;
            const offset = (approachingNode.id * 17) % cycleLength;
            const localTime = (time + offset) % cycleLength;

            const isTrafficLight = approachingNode.connections.length >= 4;
            const isStopSign = approachingNode.connections.length === 3;

            // 1. Traffic Lights
            if (isTrafficLight) {
              // Cycle: 0-50 Vert Green, 60-110 Horz Green.
              // Safety buffer 5s (Yellow/Red)
              let isGreen = false;
              if (isHorizontal) {
                if (localTime >= 60 && localTime < 110) isGreen = true;
              } else {
                if (localTime < 50) isGreen = true;
              }

              // Stop if Red/Yellow
              // Allow approaching until distance < 12. 
              // Allow clearing if distance < 4.
              if (!isGreen && distance < 12 && distance > 4) {
                currentSpeed = 0;
              }
            }
            // 2. Stop Signs
            else if (isStopSign) {
              // Stop if we haven't stopped yet, and we are at the line (dist < 12)
              // But not if we are leaving (dist < 4)
              if (vehicle.lastStoppedNodeId !== approachingNode.id && distance < 12 && distance > 4) {
                // Stop logic
                currentSpeed = 0;
                if (vehicle.stopSignTimer <= 0) {
                  vehicle.stopSignTimer = 1.5; // Stop for 1.5 seconds
                }
                vehicle.stopSignTimer -= deltaTime;
                if (vehicle.stopSignTimer <= 0) {
                  vehicle.lastStoppedNodeId = approachingNode.id;
                  currentSpeed = vehicle.baseSpeed * speedScale; // Go
                }
              }
            }

            // 3. Yield to Pedestrians (Crosswalks)
            // Stop if at line (distance < 14) and people are there
            if (currentSpeed > 0 && distance < 14 && distance > 4) {
              // Check if any person is in the intersection area
              const people = this.peopleManager.people;
              // Only check if we are close enough to care
              if (people && people.length > 0) {
                for (let i = 0; i < people.length; i++) {
                  const p = people[i];
                  if (!p.currentLocation) continue;
                  const pdx = p.currentLocation.position.x - approachingNode.x;
                  const pdy = p.currentLocation.position.y - approachingNode.y;
                  const pDistSq = pdx * pdx + pdy * pdy;

                  // If person is within 15px of intersection center (covers crosswalks)
                  if (pDistSq < 225) {
                    currentSpeed = 0; // Yield
                    break;
                  }
                }
              }
            }
          }
        } else {
          // Reset stop sign memory when far away
          vehicle.lastStoppedNodeId = -1;
          vehicle.stopSignTimer = 0;
        }

        const effectiveSpeed = currentSpeed;
        const step = effectiveSpeed * deltaTime;

        if (distance < step * 1.5) {
          vehicle.pathIndex++;
          // Snap strictly
          vehicle.currentLocation.position.x = target.x;
          vehicle.currentLocation.position.y = target.y;
          vehicle.graphics.x = target.x;
          vehicle.graphics.y = target.y;

          if (vehicle.pathIndex >= vehicle.roadPath.length) {
            vehicle.currentLocation.position = vehicle.targetLocation.position;
            vehicle.targetLocation = null;
            vehicle.state = 'parked';
            vehicle.waitTimer = 3 + Math.random() * 7;
          }
        } else {
          // Offset to right side of road
          const roadOffset = 2;
          const perpAngle = vehicle.rotation + Math.PI / 2;
          const offsetX = Math.cos(perpAngle) * roadOffset;
          const offsetY = Math.sin(perpAngle) * roadOffset;

          // Move towards target
          vehicle.currentLocation.position.x += (dx / distance) * step;
          vehicle.currentLocation.position.y += (dy / distance) * step;

          vehicle.graphics.x = vehicle.currentLocation.position.x + offsetX;
          vehicle.graphics.y = vehicle.currentLocation.position.y + offsetY;
        }
      } else {
        // Arrived at destination or invalid path
        vehicle.state = 'parked';
        vehicle.graphics.visible = false;
        vehicle.waitTimer = 3 + Math.random() * 5;
      }
    }
  }

  pickNewDestination(vehicle) {
    const zones = this.model.zones;
    let targetPos, targetNode;

    if (zones.length > 0 && Math.random() > 0.3) {
      const z = zones[Math.floor(Math.random() * zones.length)];
      // Find road near zone
      const roadNode = this.findNearestRoadNode({ x: z.centerX, y: z.centerY });
      if (roadNode) {
        targetPos = { x: roadNode.x, y: roadNode.y }; // Drive to road node near zone
        targetNode = roadNode;
      }
    }

    if (!targetPos) {
      // Random node
      targetNode = this.getRandomRoadNode();
      if (targetNode) targetPos = { x: targetNode.x, y: targetNode.y };
    }

    if (targetPos && targetNode) {
      vehicle.targetLocation = { position: targetPos };
      vehicle.roadPath = this.findRoadPath(vehicle.currentLocation.position, targetPos, targetNode);
      vehicle.pathIndex = 0;
      vehicle.state = 'driving';
      vehicle.graphics.visible = true; // Show car when driving
      vehicle.graphics.x = vehicle.currentLocation.position.x;
      vehicle.graphics.y = vehicle.currentLocation.position.y;
    } else {
      vehicle.waitTimer = 2;
    }
  }

  findParkingSpot(zone) {
    // Deprecated, simplified above
    return null;
  }

  findRoadPath(startPos, targetPos, targetRoadNode) {
    const startNode = this.findNearestRoadNode(startPos);
    const endNode = targetRoadNode || this.findNearestRoadNode(targetPos);

    if (!startNode || !endNode) return [targetPos];

    const path = this.aStarRoadPath(startNode, endNode);
    // path includes start? typically A* returns path from start to end.
    // push targetPos
    path.push(targetPos);
    return path;
  }

  findNearestRoadNode(position) {
    let nearest = null;
    let nearestDist = Infinity;
    const graph = this.model.roadGraph;
    if (!graph) return null;

    graph.forEach(node => {
      const dist = (node.x - position.x) ** 2 + (node.y - position.y) ** 2;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = node;
      }
    });
    return nearest;
  }

  aStarRoadPath(startNode, endNode) {
    // Indexes
    const graph = this.model.roadGraph;
    // IDs in graph should match index if we built it that way, but safety first:
    // startNode is an object from graph.

    if (startNode === endNode) return [endNode];

    const openSet = [{ node: startNode, g: 0, f: 0, parent: null }];
    const closedSet = new Set();
    const limit = 500;
    let steps = 0;

    while (openSet.length > 0 && steps++ < limit) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();

      if (current.node === endNode) {
        // ... (return path)
        const path = [];
        let node = current;
        while (node) {
          path.unshift({ x: node.node.x, y: node.node.y });
          node = node.parent;
        }
        return path;
      }

      closedSet.add(current.node.id);

      // ... (rest of loop)
      current.node.connections.forEach(connId => {
        if (closedSet.has(connId)) return;

        const neighbor = graph[connId];
        if (!neighbor) {
          console.warn(`Invalid road connection: ${connId} from ${current.node.id}`);
          return;
        }

        const g = current.g + Math.sqrt((neighbor.x - current.node.x) ** 2 + (neighbor.y - current.node.y) ** 2);
        const h = Math.sqrt((neighbor.x - endNode.x) ** 2 + (neighbor.y - endNode.y) ** 2);

        const existing = openSet.find(item => item.node === neighbor);
        if (!existing) {
          openSet.push({ node: neighbor, g, f: g + h, parent: current });
        } else if (g < existing.g) {
          existing.g = g; existing.f = g + h; existing.parent = current;
        }
      });
    }

    if (steps >= limit) {
      console.warn('Vehicle pathfinding hit limit', startNode, endNode);
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
