/* =====================================================================
 * Nối Hình - Logic game + render (cần i18n.js, engine.js nạp trước)
 *   - Mỗi lần chơi một cấp độ là một ván gửi lên cổng (thắng = qua cấp độ)
 *   - Ô bàn, ô hàng chờ và ô trong khay cùng nằm trong một lớp toạ độ (#layer)
 *     để ô bay từ bàn xuống khay bằng transition của transform
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.NoiHinh;
  const APP_VERSION = '1.3.1';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'noihinh' });
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
  const MODE = 'classic';
  const t = I18N.t;

  // Điền chữ tĩnh theo ngôn ngữ trước khi vẽ phần động
  I18N.apply();

  const PREFIX = 'playnine-noihinh-';
  const SAVE_KEY = PREFIX + 'save-v1';
  const SETTINGS_KEY = PREFIX + 'settings-v1';
  const STATS_KEY = PREFIX + 'stats-v1';
  const SUMMARY_KEY = PREFIX + 'summary-v1';

  // Hình trên ô theo loại (engine dùng tối đa 18 loại): SVG vẽ sẵn, không dùng emoji
  // để mọi máy (iOS, Android, Windows) hiện giống hệt nhau. Khung 48x48, viền đậm
  // cùng tông + vệt sáng/bóng tạo khối. Mỗi hình một dáng riêng để không phải dựa vào màu.
  // Thứ tự: các loại đầu (cấp 1-3) khác màu và khác dáng rõ nhất.
  const HI = '#fff'; // màu vệt sáng
  const ICONS = [
    // 0 Táo đỏ
    `<path d="M24 15c-3-2.2-7.6-2.6-10.6-.2-3.8 3-4.4 8.8-2.8 14.2 1.7 5.8 5.6 10.4 9.4 10.4 1.6 0 2.6-.8 4-.8s2.4.8 4 .8c3.8 0 7.7-4.6 9.4-10.4 1.6-5.4 1-11.2-2.8-14.2-3-2.4-7.6-2-10.6.2z" fill="#f0503f" stroke="#9c2a20" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M34.6 18.4c1.8 3.4 1.8 7.6.6 11.4-1.2 4-3.6 7.2-6.2 8.2 2.6-3.6 5.8-10.8 5.6-19.6z" fill="#000" opacity=".14"/>
    <path d="M24 15c0-3 .8-5.4 2.6-7.4" fill="none" stroke="#6b3d14" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M26.6 10c2.6-3.2 6.6-3.8 9.4-2.6-1.4 3.4-5.6 5.2-9.4 2.6z" fill="#6cc04a" stroke="#2f7a2a" stroke-width="1.8" stroke-linejoin="round"/>
    <ellipse cx="16.4" cy="21.6" rx="2.4" ry="4.4" transform="rotate(20 16.4 21.6)" fill="${HI}" opacity=".6"/>`,
    // 1 Chuối
    `<path d="M9.4 14.2c1.6 12.2 9.4 21.6 21.4 22.8 4 .4 7.4-.6 9.4-2.2.6-.5.3-1.4-.5-1.4-12.2-.4-20.6-8.6-24.6-19.6-.6-1.6-2.6-2.4-4.2-1.6-.9.4-1.6 1-1.5 2z" fill="#ffd43b" stroke="#a8741a" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M16.4 18.2c3.8 8 10 13.2 18.8 14.6" fill="none" stroke="#e8a31a" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12.6 17c1.6 5.8 5 10.6 9.6 13.6" fill="none" stroke="${HI}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
    <path d="M10.2 14.4 8.4 10.2" stroke="#6b3d14" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M40 33.6l1.4.4" stroke="#6b3d14" stroke-width="3" stroke-linecap="round"/>`,
    // 2 Chùm nho
    `<path d="M24 15V8.4" stroke="#6b3d14" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M24.4 11c3-4 8-4.4 11-2.6-2.4 3.6-7.4 4.6-11 2.6z" fill="#6cc04a" stroke="#2f7a2a" stroke-width="1.8" stroke-linejoin="round"/>
    <g fill="#9361e0" stroke="#4b2a8a" stroke-width="2">
      <circle cx="16" cy="19.6" r="5.4"/><circle cx="24" cy="19" r="5.4"/><circle cx="32" cy="19.6" r="5.4"/>
      <circle cx="20" cy="27.4" r="5.4"/><circle cx="28" cy="27.4" r="5.4"/><circle cx="24" cy="35.4" r="5.4"/>
    </g>
    <g fill="${HI}" opacity=".6"><circle cx="14.2" cy="17.8" r="1.6"/><circle cx="22.2" cy="17.2" r="1.6"/><circle cx="30.2" cy="17.8" r="1.6"/><circle cx="18.2" cy="25.6" r="1.6"/><circle cx="26.2" cy="25.6" r="1.6"/><circle cx="22.2" cy="33.6" r="1.6"/></g>`,
    // 3 Cỏ bốn lá
    `<path d="M25 25.4c2.2 4.2 2.6 9 .8 14" fill="none" stroke="#1f6b30" stroke-width="2.8" stroke-linecap="round"/>
    <g fill="#3fae54" stroke="#1f6b30" stroke-width="2" stroke-linejoin="round">
      <path id="nh-leaf" d="M24 23c-3.6-2-8-4.8-8-9 0-2.8 2.1-4.6 4.4-4.6 1.6 0 2.9.8 3.6 2.1.7-1.3 2-2.1 3.6-2.1 2.3 0 4.4 1.8 4.4 4.6 0 4.2-4.4 7-8 9z"/>
      <use href="#nh-leaf" transform="rotate(90 24 23.4)"/><use href="#nh-leaf" transform="rotate(180 24 23.4)"/><use href="#nh-leaf" transform="rotate(270 24 23.4)"/>
    </g>
    <path d="M24 22.6V15M24.8 23.4h7.6M24 24.2v7.6M23.2 23.4h-7.6" stroke="#8fdc7a" stroke-width="1.4" stroke-linecap="round"/>
    <ellipse cx="20.2" cy="14.2" rx="1.6" ry="2.4" transform="rotate(-30 20.2 14.2)" fill="${HI}" opacity=".55"/>
    <ellipse cx="13.8" cy="20.6" rx="1.6" ry="2.4" transform="rotate(-60 13.8 20.6)" fill="${HI}" opacity=".55"/>`,
    // 4 Kim cương xanh
    `<path d="M15 12h18l8.4 9.4L24 40.6 6.6 21.4z" fill="#4677f0" stroke="#23409a" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M15 12h18l8.4 9.4H6.6z" fill="#7ea2ff"/>
    <path d="M19 21.4 24 12l5 9.4z" fill="#c2d5ff"/>
    <path d="M6.6 21.4H19l5 19.2z" fill="#5f8cff"/>
    <path d="M29 21.4h12.4L24 40.6z" fill="#2f57c8"/>
    <path d="M15 12h18l8.4 9.4L24 40.6 6.6 21.4zM6.6 21.4h34.8M15 12l4 9.4L24 12l5 9.4 4-9.4M19 21.4l5 19.2 5-19.2" fill="none" stroke="#23409a" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12.6 15.2l.9-2.3.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9z" fill="${HI}"/>`,
    // 5 Cà rốt
    `<path d="M34.4 15.6c-.6-4 .4-7.4 2.8-9.6M35.4 16.6c2.4-3.2 5.6-4.6 8.4-4.2M35 16c1.2-3.8 3.8-6.2 6.8-7" fill="none" stroke="#3fa046" stroke-width="3" stroke-linecap="round"/>
    <path d="M11.6 38.4 27.7 12.9a6 6 0 0 1 8.6 8.2z" fill="#ff8c1a" stroke="#a8510c" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M12.4 37.8 34.8 21.6 32.6 19.8z" fill="#000" opacity=".12"/>
    <path d="M20.4 25.8l3.4 2.6M25 19l2.8 2.4M15.8 32.6l1.8 1.4" stroke="#a8510c" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M17 32.6 27.4 17" stroke="${HI}" stroke-width="2" stroke-linecap="round" opacity=".55"/>`,
    // 6 Bánh donut sô-cô-la
    `<path d="M24 10a14.4 14.4 0 1 1 0 28.8 14.4 14.4 0 0 1 0-28.8zm0 9.6a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6z" fill="#eab36a" stroke="#9a5f22" stroke-width="2.2" fill-rule="evenodd"/>
    <path d="M12 24a12 12 0 0 1 24 0c0 3.4-1.4 6.4-3.6 8.6-.8.8-2 .4-2.2-.6-.4 1.6-1.8 2.8-3.4 2.4-1-.2-1.4-1.4-1.6-2.4-.4 1.8-2.4 2.8-4 2.2-1.2-.4-1.4-1.8-1.2-2.8-1 1-2.6 1-3.4-.2C12.8 29.6 12 26.8 12 24zm12-5.2a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2z" fill="#8a4b2e" stroke="#5a2c16" stroke-width="1.8" stroke-linejoin="round" fill-rule="evenodd"/>
    <g stroke-width="2" stroke-linecap="round"><path d="M17 16.4l2 1" stroke="#ffd43b"/><path d="M26.4 15l1.8-1" stroke="#7fd7ff"/><path d="M31.4 18.6l1 2" stroke="#ff8cc6"/><path d="M14 21l.6-2" stroke="#7fd7ff"/><path d="M21.6 14.6h2" stroke="#ff8cc6"/><path d="M33 27l-1 1.6" stroke="#ffd43b"/><path d="M15.6 28l1.4 1.4" stroke="#ff8cc6"/></g>
    <ellipse cx="17.4" cy="13.8" rx="2.6" ry="1.2" transform="rotate(-25 17.4 13.8)" fill="${HI}" opacity=".45"/>`,
    // 7 Kẹo mút xoắn
    `<rect x="22.6" y="28" width="2.8" height="14" rx="1.4" fill="#f6ecd8" stroke="#a08a6a" stroke-width="1.6"/>
    <circle cx="24" cy="19" r="11.4" fill="#c6ecfb" stroke="#1f6f9e" stroke-width="2.2"/>
    <path d="M23 19a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0 7.5 7.5 0 0 1 15 0 9 9 0 0 1-18 0" fill="none" stroke="#2a9fe0" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse cx="18" cy="12.6" rx="2.8" ry="1.4" transform="rotate(-35 18 12.6)" fill="${HI}" opacity=".85"/>`,
    // 8 Dâu tây
    `<path d="M24 40.4c-6.4-3.4-13.6-11.4-13.6-19 0-4.4 3.4-6.8 7-6.8 2.8 0 4.6 1 6.6 1s3.8-1 6.6-1c3.6 0 7 2.4 7 6.8 0 7.6-7.2 15.6-13.6 19z" fill="#ff4d6d" stroke="#a3213e" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M35.4 20c.6 6.4-4.8 13.6-10.4 17.6 4.8-4.6 8.2-10.4 8.6-17.2z" fill="#000" opacity=".12"/>
    <g fill="#ffe08a"><ellipse cx="18" cy="23" rx=".9" ry="1.4"/><ellipse cx="24" cy="22.4" rx=".9" ry="1.4"/><ellipse cx="30" cy="23" rx=".9" ry="1.4"/><ellipse cx="21" cy="29" rx=".9" ry="1.4"/><ellipse cx="27" cy="29" rx=".9" ry="1.4"/><ellipse cx="24" cy="34.6" rx=".9" ry="1.4"/></g>
    <path d="M24 14.2V8.6" stroke="#2f7a2a" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M13.8 15c3-.8 5.8-.2 7.4 1.4l2.8-3.4 2.8 3.4c1.6-1.6 4.4-2.2 7.4-1.4-1.4 2.8-3.6 4-5.8 4.4-1.2 1.2-2.8 1.6-4.4 1.6s-3.2-.4-4.4-1.6c-2.2-.4-4.4-1.6-5.8-4.4z" fill="#5cc04a" stroke="#2f7a2a" stroke-width="1.8" stroke-linejoin="round"/>
    <ellipse cx="15.6" cy="24.4" rx="1.6" ry="3.4" transform="rotate(18 15.6 24.4)" fill="${HI}" opacity=".5"/>`,
    // 9 Kẹo gói
    `<path d="M16 21.4 8.2 15.8c-1-.7-2.4 0-2.4 1.2v14c0 1.2 1.4 1.9 2.4 1.2l7.8-5.6zM32 21.4l7.8-5.6c1-.7 2.4 0 2.4 1.2v14c0 1.2-1.4 1.9-2.4 1.2L32 26.6z" fill="#8ee6d8" stroke="#0d7366" stroke-width="2" stroke-linejoin="round"/>
    <path d="M10 19.6v8.8M13 21.4v5.2M38 19.6v8.8M35 21.4v5.2" stroke="#0d7366" stroke-width="1.4" stroke-linecap="round"/>
    <ellipse cx="24" cy="24" rx="9.4" ry="7.8" fill="#20c2ad" stroke="#0d7366" stroke-width="2.2"/>
    <path d="M21.4 17.2 17 29M27.6 16.6 22.4 31.2M32.4 20.2 28.8 30.4" stroke="${HI}" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="19.8" cy="20.2" rx="2.4" ry="1.3" transform="rotate(-20 19.8 20.2)" fill="${HI}" opacity=".7"/>`,
    // 10 Kem ốc quế
    `<path d="M15.6 25.4h16.8L24 42.6z" fill="#eab062" stroke="#9a5f22" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M20.6 25.6l5.4 10.6M27 25.6l2.4 4.6M27.4 25.6 22 36.2M21 25.6l-2.4 4.6" stroke="#b77a34" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M12 25c-1.2-.6-1.6-2-1-3.4.8-6.6 6.4-11.2 13-11.2s12.2 4.6 13 11.2c.6 1.4.2 2.8-1 3.4-1.4.6-2.2-.4-3.4 0-1.2.4-1.6 2.6-3.4 2.6-1.6 0-2-2-3.6-2s-2 3-3.8 3-2-3-3.6-3-1.6 2-3.4 2-2-2.6-3.4-2.6-2 .6-2.4 0z" fill="#c39bff" stroke="#6e46b8" stroke-width="2.2" stroke-linejoin="round"/>
    <g fill="#6e46b8"><circle cx="21" cy="18.4" r="1"/><circle cx="28.6" cy="16.4" r="1"/><circle cx="31" cy="22" r="1"/><circle cx="24.6" cy="22.2" r="1"/></g>
    <ellipse cx="17" cy="16.6" rx="2.8" ry="1.5" transform="rotate(-35 17 16.6)" fill="${HI}" opacity=".65"/>`,
    // 11 Lê
    `<path d="M24 12.4c-2.8 0-4.4 2.2-4.6 5.4-.2 3-1.6 4.6-3.6 6.8-2 2.2-3.4 4.8-3.4 8 0 5.6 5 8.8 11.6 8.8s11.6-3.2 11.6-8.8c0-3.2-1.4-5.8-3.4-8-2-2.2-3.4-3.8-3.6-6.8-.2-3.2-1.8-5.4-4.6-5.4z" fill="#b5d334" stroke="#5e7a12" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M31.8 26.4c1.6 2 2.2 4.4 1.4 6.8-1 3-4 5-7.8 5.6 3.8-2.2 6.4-7 6.4-12.4z" fill="#000" opacity=".12"/>
    <path d="M24 12.4c0-2.4.6-4.2 2-5.6" fill="none" stroke="#6b3d14" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M25.6 9c2.8-2.6 6.8-2.6 9-.6-2.6 2.6-6.4 2.8-9 .6z" fill="#3fa046" stroke="#1f6b30" stroke-width="1.8" stroke-linejoin="round"/>
    <ellipse cx="18.4" cy="30.4" rx="2.2" ry="4" transform="rotate(15 18.4 30.4)" fill="${HI}" opacity=".55"/>`,
    // 12 Bánh cupcake
    `<path d="M12.8 26.4h22.4L32 40.4H16z" fill="#e8559a" stroke="#8e1f56" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M18.6 27.4l1 12M24 27.4v12M29.4 27.4l-1 12" stroke="#b83a76" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M11.6 27c-1.8-3 .4-6.6 3.8-6.4.2-4 3.6-6.4 7.2-5.4 1.6-2.8 5.6-2.8 7.2-.2 3.4-.2 6 2.6 5 6 3.2.6 4.6 4 2.6 6z" fill="#fff6ea" stroke="#9a6a4a" stroke-width="2" stroke-linejoin="round"/>
    <g stroke-width="1.8" stroke-linecap="round"><path d="M16.6 23.6l1.4.8" stroke="#2a9fe0"/><path d="M22 20.4l1.6-.2" stroke="#ffb020"/><path d="M28 23l1-1.2" stroke="#3fae54"/><path d="M32.4 24.2l1.4.4" stroke="#e8559a"/><path d="M25.4 25l-.2.2" stroke="#2a9fe0"/></g>
    <path d="M24.6 11.4c.4-2 1.6-3.4 3.4-4" fill="none" stroke="#6b3d14" stroke-width="2" stroke-linecap="round"/>
    <circle cx="24" cy="14.2" r="3.6" fill="#e0284f" stroke="#8a1230" stroke-width="1.8"/>
    <circle cx="22.8" cy="13" r="1.1" fill="${HI}" opacity=".75"/>`,
    // 13 Lát dưa hấu
    `<path d="M6.6 16.6h34.8a17.4 17.4 0 0 1-34.8 0z" fill="#4cb04a" stroke="#2a6e2a" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M9.8 16.6h28.4a14.2 14.2 0 0 1-28.4 0z" fill="#e6f5b8"/>
    <path d="M12 16.6h24a12 12 0 0 1-24 0z" fill="#ff5468"/>
    <path d="M14.4 18.4h19.2" stroke="${HI}" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>
    <g fill="#3a2420"><ellipse cx="18" cy="21.6" rx="1" ry="1.7" transform="rotate(-20 18 21.6)"/><ellipse cx="24" cy="23.4" rx="1" ry="1.7"/><ellipse cx="30" cy="21.6" rx="1" ry="1.7" transform="rotate(20 30 21.6)"/><ellipse cx="21" cy="27.6" rx="1" ry="1.7" transform="rotate(-15 21 27.6)"/><ellipse cx="27" cy="27.6" rx="1" ry="1.7" transform="rotate(15 27 27.6)"/></g>`,
    // 14 Hai quả anh đào
    `<path d="M16 26c1-7.4 4.6-13.2 10-17M31.4 27c-.6-7-2.4-12.6-5.4-18" fill="none" stroke="#4f8a2a" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M26 9c3.4-2.6 8-2.4 10.6.2-3.2 2.6-7.8 2.6-10.6-.2z" fill="#6cc04a" stroke="#2f7a2a" stroke-width="1.8" stroke-linejoin="round"/>
    <g fill="#e0284f" stroke="#8a1230" stroke-width="2.2"><circle cx="15.6" cy="32" r="7.2"/><circle cx="31.6" cy="33.4" r="7.2"/></g>
    <g fill="#000" opacity=".14"><path d="M21 28.6a7.2 7.2 0 0 1-9.6 9.2 6.6 6.6 0 0 0 9.6-9.2z"/><path d="M37 30a7.2 7.2 0 0 1-9.6 9.2 6.6 6.6 0 0 0 9.6-9.2z"/></g>
    <g fill="${HI}" opacity=".65"><ellipse cx="12.8" cy="29.4" rx="1.8" ry="2.6" transform="rotate(25 12.8 29.4)"/><ellipse cx="28.8" cy="30.8" rx="1.8" ry="2.6" transform="rotate(25 28.8 30.8)"/></g>`,
    // 15 Dứa
    `<g transform="matrix(1.12 0 0 1.12 -2.88 -3.24)"><g fill="#4cb04a" stroke="#2a6e2a" stroke-width="1.8" stroke-linejoin="round"><path d="M22.4 21c-3.2-1.6-5.4-4.8-6-8.8 3.2 2 5.6 5 6 8.8zM25.6 21c3.2-1.6 5.4-4.8 6-8.8-3.2 2-5.6 5-6 8.8z"/><path d="M24 20.6c-1.6-3.2-1.4-7.4 0-11.6 1.4 4.2 1.6 8.4 0 11.6z"/></g>
    <ellipse cx="24" cy="30.6" rx="9.8" ry="10.8" fill="#f5b02e" stroke="#a0661a" stroke-width="2.2"/>
    <path d="M17.4 24.4l1.6 1.6 1.6-1.6M22.4 24.4l1.6 1.6 1.6-1.6M27.4 24.4l1.6 1.6 1.6-1.6M15 29.6l1.6 1.6 1.6-1.6M20 29.6l1.6 1.6 1.6-1.6M25 29.6l1.6 1.6 1.6-1.6M30 29.6l1.6 1.6 1.6-1.6M17.4 34.8l1.6 1.6 1.6-1.6M22.4 34.8l1.6 1.6 1.6-1.6M27.4 34.8l1.6 1.6 1.6-1.6" fill="none" stroke="#b8741a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="18.2" cy="27" rx="1.8" ry="3.6" transform="rotate(20 18.2 27)" fill="${HI}" opacity=".45"/></g>`,
    // 16 Ngôi sao vàng
    `<path d="M24 9.6l4.3 9.4 10.2 1.2-7.6 7 2 10.2L24 32.4l-8.9 5 2-10.2-7.6-7 10.2-1.2z" fill="#ffc21f" stroke="#b07a0a" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M24 25.2V9.6l4.3 9.4zM24 25.2l14.5-5-7.6 7zM24 25.2l8.9 12.2-8.9-5zM24 25.2 15.1 37.4l2-10.2zM24 25.2l-14.5-5 10.2-1.2z" fill="#c98a00" opacity=".22"/>
    <ellipse cx="19.6" cy="21" rx="2.4" ry="1.3" transform="rotate(-20 19.6 21)" fill="${HI}" opacity=".7"/>`,
    // 17 Bánh quy bị cắn
    `<path d="M37.8 21.6A14 14 0 1 1 28.8 10.8a4.2 4.2 0 0 0 3.6 5.8 4.2 4.2 0 0 0 5.4 5z" fill="#e0a050" stroke="#8f5a1e" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M35.8 31c-2.4 4.2-7 7-11.8 7 4.8-1.8 9-5 11.8-7z" fill="#000" opacity=".12"/>
    <g fill="#6b3a1a"><path d="M17 17.4l2.6-.6.6 2.4-2.4 1z"/><path d="M25.4 22.6l2.6.4-.4 2.6-2.6-.6z"/><path d="M15.4 28l2.4-1 .8 2.4-2.4.8z"/><path d="M29.4 30.6l2.4.6-.8 2.4-2.2-.8z"/><path d="M21.6 33.4l2.6-.2.2 2.4-2.6.2z"/><path d="M22 15.4l1.8.8-1 1.8-1.6-.8z"/></g>
    <ellipse cx="16.4" cy="22.6" rx="1.6" ry="3.2" transform="rotate(25 16.4 22.6)" fill="${HI}" opacity=".4"/>`,
  ];
  const ICON_SPRITE = '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">' +
    ICONS.map((g, i) => `<symbol id="nh-icon-${i}" viewBox="0 0 48 48">${g}</symbol>`).join('') + '</svg>';
  document.body.insertAdjacentHTML('afterbegin', ICON_SPRITE);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';
  const iconNames = String(t('tile.names')).split('|');

  /** Gắn hình theo loại vào mặt ô (tạo <svg><use> lần đầu, đổi href khi xáo). */
  function setFace(face, type) {
    const k = type % ICONS.length;
    let use = face.firstChild;
    if (!use || use.nodeName.toLowerCase() !== 'svg') {
      face.textContent = '';
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'glyph');
      svg.setAttribute('viewBox', '0 0 48 48');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.appendChild(document.createElementNS(SVG_NS, 'use'));
      face.appendChild(svg);
    }
    use = face.firstChild.firstChild;
    use.setAttribute('href', '#nh-icon-' + k);
    use.setAttributeNS(XLINK_NS, 'xlink:href', '#nh-icon-' + k);
    face.dataset.type = String(k);
    face.setAttribute('role', 'img');
    if (iconNames[k]) face.setAttribute('aria-label', t('tile.free', { name: iconNames[k] }));
  }
  const MAX_TILE = 58; // px, cạnh ô lớn nhất
  const FLY_MS = 240; // thời gian ô bay xuống khay
  const CLEAR_MS = 1800; // hiện "Hoàn thành cấp độ" trước khi sang cấp mới

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
  const DEFAULT_SETTINGS = { theme: 'auto', vibrate: true };
  let settings = loadSettings();

  function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    const raw = readJSON(SETTINGS_KEY);
    if (raw && typeof raw === 'object') {
      if (['auto', 'light', 'dark'].indexOf(raw.theme) >= 0) s.theme = raw.theme;
      if (typeof raw.vibrate === 'boolean') s.vibrate = raw.vibrate;
    }
    return s;
  }
  function saveSettings() {
    writeJSON(SETTINGS_KEY, settings);
  }

  /* ---------------- Tiến độ & thống kê ---------------- */
  // level: cấp độ đang chơi; cleared: số cấp độ đã qua; played: số lần chơi (mỗi lần bắt đầu một cấp độ)
  const emptyStats = () => ({ v: 1, level: 1, cleared: 0, played: 0 });
  let stats = loadStats();

  function loadStats() {
    const s = emptyStats();
    const raw = readJSON(STATS_KEY);
    if (raw && typeof raw === 'object') {
      ['level', 'cleared', 'played'].forEach((k) => {
        if (Number.isInteger(raw[k]) && raw[k] >= 0) s[k] = raw[k];
      });
      s.level = Math.max(1, s.level);
    }
    return s;
  }
  function saveStats() {
    writeJSON(STATS_KEY, stats);
  }

  /* ---------------- Ván chơi ---------------- */
  let game = null;
  let reported = false; // đã gửi kết quả ván hiện tại lên cổng
  let busyUntil = 0; // đang chuyển cấp độ: chặn chạm

  function startLevel(n) {
    game = E.createGame(n);
    reported = false;
    stats.level = n;
    stats.played++;
    saveStats();
    buildTiles(true);
    renderAll();
    persist();
    writeSummary();
    PN && PN.gameStart({ mode: MODE });
  }

  /** Gửi kết quả ván cho cổng một lần duy nhất. */
  function report(won) {
    if (reported) return;
    reported = true;
    PN && PN.gameEnd({ mode: MODE, won, assisted: false });
  }

  function persist() {
    if (!game || game.status !== 'playing') {
      removeKey(SAVE_KEY);
      return;
    }
    writeJSON(SAVE_KEY, { v: 1, game: E.toJSON(game) });
  }

  function restoreGame() {
    const s = readJSON(SAVE_KEY);
    if (!s || s.v !== 1) return null;
    const g = E.fromJSON(s.game);
    return g && g.level === stats.level ? g : null;
  }

  function writeSummary() {
    const headline = [];
    let note = t('summary.noGames');
    if (stats.played) {
      note = t('summary.at', { n: stats.level });
      headline.push({ value: String(stats.level), label: t('summary.statLevel') });
      headline.push({ value: String(stats.cleared), label: t('summary.statCleared') });
    }
    let resume = null;
    if (game && game.status !== 'won') {
      const left = E.remaining(game);
      const total = game.tiles.length;
      if (left < total) {
        resume = {
          title: t('summary.resume', { n: game.level }),
          detail: t('summary.resumeDetail', { n: left }),
          pct: Math.round((1 - left / total) * 1000) / 1000,
        };
      }
    }
    writeJSON(SUMMARY_KEY, {
      v: 1,
      updatedAt: Date.now(),
      played: stats.played,
      won: stats.cleared,
      note,
      stats: headline,
      resume,
    });
  }

  /* ---------------- Bố cục ---------------- */
  const stage = $('stage');
  const layer = $('layer');
  const trayEl = $('tray');
  const slotsEl = $('tray-slots');
  let tileEls = []; // theo id ô
  let geo = null; // { T, u, bx, by, tray: {x, y, S}, hold: {x, y} }

  function computeLayout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const cap = game.cap;
    // Khay: ô khay không lớn hơn ô bàn tối đa, chừa chỗ nút "+"
    const addW = 46;
    // Sân rộng và thấp (điện thoại xoay ngang): khay sang phải, bàn dùng hết chiều cao
    const side = W >= H * 1.7;
    const S = Math.max(24, Math.min(MAX_TILE, (Math.min(side ? W * 0.5 : W, 520) - 24 - addW - 10) / E.MAX_TRAY, side ? (H - 30) / 3 : MAX_TILE));
    const trayW = S * cap + 16;
    const trayH = S + 18;
    const sideW = S * E.MAX_TRAY + 16 + addW + 10;
    const trayX = side ? W - 4 - (trayW + addW + 10) : (W - (trayW + addW + 10)) / 2;
    const trayY = side ? H / 2 + 4 : H - trayH - 4;
    // Hàng chờ (Lấy ra) ngay trên khay, chỉ chiếm chỗ khi có ô
    const holdH = game.hold.length ? S + 10 : 0;
    const boardW = side ? W - sideW - 12 : W;
    const boardH = side ? H - 8 : trayY - holdH - 14;
    const holdW = S * E.HOLD_SIZE + 8 * (E.HOLD_SIZE - 1);
    let maxX = 0;
    let maxY = 0;
    game.tiles.forEach((tl) => {
      maxX = Math.max(maxX, tl.x + E.TILE);
      maxY = Math.max(maxY, tl.y + E.TILE + 1);
    });
    // Mỗi lớp nhô lên một chút nên chừa thêm theo số lớp
    const u = Math.max(2, Math.min(MAX_TILE / E.TILE, (boardW - 4) / maxX, boardH / maxY));
    const T = u * E.TILE;
    geo = {
      T,
      u,
      bx: (boardW - maxX * u) / 2,
      by: Math.max(6, (boardH - maxY * u) / 2 + 6),
      tray: { x: trayX + 8, y: trayY + 9, S },
      hold: side
        ? { x: trayX + (trayW + addW + 10 - holdW) / 2, y: trayY - S - 14, S }
        : { x: (W - holdW) / 2, y: trayY - holdH, S },
    };
    trayEl.style.left = trayX + 'px';
    trayEl.style.top = trayY + 'px';
    trayEl.style.setProperty('--S', S + 'px');
    slotsEl.style.width = trayW + 'px';
    slotsEl.style.height = trayH + 'px';
    if (slotsEl.childElementCount !== cap) {
      slotsEl.textContent = '';
      for (let i = 0; i < cap; i++) slotsEl.appendChild(document.createElement('span'));
    }
    layer.style.setProperty('--T', T + 'px');
  }

  /** Vị trí và tỉ lệ thu nhỏ của ô theo chỗ đang ở (bàn / hàng chờ / khay). */
  function tileTransform(tl, trayOrder) {
    const at = tl.at;
    if (at === 'tray' || at === 'gone') {
      const order = trayOrder || game.tray;
      const i = Math.max(0, order.indexOf(tl.id));
      const S = geo.tray.S;
      return { x: geo.tray.x + i * S, y: geo.tray.y, k: S / geo.T, z: 900 + i };
    }
    if (at === 'hold') {
      const i = game.hold.indexOf(tl.id);
      const S = geo.hold.S;
      return { x: geo.hold.x + i * (S + 8), y: geo.hold.y, k: S / geo.T, z: 800 + i };
    }
    return { x: geo.bx + tl.x * geo.u, y: geo.by + tl.y * geo.u, k: 1, z: tl.z * 10 + 1 };
  }

  function place(el, p) {
    el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.k})`;
    el.style.zIndex = String(p.z);
  }

  function makeTile(tl) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.id = String(tl.id);
    const face = document.createElement('span');
    face.className = 'face';
    setFace(face, tl.type);
    el.appendChild(face);
    return el;
  }

  function buildTiles(intro) {
    layer.textContent = '';
    computeLayout();
    stage.classList.add('no-anim');
    tileEls = game.tiles.map((tl) => {
      if (tl.at === 'gone') return null;
      const el = makeTile(tl);
      if (intro && !reduceMotion.matches) {
        el.classList.add('enter');
        el.style.setProperty('--d', Math.min(900, tl.z * 90 + (tl.y + tl.x) * 2) + 'ms');
        el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
      }
      layer.appendChild(el);
      return el;
    });
    placeAll();
    requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('no-anim')));
  }

  function placeAll() {
    if (!game) return;
    const free = new Set(E.freeIds(game));
    game.tiles.forEach((tl) => {
      const el = tileEls[tl.id];
      if (!el || tl.at === 'gone') return;
      place(el, tileTransform(tl));
      const blocked = tl.at === 'board' && !free.has(tl.id);
      el.classList.toggle('blocked', blocked);
      el.classList.toggle('in-tray', tl.at === 'tray');
      el.setAttribute('aria-hidden', blocked || tl.at === 'tray' ? 'true' : 'false');
    });
    // Khay sắp đầy: viền đỏ nhấp nháy để nhắc
    trayEl.classList.toggle('danger', game.status === 'playing' && game.tray.length > 0 && game.tray.length >= game.cap - 2);
  }

  /** Chạy lại một hiệu ứng CSS (gỡ lớp, ép reflow, gắn lại). */
  function replayClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** Vệt sáng tại chỗ bộ ba vừa biến mất trong khay. */
  function burst(p) {
    if (reduceMotion.matches) return;
    const S = geo.tray.S;
    const el = document.createElement('div');
    el.className = 'burst';
    el.style.left = p.x + S / 2 + 'px';
    el.style.top = p.y + S / 2 + 'px';
    el.style.setProperty('--S', S + 'px');
    layer.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 900);
  }

  // Chuỗi ăn liên tiếp: ăn bộ ba trong vòng 3 lần chạm kể từ lần ăn trước thì tiếng cao dần
  let streak = 0;
  let picksSinceClear = 99;
  let lastNope = 0;

  function relayout() {
    if (!game) return;
    computeLayout();
    placeAll();
  }

  /* ---------------- HUD ---------------- */
  function renderBoosters() {
    const b = game.boosters;
    [['out', b.out], ['undo', b.undo], ['shuffle', b.shuffle]].forEach(([k, n]) => {
      $('count-' + k).textContent = String(n);
      $('btn-' + k).classList.toggle('empty', n <= 0);
    });
    $('btn-slot').classList.toggle('empty', b.slot <= 0 || game.cap >= E.MAX_TRAY);
  }

  function renderAll() {
    $('level-title').textContent = t('level.title', { n: game.level });
    renderBoosters();
    relayout();
  }

  /* ---------------- Chơi ---------------- */
  function vibrate(ms) {
    if (!settings.vibrate || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch (e) { /* bỏ qua */ }
  }

  const canAct = () => !!game && game.status === 'playing' && performance.now() >= busyUntil && !document.querySelector('.modal:not([hidden])');

  function tap(id) {
    if (!canAct()) return;
    const tl = game.tiles[id];
    if (!E.isFree(game, id)) {
      const el = tileEls[id];
      if (el && tl.at === 'board') {
        el.classList.remove('nope');
        void el.offsetWidth;
        el.classList.add('nope');
        if (performance.now() - lastNope > 250) {
          lastNope = performance.now();
          sfx('error', { volume: 0.5 });
        }
      }
      return;
    }
    // Thứ tự khay ngay sau khi chèn (trước khi ăn bộ ba) để ô bay đúng chỗ rồi mới biến mất
    const order = game.tray.slice();
    order.splice(E.insertPosition(game, id), 0, id);
    const holdBefore = game.hold.length;
    const res = E.pick(game, id);
    if (!res) return;
    // Chạm ô: tiếng đặt cao dần theo số ô trong khay; ô chạm khay thì nảy nhẹ
    sfx('place', { pitch: 1 + Math.min(order.length, 8) * 0.04 });
    if (tileEls[id]) replayClass(tileEls[id], 'landed');
    picksSinceClear++;

    if (res.cleared.length) {
      streak = picksSinceClear <= 3 ? streak + 1 : 1;
      picksSinceClear = 0;
      const combo = streak;
      const mid = tileTransform(game.tiles[res.cleared[1]], order);
      const cleared = res.cleared.map((x) => tileEls[x]);
      res.cleared.forEach((x) => {
        tileEls[x] = null;
      });
      // Ô bay vào chỗ của bộ ba trước, các ô còn lại giữ chỗ cũ tới khi bộ ba biến mất
      if (holdBefore !== game.hold.length && !game.hold.length) computeLayout();
      game.tiles.forEach((tl) => {
        const el = tileEls[tl.id] || (res.cleared.indexOf(tl.id) >= 0 ? cleared[res.cleared.indexOf(tl.id)] : null);
        if (el && (tl.at === 'tray' || tl.at === 'gone')) place(el, tileTransform(tl, order));
      });
      placeBoardOnly();
      setTimeout(() => {
        cleared.forEach((el) => el.classList.add('gone'));
        burst(mid);
        if (game.status !== 'won') sfx(combo >= 3 ? 'combo' : 'clear', { pitch: 1 + Math.min(combo - 1, 6) * 0.06 });
        vibrate(25);
        setTimeout(() => {
          cleared.forEach((el) => el.remove());
          placeAll();
        }, wait(220));
      }, wait(FLY_MS));
    } else {
      relayout();
    }
    renderBoosters();
    afterMove();
  }

  /** Cập nhật ô trên bàn (bị che / lộ) mà không dời các ô trong khay. */
  function placeBoardOnly() {
    const free = new Set(E.freeIds(game));
    game.tiles.forEach((tl) => {
      const el = tileEls[tl.id];
      if (!el || tl.at !== 'board') return;
      el.classList.toggle('blocked', !free.has(tl.id));
      el.setAttribute('aria-hidden', free.has(tl.id) ? 'false' : 'true');
    });
  }

  function afterMove() {
    if (game.status === 'won') onWin();
    else if (game.status === 'lost') onLost();
    persist();
    writeSummary();
  }

  function onWin() {
    report(true);
    stats.cleared++;
    stats.level = game.level + 1;
    saveStats();
    removeKey(SAVE_KEY);
    busyUntil = performance.now() + wait(CLEAR_MS) + 400;
    const banner = $('clear-banner');
    setTimeout(() => sfx('win'), wait(FLY_MS));
    setTimeout(() => {
      confetti();
      banner.textContent = t('level.clear', { n: game.level });
      banner.hidden = false;
      banner.classList.remove('show');
      void banner.offsetWidth;
      banner.classList.add('show');
    }, wait(400));
    setTimeout(() => {
      banner.hidden = true;
      startLevel(stats.level);
      sfx('start');
    }, wait(CLEAR_MS) + 400);
  }

  function onLost() {
    vibrate(80);
    // Hết cách cứu thì ván coi như thua luôn
    if (game.boosters.out <= 0 && (game.boosters.slot <= 0 || game.cap >= E.MAX_TRAY)) report(false);
    setTimeout(() => {
      if (game.status !== 'lost') return;
      $('btn-lost-out').hidden = game.boosters.out <= 0;
      $('btn-lost-slot').hidden = game.boosters.slot <= 0 || game.cap >= E.MAX_TRAY;
      sfx('lose');
      openModal('modal-lost');
    }, wait(FLY_MS + 300));
  }

  function retryLevel() {
    if (game && game.status !== 'won') report(false);
    startLevel(game ? game.level : stats.level);
    sfx('start');
  }

  /** Dùng trợ giúp thành công: tiếng riêng + nút nảy lên. */
  function used(btnId, name) {
    sfx(name);
    replayClass($(btnId), 'used');
  }

  /** Bấm trợ giúp không dùng được: tiếng báo + thông báo. */
  function deny(msg) {
    sfx('error', { volume: 0.6 });
    toast(msg);
  }

  function useOut() {
    if (!game || game.status === 'won') return;
    if (game.boosters.out <= 0) return deny(t('toast.none'));
    if (!game.tray.length) return deny(t('toast.outNeedsTiles'));
    if (game.hold.length) return deny(t('toast.outBusy'));
    if (!E.moveOut(game)) return;
    used('btn-out', 'pop');
    closeModal('modal-lost');
    renderAll();
    afterMove();
  }

  function useSlot() {
    if (!game || game.status === 'won') return;
    if (game.cap >= E.MAX_TRAY) return deny(t('toast.slotMax'));
    if (game.boosters.slot <= 0) return deny(t('toast.none'));
    if (!E.addSlot(game)) return;
    used('btn-slot', 'coin');
    closeModal('modal-lost');
    renderAll();
    afterMove();
  }

  function useUndo() {
    if (!canAct()) return;
    if (game.boosters.undo <= 0) return deny(t('toast.none'));
    if (!game.history.length) return deny(t('toast.undoNone'));
    E.undo(game);
    used('btn-undo', 'flip');
    renderAll();
    afterMove();
  }

  function useShuffle() {
    if (!canAct()) return;
    if (game.boosters.shuffle <= 0) return deny(t('toast.none'));
    E.shuffle(game);
    used('btn-shuffle', 'flip');
    game.tiles.forEach((tl) => {
      const el = tileEls[tl.id];
      if (!el || tl.at !== 'board') return;
      setFace(el.firstChild, tl.type);
      el.classList.remove('flip');
      void el.offsetWidth;
      el.classList.add('flip');
    });
    renderAll();
    afterMove();
  }

  function requestRestart() {
    if (!game) return;
    closeModal('modal-settings');
    if (game.status !== 'playing' || E.remaining(game) === game.tiles.length) {
      retryLevel();
      return;
    }
    $('retry-text').textContent = t('retry.text', { n: game.level });
    openModal('modal-retry');
  }

  /* ---------------- Chạm / phím ---------------- */
  layer.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest && e.target.closest('.tile');
    if (!el || el.classList.contains('gone')) return;
    e.preventDefault();
    tap(Number(el.dataset.id));
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const open = document.querySelector('.modal:not([hidden])');
    if (e.key === 'Escape' && open) {
      if (open.id !== 'modal-lost') closeModal(open.id);
      return;
    }
    if (open) {
      trapFocus(e, open);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'z') useUndo();
    else if (k === 'o') useOut();
    else if (k === 's') useShuffle();
    else if (k === '+' || k === '=') useSlot();
    else if (k === 'r') requestRestart();
    else return;
    e.preventDefault();
  });

  /* ---------------- Modal ---------------- */
  let lastFocus = null;

  function openModal(id) {
    const m = $(id);
    if (!m.hidden) return;
    document.querySelectorAll('.modal:not([hidden])').forEach((x) => { x.hidden = true; });
    lastFocus = document.activeElement;
    m.hidden = false;
    const visible = (el) => el.offsetParent !== null;
    const target = Array.from(m.querySelectorAll('.btn-primary, .btn-green')).find(visible) || Array.from(m.querySelectorAll('button')).find(visible);
    if (target) target.focus();
  }
  function closeModal(id) {
    const m = $(id);
    if (!m || m.hidden) return;
    m.hidden = true;
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
      $('theme-color').content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#e9dcf5';
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
    $('stats-level').textContent = String(stats.level);
    $('stats-cleared').textContent = I18N.fmtNumber(stats.cleared);
    $('stats-played').textContent = I18N.fmtNumber(stats.played);
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
    // Đặt lại cả tiến độ: chơi lại từ cấp độ 1
    if (game && game.status !== 'won') report(false);
    stats = emptyStats();
    saveStats();
    closeModal('modal-stats');
    startLevel(1);
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
  $('btn-out').addEventListener('click', useOut);
  $('btn-undo').addEventListener('click', useUndo);
  $('btn-shuffle').addEventListener('click', useShuffle);
  $('btn-slot').addEventListener('click', useSlot);
  $('btn-lost-out').addEventListener('click', useOut);
  $('btn-lost-slot').addEventListener('click', useSlot);
  $('btn-lost-retry').addEventListener('click', () => {
    closeModal('modal-lost');
    retryLevel();
  });
  $('btn-restart').addEventListener('click', requestRestart);
  $('btn-retry-confirm').addEventListener('click', () => {
    closeModal('modal-retry');
    retryLevel();
  });
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
    if (document.hidden) saveAll();
  });
  window.addEventListener('pagehide', saveAll);
  I18N.onBeforeReload(saveAll);

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => relayout()).observe(stage);
  } else {
    window.addEventListener('resize', relayout);
  }

  /* ---------------- Khởi động ---------------- */
  $('app-version').textContent = APP_VERSION;
  applyTheme();
  renderSettings();

  const restored = restoreGame();
  if (restored) {
    game = restored;
    buildTiles(false);
    renderAll();
    writeSummary();
    PN && PN.gameStart({ mode: MODE, resume: true });
  } else {
    startLevel(stats.level);
  }
})();
