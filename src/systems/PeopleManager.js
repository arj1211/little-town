import * as PIXI from 'pixi.js';

export class PeopleManager {
  constructor(container, model, timeManager) {
    this.container = container;
    this.model = model; // Use model directly for fresh data
    this.timeManager = timeManager;
    this.people = [];

    // Create layer for people
    this.peopleLayer = new PIXI.Container();
    this.container.addChild(this.peopleLayer);

    // Build sidewalk graph for pathfinding
    this.buildSidewalkGraph();

    this.createPeople();

    this.model.events.on('zonesUpdated', () => {
      this.clearPeople();
      this.createPeople();
    });

    this.model.events.on('graphUpdated', () => {
      this.buildSidewalkGraph();
    });
  }

  clearPeople() {
    this.people.forEach(p => { if (p.graphics) p.graphics.destroy(); });
    this.people = [];
  }

  buildSidewalkGraph() {
    this.sidewalkNodes = [];
    const intersectionMap = new Map();

    // 1. Create Nodes
    this.model.roadGraph.forEach((intersection, i) => {
      const offset = 6;
      const baseIdx = this.sidewalkNodes.length;

      this.sidewalkNodes.push(
        { idx: baseIdx, x: intersection.x - offset, y: intersection.y - offset, connections: [] }, // 0: TL
        { idx: baseIdx + 1, x: intersection.x + offset, y: intersection.y - offset, connections: [] }, // 1: TR
        { idx: baseIdx + 2, x: intersection.x - offset, y: intersection.y + offset, connections: [] }, // 2: BL
        { idx: baseIdx + 3, x: intersection.x + offset, y: intersection.y + offset, connections: [] }  // 3: BR
      );

      intersectionMap.set(intersection.id, [baseIdx, baseIdx + 1, baseIdx + 2, baseIdx + 3]);
    });

    // 2. Connect Nodes
    // A. Internal connections (Crosswalks)
    for (const [id, indices] of intersectionMap) {
      this.connectNodes(indices[0], indices[1]);
      this.connectNodes(indices[1], indices[3]);
      this.connectNodes(indices[3], indices[2]);
      this.connectNodes(indices[2], indices[0]);
    }

    // B. External connections (Roads)
    this.model.roadGraph.forEach((nodeA) => {
      if (!nodeA.connections) return;

      const indicesA = intersectionMap.get(nodeA.id);
      if (!indicesA) return;

      nodeA.connections.forEach(connId => {
        if (nodeA.id < connId) {
          const nodeB = this.model.roadGraph[connId];
          if (!nodeB) return;

          const indicesB = intersectionMap.get(connId);
          if (!indicesB) return;

          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;

          if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal Road
            if (dx > 0) {
              this.connectNodes(indicesA[1], indicesB[0]); // TR-TL
              this.connectNodes(indicesA[3], indicesB[2]); // BR-BL
            } else {
              this.connectNodes(indicesA[0], indicesB[1]); // TL-TR
              this.connectNodes(indicesA[2], indicesB[3]); // BL-BR
            }
          } else {
            // Vertical Road
            if (dy > 0) {
              this.connectNodes(indicesA[2], indicesB[0]); // BL-TL
              this.connectNodes(indicesA[3], indicesB[1]); // BR-TR
            } else {
              this.connectNodes(indicesA[0], indicesB[2]); // TL-BL
              this.connectNodes(indicesA[1], indicesB[3]); // TR-BR
            }
          }
        }
      });
    });
  }

  connectNodes(idx1, idx2) {
    if (idx1 === undefined || idx2 === undefined) return;
    const n1 = this.sidewalkNodes[idx1];
    const n2 = this.sidewalkNodes[idx2];
    if (!n1.connections.includes(idx2)) n1.connections.push(idx2);
    if (!n2.connections.includes(idx1)) n2.connections.push(idx1);
  }

  createPeople() {
    const zones = this.model.zones;
    const residentialZones = zones.filter(z => z.type === 'residential');
    let numPeople = 0;

    residentialZones.forEach(zone => {
      // High density: 4 people per grid tile
      const widthTiles = Math.round(zone.w / this.model.gridSize);
      const heightTiles = Math.round(zone.h / this.model.gridSize);
      const tilesCount = widthTiles * heightTiles * 0.8; // Approximate walkable area

      const peoplePerZone = Math.max(1, Math.floor(tilesCount * 4));
      numPeople += peoplePerZone;
    });

    // Safety caps
    if (isNaN(numPeople)) numPeople = 0;
    if (numPeople > 500) numPeople = 500; // Hard cap
    if (numPeople < 20) numPeople = 20;

    console.log(`Creating ${numPeople} people`);

    for (let i = 0; i < numPeople; i++) {
      this.createPerson(i);
    }
  }

  getPeopleCount() {
    return this.people.length;
  }

  createPerson(id) {
    const personColors = [
      0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf7b731,
      0x5f27cd, 0x00d2d3, 0xff9ff3, 0x54a0ff,
      0x48dbfb, 0xff6348, 0x1dd1a1, 0xfeca57
    ];

    // Create simple square sprite for person
    const graphics = new PIXI.Graphics();
    graphics.rect(-2, -2, 4, 4); // Larger size (4x4)
    graphics.fill(personColors[Math.floor(Math.random() * personColors.length)]);

    const role = this.assignRole(id);
    const home = this.pickHome();

    if (!home) {
      // Fallback
      graphics.x = 0; graphics.y = 0;
    }

    // ... rest of setup ...
    this.peopleLayer.addChild(graphics);

    const person = {
      id,
      graphics,
      role,
      home,
      workplace: this.pickWorkplace(role),
      baseSpeed: 3.0 + Math.random() * 2.0, // Base speed
      schedule: this.createSchedule(role),
      scheduleOffset: (Math.random() * 1.0) - 0.5, // Random shift +/- 30m
      currentActivity: 'sleeping',
      currentLocation: home ? { position: { x: home.centerX, y: home.centerY } } : { position: { x: 0, y: 0 } }, // Use center
      targetLocation: null,
      sidewalkPath: [],
      pathIndex: 0,
      activityStartTime: 0
    };

    if (home) {
      // Place initial visual at home
      graphics.x = home.centerX;
      graphics.y = home.centerY;
    }

    this.people.push(person);
  }

  assignRole(id) {
    const rand = Math.random();
    if (rand < 0.15) return 'student';
    if (rand < 0.65) return 'worker';
    if (rand < 0.80) return 'retired';
    return 'homemaker';
  }

  pickHome() {
    const residential = this.model.zones.filter(z => z.type === 'residential');
    if (residential.length === 0) return null;
    return residential[Math.floor(Math.random() * residential.length)];
  }

  pickWorkplace(role) {
    const zones = this.model.zones;
    if (role === 'student') {
      const schools = zones.filter(z => z.type === 'school');
      if (schools.length > 0) return schools[Math.floor(Math.random() * schools.length)];
    } else if (role === 'worker') {
      const commercial = zones.filter(z => z.type === 'commercial');
      if (commercial.length > 0) return commercial[Math.floor(Math.random() * commercial.length)];
    }
    // Fallback workplace is random zone
    return zones.length > 0 ? zones[Math.floor(Math.random() * zones.length)] : null;
  }

  createSchedule(role) {
    if (role === 'student') {
      return [
        { time: 0, duration: 7, activity: 'sleeping', location: 'home' },
        { time: 7, duration: 0.5, activity: 'breakfast', location: 'home' },
        { time: 7.5, duration: 6, activity: 'school', location: 'workplace' },
        { time: 13.5, duration: 0.5, activity: 'lunch', location: 'commercial' },
        { time: 14, duration: 2, activity: 'school', location: 'workplace' },
        { time: 16, duration: 2, activity: 'park', location: 'park' },
        { time: 18, duration: 1, activity: 'dinner', location: 'home' },
        { time: 19, duration: 3, activity: 'leisure', location: 'home' },
        { time: 22, duration: 2, activity: 'sleeping', location: 'home' }
      ];
    } else if (role === 'worker') {
      return [
        { time: 0, duration: 6.5, activity: 'sleeping', location: 'home' },
        { time: 6.5, duration: 0.5, activity: 'breakfast', location: 'home' },
        { time: 7, duration: 1, activity: 'commute', location: 'workplace' },
        { time: 8, duration: 4, activity: 'work', location: 'workplace' },
        { time: 12, duration: 1, activity: 'lunch', location: 'commercial' },
        { time: 13, duration: 5, activity: 'work', location: 'workplace' },
        { time: 18, duration: 1, activity: 'commute', location: 'home' },
        { time: 19, duration: 1, activity: 'dinner', location: 'home' },
        { time: 20, duration: 2, activity: 'leisure', location: 'community' },
        { time: 22, duration: 2, activity: 'sleeping', location: 'home' }
      ];
    } else if (role === 'retired') {
      return [
        { time: 0, duration: 7, activity: 'sleeping', location: 'home' },
        { time: 7, duration: 1, activity: 'breakfast', location: 'home' },
        { time: 8, duration: 2, activity: 'walk', location: 'park' },
        { time: 10, duration: 2, activity: 'community', location: 'community' },
        { time: 12, duration: 1, activity: 'lunch', location: 'commercial' },
        { time: 13, duration: 3, activity: 'leisure', location: 'home' },
        { time: 16, duration: 2, activity: 'park', location: 'park' },
        { time: 18, duration: 1, activity: 'dinner', location: 'home' },
        { time: 19, duration: 3, activity: 'relax', location: 'home' },
        { time: 22, duration: 2, activity: 'sleeping', location: 'home' }
      ];
    } else {
      return [
        { time: 0, duration: 6, activity: 'sleeping', location: 'home' },
        { time: 6, duration: 2, activity: 'chores', location: 'home' },
        { time: 8, duration: 2, activity: 'shopping', location: 'commercial' },
        { time: 10, duration: 2, activity: 'community', location: 'community' },
        { time: 12, duration: 1, activity: 'lunch', location: 'home' },
        { time: 13, duration: 3, activity: 'park', location: 'park' },
        { time: 16, duration: 2, activity: 'shopping', location: 'commercial' },
        { time: 18, duration: 1, activity: 'dinner', location: 'home' },
        { time: 19, duration: 3, activity: 'relax', location: 'home' },
        { time: 22, duration: 2, activity: 'sleeping', location: 'home' }
      ];
    }
  }

  update(deltaTime) {
    const currentTime = this.timeManager.getTimeOfDay();
    const speedScale = Math.max(1, this.timeManager.timeScale / 60);

    this.people.forEach(person => {
      this.updatePerson(person, currentTime, deltaTime, speedScale);
    });
  }

  updatePerson(person, currentTime, deltaTime, speedScale = 1) {
    const currentScheduleItem = this.getCurrentScheduleItem(person, currentTime);

    // If we have a valid schedule but no current activity, or activity changed
    if (currentScheduleItem && (!person.currentActivity || currentScheduleItem.activity !== person.currentActivity)) {
      person.currentActivity = currentScheduleItem.activity;
      person.activityStartTime = currentTime;

      const targetEntity = this.getTargetLocation(person, currentScheduleItem.location);

      if (targetEntity) {
        // Extract position safely (Zones have centerX/centerY)
        const tx = targetEntity.centerX !== undefined ? targetEntity.centerX : (targetEntity.position ? targetEntity.position.x : 0);
        const ty = targetEntity.centerY !== undefined ? targetEntity.centerY : (targetEntity.position ? targetEntity.position.y : 0);
        const targetPos = { x: tx, y: ty };

        // If target is diff from current, move
        // Check distance to avoid re-pathing if effectively there
        const dist = Math.sqrt((tx - person.graphics.x) ** 2 + (ty - person.graphics.y) ** 2);

        if (dist > 10) {
          person.targetLocation = { position: targetPos, entity: targetEntity };
          person.sidewalkPath = this.findSidewalkPath(
            { x: person.graphics.x, y: person.graphics.y },
            targetPos
          );
          person.pathIndex = 0;
        }
      }
    }

    const effectiveSpeed = (person.baseSpeed || 3) * speedScale;

    // Follow sidewalk path
    if (person.sidewalkPath.length > 0 && person.pathIndex < person.sidewalkPath.length) {
      const target = person.sidewalkPath[person.pathIndex];
      const dx = target.x - person.graphics.x;
      const dy = target.y - person.graphics.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < effectiveSpeed * deltaTime * 1.5) {
        person.pathIndex++;
        if (person.pathIndex >= person.sidewalkPath.length) {
          person.currentLocation = person.targetLocation;
          person.targetLocation = null;
        }
      } else {
        const moveDistance = effectiveSpeed * deltaTime;
        person.graphics.x += (dx / distance) * moveDistance;
        person.graphics.y += (dy / distance) * moveDistance;
        person.currentLocation = { position: { x: person.graphics.x, y: person.graphics.y } };
      }
    } else if (person.currentLocation) {
      // Idle wander logic simplified
    }
  }

  getCurrentScheduleItem(person, currentTime) {
    let effectiveTime = currentTime - (person.scheduleOffset || 0);
    if (effectiveTime < 0) effectiveTime += 24;
    if (effectiveTime >= 24) effectiveTime -= 24;

    for (let i = 0; i < person.schedule.length; i++) {
      const item = person.schedule[i];
      const endTime = item.time + item.duration;

      if (effectiveTime >= item.time && effectiveTime < endTime) {
        return item;
      }
    }
    return person.schedule[0];
  }

  getTargetLocation(person, locationType) {
    if (locationType === 'home') {
      return person.home;
    } else if (locationType === 'workplace') {
      return person.workplace;
    } else if (locationType === 'commercial') {
      const commercial = this.model.zones.filter(z => z.type === 'commercial');
      return commercial.length > 0 ? commercial[Math.floor(Math.random() * commercial.length)] : person.home;
    } else if (locationType === 'park') {
      const parks = this.model.zones.filter(z => z.type === 'park');
      return parks.length > 0 ? parks[Math.floor(Math.random() * parks.length)] : person.home;
    } else if (locationType === 'community') {
      const community = this.model.zones.filter(z => z.type === 'community');
      return community.length > 0 ? community[Math.floor(Math.random() * community.length)] : person.home;
    }
    return person.home;
  }

  findSidewalkPath(currentPos, targetPos) {
    const startNode = this.findNearestSidewalkNode(currentPos);
    const endNode = this.findNearestSidewalkNode(targetPos);

    if (!startNode || !endNode) {
      return [targetPos];
    }

    const startIdx = startNode.idx;
    const endIdx = endNode.idx;

    if (startIdx === undefined || endIdx === undefined) {
      return [targetPos];
    }

    const path = this.aStarSidewalkPath(startIdx, endIdx);
    path.push(targetPos);

    return path;
  }

  findNearestSidewalkNode(position) {
    let nearest = null;
    let nearestDist = Infinity;

    this.sidewalkNodes.forEach(node => {
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

  aStarSidewalkPath(startIdx, endIdx) {
    const openSet = [{ idx: startIdx, g: 0, f: 0, parent: null }];
    const closedSet = new Set();
    const endNode = this.sidewalkNodes[endIdx];

    // Safety break to prevent freezes
    let steps = 0;
    const maxSteps = 1000;

    while (openSet.length > 0) {
      if (steps++ > maxSteps) return [{ x: endNode.x, y: endNode.y }]; // Give up

      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift();

      if (current.idx === endIdx) {
        const path = [];
        let node = current;
        while (node) {
          const sidewalkNode = this.sidewalkNodes[node.idx];
          path.unshift({ x: sidewalkNode.x, y: sidewalkNode.y });
          node = node.parent;
        }
        return path;
      }

      closedSet.add(current.idx);

      const currentNode = this.sidewalkNodes[current.idx];

      currentNode.connections.forEach(connIdx => {
        if (closedSet.has(connIdx)) return;

        const neighbor = this.sidewalkNodes[connIdx];

        const g = current.g + Math.sqrt(
          Math.pow(neighbor.x - currentNode.x, 2) +
          Math.pow(neighbor.y - currentNode.y, 2)
        );

        const h = Math.sqrt(
          Math.pow(neighbor.x - endNode.x, 2) +
          Math.pow(neighbor.y - endNode.y, 2)
        );

        const f = g + h;

        const existingInOpen = openSet.find(item => item.idx === connIdx);

        if (!existingInOpen) {
          openSet.push({ idx: connIdx, g, f, parent: current });
        } else if (g < existingInOpen.g) {
          existingInOpen.g = g;
          existingInOpen.f = f;
          existingInOpen.parent = current;
        }
      });
    }

    return [{ x: endNode.x, y: endNode.y }];
  }

  destroy() {
    this.people.forEach(person => {
      if (person.graphics) {
        person.graphics.destroy();
      }
    });
    this.people = [];
    if (this.peopleLayer) {
      this.peopleLayer.destroy({ children: true });
    }
  }
}
