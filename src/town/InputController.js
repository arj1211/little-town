import * as PIXI from 'pixi.js';

export class InputController {
    constructor(model, renderer, app) {
        this.model = model;
        this.renderer = renderer;
        this.app = app;

        this.currentTool = 'road';
        this.currentZoneType = 'residential';

        this.isDrawing = false;
        this.drawStart = null;

        // Preview graphics
        this.previewGraphics = new PIXI.Graphics();
        this.renderer.uiLayer.addChild(this.previewGraphics);

        this.setupInteraction();
    }

    setTool(tool) {
        this.currentTool = tool;
    }

    setZoneType(type) {
        this.currentZoneType = type;
    }

    setupInteraction() {
        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen;

        this.app.stage.on('pointerdown', (e) => this.onPointerDown(e));
        this.app.stage.on('pointermove', (e) => this.onPointerMove(e));
        this.app.stage.on('pointerup', (e) => this.onPointerUp(e));
    }

    getGridPos(e) {
        const globalPos = e.global;
        // Map to world container space (which is renderer.container)
        return this.renderer.container.toLocal(globalPos);
    }

    onPointerDown(e) {
        if (e.button !== 0) return; // Left click only

        const pos = this.getGridPos(e);
        this.isDrawing = true;
        this.drawStart = this.model.snapToGrid(pos);
    }

    onPointerMove(e) {
        if (!this.isDrawing) return;

        const pos = this.getGridPos(e);
        this.previewGraphics.clear();

        if (this.currentTool === 'road') {
            const snappedEnd = this.model.snapToGrid(pos);
            // Preview snapping to nearby logic? `model.snapToNearbyPoint`?
            // Let's use it for better preview
            const start = this.model.snapToNearbyPoint(this.drawStart, this.model.gridSize);
            const end = this.model.snapToNearbyPoint(snappedEnd, this.model.gridSize);

            this.previewGraphics.moveTo(start.x, start.y);
            this.previewGraphics.lineTo(end.x, end.y);
            this.previewGraphics.stroke({ width: 12, color: 0x404040, alpha: 0.5 });

        } else if (this.currentTool === 'zone') {
            // Paint logic
            this.model.addZone(pos, this.currentZoneType);
            this.drawCursor(pos);
        } else if (this.currentTool === 'erase') {
            this.model.removeAt(pos);
            this.drawCursor(pos, 0xff0000);
        }
    }

    onPointerUp(e) {
        if (!this.isDrawing) return;

        const pos = this.getGridPos(e);

        if (this.currentTool === 'road') {
            try {
                this.model.addRoad(this.drawStart, pos);
            } catch (err) {
                console.warn(err.message);
            }
        }

        this.isDrawing = false;
        this.drawStart = null;
        this.previewGraphics.clear();
    }

    drawCursor(pos, colorStr) {
        // Helper to show where we are painting
        const snapped = this.model.snapToGrid(pos);
        const color = colorStr || 0xffffff;

        this.previewGraphics.rect(
            snapped.x - this.model.gridSize / 2,
            snapped.y - this.model.gridSize / 2,
            this.model.gridSize,
            this.model.gridSize
        );
        this.previewGraphics.fill({ color, alpha: 0.5 });
        this.previewGraphics.stroke({ width: 1, color: 0x000000 });
    }
}
