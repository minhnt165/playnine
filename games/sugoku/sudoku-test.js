/* Kiểm tra engine: chạy `node sudoku-test.js [số ván mỗi độ khó]`
 * - Lưới đầy hợp lệ, đề khớp đáp án, mỗi đề có đúng một nghiệm
 * - Solver backtracking tìm lại đúng đáp án
 * - Mức kỹ thuật engine chấm nằm trong khoảng yêu cầu của độ khó
 * - Solver kỹ thuật không bao giờ điền sai hoặc loại nhầm ứng viên đúng
 * - Cùng seed thì sinh cùng đề (ván hằng ngày)
 */
const Sudoku = require('./engine.js');

const ROUNDS = Number(process.argv[2]) || 20;
const DIFFICULTIES = {
  easy: { givens: 40, minLevel: 1, maxLevel: 1 },
  medium: { givens: 34, minLevel: 1, maxLevel: 1 },
  hard: { givens: 29, minLevel: 2, maxLevel: 2 },
  expert: { givens: 25, minLevel: 3, maxLevel: 3 },
  extreme: { givens: 17, minLevel: 4, maxLevel: 4 },
};

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

function isValidFull(grid) {
  if (grid.length !== 81) return false;
  for (let u = 0; u < 9; u++) {
    const row = new Set();
    const col = new Set();
    const box = new Set();
    for (let k = 0; k < 9; k++) {
      const rv = grid[u * 9 + k];
      const cv = grid[k * 9 + u];
      const br = Math.floor(u / 3) * 3 + Math.floor(k / 3);
      const bc = (u % 3) * 3 + (k % 3);
      const bv = grid[br * 9 + bc];
      if (rv < 1 || rv > 9 || cv < 1 || cv > 9 || bv < 1 || bv > 9) return false;
      row.add(rv);
      col.add(cv);
      box.add(bv);
    }
    if (row.size !== 9 || col.size !== 9 || box.size !== 9) return false;
  }
  return true;
}

/** Chạy solver kỹ thuật từng bước, kiểm tra mọi bước đều đúng với đáp án. */
function checkTechniques(puzzle, solution, tag) {
  const g = Sudoku.makeGrid(puzzle);
  let steps = 0;
  for (;;) {
    const step = Sudoku.nextStep(g);
    if (!step) break;
    steps++;
    assert(steps < 2000, `${tag} solver kỹ thuật lặp vô hạn`);
    if (step.type === 'place') {
      assert(solution[step.idx] === step.value, `${tag} kỹ thuật ${step.technique} điền sai ô ${step.idx}`);
    } else {
      assert(step.eliminations.length > 0, `${tag} bước loại trừ rỗng`);
      for (const e of step.eliminations) {
        assert(solution[e.idx] !== e.digit, `${tag} kỹ thuật ${step.technique} loại nhầm số đúng ${e.digit} ở ô ${e.idx}`);
      }
    }
    Sudoku.applyStep(g, step);
  }
}

let total = 0;
let offTarget = 0;
const t0 = Date.now();
for (const [name, spec] of Object.entries(DIFFICULTIES)) {
  let sumGivens = 0;
  let sumMs = 0;
  let maxMs = 0;
  let sumAttempts = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const tag = `[${name}#${r}]`;
    const start = Date.now();
    const { puzzle, solution, givens, level, attempts } = Sudoku.generatePuzzle(spec, 60);
    const ms = Date.now() - start;
    sumMs += ms;
    maxMs = Math.max(maxMs, ms);
    sumAttempts += attempts;

    assert(isValidFull(solution), `${tag} đáp án không hợp lệ`);
    assert(puzzle.filter((v) => v !== 0).length === givens, `${tag} số ô cho trước không khớp`);
    for (let i = 0; i < 81; i++) {
      assert(puzzle[i] === 0 || puzzle[i] === solution[i], `${tag} ô ${i} không khớp đáp án`);
    }
    assert(Sudoku.countSolutions(puzzle, 2) === 1, `${tag} đề không có nghiệm duy nhất`);
    const solved = Sudoku.solve(puzzle);
    assert(solved && solved.every((v, i) => v === solution[i]), `${tag} solver giải sai`);
    assert(Sudoku.grade(puzzle).level === level, `${tag} chấm lại cho mức khác`);
    if (level < spec.minLevel || level > spec.maxLevel) offTarget++;
    checkTechniques(puzzle, solution, tag);

    sumGivens += givens;
    total++;
  }
  console.log(
    `${name.padEnd(8)} mức ${spec.minLevel}-${spec.maxLevel} | TB ô cho trước ${(sumGivens / ROUNDS).toFixed(1)} | TB ${(sumAttempts / ROUNDS).toFixed(1)} lần thử | TB ${(sumMs / ROUNDS).toFixed(0)} ms, max ${maxMs} ms`
  );
}

// Solver nhận biết đề nhiều nghiệm / mâu thuẫn
const empty = new Array(81).fill(0);
assert(Sudoku.countSolutions(empty, 2) === 2, 'lưới trống phải có >= 2 nghiệm');
const conflict = new Array(81).fill(0);
conflict[0] = 1;
conflict[1] = 1;
assert(Sudoku.countSolutions(conflict, 2) === 0, 'lưới mâu thuẫn phải vô nghiệm');

// Ván hằng ngày: cùng seed thì cùng đề, khác seed thì khác đề
const seed = Sudoku.hashString('sudoku-daily-2026-09-25');
const spec = DIFFICULTIES.hard;
const a = Sudoku.withRandom(Sudoku.seededRandom(seed), () => Sudoku.generatePuzzle(spec, 60));
const b = Sudoku.withRandom(Sudoku.seededRandom(seed), () => Sudoku.generatePuzzle(spec, 60));
const c = Sudoku.withRandom(Sudoku.seededRandom(seed + 1), () => Sudoku.generatePuzzle(spec, 60));
assert(a.puzzle.join('') === b.puzzle.join(''), 'cùng seed phải sinh cùng đề');
assert(a.puzzle.join('') !== c.puzzle.join(''), 'khác seed phải sinh khác đề');

console.log(
  `\nOK: ${total} đề, tất cả đều có đúng một nghiệm và mọi bước kỹ thuật đều đúng. ` +
    `${offTarget} đề lệch mức yêu cầu sau 60 lần thử. Tổng ${((Date.now() - t0) / 1000).toFixed(1)}s`
);
