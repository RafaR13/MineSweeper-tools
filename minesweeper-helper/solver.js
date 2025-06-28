function getNeighbors(grid, x, y) {
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= grid[0].length || ny >= grid.length) continue;
            if (grid[ny]?.[nx] !== undefined) {
                neighbors.push({ x: nx, y: ny, ...grid[ny][nx] });
            }
        }
    }
    return neighbors;
}

function solveMinesweeper(grid) {
    const safeCells = [];
    const mineCells = [];

    for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
            const cell = grid[y][x];
            if (typeof cell.state === 'number') {
                const neighbors = getNeighbors(grid, x, y);
                const unopened = neighbors.filter(n => n.state === 'U');
                const flagged = neighbors.filter(n => n.state === 'F');

                if (unopened.length === 0) continue;

                if (flagged.length + unopened.length === cell.state) {
                    // All unopened are mines
                    unopened.forEach(c => mineCells.push(c));
                } else if (flagged.length === cell.state) {
                    // All unopened are safe
                    unopened.forEach(c => safeCells.push(c));
                }
            }
        }
    }

    return { safeCells, mineCells };
}
