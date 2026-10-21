// Khai báo kiểu cho hai module JS chép từ cổng cũ (allowJs, checkJs tắt).
declare module '*/legacy/previews.js' {
  export function mountPreviews(root: HTMLElement, opts: { isPlaying(): boolean; reduceMotion: boolean }): () => void
}
declare module '*/legacy/glyphs.js' {
  export function startGlyphs(
    canvas: HTMLCanvasElement,
    opts: { isPlaying(): boolean; reduceMotion: boolean },
  ): { recolor(): void; stop(): void }
}