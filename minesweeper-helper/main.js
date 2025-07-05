let observer = null; // moved outside so we can control it from anywhere
let observerActive = false;
let previouslyHighlighted = [];

function runHelper() {
    clearHighlights();
    const safeCells = [];
    const mineCells = [];
    const grid = readBoard(safeCells, mineCells);
    const minesLeft = getMinesLeft();
    solveMinesweeper(grid, minesLeft, safeCells, mineCells);
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
    if (!cell || typeof cell.state !== 'number' || cell.state !== 'F') return;
    for (const constraint of cell.constraints) {
        generateConstraints(grid, constraint.origin.x, constraint.origin.y, safeCells, mineCells);
    }
}

function generateConstraints(grid, x, y, safeCells, mineCells) {
    const cell = getCell(grid, x, y);
    if (!cell || typeof cell.state !== 'number' || cell.state === 0) return;

    let neighbors = getNeighbors(grid, x, y);
    const flagged = neighbors.filter(n => n.state === 'F');
    neighbors = neighbors.filter(n => n.state === 'U'); // keep only unknown neighbors

    const minesLeft = cell.state - flagged.length;
    if (minesLeft <= 0 || neighbors.length === 0) return;

    let constraint = {
        origin: { x, y },
        count: minesLeft,
        among: neighbors.length,
        cells: neighbors.map(n => ({ x: n.x, y: n.y }))
    };

    // check if a more limiting constraint already exists
    const existingConstraints = neighbors.flatMap(n => n.constraints || []);
    for (const existing of existingConstraints) {
        // check if there is already a constraint with same among, count and cells

        if (existing.among == constraint.among && existing.count === constraint.count &&
            existing.cells.every(c => constraint.cells.some(nc => nc.x === c.x && nc.y === c.y))
        ) { return; }
        // check if existing constraint has a smaller "among" value. if so, we can make our constraint smaller
        if (existing.among < constraint.among) {
            // check if all cells in the existing constraint are also in the new constraint
            const existingCellsSet = new Set(existing.cells.map(c => `${c.x},${c.y}`));
            const newCellsSet = new Set(constraint.cells.map(c => `${c.x},${c.y}`));
            if ([...existingCellsSet].every(k => newCellsSet.has(k))) {
                // If the existing constraint is a subset of the new constraint, we can replace it
                constraint.among = constraint.among - (existing.among);
                constraint.count = constraint.count - (existing.count);
                constraint.cells = constraint.cells.filter(c => !existingCellsSet.has(`${c.x},${c.y}`));
            }
        }
    }

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

/*function checkConstraints(grid, x, y, safeCells, mineCells) {
    const cell = getCell(grid, x, y);
    if (!cell || typeof cell.state !== 'number' || cell.state === 0) return false;

    // get neighbors and unopened neighbors
    const neighbors = getNeighbors(grid, x, y);
    const unopened = neighbors.filter(n => n.state === 'U');

    // collect unique constraints and count how many times each appears
    const constraintMap = new Map();
    for (const n of unopened) {
        if (!n.constraints) continue;
        for (const c of n.constraints) {
            const key = `${c.origin.x},${c.origin.y}`;
            if (!constraintMap.has(key)) {
                constraintMap.set(key, { ...c, count: 1 });
            } else {
                constraintMap.get(key).count++;
            }
        }
    }

    // check if any constraint reveals information
    const constraints = [...constraintMap.values()];
    let progress = false;

}*/

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
            console.warn(`Skipping invalid cell at (${x}, ${y}):`, classList);
            continue;
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

// #####################################################################

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
    //if (checkAll11Patterns(grid, x, y, safeCells)) progress = true;
    //if (progress) {
    //if (applyBasicLogic(grid, grid[y][x], getNeighbors(grid, x, y), safeCells, mineCells)) progress = true;
    //}
    //if (checkAll121Patterns(grid, x, y, mineCells, safeCells)) progress = true;
    //if (checkAll1221Patterns(grid, x, y, mineCells, safeCells)) progress = true;
    if (checkAll12Patterns(grid, x, y, mineCells)) progress = true;
    return progress;
}

function checkAll11Patterns(grid, x, y, safeCells) {
    const get = (dx, dy) => getCell(grid, x + dx, y + dy);
    const isNumber = (c) => !c || typeof c.state === 'number' || c.state === 'S';
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
            mustBeUnknowns: [[0, -1], [1, -1], [2, -1]],
            toMarkSafe: [[2, -1], [2, 0], [2, 1]],
            cantBeFlagged: [[2, 0], [2, 1]],
        },
        {
            name: "Vertical ↓",
            pattern: [[0, 0], [0, 1]],
            mustBeNumbers: [[0, -1], [-1, -1], [1, -1], [-1, 0], [-1, 1]],
            mustBeUnknowns: [[1, 0], [1, 1], [1, 2]],
            toMarkSafe: [[1, 2], [0, 2], [-1, 2]],
            cantBeFlagged: [[0, 2], [-1, 2]]
        }
    ];

    const generateVariants = (dir) => {
        const invertX = ([dx, dy]) => [-dx, dy];
        const invertY = ([dx, dy]) => [dx, -dy];

        const variants = [
            { ...dir, name: dir.name + "", transform: (pt) => pt }, // original
            { ...dir, name: dir.name + " (Flip Y)", transform: invertY },
            { ...dir, name: dir.name + " (Flip X)", transform: invertX },
        ];

        return variants.map(variant => ({
            name: variant.name,
            pattern: dir.pattern.map(variant.transform),
            mustBeNumbers: dir.mustBeNumbers.map(variant.transform),
            mustBeUnknowns: dir.mustBeUnknowns.map(variant.transform),
            toMarkSafe: dir.toMarkSafe.map(variant.transform),
            cantBeFlagged: dir.cantBeFlagged.map(variant.transform),
        }));
    };

    for (const baseDir of directions) {
        const allVariants = generateVariants(baseDir);
        for (const dir of allVariants) {
            if (
                dir.pattern.every(([dx, dy]) => get(dx, dy)?.state === 1) && // check if pattern cells are 1
                dir.mustBeNumbers.every(([dx, dy]) => isNumber(get(dx, dy))) && // check if cells are numbers (0-8) (opened and not flagged, or wall)
                dir.mustBeUnknowns.every(([dx, dy]) => isUnknown(get(dx, dy))) && // check if cells are unknown (Unopened)
                dir.cantBeFlagged.every(([dx, dy]) => get(dx, dy)?.state !== 'F') // check if cells are not flagged (opened and safe, unopened, or wall)
            ) {
                let progress = false;
                for (const [dx, dy] of dir.toMarkSafe) {
                    if (addSafe(get(dx, dy))) progress = true;
                }
                if (progress) console.log("checking at", x, y, "direction:", dir.name);
                return progress;
            }
        }
    }
    return false;
}

function checkAll12Patterns(grid, x, y, mineCells) {
    const get = (dx, dy) => getCell(grid, x + dx, y + dy);
    const isNumber = (c) => !c || typeof c.state === 'number' || c.state === 'S';
    const isUnknown = (c) => c?.state === 'U';

    const addMine = (cell) => {
        if (isUnknown(cell)) {
            mineCells.push(cell);
            cell.state = 'F';
            return true;
        }
        return false;
    };

    const directions = [
        {
            name: "Horizontal →",
            pattern: [[0, 0], [1, 0]],
            mustBeNumbers: [[0, 1], [1, 1]],
            mustBeUnknowns: [[0, -1], [1, -1], [2, -1]],
            toFlag: [[2, -1]],
            toFlag3and4: [[2, 0], [2, 1]],
            cantBeFlagged: [[-1, -1], [-1, 0], [-1, 1]]
        },
        {
            name: "Vertical ↓",
            pattern: [[0, 0], [0, 1]],
            mustBeNumbers: [[1, 0], [1, 1]],
            mustBeUnknowns: [[-1, 0], [-1, 1], [-1, 2]],
            toFlag: [[-1, 2]],
            toFlag3and4: [[0, 2], [1, 2]],
            cantBeFlagged: [[1, -1], [0, -1], [-1, -1]]
        }
    ];

    const generateVariants = (dir) => {
        const invertX = ([dx, dy]) => [-dx, dy];
        const invertY = ([dx, dy]) => [dx, -dy];

        const variants = [
            { ...dir, name: dir.name + "", transform: (pt) => pt }, // original
            { ...dir, name: dir.name + " (Flip Y)", transform: invertY },
            { ...dir, name: dir.name + " (Flip X)", transform: invertX },
        ];

        return variants.map(variant => ({
            name: variant.name,
            pattern: dir.pattern.map(variant.transform),
            mustBeNumbers: dir.mustBeNumbers.map(variant.transform),
            mustBeUnknowns: dir.mustBeUnknowns.map(variant.transform),
            toFlag: dir.toFlag.map(variant.transform),
            toFlag3and4: dir.toFlag3and4.map(variant.transform),
            cantBeFlagged: dir.cantBeFlagged.map(variant.transform)
        }));
    };

    for (const baseDir of directions) {
        const allVariants = generateVariants(baseDir);
        for (const dir of allVariants) {
            if (
                get(dir.pattern[0][0], dir.pattern[0][1])?.state === 1 && // check if first pattern cell is 1
                [2, 3, 4].includes(get(dir.pattern[1][0], dir.pattern[1][1])?.state) && // check if second pattern cell is 2, 3, or 4
                dir.mustBeNumbers.every(([dx, dy]) => isNumber(get(dx, dy))) && // check if cells are numbers (0-8) (opened and not flagged, or wall)
                dir.mustBeUnknowns.every(([dx, dy]) => isUnknown(get(dx, dy))) && // check if cells are unknown (Unopened)
                dir.cantBeFlagged.every(([dx, dy]) => get(dx, dy)?.state !== 'F') // check if cells are not flagged (opened and safe, unopened, or wall)
            ) {
                // if state of second pattern cell is 2, toflag3and4 must opened and not flagged
                if (get(dir.pattern[1][0], dir.pattern[1][1]).state === 2) {
                    if (!dir.toFlag3and4.every(([dx, dy]) => isNumber(get(dx, dy)))) {
                        continue;
                    }
                    return addMine(get(dir.toFlag[0][0], dir.toFlag[0][1]));
                } else if (get(dir.pattern[1][0], dir.pattern[1][1]).state === 3) {
                    // one of toflag3and3 must be unknown and the other opened and not flagged
                    if (!(dir.toFlag3and4.some(([dx, dy]) => isUnknown(get(dx, dy))) &&
                        dir.toFlag3and4.some(([dx, dy]) => isNumber(get(dx, dy))))) {
                        continue;
                    }
                    let progress = false;
                    if (addMine(get(dir.toFlag[0][0], dir.toFlag[0][1]))) progress = true;
                    // add the mine to the unknown cell
                    for (const [dx, dy] of dir.toFlag3and4) {
                        if (isUnknown(get(dx, dy))) {
                            if (addMine(get(dx, dy))) progress = true;
                        }
                    }
                    return progress;
                } else {
                    // both of toflag3and4 must be unknown
                    if (!dir.toFlag3and4.every(([dx, dy]) => isUnknown(get(dx, dy)))) {
                        continue;
                    }
                    let progress = false;
                    if (addMine(get(dir.toFlag[0][0], dir.toFlag[0][1]))) progress = true;
                    // add the mine to the unknown cells
                    for (const [dx, dy] of dir.toFlag3and4) {
                        if (addMine(get(dx, dy))) progress = true;
                    }
                    return progress;
                }
            }
        }
    }
    return false;
}

function checkHoles(grid, x, y, safeCells) { }

/*function checkAll121Patterns(grid, x, y, mineCells, safeCells) { return false; }
function checkAll1221Patterns(grid, x, y, mineCells, safeCells) { return false; }*/