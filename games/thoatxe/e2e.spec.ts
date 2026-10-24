import { test, expect, type Page } from '@playwright/test';

// Test riêng của Thoát Xe chạy trong cổng (#/play/thoatxe). Không có Supabase: cổng vẫn trả pn:ready,
// nên game gửi pn:start / pn:end; bắt thẳng tin nhắn ở khung trên cùng.

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean };

async function captureMessages(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const w = window as unknown as { __pn: unknown[] };
    w.__pn = [];
    window.addEventListener('message', (e) => {
      if (e.data && typeof e.data === 'object' && String(e.data.type).startsWith('pn:')) w.__pn.push(e.data);
    });
  });
}

const messages = (page: Page) => page.evaluate(() => (window as unknown as { __pn: Msg[] }).__pn);

// Bàn 1 mức Dễ (5 nước tối thiểu). Lời giải: xe đỏ (xe 0) sang cột 3, xe 2 → 1, xe 3 → 1, xe 4 → 0, xe đỏ → cột 4.
const PUZZLE = 'G.HEEEG.H..DIAA..DIF.BBC.F...C.F....';
const save = (hist: number[][]) => JSON.stringify({ v: 1, game: { v: 1, level: 'easy', board: 0, puzzle: PUZZLE, min: 5, hist, assisted: false } });

test('thoatxe reports a cleared board as a won run with assisted false', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu đã đi 4 nước đầu của lời giải: chỉ còn trượt xe đỏ từ cột 3 ra cột 4.
  const saved = save([[0, 1, 3], [2, 0, 1], [3, 3, 1], [4, 1, 0]]);
  await page.addInitScript((s) => {
    if (window.localStorage.getItem('playnine-thoatxe-save-v1')) return;
    window.localStorage.setItem('playnine-thoatxe-save-v1', s);
  }, saved);
  await page.goto('#/play/thoatxe');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#moves')).toHaveText('4');
  // Chọn xe đỏ rồi End: trượt hết cỡ tới cửa
  await frame.locator('.car[data-car="0"]').focus();
  await page.keyboard.press('End');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'thoatxe', mode: 'easy', won: true, assisted: false });
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(frame.locator('#win-stars .on')).toHaveCount(3);
});

test('thoatxe reports a board solved with hints as assisted', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/thoatxe');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Bàn 1 cần 5 nước: mỗi lần Gợi ý đi giúp một nước của lời giải ngắn nhất
  for (let k = 0; k < 5; k++) await frame.locator('#btn-hint').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'thoatxe', mode: 'easy', won: true, assisted: true });
  await expect(frame.locator('#moves')).toHaveText('5');
});

test('thoatxe reports a restarted board with moves as a lost run', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript((s) => {
    if (window.localStorage.getItem('playnine-thoatxe-save-v1')) return;
    window.localStorage.setItem('playnine-thoatxe-save-v1', s);
  }, save([[0, 1, 3]]));
  await page.goto('#/play/thoatxe');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#moves')).toHaveText('1');
  await frame.locator('#btn-level').focus();
  // Chơi lại cần bấm R hai lần
  await page.keyboard.press('r');
  await page.keyboard.press('r');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'thoatxe', mode: 'easy', won: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBe(2);
  await expect(frame.locator('#moves')).toHaveText('0');
});
