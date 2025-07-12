let observer = null; // moved outside so we can control it from anywhere
let observerActive = false;
let previouslyHighlighted = [];
let autoplayActive = false;
let autoplayInterval = null;


function showMessage(text) {
    let msg = document.getElementById('helper-msg');
    if (!msg) {
        msg = document.createElement('div');
        msg.id = 'helper-msg';
        msg.style.position = 'fixed';
        msg.style.bottom = '20px';
        msg.style.right = '20px';
        msg.style.padding = '10px 15px';
        msg.style.background = '#333';
        msg.style.color = '#fff';
        msg.style.fontSize = '14px';
        msg.style.borderRadius = '5px';
        msg.style.zIndex = 9999;
        document.body.appendChild(msg);
    }
    msg.textContent = text;
}

function hideMessage() {
    const msg = document.getElementById('helper-msg');
    if (msg) msg.remove();
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

    // auto Play Button
    const autoplayBtn = document.createElement('button');
    autoplayBtn.textContent = '🔁 Auto Play: OFF';
    styleHelperButton(autoplayBtn, 100);
    autoplayBtn.onclick = () => {
        if (autoplayActive) {
            stopAutoplay();
            autoplayBtn.textContent = '🔁 Auto Play: OFF';
        } else {
            autoplayActive = true;
            autoplayBtn.textContent = '🔁 Auto Play: ON';
            hideMessage();

            const step = () => {
                if (!autoplayActive) return;
                const changed = autoplayStep();
                if (!changed) {
                    showMessage("✅ No more safe moves. Autoplay stopped.");
                    stopAutoplay();
                    autoplayBtn.textContent = '🔁 Auto Play: OFF';
                    return;
                }
                setTimeout(step, 100); // delay between steps
            };

            step();
        }
    };
    document.body.appendChild(autoplayBtn);
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


function stopAutoplay() {
    autoplayActive = false;
    if (autoplayInterval) {
        clearInterval(autoplayInterval);
        autoplayInterval = null;
    }
}

function autoplayStep() {
    const safeCells = [];
    const mineCells = [];
    const grid = readBoard(safeCells, mineCells);

    if (!grid) {
        showMessage("💥 A mine is present. Autoplay stopped.");
        return false;
    }

    const minesLeft = getMinesLeft();
    solveMinesweeper(grid, minesLeft, safeCells, mineCells);
    console.log(safeCells, mineCells);

    let actionsTaken = false;


    for (const cell of mineCells) {
        if (cell.state === 'U' || cell.state === 'F') {
            triggerNativeClick(cell.el, 2); // right-click to flag
            actionsTaken = true;
        }
    }
    for (const cell of safeCells) {
        if (cell.state === 'U' || cell.state === 'S' || typeof cell.state === 'number') {
            triggerNativeClick(cell.el, 0);
            actionsTaken = true;
        }
    }


    return actionsTaken;
}

function triggerNativeClick(el, number) {
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: number });
    const up = new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: number });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: number });

    el.dispatchEvent(down);
    el.dispatchEvent(up);
    el.dispatchEvent(click);
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

function clearConstraints(grid, x, y) {
    // remove constraints for cell (x,y), and remove every constraint that has (x,y) in the origin or in their cells
    const cell = getCell(grid, x, y);
    if (!cell || !cell.constraints) return;
    cell.constraints = [];

    // remove every constraint in the neighbors that has (x,y) in their origin or cells
    const neighbors = getNeighbors(grid, x, y);
    for (const neighbor of neighbors) {
        if (!neighbor.constraints) continue;
        neighbor.constraints = neighbor.constraints.filter(c => c.origin.x !== x || c.origin.y !== y);
        neighbor.constraints = neighbor.constraints.filter(c => !c.cells.some(cell => cell.x === x && cell.y === y));
    }
}

function removeConstraint(grid, x, y, constraint) {
    // Remove a specific constraint from the cell at (x, y)
    const cell = getCell(grid, x, y);
    if (!cell || !cell.constraints) return;
    cell.constraints = cell.constraints.filter(c =>
        c.origin.x !== constraint.origin.x ||
        c.origin.y !== constraint.origin.y
    );
}

function sameCellSet(a, b) {
    if (a.length !== b.length) return false;
    const aSet = new Set(a.map(c => `${c.x},${c.y}`));
    return b.every(c => aSet.has(`${c.x},${c.y}`));
}

function includesCellSet(subset, superset) {
    const aSet = new Set(superset.map(c => `${c.x},${c.y}`));
    return subset.every(c => aSet.has(`${c.x},${c.y}`));
}

function sharedCells(a, b) {
    const aSet = new Set(a.map(c => `${c.x},${c.y}`));
    return b.filter(c => aSet.has(`${c.x},${c.y}`)).length;
}

function generateConstraints(grid, x, y, safeCells, mineCells) {
    let progress = false;
    const cell = getCell(grid, x, y);

    // discard any cells that are not opened with more than 0 mines around them
    if (!cell || typeof cell.state !== 'number' || cell.state === 0) return false;

    const neighbors = getNeighbors(grid, x, y);
    const flagged = neighbors.filter(n => n.state === 'F');
    const unknowns = neighbors.filter(n => n.state === 'U');

    const minesLeft = cell.state - flagged.length;
    if (unknowns.length === 0) return false;
    if (minesLeft === 0 || unknowns.length === minesLeft) return applyBasicLogic(grid, cell, x, y, neighbors, safeCells, mineCells);

    // create the constraint: a given cell originates n mines among m cells
    const baseConstraint = {
        origin: { x, y },
        count: minesLeft,
        among: unknowns.length,
        cells: unknowns.map(n => ({ x: n.x, y: n.y }))
    };

    // gather existing constraints
    const constraintSet = new Set();
    const existingConstraints = [];
    for (const n of unknowns) {
        if (!n.constraints) continue;
        for (const c of n.constraints) {
            const key = `${c.origin.x},${c.origin.y}`;
            if (!constraintSet.has(key)) {
                constraintSet.add(key);
                existingConstraints.push(c);
            }
        }
    }

    // skip if the constraint already exists, or a constraint with the same cells
    for (const ex of existingConstraints) {
        if (ex.count >= baseConstraint.count &&
            ex.among === baseConstraint.among &&
            sameCellSet(ex.cells, baseConstraint.cells)) {
            return false;
        }
    }

    let constraint = { ...baseConstraint, cells: [...baseConstraint.cells] };
    for (const ex of existingConstraints) {
        if (ex.among < constraint.among && includesCellSet(ex.cells, constraint.cells)) {
            // check if the existing constraint has a smaller count and among, and the number of shared cells between them is the count value) {
            const exSet = new Set(ex.cells.map(c => `${c.x},${c.y}`));
            constraint = {
                origin: { x, y },
                count: constraint.count - ex.count,
                among: constraint.among - ex.among,
                cells: constraint.cells.filter(c => !exSet.has(`${c.x},${c.y}`))
            };
        }
        else if (ex.count < constraint.count && (constraint.count - ex.count === constraint.among - sharedCells(ex.cells, constraint.cells))) {
            const exSet = new Set(ex.cells.map(c => `${c.x},${c.y}`));
            constraint = {
                origin: { x, y },
                count: constraint.count - ex.count,
                among: constraint.among - sharedCells(ex.cells, constraint.cells),
                cells: constraint.cells.filter(c => !exSet.has(`${c.x},${c.y}`))
            };
        }
    }

    if (constraint.count < 0 || constraint.among <= 0 || constraint.among < constraint.count) return false;

    // immediate deductions
    if (constraint.count === 0) {
        for (const c of constraint.cells) {
            const neighbor = getCell(grid, c.x, c.y);
            if (neighbor.state === 'U') {
                neighbor.state = 'S';
                safeCells.push(neighbor);
                clearConstraints(grid, c.x, c.y);
            }
        }
        return true;
    }
    if (constraint.count === constraint.among) {
        for (const c of constraint.cells) {
            const neighbor = getCell(grid, c.x, c.y);
            if (neighbor.state === 'U') {
                neighbor.state = 'F';
                mineCells.push(neighbor);
                clearConstraints(grid, c.x, c.y);
            }
        }
        return true;
    }

    const removed = [];
    for (const ex of existingConstraints) {
        if ((constraint.among <= ex.among && includesCellSet(constraint.cells, ex.cells)) ||
            (constraint.count >= ex.count && includesCellSet(constraint.cells, ex.cells)) ||
            (constraint.count < ex.count && sharedCells(ex.cells, constraint.cells) == ex.count)) {
            progress = true;
            removed.push(ex);
        }
    }
    for (const ex of removed) {
        for (const c of ex.cells) {
            removeConstraint(grid, c.x, c.y, ex);
        }
    }

    const sharedConstraint = {
        origin: { ...constraint.origin },
        count: constraint.count,
        among: constraint.among,
        cells: constraint.cells.map(c => ({ ...c }))
    };
    for (const n of unknowns) {
        if (!n.constraints) n.constraints = [];
        const exists = n.constraints.some(c => c.origin.x === sharedConstraint.origin.x && c.origin.y === sharedConstraint.origin.y);
        if (!exists) {
            n.constraints.push(sharedConstraint);
            progress = true;
        } else {
            const c = n.constraints.find(c => c.origin.x === sharedConstraint.origin.x && c.origin.y === sharedConstraint.origin.y);
            if (c.count !== sharedConstraint.count || c.among !== sharedConstraint.among ||
                !sameCellSet(c.cells, sharedConstraint.cells)) {
                c.count = sharedConstraint.count;
                c.among = sharedConstraint.among;
                c.cells = sharedConstraint.cells;
                progress = true;
            }
        }
    }
    //return progress;
}

function applyBasicLogic(grid, cell, x, y, neighbors, safeCells, mineCells) {
    // Basic Logic:
    // Square with number n has already n adjacent flags --> remaining adjacent cells are safe
    // Square with number n has 0 adjacent flags and n unopened neighbors --> all unopened neighbors are safe

    const unopened = neighbors.filter(n => n.state === 'U');
    const flagged = neighbors.filter(n => n.state === 'F');
    const minesLeft = cell.state - flagged.length;

    if (unopened.length === 0 || minesLeft < 0) return false;

    if (minesLeft === unopened.length) {
        unopened.forEach(c => {
            mineCells.push(c);
            grid[c.y][c.x] = { ...c, state: 'F' };
        });
        clearConstraints(grid, x, y);
        return true;
    } else if (minesLeft === 0) {
        safeCells.push(cell);
        unopened.forEach(c => {
            grid[c.y][c.x] = { ...c, state: 'S' };
        });
        clearConstraints(grid, x, y);
        return true;
    }
    return false;
}


function getCell(grid, x, y) {
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return null;
    return grid[y][x];
}

function solveMinesweeper(grid, minesLeft, safeCells = [], mineCells = []) {
    let progress = true;
    let gridLengthY = grid.length;
    let gridLengthX = grid[0].length;

    while (progress) {
        progress = false;

        for (let y = 0; y < gridLengthY; y++) {
            for (let x = 0; x < gridLengthX; x++) {
                const cell = grid[y][x];
                if (!cell || typeof cell.state !== 'number') continue;
                const neighbors = getNeighbors(grid, x, y);
                // ####################################################
                // TODO: check for errors that the user might have made
                // ####################################################
                if (applyBasicLogic(grid, cell, x, y, neighbors, safeCells, mineCells)) {
                    progress = true;
                }

                if (generateConstraints(grid, x, y, safeCells, mineCells)) {
                    progress = true;
                }
                if (generateConstraints(grid, x, y, safeCells, mineCells)) {
                    progress = true;
                }

            }
        }
    }
}

function readBoard() {
    const cells = Array.from(document.querySelectorAll('.cell'));
    let maxX = 0, maxY = 0;

    // First: get dimensions
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

    // Second: fill in cell states
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
            return null;
        }

        grid[y][x] = { state, el: cell, constraints: [] };
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

function runHelper() {
    clearHighlights();
    const safeCells = [];
    const mineCells = [];
    const grid = readBoard(safeCells, mineCells);
    if (!grid) {
        console.warn("A mine was clicked. Can't analyze the board.");
        showMessage("A mine is present. Helper paused.");
        return;
    }
    const minesLeft = getMinesLeft();
    solveMinesweeper(grid, minesLeft, safeCells, mineCells);
    console.log(grid);
    highlightCells(safeCells, 'lime');
    highlightCells(mineCells, 'red');
    hideMessage();
}

let game = null;
waitForBoardThenEnableUI();