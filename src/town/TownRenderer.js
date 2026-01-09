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
        const cwSize = 14;
        bg.rect(node.x - cwSize / 2, node.y - cwSize / 2, cwSize, cwSize);
        bg.fill({ color: 0xffffff, alpha: 0.3 });

        for (let i = 0; i < 3; i++) {
            bg.rect(node.x - cwSize / 2 + 2, node.y - cwSize / 2 + i * 4 + 1, cwSize - 4, 2);
            bg.fill(0xffffff);
        }

        if (isTrafficLight) {
            // Light pole
            g.rect(node.x - 2, node.y - 12, 4, 14);
            g.fill(0x333333);
            // Light box
            g.rect(node.x - 4, node.y - 14, 8, 6);
            g.fill(0x000000);
            // Red light
            g.circle(node.x, node.y - 11, 2);
            g.fill(0xff0000);
        } else if (isStopSign) {
            // Stop sign pole
            g.rect(node.x - 1, node.y - 12, 2, 12);
            g.fill(0x555555);
            // Octagon (simplified as circle or rotated rect)
            g.regularPoly(node.x, node.y - 14, 4, 8); // x, y, radius, sides
            g.fill(0xff0000); // Red
            // White rim
            g.stroke({ width: 0.5, color: 0xffffff });
        }

        this.intersectionGraphics.addChild(bg);
        this.intersectionGraphics.addChild(g);
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
}
