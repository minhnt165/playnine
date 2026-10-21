-- Game thứ 18: Nối Hình (xếp 3 hình vào khay). Mỗi lần chơi một cấp độ là một ván; xếp hạng theo số ván thắng.
-- Cấp 1 chỉ có 9 ô nên ngưỡng thời gian tối thiểu đặt thấp hơn các game 'wins' khác.
insert into public.games (id, metric, modes) values
('noihinh', 'wins', jsonb_build_array(
  jsonb_build_object('key', 'classic', 'label', jsonb_build_object('en', 'Classic', 'vi', 'Cổ điển'),
                     'rules', '{"min_duration_ms":2000}'::jsonb)));
