export const GridUtils = {
    getTilesAlongLine(start, end, gridSize) {
        const tiles = [];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const steps = Math.max(Math.abs(dx), Math.abs(dy)) / gridSize;

        for (let i = 0; i <= steps; i++) {
            const t = steps === 0 ? 0 : i / steps;
            const x = Math.round((start.x + dx * t) / gridSize) * gridSize;
            const y = Math.round((start.y + dy * t) / gridSize) * gridSize;
            const key = `${x},${y}`;
            if (!tiles.find(tile => `${tile.x},${tile.y}` === key)) {
                tiles.push({ x, y });
            }
        }

        return tiles;
    }
};
