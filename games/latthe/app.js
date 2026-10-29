/* =====================================================================
 * Lật Thẻ - Logic game + render (cần i18n.js, engine.js nạp trước)
 *   - Mỗi bàn là một ván gửi lên cổng (xếp hạng theo thời gian, nhanh nhất đứng đầu)
 *   - Đồng hồ chạy từ lần lật đầu tiên, tạm dừng khi ẩn trang
 *   - Thẻ là <button> trong lưới CSS; app.js chọn số cột theo khung màn hình
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.LatThe;
  const APP_VERSION = '1.0.1';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'latthe' });
  // Âm thanh / pháo giấy của SDK: SDK cũ hoặc chạy không có SDK thì im lặng, không lỗi
  const SFX = PN && PN.sfx ? PN.sfx : null;
  const sfx = (name, opts) => {
    try {
      SFX && SFX.play(name, opts);
    } catch (e) { /* bỏ qua */ }
  };
  const confetti = () => {
    try {
      PN && PN.fx && PN.fx.confetti();
    } catch (e) { /* bỏ qua */ }
  };
  const t = I18N.t;

  // Điền chữ tĩnh theo ngôn ngữ trước khi vẽ phần động
  I18N.apply();

  const PREFIX = 'playnine-latthe-';
  const SAVE_KEY = PREFIX + 'save-v1';
  const SETTINGS_KEY = PREFIX + 'settings-v1';
  const STATS_KEY = PREFIX + 'stats-v1';
  const SUMMARY_KEY = PREFIX + 'summary-v1';

  // Hình trên mặt thẻ: SVG vẽ sẵn (không dùng emoji) để mọi máy hiện giống nhau.
  // Khung 48x48, viền đậm cùng tông + vệt sáng. Bộ hình mang chất Việt; mỗi hình một dáng
  // và một màu chủ đạo riêng để không phải dựa vào màu mới phân biệt được.
  const HI = '#fff'; // màu vệt sáng
  const ICONS = [
    // 0 Đèn lồng đỏ
    `<path d="M24 4.6v5" stroke="#7a4a12" stroke-width="2" stroke-linecap="round"/>
    <rect x="17" y="9.4" width="14" height="4.2" rx="1.6" fill="#f2c14e" stroke="#9a6a12" stroke-width="1.6"/>
    <ellipse cx="24" cy="24" rx="14.4" ry="11.2" fill="#e2372b" stroke="#8e1c15" stroke-width="2.2"/>
    <path d="M24 12.8c-5.4 3-5.4 19.4 0 22.4M24 12.8c5.4 3 5.4 19.4 0 22.4M24 12.8v22.4M13 19.6c3.6 1.6 18.4 1.6 22 0M13 28.4c3.6-1.6 18.4-1.6 22 0" fill="none" stroke="#a8241b" stroke-width="1.3"/>
    <path d="M14.4 19.4c-1.4 3-1.4 6.4 0 9.2" fill="none" stroke="${HI}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    <rect x="17" y="34.4" width="14" height="4.2" rx="1.6" fill="#f2c14e" stroke="#9a6a12" stroke-width="1.6"/>
    <path d="M20.6 38.8v5M24 38.8v6M27.4 38.8v5" stroke="#e0a63a" stroke-width="1.8" stroke-linecap="round"/>`,
    // 1 Nón lá
    `<path d="M24 7.4 42.4 33c-6.4 3.4-30.4 3.4-36.8 0z" fill="#f0d590" stroke="#9a7428" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M12.4 25.4c6.4 2 16.8 2 23.2 0M16.6 19.4c4.4 1.4 10.4 1.4 14.8 0M20.4 14.2c2.2.8 5 .8 7.2 0" fill="none" stroke="#c49a42" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M22.4 11.4 14 29" stroke="${HI}" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
    <path d="M11.4 34.4c3.2 7.6 22 7.6 25.2 0" fill="none" stroke="#c8372d" stroke-width="2.2" stroke-linecap="round"/>`,
    // 2 Hoa sen hồng
    `<ellipse cx="24" cy="37.4" rx="16" ry="4.4" fill="#4cae6a" stroke="#22703a" stroke-width="2"/>
    <g fill="#f4a3c1" stroke="#a8325f" stroke-width="2" stroke-linejoin="round">
      <path d="M16.6 11.6c5 2.2 7.8 9 7.4 21.4-6.6-4-8.8-12.6-7.4-21.4zM31.4 11.6c-5 2.2-7.8 9-7.4 21.4 6.6-4 8.8-12.6 7.4-21.4z"/>
      <path d="M7.6 19c8 .2 14.4 6 16.4 14.4-9 1.4-16-4.6-16.4-14.4zM40.4 19c-8 .2-14.4 6-16.4 14.4 9 1.4 16-4.6 16.4-14.4z"/>
    </g>
    <path d="M24 8.4c4.6 5.4 5.6 14.4 0 25-5.6-10.6-4.6-19.6 0-25z" fill="#f78fb3" stroke="#a8325f" stroke-width="2" stroke-linejoin="round"/>
    <path d="M22.4 14c-1.4 3-1.6 7-.6 10.4" fill="none" stroke="${HI}" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`,
    // 3 Bát phở
    `<path d="M15 14.6c-2.2-2 2.2-4 0-6.4M21 13.4c-2.2-2 2.2-4 0-6.4" fill="none" stroke="#9fb4c8" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M6.6 24.6h34.8c0 9.4-7.8 15.6-17.4 15.6S6.6 34 6.6 24.6z" fill="#fdfdfb" stroke="#2f5e9e" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M10.4 31.4c4.6 1.6 22.6 1.6 27.2 0" fill="none" stroke="#2f5e9e" stroke-width="1.6" stroke-dasharray="3 2"/>
    <path d="M18 40h12v2.6H18z" fill="#2f5e9e"/>
    <ellipse cx="24" cy="24.6" rx="17.4" ry="4.6" fill="#f3c46b" stroke="#a5651e" stroke-width="1.8"/>
    <path d="M11.6 24.8c2.4-1.8 4.4 1.8 6.8 0s4.4 1.8 6.8 0 4.4 1.8 6.8 0 3.4 1.2 4.6.4" fill="none" stroke="#fff6dc" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="16.6" cy="23.4" r="1.6" fill="#43a047"/><circle cx="29.6" cy="25.8" r="1.6" fill="#43a047"/><circle cx="23" cy="22.8" r="1.4" fill="#e53935"/>
    <path d="M31.4 5.4 19.4 25.6M37 7.4 23 26.6" stroke="#8a5a2b" stroke-width="2.4" stroke-linecap="round"/>`,
    // 4 Bánh chưng
    `<rect x="8.6" y="9.6" width="30.8" height="29.6" rx="3.4" fill="#2f8f46" stroke="#17532a" stroke-width="2.2"/>
    <path d="M12 13.4l5.6 5.6M30.4 29.6l5.6 5.6M30.6 13.6l5 5" stroke="#5fc06f" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
    <path d="M19 9.6v29.6M29 9.6v29.6M8.6 19.6h30.8M8.6 29.6h30.8" stroke="#ecdca8" stroke-width="2.6"/>
    <path d="M19 9.6v29.6M29 9.6v29.6M8.6 19.6h30.8M8.6 29.6h30.8" stroke="#b39a54" stroke-width=".8" stroke-dasharray="1.2 1.6"/>
    <path d="M11.6 12.6h4.6" stroke="${HI}" stroke-width="2" stroke-linecap="round" opacity=".5"/>`,
    // 5 Cà phê phin
    `<rect x="22" y="4.4" width="4" height="2.6" rx="1" fill="#6b7884"/>
    <rect x="17" y="6.6" width="14" height="3.6" rx="1.6" fill="#d7dde3" stroke="#6b7884" stroke-width="1.6"/>
    <path d="M18 10.2h12l-1.4 9.6H19.4z" fill="#c9d1d9" stroke="#6b7884" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="12.6" y="19.4" width="22.8" height="3.2" rx="1.6" fill="#b8c2cc" stroke="#6b7884" stroke-width="1.6"/>
    <path d="M15 22.6h18l-1.8 16a3.2 3.2 0 0 1-3.2 2.8h-8a3.2 3.2 0 0 1-3.2-2.8z" fill="#e8f1f6" stroke="#6b7884" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M16 28.6h16l-1.2 10a2.2 2.2 0 0 1-2.2 1.8h-9.2a2.2 2.2 0 0 1-2.2-1.8z" fill="#6b3a1a"/>
    <path d="M16.8 35.4h14.4l-.4 3.2a2.2 2.2 0 0 1-2.2 1.8h-9.2a2.2 2.2 0 0 1-2.2-1.8z" fill="#f3e1b8"/>
    <path d="M24 22.8v3.4" stroke="#5a3418" stroke-width="2" stroke-linecap="round"/>
    <path d="M17.6 25v11" stroke="${HI}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
    // 6 Thuyền buồm
    `<path d="M24 7v24" stroke="#4e2c10" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M25.4 8.6c7.4 4.2 11.6 12.4 11.6 20.8H25.4z" fill="#f08a2c" stroke="#9a4a0e" stroke-width="2" stroke-linejoin="round"/>
    <path d="M25.4 15h6.6M25.4 21h9.6M25.4 26.2h11" stroke="#9a4a0e" stroke-width="1.4"/>
    <path d="M22.6 11.6c-4.2 5.2-8 11.4-10 17.8h10z" fill="#f6b04a" stroke="#9a4a0e" stroke-width="2" stroke-linejoin="round"/>
    <path d="M7 31h34l-5.4 6.4H12.4z" fill="#8a5426" stroke="#4e2c10" stroke-width="2" stroke-linejoin="round"/>
    <path d="M11 33.4h26" stroke="#c08048" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M4.6 41.4c4-2 6.4-2 9.6 0s6.4 2 9.6 0 6.4-2 9.6 0 6.4 2 9.6 0" fill="none" stroke="#2f8fd0" stroke-width="2.4" stroke-linecap="round"/>`,
    // 7 Trống đồng
    `<circle cx="24" cy="24" r="18" fill="#d49a3a" stroke="#7a4f12" stroke-width="2.2"/>
    <circle cx="24" cy="24" r="14.6" fill="none" stroke="#9c6a1e" stroke-width="1.4"/>
    <circle cx="24" cy="24" r="16.3" fill="none" stroke="#7a4f12" stroke-width="1.6" stroke-dasharray=".1 3.2" stroke-linecap="round"/>
    <circle cx="24" cy="24" r="11.4" fill="none" stroke="#9c6a1e" stroke-width="1" stroke-dasharray="2 1.8"/>
    <path d="M24 15.5L24.8 20.9L28.3 16.6L26.3 21.7L31.4 19.8L27.1 23.2L32.5 24L27.1 24.8L31.4 28.3L26.3 26.3L28.3 31.4L24.8 27.1L24 32.5L23.2 27.1L19.8 31.4L21.7 26.3L16.6 28.3L20.9 24.8L15.5 24L20.9 23.2L16.6 19.8L21.7 21.7L19.7 16.6L23.2 20.9z" fill="#ffe08a" stroke="#7a4f12" stroke-width="1" stroke-linejoin="round"/>
    <path d="M11.4 17.4a14 14 0 0 1 7-7" fill="none" stroke="${HI}" stroke-width="2" stroke-linecap="round" opacity=".55"/>`,
    // 8 Xoài
    `<path d="M14.6 15.4c6-6.2 18.6-5.4 23.6 3 5 8.4 2 18.6-6.2 20.4-6 1.4-9.2-2-13.2-4-6.2-3.2-10.4-12.4-4.2-19.4z" fill="#ffc533" stroke="#a8730e" stroke-width="2.2" stroke-linejoin="round"/>
    <ellipse cx="31.4" cy="27.6" rx="5" ry="7.4" transform="rotate(-15 31.4 27.6)" fill="#ff8d2e" opacity=".45"/>
    <path d="M15.4 15.6c-.8-2.8-2.6-4.8-4.8-5.8" fill="none" stroke="#6b3d14" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M12.6 10.6c3-5 10.2-6 14.4-3-4 4.2-10.4 5.2-14.4 3z" fill="#4caf50" stroke="#2a6e2a" stroke-width="1.8" stroke-linejoin="round"/>
    <ellipse cx="19.6" cy="20.6" rx="2.4" ry="4.4" transform="rotate(40 19.6 20.6)" fill="${HI}" opacity=".6"/>`,
    // 9 Thanh long
    `<g fill="#7cc84a" stroke="#2f7a2a" stroke-width="1.4" stroke-linejoin="round">
      <path d="M24 13.6c-2.2-3-1.4-6.4 1-8.6 1.2 3.2 1 6.4-1 8.6z"/>
      <path d="M16.4 17.4c-4-.8-6.4-3-7.4-6.4 3.4 0 6.4 2.2 7.4 6.4zM31.6 17.4c4-.8 6.4-3 7.4-6.4-3.4 0-6.4 2.2-7.4 6.4z"/>
      <path d="M12.6 28c-3.2 1.2-6.2.4-8.2-1.8 3.2-1.2 6.2-1 8.2 1.8zM35.4 28c3.2 1.2 6.2.4 8.2-1.8-3.2-1.2-6.2-1-8.2 1.8z"/>
    </g>
    <ellipse cx="24" cy="27" rx="12" ry="14" fill="#e83e8c" stroke="#8e1450" stroke-width="2.2"/>
    <g fill="#7cc84a" stroke="#2f7a2a" stroke-width="1.2" stroke-linejoin="round">
      <path d="M24 19.6c-2.4-.4-4-2-4.4-4.2 2.4.2 4 1.6 4.4 4.2zM29.4 26.6c1.6-1.8 3.8-2.4 6-1.8-1.4 1.8-3.6 2.4-6 1.8zM18.6 28.6c-1.6-1.8-3.8-2.4-6-1.8 1.4 1.8 3.6 2.4 6 1.8zM24 35.4c2.4-.4 4-2 4.4-4.2-2.4.2-4 1.6-4.4 4.2z"/>
    </g>
    <ellipse cx="17.6" cy="22.6" rx="2" ry="4.2" transform="rotate(20 17.6 22.6)" fill="${HI}" opacity=".5"/>`,
    // 10 Con trâu
    `<g fill="#efe3c8" stroke="#7a6a4a" stroke-width="1.8" stroke-linejoin="round">
      <path d="M17 17.4c-7.2 1-12.4-3-13.4-10.4 3 3.2 7.4 5.2 13.4 4.4zM31 17.4c7.2 1 12.4-3 13.4-10.4-3 3.2-7.4 5.2-13.4 4.4z"/>
    </g>
    <g fill="#5d6670" stroke="#2e353c" stroke-width="1.6">
      <ellipse cx="12.6" cy="20.6" rx="4.4" ry="2.4" transform="rotate(-20 12.6 20.6)"/><ellipse cx="35.4" cy="20.6" rx="4.4" ry="2.4" transform="rotate(20 35.4 20.6)"/>
    </g>
    <path d="M15.6 14.6c3.4-2.4 13.4-2.4 16.8 0 2.2 5.2 2.2 11.4 0 15.6H15.6c-2.2-4.2-2.2-10.4 0-15.6z" fill="#6f7a85" stroke="#2e353c" stroke-width="2.2" stroke-linejoin="round"/>
    <ellipse cx="24" cy="33" rx="9.4" ry="6.6" fill="#a3adb7" stroke="#2e353c" stroke-width="2"/>
    <ellipse cx="20.8" cy="33.4" rx="1.4" ry="1.9" fill="#2e353c"/><ellipse cx="27.2" cy="33.4" rx="1.4" ry="1.9" fill="#2e353c"/>
    <circle cx="19.4" cy="21.8" r="1.8" fill="#1b1f24"/><circle cx="28.6" cy="21.8" r="1.8" fill="#1b1f24"/>
    <circle cx="19.9" cy="21.2" r=".6" fill="${HI}"/><circle cx="29.1" cy="21.2" r=".6" fill="${HI}"/>
    <path d="M18 16.4c2.4-1 5-1.2 7.2-.8" fill="none" stroke="${HI}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>`,
    // 11 Cây tre
    `<path d="M14 21.4c-4-3-8.2-3-10.4-.8 3.2 2.2 7.2 3 10.4.8z" fill="#4caf50" stroke="#2a6e2a" stroke-width="1.6" stroke-linejoin="round"/>
    <g stroke="#2a6e2a" stroke-width="2" stroke-linejoin="round">
      <rect x="14" y="5.6" width="7.4" height="37" rx="2.2" fill="#8bd05a"/>
      <rect x="26.6" y="10" width="7.4" height="32.6" rx="2.2" fill="#62b54c"/>
    </g>
    <path d="M14 16.4h7.4M14 28h7.4M26.6 20.4h7.4M26.6 31.8h7.4" stroke="#2a6e2a" stroke-width="2"/>
    <path d="M16.4 8v6M16.4 18.6v7.2M16.4 30.2v10" stroke="#dcf3c2" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M21.4 14c5-4.2 11.6-4.4 15.8-2.2-4.2 3.2-10.6 4.2-15.8 2.2zM34 25.4c3.6-1.2 7.2-.4 9.6 1.8-3.6 1.2-7.2.6-9.6-1.8z" fill="#4caf50" stroke="#2a6e2a" stroke-width="1.6" stroke-linejoin="round"/>`,
    // 12 Cánh diều
    `<path d="M24 39.4c-2.4 2.4 2.4 3.6 0 6.2" fill="none" stroke="#203f9a" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M20.6 41.6 24 43.2l-3.4 1.6zM27.4 41.6 24 43.2l3.4 1.6z" fill="#ff6b6b" stroke="#b33" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M24 4.6 37.6 20 24 39.4 10.4 20z" fill="#4f7cf0" stroke="#203f9a" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M24 4.6 37.6 20H24z" fill="#86a8ff"/>
    <path d="M10.4 20H24v19.4z" fill="#3a63d4"/>
    <path d="M24 4.6 37.6 20 24 39.4 10.4 20zM24 4.6v34.8M10.4 20h27.2" fill="none" stroke="#203f9a" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M17 13.4l3.4-4" stroke="${HI}" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
    // 13 Đèn ông sao
    `<path d="M33.6 31.4 43 41.6" stroke="#8a5a2b" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M24 5L28.1 16.3L40.2 16.7L30.7 24.2L34 35.8L24 29L14 35.8L17.3 24.2L7.8 16.7L19.9 16.3z" fill="#ffd23f" stroke="#b07a0a" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M24 15L25.8 19.6L30.7 19.8L26.9 22.9L28.1 27.7L24 25L19.9 27.7L21.1 22.9L17.3 19.8L22.2 19.6z" fill="#ff7a3d" stroke="#c0471a" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M14 35.8l-1.4 4.6M34 35.8l1.4 4.6" stroke="#e53935" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M21.2 10.6l-1.2 3.6" stroke="${HI}" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
    // 14 Bánh mì
    `<path d="M8.4 34.4c-3-3.4-1-8.6 4-11.6l18-11.4c5-3 10.4-2.4 11.4.8 1 3.2-1 7.2-5 10.2l-18 11.8c-4 2.6-8.4 2.2-10.4.2z" fill="#e8a64a" stroke="#8a5216" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M9.6 30.6c4.6-.4 8.6-2.6 12.4-5.2l12-8c2.4-1.6 4.6-3.4 5.6-5" fill="none" stroke="#c07a28" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>
    <path d="M13.6 24.6l3.6 4.6M19.6 20.6l3.6 4.6M25.6 16.6l3.6 4.6M31.6 13l3 4" stroke="#fbe2a6" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M12.6 22.8c4-2.6 9.4-6 13.6-8.8" fill="none" stroke="${HI}" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>`,
    // 15 Trái dừa
    `<path d="M24 14.4c10.4 0 15.4 8 15.4 15s-6.2 13-15.4 13-15.4-6-15.4-13 5-15 15.4-15z" fill="#5cb85c" stroke="#2a6e2a" stroke-width="2.2"/>
    <path d="M31.8 22.4c2.6 3 3.4 7.4 2 11.4" fill="none" stroke="#2a6e2a" stroke-width="1.4" stroke-linecap="round" opacity=".5"/>
    <ellipse cx="24" cy="17.6" rx="8.4" ry="3.2" fill="#fff6dc" stroke="#2a6e2a" stroke-width="1.8"/>
    <path d="M26 18.2 33.4 5.6h4.2" fill="none" stroke="#ff5a7a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="15.6" cy="27.4" rx="2.2" ry="4.4" transform="rotate(20 15.6 27.4)" fill="${HI}" opacity=".5"/>`,
    // 16 Ấm trà
    `<path d="M13.2 25 5.4 17.4c-1-1-.2-2.2 1-2 3 .8 6 3 8.2 5z" fill="#2fb3a8" stroke="#1d6e6a" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M34.4 19.6c6-1.2 8.4 3.8 6.4 8s-5 5-7.2 5" fill="none" stroke="#1d6e6a" stroke-width="3" stroke-linecap="round"/>
    <path d="M11.6 26.4c0-7 5.2-11.2 12.4-11.2s12.4 4.2 12.4 11.2-5.2 12-12.4 12-12.4-5-12.4-12z" fill="#2fb3a8" stroke="#1d6e6a" stroke-width="2.2"/>
    <path d="M12.2 28.4h23.6" stroke="#f2c14e" stroke-width="2"/>
    <path d="M17 15.8c1-3 4-5 7-5s6 2 7 5z" fill="#2fb3a8" stroke="#1d6e6a" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="24" cy="9.2" r="2" fill="#f2c14e" stroke="#9a6a12" stroke-width="1.4"/>
    <rect x="17" y="37.4" width="14" height="3.2" rx="1.2" fill="#1d6e6a"/>
    <ellipse cx="17.4" cy="22.4" rx="2.2" ry="3.4" transform="rotate(30 17.4 22.4)" fill="${HI}" opacity=".55"/>`,
    // 17 Quạt giấy
    `<path d="M24 38 7 22A23.3 23.3 0 0 1 41 22z" fill="#9b6be0" stroke="#4e2a8a" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M24 38 11.9 18.1M24 38 24 14.7M24 38 36.1 18.1" stroke="#4e2a8a" stroke-width="1.2"/>
    <path d="M24 38 17.7 15.6 11.9 18.1zM24 38 30.3 15.6 36.1 18.1z" fill="#c3a3f5"/>
    <path d="M24 38 17.7 15.6M24 38 30.3 15.6M24 38 7 22M24 38 41 22" stroke="#4e2a8a" stroke-width="1.2"/>
    <path d="M10.8 21.2A19.6 19.6 0 0 1 37.2 21.2" fill="none" stroke="#ffd23f" stroke-width="1.6" stroke-dasharray="2.4 2"/>
    <path d="M24 38v6" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/>
    <circle cx="24" cy="38" r="2.2" fill="#f2c14e" stroke="#9a6a12" stroke-width="1.4"/>`,
  ];
  const ICON_SPRITE = '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">' +
    ICONS.map((g, i) => `<symbol id="lt-face-${i}" viewBox="0 0 48 48">${g}</symbol>`).join('') + '</svg>';
  document.body.insertAdjacentHTML('afterbegin', ICON_SPRITE);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';
  const faceNames = String(t('face.names')).split('|');
  const faceName = (f) => faceNames[f] || String(f + 1);

  const RATIO = 1.3; // chiều cao / chiều rộng thẻ
  const MAX_CARD = 132; // px, cạnh ngang thẻ lớn nhất
  const MISMATCH_MS = 900; // thời gian cặp sai còn mở trước khi úp lại
  const WIN_DELAY = 650; // chờ thẻ cuối lật xong rồi mới hiện bảng thắng

  const $ = (id) => document.getElementById(id);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const wait = (ms) => (reduceMotion.matches ? 0 : ms);

  /* ---------------- localStorage (luôn bọc try/catch) ---------------- */
  function readJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* bỏ qua: hết dung lượng hoặc bị chặn */ }
  }
  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Cài đặt ---------------- */
  const DEFAULT_SETTINGS = { mode: 'easy', theme: 'auto', vibrate: true };
  let settings = loadSettings();

  function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    const raw = readJSON(SETTINGS_KEY);
    if (raw && typeof raw === 'object') {
      if (E.MODE_KEYS.indexOf(raw.mode) >= 0) s.mode = raw.mode;
      if (['auto', 'light', 'dark'].indexOf(raw.theme) >= 0) s.theme = raw.theme;
      if (typeof raw.vibrate === 'boolean') s.vibrate = raw.vibrate;
    }
    return s;
  }
  function saveSettings() {
    writeJSON(SETTINGS_KEY, settings);
  }

  /* ---------------- Thống kê ---------------- */
  // Mỗi độ khó: played (bàn đã lật ít nhất 1 thẻ), won, best (ms, nhanh nhất), bestMoves (ít lượt nhất)
  const emptyMode = () => ({ played: 0, won: 0, best: null, bestMoves: null });
  const emptyStats = () => {
    const modes = {};
    E.MODE_KEYS.forEach((m) => {
      modes[m] = emptyMode();
    });
    return { v: 1, modes };
  };
  let stats = loadStats();

  function loadStats() {
    const s = emptyStats();
    const raw = readJSON(STATS_KEY);
    if (raw && typeof raw === 'object' && raw.modes && typeof raw.modes === 'object') {
      E.MODE_KEYS.forEach((m) => {
        const r = raw.modes[m];
        if (!r || typeof r !== 'object') return;
        ['played', 'won'].forEach((k) => {
          if (Number.isInteger(r[k]) && r[k] >= 0) s.modes[m][k] = r[k];
        });
        if (typeof r.best === 'number' && r.best > 0 && isFinite(r.best)) s.modes[m].best = Math.round(r.best);
        if (Number.isInteger(r.bestMoves) && r.bestMoves > 0) s.modes[m].bestMoves = r.bestMoves;
      });
    }
    return s;
  }
  function saveStats() {
    writeJSON(STATS_KEY, stats);
  }

  /* ---------------- Định dạng ---------------- */
  /** m:ss, hoặc m:ss.d khi precise. */
  function formatTime(ms, precise) {
    ms = Math.max(0, ms || 0);
    const tenths = Math.floor(ms / 100);
    const sec = Math.floor(tenths / 10);
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, '0');
    return precise ? `${m}:${s}.${tenths % 10}` : `${m}:${s}`;
  }
  const modeLabel = (m) => t('mode.' + m);

  /* ---------------- Ván chơi ---------------- */
  let game = null;
  let elapsed = 0; // ms đã chơi (không tính lúc đồng hồ đang chạy)
  let clockStart = null; // performance.now() khi đồng hồ đang chạy
  let tickTimer = null;
  let hideTimer = null; // hẹn giờ úp lại cặp sai
  let reported = false; // đã gửi kết quả bàn hiện tại lên cổng
  let streak = 0; // số cặp đúng liên tiếp (tiếng cao dần)
  let cursor = 0; // thẻ đang giữ focus bàn phím
  let booted = false; // chỉ phát tiếng "bắt đầu" khi người chơi chọn ván mới, không phát lúc mở trang

  const started = () => !!game && game.flips > 0;
  const playing = () => !!game && game.status === 'playing';

  function elapsedMs() {
    return elapsed + (clockStart !== null ? performance.now() - clockStart : 0);
  }
  function startClock() {
    if (clockStart !== null || !playing() || !started()) return;
    clockStart = performance.now();
    clearInterval(tickTimer);
    tickTimer = setInterval(renderTime, 250);
  }
  function stopClock() {
    if (clockStart !== null) {
      elapsed += performance.now() - clockStart;
      clockStart = null;
    }
    clearInterval(tickTimer);
    tickTimer = null;
    renderTime();
  }

  /** Gửi kết quả bàn cho cổng một lần duy nhất. */
  function report(won, timeMs) {
    if (reported || !game) return;
    reported = true;
    if (!PN) return;
    if (won) PN.gameEnd({ mode: game.mode, won: true, timeMs, assisted: false });
    else PN.gameEnd({ mode: game.mode, won: false, assisted: false });
  }

  /** Bỏ bàn đang chơi dở (đã lật ít nhất một thẻ) thì tính là thua. */
  function abandon() {
    if (playing() && started()) report(false);
  }

  function newGame(mode) {
    abandon();
    clearTimeout(hideTimer);
    stopClock();
    closeModal('modal-win');
    if (E.MODE_KEYS.indexOf(mode) < 0) mode = 'easy';
    settings.mode = mode;
    saveSettings();
    game = E.createGame(mode);
    elapsed = 0;
    reported = false;
    streak = 0;
    cursor = 0;
    buildBoard(true);
    renderHud();
    persist();
    writeSummary();
    if (booted) sfx('start');
    PN && PN.gameStart({ mode });
  }

  /* ---------------- Lưu / khôi phục ---------------- */
  function persist() {
    if (!playing()) {
      removeKey(SAVE_KEY);
      return;
    }
    writeJSON(SAVE_KEY, { v: 1, game: E.toJSON(game), elapsed: Math.round(elapsedMs()), savedAt: Date.now() });
  }

  function restoreGame() {
    const raw = readJSON(SAVE_KEY);
    if (!raw || raw.v !== 1) return null;
    const g = E.fromJSON(raw.game);
    if (!g) return null;
    const ms = typeof raw.elapsed === 'number' && isFinite(raw.elapsed) && raw.elapsed > 0 ? raw.elapsed : 0;
    return { game: g, elapsed: g.flips > 0 ? ms : 0 };
  }

  /* ---------------- Tóm tắt cho cổng PlayNine ---------------- */
  function totals() {
    let played = 0;
    let won = 0;
    E.MODE_KEYS.forEach((m) => {
      played += stats.modes[m].played;
      won += stats.modes[m].won;
    });
    return { played, won };
  }

  /** Kỷ lục ở mức khó nhất đã từng thắng. */
  function headlineBest() {
    for (let i = E.MODE_KEYS.length - 1; i >= 0; i--) {
      const m = E.MODE_KEYS[i];
      if (stats.modes[m].best) return { mode: m, time: stats.modes[m].best };
    }
    return null;
  }

  function writeSummary() {
    const { played, won } = totals();
    const best = headlineBest();
    let note;
    if (!played) note = t('summary.noGames');
    else if (!won) note = t('summary.noWins', { n: played });
    else if (best) note = t('summary.winsBest', { mode: modeLabel(best.mode), time: formatTime(best.time, true) });
    else note = t('summary.wins', { n: won });

    const headline = [];
    if (played) {
      headline.push({ value: String(won), label: t('summary.statWins') });
      if (best) headline.push({ value: formatTime(best.time, true), label: t('summary.statBest', { mode: modeLabel(best.mode) }) });
    }

    let resume = null;
    if (playing() && started()) {
      const pct = E.progress(game);
      resume = {
        title: t('summary.resume', { mode: modeLabel(game.mode) }),
        detail: t('summary.resumeDetail', { done: E.matchedPairs(game), total: E.pairCount(game), time: formatTime(elapsedMs()) }),
        pct: Math.round(pct * 1000) / 1000,
      };
    }

    writeJSON(SUMMARY_KEY, { v: 1, updatedAt: Date.now(), played, won, note, stats: headline, resume });
  }

  /* ---------------- Bàn thẻ ---------------- */
  const area = $('board-area');
  const board = $('board');
  let cardEls = [];

  function makeCard(i) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card';
    el.dataset.i = String(i);
    el.dataset.face = String(game.faces[i]);
    el.tabIndex = -1;
    const inner = document.createElement('span');
    inner.className = 'card-inner';
    const back = document.createElement('span');
    back.className = 'card-back';
    const front = document.createElement('span');
    front.className = 'card-front';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'glyph');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVG_NS, 'use');
    const k = game.faces[i] % ICONS.length;
    use.setAttribute('href', '#lt-face-' + k);
    use.setAttributeNS(XLINK_NS, 'xlink:href', '#lt-face-' + k);
    svg.appendChild(use);
    front.appendChild(svg);
    inner.append(back, front);
    el.appendChild(inner);
    return el;
  }

  function buildBoard(intro) {
    board.textContent = '';
    cardEls = game.faces.map((f, i) => {
      const el = makeCard(i);
      if (intro && !reduceMotion.matches) {
        el.classList.add('enter');
        el.style.setProperty('--d', Math.min(600, i * 28) + 'ms');
        el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
      }
      board.appendChild(el);
      return el;
    });
    board.classList.add('no-anim');
    board.classList.remove('won');
    renderCards();
    requestAnimationFrame(() => requestAnimationFrame(() => board.classList.remove('no-anim')));
    cursor = Math.min(cursor, cardEls.length - 1);
    syncCursor(false);
    layout();
  }

  function renderCard(i) {
    const el = cardEls[i];
    if (!el) return;
    const matched = game.matched[i];
    const up = matched || game.open.indexOf(i) >= 0;
    el.classList.toggle('up', up);
    el.classList.toggle('matched', matched);
    el.setAttribute('aria-pressed', String(up));
    const n = i + 1;
    const name = faceName(game.faces[i]);
    el.setAttribute('aria-label', matched ? t('card.matched', { n, name }) : up ? t('card.up', { n, name }) : t('card.down', { n }));
  }

  function renderCards() {
    cardEls.forEach((el, i) => renderCard(i));
    board.classList.toggle('locked', E.isLocked(game));
  }

  /** Chọn lưới (cột x hàng) cho thẻ lớn nhất trong khung hiện tại. */
  function layout() {
    if (!game) return;
    // Khung trừ lề trong (điện thoại dọc có lề 4px hai bên)
    const cs = getComputedStyle(area);
    const W = area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = area.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!W || !H) return;
    let best = null;
    E.MODES[game.mode].grids.forEach(([c, r]) => {
      const gap = Math.max(4, Math.min(12, Math.round(Math.min(W / c, H / r) * 0.07)));
      const cw = Math.min((W - gap * (c - 1)) / c, (H - gap * (r - 1)) / (r * RATIO));
      if (!best || cw > best.cw + 0.5) best = { c, r, cw, gap };
    });
    const cw = Math.max(24, Math.floor(Math.min(best.cw, MAX_CARD)));
    board.style.setProperty('--cols', String(best.c));
    board.style.setProperty('--cw', cw + 'px');
    board.style.setProperty('--ch', Math.floor(cw * RATIO) + 'px');
    board.style.setProperty('--gap', best.gap + 'px');
    board.dataset.cols = String(best.c);
  }

  /* ---------------- HUD ---------------- */
  function renderTime() {
    $('time').textContent = formatTime(elapsedMs());
  }

  function renderHud() {
    renderTime();
    $('moves').textContent = I18N.fmtNumber(game.moves);
    const b = stats.modes[game.mode].best;
    $('best').textContent = b ? formatTime(b, true) : '—';
    renderModeSwitch();
  }

  function renderModeSwitch() {
    document.querySelectorAll('#mode-switch button').forEach((b) => {
      const on = !!game && b.dataset.mode === game.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.title = t('mode.pairs', { n: E.MODES[b.dataset.mode].pairs });
    });
  }

  /* ---------------- Chơi ---------------- */
  function vibrate(ms) {
    if (!settings.vibrate || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch (e) { /* bỏ qua */ }
  }

  function announce(msg) {
    const el = $('announcer');
    el.textContent = '';
    // Gán lại sau một nhịp để trình đọc màn hình đọc cả khi chuỗi trùng lần trước
    setTimeout(() => {
      el.textContent = msg;
    }, 30);
  }

  /** Chạy lại một hiệu ứng CSS (gỡ lớp, ép reflow, gắn lại). */
  function replayClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  const canPlay = () => playing() && !document.querySelector('.modal:not([hidden])');

  function onCard(i) {
    if (!canPlay()) return;
    if (E.isLocked(game)) return; // cặp sai đang mở: khóa tới khi úp lại
    const first = !started();
    const res = E.flip(game, i);
    if (!res) return;
    if (first) {
      // Lật thẻ đầu tiên của bàn: bắt đầu tính giờ và tính một lần chơi
      stats.modes[game.mode].played++;
      saveStats();
      startClock();
    }
    cursor = i;
    syncCursor(false);
    sfx('flip', { pitch: res.kind === 'first' ? 1 : 1.12 });
    renderCards();

    if (res.kind === 'match') {
      streak++;
      const [a, b] = res.pair;
      setTimeout(() => {
        [a, b].forEach((x) => replayClass(cardEls[x], 'pop'));
        if (!res.won) sfx(streak >= 3 ? 'combo' : 'merge', { pitch: 1 + Math.min(streak - 1, 6) * 0.05 });
        vibrate(25);
      }, wait(260));
      announce(t('say.match', { name: faceName(game.faces[a]), left: E.remainingPairs(game) }));
      if (res.won) onWin();
    } else if (res.kind === 'mismatch') {
      streak = 0;
      const [a, b] = res.pair;
      setTimeout(() => {
        if (game.open.indexOf(a) < 0) return;
        [a, b].forEach((x) => replayClass(cardEls[x], 'wrong'));
        sfx('error', { volume: 0.35 });
      }, wait(300));
      announce(t('say.mismatch', { a: faceName(game.faces[a]), b: faceName(game.faces[b]) }));
      const g = game;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (game !== g) return;
        const pair = E.hide(game);
        if (!pair) return;
        pair.forEach((x) => cardEls[x] && cardEls[x].classList.remove('wrong'));
        renderCards();
        persist();
      }, MISMATCH_MS);
    }
    renderHud();
    persist();
    if (res.kind !== 'first') writeSummary();
  }

  function onWin() {
    stopClock();
    const ms = Math.max(1, Math.round(elapsed));
    report(true, ms);
    const st = stats.modes[game.mode];
    const prevBest = st.best;
    st.won++;
    const newBest = !st.best || ms < st.best;
    if (newBest) st.best = ms;
    if (!st.bestMoves || game.moves < st.bestMoves) st.bestMoves = game.moves;
    saveStats();
    removeKey(SAVE_KEY);
    writeSummary();
    renderHud();

    $('win-time').textContent = formatTime(ms, true);
    $('win-moves').textContent = I18N.fmtNumber(game.moves);
    $('win-best').textContent = formatTime(st.best, true);
    const note = $('win-note');
    const perfect = game.moves === E.pairCount(game);
    note.hidden = !(perfect || (newBest && prevBest));
    note.textContent = perfect ? t('win.perfect') : t('win.newBest');
    const idx = E.MODE_KEYS.indexOf(game.mode);
    const harder = E.MODE_KEYS[idx + 1];
    const btnHarder = $('btn-win-harder');
    btnHarder.hidden = !harder;
    if (harder) {
      btnHarder.textContent = t('win.harder', { mode: modeLabel(harder) });
      btnHarder.dataset.mode = harder;
    }
    board.classList.add('won');
    setTimeout(() => {
      if (game.status !== 'won') return;
      sfx('win');
      confetti();
      openModal('modal-win');
    }, wait(WIN_DELAY));
  }

  /* ---------------- Ván mới / đổi độ khó ---------------- */
  let pendingMode = null;

  /** Đổi độ khó hoặc ván mới; bàn đang chơi dở thì hỏi lại trước. */
  function requestGame(mode) {
    if (!game) return;
    mode = mode || game.mode;
    if (playing() && started()) {
      pendingMode = mode;
      $('confirm-title').textContent = mode === game.mode ? t('confirm.newTitle') : t('confirm.modeTitle', { mode: modeLabel(mode) });
      openModal('modal-confirm');
      return;
    }
    // Bàn chưa lật thẻ nào hoặc đã xong: chia bàn mới luôn
    newGame(mode);
  }

  $('btn-confirm-ok').addEventListener('click', () => {
    const mode = pendingMode || game.mode;
    pendingMode = null;
    closeModal('modal-confirm');
    newGame(mode);
  });

  /* ---------------- Bàn phím trên lưới thẻ ---------------- */
  function syncCursor(focus) {
    cardEls.forEach((el, i) => {
      el.tabIndex = i === cursor ? 0 : -1;
    });
    if (focus && cardEls[cursor]) cardEls[cursor].focus();
  }

  board.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.card');
    if (!el) return;
    onCard(Number(el.dataset.i));
  });

  board.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('.card');
    if (el) {
      cursor = Number(el.dataset.i);
      syncCursor(false);
    }
  });

  board.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const cols = Number(board.dataset.cols) || 4;
    const n = cardEls.length;
    let next = -1;
    if (e.key === 'ArrowRight') next = Math.min(n - 1, cursor + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, cursor - 1);
    else if (e.key === 'ArrowDown') next = cursor + cols < n ? cursor + cols : cursor;
    else if (e.key === 'ArrowUp') next = cursor - cols >= 0 ? cursor - cols : cursor;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    cursor = next;
    syncCursor(true);
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const open = document.querySelector('.modal:not([hidden])');
    if (e.key === 'Escape' && open) {
      closeModal(open.id);
      return;
    }
    if (open) {
      trapFocus(e, open);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'n') requestGame(game.mode);
    else if (k === '1' || k === '2' || k === '3') requestGame(E.MODE_KEYS[Number(k) - 1]);
    else return;
    e.preventDefault();
  });

  /* ---------------- Độ khó ---------------- */
  (function () {
    const buttons = Array.from(document.querySelectorAll('#mode-switch button'));
    buttons.forEach((b) => b.addEventListener('click', () => {
      if (game && b.dataset.mode === game.mode && playing()) return;
      sfx('tap');
      requestGame(b.dataset.mode);
    }));
    $('mode-switch').addEventListener('keydown', (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % buttons.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + buttons.length) % buttons.length;
      if (j < 0) return;
      e.preventDefault();
      // Phím mũi tên chỉ chuyển focus, bấm mới đổi (đổi là chia bàn mới)
      buttons[j].focus();
    });
  })();

  /* ---------------- Modal ---------------- */
  let lastFocus = null;

  function openModal(id) {
    const m = $(id);
    if (!m.hidden) return;
    document.querySelectorAll('.modal:not([hidden])').forEach((x) => { x.hidden = true; });
    lastFocus = document.activeElement;
    m.hidden = false;
    const visible = (el) => el.offsetParent !== null;
    const target = Array.from(m.querySelectorAll('.btn-primary')).find(visible) || Array.from(m.querySelectorAll('button')).find(visible);
    if (target) target.focus();
  }
  function closeModal(id) {
    const m = $(id);
    if (!m || m.hidden) return;
    m.hidden = true;
    if (id === 'modal-confirm') {
      pendingMode = null;
      renderModeSwitch();
    }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function trapFocus(e, modal) {
    if (e.key !== 'Tab') return;
    const items = Array.from(modal.querySelectorAll('button, input')).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('[data-close]');
    if (c) closeModal(c.getAttribute('data-close'));
  });

  /* ---------------- Cài đặt ---------------- */
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    requestAnimationFrame(() => {
      $('theme-color').content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f5ecdc';
    });
  }

  function renderSettings() {
    document.querySelectorAll('.segmented[data-setting]').forEach((seg) => {
      const key = seg.dataset.setting;
      seg.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.value === (key === 'lang' ? I18N.lang : settings[key]);
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
    });
    document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
      sw.checked = !!settings[sw.dataset.setting];
    });
  }

  document.querySelectorAll('.segmented[data-setting]').forEach((seg) => {
    const key = seg.dataset.setting;
    const buttons = Array.from(seg.querySelectorAll('button'));
    const choose = (b) => {
      if (key === 'lang') {
        // Lưu ván rồi tải lại trang theo ngôn ngữ mới
        if (b.dataset.value === I18N.lang) return;
        saveAll();
        I18N.set(b.dataset.value);
        return;
      }
      settings[key] = b.dataset.value;
      saveSettings();
      renderSettings();
      if (key === 'theme') applyTheme();
    };
    buttons.forEach((b) => b.addEventListener('click', () => choose(b)));
    seg.addEventListener('keydown', (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % buttons.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + buttons.length) % buttons.length;
      if (j < 0) return;
      e.preventDefault();
      // Ngôn ngữ: phím mũi tên chỉ chuyển focus, bấm mới đổi (đổi là tải lại trang)
      if (key !== 'lang') choose(buttons[j]);
      buttons[j].focus();
    });
  });
  document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
    sw.addEventListener('change', () => {
      settings[sw.dataset.setting] = sw.checked;
      saveSettings();
    });
  });
  // Âm thanh: lưu ở khóa chung với cổng (qua SDK); không có SDK âm thanh thì ẩn hàng này
  const soundSwitch = $('sw-sound');
  const syncSound = () => {
    soundSwitch.checked = !!SFX && !SFX.isMuted();
  };
  $('setting-sound').hidden = !SFX;
  if (SFX) {
    syncSound();
    soundSwitch.addEventListener('change', () => {
      SFX.setMuted(!soundSwitch.checked);
      sfx('tap');
    });
    if (SFX.onChange) SFX.onChange(syncSound);
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'auto') applyTheme();
  });

  /* ---------------- Thống kê ---------------- */
  function renderStats() {
    const { played, won } = totals();
    $('st-played').textContent = I18N.fmtNumber(played);
    $('st-won').textContent = I18N.fmtNumber(won);
    $('st-rate').textContent = played ? Math.round((won / played) * 100) + '%' : '—';
    const list = $('st-best-list');
    list.textContent = '';
    E.MODE_KEYS.forEach((m) => {
      const s = stats.modes[m];
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = modeLabel(m) + ' · ' + t('mode.pairs', { n: E.MODES[m].pairs });
      const dd = document.createElement('dd');
      dd.textContent = s.best
        ? t('stats.bestLine', { time: formatTime(s.best, true), moves: t('stats.movesShort', { n: s.bestMoves }) })
        : t('stats.none');
      dd.classList.toggle('none', !s.best);
      row.append(dt, dd);
      list.appendChild(row);
    });
    const reset = $('btn-stats-reset');
    reset.classList.remove('confirm');
    reset.textContent = t('stats.reset');
  }

  $('btn-stats-reset').addEventListener('click', () => {
    const reset = $('btn-stats-reset');
    if (!reset.classList.contains('confirm')) {
      reset.classList.add('confirm');
      reset.textContent = t('stats.resetConfirm');
      return;
    }
    stats = emptyStats();
    // Bàn đang chơi dở vẫn tính là một lần chơi
    if (playing() && started()) stats.modes[game.mode].played = 1;
    saveStats();
    renderHud();
    writeSummary();
    closeModal('modal-stats');
    toast(t('toast.statsReset'));
  });

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  /* ---------------- Nút ---------------- */
  $('btn-new').addEventListener('click', () => requestGame(game.mode));
  $('btn-win-again').addEventListener('click', () => newGame(game.mode));
  $('btn-win-harder').addEventListener('click', (e) => newGame(e.currentTarget.dataset.mode));
  $('btn-stats').addEventListener('click', () => {
    renderStats();
    openModal('modal-stats');
  });
  $('btn-settings').addEventListener('click', () => {
    renderSettings();
    openModal('modal-settings');
  });

  /** Lưu ván + tóm tắt (rời trang hoặc tải lại vì đổi ngôn ngữ). */
  function saveAll() {
    if (!game) return;
    persist();
    writeSummary();
  }
  document.addEventListener('visibilitychange', () => {
    if (!game) return;
    if (document.hidden) {
      stopClock();
      saveAll();
    } else {
      startClock();
    }
  });
  window.addEventListener('pagehide', saveAll);
  I18N.onBeforeReload(saveAll);

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => layout()).observe(area);
  } else {
    window.addEventListener('resize', layout);
  }

  /* ---------------- Khởi động ---------------- */
  $('app-version').textContent = APP_VERSION;
  applyTheme();
  renderSettings();

  const restored = restoreGame();
  if (restored) {
    game = restored.game;
    elapsed = restored.elapsed;
    settings.mode = game.mode;
    saveSettings();
    buildBoard(false);
    renderHud();
    if (!document.hidden) startClock();
    writeSummary();
    PN && PN.gameStart({ mode: game.mode, resume: true });
  } else {
    newGame(settings.mode);
  }
  booted = true;
})();
