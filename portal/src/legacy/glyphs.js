// Chép từ cổng cũ (index.html). Chỉ đổi phụ thuộc: $('bg') -> tham số canvas, Player.current -> opts.isPlaying(),
// reduceMotion -> opts.reduceMotion, thêm stop().
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ isPlaying(): boolean, reduceMotion: boolean }} opts
 * @returns {{ recolor(): void, stop(): void }}
 */
export function startGlyphs(canvas, opts) {
  const Glyphs = {
    canvas,
    items: [],
    rgb: '241, 233, 218',
    CHARS: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '車', '馬', '炮', '將', '帥', '兵'],
    init() {
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      this.onResize = () => this.resize();
      addEventListener('resize', this.onResize);
      if (!opts.reduceMotion) this.raf = requestAnimationFrame((t) => this.frame(t));
    },
    /** Dọn: ngừng vòng vẽ và gỡ listener resize. */
    stop() {
      this.stopped = true;
      cancelAnimationFrame(this.raf);
      removeEventListener('resize', this.onResize);
    },
    recolor() {
      this.rgb = getComputedStyle(document.documentElement).getPropertyValue('--glyph').trim() || this.rgb;
      if (opts.reduceMotion) this.draw();
    },
    resize() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      this.w = innerWidth;
      this.h = innerHeight;
      this.canvas.width = this.w * dpr;
      this.canvas.height = this.h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Màn nhỏ / cảm ứng: ít chữ hơn để đỡ tốn pin và đỡ rối
      const coarse = matchMedia('(pointer: coarse)').matches || this.w < 560;
      const n = Math.round(Math.min(coarse ? 12 : 34, (this.w * this.h) / 38000));
      this.items = Array.from({ length: n }, () => ({
        ch: this.CHARS[Math.floor(Math.random() * this.CHARS.length)],
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        size: 14 + Math.random() * 30,
        vy: -(4 + Math.random() * 10),
        vx: (Math.random() - 0.5) * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.25,
        a: 0.035 + Math.random() * 0.05,
      }));
      this.draw();
    },
    draw() {
      const { ctx } = this;
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const g of this.items) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.rot);
        ctx.font = '700 ' + g.size + 'px "Be Vietnam Pro", KaiTi, serif';
        ctx.fillStyle = 'rgba(' + this.rgb + ',' + g.a + ')';
        ctx.fillText(g.ch, 0, 0);
        ctx.restore();
      }
    },
    frame(t) {
      // Chữ trôi rất chậm nên vẽ ~30 khung/giây là đủ, đỡ nửa công cho máy
      if (this.last && t - this.last < 32) { (this.raf = requestAnimationFrame((t2) => this.frame(t2))); return; }
      const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
      this.last = t;
      if (!document.hidden && !opts.isPlaying()) {
        for (const g of this.items) {
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          g.rot += g.vr * dt;
          if (g.y < -40) { g.y = this.h + 40; g.x = Math.random() * this.w; }
          if (g.x < -40) g.x = this.w + 40;
          if (g.x > this.w + 40) g.x = -40;
        }
        this.draw();
      }
      (this.raf = requestAnimationFrame((t2) => this.frame(t2)));
    },
  };
  Glyphs.init();
  return { recolor: () => Glyphs.recolor(), stop: () => Glyphs.stop() };
}
