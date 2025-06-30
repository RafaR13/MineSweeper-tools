let observer = null; // moved outside so we can control it from anywhere
let observerActive = false;
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
    let updated = true;

    while (updated) {
        updated = false;

        // --- Basic Logic Pass ---
        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                const cell = grid[y][x];
                if (!cell || typeof cell.state !== 'number') continue;

                const neighbors = getNeighbors(grid, x, y);
                const unopened = neighbors.filter(n => n.state === 'U');
                const flagged = neighbors.filter(n => n.state === 'F');

                if (unopened.length === 0) continue;

                if (flagged.length + unopened.length === cell.state) {
                    for (const c of unopened) {
                        if (c.state === 'U') {
                            mineCells.push(c);
                            grid[c.y][c.x] = { ...c, state: 'F' };
                            updated = true;
                        }
                    }
                } else if (flagged.length === cell.state) {
                    for (const c of unopened) {
                        if (c.state === 'U') {
                            safeCells.push(c);
                            grid[c.y][c.x] = { ...c, state: 'S' };
                            updated = true;
                        }
                    }
                }
            }
        }
        if (!updated) {
            // --- Subset Logic Pass ---
            for (let y = 0; y < grid.length; y++) {
                for (let x = 0; x < grid[y].length; x++) {
                    const cellA = grid[y][x];
                    if (!cellA || typeof cellA.state !== 'number') continue;

                    const neighborsA = getNeighbors(grid, x, y);
                    const unopenedA = neighborsA.filter(n => n.state === 'U');
                    const flaggedA = neighborsA.filter(n => n.state === 'F');

                    const minesLeftA = cellA.state - flaggedA.length;
                    if (minesLeftA <= 0 || unopenedA.length === 0) continue;

                    for (const neighbor of neighborsA) {
                        if (!neighbor || typeof neighbor.state !== 'number') continue;
                        const neighborsB = getNeighbors(grid, neighbor.x, neighbor.y);
                        const unopenedB = neighborsB.filter(n => n.state === 'U');
                        const flaggedB = neighborsB.filter(n => n.state === 'F');
                        const minesLeftB = neighbor.state - flaggedB.length;

                        const setA = new Set(unopenedA.map(c => `${c.x},${c.y}`));
                        const setB = new Set(unopenedB.map(c => `${c.x},${c.y}`));

                        const extraCells = unopenedB.filter(
                            c => !setA.has(`${c.x},${c.y}`)
                        );

                        if (extraCells.length === 0) continue;

                        if (setA.size < setB.size &&
                            minesLeftB - minesLeftA === extraCells.length) {
                            for (const c of extraCells) {
                                if (c.state === 'U') {
                                    mineCells.push(c);
                                    grid[c.y][c.x] = { ...c, state: 'F' };
                                    updated = true;
                                }
                            }
                        } else if (setA.size < setB.size &&
                            setB.size - setA.size === minesLeftB - minesLeftA) {
                            for (const c of extraCells) {
                                if (c.state === 'U') {
                                    safeCells.push(c);
                                    grid[c.y][c.x] = { ...c, state: 'S' };
                                    updated = true;
                                }
                            }
                        }
                    }
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
    clearHighlights();
    const grid = readBoard();
    const { safeCells, mineCells } = solveMinesweeper(grid);
    highlightCells(safeCells, 'lime');
    highlightCells(mineCells, 'red');
}

function startObserving() {
    if (observerActive) return;

    const cellElements = document.querySelectorAll('.cell');
    if (cellElements.length === 0) return;

    observer = new MutationObserver(runHelper);

    // Observe each cell individually
    for (const cell of cellElements) {
        observer.observe(cell, {
            attributes: true,
            attributeFilter: ['class'], // Only track class changes
        });
    }

    observerActive = true;
}

function stopObserving() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    observerActive = false;
}

function waitForBoardThenEnableUI() {
    const gameEl = document.getElementById('game');
    if (!gameEl || document.querySelectorAll('.cell').length === 0) {
        return setTimeout(waitForBoardThenEnableUI, 300); // try again in 300ms
    }

    game = gameEl; // assign global game variable
    console.log("Board ready, setting up helper UI");
    createHelperButtons();
}

function styleHelperButton(btn, topOffsetPx) {
    btn.style.position = 'fixed';
    btn.style.top = `${topOffsetPx}px`;
    btn.style.right = '20px';
    btn.style.zIndex = 9999;
    btn.style.padding = '10px 15px';
    btn.style.background = '#222';
    btn.style.color = '#fff';
    btn.style.border = '1px solid #444';
    btn.style.borderRadius = '5px';
    btn.style.fontSize = '14px';
    btn.style.cursor = 'pointer';
}

function createHelperButtons() {
    // 🔍 Suggest Once
    const suggestBtn = document.createElement('button');
    suggestBtn.textContent = '🔍 Suggest Once';
    styleHelperButton(suggestBtn, 20);
    suggestBtn.onclick = () => {
        console.clear();
        stopObserving();
        runHelper();
    };
    document.body.appendChild(suggestBtn);

    // 🧠 Auto Solve Toggle
    const autoBtn = document.createElement('button');
    autoBtn.textContent = '🧠 Auto Solve: OFF';
    styleHelperButton(autoBtn, 60);
    autoBtn.onclick = () => {
        if (observerActive) {
            stopObserving();
            clearHighlights();
            autoBtn.textContent = '🧠 Auto Solve: OFF';
        } else {
            runHelper();
            startObserving();
            autoBtn.textContent = '🧠 Auto Solve: ON';
        }
    };
    document.body.appendChild(autoBtn);
}

let game = null;
waitForBoardThenEnableUI();
