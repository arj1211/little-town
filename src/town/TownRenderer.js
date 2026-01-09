import * as PIXI from 'pixi.js';

export class TownRenderer {
    constructor(model, container, app) {
        this.model = model;
        this.container = container;
        this.app = app;
        this.gridSize = model.gridSize;

        // Layers
        this.terrainLayer = new PIXI.Container();
        this.zonesLayer = new PIXI.Container();
        this.roadsLayer = new PIXI.Container();
        this.signalsLayer = new PIXI.Container(); // Traffic lights/signs on top of roads
        this.uiLayer = new PIXI.Container();

        container.addChild(this.terrainLayer);
        container.addChild(this.zonesLayer);
        container.addChild(this.roadsLayer);
        container.addChild(this.signalsLayer);
        container.addChild(this.uiLayer);

        // Initialize
        this.createTerrain();
        this.drawGrid();

        // Listeners
        this.model.events.on('roadAdded', (road) => {
            this.drawRoad(road);
            this.drawIntersections();
        });
        this.model.events.on('roadRemoved', (road) => {
            this.removeRoad(road);
            this.drawIntersections();
        });
        this.model.events.on('zonesUpdated', (zones) => this.renderZones(zones));
        this.model.events.on('clear', () => this.clearAll());
        this.model.events.on('graphUpdated', () => this.drawIntersections());

        // Keep track of graphics
        this.roadGraphics = new Map(); // roadId -> Graphics
        this.zoneGraphics = []; // Array of graphics
        this.intersectionGraphics = new PIXI.Container();
        this.signalsLayer.addChild(this.intersectionGraphics);
    }

    createTerrain() {
        const terrain = new PIXI.Graphics();
        terrain.rect(-2000, -2000, 4000, 4000); // Larger terrain
        terrain.fill(0xa5d6a7);
        this.terrainLayer.addChild(terrain);
    }

    drawGrid() {
        const gridGraphics = new PIXI.Graphics();
        const gridExtent = 1000;

        // Draw vertical lines
        for (let x = -gridExtent; x <= gridExtent; x += this.gridSize) {
            gridGraphics.moveTo(x, -gridExtent);
            gridGraphics.lineTo(x, gridExtent);
            gridGraphics.stroke({ width: 0.5, color: 0x000000, alpha: 0.1 });
        }

        // Draw horizontal lines
        for (let y = -gridExtent; y <= gridExtent; y += this.gridSize) {
            gridGraphics.moveTo(-gridExtent, y);
            gridGraphics.lineTo(gridExtent, y);
            gridGraphics.stroke({ width: 0.5, color: 0x000000, alpha: 0.1 });
        }

        this.terrainLayer.addChild(gridGraphics);
    }

    drawRoad(road) {
        const graphics = new PIXI.Graphics();
        graphics.moveTo(road.start.x, road.start.y);
        graphics.lineTo(road.end.x, road.end.y);
        // Lighter grey for better contrast
        graphics.stroke({ width: road.width, color: 0x666666 });

        // Add caps
        graphics.circle(road.start.x, road.start.y, road.width / 2);
        graphics.circle(road.end.x, road.end.y, road.width / 2);
        graphics.fill(0x666666);

        this.roadsLayer.addChild(graphics);
        this.roadGraphics.set(road.id, graphics);
    }

    clearAll() {
        this.roadGraphics.forEach(g => g.destroy());
        this.roadGraphics.clear();
        this.intersectionGraphics.removeChildren(); // Clear signals
        this.renderZones([]); // Clear zones
    }

    removeRoad(road) {
        const graphics = this.roadGraphics.get(road.id);
        if (graphics) {
            graphics.destroy();
            this.roadGraphics.delete(road.id);
        }
    }

    drawIntersections() {
        this.intersectionGraphics.removeChildren();

        // Find intersections from graph
        const graph = this.model.roadGraph;
        if (!graph) return;

        graph.forEach(node => {
            if (node.connections.length > 2) {
                this.drawIntersection(node);
            }
        });
    }

    drawIntersection(node) {
        // Draw crosswalks and traffic lights
        const g = new PIXI.Graphics();
        const bg = new PIXI.Graphics();

        // Logic:
        // 3 connections = Stop Sign + Crosswalks
        // 4+ connections = Traffic Light + Crosswalks

        const isTrafficLight = node.connections.length >= 4;
        const isStopSign = node.connections.length === 3;

        // Draw Crosswalks (Always for intersections)
        // Reduced size from 14 to 10
        const cwSize = 10;
        bg.rect(node.x - cwSize / 2, node.y - cwSize / 2, cwSize, cwSize);
        bg.fill({ color: 0xffffff, alpha: 0.3 });

        for (let i = 0; i < 3; i++) {
            bg.rect(node.x - cwSize / 2 + 1, node.y - cwSize / 2 + i * 3 + 1, cwSize - 2, 1.5);
            bg.fill(0xffffff);
        }

        if (isTrafficLight) {
            // Draw 4 lights for realistic intersection
            const offset = 4;
            // Vertical Lights (N/S)
            // Top
            this.createTrafficLightBulb(node, 0, -offset, 'vertical');
            // Bottom
            this.createTrafficLightBulb(node, 0, offset, 'vertical');

            // Horizontal Lights (E/W)
            // Left
            this.createTrafficLightBulb(node, -offset, 0, 'horizontal');
            // Right
            this.createTrafficLightBulb(node, offset, 0, 'horizontal');

            this.intersectionGraphics.addChild(bg);
        } else if (isStopSign) {
            // Stop sign pole (Smaller)
            g.rect(node.x - 0.5, node.y - 5, 1, 5);
            g.fill(0x555555);
            // Octagon (Smaller: radius 2 instead of 2.5)
            g.regularPoly(node.x, node.y - 6, 2, 8);
            g.fill(0xff0000);
            g.stroke({ width: 0.5, color: 0xffffff });

            this.intersectionGraphics.addChild(bg);
            this.intersectionGraphics.addChild(g);
        } else {
            this.intersectionGraphics.addChild(bg);
            this.intersectionGraphics.addChild(g);
        }
    }

    createTrafficLightBulb(node, dx, dy, axis) {
        // Small box
        const box = new PIXI.Graphics();
        box.rect(node.x + dx - 1.5, node.y + dy - 1.5, 3, 3);
        box.fill(0x000000);
        this.intersectionGraphics.addChild(box);

        // Bulb
        const bulb = new PIXI.Graphics();
        bulb.circle(node.x + dx, node.y + dy, 0.8); // Radius 0.8
        bulb.fill(0xff0000); // Default Red
        bulb.userData = {
            type: 'traffic-light-bulb',
            nodeId: node.id,
            axis: axis,
            x: node.x + dx,
            y: node.y + dy
        };
        this.intersectionGraphics.addChild(bulb);
    }

    renderZones(zones) {
        // Clear existing
        this.zoneGraphics.forEach(g => g.destroy());
        this.zoneGraphics = [];

        zones.forEach(zone => {
            const color = this.getZoneColor(zone.type);
            const graphics = new PIXI.Graphics();

            // Draw individual tiles to look grid-like
            // Or draw big rect for optimization. Original used tiles.
            // Let's optimize by drawing one shape for the zone
            // Actually, drawing rects for tiles is safer for non-rectangular zones

            zone.tiles.forEach(tile => {
                graphics.rect(
                    tile.x - this.gridSize / 2,
                    tile.y - this.gridSize / 2,
                    this.gridSize,
                    this.gridSize
                );
            });

            graphics.fill({ color, alpha: 0.9 });
            graphics.stroke({ width: 0.5, color: 0x000000, alpha: 0.2 });

            this.zonesLayer.addChild(graphics);
            this.zoneGraphics.push(graphics);
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

    updateTrafficLights(time) {
        // Cycle: Total 120s
        // 0-50: Vert Green, Horz Red
        // 50-55: Vert Yellow, Horz Red
        // 55-60: All Red
        // 60-110: Vert Red, Horz Green
        // 110-115: Vert Red, Horz Yellow
        // 115-120: All Red
        const cycleLength = 120;

        this.intersectionGraphics.children.forEach(child => {
            if (child.userData && child.userData.type === 'traffic-light-bulb') {
                const nodeId = child.userData.nodeId;
                const axis = child.userData.axis;

                // Randomize based on node ID
                const offset = (nodeId * 17) % cycleLength;
                const localTime = (time + offset) % cycleLength;

                let color = 0xff0000; // Default Red

                if (axis === 'vertical') {
                    if (localTime < 50) color = 0x00ff00; // Green
                    else if (localTime < 55) color = 0xffff00; // Yellow
                } else {
                    // Horizontal
                    if (localTime >= 60 && localTime < 110) color = 0x00ff00; // Green
                    else if (localTime >= 110 && localTime < 115) color = 0xffff00; // Yellow
                }

                // Redraw
                child.clear();
                if (child.userData.x !== undefined) {
                    child.circle(child.userData.x, child.userData.y, 0.8);
                    child.fill(color);
                }
            }
        });
    }
}
