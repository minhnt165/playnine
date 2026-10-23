import { test, expect, type Page } from '@playwright/test';

// Nổ Khối trong cổng: dựng ván lưu sẵn (playnine-nokhoi-save-v1) rồi nổ một nhóm để kết thúc ván,
// bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end (won chỉ true khi sạch bàn, score gồm 1000 thưởng).

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; score?: number };

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

/** Ván lưu: cols là các cột khối [id, màu] từ dưới lên; đã nổ `pops` lần, đang có `score` điểm. */
async function seedSave(page: Page, cols: number[][][], score: number, pops: number) {
  await page.addInitScript(
    ([c, s, p]) => {
      if (window.localStorage.getItem('playnine-nokhoi-save-v1')) return;
      const game = { v: 1, w: 10, h: 12, k: 4, seed: 1, score: s, pops: p, cols: c };
      window.localStorage.setItem('playnine-nokhoi-save-v1', JSON.stringify({ v: 1, game }));
    },
    [cols, score, pops] as const,
  );
}

async function waitResume(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
}

/** Bấm chuột vào khối đầu tiên (cột 0, hàng dưới cùng); khối không nhận sự kiện, bàn tính ô theo tọa độ. */
async function clickFirstBlock(page: Page) {
  const block = page.frameLocator('iframe').locator('.block').first();
  await expect(block).toBeVisible();
  const box = await block.boundingBox();
  if (!box) throw new Error('không thấy khối');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('nokhoi clearing the board reports a won run with the 1000 bonus', async ({ page }) => {
  await captureMessages(page);
  // Chỉ còn một cột hai khối cùng màu: nổ là sạch bàn, được 0 + 1000 điểm.
  await seedSave(page, [[[0, 1], [1, 1]]], 20, 3);
  await page.goto('#/play/nokhoi');
  await waitResume(page);
  await clickFirstBlock(page);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'nokhoi', mode: 'classic', won: true, score: 1020, assisted: false });
});

test('nokhoi running out of moves reports the score with won false', async ({ page }) => {
  await captureMessages(page);
  // Cột 0: 1 1 2, cột 1: 3. Nổ cặp màu 1 thì còn 2 | 3, hết nước; điểm giữ nguyên 15.
  await seedSave(page, [[[0, 1], [1, 1], [2, 2]], [[3, 3]]], 15, 2);
  await page.goto('#/play/nokhoi');
  await waitResume(page);
  await clickFirstBlock(page);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'nokhoi', mode: 'classic', won: false, score: 15, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-over')).toBeVisible();
});

test('nokhoi abandoning a started game reports won false with the current score', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, [[[0, 1], [1, 1]], [[2, 2], [3, 2]]], 7, 1);
  await page.goto('#/play/nokhoi');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'nokhoi', mode: 'classic', won: false, score: 7, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});
