-- Đợt 3 của lộ trình 100 game (game 38–45): Xì Dách, Xếp Bài Nhện, Ô Trống, Kim Tự Tháp, Ba Đỉnh, Bài Tám, Poker Rút, Đô-mi-nô.
-- Sinh bởi `npm run seed-sql -- xidach xepbainhen otrong kimtuthap badinh baitam pokerrut domino` từ games/*/game.json.
insert into public.games (id, metric, modes, points) values
('xidach', 'wins', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":30000},"points":8}]'::jsonb, 8),
('xepbainhen', 'time_low', '[{"key":"s1","label":{"en":"1 suit","vi":"1 chất"},"rules":{"min_time_ms":75000},"points":6},{"key":"s2","label":{"en":"2 suits","vi":"2 chất"},"rules":{"min_time_ms":120000},"points":10},{"key":"s4","label":{"en":"4 suits","vi":"4 chất"},"rules":{"min_time_ms":180000},"points":16}]'::jsonb, 10),
('otrong', 'time_low', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_time_ms":12000},"points":8}]'::jsonb, 8),
('kimtuthap', 'wins', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":15000},"points":6}]'::jsonb, 6),
('badinh', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":20000,"max_score_per_sec":60,"max_score":1788},"points":5}]'::jsonb, 5),
('baitam', 'wins', '[{"key":"easy","label":{"en":"Easy","vi":"Dễ"},"rules":{"min_duration_ms":6000},"points":6},{"key":"hard","label":{"en":"Hard","vi":"Khó"},"rules":{"min_duration_ms":6000},"points":10}]'::jsonb, 8),
('pokerrut', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":15000,"max_score":99975},"points":5}]'::jsonb, 5),
('domino', 'wins', '[{"key":"easy","label":{"en":"Easy","vi":"Dễ"},"rules":{"min_duration_ms":8000},"points":6},{"key":"hard","label":{"en":"Hard","vi":"Khó"},"rules":{"min_duration_ms":8000},"points":10}]'::jsonb, 8);
