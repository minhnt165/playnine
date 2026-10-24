-- Đợt 4 của lộ trình 100 game (game 46–53): Chim Bay, Nhảy Cao, Qua Đường, Đập Chuột, Xếp Tầng, Bóng Bàn, Bắn Phi Thuyền, Thiên Thạch.
-- Sinh bởi `npm run seed-sql -- chimbay nhaycao quaduong dapchuot xeptang bongban banphithuyen thienthach` từ games/*/game.json.
insert into public.games (id, metric, modes, points) values
('chimbay', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":5000,"max_score_per_sec":1.3},"points":5}]'::jsonb, 5),
('nhaycao', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":5000,"max_score_per_sec":35},"points":5}]'::jsonb, 5),
('quaduong', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":5000,"max_score_per_sec":8},"points":5}]'::jsonb, 5),
('dapchuot', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":55000,"max_score":384,"max_score_per_sec":13},"points":5}]'::jsonb, 5),
('xeptang', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":5000,"max_score_per_sec":5},"points":5}]'::jsonb, 5),
('bongban', 'wins', '[{"key":"easy","label":{"en":"Easy","vi":"Dễ"},"rules":{"min_duration_ms":30000},"points":6},{"key":"medium","label":{"en":"Medium","vi":"Vừa"},"rules":{"min_duration_ms":30000},"points":10},{"key":"hard","label":{"en":"Hard","vi":"Khó"},"rules":{"min_duration_ms":30000},"points":16}]'::jsonb, 10),
('banphithuyen', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":5000,"max_score_per_sec":80},"points":5}]'::jsonb, 5),
('thienthach', 'score_high', '[{"key":"classic","label":{"en":"Classic","vi":"Cổ điển"},"rules":{"min_duration_ms":5000,"max_score_per_sec":500},"points":5}]'::jsonb, 5);
