-- Game thứ 19-21: Trượt Số, Lật Thẻ (xếp hạng theo thời gian) và Bắn Bóng (xếp hạng theo điểm).
-- min_time_ms đặt dưới thời gian của người chơi rất nhanh để chỉ chặn kết quả bất khả thi.
-- Bắn Bóng: người chơi thật thường < 100 điểm/giây; bot ngắm hoàn hảo đỉnh ~420/giây ở ván ngắn nên đặt 600.
insert into public.games (id, metric, modes, points) values
('truotso', 'time_low', jsonb_build_array(
  jsonb_build_object('key', '3x3', 'label', jsonb_build_object('en', '3x3', 'vi', '3x3'),
                     'rules', '{"min_time_ms":1000}'::jsonb, 'points', 3),
  jsonb_build_object('key', '4x4', 'label', jsonb_build_object('en', '4x4', 'vi', '4x4'),
                     'rules', '{"min_time_ms":3000}'::jsonb, 'points', 6),
  jsonb_build_object('key', '5x5', 'label', jsonb_build_object('en', '5x5', 'vi', '5x5'),
                     'rules', '{"min_time_ms":8000}'::jsonb, 'points', 10)),
 5),
('latthe', 'time_low', jsonb_build_array(
  jsonb_build_object('key', 'easy', 'label', jsonb_build_object('en', 'Easy', 'vi', 'Dễ'),
                     'rules', '{"min_time_ms":1500}'::jsonb, 'points', 3),
  jsonb_build_object('key', 'medium', 'label', jsonb_build_object('en', 'Medium', 'vi', 'Vừa'),
                     'rules', '{"min_time_ms":2500}'::jsonb, 'points', 5),
  jsonb_build_object('key', 'hard', 'label', jsonb_build_object('en', 'Hard', 'vi', 'Khó'),
                     'rules', '{"min_time_ms":5000}'::jsonb, 'points', 8)),
 5),
('banbong', 'score_high', jsonb_build_array(
  jsonb_build_object('key', 'classic', 'label', jsonb_build_object('en', 'Classic', 'vi', 'Cổ điển'),
                     'rules', '{"min_duration_ms":5000,"max_score_per_sec":600}'::jsonb, 'points', 5)),
 5);
