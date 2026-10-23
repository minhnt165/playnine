import { test, expect } from '@playwright/test';
import { manifests } from './manifests';

// Mỗi game (theo games/*/game.json): URL /playnine/<dir>/ không đổi, mở thẳng không có SDK vẫn chạy, không có lỗi trang.
// Chạy ở cả máy tính và điện thoại (project mobile).

// Game cũ phát pageerror khi tải thường: không sửa game, ghi vào đây kèm lý do.
const knownPageErrors: Record<string, string> = {};

for (const g of manifests()) {
  test(`${g.dir}/ loads standalone without the SDK`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/sdk/playnine.js*', (r) => r.abort());
    const res = await page.goto(`${g.dir}/`);
    expect(res?.status()).toBe(200);
    expect((await page.title()).trim()).not.toBe('');
    await page.waitForTimeout(500);
    if (!(g.dir in knownPageErrors)) expect(errors).toEqual([]);
  });
}
