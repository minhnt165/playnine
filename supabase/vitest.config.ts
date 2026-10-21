import { defineConfig } from 'vitest/config'

// Mỗi test dựng PGlite và chạy toàn bộ migration nên cần timeout rộng hơn mặc định 5s.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
})
