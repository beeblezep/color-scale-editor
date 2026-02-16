import React, { useState, useRef, useEffect } from 'react';

export default function ColorScaleEditor() {
  const canvasRef = useRef(null);
  const [cp1, setCp1] = useState({ x: 0.33, y: 0.00 });
  const [cp2, setCp2] = useState({ x: 0.75, y: 0.75 });
  const [dragging, setDragging] = useState(null);
  const [colorScales, setColorScales] = useState([]);
  const [nextColorId, setNextColorId] = useState(0);
  const [lightSurface, setLightSurface] = useState(false);
  const [comparisonLightSurface, setComparisonLightSurface] = useState(false);
  const [miniCanvasDragging, setMiniCanvasDragging] = useState({ id: null, point: null });
  const miniCanvasRefs = useRef({});

  const steps = 12;

  // Cubic bezier function
  const cubicBezier = (t, p0, p1, p2, p3) => {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  };

  // Solve for t given x
  const solveBezierX = (x, cp1x, cp2x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const currentX = cubicBezier(t, 0, cp1x, cp2x, 1);
      const derivative = 3 * (1 - t) * (1 - t) * cp1x +
                        6 * (1 - t) * t * (cp2x - cp1x) +
                        3 * t * t * (1 - cp2x);
      if (Math.abs(derivative) < 1e-6) break;
      t = t - (currentX - x) / derivative;
    }
    return t;
  };

  // Get bezier Y value for given X
  const getBezierY = (x) => {
    const t = solveBezierX(x, cp1.x, cp2.x);
    return cubicBezier(t, 0, cp1.y, cp2.y, 1);
  };

  // Convert L* to RGB
  const lstarToRgb = (lstar) => {
    let y;
    if (lstar <= 8) {
      y = lstar / 903.3;
    } else {
      y = Math.pow((lstar + 16) / 116, 3);
    }

    let rgb;
    if (y <= 0.0031308) {
      rgb = 12.92 * y;
    } else {
      rgb = 1.055 * Math.pow(y, 1/2.4) - 0.055;
    }

    rgb = Math.max(0, Math.min(1, rgb));
    const value = Math.round(rgb * 255);
    return { r: value, g: value, b: value };
  };

  // RGB to hex
  const rgbToHex = (r, g, b) => {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  };

  // Hex to RGB
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  // RGB to HSL
  const rgbToHsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
      return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h;
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6;
    } else {
      h = ((r - g) / d + 4) / 6;
    }

    return { h: h * 360, s, l };
  };

  // HSL to RGB
  const hslToRgb = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;

    let r, g, b;
    if (h < 60) {
      [r, g, b] = [c, x, 0];
    } else if (h < 120) {
      [r, g, b] = [x, c, 0];
    } else if (h < 180) {
      [r, g, b] = [0, c, x];
    } else if (h < 240) {
      [r, g, b] = [0, x, c];
    } else if (h < 300) {
      [r, g, b] = [x, 0, c];
    } else {
      [r, g, b] = [c, 0, x];
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  };

  // Get color at specific lightness
  const getColorAtLightness = (baseHex, targetLstar) => {
    const baseRgb = hexToRgb(baseHex);
    const baseHsl = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);

    const targetL = targetLstar / 100;

    let saturation = baseHsl.s;
    if (targetL < 0.2) {
      saturation *= (targetL / 0.2) * 0.8;
    } else if (targetL > 0.9) {
      saturation *= ((1 - targetL) / 0.1) * 0.6;
    }

    const rgb = hslToRgb(baseHsl.h, saturation, targetL);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  };

  // Generate gray scale
  const generateGrayScale = () => {
    const values = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const easedT = getBezierY(t);
      const lstar = 100 - easedT * 100; // Range from L* 100 (white) to L* 0 (black)
      const rgb = lstarToRgb(lstar);
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      const step = (i + 1) * 100;
      values.push({ step, hex, lstar: lstar.toFixed(1) });
    }
    return values;
  };

  // Generate color scale
  const generateColorScale = (baseHex, customCp1, customCp2) => {
    const values = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      // Use custom bezier points if provided, otherwise use global
      const easedT = customCp1 && customCp2
        ? getBezierYWithPoints(t, customCp1, customCp2)
        : getBezierY(t);
      const lstar = 100 - easedT * 100; // Range from L* 100 (light) to L* 0 (dark)
      const hex = getColorAtLightness(baseHex, lstar);
      const step = (i + 1) * 100;
      values.push({ step, hex, lstar: lstar.toFixed(1) });
    }
    return values;
  };

  // Get bezier Y value with custom control points
  const getBezierYWithPoints = (x, customCp1, customCp2) => {
    const t = solveBezierX(x, customCp1.x, customCp2.x);
    return cubicBezier(t, 0, customCp1.y, customCp2.y, 1);
  };

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const padding = 60;
    const graphWidth = rect.width - padding * 2;
    const graphHeight = rect.height - padding * 2;

    const toCanvasCoords = (x, y) => ({
      x: padding + x * graphWidth,
      y: rect.height - padding - y * graphHeight
    });

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Grid
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = padding + (i / 10) * graphWidth;
      const y = rect.height - padding - (i / 10) * graphHeight;

      ctx.beginPath();
      ctx.moveTo(x, rect.height - padding);
      ctx.lineTo(x, padding);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + graphWidth, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, rect.height - padding);
    ctx.lineTo(padding + graphWidth, rect.height - padding);
    ctx.lineTo(padding + graphWidth, padding);
    ctx.stroke();

    // Linear reference
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, rect.height - padding);
    ctx.lineTo(padding + graphWidth, padding);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bezier curve
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const x = cubicBezier(t, 0, cp1.x, cp2.x, 1);
      const y = cubicBezier(t, 0, cp1.y, cp2.y, 1);
      const coords = toCanvasCoords(x, y);
      if (i === 0) {
        ctx.moveTo(coords.x, coords.y);
      } else {
        ctx.lineTo(coords.x, coords.y);
      }
    }
    ctx.stroke();

    // Control points
    const p0 = toCanvasCoords(0, 0);
    const p1 = toCanvasCoords(cp1.x, cp1.y);
    const p2 = toCanvasCoords(cp2.x, cp2.y);
    const p3 = toCanvasCoords(1, 1);

    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#999';
    ctx.font = '12px sans-serif';
    ctx.fillText('Input (0-1)', rect.width / 2 - 30, rect.height - 20);
    ctx.save();
    ctx.translate(20, rect.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Output (0-1)', -40, 0);
    ctx.restore();

    ctx.fillStyle = '#3b82f6';
    ctx.font = '14px monospace';
    ctx.fillText(`P1 (${cp1.x.toFixed(2)}, ${cp1.y.toFixed(2)})`, p1.x + 15, p1.y - 10);
    ctx.fillText(`P2 (${cp2.x.toFixed(2)}, ${cp2.y.toFixed(2)})`, p2.x + 15, p2.y - 10);
  }, [cp1, cp2]);

  // Canvas mouse handlers
  const handleCanvasMouseDown = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const padding = 60;
    const graphWidth = rect.width - padding * 2;
    const graphHeight = rect.height - padding * 2;

    const toCanvasCoords = (x, y) => ({
      x: padding + x * graphWidth,
      y: rect.height - padding - y * graphHeight
    });

    const p1Coords = toCanvasCoords(cp1.x, cp1.y);
    const p2Coords = toCanvasCoords(cp2.x, cp2.y);

    const dist1 = Math.hypot(mouseX - p1Coords.x, mouseY - p1Coords.y);
    const dist2 = Math.hypot(mouseX - p2Coords.x, mouseY - p2Coords.y);

    if (dist1 < 15) {
      setDragging('cp1');
    } else if (dist2 < 15) {
      setDragging('cp2');
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (!dragging) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const padding = 60;
    const graphWidth = rect.width - padding * 2;
    const graphHeight = rect.height - padding * 2;

    const x = Math.max(0, Math.min(1, (mouseX - padding) / graphWidth));
    const y = Math.max(0, Math.min(1, (rect.height - padding - mouseY) / graphHeight));

    if (dragging === 'cp1') {
      setCp1({ x, y });
    } else if (dragging === 'cp2') {
      setCp2({ x, y });
    }
  };

  const handleCanvasMouseUp = () => {
    setDragging(null);
  };

  const addColorScale = () => {
    const newScale = {
      id: nextColorId,
      hex: '#3b82f6',
      lightSurface: false,
      useCustomBezier: false,
      lockKeyColor: false,
      cp1: { x: 0.33, y: 0.00 },
      cp2: { x: 0.75, y: 0.75 }
    };
    setColorScales([...colorScales, newScale]);
    setNextColorId(nextColorId + 1);
  };

  const removeColorScale = (id) => {
    setColorScales(colorScales.filter(cs => cs.id !== id));
  };

  const updateColorScaleHex = (id, hex) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, hex } : cs
    ));
  };

  const toggleColorScaleSurface = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, lightSurface: !cs.lightSurface } : cs
    ));
  };

  const toggleCustomBezier = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, useCustomBezier: !cs.useCustomBezier } : cs
    ));
  };

  const toggleLockKeyColor = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, lockKeyColor: !cs.lockKeyColor } : cs
    ));
  };

  const updateColorScaleBezier = (id, point, axis, value) => {
    setColorScales(colorScales.map(cs => {
      if (cs.id === id) {
        return {
          ...cs,
          [point]: { ...cs[point], [axis]: parseFloat(value) }
        };
      }
      return cs;
    }));
  };

  const updateColorScaleBezierPoint = (id, point, x, y) => {
    setColorScales(colorScales.map(cs => {
      if (cs.id === id) {
        return {
          ...cs,
          [point]: { x, y }
        };
      }
      return cs;
    }));
  };

  // Find the closest swatch to the key color
  const findKeyColorIndex = (scale, keyHex) => {
    const keyRgb = hexToRgb(keyHex);
    const keyHsl = rgbToHsl(keyRgb.r, keyRgb.g, keyRgb.b);

    let closestIndex = 0;
    let minDiff = Infinity;

    scale.forEach((swatch, i) => {
      const swatchRgb = hexToRgb(swatch.hex);
      const swatchHsl = rgbToHsl(swatchRgb.r, swatchRgb.g, swatchRgb.b);
      const diff = Math.abs(swatchHsl.l - keyHsl.l);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    });

    return closestIndex;
  };

  // Draw mini canvas for a color scale
  const drawMiniCanvas = (canvasId, cp1, cp2) => {
    const canvas = miniCanvasRefs.current[canvasId];
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = 200;
    const height = 200;
    const padding = 30;

    ctx.clearRect(0, 0, width, height);

    const toCanvasCoords = (x, y) => ({
      x: padding + x * (width - 2 * padding),
      y: height - padding - y * (height - 2 * padding)
    });

    // Grid
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = padding + (i / 4) * (width - 2 * padding);
      const y = height - padding - (i / 4) * (height - 2 * padding);

      ctx.beginPath();
      ctx.moveTo(x, height - padding);
      ctx.lineTo(x, padding);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Bezier curve
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      const x = cubicBezier(t, 0, cp1.x, cp2.x, 1);
      const y = cubicBezier(t, 0, cp1.y, cp2.y, 1);
      const coords = toCanvasCoords(x, y);
      if (i === 0) {
        ctx.moveTo(coords.x, coords.y);
      } else {
        ctx.lineTo(coords.x, coords.y);
      }
    }
    ctx.stroke();

    // Control points
    const p0 = toCanvasCoords(0, 0);
    const p1 = toCanvasCoords(cp1.x, cp1.y);
    const p2 = toCanvasCoords(cp2.x, cp2.y);
    const p3 = toCanvasCoords(1, 1);

    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#3b82f6';
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;

    [p1, p2].forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Start/end points
    ctx.fillStyle = '#666';
    [p0, p3].forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  // Handle mini canvas mouse events
  const handleMiniCanvasMouseDown = (e, scaleId, cp1, cp2) => {
    const canvas = miniCanvasRefs.current[scaleId];
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const width = 200;
    const height = 200;
    const padding = 30;

    const p1Canvas = {
      x: padding + cp1.x * (width - 2 * padding),
      y: height - padding - cp1.y * (height - 2 * padding)
    };
    const p2Canvas = {
      x: padding + cp2.x * (width - 2 * padding),
      y: height - padding - cp2.y * (height - 2 * padding)
    };

    const dist1 = Math.hypot(mouseX - p1Canvas.x, mouseY - p1Canvas.y);
    const dist2 = Math.hypot(mouseX - p2Canvas.x, mouseY - p2Canvas.y);

    if (dist1 < 12) {
      setMiniCanvasDragging({ id: scaleId, point: 'cp1' });
    } else if (dist2 < 12) {
      setMiniCanvasDragging({ id: scaleId, point: 'cp2' });
    }
  };

  const handleMiniCanvasMouseMove = (e, scaleId) => {
    if (miniCanvasDragging.id !== scaleId || !miniCanvasDragging.point) return;

    const canvas = miniCanvasRefs.current[scaleId];
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const width = 200;
    const height = 200;
    const padding = 30;

    const x = Math.max(0, Math.min(1, (mouseX - padding) / (width - 2 * padding)));
    const y = Math.max(0, Math.min(1, 1 - ((mouseY - padding) / (height - 2 * padding))));

    updateColorScaleBezierPoint(scaleId, miniCanvasDragging.point, x, y);
  };

  const handleMiniCanvasMouseUp = () => {
    setMiniCanvasDragging({ id: null, point: null });
  };

  // Draw mini canvases when color scales change
  useEffect(() => {
    colorScales.forEach(cs => {
      if (cs.useCustomBezier) {
        drawMiniCanvas(cs.id, cs.cp1, cs.cp2);
      }
    });
  }, [colorScales]);

  const grayScale = generateGrayScale();

  return (
    <div className="min-h-screen bg-black text-gray-200 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold text-white mb-2">Color Scale Editor</h1>
        <p className="text-gray-500 mb-8">Interactive bezier curve editor for perceptually uniform color scales</p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Bezier Control Points
          </label>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="flex gap-2 items-center">
                <span className="text-sm">P1:</span>
                <input
                  type="number"
                  value={cp1.x}
                  onChange={(e) => setCp1({ ...cp1, x: parseFloat(e.target.value) })}
                  min="0"
                  max="1"
                  step="0.01"
                  className="w-20 px-3 py-2 bg-black border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-zinc-600"
                />
                <input
                  type="number"
                  value={cp1.y}
                  onChange={(e) => setCp1({ ...cp1, y: parseFloat(e.target.value) })}
                  min="0"
                  max="1"
                  step="0.01"
                  className="w-20 px-3 py-2 bg-black border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex gap-2 items-center">
                <span className="text-sm">P2:</span>
                <input
                  type="number"
                  value={cp2.x}
                  onChange={(e) => setCp2({ ...cp2, x: parseFloat(e.target.value) })}
                  min="0"
                  max="1"
                  step="0.01"
                  className="w-20 px-3 py-2 bg-black border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-zinc-600"
                />
                <input
                  type="number"
                  value={cp2.y}
                  onChange={(e) => setCp2({ ...cp2, y: parseFloat(e.target.value) })}
                  min="0"
                  max="1"
                  step="0.01"
                  className="w-20 px-3 py-2 bg-black border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <canvas
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            className="w-full h-96 rounded-lg cursor-crosshair"
            style={{ width: '100%', height: '400px' }}
          />
        </div>

        <div className="flex gap-6 mb-6">
          <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">Gray Scale</h2>
              <button
                onClick={() => setLightSurface(!lightSurface)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  lightSurface
                    ? 'bg-white text-black hover:bg-gray-200'
                    : 'bg-zinc-800 text-gray-200 hover:bg-zinc-700'
                }`}
              >
                {lightSurface ? 'Light Surface' : 'Dark Surface'}
              </button>
            </div>
            <div
              className="flex gap-0.5 h-16 rounded-lg overflow-hidden mb-4 p-4"
              style={{ background: lightSurface ? '#ffffff' : '#000000' }}
            >
              {grayScale.map((v, i) => (
                <div key={i} className="flex-1" style={{ background: v.hex }} />
              ))}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {grayScale.map((v, i) => (
                <div key={i} className="bg-black border border-zinc-800 rounded-md p-2 text-center">
                  <div className="text-xs text-gray-600 mb-1">{v.step}</div>
                  <div className="text-xs font-mono text-gray-200 mb-0.5">{v.hex}</div>
                  <div className="text-[10px] text-gray-500">L* {v.lstar}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {colorScales.map((cs) => {
          const scale = generateColorScale(
            cs.hex,
            cs.useCustomBezier ? cs.cp1 : null,
            cs.useCustomBezier ? cs.cp2 : null
          );
          const keyColorIndex = findKeyColorIndex(scale, cs.hex);

          // If key color is locked, replace the closest swatch with exact hex
          if (cs.lockKeyColor && keyColorIndex >= 0) {
            scale[keyColorIndex] = {
              ...scale[keyColorIndex],
              hex: cs.hex
            };
          }

          return (
            <div key={cs.id} className="flex gap-6 mb-6">
              <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-white">Color Scale</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleColorScaleSurface(cs.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        cs.lightSurface
                          ? 'bg-white text-black hover:bg-gray-200'
                          : 'bg-zinc-800 text-gray-200 hover:bg-zinc-700'
                      }`}
                    >
                      {cs.lightSurface ? 'Light Surface' : 'Dark Surface'}
                    </button>
                    <button
                      onClick={() => removeColorScale(cs.id)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-md text-xs font-medium text-white transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Key Color
                  </label>
                  <input
                    type="color"
                    value={cs.hex}
                    onChange={(e) => updateColorScaleHex(cs.id, e.target.value)}
                    className="w-16 h-10 border border-zinc-700 rounded-md bg-black cursor-pointer"
                  />
                </div>
                <div className="mb-4 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cs.useCustomBezier}
                      onChange={() => toggleCustomBezier(cs.id)}
                      className="w-4 h-4 rounded border-zinc-700 bg-black text-blue-600 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-gray-400">Use Custom Bezier Curve</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cs.lockKeyColor}
                      onChange={() => toggleLockKeyColor(cs.id)}
                      className="w-4 h-4 rounded border-zinc-700 bg-black text-blue-600 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-gray-400">Lock Key Color Hex</span>
                    {cs.lockKeyColor && (
                      <span className="text-xs text-blue-400">🔒 {cs.hex}</span>
                    )}
                  </label>
                </div>
                {cs.useCustomBezier && (
                  <div className="mb-4 bg-black border border-zinc-800 rounded-lg p-3">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0">
                        <canvas
                          ref={el => miniCanvasRefs.current[cs.id] = el}
                          width="200"
                          height="200"
                          onMouseDown={(e) => handleMiniCanvasMouseDown(e, cs.id, cs.cp1, cs.cp2)}
                          onMouseMove={(e) => handleMiniCanvasMouseMove(e, cs.id)}
                          onMouseUp={handleMiniCanvasMouseUp}
                          onMouseLeave={handleMiniCanvasMouseUp}
                          className="rounded cursor-crosshair bg-zinc-900"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">P1</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={cs.cp1.x}
                                onChange={(e) => updateColorScaleBezier(cs.id, 'cp1', 'x', e.target.value)}
                                min="0"
                                max="1"
                                step="0.01"
                                className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono focus:outline-none focus:border-zinc-600"
                              />
                              <input
                                type="number"
                                value={cs.cp1.y}
                                onChange={(e) => updateColorScaleBezier(cs.id, 'cp1', 'y', e.target.value)}
                                min="0"
                                max="1"
                                step="0.01"
                                className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono focus:outline-none focus:border-zinc-600"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">P2</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={cs.cp2.x}
                                onChange={(e) => updateColorScaleBezier(cs.id, 'cp2', 'x', e.target.value)}
                                min="0"
                                max="1"
                                step="0.01"
                                className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono focus:outline-none focus:border-zinc-600"
                              />
                              <input
                                type="number"
                                value={cs.cp2.y}
                                onChange={(e) => updateColorScaleBezier(cs.id, 'cp2', 'y', e.target.value)}
                                min="0"
                                max="1"
                                step="0.01"
                                className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono focus:outline-none focus:border-zinc-600"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div
                  className="flex gap-0.5 h-16 rounded-lg overflow-hidden mb-4 p-4"
                  style={{ background: cs.lightSurface ? '#ffffff' : '#000000' }}
                >
                  {scale.map((v, i) => (
                    <div key={i} className="flex-1" style={{ background: v.hex }} />
                  ))}
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {scale.map((v, i) => (
                    <div
                      key={i}
                      className={`bg-black rounded-md p-2 text-center relative ${
                        i === keyColorIndex
                          ? 'border-2 border-blue-500 shadow-lg shadow-blue-500/50'
                          : 'border border-zinc-800'
                      }`}
                    >
                      {i === keyColorIndex && (
                        <div className="absolute -top-2 -right-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-white rounded-full" />
                        </div>
                      )}
                      <div className="text-xs text-gray-600 mb-1">{v.step}</div>
                      <div className="text-xs font-mono text-gray-200 mb-0.5">{v.hex}</div>
                      <div className="text-[10px] text-gray-500">L* {v.lstar}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {colorScales.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">All Scales Comparison</h2>
              <button
                onClick={() => setComparisonLightSurface(!comparisonLightSurface)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  comparisonLightSurface
                    ? 'bg-white text-black hover:bg-gray-200'
                    : 'bg-zinc-800 text-gray-200 hover:bg-zinc-700'
                }`}
              >
                {comparisonLightSurface ? 'Light Surface' : 'Dark Surface'}
              </button>
            </div>
            <div
              className="rounded-lg p-4"
              style={{ background: comparisonLightSurface ? '#ffffff' : '#000000' }}
            >
              <div className="space-y-2">
                {/* Gray Scale */}
                <div className="flex items-center gap-2">
                  <div className="w-24 flex-shrink-0">
                    <span className={`text-xs font-medium ${comparisonLightSurface ? 'text-gray-800' : 'text-gray-300'}`}>
                      Gray
                    </span>
                  </div>
                  <div className="flex gap-0.5 flex-1 h-8 rounded overflow-hidden">
                    {grayScale.map((v, i) => (
                      <div key={i} className="flex-1" style={{ background: v.hex }} />
                    ))}
                  </div>
                </div>
                {/* Color Scales */}
                {colorScales.map((cs) => {
                  const scale = generateColorScale(
                    cs.hex,
                    cs.useCustomBezier ? cs.cp1 : null,
                    cs.useCustomBezier ? cs.cp2 : null
                  );

                  // If key color is locked, replace the closest swatch with exact hex
                  if (cs.lockKeyColor) {
                    const keyColorIndex = findKeyColorIndex(scale, cs.hex);
                    if (keyColorIndex >= 0) {
                      scale[keyColorIndex] = {
                        ...scale[keyColorIndex],
                        hex: cs.hex
                      };
                    }
                  }

                  return (
                    <div key={cs.id} className="flex items-center gap-2">
                      <div className="w-24 flex-shrink-0 flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded border border-gray-600"
                          style={{ background: cs.hex }}
                        />
                        <span className={`text-xs font-medium ${comparisonLightSurface ? 'text-gray-800' : 'text-gray-300'}`}>
                          {cs.hex}
                        </span>
                      </div>
                      <div className="flex gap-0.5 flex-1 h-8 rounded overflow-hidden">
                        {scale.map((v, i) => (
                          <div key={i} className="flex-1" style={{ background: v.hex }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={addColorScale}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
        >
          + Add Color Scale
        </button>
      </div>
    </div>
  );
}
