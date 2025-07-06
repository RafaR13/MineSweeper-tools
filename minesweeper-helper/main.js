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
    // Clear constraints for the cell at (x, y)
    const neighbors = getNeighbors(grid, x, y);
    for (const neighbor of neighbors) {
        if (neighbor.constraints) {
            neighbor.constraints = neighbor.constraints.filter(c => c.origin.x !== x || c.origin.y !== y);
        }
    }
}

function updateConstraints(grid, x, y, safeCells, mineCells) {
    // check the state of the cell at (x,y), and check which constraints if affects and update them
    const cell = getCell(grid, x, y);
    if (!cell || typeof cell.state !== 'number' || cell.state !== 'F' || cell.state !== 'S') return;
    const neighbors = getNeighbors(grid, x, y);
    for (const n of neighbors) {
        (n.constraints || []).forEach(c => {
            generateConstraints(grid, c.origin.x, c.origin.y, safeCells, mineCells);
        });
    }
}

function removeConstraint(grid, x, y, constraint) {
    // Remove a specific constraint from the cell at (x, y)
    const cell = getCell(grid, x, y);
    if (!cell || !cell.constraints) return;
    cell.constraints = cell.constraints.filter(c => c !== constraint);
}

function sameCellSet(a, b) {
    if (a.length !== b.length) return false;
    const aSet = new Set(a.map(c => `${c.x},${c.y}`));
    return b.every(c => aSet.has(`${c.x},${c.y}`));
}

function constraintToString(c) {
    return `From (${c.origin.x},${c.origin.y}): ${c.count} mines among ${c.among} cells`;
}

function generateConstraints(grid, x, y, safeCells, mineCells) {
    const cell = getCell(grid, x, y);
    if (!cell || typeof cell.state !== 'number' || cell.state === 0) return;

    const neighbors = getNeighbors(grid, x, y);
    const flagged = neighbors.filter(n => n.state === 'F');
    const unknowns = neighbors.filter(n => n.state === 'U');

    const minesLeft = cell.state - flagged.length;
    if (minesLeft <= 0 || unknowns.length === 0) return;

    const newCells = unknowns.map(n => ({ x: n.x, y: n.y }));
    let constraint = {
        origin: { x, y },
        count: minesLeft,
        among: unknowns.length,
        cells: newCells
    };

    // check if a more limiting constraint already exists
    const existingConstraints = unknowns.flatMap(n => n.constraints || []);

    for (const ex of existingConstraints) {
        if (ex.count === constraint.count &&
            ex.among === constraint.among &&
            sameCellSet(ex.cells, constraint.cells)) {
            return;
        }
    }

    for (const ex of existingConstraints) {
        if (ex.among < constraint.among) {
            const exSet = new Set(ex.cells.map(c => `${c.x},${c.y}`));
            const newSet = new Set(constraint.cells.map(c => `${c.x},${c.y}`));
            if ([...exSet].every(k => newSet.has(k))) {
                constraint = {
                    origin: { x, y },
                    count: constraint.count - ex.count,
                    among: constraint.among - ex.among,
                    cells: constraint.cells.filter(c => !exSet.has(`${c.x},${c.y}`))
                };
            }
        }
    }

    if (constraint.count < 0 || constraint.among < constraint.count) return;

    // immediate deductions
    if (constraint.count === 0) {
        for (const c of constraint.cells) {
            const neighbor = getCell(grid, c.x, c.y);
            if (neighbor.state === 'U') {
                neighbor.state = 'S';
                safeCells.push(neighbor);
                updateConstraints(grid, c.x, c.y, safeCells, mineCells);
            }
        }
        return;
    }
    if (constraint.count === constraint.among) {
        for (const c of constraint.cells) {
            const neighbor = getCell(grid, c.x, c.y);
            if (neighbor.state === 'U') {
                neighbor.state = 'F';
                mineCells.push(neighbor);
                updateConstraints(grid, c.x, c.y, safeCells, mineCells);
            }
        }
        return;
    }

    const removed = [];
    for (const ex of existingConstraints) {
        if (constraint.among <= ex.among && sameCellSet(constraint.cells, ex.cells)) {
            removed.push(ex);
        }
    }
    for (const ex of removed) {
        for (const c of ex.cells) {
            removeConstraint(grid, c.x, c.y, ex);
        }
    }

    for (const n of unknowns) {
        if (!n.constraints) n.constraints = [];
        const exists = n.constraints.some(c => c.origin.x === x && c.origin.y === y);
        if (!exists) {
            n.constraints.push(constraint);
        } else {
            const c = n.constraints.find(c => c.origin.x === x && c.origin.y === y);
            c.count = constraint.count;
            c.among = constraint.among;
            c.cells = constraint.cells;
        }
    }

    for (const ex of removed) {
        generateConstraints(grid, ex.origin.x, ex.origin.y, safeCells, mineCells);
    }




    /*
        if (constraint.count == 0 && constraint.among > 0) {
            // all cells are safe
            for (const c of constraint.cells) {
                grid[c.y][c.x] = { ...c, state: 'S' };
                safeCells.push(neighbors.find(n => n.x === c.x && n.y === c.y));
                updateConstraints(grid, c.x, c.y, safeCells, mineCells);
            }
            return;
        } else if (constraint.among < 0 || constraint.count < 0) {
            return; // i think never happens
        } else if (constraint.count == constraint.among) {
            // all cells are mines
            for (const c of constraint.cells) {
                grid[c.y][c.x] = { ...c, state: 'F' };
                mineCells.push(neighbors.find(n => n.x === c.x && n.y === c.y));
                updateConstraints(grid, c.x, c.y, safeCells, mineCells);
            }
            return;
        }
    
        // check if the new constraint is more limiting than existing constraints
        let removedConstraints = [];
        for (const existing of existingConstraints) {
            if (constraint.among < existing.among) {
                console.log(constraint, existing);
                removedConstraints.push(existing);
                for (const c of existing.cells) {
                    removeConstraint(grid, c.x, c.y, existing);
                }
            }
        }
    
        for (const n of neighbors) {
            // check if this neighbor belongs to the constraint
            if (!constraint.cells.some(c => c.x === n.x && c.y === n.y)) { continue; }
            // Check if the constraint already exists
            const exists = n.constraints.some(c => c.origin.x === x && c.origin.y === y);
            if (!exists) {
                n.constraints.push(constraint);
            } else {
                // Update the existing constraint
                const existingConstraint = n.constraints.find(c => c.origin.x === x && c.origin.y === y);
                existingConstraint.count = constraint.count;
                existingConstraint.among = constraint.among;
                existingConstraint.cells = constraint.cells;
            }
        }
    
        if (constraint.origin.x === 27 && constraint.origin.y === 2) { console.log("nigga"); console.log(grid); }
    
        if (removedConstraints.length > 0) {
            for (const c of removedConstraints) {
                generateConstraints(grid, c.origin.x, c.origin.y, safeCells, mineCells);
            }
        }*/
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
        unopened.forEach(c => {
            mineCells.push(c);
            grid[c.y][c.x] = { ...c, state: 'F' };
            updateConstraints(grid, c.x, c.y);
        });
        clearConstraints(grid, cell.x, cell.y);
        return true;
    } else if (minesLeft === 0) {
        safeCells.push(cell);

        unopened.forEach(c => {
            grid[c.y][c.x] = { ...c, state: 'S' };
            updateConstraints(grid, c.x, c.y);
        });
        clearConstraints(grid, cell.x, cell.y);
        return true;

    }
    return false;
}

function checkConstraints(grid, x, y, safeCells, mineCells) {
    const cell = getCell(grid, x, y);
    if (!cell || typeof cell.state !== 'number' || cell.state === 0) return false;

    const neighbors = getNeighbors(grid, x, y);
    const unopened = neighbors.filter(n => n.state === 'U');

    // Collect unique constraints from unopened neighbors
    const constraintMap = new Map();
    for (const n of unopened) {
        if (!n.constraints) continue;
        for (const c of n.constraints) {
            const key = `${c.origin.x},${c.origin.y}`;
            constraintMap.set(key, c); // latest version of constraint
        }
    }

    const constraints = [...constraintMap.values()];
    let progress = false;

    for (let i = 0; i < constraints.length; i++) {
        for (let j = 0; j < constraints.length; j++) {
            if (i === j) continue;

            const A = constraints[i];
            const B = constraints[j];
            const aSet = new Set(A.cells.map(c => `${c.x},${c.y}`));
            const bSet = new Set(B.cells.map(c => `${c.x},${c.y}`));

            const isBSubsetOfA = [...bSet].every(k => aSet.has(k));
            const isASubsetOfB = [...aSet].every(k => bSet.has(k));
            if (!isBSubsetOfA && !isASubsetOfB) continue;

            const superset = isBSubsetOfA ? A : B;
            const subset = isBSubsetOfA ? B : A;
            const superSetSet = new Set(superset.cells.map(c => `${c.x},${c.y}`));
            const subSetSet = new Set(subset.cells.map(c => `${c.x},${c.y}`));

            const remainingKeys = [...superSetSet].filter(k => !subSetSet.has(k));
            const remainingMines = superset.count - subset.count;

            const remainingCells = remainingKeys.map(k => {
                const [sx, sy] = k.split(',').map(Number);
                return getCell(grid, sx, sy);
            }).filter(Boolean);

            console.log(`Checking constraints at (${x}, ${y}):`)
            console.log(`  Superset: ${superset.count} mines among ${superset.among} cells`);
            console.log(`  Subset: ${subset.count} mines among ${subset.among} cells`);
            console.log(remainingCells);

            if (remainingMines === 0) {
                for (const c of remainingCells) {
                    if (c.state === 'U') {
                        safeCells.push(c);
                        grid[c.y][c.x] = { ...c, state: 'S' };
                        updateConstraints(grid, c.x, c.y);
                        progress = true;
                    }
                }
            } else if (remainingMines === remainingCells.length) {
                for (const c of remainingCells) {
                    if (c.state === 'U') {
                        mineCells.push(c);
                        grid[c.y][c.x] = { ...c, state: 'F' };
                        updateConstraints(grid, c.x, c.y);
                        progress = true;
                    }
                }
            }
        }
    }

    return progress;
}

function getCell(grid, x, y) {
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return null;
    return grid[y][x];
}

function solveMinesweeper(grid, minesLeft, safeCells = [], mineCells = []) {
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
                if (applyBasicLogic(grid, cell, neighbors, safeCells, mineCells)) {
                    progress = true;
                }
                /*if (checkConstraints(grid, x, y, safeCells, mineCells)) {
                    progress = true;
                }*/
            }
        }
    }

    return { safeCells, mineCells };
}

function readBoard(safeCells, mineCells) {
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
            return null;
        }

        grid[y][x] = { state, el: cell, constraints: [] };
    }
    for (let y = 0; y <= maxY; y++) {
        for (let x = 0; x <= maxX; x++) {
            generateConstraints(grid, x, y, safeCells, mineCells);
        }
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