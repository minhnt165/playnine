import '@testing-library/jest-dom/vitest'

// jsdom không có Web Animations API; preview dùng el.animate nên stub no-op.
if (!Element.prototype.animate) Element.prototype.animate = (() => ({ cancel() {}, finish() {} })) as never
