let observer; // moved outside so we can control it from anywhere
let previouslyHighlighted = [];

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

function readBoard() {
    const cells = Array.from(document.querySelectorAll('.cell'));
    let maxX = 0, maxY = 0;

    // First pass: get dimensions
    for (const cell of cells) {
        const x = parseInt(cell.dataset.x, 10);
        const y = parseInt(cell.dataset.y, 10);
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }

    // Create 2D array
    const grid = Array.from({ length: maxY + 1 }, () =>
        Array.from({ length: maxX + 1 }, () => null)
    );

    // Second pass: fill in cell states
    for (const cell of cells) {
        const x = parseInt(cell.dataset.x, 10);
        const y = parseInt(cell.dataset.y, 10);
        if (Number.isNaN(x) || Number.isNaN(y)) continue;

        const classList = cell.classList;
        let state;

        if (classList.contains('hdd_closed')) {
            state = classList.contains('hdd_flag') ? 'F' : 'U';
        } else if (classList.contains('hdd_opened')) {
            const typeClass = [...classList].find(c => c.startsWith('hdd_type'));
            const type = parseInt(typeClass?.replace('hdd_type', ''), 10);
            state = type === 11 ? 'M' : type;
        } else {
            state = '?';
        }

        if (
            state === '?' ||
            Number.isNaN(state) ||
            (typeof state === 'number' && (state < 0 || state > 8))
        ) {
            console.warn(`Skipping invalid cell at (${x}, ${y}):`, classList);
            continue;
        }

        grid[y][x] = { state, el: cell };
    }

    return grid;
}


function highlightCells(cells, color) {
    for (const { el } of cells) {
        if (!el) continue;
        el.style.outline = `2px solid ${color}`;
        el.style.outlineOffset = '-2px';
        previouslyHighlighted.push(el);
    }
}

function clearHighlights() {
    for (const el of previouslyHighlighted) {
        el.style.outline = '';
        el.style.outlineOffset = '';
    }
    previouslyHighlighted = [];
}

function runHelper() {
    if (observer) observer.disconnect(); // stop watching

    clearHighlights();

    const grid = readBoard();
    const { safeCells, mineCells } = solveMinesweeper(grid);
    highlightCells(safeCells, 'lime');
    highlightCells(mineCells, 'red');

    if (game) observer.observe(game, { childList: true, subtree: true, attributes: true }); // resume
}

function waitForBoardThenRun() {
    const game = document.getElementById('game');
    if (!game || document.querySelectorAll('.cell').length === 0) {
        return setTimeout(waitForBoardThenRun, 300); // try again in 300ms
    }

    console.log("Board ready, starting helper");
    runHelper();

    // Set up mutation observer
    const observer = new MutationObserver(runHelper);
    observer.observe(game, { childList: true, subtree: true, attributes: true });
}

waitForBoardThenRun();

// Create and insert helper button
const suggestBtn = document.createElement('button');
suggestBtn.textContent = '🔍 Suggest Moves';
suggestBtn.style.position = 'fixed';
suggestBtn.style.top = '20px';
suggestBtn.style.right = '20px';
suggestBtn.style.zIndex = 9999;
suggestBtn.style.padding = '10px 15px';
suggestBtn.style.background = '#222';
suggestBtn.style.color = '#fff';
suggestBtn.style.border = '1px solid #444';
suggestBtn.style.borderRadius = '5px';
suggestBtn.style.fontSize = '14px';
suggestBtn.style.cursor = 'pointer';

suggestBtn.onclick = () => {
    console.clear(); // optional: to declutter console logs
    runHelper();     // manually trigger the logic
};

document.body.appendChild(suggestBtn);
