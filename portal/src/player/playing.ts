/** Cổng đang ở chế độ chơi game (body.playing); preview và nền chữ tạm dừng khi đó. */
export const isPlaying = (): boolean => document.body.classList.contains('playing')
