import type {
  AdminPlayer, AdminRun, AuthUser, Badge, BestRow, Collection, CollectionInput, EventInput, EventPatch, FinishResult, GameEvent,
  FeedItem, GameMeta, HistoryRun, SaveItem, SaveRow, LeaderRow, Period, PlayerKind, PlayerRow, PointsSummary, Post, PostInput, Profile, RatingSummary, RunFilter, RunResult, Rules, TopRow,
} from './types'

/** Giao diện duy nhất cổng dùng để nói chuyện với server (Supabase thật hoặc fake khi test). */
export interface ServerApi {
  currentUser(): Promise<AuthUser | null>
  onAuthChange(cb: (u: AuthUser | null) => void): () => void
  signInWithGoogle(): Promise<void>
  /** Tạo tài khoản khách (ẩn danh); điểm được lưu và lên bảng như người chơi thường. */
  signInAsGuest(): Promise<void>
  /** Khách liên kết tài khoản Google (chuyển trang), giữ nguyên điểm và hồ sơ. */
  linkGoogle(): Promise<void>
  signOut(): Promise<void>
  gameMeta(): Promise<GameMeta[]>
  playTotals(): Promise<Record<string, number>>
  recordPlay(gameId: string): Promise<void>
  startRun(gameId: string, mode: string): Promise<string>
  finishRun(runId: string, r: RunResult): Promise<FinishResult>
  leaderboard(gameId: string, mode: string, period: Period, limit?: number): Promise<LeaderRow[]>
  myRank(gameId: string, mode: string, period: Period): Promise<{ rank: number; value: number } | null>
  /** Xếp hạng người chơi toàn cổng; `badges` chỉ có kỳ `all`. */
  playerLeaderboard(kind: PlayerKind, period: Period, limit?: number): Promise<PlayerRow[]>
  /** Bảng xếp hạng điểm của một game (không chia mode); điểm như điểm tổng nhưng không có huy hiệu. */
  gamePointsBoard(gameId: string, period: Period, limit?: number): Promise<LeaderRow[]>
  /** Hạng điểm của mình trong một game; null khi chưa có điểm. */
  myGamePoints(gameId: string, period: Period): Promise<{ rank: number; value: number } | null>
  /** Đánh giá trung bình theo game (game chưa ai đánh giá thì không có khóa). */
  ratingSummary(): Promise<Record<string, RatingSummary>>
  /** Số sao mình đã chấm theo game. */
  myRatings(): Promise<Record<string, number>>
  /** Chấm 1–5 sao; null là bỏ đánh giá. */
  rateGame(gameId: string, stars: number | null): Promise<void>
  /** Điểm và hạng điểm của người chơi theo ngày, tuần, mọi lúc. */
  playerPoints(userId: string): Promise<PointsSummary>
  /** Top `limit` của mọi game không ẩn trong một lần gọi. */
  topBoards(period: Period, limit?: number): Promise<TopRow[]>
  profile(userId: string): Promise<Profile | null>
  profileBests(userId: string): Promise<BestRow[]>
  updateDisplayName(name: string): Promise<void>
  /** Mọi sự kiện, mọi trạng thái (bảng events đọc công khai). */
  events(): Promise<GameEvent[]>
  eventLeaderboard(eventId: string, limit?: number): Promise<LeaderRow[]>
  /** Mọi bộ sưu tập; client tự lọc theo thời gian. */
  collections(): Promise<Collection[]>
  profileBadges(userId: string): Promise<Badge[]>
  /** Bài đã đăng (RLS lọc nháp và bài hẹn giờ), ghim lên trước rồi mới nhất trước. */
  posts(): Promise<Post[]>
  post(slug: string): Promise<Post | null>
  /** Mọi bài kể cả nháp/hẹn giờ (chỉ admin). */
  adminPosts(): Promise<Post[]>
  adminSavePost(p: PostInput): Promise<string>
  adminDeletePost(id: string): Promise<void>
  /** Game yêu thích của người đang đăng nhập (kể cả khách), mới thêm trước. */
  favorites(): Promise<string[]>
  setFavorite(gameId: string, on: boolean): Promise<void>
  /** Lịch sử ván của người đang đăng nhập, mới nhất trước; `before` = endedAt của ván cuối trang trước. */
  myRuns(opts?: { gameId?: string; before?: string; limit?: number }): Promise<HistoryRun[]>
  /** Tiến độ game trên tài khoản server nhận sau `since` (null = tất cả). */
  mySaves(since: string | null): Promise<SaveRow[]>
  /** Đẩy tối đa 100 khóa; server chỉ ghi khóa có updatedAt mới hơn bản đang có. */
  putSaves(items: SaveItem[]): Promise<number>
  /** Tin game tự động chưa bị ẩn, mới nhất trước. */
  newsFeed(limit?: number): Promise<FeedItem[]>
  /** Mọi tin tự động kể cả đã ẩn (chỉ admin). */
  adminNewsFeed(): Promise<FeedItem[]>
  adminHideNews(id: string, hidden: boolean): Promise<void>
  // Các hàm admin: lỗi SQL (forbidden, event_started...) nằm trong message của Error.
  /** `points` undefined/null: giữ nguyên điểm mặc định của game. `modePoints`: điểm riêng của mode được nêu
   * (null = bỏ điểm riêng, về mức mặc định); mode không nêu giữ nguyên. */
  adminUpdateGame(
    gameId: string,
    hidden: boolean | null,
    rules: Record<string, Rules>,
    points?: number | null,
    modePoints?: Record<string, number | null>,
  ): Promise<void>
  adminSaveEvent(e: EventInput | EventPatch): Promise<string>
  adminCancelEvent(id: string): Promise<void>
  adminRecomputeEvent(id: string): Promise<void>
  adminSaveCollection(c: CollectionInput): Promise<string>
  adminDeleteCollection(id: string): Promise<void>
  adminRuns(f: RunFilter): Promise<AdminRun[]>
  adminRejectRun(runId: string, reason?: string): Promise<void>
  adminPlayers(query: string): Promise<AdminPlayer[]>
  adminSetBanned(userId: string, banned: boolean): Promise<void>
}
