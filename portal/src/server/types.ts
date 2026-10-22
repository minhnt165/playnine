export type Metric = 'score_high' | 'time_low' | 'wins'
export type Period = 'day' | 'week' | 'all'
export type Profile = { id: string; displayName: string; avatarUrl: string | null }
/** `isGuest`: tài khoản khách (ẩn danh Supabase), có thể liên kết Google sau để giữ điểm. */
export type AuthUser = Profile & { isAdmin?: boolean; isGuest?: boolean }
export type Rules = { min_duration_ms?: number; max_score?: number; max_score_per_sec?: number; min_time_ms?: number }
/** `points`: điểm mỗi ván xong của riêng mode này; thiếu thì dùng `GameMeta.points`. */
export type ModeMeta = { key: string; label: { en: string; vi: string }; rules?: Rules; points?: number }
/** `points`: điểm mặc định mỗi ván xong của game cho mode không có điểm riêng (thắng không trợ giúp được gấp đôi);
 * thiếu khi server chưa có cột này. */
export type GameMeta = { id: string; metric: Metric; modes: ModeMeta[]; hidden: boolean; points?: number }
export type LeaderRow = {
  rank: number
  userId: string
  displayName: string
  avatarUrl: string | null
  value: number
  achievedAt: string
}
/** Xếp hạng người chơi toàn cổng: điểm tích lũy, số ván xong, số ván thắng (không trợ giúp), số huy hiệu sự kiện. */
export type PlayerKind = 'points' | 'runs' | 'wins' | 'badges'
/** Điểm và hạng điểm của một người chơi theo kỳ; rank null khi chưa có điểm. */
export type PointsSummary = Partial<Record<Period, { points: number; rank: number | null }>>
export type PlayerRow = Omit<LeaderRow, 'achievedAt'>
/** Một hàng của bảng "top mọi game": mode là mode đầu tiên hợp với kỳ (daily chỉ cho kỳ ngày). */
export type TopRow = LeaderRow & { gameId: string; mode: string }
export type RunResult = { score?: number; timeMs?: number; won: boolean; assisted: boolean }
export type FinishResult = {
  status: 'finished' | 'rejected'
  reason: string | null
  ranks: Partial<Record<Period, number>>
}
export type BestRow = { gameId: string; mode: string; metric: Metric; value: number; achievedAt: string }
export type Text = { en: string; vi?: string }
export type EventAgg = 'best' | 'sum'
export type EventStatus = 'scheduled' | 'live' | 'closed' | 'cancelled'
export type EventPhase = 'upcoming' | 'live' | 'ended' | 'cancelled'
export type GameEvent = {
  id: string
  title: Text
  description: Partial<Text>
  gameId: string
  mode: string
  agg: EventAgg
  startsAt: string
  endsAt: string
  awardTop: number
  status: EventStatus
}
export type EventInput = Omit<GameEvent, 'id' | 'status'> & { id?: string }
/** Sửa một phần: chỉ các trường có mặt mới đổi; trường vắng giữ giá trị cũ trong DB. */
export type EventPatch = Partial<Omit<EventInput, 'id'>> & { id: string }
export type Collection = { id: string; title: Text; gameIds: string[]; startsAt: string; endsAt: string | null; sort: number }
export type CollectionInput = Omit<Collection, 'id'> & { id?: string }
/** Bài tin tức: `publishedAt` null là nháp, ở tương lai là hẹn giờ; `body` là văn bản có markdown nhẹ. */
export type Post = {
  id: string
  slug: string
  title: Text
  summary: Partial<Text>
  body: Partial<Text>
  gameId: string | null
  tags: string[]
  pinned: boolean
  publishedAt: string | null
  updatedAt: string
}
export type PostInput = Omit<Post, 'id' | 'updatedAt'> & { id?: string }
/** Một khóa tiến độ game lưu trên tài khoản; `value` null = đã xóa. `syncedAt`: giờ server nhận (mốc để kéo phần mới). */
export type SaveRow = { key: string; value: string | null; updatedAt: string; syncedAt: string }
export type SaveItem = { key: string; value: string | null; updatedAt: string }
/** Một ván trong lịch sử chơi của chính người dùng; `points` là điểm thật sự được cộng (0 nếu quá 20 ván/ngày, bị từ chối...). */
export type HistoryRun = {
  id: string
  gameId: string
  mode: string
  status: 'finished' | 'rejected'
  startedAt: string
  endedAt: string
  score: number | null
  timeMs: number | null
  won: boolean | null
  assisted: boolean
  rejectReason: string | null
  points: number
}
/** Tin game lấy tự động từ RSS (scripts/crawl-news.mjs): chỉ tiêu đề, tóm tắt, ảnh và link bài gốc. */
export type FeedItem = {
  id: string
  url: string
  source: string
  lang: 'en' | 'vi'
  title: string
  summary: string | null
  imageUrl: string | null
  publishedAt: string
  hidden: boolean
}
/** Đánh giá trung bình (1 chữ số thập phân) và số lượt đánh giá của một game. */
export type RatingSummary = { average: number; count: number }
export type Badge = { eventId: string; rank: number; awardedAt: string; title: Text; gameId: string; mode: string }
export type RunStatusDb = 'started' | 'finished' | 'rejected'
export type AdminRun = {
  id: string
  userId: string
  displayName: string
  gameId: string
  mode: string
  startedAt: string
  endedAt: string | null
  score: number | null
  timeMs: number | null
  won: boolean | null
  assisted: boolean
  status: RunStatusDb
  rejectReason: string | null
}
export type RunFilter = { gameId?: string; mode?: string; userId?: string; status?: RunStatusDb; before?: string; limit?: number }
export type AdminPlayer = {
  id: string
  displayName: string
  avatarUrl: string | null
  role: 'player' | 'admin'
  banned: boolean
  createdAt: string
  runs: number
}
