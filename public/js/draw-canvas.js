// Drawing for "Draw the Word": the phone drawing pad and the big-screen
// renderer. Strokes are stored on a 0–1000 grid so they scale to any size:
//   { c: colorIndex, w: widthIndex, p: [x0, y0, x1, y1, ...] }

export const PALETTE = ['#1b1035', '#ef4444', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899', '#92400e', '#ffffff'];
export const WIDTHS = [6, 14, 34]; // on the 0–1000 grid

// The server keeps at most this many points per drawing; stop a little short.
const MAX_POINTS = 11500;
const pointsIn = (strokes) => strokes.reduce((n, s) => n + s.p.length / 2, 0);

function strokePath(ctx, stroke, scale, upTo = stroke.p.length / 2) {
  const p = stroke.p;
  ctx.strokeStyle = PALETTE[stroke.c] ?? PALETTE[0];
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = WIDTHS[stroke.w] * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (upTo <= 1) {
    ctx.beginPath();
    ctx.arc(p[0] * scale, p[1] * scale, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0] * scale, p[1] * scale);
  for (let i = 1; i < upTo; i++) {
    // Smooth with midpoints between samples.
    const x = p[i * 2] * scale;
    const y = p[i * 2 + 1] * scale;
    if (i < upTo - 1) {
      const nx = p[i * 2 + 2] * scale;
      const ny = p[i * 2 + 3] * scale;
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

// Size a canvas to its box at device resolution and return the 0–1000 scale.
function fit(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = Math.max(1, Math.round(rect.width * dpr));
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  return size / 1000;
}

export function renderStrokes(canvas, strokes) {
  const scale = fit(canvas);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const s of strokes) strokePath(ctx, s, scale);
}

// Replay a drawing stroke by stroke over `duration` ms.
export function animateStrokes(canvas, strokes, duration = 3500) {
  const total = strokes.reduce((n, s) => n + s.p.length / 2, 0);
  if (!total) return renderStrokes(canvas, strokes);
  const start = performance.now();
  let raf = 0;
  const frame = (now) => {
    if (!canvas.isConnected) return;
    const scale = fit(canvas);
    const ctx = canvas.getContext('2d');
    const shown = Math.min(total, ((now - start) / duration) * total);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let left = shown;
    for (const s of strokes) {
      const n = s.p.length / 2;
      if (left <= 0) break;
      strokePath(ctx, s, scale, Math.min(n, Math.ceil(left)));
      left -= n;
    }
    if (shown < total) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// The finger-drawing pad on the phone.
export class DrawingPad {
  constructor(canvas, { onStroke, onFull, initial = [] }) {
    this.canvas = canvas;
    this.onStroke = onStroke;
    this.onFull = onFull;
    this.strokes = initial.slice();
    this.color = 0;
    this.width = 1;
    this.current = null;
    this.redraw();
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    this.onResize = () => this.redraw();
    window.addEventListener('resize', this.onResize);
  }

  point(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);
    return [Math.max(0, Math.min(1000, x)), Math.max(0, Math.min(1000, y))];
  }

  down(e) {
    e.preventDefault();
    if (pointsIn(this.strokes) >= MAX_POINTS) return this.onFull?.();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.current = { c: this.color, w: this.width, p: this.point(e) };
    this.redraw();
  }

  move(e) {
    if (!this.current) return;
    e.preventDefault();
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events) {
      const [x, y] = this.point(ev);
      const p = this.current.p;
      const dx = x - p[p.length - 2];
      const dy = y - p[p.length - 1];
      if (dx * dx + dy * dy < 9) continue; // skip tiny wiggles
      if (pointsIn(this.strokes) + p.length / 2 >= MAX_POINTS) break;
      if (p.length >= 3998) {
        // Very long stroke: finish it and keep drawing in a new one.
        this.finish();
        this.current = { c: this.color, w: this.width, p: [p[p.length - 2], p[p.length - 1], x, y] };
        continue;
      }
      p.push(x, y);
    }
    this.redraw();
  }

  up() {
    if (!this.current) return;
    this.finish();
    this.current = null;
  }

  finish() {
    const stroke = this.current;
    this.strokes.push(stroke);
    this.onStroke?.(stroke);
    this.redraw();
  }

  undo() {
    this.strokes.pop();
    this.redraw();
  }

  clear() {
    this.strokes = [];
    this.redraw();
  }

  redraw() {
    renderStrokes(this.canvas, this.current ? [...this.strokes, this.current] : this.strokes);
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
  }
}
