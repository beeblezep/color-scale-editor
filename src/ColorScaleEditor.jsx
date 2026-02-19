import React, { useState, useRef, useEffect } from 'react';

export default function ColorScaleEditor() {
  const canvasRef = useRef(null);
  const [cp1, setCp1] = useState({ x: 0.33, y: 0.00 });
  const [cp2, setCp2] = useState({ x: 0.50, y: 0.60 });
  const [dragging, setDragging] = useState(null);
  const [globalLstarMin, setGlobalLstarMin] = useState(10);
  const [globalLstarMax, setGlobalLstarMax] = useState(98);
  const [colorScales, setColorScales] = useState([]);
  const [nextColorId, setNextColorId] = useState(0);
  const [lightSurface, setLightSurface] = useState(false);
  const [comparisonLightSurface, setComparisonLightSurface] = useState(false);
  const [miniCanvasDragging, setMiniCanvasDragging] = useState({ id: null, point: null });
  const [editingSwatch, setEditingSwatch] = useState({ scaleId: null, step: null });
  const [hoveredSwatch, setHoveredSwatch] = useState({ scaleId: null, index: null });
  const [grayScaleName, setGrayScaleName] = useState('gray');
  const [numSwatches, setNumSwatches] = useState(12); // Number of visible swatches (excluding white and black)
  const [harmonizingScale, setHarmonizingScale] = useState(null);
  const [previewColorsByFamily, setPreviewColorsByFamily] = useState(null); // Store preview colors grouped by family
  const [selectedPreviews, setSelectedPreviews] = useState(new Set()); // Set of selected previews like "purple-0", "yellow-2"
  const [isGenerating, setIsGenerating] = useState(false); // Loading state for API calls
  const [baseColorScaleId, setBaseColorScaleId] = useState(null); // Which color scale to use as base for harmonious colors
  const [desaturatedScales, setDesaturatedScales] = useState(new Set()); // Set of scale IDs that are in desaturate/luminance mode
  const [isGrayScaleDesaturated, setIsGrayScaleDesaturated] = useState(false); // Whether the gray scale is in desaturate/luminance mode
  const [isComparisonDesaturated, setIsComparisonDesaturated] = useState(false); // Whether all scales in comparison section are in desaturate/luminance mode
  const [shareUrl, setShareUrl] = useState('');
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [useLightnessNumbering, setUseLightnessNumbering] = useState(false); // Toggle between sequential (100, 200...) and lightness-based (98, 90, 80...) numbering
  const [customIncrement, setCustomIncrement] = useState(10); // Custom increment for sequential numbering (e.g., 10 for 10, 20, 30...)
  const [useCustomIncrement, setUseCustomIncrement] = useState(false); // Whether to use custom increment instead of 100
  const miniCanvasRefs = useRef({});

  const steps = numSwatches + 2; // Pure white + swatches + pure black

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

  // Calculate L* (perceptual lightness) from RGB
  const rgbToLstar = (r, g, b) => {
    // Normalize RGB values to 0-1
    let rNorm = r / 255;
    let gNorm = g / 255;
    let bNorm = b / 255;

    // Convert to linear RGB
    const toLinear = (c) => {
      if (c <= 0.04045) {
        return c / 12.92;
      } else {
        return Math.pow((c + 0.055) / 1.055, 2.4);
      }
    };

    rNorm = toLinear(rNorm);
    gNorm = toLinear(gNorm);
    bNorm = toLinear(bNorm);

    // Convert to XYZ (using D65 illuminant)
    const x = rNorm * 0.4124564 + gNorm * 0.3575761 + bNorm * 0.1804375;
    const y = rNorm * 0.2126729 + gNorm * 0.7151522 + bNorm * 0.0721750;
    const z = rNorm * 0.0193339 + gNorm * 0.1191920 + bNorm * 0.9503041;

    // Normalize for D65 white point
    const yNorm = y / 1.0;

    // Convert to L*
    let lstar;
    if (yNorm <= 0.008856) {
      lstar = 903.3 * yNorm;
    } else {
      lstar = 116 * Math.pow(yNorm, 1/3) - 16;
    }

    return lstar;
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

  // Convert hex color to grayscale using actual perceptual L*
  const hexToGrayscale = (hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;

    // Calculate the actual L* from the RGB values
    const lstar = rgbToLstar(rgb.r, rgb.g, rgb.b);

    // Convert L* to grayscale RGB
    const grayRgb = lstarToRgb(lstar);
    return rgbToHex(grayRgb.r, grayRgb.g, grayRgb.b);
  };

  // Get color at specific lightness
  const getColorAtLightness = (baseHex, targetLstar, lstarMin = 0, lstarMax = 100, saturationMin = 100, saturationMax = 100, hueShiftDark = 0, hueShiftLight = 0) => {
    const baseRgb = hexToRgb(baseHex);
    const baseHsl = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);

    const targetL = targetLstar / 100;

    // Calculate position in scale (0 = light end, 1 = dark end)
    const position = (lstarMax - targetLstar) / (lstarMax - lstarMin);

    // Apply saturation scaling based on position
    // At light end (position 0): use saturationMax
    // At dark end (position 1): use saturationMin
    const saturationScale = (saturationMax - position * (saturationMax - saturationMin)) / 100;
    let saturation = baseHsl.s * saturationScale;

    // Apply hue shift based on position
    // Interpolate between hueShiftLight (at position 0) and hueShiftDark (at position 1)
    const hueShift = hueShiftLight + position * (hueShiftDark - hueShiftLight);
    let hue = (baseHsl.h + hueShift) % 360;
    if (hue < 0) hue += 360;

    const rgb = hslToRgb(hue, saturation, targetL);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  };

  // Generate gray scale
  const generateGrayScale = (lstarMin = 0, lstarMax = 100) => {
    const values = [];
    for (let i = 0; i < steps; i++) {
      let hex, lstar;

      if (i === 0) {
        // First swatch: lightest (using lstarMax)
        lstar = lstarMax;
        const rgb = lstarToRgb(lstar);
        hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      } else if (i === steps - 1) {
        // Last swatch: darkest (using lstarMin)
        lstar = lstarMin;
        const rgb = lstarToRgb(lstar);
        hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      } else {
        // Middle swatches: generated using bezier curve
        const t = i / (steps - 1);
        const easedT = getBezierY(t);
        lstar = lstarMax - easedT * (lstarMax - lstarMin);
        const rgb = lstarToRgb(lstar);
        hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      }

      const step = (i + 1) * 100;
      values.push({ step, hex, lstar: lstar.toFixed(1) });
    }
    return values;
  };

  // Calculate step numbers from L* values with smart rounding
  const calculateStepFromLstar = (lstarValues, useLightnessNumbering, lstarMin, lstarMax, increment = 100) => {
    if (!useLightnessNumbering) {
      return lstarValues.map((_, i) => (i + 1) * increment);
    }

    const count = lstarValues.length;
    const results = new Array(count);
    const usedNumbers = new Set();
    const lstarFloats = lstarValues.map(v => parseFloat(v));
    const assignedIndices = new Set();

    // SPECIAL CASE: For 15 or fewer swatches, use predefined clean numbers
    if (count <= 15) {
      // Prioritize decades, then edge fives (95, 15, 85, 25) before middle fives
      const numberSets = {
        1: [10],
        2: [20, 10],
        3: [30, 20, 10],
        4: [40, 30, 20, 10],
        5: [50, 40, 30, 20, 10],
        6: [60, 50, 40, 30, 20, 10],
        7: [70, 60, 50, 40, 30, 20, 10],
        8: [80, 70, 60, 50, 40, 30, 20, 10],
        9: [90, 80, 70, 60, 50, 40, 30, 20, 10],
        10: [98, 90, 80, 70, 60, 50, 40, 30, 20, 10],
        11: [98, 90, 80, 70, 60, 50, 40, 30, 20, 15, 10],
        12: [98, 95, 90, 80, 70, 60, 50, 40, 30, 20, 15, 10],
        13: [98, 95, 90, 85, 80, 70, 60, 50, 40, 30, 20, 15, 10],
        14: [98, 95, 90, 85, 80, 70, 60, 50, 40, 30, 25, 20, 15, 10],
        15: [98, 95, 90, 85, 80, 70, 60, 50, 40, 30, 25, 20, 15, 12, 10]
      };

      const numbers = numberSets[count] || [];
      for (let i = 0; i < count; i++) {
        results[i] = numbers[i];
      }

      return results;
    }

    // STEP 1: For 10+ swatches, anchor first and last to exact global limits
    results[0] = Math.round(lstarMax);
    results[count - 1] = Math.round(lstarMin);
    usedNumbers.add(results[0]);
    usedNumbers.add(results[count - 1]);
    assignedIndices.add(0);
    assignedIndices.add(count - 1);

    // STEP 2: Prioritize decade numbers (90, 80, 70, 60, 50, 40, 30, 20)
    const decadeNumbers = [90, 80, 70, 60, 50, 40, 30, 20];

    for (const decade of decadeNumbers) {
      if (usedNumbers.has(decade)) continue;

      let closestIndex = -1;
      let closestDistance = Infinity;

      for (let i = 1; i < count - 1; i++) {
        if (assignedIndices.has(i)) continue;
        const distance = Math.abs(lstarFloats[i] - decade);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = i;
        }
      }

      // Assign if reasonably close (within ±7 units)
      if (closestIndex !== -1 && closestDistance <= 7) {
        results[closestIndex] = decade;
        usedNumbers.add(decade);
        assignedIndices.add(closestIndex);
      }
    }

    // STEP 3: Assign fives to remaining swatches
    for (let i = 1; i < count - 1; i++) {
      if (assignedIndices.has(i)) continue;

      const nearest5 = Math.round(lstarFloats[i] / 5) * 5;
      if (!usedNumbers.has(nearest5)) {
        results[i] = nearest5;
        usedNumbers.add(nearest5);
        assignedIndices.add(i);
      }
    }

    // STEP 4: Assign integers to any remaining swatches
    for (let i = 1; i < count - 1; i++) {
      if (assignedIndices.has(i)) continue;

      let stepNumber = Math.round(lstarFloats[i]);
      let offset = 0;
      while (usedNumbers.has(stepNumber)) {
        offset++;
        if (offset % 2 === 1) {
          stepNumber = Math.round(lstarFloats[i]) + Math.ceil(offset / 2);
        } else {
          stepNumber = Math.round(lstarFloats[i]) - offset / 2;
        }
      }
      results[i] = stepNumber;
      usedNumbers.add(stepNumber);
    }

    return results;
  };

  // Generate color scale
  const generateColorScale = (baseHex, customCp1, customCp2, lstarMin = 0, lstarMax = 100, saturationMin = 100, saturationMax = 100, hueShiftDark = 0, hueShiftLight = 0) => {
    const values = [];
    for (let i = 0; i < steps; i++) {
      let hex, lstar;

      if (i === 0) {
        // First swatch: pure white
        hex = '#ffffff';
        lstar = 100;
      } else if (i === steps - 1) {
        // Last swatch: pure black
        hex = '#000000';
        lstar = 0;
      } else {
        // Middle 12 swatches: generated using bezier curve
        // Map to avoid pure white/black (use 1/13 to 12/13 range)
        const t = i / (steps - 1);
        // Use custom bezier points if provided, otherwise use global
        const easedT = customCp1 && customCp2
          ? getBezierYWithPoints(t, customCp1, customCp2)
          : getBezierY(t);
        lstar = lstarMax - easedT * (lstarMax - lstarMin); // Custom L* range
        hex = getColorAtLightness(baseHex, lstar, lstarMin, lstarMax, saturationMin, saturationMax, hueShiftDark, hueShiftLight);
      }

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

  const resetBezierPoints = () => {
    setCp1({ x: 0.33, y: 0.00 });
    setCp2({ x: 0.50, y: 0.60 });
  };

  const harmonizeWithColor = (targetScaleId, baseScaleId) => {
    const baseScale = colorScales.find(cs => cs.id === baseScaleId);
    const targetScale = colorScales.find(cs => cs.id === targetScaleId);

    if (!baseScale || !targetScale) {
      console.log('Base or target scale not found');
      return;
    }

    // Get HSL values for both colors
    const baseRgb = hexToRgb(baseScale.hex);
    const baseHsl = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);

    const targetRgb = hexToRgb(targetScale.hex);
    const targetHsl = rgbToHsl(targetRgb.r, targetRgb.g, targetRgb.b);

    console.log('Base color:', baseScale.hex, 'HSL:', baseHsl);
    console.log('Target color before:', targetScale.hex, 'HSL:', targetHsl);

    // Keep the target's hue but adjust saturation and lightness to harmonize
    // Preserve the hue exactly
    const harmonizedHue = targetHsl.h;

    // Match saturation and lightness more closely to base for better harmony
    // Use 80% base + 20% target for stronger harmonization
    const harmonizedSaturation = (baseHsl.s * 0.8) + (targetHsl.s * 0.2);
    const harmonizedLightness = (baseHsl.l * 0.8) + (targetHsl.l * 0.2);

    // Convert back to RGB and hex
    const harmonizedRgb = hslToRgb(harmonizedHue, harmonizedSaturation, harmonizedLightness);
    const harmonizedHex = rgbToHex(harmonizedRgb.r, harmonizedRgb.g, harmonizedRgb.b);

    console.log('Harmonized color:', harmonizedHex, 'HSL:', { h: harmonizedHue, s: harmonizedSaturation, l: harmonizedLightness });

    // Update the target scale's hex color
    updateColorScaleHex(targetScaleId, harmonizedHex);
    setHarmonizingScale(null);
  };

  const generateHarmoniousColors = async () => {
    // Get selected color families
    const checkboxes = document.querySelectorAll('.harmonious-color-checkbox:checked');
    const selectedFamilies = Array.from(checkboxes).map(cb => cb.value);

    if (selectedFamilies.length === 0) {
      alert('Please select at least one color family');
      return;
    }

    // Define hue ranges for each color family
    const colorFamilyHues = {
      red: 0,
      rose: 350,
      pink: 330,
      orange: 30,
      amber: 45,
      yellow: 60,
      lime: 90,
      green: 135,
      emerald: 150,
      teal: 165,
      cyan: 180,
      sky: 200,
      blue: 225,
      indigo: 240,
      violet: 280,
      purple: 270,
      'warm-gray': 40,
      'cool-gray': 220
    };

    // Start loading
    setIsGenerating(true);
    setPreviewColorsByFamily(null);
    setSelectedPreviews(new Set());

    // Generate 5 options for each selected family
    const colorsByFamily = {};

    // Use selected base color or default to first color scale
    const baseScale = baseColorScaleId
      ? colorScales.find(cs => cs.id === baseColorScaleId)
      : colorScales[0];

    for (const family of selectedFamilies) {
      const targetHue = colorFamilyHues[family];
      const familyOptions = [];

      for (let optionIndex = 0; optionIndex < 5; optionIndex++) {
        try {
          const input = baseScale
            ? [hexToRgb(baseScale.hex), "N", "N", "N", "N"].map(item =>
                typeof item === 'string' ? item : [item.r, item.g, item.b])
            : ["N", "N", "N", "N", "N"];

          const response = await fetch('http://colormind.io/api/', {
            method: 'POST',
            body: JSON.stringify({
              model: 'default',
              input: input
            })
          });

          const data = await response.json();

          if (data.result) {
            const palette = data.result;

            // Find the color in the palette that's closest to this hue family
            let closestColor = null;
            let minHueDiff = Infinity;

            palette.forEach(rgb => {
              const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
              const hueDiff = Math.min(
                Math.abs(hsl.h - targetHue),
                Math.abs(hsl.h - targetHue + 360),
                Math.abs(hsl.h - targetHue - 360)
              );

              if (hueDiff < minHueDiff) {
                minHueDiff = hueDiff;
                closestColor = rgb;
              }
            });

            // If no good match, generate a color with the target hue
            let finalRgb;
            const isGray = family === 'warm-gray' || family === 'cool-gray';

            if (closestColor && minHueDiff < 60) {
              // Use API color but shift hue to match family
              const apiHsl = rgbToHsl(closestColor[0], closestColor[1], closestColor[2]);
              // For grays, use very low saturation; for colors, use API saturation
              const saturation = isGray ? 0.02 + (Math.random() * 0.03) : apiHsl.s;
              finalRgb = hslToRgb(targetHue, saturation, apiHsl.l);
            } else {
              // Fallback to simple generation
              const saturation = isGray ? 0.02 + (Math.random() * 0.03) : 0.65 + (Math.random() * 0.2);
              const lightness = 0.50 + (Math.random() * 0.1);
              finalRgb = hslToRgb(targetHue, saturation, lightness);
            }

            const hex = rgbToHex(finalRgb.r, finalRgb.g, finalRgb.b);
            familyOptions.push(hex);
          }
        } catch (error) {
          console.error('Error calling Colormind API:', error);
          console.log('Falling back to simple color generation for family', family, 'option', optionIndex);

          // Fallback to simple generation if API fails
          const isGray = family === 'warm-gray' || family === 'cool-gray';
          const saturation = isGray ? 0.02 + (Math.random() * 0.03) : 0.65 + (Math.random() * 0.2);
          const lightness = 0.50 + (Math.random() * 0.1);

          const rgb = hslToRgb(targetHue, saturation, lightness);
          const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

          familyOptions.push(hex);
        }
      }

      colorsByFamily[family] = familyOptions;
    }

    setPreviewColorsByFamily(colorsByFamily);
    setIsGenerating(false);
  };

  const applyPreviewColors = () => {
    if (!previewColorsByFamily || selectedPreviews.size === 0) return;

    const newScales = [];
    let scaleIndex = 0;

    // Convert Set to array and process each selection
    Array.from(selectedPreviews).forEach((selectionKey) => {
      // Handle multi-word family names like "warm-gray" by splitting from the right
      const lastDashIndex = selectionKey.lastIndexOf('-');
      const family = selectionKey.substring(0, lastDashIndex);
      const optionIndex = parseInt(selectionKey.substring(lastDashIndex + 1));
      const hex = previewColorsByFamily[family][optionIndex];

      const newScale = {
        id: nextColorId + scaleIndex,
        name: `${family}-${nextColorId + scaleIndex + 1}`,
        hex: hex,
        lightSurface: false,
        useCustomBezier: false,
        useCustomLstarRange: false,
        lockKeyColor: false,
        showAdvancedSettings: false,
        lstarMin: 0,
        lstarMax: 100,
        saturationMin: 100,
        saturationMax: 100,
        hueShiftDark: 0,
        hueShiftLight: 0,
        customSwatches: {},
        cp1: { x: 0.33, y: 0.00 },
        cp2: { x: 0.50, y: 0.60 }
      };
      newScales.push(newScale);
      scaleIndex++;
    });

    setColorScales([...colorScales, ...newScales]);
    setNextColorId(nextColorId + newScales.length);
    setPreviewColorsByFamily(null);
    setSelectedPreviews(new Set());

    // Uncheck all checkboxes
    const checkboxes = document.querySelectorAll('.harmonious-color-checkbox:checked');
    checkboxes.forEach(cb => cb.checked = false);
  };

  const cancelPreview = () => {
    setPreviewColorsByFamily(null);
    setSelectedPreviews(new Set());
  };

  const togglePreviewSelection = (family, optionIndex) => {
    const selectionKey = `${family}-${optionIndex}`;
    const newSelected = new Set(selectedPreviews);

    if (newSelected.has(selectionKey)) {
      newSelected.delete(selectionKey);
    } else {
      newSelected.add(selectionKey);
    }

    setSelectedPreviews(newSelected);
  };

  // Serialize state to URL parameter
  const serializeState = () => {
    const state = {
      cp1,
      cp2,
      globalLstarMin,
      globalLstarMax,
      colorScales,
      nextColorId,
      grayScaleName,
      numSwatches,
      lightSurface,
      comparisonLightSurface,
      useLightnessNumbering,
      customIncrement,
      useCustomIncrement
    };

    try {
      const json = JSON.stringify(state);
      // Use URL-safe base64 encoding
      const base64 = btoa(json)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return base64;
    } catch (e) {
      console.error('Failed to serialize state:', e);
      return '';
    }
  };

  // Deserialize state from URL parameter
  const deserializeState = (encoded) => {
    try {
      // Convert from URL-safe base64
      const base64 = encoded
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const json = atob(base64);
      const state = JSON.parse(json);

      // Restore state
      if (state.cp1) setCp1(state.cp1);
      if (state.cp2) setCp2(state.cp2);
      if (state.globalLstarMin !== undefined) setGlobalLstarMin(state.globalLstarMin);
      if (state.globalLstarMax !== undefined) setGlobalLstarMax(state.globalLstarMax);
      if (state.colorScales) setColorScales(state.colorScales);
      if (state.nextColorId !== undefined) setNextColorId(state.nextColorId);
      if (state.grayScaleName) setGrayScaleName(state.grayScaleName);
      if (state.numSwatches !== undefined) setNumSwatches(state.numSwatches);
      if (state.lightSurface !== undefined) setLightSurface(state.lightSurface);
      if (state.comparisonLightSurface !== undefined) setComparisonLightSurface(state.comparisonLightSurface);
      if (state.useLightnessNumbering !== undefined) setUseLightnessNumbering(state.useLightnessNumbering);
      if (state.customIncrement !== undefined) setCustomIncrement(state.customIncrement);
      if (state.useCustomIncrement !== undefined) setUseCustomIncrement(state.useCustomIncrement);

      return true;
    } catch (e) {
      console.error('Failed to deserialize state:', e);
      return false;
    }
  };

  // Generate share URL and copy to clipboard
  const generateShareUrl = async () => {
    const encoded = serializeState();
    if (!encoded) return;

    const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
    setShareUrl(url);

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      setShowCopiedMessage(true);
      setTimeout(() => setShowCopiedMessage(false), 2000);
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
      // Fallback: select the URL for manual copying
      alert(`Failed to copy automatically. Here's your share URL:\n\n${url}`);
    }
  };

  // Load state from URL on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1); // Remove the # character
    if (hash) {
      deserializeState(hash);
    }
  }, []); // Only run once on mount

  const addColorScale = () => {
    const newScale = {
      id: nextColorId,
      name: `color-${nextColorId + 1}`,
      hex: '#3b82f6',
      lightSurface: false,
      useCustomBezier: false,
      useCustomLstarRange: false,
      lockKeyColor: false,
      showAdvancedSettings: false,
      lstarMin: 0,
      lstarMax: 100,
      saturationMin: 100,
      saturationMax: 100,
      hueShiftDark: 0,
      hueShiftLight: 0,
      customSwatches: {},
      cp1: { x: 0.33, y: 0.00 },
      cp2: { x: 0.50, y: 0.60 }
    };
    setColorScales([...colorScales, newScale]);
    setNextColorId(nextColorId + 1);
  };

  const removeColorScale = (id) => {
    setColorScales(colorScales.filter(cs => cs.id !== id));
  };

  const moveColorScale = (id, direction) => {
    const index = colorScales.findIndex(cs => cs.id === id);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= colorScales.length) return;

    const newScales = [...colorScales];
    [newScales[index], newScales[newIndex]] = [newScales[newIndex], newScales[index]];
    setColorScales(newScales);
  };

  const updateColorScaleHex = (id, hex) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, hex } : cs
    ));
  };

  const updateColorScaleName = (id, name) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, name } : cs
    ));
  };

  const toggleColorScaleSurface = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, lightSurface: !cs.lightSurface } : cs
    ));
  };

  const toggleDesaturateScale = (id) => {
    setDesaturatedScales(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleCustomBezier = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, useCustomBezier: !cs.useCustomBezier } : cs
    ));
  };

  const toggleCustomLstarRange = (id) => {
    setColorScales(colorScales.map(cs => {
      if (cs.id === id) {
        // When enabling custom range, initialize with current global values
        if (!cs.useCustomLstarRange) {
          return {
            ...cs,
            useCustomLstarRange: true,
            lstarMin: globalLstarMin,
            lstarMax: globalLstarMax
          };
        } else {
          return { ...cs, useCustomLstarRange: false };
        }
      }
      return cs;
    }));
  };

  const toggleLockKeyColor = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, lockKeyColor: !cs.lockKeyColor } : cs
    ));
  };

  const toggleAdvancedSettings = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, showAdvancedSettings: !cs.showAdvancedSettings } : cs
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

  const updateLstarRange = (id, type, value) => {
    setColorScales(colorScales.map(cs => {
      if (cs.id === id) {
        const numValue = parseInt(value);
        if (type === 'min') {
          return { ...cs, lstarMin: Math.max(0, Math.min(numValue, cs.lstarMax - 5)) };
        } else {
          return { ...cs, lstarMax: Math.min(100, Math.max(numValue, cs.lstarMin + 5)) };
        }
      }
      return cs;
    }));
  };

  const updateSaturationRange = (id, type, value) => {
    setColorScales(colorScales.map(cs => {
      if (cs.id === id) {
        const numValue = parseInt(value);
        if (type === 'min') {
          return { ...cs, saturationMin: Math.max(0, Math.min(numValue, 100)) };
        } else {
          return { ...cs, saturationMax: Math.max(0, Math.min(numValue, 100)) };
        }
      }
      return cs;
    }));
  };

  const updateHueShift = (id, type, value) => {
    setColorScales(colorScales.map(cs => {
      if (cs.id === id) {
        const numValue = parseInt(value);
        if (type === 'dark') {
          return { ...cs, hueShiftDark: Math.max(-180, Math.min(180, numValue)) };
        } else {
          return { ...cs, hueShiftLight: Math.max(-180, Math.min(180, numValue)) };
        }
      }
      return cs;
    }));
  };

  const resetLstarRange = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, lstarMin: globalLstarMin, lstarMax: globalLstarMax } : cs
    ));
  };

  const resetSaturationRange = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, saturationMin: 100, saturationMax: 100 } : cs
    ));
  };

  const resetHueShift = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, hueShiftDark: 0, hueShiftLight: 0 } : cs
    ));
  };

  const resetCustomBezier = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, cp1: { ...cp1 }, cp2: { ...cp2 } } : cs
    ));
  };

  const updateCustomSwatch = (id, step, hex) => {
    setColorScales(colorScales.map(cs => {
      if (cs.id === id) {
        return {
          ...cs,
          customSwatches: { ...cs.customSwatches, [step]: hex }
        };
      }
      return cs;
    }));
  };

  const resetCustomSwatch = (id, step) => {
    setColorScales(colorScales.map(cs => {
      if (cs.id === id) {
        const newCustomSwatches = { ...cs.customSwatches };
        delete newCustomSwatches[step];
        return { ...cs, customSwatches: newCustomSwatches };
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

  // Set default base color scale to first color scale
  useEffect(() => {
    if (colorScales.length > 0 && baseColorScaleId === null) {
      setBaseColorScaleId(colorScales[0].id);
    }
  }, [colorScales, baseColorScaleId]);

  // Debug: Log global L* range changes
  useEffect(() => {
    console.log('Global L* Range updated:', { min: globalLstarMin, max: globalLstarMax });
  }, [globalLstarMin, globalLstarMax]);

  // Close harmonize dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (harmonizingScale !== null && !e.target.closest('.harmonize-dropdown-container')) {
        setHarmonizingScale(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [harmonizingScale]);

  const grayScale = (() => {
    const scale = generateGrayScale(globalLstarMin, globalLstarMax).slice(1, -1);
    const lstarValues = scale.map(s => s.lstar);
    const increment = useCustomIncrement ? customIncrement : 100;
    const steps = calculateStepFromLstar(lstarValues, useLightnessNumbering, globalLstarMin, globalLstarMax, increment);
    return scale.map((swatch, i) => ({ ...swatch, step: steps[i] }));
  })();

  // Export to Figma Tokens format
  const exportToFigmaTokens = () => {
    const tokens = {
      color: {}
    };

    // Add gray scale
    tokens.color[grayScaleName] = {};
    grayScale.forEach(swatch => {
      tokens.color[grayScaleName][swatch.step] = {
        value: swatch.hex,
        type: "color"
      };
    });

    // Add color scales
    colorScales.forEach(cs => {
      let scale = generateColorScale(
        cs.hex,
        cs.useCustomBezier ? cs.cp1 : null,
        cs.useCustomBezier ? cs.cp2 : null,
        (cs.useCustomLstarRange === true) ? cs.lstarMin : globalLstarMin,
        (cs.useCustomLstarRange === true) ? cs.lstarMax : globalLstarMax,
        cs.saturationMin,
        cs.saturationMax,
        cs.hueShiftDark,
        cs.hueShiftLight
      );

      const keyColorIndex = findKeyColorIndex(scale, cs.hex);

      // If key color is locked, replace the closest swatch with exact hex
      if (cs.lockKeyColor && keyColorIndex >= 0) {
        scale[keyColorIndex] = {
          ...scale[keyColorIndex],
          hex: cs.hex
        };
      }

      // Apply custom swatches
      scale.forEach((swatch, i) => {
        if (cs.customSwatches[swatch.step]) {
          scale[i] = {
            ...swatch,
            hex: cs.customSwatches[swatch.step],
            isCustom: true
          };
        }
      });

      // Remove white and black anchors and apply numbering
      scale = (() => {
        const sliced = scale.slice(1, -1);
        const lstarValues = sliced.map(s => s.lstar);
        const lstarMin = (cs.useCustomLstarRange === true) ? cs.lstarMin : globalLstarMin;
        const lstarMax = (cs.useCustomLstarRange === true) ? cs.lstarMax : globalLstarMax;
        const increment = useCustomIncrement ? customIncrement : 100;
        const steps = calculateStepFromLstar(lstarValues, useLightnessNumbering, lstarMin, lstarMax, increment);
        return sliced.map((swatch, i) => ({ ...swatch, step: steps[i] }));
      })();

      tokens.color[cs.name] = {};
      scale.forEach(swatch => {
        tokens.color[cs.name][swatch.step] = {
          value: swatch.hex,
          type: "color"
        };
      });
    });

    // Create and download JSON file
    const jsonString = JSON.stringify(tokens, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'figma-tokens.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-black text-gray-200 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold text-white mb-2">Color Scale Editor</h1>
        <p className="text-gray-500 mb-8">Interactive bezier curve editor for perceptually uniform color scales</p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-3">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                Bezier Control Points
              </label>
              <button
                onClick={resetBezierPoints}
                className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Reset
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Swatches:
              </label>
              <input
                type="number"
                value={numSwatches}
                onChange={(e) => setNumSwatches(Math.max(4, Math.min(20, parseInt(e.target.value) || 12)))}
                min="4"
                max="20"
                className="w-16 px-2 py-1 bg-black border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>
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
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Token Numbers:
            </label>
            <button
              onClick={() => setUseLightnessNumbering(false)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                !useLightnessNumbering
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'
              }`}
            >
              Sequential (100, 200...)
            </button>
            <button
              onClick={() => setUseLightnessNumbering(true)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                useLightnessNumbering
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'
              }`}
            >
              Lightness (90, 80, 70...)
            </button>
          </div>
          {useLightnessNumbering && (
            <div className="mt-2 text-xs text-gray-400">
              Numbers based on L* values: prioritizes 10s (90, 80, 70...), then 5s (95, 85...), then smaller increments as needed.
            </div>
          )}
          {!useLightnessNumbering && (
            <div className="mt-3 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomIncrement}
                  onChange={(e) => setUseCustomIncrement(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-black text-blue-600 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-xs font-medium text-gray-400">Custom increment:</span>
              </label>
              <input
                type="number"
                value={customIncrement}
                onChange={(e) => setCustomIncrement(Math.max(1, parseInt(e.target.value) || 10))}
                disabled={!useCustomIncrement}
                min="1"
                max="1000"
                className={`w-20 px-2 py-1 bg-black border border-zinc-700 rounded-md text-xs font-mono focus:outline-none focus:border-zinc-600 ${
                  !useCustomIncrement ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              />
              <span className="text-xs text-gray-500">
                (e.g., 10 → 10, 20, 30...)
              </span>
            </div>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
              Global L* Range (Lightness Limits)
            </label>
            <button
              onClick={() => {
                setGlobalLstarMin(10);
                setGlobalLstarMax(98);
              }}
              className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Reset
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Max (Light)</label>
              <input
                type="range"
                min="5"
                max="100"
                value={globalLstarMax}
                onChange={(e) => setGlobalLstarMax(parseInt(e.target.value))}
                className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-xs font-mono text-gray-400 mt-1">L* {globalLstarMax}</div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Min (Dark)</label>
              <input
                type="range"
                min="0"
                max="95"
                value={globalLstarMin}
                onChange={(e) => setGlobalLstarMin(parseInt(e.target.value))}
                className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-xs font-mono text-gray-400 mt-1">L* {globalLstarMin}</div>
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Default lightness range for all color scales (use custom range in Advanced Settings to override)
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
              <div className="flex gap-2">
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
                <button
                  onClick={() => setIsGrayScaleDesaturated(!isGrayScaleDesaturated)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isGrayScaleDesaturated
                      ? 'bg-gray-400 text-black hover:bg-gray-300'
                      : 'bg-zinc-800 text-gray-200 hover:bg-zinc-700'
                  }`}
                  title="Toggle grayscale to preview lightness values"
                >
                  {isGrayScaleDesaturated ? 'Luminance' : 'Color'}
                </button>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Token Prefix
              </label>
              <input
                type="text"
                value={grayScaleName}
                onChange={(e) => setGrayScaleName(e.target.value)}
                placeholder="gray"
                className="w-48 px-3 py-2 bg-black border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-zinc-600"
              />
              <div className="text-xs text-gray-500 mt-1">
                Preview: {grayScaleName}-100, {grayScaleName}-200, ...
              </div>
            </div>
            <div className="relative mb-4">
              <div
                className="flex gap-2 h-16 rounded-lg p-4"
                style={{ background: lightSurface ? '#ffffff' : '#000000' }}
              >
                {grayScale.map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded"
                    style={{ background: isGrayScaleDesaturated ? hexToGrayscale(v.hex) : v.hex }}
                  />
                ))}
              </div>
              {hoveredSwatch.scaleId === 'gray' && hoveredSwatch.index !== null && (
                <div
                  className="absolute top-0 bottom-0 pointer-events-none transition-all duration-200"
                  style={{
                    left: `calc(1rem + ${hoveredSwatch.index} * ((100% - 2rem + 0.5rem) / ${grayScale.length}))`,
                    width: `calc((100% - 2rem + 0.5rem) / ${grayScale.length} - 0.5rem)`,
                  }}
                >
                  <div
                    className="w-full h-full border rounded transition-opacity duration-200"
                    style={{
                      borderColor: lightSurface ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)',
                      boxShadow: lightSurface ? '0 0 8px rgba(0, 0, 0, 0.1)' : '0 0 8px rgba(255, 255, 255, 0.1)'
                    }}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-6 gap-2">
              {grayScale.map((v, i) => (
                <div
                  key={i}
                  className="bg-black border border-zinc-800 rounded-md p-2 text-center cursor-pointer hover:bg-zinc-900 transition-colors"
                  onMouseEnter={() => setHoveredSwatch({ scaleId: 'gray', index: i })}
                  onMouseLeave={() => setHoveredSwatch({ scaleId: null, index: null })}
                >
                  <div className="text-xs text-gray-400 mb-1 font-mono">{grayScaleName}-{v.step}</div>
                  <div className="text-xs font-mono text-gray-200 mb-0.5">{v.hex}</div>
                  <div className="text-[10px] text-gray-500">L* {v.lstar}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {colorScales.map((cs, scaleIndex) => {
          let scale = generateColorScale(
            cs.hex,
            cs.useCustomBezier ? cs.cp1 : null,
            cs.useCustomBezier ? cs.cp2 : null,
            (cs.useCustomLstarRange === true) ? cs.lstarMin : globalLstarMin,
            (cs.useCustomLstarRange === true) ? cs.lstarMax : globalLstarMax,
            cs.saturationMin,
            cs.saturationMax,
            cs.hueShiftDark,
            cs.hueShiftLight
          );
          const keyColorIndex = findKeyColorIndex(scale, cs.hex);

          // If key color is locked, replace the closest swatch with exact hex
          if (cs.lockKeyColor && keyColorIndex >= 0) {
            scale[keyColorIndex] = {
              ...scale[keyColorIndex],
              hex: cs.hex
            };
          }

          // Remove white and black anchors and apply numbering
          scale = (() => {
            const sliced = scale.slice(1, -1);
            const lstarValues = sliced.map(s => s.lstar);
            const lstarMin = (cs.useCustomLstarRange === true) ? cs.lstarMin : globalLstarMin;
            const lstarMax = (cs.useCustomLstarRange === true) ? cs.lstarMax : globalLstarMax;
            const increment = useCustomIncrement ? customIncrement : 100;
            const steps = calculateStepFromLstar(lstarValues, useLightnessNumbering, lstarMin, lstarMax, increment);
            return sliced.map((swatch, i) => ({ ...swatch, step: steps[i] }));
          })();

          // Apply custom swatches AFTER renumbering
          scale.forEach((swatch, i) => {
            if (cs.customSwatches[swatch.step]) {
              scale[i] = {
                ...swatch,
                hex: cs.customSwatches[swatch.step],
                isCustom: true
              };
            }
          });

          return (
            <div key={cs.id} className="flex gap-6 mb-6">
              <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-white">Color Scale</h2>
                  <div className="flex gap-2">
                    <div className="flex gap-1 border border-zinc-700 rounded-md overflow-hidden">
                      <button
                        onClick={() => moveColorScale(cs.id, 'up')}
                        disabled={scaleIndex === 0}
                        className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                          scaleIndex === 0
                            ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed'
                            : 'bg-zinc-800 text-gray-200 hover:bg-zinc-700'
                        }`}
                        title="Move up"
                      >
                        <span className="material-symbols-rounded text-[16px]">arrow_upward</span>
                      </button>
                      <button
                        onClick={() => moveColorScale(cs.id, 'down')}
                        disabled={scaleIndex === colorScales.length - 1}
                        className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                          scaleIndex === colorScales.length - 1
                            ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed'
                            : 'bg-zinc-800 text-gray-200 hover:bg-zinc-700'
                        }`}
                        title="Move down"
                      >
                        <span className="material-symbols-rounded text-[16px]">arrow_downward</span>
                      </button>
                    </div>
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
                      onClick={() => toggleDesaturateScale(cs.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        desaturatedScales.has(cs.id)
                          ? 'bg-gray-400 text-black hover:bg-gray-300'
                          : 'bg-zinc-800 text-gray-200 hover:bg-zinc-700'
                      }`}
                      title="Toggle grayscale to preview lightness values"
                    >
                      {desaturatedScales.has(cs.id) ? 'Luminance' : 'Color'}
                    </button>
                    <button
                      onClick={() => removeColorScale(cs.id)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-md text-xs font-medium text-white transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mb-4 flex gap-4 items-start">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      Token Prefix
                    </label>
                    <input
                      type="text"
                      value={cs.name}
                      onChange={(e) => updateColorScaleName(cs.id, e.target.value)}
                      placeholder="color"
                      className="w-48 px-3 py-2 bg-black border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-zinc-600"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      Preview: {cs.name}-100, {cs.name}-200, ...
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      Key Color
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={cs.hex}
                        onChange={(e) => updateColorScaleHex(cs.id, e.target.value)}
                        className="w-16 h-10 border border-zinc-700 rounded-md bg-black cursor-pointer"
                      />
                      <input
                        type="text"
                        value={cs.hex}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                            updateColorScaleHex(cs.id, value);
                          }
                        }}
                        className="w-20 px-2 py-1 bg-black border border-zinc-700 rounded-md text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                        placeholder="#000000"
                      />
                      <div className="relative group">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cs.lockKeyColor}
                            onChange={() => toggleLockKeyColor(cs.id)}
                            className="w-4 h-4 rounded border-zinc-700 bg-black text-blue-600 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
                          />
                          <span className="text-xs font-medium text-gray-400">Lock</span>
                        </label>
                        <div className="absolute left-0 top-full mt-1 px-2 py-1 bg-zinc-800 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-200 pointer-events-none z-10">
                          Useful when exact brand color is needed
                        </div>
                      </div>
                      {colorScales.length > 1 && (
                        <div className="relative harmonize-dropdown-container">
                          <button
                            onClick={() => setHarmonizingScale(harmonizingScale === cs.id ? null : cs.id)}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-md text-xs font-medium text-white transition-colors"
                          >
                            Harmonize
                          </button>
                          {harmonizingScale === cs.id && (
                            <div className="absolute top-full left-0 mt-2 bg-zinc-800 border border-zinc-700 rounded-lg p-3 shadow-xl z-20 min-w-[200px]">
                              <div className="text-xs font-medium text-gray-400 mb-2">Harmonize with:</div>
                              <div className="space-y-1">
                                {colorScales
                                  .filter(otherCs => otherCs.id !== cs.id)
                                  .map(otherCs => (
                                    <button
                                      key={otherCs.id}
                                      onClick={() => harmonizeWithColor(cs.id, otherCs.id)}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-700 rounded text-left transition-colors"
                                    >
                                      <div
                                        className="w-4 h-4 rounded border border-zinc-600"
                                        style={{ backgroundColor: otherCs.hex }}
                                      />
                                      <span className="text-xs text-gray-200">{otherCs.name}</span>
                                    </button>
                                  ))}
                              </div>
                              <div className="mt-2 pt-2 border-t border-zinc-700">
                                <button
                                  onClick={() => setHarmonizingScale(null)}
                                  className="w-full px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cs.showAdvancedSettings}
                      onChange={() => toggleAdvancedSettings(cs.id)}
                      className="w-4 h-4 rounded border-zinc-700 bg-black text-blue-600 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-gray-400">Show Advanced Settings</span>
                  </label>
                </div>
                {cs.showAdvancedSettings && (
                  <>
                <div className="mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cs.useCustomLstarRange}
                      onChange={() => toggleCustomLstarRange(cs.id)}
                      className="w-4 h-4 rounded border-zinc-700 bg-black text-blue-600 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-gray-400">Use Custom L* Range</span>
                  </label>
                </div>
                {cs.useCustomLstarRange && (
                <div className="mb-4 bg-black border border-zinc-800 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Custom L* Range (Lightness Limits)
                    </label>
                    <button
                      onClick={() => resetLstarRange(cs.id)}
                      className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Max (Light)</label>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        value={cs.lstarMax}
                        onChange={(e) => updateLstarRange(cs.id, 'max', e.target.value)}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="text-xs font-mono text-gray-400 mt-1">L* {cs.lstarMax}</div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Min (Dark)</label>
                      <input
                        type="range"
                        min="0"
                        max="95"
                        value={cs.lstarMin}
                        onChange={(e) => updateLstarRange(cs.id, 'min', e.target.value)}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="text-xs font-mono text-gray-400 mt-1">L* {cs.lstarMin}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Override global L* range for this color scale (e.g., yellow works well at L* 20-90)
                  </div>
                </div>
                )}
                <div className="mb-4 bg-black border border-zinc-800 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Saturation Range
                    </label>
                    <button
                      onClick={() => resetSaturationRange(cs.id)}
                      className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Max (Light)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={cs.saturationMax}
                        onChange={(e) => updateSaturationRange(cs.id, 'max', e.target.value)}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="text-xs font-mono text-gray-400 mt-1">{cs.saturationMax}%</div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Min (Dark)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={cs.saturationMin}
                        onChange={(e) => updateSaturationRange(cs.id, 'min', e.target.value)}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="text-xs font-mono text-gray-400 mt-1">{cs.saturationMin}%</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Percentage of base saturation to maintain (100% = full color, 0% = grayscale)
                  </div>
                </div>
                <div className="mb-4 bg-black border border-zinc-800 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hue Shift
                    </label>
                    <button
                      onClick={() => resetHueShift(cs.id)}
                      className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Light End</label>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        value={cs.hueShiftLight}
                        onChange={(e) => updateHueShift(cs.id, 'light', e.target.value)}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="text-xs font-mono text-gray-400 mt-1">{cs.hueShiftLight}°</div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Dark End</label>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        value={cs.hueShiftDark}
                        onChange={(e) => updateHueShift(cs.id, 'dark', e.target.value)}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="text-xs font-mono text-gray-400 mt-1">{cs.hueShiftDark}°</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Rotate hue at extremes (e.g., shift yellow toward orange in darks)
                  </div>
                </div>
                  </>
                )}
                <div className="mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cs.useCustomBezier}
                      onChange={() => toggleCustomBezier(cs.id)}
                      className="w-4 h-4 rounded border-zinc-700 bg-black text-blue-600 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-gray-400">Use Custom Bezier Curve</span>
                  </label>
                </div>
                {cs.useCustomBezier && (
                  <div className="mb-4 bg-black border border-zinc-800 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Custom Bezier Curve
                      </label>
                      <button
                        onClick={() => resetCustomBezier(cs.id)}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        Reset to Global
                      </button>
                    </div>
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
                <div className="relative mb-4">
                  <div
                    className="flex gap-2 h-16 rounded-lg p-4"
                    style={{ background: cs.lightSurface ? '#ffffff' : '#000000' }}
                  >
                    {scale.map((v, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded"
                        style={{ background: desaturatedScales.has(cs.id) ? hexToGrayscale(v.hex) : v.hex }}
                      />
                    ))}
                  </div>
                  {hoveredSwatch.scaleId === cs.id && hoveredSwatch.index !== null && (
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none transition-all duration-200"
                      style={{
                        left: `calc(1rem + ${hoveredSwatch.index} * ((100% - 2rem + 0.5rem) / ${scale.length}))`,
                        width: `calc((100% - 2rem + 0.5rem) / ${scale.length} - 0.5rem)`,
                      }}
                    >
                      <div
                        className="w-full h-full border rounded transition-opacity duration-200"
                        style={{
                          borderColor: cs.lightSurface ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)',
                          boxShadow: cs.lightSurface ? '0 0 8px rgba(0, 0, 0, 0.1)' : '0 0 8px rgba(255, 255, 255, 0.1)'
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {scale.map((v, i) => {
                    const isEditing = editingSwatch.scaleId === cs.id && editingSwatch.step === v.step;
                    const isKeyColor = cs.lockKeyColor
                      ? v.hex.toLowerCase() === cs.hex.toLowerCase()
                      : i === keyColorIndex;
                    const isLockedKeyColor = cs.lockKeyColor && isKeyColor;
                    return (
                      <div
                        key={i}
                        className={`bg-black rounded-md p-2 text-center relative transition-colors ${
                          isLockedKeyColor
                            ? 'cursor-not-allowed'
                            : 'cursor-pointer hover:bg-zinc-900'
                        } ${
                          isKeyColor
                            ? 'border-2 border-blue-500 shadow-lg shadow-blue-500/50'
                            : v.isCustom
                            ? 'border-2 border-amber-500'
                            : 'border border-zinc-800'
                        }`}
                        onClick={() => !isLockedKeyColor && setEditingSwatch({ scaleId: cs.id, step: v.step })}
                        onMouseEnter={() => setHoveredSwatch({ scaleId: cs.id, index: i })}
                        onMouseLeave={() => setHoveredSwatch({ scaleId: null, index: null })}
                      >
                        {isKeyColor && (
                          <div className="absolute -top-2 -right-2 w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
                            <span className="material-symbols-rounded text-white text-[12px]">key</span>
                          </div>
                        )}
                        {v.isCustom && (
                          <div className="absolute -top-2 -left-2 w-5 h-5 bg-amber-500 rounded flex items-center justify-center">
                            <span className="material-symbols-rounded text-black text-[12px]">edit</span>
                          </div>
                        )}
                        {isEditing ? (
                          <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                            <div className="text-xs text-gray-400 mb-1 font-mono">{cs.name}-{v.step}</div>
                            <input
                              type="color"
                              value={v.hex}
                              onChange={(e) => updateCustomSwatch(cs.id, v.step, e.target.value)}
                              className="w-full h-6 border border-zinc-700 rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={v.hex}
                              onChange={(e) => updateCustomSwatch(cs.id, v.step, e.target.value)}
                              className="w-full px-1 py-0.5 text-[10px] font-mono bg-zinc-900 border border-zinc-700 rounded focus:outline-none focus:border-zinc-600"
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => setEditingSwatch({ scaleId: null, step: null })}
                                className="flex-1 px-1 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-[9px] text-white"
                              >
                                Done
                              </button>
                              {v.isCustom && (
                                <button
                                  onClick={() => {
                                    resetCustomSwatch(cs.id, v.step);
                                    setEditingSwatch({ scaleId: null, step: null });
                                  }}
                                  className="flex-1 px-1 py-0.5 bg-amber-600 hover:bg-amber-700 rounded text-[9px] text-white"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-xs text-gray-400 mb-1 font-mono flex items-center justify-center gap-1">
                              {cs.name}-{v.step}
                              {cs.lockKeyColor && isKeyColor && (
                                <span className="material-symbols-rounded text-blue-400 text-[12px]">lock</span>
                              )}
                            </div>
                            <div className="text-xs font-mono text-gray-200 mb-0.5">{v.hex}</div>
                            <div className="text-[10px] text-gray-500">L* {v.lstar}</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {colorScales.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">All Scales Comparison</h2>
              <div className="flex gap-2">
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
                <button
                  onClick={() => setIsComparisonDesaturated(!isComparisonDesaturated)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isComparisonDesaturated
                      ? 'bg-gray-400 text-black hover:bg-gray-300'
                      : 'bg-zinc-800 text-gray-200 hover:bg-zinc-700'
                  }`}
                  title="Toggle grayscale for all scales to preview lightness values"
                >
                  {isComparisonDesaturated ? 'Luminance' : 'Color'}
                </button>
              </div>
            </div>
            <div
              className="rounded-lg p-4"
              style={{ background: comparisonLightSurface ? '#ffffff' : '#000000' }}
            >
              <div className="space-y-2">
                {/* Gray Scale */}
                <div className="flex items-center gap-2">
                  <div className="w-24 flex-shrink-0 flex items-center gap-1">
                    <span className={`text-xs font-medium ${comparisonLightSurface ? 'text-gray-800' : 'text-gray-300'}`}>
                      Gray
                    </span>
                    <button
                      onClick={() => setIsGrayScaleDesaturated(!isGrayScaleDesaturated)}
                      className="p-0.5 hover:bg-zinc-700 rounded transition-colors"
                      title="Toggle luminance view"
                    >
                      <span className={`material-symbols-rounded text-[14px] ${
                        isGrayScaleDesaturated
                          ? comparisonLightSurface ? 'text-gray-600' : 'text-gray-400'
                          : comparisonLightSurface ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {isGrayScaleDesaturated ? 'contrast' : 'palette'}
                      </span>
                    </button>
                  </div>
                  <div className="flex gap-2 flex-1 h-8">
                    {grayScale.map((v, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded"
                        style={{ background: (isComparisonDesaturated || isGrayScaleDesaturated) ? hexToGrayscale(v.hex) : v.hex }}
                      />
                    ))}
                  </div>
                </div>
                {/* Color Scales */}
                {colorScales.map((cs) => {
                  let scale = generateColorScale(
                    cs.hex,
                    cs.useCustomBezier ? cs.cp1 : null,
                    cs.useCustomBezier ? cs.cp2 : null,
                    cs.useCustomLstarRange ? cs.lstarMin : globalLstarMin,
                    cs.useCustomLstarRange ? cs.lstarMax : globalLstarMax,
                    cs.saturationMin,
                    cs.saturationMax,
                    cs.hueShiftDark,
                    cs.hueShiftLight
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

                  // Remove white and black anchors and apply numbering
                  scale = (() => {
                    const sliced = scale.slice(1, -1);
                    const lstarValues = sliced.map(s => s.lstar);
                    const lstarMin = cs.useCustomLstarRange ? cs.lstarMin : globalLstarMax;
                    const lstarMax = cs.useCustomLstarRange ? cs.lstarMax : globalLstarMax;
                    const increment = useCustomIncrement ? customIncrement : 100;
                    const steps = calculateStepFromLstar(lstarValues, useLightnessNumbering, lstarMin, lstarMax, increment);
                    return sliced.map((swatch, i) => ({ ...swatch, step: steps[i] }));
                  })();

                  return (
                    <div key={cs.id} className="flex items-center gap-2">
                      <div className="w-24 flex-shrink-0 flex items-center gap-1">
                        <div
                          className="w-4 h-4 rounded border border-gray-600"
                          style={{ background: cs.hex }}
                        />
                        <span className={`text-xs font-medium ${comparisonLightSurface ? 'text-gray-800' : 'text-gray-300'}`}>
                          {cs.name}
                        </span>
                        <button
                          onClick={() => toggleDesaturateScale(cs.id)}
                          className="p-0.5 hover:bg-zinc-700 rounded transition-colors ml-auto"
                          title="Toggle luminance view"
                        >
                          <span className={`material-symbols-rounded text-[14px] ${
                            desaturatedScales.has(cs.id)
                              ? comparisonLightSurface ? 'text-gray-600' : 'text-gray-400'
                              : comparisonLightSurface ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {desaturatedScales.has(cs.id) ? 'contrast' : 'palette'}
                          </span>
                        </button>
                      </div>
                      <div className="flex gap-2 flex-1 h-8">
                        {scale.map((v, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded"
                            style={{ background: (isComparisonDesaturated || desaturatedScales.has(cs.id)) ? hexToGrayscale(v.hex) : v.hex }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {colorScales.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">Add Color Families</h3>
            <p className="text-sm text-gray-400 mb-4">
              Quickly add common color families to your palette
            </p>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[300px]">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Select Color Families to Generate
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: 'Red', value: 'red', color: '#ef4444' },
                    { name: 'Rose', value: 'rose', color: '#f43f5e' },
                    { name: 'Pink', value: 'pink', color: '#ec4899' },
                    { name: 'Orange', value: 'orange', color: '#f97316' },
                    { name: 'Amber', value: 'amber', color: '#f59e0b' },
                    { name: 'Yellow', value: 'yellow', color: '#eab308' },
                    { name: 'Lime', value: 'lime', color: '#84cc16' },
                    { name: 'Green', value: 'green', color: '#22c55e' },
                    { name: 'Emerald', value: 'emerald', color: '#10b981' },
                    { name: 'Teal', value: 'teal', color: '#14b8a6' },
                    { name: 'Cyan', value: 'cyan', color: '#06b6d4' },
                    { name: 'Sky', value: 'sky', color: '#0ea5e9' },
                    { name: 'Blue', value: 'blue', color: '#3b82f6' },
                    { name: 'Indigo', value: 'indigo', color: '#6366f1' },
                    { name: 'Violet', value: 'violet', color: '#8b5cf6' },
                    { name: 'Purple', value: 'purple', color: '#a855f7' },
                    { name: 'Warm Gray', value: 'warm-gray', color: '#a8a29e' },
                    { name: 'Cool Gray', value: 'cool-gray', color: '#9ca3af' },
                  ].map((family) => (
                    <label
                      key={family.value}
                      className="flex items-center gap-2 px-3 py-2 bg-black border border-zinc-700 rounded-md cursor-pointer hover:bg-zinc-900 transition-colors"
                    >
                      <input
                        type="checkbox"
                        value={family.value}
                        className="w-4 h-4 rounded border-zinc-700 bg-black text-blue-600 focus:ring-blue-600 focus:ring-offset-0 cursor-pointer harmonious-color-checkbox"
                      />
                      <div
                        className="w-4 h-4 rounded border border-zinc-600"
                        style={{ backgroundColor: family.color }}
                      />
                      <span className="text-sm text-gray-200">{family.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Base Color
                </label>
                <select
                  value={baseColorScaleId || ''}
                  onChange={(e) => setBaseColorScaleId(e.target.value ? parseInt(e.target.value) : null)}
                  className="px-3 py-2 bg-black border border-zinc-700 rounded-md text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {colorScales.map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      {cs.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-3">
                <button
                  onClick={generateHarmoniousColors}
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  Preview Colors
                </button>
              </div>
            </div>

            {/* Loading State */}
            {isGenerating && (
              <div className="mt-4 p-8 bg-black border border-zinc-700 rounded-lg">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 border-4 border-zinc-700 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-purple-500 rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <div className="text-sm text-gray-400">Generating harmonious colors...</div>
                </div>
              </div>
            )}

            {/* Preview Area */}
            {!isGenerating && previewColorsByFamily && (
              <div className="mt-4 p-4 bg-black border border-zinc-700 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-medium text-gray-300">
                    Preview Options - Select one or more from each family
                    {selectedPreviews.size > 0 && (
                      <span className="ml-2 text-purple-400">({selectedPreviews.size} selected)</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={generateHarmoniousColors}
                      className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-md text-xs font-medium text-white transition-colors"
                    >
                      Regenerate All
                    </button>
                    <button
                      onClick={applyPreviewColors}
                      disabled={selectedPreviews.size === 0}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium text-white transition-colors ${
                        selectedPreviews.size === 0
                          ? 'bg-zinc-700 text-gray-500 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      Add Selected ({selectedPreviews.size})
                    </button>
                    <button
                      onClick={cancelPreview}
                      className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-md text-xs font-medium text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-6">
                  {Object.entries(previewColorsByFamily).map(([family, options]) => (
                    <div key={family} className="flex flex-col gap-2">
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider capitalize">
                        {family}
                      </div>
                      <div className="flex gap-3">
                        {options.map((hex, optionIndex) => {
                          const selectionKey = `${family}-${optionIndex}`;
                          const isSelected = selectedPreviews.has(selectionKey);

                          return (
                            <div
                              key={optionIndex}
                              onClick={() => togglePreviewSelection(family, optionIndex)}
                              className={`flex flex-col items-center gap-2 p-3 rounded-lg cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-zinc-800 border-2 border-purple-500'
                                  : 'bg-zinc-900 border-2 border-zinc-700 hover:border-zinc-600'
                              }`}
                            >
                              <div
                                className="w-16 h-16 rounded border border-zinc-600"
                                style={{ backgroundColor: hex }}
                              />
                              <div className="text-xs font-mono text-gray-400">{hex}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 items-center">
          <button
            onClick={addColorScale}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition-colors"
          >
            + Add Color Scale
          </button>
          <button
            onClick={exportToFigmaTokens}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium text-white transition-colors"
          >
            Export to Figma Tokens
          </button>
          <button
            onClick={generateShareUrl}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium text-white transition-colors"
          >
            Share Palette
          </button>
          {showCopiedMessage && (
            <span className="text-sm text-green-500 font-medium animate-pulse">
              Link copied to clipboard!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
