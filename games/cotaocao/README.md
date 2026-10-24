# Cờ Tào Cáo

Game Cờ Tào Cáo (Backgammon) của PlayNine, viết bằng HTML + CSS + JavaScript thuần, dùng bộ dùng chung `../_kit/` (xem [games/_kit/README.md](../_kit/README.md)). Mở `index.html` là chơi được; trong cổng game chạy trong iframe và báo ván qua SDK.

## Luật chơi

- Bàn 24 điểm (tam giác), mỗi bên 15 quân, xếp như backgammon chuẩn: 2 quân ở điểm 24, 5 ở 13, 3 ở 8, 5 ở 6 (theo góc nhìn của mỗi bên). Bạn cầm **trắng**, đi ngược chiều kim đồng hồ về **nhà** ở góc dưới phải (điểm 1–6); máy cầm **đen**, đi chiều ngược lại.
- **Mở ván:** mỗi bên gieo một con (đều thì gieo lại), bên cao hơn đi trước bằng chính hai số đó.
- Mỗi lượt gieo hai xúc xắc, mỗi số đi một quân đúng số điểm (một quân có thể đi cả hai số); gieo **đôi** thì đi bốn lần.
- **Phải dùng tối đa số xúc xắc có thể.** Nếu chỉ dùng được một trong hai số thì phải dùng **số lớn hơn** (khi số lớn đi được).
- Không đáp xuống điểm có từ hai quân đối thủ. Đáp xuống điểm có đúng một quân đối thủ (**blot**) là **đánh** quân đó lên **thanh giữa** (bar).
- Có quân trên thanh giữa thì phải **vào lại** nhà đối thủ trước khi đi quân khác; không vào được thì mất lượt.
- Khi cả 15 quân đã ở nhà thì **gỡ quân** (bear off) ra khay: số đúng khoảng cách gỡ quân ở điểm đó; số lớn hơn chỉ gỡ được khi không còn quân ở điểm cao hơn.
- Ai gỡ hết 15 quân trước thì thắng. Thắng **thường** 1 điểm; **gammon** (bên thua chưa gỡ quân nào) 2 điểm; **backgammon** (chưa gỡ quân nào và còn quân trên thanh giữa hoặc trong nhà bên thắng) 3 điểm.
- **Trận một ván**, **không có doubling cube** (lý do ở mục "Tự quyết").

## Điều khiển

- **Chạm / chuột:** xúc xắc tự gieo đầu lượt (có hiệu ứng lăn). Chạm một quân trắng đi được (viền vàng) → các điểm đến hợp lệ sáng lên (có vòng chấm chỗ quân sẽ đứng) → chạm điểm đến. Điểm đến cần nhiều bước của cùng một quân (ví dụ 6-5 đi thẳng 24 → 13) sáng nhạt hơn; chạm vào là đi cả chuỗi (ưu tiên đường ít bước, rồi đường không đánh quân giữa đường). **Chạm lại quân đang chọn** (chạm đúp) là đi bằng số lớn nhất còn đi được. Chỉ còn một quân đi được (thường là quân trên thanh giữa) thì game chọn sẵn.
- Gỡ quân: chạm khay bên phải (màn hình rộng) / phía dưới (màn hình đứng) khi khay sáng lên.
- **Hoàn tác** (nút mũi tên cong) bỏ từng nước trong lượt; **Xong lượt** chuyển lượt khi đã dùng hết số xúc xắc được dùng. Cài đặt có **Tự xong lượt** (tắt mặc định). Không đi được thì game báo rồi tự chuyển lượt.
- Máy đi từng quân có hoạt cảnh; quân máy vừa đi tới có vòng vàng bên trong tới khi bạn đi.
- Bàn vẽ bằng SVG, tự chọn **ngang** (màn hình rộng) hoặc **dọc** (màn hình đứng: điểm 13–24 ở cột trái, 12–1 ở cột phải, khay ở dưới) cho quân to nhất; trục dài còn thừa thì giãn bước điểm. Ở 390×844 quân khoảng 30 px, mỗi điểm cao khoảng 40 px. Chồng quá 5 quân thì quân trên cùng hiện số.
- Giảm chuyển động (`prefers-reduced-motion`): không lăn xúc xắc, quân không bay (vẫn có nhịp nghỉ ngắn giữa các nước của máy), điểm đến và nút Xong lượt không nhấp nháy.
- Lần đầu mở game tự hiện hộp **Cách chơi** (lưu `guideSeen` trong cài đặt).

## Máy và mode

Chọn mức trong **Cài đặt**. Chưa đi nước nào (hoặc ván đã xong) thì đổi mức là chơi ván mới ngay (gửi lại `start` với mode mới, không gửi `end`); đang dở thì áp dụng từ ván sau.

Máy sinh **mọi chuỗi nước khác nhau** cho lần gieo (mỗi vị trí cuối một lần, đã áp luật dùng tối đa xúc xắc và luật số lớn hơn) rồi chấm vị trí:

| Mode | Máy |
| --- | --- |
| `easy` (Dễ) | Heuristic thô: chênh pip + 1,2 mỗi điểm đã chiếm − 1,5 mỗi blot (không xét ai đánh được), cộng nhiễu ±7 pip. |
| `medium` (Vừa) | Heuristic đầy đủ (đơn vị ≈ pip): chênh pip; giá trị điểm đã chiếm theo vị trí (điểm 5, 6, 7 cao nhất; neo ở điểm 20, 21 của mình); prime (chuỗi điểm liền) có quân đối thủ kẹt phía sau; quân đối thủ trên thanh giữa so với số điểm nhà đã đóng; trừ **blot bị lộ** = kỳ vọng pip mất theo đúng số cách gieo (trong 36) đối thủ đánh trúng, có xét điểm bị chặn trên đường đi; trừ chồng quá cao. Hết tiếp xúc (đua thuần): pip + số quân đã gỡ. |
| `hard` (Khó) | Lấy 6 ứng viên tốt nhất theo heuristic Vừa, mỗi ứng viên **nhìn trước 1 lượt** theo 21 kết quả gieo của đối thủ (trọng số 1/36 hoặc 2/36, đối thủ đáp bằng heuristic Vừa), chọn kỳ vọng cao nhất. Đua thuần thì dùng heuristic. |

Khó nghĩ trung bình ~3 ms mỗi nước trong Node (chậm nhất ~10 ms), vẫn chạy trong Web Worker dựng từ mã nguồn engine (`GameEngine.factory`); không tạo được worker thì `planMove` tính từng ứng viên theo khúc 20 ms bằng `setTimeout`. Máy "nghĩ" ít nhất 450 ms sau khi gieo. Chuỗi máy trả về sai luật (không xảy ra) thì app thay bằng nước của mức Dễ.

**Mức mạnh dần** (đo trong `test.js`, xúc xắc tất định theo seed, hai bên luân phiên đi trước theo gieo mở ván):

| Cặp | Kết quả (bên trước thắng) | Điểm (1/2/3 theo gammon) |
| --- | --- | --- |
| Vừa – ngẫu nhiên hợp lệ | 100/100 (100%) | 253 – 0 |
| Dễ – ngẫu nhiên hợp lệ | 100/100 (100%) | |
| Vừa – Dễ | 190/200 (95%) | 360 – 13 |
| Khó – Dễ | 55/60 (92%) | 107 – 6 |
| Khó – Vừa | 44/60 (73%) | 66 – 18 |

## Xúc xắc và chống gian lận

- Xúc xắc dùng PRNG mulberry32 (`E.rng(seed)`), test truyền seed cố định nên tất định. Trong game, hạt giống lấy từ `crypto.getRandomValues` mỗi lần mở trang và **không lưu** ở đâu, nên không ai đoán trước được lần gieo sau.
- Xúc xắc chỉ được gieo khi tới lượt và được **ghi ngay vào ván lưu** (kể cả của máy), nên tải lại trang không gieo lại được. Mặt số nhảy trong lúc lăn chỉ để trang trí (Math.random), mặt thật chỉ hiện khi lăn xong.
- Ván lưu chỉ giữ vị trí đầu lượt + xúc xắc + các nước đã đi trong lượt; khi mở lại engine đi lại từng nước qua `applyStep`, ván sai luật bị bỏ.

## Ghi điểm trên cổng

Metric `wins` (số trận thắng; trận = một ván), 15 điểm mặc định; mode theo mức máy: `easy` 10 điểm, `medium` 15 điểm, `hard` 25 điểm (bảng 4.8 của lộ trình), mỗi mode luật `min_duration_ms` 15000.

- Ngưỡng 15000 ms: tổng pip ban đầu 167, mỗi lượt đi tối đa 24 pip (6-6) nên bạn cần ít nhất 7 lượt, xen giữa là ít nhất 6 lượt máy. Mỗi lượt máy (kể cả giảm chuyển động) ≥ gieo 0,2 s + nghĩ 0,45 s + nghỉ 0,26 s sau mỗi nước ≈ 0,9 s; mỗi lượt bạn ≥ gieo 0,2 s + 4 nước chạm đúp (8 lần chạm × ~0,15 s) + Xong lượt ≈ 1,5 s; cộng gieo mở ván ≈ 0,9 s, tổng ≈ 17 s ngay cả khi gieo toàn 6-6. Ván thật kéo dài vài phút.
- Ván mới: `kit.sdk.start(level)`; mở lại ván lưu dở: `kit.sdk.start(level, true)`.
- Hết ván: `kit.sdk.end({ mode: level, won, assisted: false })`; thắng `won: true` (thường, gammon hay backgammon đều là một trận thắng), thua `won: false` (backgammon không có hòa).
- Bỏ ván đã đi ít nhất một nước (bấm Ván mới rồi xác nhận): gửi `won: false`. Chưa đi nước nào thì không gửi gì.
- **Hoàn tác trong lượt không tính là trợ giúp** (`assisted` luôn `false`): xúc xắc đã biết trước khi đi, hoàn tác không lộ thêm thông tin gì, chỉ như cầm quân lên đặt lại trước khi bấm Xong lượt. Không có đi lại qua lượt khác.

## Dữ liệu lưu trong trình duyệt

| Khóa | Nội dung |
| --- | --- |
| `playnine-cotaocao-settings-v1` | Cài đặt: giao diện, `level` (`easy` / `medium` / `hard`), `autoEnd` (true / false), `guideSeen` |
| `playnine-cotaocao-stats-v1` | Thống kê: `levels.<mức>.{played, won, lost, gammons}`, `streak`, `best`, `points` (tổng điểm thắng 1/2/3) |
| `playnine-cotaocao-save-v1` | Ván đang chơi `{ v: 1, level, seed (hạt giống của máy), humanTurns, game }`; `game` là `toJSON` của engine: `{ v: 1, pts: [bạn, máy] (vị trí đầu lượt, mỗi bên 26 ô theo góc nhìn của bên đó: 1..24 điểm, 25 thanh giữa, 0 đã gỡ), turn (0 bạn / 1 máy), dice ([a, b] hoặc null), steps ([[từ, tới, số]…] trong lượt), opening, turns }`. Lưu ngay từ lúc gieo mở ván, xóa khi hết ván |
| `playnine-cotaocao-summary-v1` | Tóm tắt cho thẻ game trên cổng |

Các khóa này tự đồng bộ lên tài khoản khi người chơi đăng nhập Google.

## Phím tắt

| Phím | Chức năng |
| --- | --- |
| `←` `→` (`↑` `↓`) | Chuyển giữa các quân đi được; khi đã chọn quân thì chuyển giữa các điểm đến |
| `Enter` | Chọn quân / đi tới điểm đến dưới con trỏ; đi hết thì Xong lượt |
| `Esc` | Bỏ chọn; đóng hộp thoại |
| `U` / `Backspace` / `Ctrl+Z` | Hoàn tác nước vừa đi trong lượt |
| `Space` / `D` | Xong lượt |
| `N` | Ván mới |

## Kiểm tra

```bash
node test.js
```

Test engine phủ: thế cờ ban đầu, gieo mở ván (bên cao đi trước bằng hai số đó, đều thì gieo lại), PRNG tất định, sinh nước (không trùng vị trí cuối, đôi đi 4 lần, điểm bị chặn, đánh blot, vào lại từ thanh giữa trước, bị chặn hết thì mất lượt, hai quân trên thanh chỉ vào được một), gỡ quân (chỉ khi về nhà hết, số dư chỉ gỡ quân xa nhất), luật dùng tối đa xúc xắc (cấm bước làm mất con kia; 2-1 với quân cuối ở điểm 2 phải đi 2/1* rồi gỡ), luật số lớn hơn (và dùng số nhỏ khi số lớn bị chặn), đi từng bước / hoàn tác / kết thúc lượt / bước sai luật, thắng thường / gammon / backgammon (cả khi máy thắng), số cách gieo đánh trúng blot đúng bảng chuẩn 36 cách (khoảng cách 1–24) và giảm khi đường bị chặn, lưu / khôi phục (kể cả giữa lượt) và từ chối dữ liệu hỏng, máy mọi mức luôn đi đúng luật (mọi chuỗi máy chọn nằm trong tập nước hợp lệ), tất định theo seed, Vừa / Khó làm điểm 5 với 3-1 mở ván, Vừa đánh blot khi có lợi, tốc độ Khó, và năm test **mức mạnh dần** (bảng trên). Chạy khoảng 10 giây. Test Playwright trong cổng nằm ở `e2e.spec.ts` (chạy cùng `npm run e2e` sau khi build và ghép).

## Tự quyết

- **Trận một ván, không doubling cube:** ván backgammon đã dài vài phút, trận tới 3/5 điểm quá dài cho điện thoại. Với trận một ván, cube chỉ đổi số điểm chứ không đổi thắng / thua trên cổng, lại mở đường "gấp đôi để máy bỏ" kết thúc ván rất sớm (khó đặt ngưỡng chống gian lận) và cần thêm logic nhận / bỏ cho máy. Gammon / backgammon vẫn tính và hiện trong kết quả, thống kê (`points`, `gammons`).
- Không có chế độ 2 người cùng máy (spec chỉ yêu cầu đấu máy; bàn vẽ theo góc nhìn quân trắng).
