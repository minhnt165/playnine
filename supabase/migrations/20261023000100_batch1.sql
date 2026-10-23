-- Đợt 1 của lộ trình 100 game (game 22–29): Tắt Đèn, Tháp Hà Nội, Đẩy Thùng, Rót Nước, Nối Màu, Nổ Khối, Xếp Khối, Đoán Mã.
-- Sinh bởi `npm run seed-sql -- tatden thaphanoi daythung rotnuoc noimau nokhoi xepkhoi doanma` từ games/*/game.json.
insert into public.games (id, metric, modes, points) values
('tatden', 'wins', '[{"key":"5x5","label":{"en":"5x5","vi":"5x5"},"rules":{"min_duration_ms":3000},"points":4},{"key":"7x7","label":{"en":"7x7","vi":"7x7"},"rules":{"min_duration_ms":3000},"points":6}]'::jsonb, 4),
('thaphanoi', 'time_low', '[{"key":"d4","label":{"en":"4 disks","vi":"4 đĩa"},"rules":{"min_time_ms":3000},"points":2},{"key":"d5","label":{"en":"5 disks","vi":"5 đĩa"},"rules":{"min_time_ms":7000},"points":3},{"key":"d6","label":{"en":"6 disks","vi":"6 đĩa"},"rules":{"min_time_ms":15000},"points":5},{"key":"d7","label":{"en":"7 disks","vi":"7 đĩa"},"rules":{"min_time_ms":30000},"points":7}]'::jsonb, 3),
('daythung', 'wins', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":3000},"points":6}]'::jsonb, 6),
('rotnuoc', 'wins', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":3000},"points":4}]'::jsonb, 4),
('noimau', 'wins', '[{"key":"5x5","label":{"en":"5x5","vi":"5x5"},"rules":{"min_duration_ms":3000},"points":3},{"key":"7x7","label":{"en":"7x7","vi":"7x7"},"rules":{"min_duration_ms":3000},"points":5},{"key":"9x9","label":{"en":"9x9","vi":"9x9"},"rules":{"min_duration_ms":6000},"points":8}]'::jsonb, 5),
('nokhoi', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":5000,"max_score_per_sec":600},"points":5}]'::jsonb, 5),
('xepkhoi', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":5000,"max_score_per_sec":40},"points":5}]'::jsonb, 5),
('doanma', 'time_low', '[{"key":"easy","label":{"en":"Easy","vi":"Dễ"},"rules":{"min_time_ms":1500},"points":3},{"key":"hard","label":{"en":"Hard","vi":"Khó"},"rules":{"min_time_ms":1900},"points":6}]'::jsonb, 4);
