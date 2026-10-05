import { Scanner } from './scanner.js';
import { rgbToHex, hexToRgb, labToRgb, rgbToLab } from './color.js';

function lighten(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
  const out = labToRgb(Math.min(96, lab.L + amount), lab.a * 0.82, lab.b * 0.82);
  return rgbToHex(out.r, out.g, out.b);
}

export class SwatchBoard {
  constructor(options) {
    this.paint = options.paint;
    this.stage = options.stage;
    this.onSkin = options.onSkin || (() => {});
    this.onChange = options.onChange || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.ctx = this.paint.getContext('2d');
    this.scanner = new Scanner({
      video: options.video,
      frame: options.frame,
      plate: options.plate,
      stage: options.stage,
      readout: options.readout,
      onMode: mode => this.handleMode(mode),
      onStatus: options.onStatus
    });
    this.strokes = [];
    this.active = null;
    this.mode = 'paint';
    this.size = 0.075;
    this.intensity = 0.85;
    this.skinPoint = null;
    this.drawing = false;
    this.current = null;
    this.bindPointer();
  }

  handleMode(mode) {
    if (mode === 'review') {
      this.paint.width = this.scanner.frame.width;
      this.paint.height = this.scanner.frame.height;
      this.strokes = [];
      this.skinPoint = null;
      this.redraw();
      this.onChange();
    }
  }

  bindPointer() {
    const pos = ev => {
      const box = this.paint.getBoundingClientRect();
      return { x: (ev.clientX - box.left) / box.width, y: (ev.clientY - box.top) / box.height };
    };
    this.paint.addEventListener('pointerdown', ev => {
      if (this.scanner.mode !== 'review') return;
      const point = pos(ev);
      if (this.mode === 'skin') {
        this.pickSkin(point);
        return;
      }
      if (!this.active) {
        this.onStatus('failed', 'Pick a shade to test before painting.');
        return;
      }
      this.paint.setPointerCapture(ev.pointerId);
      this.drawing = true;
      this.current = {
        id: this.active.id,
        hex: this.active.hex,
        finish: this.active.finish,
        name: this.active.shade,
        size: this.size,
        intensity: this.intensity,
        points: [point]
      };
      this.strokes.push(this.current);
      this.redraw();
    });
    this.paint.addEventListener('pointermove', ev => {
      if (!this.drawing || !this.current) return;
      this.current.points.push(pos(ev));
      this.redraw();
    });
    const stop = () => {
      if (!this.drawing) return;
      this.drawing = false;
      this.current = null;
      this.onChange();
    };
    this.paint.addEventListener('pointerup', stop);
    this.paint.addEventListener('pointercancel', stop);
    this.paint.addEventListener('pointerleave', stop);
  }

  pickSkin(point) {
    const sample = this.scanner.sampleAt(point.x, point.y);
    if (!sample) {
      this.onStatus('failed', 'Could not read that point. Try an even patch of skin.');
      return;
    }
    this.skinPoint = { x: point.x, y: point.y, hex: sample.reading.hex };
    this.redraw();
    this.onSkin(sample.reading.hex);
  }

  setActive(product) {
    this.active = product;
  }

  setMode(mode) {
    this.mode = mode;
    this.paint.style.cursor = mode === 'skin' ? 'crosshair' : 'cell';
  }

  setSize(value) {
    this.size = value;
  }

  setIntensity(value) {
    this.intensity = value;
  }

  undo() {
    this.strokes.pop();
    this.redraw();
    this.onChange();
  }

  clear() {
    this.strokes = [];
    this.redraw();
    this.onChange();
  }

  usedProducts() {
    const seen = new Map();
    this.strokes.forEach(s => seen.set(s.id, s));
    return [...seen.values()];
  }

  drawStroke(stroke) {
    const w = this.paint.width, h = this.paint.height;
    const base = Math.min(w, h);
    const width = Math.max(6, stroke.size * base);
    const ctx = this.ctx;
    const points = stroke.points;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.filter = 'blur(' + Math.max(1.5, width * 0.09).toFixed(1) + 'px)';
    ctx.globalAlpha = stroke.intensity;
    ctx.strokeStyle = stroke.hex;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (points.length === 1) {
      ctx.moveTo(points[0].x * w, points[0].y * h);
      ctx.lineTo(points[0].x * w + 0.01, points[0].y * h);
    } else {
      ctx.moveTo(points[0].x * w, points[0].y * h);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x * w, points[i].y * h);
    }
    ctx.stroke();

    if (stroke.finish === 'Glossy' || stroke.finish === 'Shimmer') {
      ctx.globalAlpha = stroke.intensity * 0.75;
      ctx.strokeStyle = lighten(stroke.hex, stroke.finish === 'Shimmer' ? 26 : 18);
      ctx.lineWidth = width * 0.3;
      ctx.stroke();
    }
    ctx.restore();
  }

  redraw() {
    const w = this.paint.width, h = this.paint.height;
    if (!w || !h) return;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, w, h);
    this.strokes.forEach(s => this.drawStroke(s));
    if (this.skinPoint) {
      const r = Math.max(8, Math.min(w, h) * 0.018);
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.beginPath();
      this.ctx.arc(this.skinPoint.x * w, this.skinPoint.y * h, r * 1.6, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }
}
