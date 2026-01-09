import { EventBus } from '../core/EventBus.js';
import { GridUtils } from '../core/GridUtils.js';
import { TownExamples } from './TownExamples.js';

export class TownModel {
    constructor(gridSize = 20) {
        this.events = new EventBus();
        this.gridSize = gridSize;

        // Data structures
        this.gridData = {}; // key: "x,y", value: type (string)
        this.roads = []; // Array of road segments {start, end, width}
        this.roadGraph = []; // Graph nodes for pathfinding
        this.zones = []; // Consolidated zone regions
        this.buildings = []; // Buildings (virtual)
    }

    loadExample() {
        TownExamples.loadGridCity(this);
    }

    snapToGrid(pos) {
        return {
            x: Math.round(pos.x / this.gridSize) * this.gridSize,
            y: Math.round(pos.y / this.gridSize) * this.gridSize
        };
    }

    getTileType(x, y) {
        return this.gridData[`${x},${y}`];
    }

    setTileType(x, y, type) {
        const key = `${x},${y}`;
        if (type === null) {
            delete this.gridData[key];
        } else {
            this.gridData[key] = type;
        }
    }

    // --- Actions ---

    addRoad(start, end, skipGraphUpdate = false) {
        const gridStart = this.snapToGrid(start);
        const gridEnd = this.snapToGrid(end);

        // Validate: Accessing visual logic? No, accessing grid logic
        const tilesOnRoad = this.getTilesAlongLine(gridStart, gridEnd);
        for (const tile of tilesOnRoad) {
            const type = this.getTileType(tile.x, tile.y);
            if (type && type !== 'road') {
                // Return null if failed, but don't crash
                console.warn('Cannot place road through zones', tile);
                return null;
            }
        }

        // Snap to nearby endpoints
        const snapDistance = this.gridSize;
        // We modify local vars, but we need final coordinates for storage
        const snappedStart = this.snapToNearbyPoint(gridStart, snapDistance);
        const snappedEnd = this.snapToNearbyPoint(gridEnd, snapDistance);

        // Mark tiles (re-calculate tiles based on snapped coords)
        // Note: getTilesAlongLine might differ slightly if start/end shifted
        const finalTiles = this.getTilesAlongLine(snappedStart, snappedEnd);
        finalTiles.forEach(tile => this.setTileType(tile.x, tile.y, 'road'));

        const newRoad = {
            start: snappedStart,
            end: snappedEnd,
            width: 12,
            id: Math.random().toString(36).substr(2, 9)
        };

        this.roads.push(newRoad);

        // Update graph
        if (!skipGraphUpdate) {
            this.updateRoadGraph();
        }

        this.events.emit('roadAdded', newRoad);
        return newRoad;
    }

    addZone(pos, type) {
        const snapped = this.snapToGrid(pos);
        const current = this.getTileType(snapped.x, snapped.y);

        if (current === 'road') return; // Cannot overwrite road

        this.setTileType(snapped.x, snapped.y, type);

        // Rebuild zones
        this.rebuildZones();
    }

    removeAt(pos) {
        const snapped = this.snapToGrid(pos);
        const type = this.getTileType(snapped.x, snapped.y);

        if (!type) return;

        if (type === 'road') {
            // Find road segment
            const roadIndex = this.findRoadIndexAt(pos);
            if (roadIndex !== -1) {
                const road = this.roads[roadIndex];
                this.roads.splice(roadIndex, 1);

                // Clear tiles
                const tiles = this.getTilesAlongLine(road.start, road.end);
                tiles.forEach(t => this.setTileType(t.x, t.y, null));

                this.updateRoadGraph();
                this.events.emit('roadRemoved', road);
            }
        } else {
            // Zone
            this.setTileType(snapped.x, snapped.y, null);
            this.rebuildZones();
        }
    }

    // --- Helpers (Ported from TownEditor) ---

    findRoadIndexAt(pos) {
        for (let i = 0; i < this.roads.length; i++) {
            const road = this.roads[i];
            const dist = this.pointToLineDistance(pos, road.start, road.end);
            if (dist < 10) return i;
        }
        return -1;
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

    getTilesAlongLine(start, end) {
        return GridUtils.getTilesAlongLine(start, end, this.gridSize);
    }

    updateRoadGraph() {
        // Clear graph
        this.roadGraph = [];
        if (this.roads.length === 0) {
            this.events.emit('graphUpdated', this.roadGraph);
            return;
        }

        // 1. Identification of all potential nodes (Endpoints + Intersections)
        let points = [];

        // Add all endpoints
        this.roads.forEach(road => {
            points.push({ x: road.start.x, y: road.start.y });
            points.push({ x: road.end.x, y: road.end.y });
        });

        // Add intersections
        for (let i = 0; i < this.roads.length; i++) {
            for (let j = i + 1; j < this.roads.length; j++) {
                const intersect = this.getLineIntersection(
                    this.roads[i].start, this.roads[i].end,
                    this.roads[j].start, this.roads[j].end
                );
                if (intersect) {
                    points.push(intersect);
                }
            }
        }

        // 2. Filter unique nodes (merge close points)
        const uniquePoints = [];
        const threshold = 1.0; // 1 pixel tolerance

        points.forEach(p => {
            const exists = uniquePoints.find(up =>
                Math.abs(up.x - p.x) < threshold && Math.abs(up.y - p.y) < threshold
            );
            if (!exists) {
                uniquePoints.push({ x: p.x, y: p.y, connections: [], id: uniquePoints.length });
            }
        });

        this.roadGraph = uniquePoints;

        // 3. Connect nodes based on roads
        this.roads.forEach(road => {
            // Find all nodes that lie on this road segment
            const nodesOnRoad = this.roadGraph.filter(node =>
                this.isPointOnSegment(node, road.start, road.end)
            );

            // Sort nodes by distance from road start
            nodesOnRoad.sort((a, b) => {
                const distA = (a.x - road.start.x) ** 2 + (a.y - road.start.y) ** 2;
                const distB = (b.x - road.start.x) ** 2 + (b.y - road.start.y) ** 2;
                return distA - distB;
            });

            // Connect adjacent nodes
            for (let i = 0; i < nodesOnRoad.length - 1; i++) {
                const nodeA = nodesOnRoad[i];
                const nodeB = nodesOnRoad[i + 1];

                // Add connection if not already there
                if (!nodeA.connections.includes(nodeB.id)) nodeA.connections.push(nodeB.id);
                if (!nodeB.connections.includes(nodeA.id)) nodeB.connections.push(nodeA.id);
            }
        });

        this.events.emit('graphUpdated', this.roadGraph);
    }

    getLineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;

        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) return null;

        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

        // Use epsilon to include endpoints but handle precision
        const eps = 0.001;
        if (ua >= -eps && ua <= 1 + eps && ub >= -eps && ub <= 1 + eps) {
            return {
                x: x1 + ua * (x2 - x1),
                y: y1 + ua * (y2 - y1)
            };
        }
        return null;
    }

    isPointOnSegment(point, start, end) {
        const d1 = Math.sqrt((point.x - start.x) ** 2 + (point.y - start.y) ** 2);
        const d2 = Math.sqrt((point.x - end.x) ** 2 + (point.y - end.y) ** 2);
        const lineLen = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
        // Check if sum of distances equals line length (with tolerance)
        return Math.abs((d1 + d2) - lineLen) < 0.5;
    }

    addNode(point) {
        // Deprecated helper, but kept for compatibility if needed
        // Logic moved entirely to updateRoadGraph
    }

    rebuildZones() {
        // Ported from TownEditor logic: Find connected regions
        // This is still the expensive flood fill, but we'll optimize later.
        this.zones = [];
        this.buildings = [];

        const visited = new Set();

        Object.keys(this.gridData).forEach(key => {
            if (this.gridData[key] === 'road') return;
            if (visited.has(key)) return;

            const type = this.gridData[key];
            const [startX, startY] = key.split(',').map(Number);

            // Flood fill
            const region = [];
            const queue = [{ x: startX, y: startY }];
            visited.add(key);

            while (queue.length > 0) {
                const current = queue.shift();
                region.push(current);

                const neighbors = [
                    { x: current.x + this.gridSize, y: current.y },
                    { x: current.x - this.gridSize, y: current.y },
                    { x: current.x, y: current.y + this.gridSize },
                    { x: current.x, y: current.y - this.gridSize }
                ];

                neighbors.forEach(n => {
                    const nKey = `${n.x},${n.y}`;
                    if (!visited.has(nKey) && this.gridData[nKey] === type) {
                        visited.add(nKey);
                        queue.push(n);
                    }
                });
            }

            // Calculate bounds
            const xs = region.map(t => t.x);
            const ys = region.map(t => t.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            const zone = {
                type,
                x: minX - this.gridSize / 2,
                y: minY - this.gridSize / 2,
                w: (maxX - minX) + this.gridSize,
                h: (maxY - minY) + this.gridSize,
                tiles: region,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2
            };

            this.zones.push(zone);

            // Add single virtual building (legacy behavior for now)
            this.buildings.push({
                type,
                position: { x: zone.centerX, y: zone.centerY },
                width: zone.w,
                height: zone.h,
                tiles: region
            });
        });

        this.events.emit('zonesUpdated', this.zones);
    }

    snapToNearbyPoint(point, snapDistance) {
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

    getData() {
        // Ported from TownEditor.getData

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

    clearAll() {
        this.gridData = {};
        this.roads = [];
        this.roadGraph = [];
        this.zones = [];
        this.buildings = [];
        this.events.emit('zonesUpdated', []);
        // We need to notify renderer to clear roads too.
        // My renderer listens to 'roadRemoved' for single road, or I can emit 'clear'.
        // I'll emit 'clear'
        this.events.emit('clear');
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
            this.gridData = { ...data.gridData };

            if (data.roads) {
                // Bulk load roads
                data.roads.forEach(r => {
                    const newRoad = {
                        start: r.start,
                        end: r.end,
                        width: r.width,
                        id: Math.random().toString(36).substr(2, 9)
                    };
                    this.roads.push(newRoad);
                    // Mark tiles logic is implicitly handled by gridData, but let's be safe
                    // If gridData already imported, we don't need to overwrite it.
                });

                // Ensure roads are visually drawn by emitting roadAdded for each?
                // Or maybe the renderer should have a 'setRoads' method.
                // Currently renderer listens to 'roadAdded'.
                this.roads.forEach(r => this.events.emit('roadAdded', r));

                this.updateRoadGraph();
            }
            this.rebuildZones();
        }
    }

    loadExample() {
        TownExamples.loadGridCity(this);
    }
}
