// Xuất các file icon PNG từ hàm Favicon.svg() trong index.html.
// Cần Google Chrome đã cài và gói playwright-core:  npm i playwright-core
// Chạy từ thư mục gốc:  node tools/make-icons.js
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const JOBS = [ // [tên file, kích thước px, có nền mặt bàn]
  ['icon-180.png', 180, true],   // apple-touch-icon (iOS tự bo góc)
  ['icon-192.png', 192, true],   // manifest (Android)
  ['icon-512.png', 512, true],   // manifest (Android, maskable)
  ['favicon-32.png', 32, false], // favicon PNG cho Safari / trình duyệt cũ
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.goto(PAGE);
  for (const [name, size, bg] of JOBS) {
    const svg = await page.evaluate(b => Favicon.svg(null, b), bg);
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(`<body style="margin:0;background:transparent"><img id="i" width="${size}" height="${size}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}"></body>`);
    await p.waitForTimeout(100);
    const file = path.join(ROOT, name);
    await p.locator('#i').screenshot({ path: file, omitBackground: !bg });
    await p.close();
    console.log('đã ghi', name, fs.statSync(file).size, 'bytes');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
