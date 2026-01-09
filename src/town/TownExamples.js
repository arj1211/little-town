import { GridUtils } from '../core/GridUtils.js';

export class TownExamples {
    static loadGridCity(model) {
        model.clearAll();
        const g = model.gridSize; // 20
        const extent = 18; // 18 * 20 = 360 size

        // Batch updates to avoid freezing
        const oldEmit = model.events.emit;
        model.events.emit = () => { }; // Mute events temporarily

        try {
            // Create Grid Roads
            // Vertical
            for (let x = -extent; x <= extent; x += 6) {
                model.addRoad({ x: x * g, y: -extent * g }, { x: x * g, y: extent * g }, true);
            }
            // Horizontal
            for (let y = -extent; y <= extent; y += 6) {
                model.addRoad({ x: -extent * g, y: y * g }, { x: extent * g, y: y * g }, true);
            }

            // Manually trigger updates once at the end
            currentModel = model;
        } finally {
            model.events.emit = oldEmit; // Restore
        }

        // Add Zones in blocks
        // ... (rest of function)

        // Helper for filling zones
        const fillZone = (rectX, rectY, w, h, type) => {
            for (let ix = rectX; ix < rectX + w; ix += g) {
                for (let iy = rectY; iy < rectY + h; iy += g) {
                    // Don't overwrite roads
                    if (model.getTileType(ix, iy) !== 'road') {
                        model.setTileType(ix, iy, type);
                    }
                }
            }
        };

        for (let x = -extent; x < extent; x += 6) {
            for (let y = -extent; y < extent; y += 6) {
                // Determine zone type based on pattern
                let type = 'residential';

                // Central area commercial
                if (Math.abs(x) < 6 && Math.abs(y) < 6) {
                    type = 'commercial';
                }
                // Industrial outskirts
                else if (Math.abs(x) > 12 || Math.abs(y) > 12) {
                    type = (Math.random() > 0.5) ? 'park' : 'residential';
                }
                // Parks scattered
                else if ((Math.abs(x) + Math.abs(y)) % 5 === 0) {
                    type = 'park';
                }

                // Fill block with buffer for roads
                fillZone(
                    (x + 1) * g,
                    (y + 1) * g,
                    4 * g,
                    4 * g,
                    type
                );
            }
        }

        // Add a school and community center specific spots
        fillZone(-14 * g, -14 * g, 5 * g, 5 * g, 'school');
        fillZone(14 * g, 14 * g, 5 * g, 5 * g, 'community');

        // Finalize
        model.updateRoadGraph();
        model.rebuildZones();
        // Force renderer refresh
        model.events.emit('clear'); // Clears old visuals
        // We need a specific event to say "Reload Everything"
        // Emitting 'zonesUpdated' works for zones
        // Emitting 'graphUpdated' works for people/sidewalks
        // But roads need to be redrawn.
        // Let's emit 'roadAdded' for each road? No, too slow.
        // Let's rely on Main to reconstruct renderer? No.
        // We'll emit 'fullReload' if we support it, or just iterate.

        model.roads.forEach(r => model.events.emit('roadAdded', r));
        model.events.emit('zonesUpdated', model.zones);
    }
}
let currentModel;


