import { test, expect } from '@playwright/test';

// URL của 17 game không được đổi: /playnine/<dir>/ (sudoku nằm ở sugoku/).
const dirs = [
  '2048', 'bonlientiep', 'caro', 'co9o', 'codam', 'coganh', 'colat', 'covua', 'minesweeper',
  'oanquan', 'phagach', 'ran', 'sugoku', 'tranhan', 'xepbai', 'xepgach', 'xiangqi',
];

// Game cũ phát pageerror khi tải thường: không sửa game, ghi vào đây kèm lý do.
const knownPageErrors: Record<string, string> = {};

for (const dir of dirs) {
  test(`legacy url ${dir}/ loads`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const res = await page.goto(`${dir}/`);
    expect(res?.status()).toBe(200);
    expect((await page.title()).trim()).not.toBe('');
    if (!(dir in knownPageErrors)) expect(errors).toEqual([]);
  });
}
