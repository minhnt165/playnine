// Thông tin bản build, do vite.config.ts điền lúc build (define) để biết web đang chạy bản nào.
export type BuildInfo = { version: string; commit: string; time: string }

export const BUILD_INFO: BuildInfo = {
  version: __APP_VERSION__,
  commit: __COMMIT__,
  time: __BUILD_TIME__,
}

const REPO_URL = 'https://github.com/minhnt165/playnine'

/** Nhãn hiện ở chân trang: "v1.0.0 · abc1234 · <thời điểm build>". */
export function buildLabel(info: BuildInfo, fmtTime: (d: Date) => string): string {
  return 'v' + info.version + ' · ' + info.commit + ' · ' + fmtTime(new Date(info.time))
}

/** Liên kết tới commit trên GitHub; bản chạy local không có commit thì trả null. */
export function commitUrl(commit: string): string | null {
  return commit === 'dev' ? null : REPO_URL + '/commit/' + commit
}
