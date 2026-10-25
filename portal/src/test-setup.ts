import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// Trang lazy (React.lazy) import lần đầu khi cả bộ test chạy song song có thể quá 1 giây mặc định của waitFor/findBy;
// 4 giây vẫn dưới giới hạn 5 giây của mỗi test.
configure({ asyncUtilTimeout: 4000 })

// jsdom không có Web Animations API; preview dùng el.animate nên stub no-op.
if (!Element.prototype.animate) Element.prototype.animate = (() => ({ cancel() {}, finish() {} })) as never
