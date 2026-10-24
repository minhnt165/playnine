import { test, expect, type Page } from '@playwright/test';

// Ô Vuông trong cổng: ván kết thúc báo đúng pn:end. Dựng ván lưu sẵn (dạng engine v1) qua localStorage rồi chơi nốt.
// Không có Supabase cổng vẫn trả pn:ready; bắt tin nhắn pn:* ở khung trên cùng.
// Cạnh đánh số như engine.js: ngang h(r, c) = r*n + c, dọc v(r, c) = (n+1)*n + r*(n+1) + c;
// mỗi cạnh là <g class="edge" data-e="…"> trong SVG, vùng bấm là <polygon class="hit">.

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; timeMs?: number };

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

/** Ván n×n đã kẻ hết trừ cạnh `open`; ô cuối (n²-1) chưa khép, các ô khác chia theo `owners` (chuỗi '1' / '2') */
function lastBoxGame(n: number, open: number, owners: string, turn: 1 | 2) {
  const edges = 2 * n * (n + 1);
  const lines = Array.from({ length: edges }, (_, e) => (e === open ? '0' : String(1 + (e % 2)))).join('');
  return { v: 1, n, lines, boxes: owners + '0', turn, last: -1 };
}

/** Ghi ván lưu (và cài đặt) trước khi trang nạp; chỉ ghi một lần để ván xong không bị dựng lại. */
async function seed(page: Page, save: object | null, settings?: object) {
  await page.addInitScript(
    ([save, settings]) => {
      if (window.sessionStorage.getItem('pn-seeded')) return;
      window.sessionStorage.setItem('pn-seeded', '1');
      if (save) window.localStorage.setItem('playnine-ovuong-save-v1', JSON.stringify(save));
      if (settings) window.localStorage.setItem('playnine-ovuong-settings-v1', JSON.stringify(settings));
    },
    [save, settings ?? null] as const,
  );
}

const waitResume = (page: Page, mode: string) =>
  expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === mode), { timeout: 5000 })
    .toBe(true);

test('ovuong reports a won run when the player closes the last box', async ({ page }) => {
  await captureMessages(page);
  // 3×3, 4–4, chỉ còn cạnh dưới của ô cuối h(3, 2) = 11; tới lượt người chơi (người 1)
  const game = lastBoxGame(3, 11, '11112222', 1);
  await seed(page, { v: 1, game, level: 'easy', human: 1, humanMoves: 10, elapsed: 60000 });
  await page.goto('#/play/ovuong');
  await waitResume(page, 'easy');
  const frame = page.frameLocator('iframe');
  await frame.locator('.edge[data-e="11"] .hit').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ovuong', mode: 'easy', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(60000);
  await expect(frame.locator('#modal-end')).toBeVisible();
  await expect(frame.locator('#end-s1')).toHaveText('5');
});

test('ovuong reports a lost run when the computer closes the last box', async ({ page }) => {
  await captureMessages(page);
  // Cùng thế 4–4 nhưng tới lượt máy (người 2, mức Vừa): máy khép ô cuối, thắng 5–4
  const game = lastBoxGame(3, 11, '11112222', 2);
  await seed(page, { v: 1, game, level: 'medium', human: 1, humanMoves: 10, elapsed: 60000 });
  await page.goto('#/play/ovuong');
  await waitResume(page, 'medium');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'ovuong', mode: 'medium', won: false, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-end')).toBeVisible();
});

test('ovuong reports a draw as won false on the 4x4 board', async ({ page }) => {
  await captureMessages(page);
  // 4×4: người 1 (máy) 8 ô, người 2 (người chơi) 7 ô; người chơi khép ô cuối qua h(4, 3) = 19 thành 8–8
  const game = lastBoxGame(4, 19, '111111112222222', 2);
  await seed(page, { v: 1, game, level: 'hard', human: 2, humanMoves: 20, elapsed: 90000 });
  await page.goto('#/play/ovuong');
  await waitResume(page, 'hard');
  const frame = page.frameLocator('iframe');
  await frame.locator('.edge[data-e="19"] .hit').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ovuong', mode: 'hard', won: false });
  await expect(frame.locator('#end-title')).toHaveText(/draw|hòa/i);
});

test('ovuong reports an abandoned game only after the player has moved', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/ovuong');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.gameId === 'ovuong' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa kẻ cạnh nào: ván mới không hỏi và không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  // Kẻ một cạnh (người chơi đi trước theo mặc định) rồi bỏ ván: hỏi xác nhận, gửi won: false
  await frame.locator('.edge[data-e="0"] .hit').click();
  await expect(frame.locator('.edge[data-e="0"].on')).toHaveCount(1);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'ovuong', mode: 'easy', won: false })]);
});

test('ovuong two-player games are not reported', async ({ page }) => {
  await captureMessages(page);
  // 3×3 hai người, còn một cạnh: người 1 khép ô cuối, ván xong mà không có pn:start / pn:end
  const game = lastBoxGame(3, 11, '11112222', 1);
  await seed(page, { v: 1, game, level: 'pvp', human: 0, humanMoves: 23, elapsed: 60000 }, { level: 'pvp', size: '3' });
  await page.goto('#/play/ovuong');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#player-1 .pname')).toHaveText(/Player 1|Người 1/);
  await frame.locator('.edge[data-e="11"] .hit').click();
  await expect(frame.locator('#modal-end')).toBeVisible();
  const sent = (await messages(page)).filter((m) => m.type === 'pn:start' || m.type === 'pn:end');
  expect(sent).toEqual([]);
});
