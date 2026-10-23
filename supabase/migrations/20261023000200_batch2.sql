-- Đợt 2 của lộ trình 100 game (game 30–37): Cá Ngựa, Tangram, Cờ Thú, Cờ Đơn, Hoa Dung Đạo, Rắn Leo Thang, Cờ Chín Quân, Xí Ngầu.
-- Sinh bởi `npm run seed-sql -- cangua tangram cothu codon hoadungdao ranleothang cochinquan xingau` từ games/*/game.json.
insert into public.games (id, metric, modes, points) values
('cangua', 'wins', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":30000},"points":6}]'::jsonb, 6),
('tangram', 'wins', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":5000},"points":4}]'::jsonb, 4),
('cothu', 'wins', '[{"key":"easy","label":{"en":"Easy","vi":"Dễ"},"rules":{"min_duration_ms":3000},"points":10},{"key":"medium","label":{"en":"Medium","vi":"Vừa"},"rules":{"min_duration_ms":3000},"points":15},{"key":"hard","label":{"en":"Hard","vi":"Khó"},"rules":{"min_duration_ms":3000},"points":25}]'::jsonb, 15),
('codon', 'wins', '[{"key":"english","label":{"en":"English","vi":"Kiểu Anh"},"rules":{"min_duration_ms":8000},"points":6},{"key":"european","label":{"en":"European","vi":"Kiểu Pháp"},"rules":{"min_duration_ms":8000},"points":8},{"key":"triangle","label":{"en":"Triangle","vi":"Tam giác"},"rules":{"min_duration_ms":8000},"points":4}]'::jsonb, 6),
('hoadungdao', 'wins', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":5000},"points":5}]'::jsonb, 5),
('ranleothang', 'wins', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":10000},"points":1}]'::jsonb, 1),
('cochinquan', 'wins', '[{"key":"easy","label":{"en":"Easy","vi":"Dễ"},"rules":{"min_duration_ms":3000},"points":10},{"key":"medium","label":{"en":"Medium","vi":"Vừa"},"rules":{"min_duration_ms":3000},"points":15},{"key":"hard","label":{"en":"Hard","vi":"Khó"},"rules":{"min_duration_ms":3000},"points":25}]'::jsonb, 15),
('xingau', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":30000,"max_score":1575},"points":5}]'::jsonb, 5);
