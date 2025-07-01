let observer = null; // moved outside so we can control it from anywhere
let observerActive = false;
let previouslyHighlighted = [];

function runHelper() {
    clearHighlights();
    const grid = readBoard();
    const minesLeft = getMinesLeft();
    const { safeCells, mineCells } = solveMinesweeper(grid, minesLeft);
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

function waitForBoardThenEnableUI() {
    const gameEl = document.getElementById('game');
    if (!gameEl || document.querySelectorAll('.cell').length === 0) {
        return setTimeout(waitForBoardThenEnableUI, 300); // try again in 300ms
    }

    game = gameEl; // assign global game variable
    console.log("Board ready, setting up helper UI");
    createHelperButtons();
}

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

function applyBasicLogic(grid, cell, neighbors, safeCells, mineCells) {
    // Basic Logic: 
    // Square with number n has already n adjacent flags --> remaining adjacent cells are safe
    // Square with number n has 0 adjacent flags and n unopened neighbors --> all unopened neighbors are safe

    const unopened = neighbors.filter(n => n.state === 'U');
    const flagged = neighbors.filter(n => n.state === 'F');
    const minesLeft = cell.state - flagged.length;

    if (unopened.length === 0 || minesLeft < 0) return false;

    if (minesLeft === unopened.length) {
        if (!mineCells.some(c => c.x === cell.x && c.y === cell.y)) {
            mineCells.push(cell);
            unopened.forEach(c => {
                grid[c.y][c.x] = { ...c, state: 'F' };
            });
            return true;
        }
    } else if (minesLeft === 0) {
        if (!safeCells.some(c => c.x === cell.x && c.y === cell.y)) {
            safeCells.push(cell);
            unopened.forEach(c => {
                grid[c.y][c.x] = { ...c, state: 'S' };
            });
            return true;
        }
    }
    return false;
}

function applyPatternLogic(grid, x, y, safeCells, mineCells) {
    let progress = false;
    // Pattern Logic:
    // Basic patterns (1-1, 1-2, 1-2-1, 1-2-2-1)
    // Reductions turning patterns into basic patterns like above
    // Holes
    // Triangles
    // High complexity patterns (1-3-1 corner, 2-2-2 corner, 1>2<1, T-pattern, Dependency chains)
    // Last turns (Mine counting, combinations)

    // #########################################################################################
    // check 1-1 pattern
    if (checkAll11Patterns(grid, x, y, safeCells)) progress = true;
    //if (checkAll121Patterns(grid, x, y, mineCells, safeCells)) progress = true;
    //if (checkAll1221Patterns(grid, x, y, mineCells, safeCells)) progress = true;
    if (checkAll12Patterns(grid, x, y, mineCells)) progress = true;
    return progress;
}

function getCell(grid, x, y) {
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return null;
    return grid[y][x];
}

function checkAll11Patterns(grid, x, y, safeCells) {
    const get = (dx, dy) => getCell(grid, x + dx, y + dy);
    const isNumber = (c) => !c || typeof c.state === 'number';
    const isUnknown = (c) => c?.state === 'U';

    const addSafe = (cell) => {
        if (isUnknown(cell)) {
            safeCells.push(cell);
            cell.state = 'S';
            return true;
        }
        return false;
    };

    const directions = [
        {
            name: "Horizontal →",
            pattern: [[0, 0], [1, 0]],
            mustBeNumbers: [[-1, 0], [-1, -1], [-1, 1], [0, 1], [1, 1]],
            mustBeUnknowns: [[0, -1], [1, -1]],
            toMarkSafe: [[2, -1], [2, 0], [2, 1]],
            existsCheck: [2, -1]
        },
        {
            name: "Horizontal ←",
            pattern: [[0, 0], [-1, 0]],
            mustBeNumbers: [[1, 0], [1, -1], [1, 1], [0, 1], [-1, 1]],
            mustBeUnknowns: [[0, -1], [-1, -1]],
            toMarkSafe: [[-2, -1], [-2, 0], [-2, 1]],
            existsCheck: [-2, -1]
        },
        {
            name: "Vertical ↓",
            pattern: [[0, 0], [0, 1]],
            mustBeNumbers: [[0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
            mustBeUnknowns: [[-1, 1], [1, 1]],
            toMarkSafe: [[1, 2], [0, 2], [-1, 2]],
            existsCheck: [1, 2]
        },
        {
            name: "Vertical ↑",
            pattern: [[0, 0], [0, -1]],
            mustBeNumbers: [[0, 1], [-1, 1], [1, 1], [-1, 0], [1, 0]],
            mustBeUnknowns: [[-1, -1], [1, -1]],
            toMarkSafe: [[1, -2], [0, -2], [-1, -2]],
            existsCheck: [1, -2]
        }
    ];

    for (const dir of directions) {
        if (
            dir.pattern.every(([dx, dy]) => get(dx, dy)?.state === 1) &&
            dir.mustBeNumbers.every(([dx, dy]) => isNumber(get(dx, dy))) &&
            dir.mustBeUnknowns.every(([dx, dy]) => isUnknown(get(dx, dy))) &&
            get(...dir.existsCheck)
        ) {
            let progress = false;
            for (const [dx, dy] of dir.toMarkSafe) {
                if (addSafe(get(dx, dy))) progress = true;
            }
            if (progress) console.log("checking at", x, y, "direction:", dir.name);
            return progress;
        }
    }

    return false;
}


function checkAll12Patterns(grid, x, y, mineCells, safeCells) {

    const checkPattern = (gx, gy, dx, dy, ddx, ddy) => {
        const get = (dx2, dy2) => getCell(grid, gx + dx2, gy + dy2);

        const addMine = (cell) => {
            if (cell && cell.state === 'U') {
                mineCells.push(cell);
                grid[cell.y][cell.x] = { ...cell, state: 'F' };
                return true;
            }
            return false;
        };

        const addSafe = (cell) => {
            if (cell && cell.state === 'U') {
                safeCells.push(cell);
                grid[cell.y][cell.x] = { ...cell, state: 'S' };
                return true;
            }
            return false;
        };

        const f = get(0, 0);         // center 1
        const g = get(dx, dy);       // number (2,3,4)
        const d = get(2 * dx, 2 * dy);     // target cell to mark
        const b = get(-dy, -dx);     // upper left
        const c = get(0, -dx);       // directly above
        const h = get(dx + dy, dy + dx);   // side cell
        const l = get(dx - dy, dy - dx);   // opposite side
        const j = get(0, ddy);       // bottom-left
        const k = get(dx, ddy);      // bottom-right

        if (!f || f.state !== 1) return false;
        if ([b, c, d].some(cell => cell?.state !== 'U')) return false;
        if ([j, k].some(cell => cell?.state === 'U')) return false;
        if (!g || ![2, 3, 4].includes(g.state)) return false;

        let progress = false;

        if (g.state === 2) {
            const hF = h?.state === 'F', lF = l?.state === 'F';
            const hC = h && typeof h.state === 'number';
            const lC = l && typeof l.state === 'number';
            if (hF || lF) {
                progress |= addSafe(d);
            } else if (hC && lC) {
                progress |= addMine(d);
            }
        }

        if (g.state === 3) {
            const hF = h?.state === 'F', lF = l?.state === 'F';
            const hC = h && typeof h.state === 'number', lC = l && typeof l.state === 'number';
            const hU = h?.state === 'U', lU = l?.state === 'U';

            if (lF && (hC || !h)) progress |= addMine(d);
            if (hF && (lC || !l)) progress |= addMine(d);
            if (hU && lC) {
                progress |= addMine(h);
                progress |= addMine(d);
            }
            if (lU && hC) {
                progress |= addMine(l);
                progress |= addMine(d);
            }
        }

        if (g.state === 4 && h?.state === 'U' && l?.state === 'U') {
            progress |= addMine(h);
            progress |= addMine(l);
            progress |= addMine(d);
        }

        return !!progress;
    };

    // Try all 4 directions:
    // Right (→)
    const progress1 = checkPattern(x, y, 1, 0, 0, 1);
    // Left (←)
    const progress2 = checkPattern(x, y, -1, 0, 0, 1);
    // Down (↓)
    const progress3 = checkPattern(x, y, 0, 1, 1, 0);
    // Up (↑)
    const progress4 = checkPattern(x, y, 0, -1, 1, 0);

    return progress1 || progress2 || progress3 || progress4;
}

/*function checkAll121Patterns(grid, x, y, mineCells, safeCells) { return false; }
function checkAll1221Patterns(grid, x, y, mineCells, safeCells) { return false; }*/

function checkHoles(grid, x, y, safeCells) { }

function solveMinesweeper(grid, minesLeft) {
    const safeCells = [];
    const mineCells = [];
    let progress = true;

    while (progress) {
        progress = false;

        for (let y = 0; y < grid.length; y++) {
            for (let x = 0; x < grid[y].length; x++) {
                const cell = grid[y][x];
                if (!cell || typeof cell.state !== 'number') continue;
                const neighbors = getNeighbors(grid, x, y);
                // ####################################################
                // TODO: check for errors that the user might have made
                // ####################################################
                if (applyBasicLogic(grid, cell, neighbors, safeCells, mineCells)) progress = true;
                if (progress == false) {
                    if (applyPatternLogic(grid, x, y, safeCells, mineCells)) progress = true;
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

        grid[y][x] = { state, el: cell, reducedState: state };
    }

    return grid;
}

function getDigitFromClass(el) {
    if (!el) return 0;
    const match = [...el.classList].find(c => c.startsWith('hdd_top-area-num'));
    return match ? parseInt(match.replace('hdd_top-area-num', ''), 10) : 0;
}

function getMinesLeft() {
    const h = getDigitFromClass(document.getElementById('top_area_mines_100'));
    const t = getDigitFromClass(document.getElementById('top_area_mines_10'));
    const u = getDigitFromClass(document.getElementById('top_area_mines_1'));
    return h * 100 + t * 10 + u;
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

let game = null;
waitForBoardThenEnableUI();