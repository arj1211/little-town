import * as PIXI from 'pixi.js';

export class PeopleManager {
  constructor(container, townData, timeManager) {
    this.container = container;
    this.townData = townData;
    this.timeManager = timeManager;
    this.people = [];
    
    // Create layer for people
    this.peopleLayer = new PIXI.Container();
    this.container.addChild(this.peopleLayer);
    
    // Build sidewalk graph for pathfinding
    this.buildSidewalkGraph();
    
    this.createPeople();
  }
  
  buildSidewalkGraph() {
    this.sidewalkNodes = [];
    
    this.townData.roadGraph.forEach(intersection => {
      const offset = 5;
      
      this.sidewalkNodes.push(
        { x: intersection.x - offset, y: intersection.y - offset, connections: [] },
        { x: intersection.x + offset, y: intersection.y - offset, connections: [] },
        { x: intersection.x - offset, y: intersection.y + offset, connections: [] },
        { x: intersection.x + offset, y: intersection.y + offset, connections: [] }
      );
    });
    
    // Connect nodes on same sidewalk
    this.sidewalkNodes.forEach((node, i) => {
      this.sidewalkNodes.forEach((other, j) => {
        if (i !== j) {
          const dist = Math.sqrt(
            Math.pow(node.x - other.x, 2) + 
            Math.pow(node.y - other.y, 2)
          );
          if ((dist < 32 && Math.abs(node.x - other.x) < 2) || 
              (dist < 32 && Math.abs(node.y - other.y) < 2)) {
            node.connections.push(j);
          }
        }
      });
    });
  }
  
  createPeople() {
    // Count residential zones to determine number of people (1-4 per residential block)
    const residentialZones = this.townData.zones.filter(z => z.type === 'residential');
    let numPeople = 0;
    
    residentialZones.forEach(zone => {
      // Each zone gets 1-4 people based on its size
      const zoneTiles = zone.tiles ? zone.tiles.length : 1;
      const peoplePerZone = Math.min(4, Math.max(1, Math.floor(zoneTiles / 4) + 1));
      numPeople += peoplePerZone;
    });
    
    // Ensure at least some people exist even if no residential zones
    numPeople = Math.max(10, numPeople);
    
    console.log(`Creating ${numPeople} people for ${residentialZones.length} residential zones`);
    
    for (let i = 0; i < numPeople; i++) {
      this.createPerson(i);
    }
  }
  
  createPerson(id) {
    const personColors = [
      0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf7b731,
      0x5f27cd, 0x00d2d3, 0xff9ff3, 0x54a0ff,
      0x48dbfb, 0xff6348, 0x1dd1a1, 0xfeca57
    ];
    
    // Create simple square sprite for person
    const graphics = new PIXI.Graphics();
    graphics.rect(-0.4, -0.4, 0.8, 0.8);
    graphics.fill(personColors[Math.floor(Math.random() * personColors.length)]);
    
    const role = this.assignRole(id);
    const home = this.pickHome();
    
    if (!home || !home.position) {
      console.warn('No home available for person', id);
      return;
    }
    
    const nearestSidewalk = this.findNearestSidewalkNode(home.position);
    if (!nearestSidewalk) {
      console.warn('No sidewalk found for person', id);
      return;
    }
    
    graphics.x = nearestSidewalk.x;
    graphics.y = nearestSidewalk.y;
    
    this.peopleLayer.addChild(graphics);
    
    const person = {
      id,
      graphics,
      role,
      home,
      workplace: this.pickWorkplace(role),
      speed: 2.5 + Math.random() * 1.5,
      schedule: this.createSchedule(role),
      currentActivity: 'sleeping',
      currentLocation: home,
      targetLocation: null,
      sidewalkPath: [],
      pathIndex: 0,
      activityStartTime: 0
    };
    
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
    const residential = this.townData.buildings.filter(b => b.type === 'residential');
    return residential[Math.floor(Math.random() * residential.length)];
  }
  
  pickWorkplace(role) {
    if (role === 'student') {
      const schools = this.townData.buildings.filter(b => b.type === 'school');
      return schools[Math.floor(Math.random() * schools.length)];
    } else if (role === 'worker') {
      const commercial = this.townData.buildings.filter(b => b.type === 'commercial');
      return commercial[Math.floor(Math.random() * commercial.length)];
    } else {
      const community = this.townData.buildings.filter(b => b.type === 'community');
      if (community.length > 0) {
        return community[0];
      }
    }
    return this.townData.buildings[0];
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
    
    this.people.forEach(person => {
      this.updatePerson(person, currentTime, deltaTime);
    });
  }
  
  updatePerson(person, currentTime, deltaTime) {
    const currentScheduleItem = this.getCurrentScheduleItem(person, currentTime);
    
    if (currentScheduleItem && currentScheduleItem.activity !== person.currentActivity) {
      person.currentActivity = currentScheduleItem.activity;
      person.activityStartTime = currentTime;
      
      const targetLocation = this.getTargetLocation(person, currentScheduleItem.location);
      
      if (targetLocation && targetLocation !== person.currentLocation) {
        person.targetLocation = targetLocation;
        person.sidewalkPath = this.findSidewalkPath(
          { x: person.graphics.x, y: person.graphics.y },
          targetLocation.position
        );
        person.pathIndex = 0;
      } else {
        person.targetLocation = null;
        person.sidewalkPath = [];
      }
    }
    
    // Follow sidewalk path
    if (person.sidewalkPath.length > 0 && person.pathIndex < person.sidewalkPath.length) {
      const target = person.sidewalkPath[person.pathIndex];
      const dx = target.x - person.graphics.x;
      const dy = target.y - person.graphics.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 0.5) {
        person.pathIndex++;
        if (person.pathIndex >= person.sidewalkPath.length) {
          person.currentLocation = person.targetLocation;
          person.targetLocation = null;
        }
      } else {
        const moveDistance = person.speed * deltaTime;
        person.graphics.x += (dx / distance) * moveDistance;
        person.graphics.y += (dy / distance) * moveDistance;
      }
    } else if (person.currentLocation) {
      // Idle - small wander
      const nearestSidewalk = this.findNearestSidewalkNode(person.currentLocation.position);
      const dx = nearestSidewalk.x - person.graphics.x;
      const dy = nearestSidewalk.y - person.graphics.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 3) {
        person.graphics.x += (dx / dist) * deltaTime;
        person.graphics.y += (dy / dist) * deltaTime;
      } else {
        person.graphics.x += (Math.random() - 0.5) * 0.3 * deltaTime;
        person.graphics.y += (Math.random() - 0.5) * 0.3 * deltaTime;
      }
    }
  }
  
  getCurrentScheduleItem(person, currentTime) {
    for (let i = 0; i < person.schedule.length; i++) {
      const item = person.schedule[i];
      const endTime = item.time + item.duration;
      
      if (currentTime >= item.time && currentTime < endTime) {
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
      const commercial = this.townData.buildings.filter(b => b.type === 'commercial');
      return commercial[Math.floor(Math.random() * commercial.length)];
    } else if (locationType === 'park') {
      if (this.townData.parks.length > 0) {
        return this.townData.parks[Math.floor(Math.random() * this.townData.parks.length)];
      }
    } else if (locationType === 'community') {
      const community = this.townData.buildings.filter(b => b.type === 'community');
      if (community.length > 0) {
        return community[Math.floor(Math.random() * community.length)];
      }
    }
    return person.home;
  }
  
  findSidewalkPath(currentPos, targetPos) {
    const startNode = this.findNearestSidewalkNode(currentPos);
    const endNode = this.findNearestSidewalkNode(targetPos);
    
    if (!startNode || !endNode) {
      return [targetPos];
    }
    
    let startIdx = -1, endIdx = -1;
    this.sidewalkNodes.forEach((node, i) => {
      if (node.x === startNode.x && node.y === startNode.y) startIdx = i;
      if (node.x === endNode.x && node.y === endNode.y) endIdx = i;
    });
    
    if (startIdx === -1 || endIdx === -1) {
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
    
    while (openSet.length > 0) {
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
  
  getPeopleCount() {
    return this.people.length;
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
