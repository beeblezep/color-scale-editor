import React, { useState, useRef, useEffect } from 'react';
import { motionPresets } from './motionTokens';
import { SegmentedControl, Theme, Switch, Tooltip, Checkbox, Button } from '@radix-ui/themes';
import { motion, AnimatePresence } from 'framer-motion';

export default function ColorScaleEditor() {
  const canvasRef = useRef(null);
  const [cp1, setCp1] = useState({ x: 0.33, y: 0.00 });
  const [cp2, setCp2] = useState({ x: 0.50, y: 0.60 });
  const [dragging, setDragging] = useState(null);
  const [globalLstarMin, setGlobalLstarMin] = useState(5);
  const [globalLstarMax, setGlobalLstarMax] = useState(98);
  const [colorScales, setColorScales] = useState([
    {
      id: 0,
      name: 'gray',
      hex: '#808080', // 50% gray
      isGrayScale: true,
      isExpanded: false,
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
      cp2: { x: 0.50, y: 0.60 },
      isSingleColor: false,
      swatchCountOverride: null,
      preHarmonizeHex: null, // Store original color before harmonizing
      includeAnchors: false // Include pure white and black anchor swatches
    }
  ]);
  const [nextColorId, setNextColorId] = useState(1);
  const [comparisonLightSurface, setComparisonLightSurface] = useState(false);
  const [miniCanvasDragging, setMiniCanvasDragging] = useState({ id: null, point: null });
  const [numSwatches, setNumSwatches] = useState(12); // Number of visible swatches (excluding white and black)
  const [harmonizingScale, setHarmonizingScale] = useState(null);
  const [previewColorsByFamily, setPreviewColorsByFamily] = useState(null); // Store preview colors grouped by family
  const [selectedPreviews, setSelectedPreviews] = useState(new Set()); // Set of selected previews like "purple-0", "yellow-2"
  const [isGenerating, setIsGenerating] = useState(false); // Loading state for API calls
  const [baseColorScaleId, setBaseColorScaleId] = useState(null); // Which color scale to use as base for harmonious colors
  const [selectedHarmoniousFamilies, setSelectedHarmoniousFamilies] = useState(new Set()); // Selected color families for harmonious colors
  const [desaturatedScales, setDesaturatedScales] = useState(new Set()); // Set of scale IDs that are in desaturate/luminance mode
  const [isComparisonDesaturated, setIsComparisonDesaturated] = useState(false); // Whether all scales in comparison section are in desaturate/luminance mode
  const [shareUrl, setShareUrl] = useState('');
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [useLightnessNumbering, setUseLightnessNumbering] = useState(true); // Toggle between sequential (100, 200...) and lightness-based (98, 90, 80...) numbering
  const [customIncrement, setCustomIncrement] = useState(10); // Custom increment for sequential numbering (e.g., 10 for 10, 20, 30...)
  const [useCustomIncrement, setUseCustomIncrement] = useState(false); // Whether to use custom increment instead of 100
  const [showVisualControls, setShowVisualControls] = useState(false); // Toggle to show/hide visual sliders and bezier canvas
  const [useColorTheory, setUseColorTheory] = useState(true); // Toggle between color theory and API-based generation
  const [showColorFamilies, setShowColorFamilies] = useState(false); // Toggle to show/hide color families section
  const [showSwatchBorders, setShowSwatchBorders] = useState(true); // Toggle swatch borders on/off
  const [swatchBackground, setSwatchBackground] = useState('#ffffff'); // Background color for swatch section
  const [dragState, setDragState] = useState(null); // For drag-to-change number inputs
  const [theme, setTheme] = useState('light'); // Theme mode: 'light' or 'dark'
  const [viewMode, setViewMode] = useState('default'); // View mode: 'default' or 'simple'
  const [displayMode, setDisplayMode] = useState('color'); // Display mode: 'color' or 'luminance'

  // Sync swatch background with theme changes
  useEffect(() => {
    setSwatchBackground(theme === 'light' ? '#ffffff' : '#000000');
  }, [theme]);
  const [contrastCheck, setContrastCheck] = useState('off'); // Contrast check: 'off', 'aa', or 'apca'
  const [contrastColor1, setContrastColor1] = useState('#ffffff'); // First custom contrast test color (default white)
  const [contrastColor2, setContrastColor2] = useState('#000000'); // Second custom contrast test color (default black)
  const miniCanvasRefs = useRef({});
  const colorFamiliesPanelRef = useRef(null);
  const previewPanelRef = useRef(null);
  const addColorScaleButtonRef = useRef(null);

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

  // Calculate relative luminance for WCAG contrast
  const getRelativeLuminance = (r, g, b) => {
    const rsRGB = r / 255;
    const gsRGB = g / 255;
    const bsRGB = b / 255;

    const r_linear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const g_linear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const b_linear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

    return 0.2126 * r_linear + 0.7152 * g_linear + 0.0722 * b_linear;
  };

  // Calculate WCAG AA contrast ratio
  const getContrastRatio = (hex1, hex2) => {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    if (!rgb1 || !rgb2) return 1;

    const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);

    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
  };

  // Calculate APCA contrast (simplified version)
  const getAPCAContrast = (textHex, bgHex) => {
    const textRgb = hexToRgb(textHex);
    const bgRgb = hexToRgb(bgHex);
    if (!textRgb || !bgRgb) return 0;

    // Get Y (luminance) values
    const textY = getRelativeLuminance(textRgb.r, textRgb.g, textRgb.b);
    const bgY = getRelativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b);

    // APCA constants
    const blkThrs = 0.022;
    const blkClmp = 1.414;
    const scaleBoW = 1.14;
    const scaleWoB = 1.14;
    const normBG = 0.56;
    const normTXT = 0.57;
    const revTXT = 0.62;
    const revBG = 0.65;

    // Soft clamp
    const Ytxt = textY >= blkThrs ? textY : textY + Math.pow(blkThrs - textY, blkClmp);
    const Ybg = bgY >= blkThrs ? bgY : bgY + Math.pow(blkThrs - bgY, blkClmp);

    let SAPC;
    if (Ybg > Ytxt) {
      // Light background, dark text (negative polarity)
      SAPC = (Math.pow(Ybg, normBG) - Math.pow(Ytxt, normTXT)) * scaleBoW;
    } else {
      // Dark background, light text (positive polarity)
      SAPC = (Math.pow(Ybg, revBG) - Math.pow(Ytxt, revTXT)) * scaleWoB;
    }

    // Return absolute value as Lc (contrast lightness)
    return Math.abs(SAPC * 100);
  };

  // Get friendly name for common colors, otherwise return hex
  const getColorName = (hex) => {
    const colorNames = {
      '#ffffff': 'White',
      '#000000': 'Black',
      '#ff0000': 'Red',
      '#00ff00': 'Lime',
      '#0000ff': 'Blue',
      '#ffff00': 'Yellow',
      '#00ffff': 'Cyan',
      '#ff00ff': 'Magenta',
      '#c0c0c0': 'Silver',
      '#808080': 'Gray',
      '#800000': 'Maroon',
      '#808000': 'Olive',
      '#008000': 'Green',
      '#800080': 'Purple',
      '#008080': 'Teal',
      '#000080': 'Navy'
    };

    const normalized = hex.toLowerCase();
    return colorNames[normalized] || hex.toUpperCase();
  };

  // Tooltip content generators for contrast values
  const getAATooltipContent = (contrastValue, textColor, currentTheme) => {
    const passes3 = contrastValue >= 3;
    const passes4_5 = contrastValue >= 4.5;
    const passes7 = contrastValue >= 7;

    // Light mode: dark tooltip bg, needs light text
    // Dark mode: light tooltip bg, needs dark text
    const headingClass = currentTheme === 'light' ? 'text-white' : 'text-gray-900';
    const subheadingClass = currentTheme === 'light' ? 'text-gray-100' : 'text-gray-800';
    const passClass = currentTheme === 'light' ? 'text-emerald-300' : 'text-emerald-700';
    const failClass = currentTheme === 'light' ? 'text-gray-400' : 'text-gray-500';

    const colorName = getColorName(textColor);

    return (
      <div className="p-2 max-w-xs">
        <div className={`font-semibold mb-2 ${headingClass}`}>
          {colorName} Text: {contrastValue.toFixed(1)}:1
        </div>
        <div className="text-xs space-y-1">
          <div className={`font-medium mb-1 ${subheadingClass}`}>WCAG 2.0 Level AA:</div>
          <div className={passes3 ? passClass : failClass}>
            {passes3 ? '✓' : '✗'} Large text (18pt+): 3:1
          </div>
          <div className={passes4_5 ? passClass : failClass}>
            {passes4_5 ? '✓' : '✗'} Normal text: 4.5:1
          </div>
          <div className={`font-medium mt-2 mb-1 ${subheadingClass}`}>WCAG 2.0 Level AAA:</div>
          <div className={passes4_5 ? passClass : failClass}>
            {passes4_5 ? '✓' : '✗'} Large text: 4.5:1
          </div>
          <div className={passes7 ? passClass : failClass}>
            {passes7 ? '✓' : '✗'} Normal text: 7:1
          </div>
        </div>
      </div>
    );
  };

  const getAPCATooltipContent = (contrastValue, textColor, currentTheme) => {
    const thresholds = [
      { label: 'Non-text Elements', value: 15, category: 'use' },
      { label: 'Spot Text', value: 30, category: 'use' },
      { label: 'Headlines', value: 45, category: 'use' },
      { label: 'Content Text', value: 60, category: 'use' },
      { label: 'Body Text', value: 75, category: 'avoid' },
      { label: 'Fluent Text', value: 90, category: 'avoid' }
    ];

    const useFor = thresholds.filter(t => t.category === 'use' && contrastValue >= t.value);
    const avoidFor = thresholds.filter(t => t.category === 'avoid' && contrastValue < t.value);

    const headingClass = currentTheme === 'light' ? 'text-white' : 'text-gray-900';
    const subheadingClass = currentTheme === 'light' ? 'text-gray-100' : 'text-gray-800';

    const colorName = getColorName(textColor);

    return (
      <div className="p-2 max-w-xs">
        <div className={`font-semibold mb-2 ${headingClass}`}>
          {colorName} Text: Lc {contrastValue.toFixed(0)}
        </div>

        {useFor.length > 0 && (
          <div className="mb-2">
            <div className={`text-xs font-medium mb-1 ${subheadingClass}`}>Use for:</div>
            <div className="flex flex-wrap gap-1">
              {useFor.map(t => (
                <span key={t.label} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-700 text-white">
                  {t.label} (Lc {t.value})
                </span>
              ))}
            </div>
          </div>
        )}

        {avoidFor.length > 0 && (
          <div>
            <div className={`text-xs font-medium mb-1 ${subheadingClass}`}>Avoid for:</div>
            <div className="flex flex-wrap gap-1">
              {avoidFor.map(t => (
                <span key={t.label} className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white">
                  {t.label} (Lc {t.value})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const getNATooltipContent = (contrastValue, textColor, mode, currentTheme) => {
    const warningClass = currentTheme === 'light' ? 'text-orange-300' : 'text-orange-700';
    const primaryClass = currentTheme === 'light' ? 'text-gray-100' : 'text-gray-900';
    const secondaryClass = currentTheme === 'light' ? 'text-gray-300' : 'text-gray-700';

    const colorName = getColorName(textColor);

    return (
      <div className="p-2 max-w-xs">
        <div className={`font-semibold mb-2 ${warningClass}`}>
          {colorName} Text: Below Threshold
        </div>
        <div className={`text-xs mb-2 ${primaryClass}`}>
          {mode === 'aa'
            ? `Contrast: ${contrastValue.toFixed(1)}:1 (needs 4.5:1)`
            : `Lc ${contrastValue.toFixed(0)} (needs 60+)`
          }
        </div>
        <div className={`text-xs ${secondaryClass}`}>
          This color doesn't meet minimum accessibility standards for text.
          Consider using it for decorative elements only.
        </div>
      </div>
    );
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

  // Check if any color scale has saturation >= 1%
  const hasAnySaturatedColors = () => {
    // Early return if no color scales exist
    if (!colorScales || colorScales.length === 0) {
      return false;
    }

    // Iterate through all color scales
    for (const scale of colorScales) {
      // Skip if hex is invalid or missing
      if (!scale.hex) {
        continue;
      }

      // Convert hex to RGB
      const rgb = hexToRgb(scale.hex);

      // Skip if conversion failed
      if (!rgb) {
        continue;
      }

      // Convert RGB to HSL
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

      // Check if saturation is >= 0.01 (1% on 0-1 scale)
      if (hsl.s >= 0.01) {
        return true;
      }
    }

    // No saturated colors found
    return false;
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
    ctx.strokeStyle = theme === 'light' ? '#e5e5e5' : '#2a2a2a';
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
    ctx.strokeStyle = theme === 'light' ? '#999' : '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, rect.height - padding);
    ctx.lineTo(padding + graphWidth, rect.height - padding);
    ctx.lineTo(padding + graphWidth, padding);
    ctx.stroke();

    // Linear reference
    ctx.strokeStyle = theme === 'light' ? '#bbb' : '#555';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, rect.height - padding);
    ctx.lineTo(padding + graphWidth, padding);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bezier curve
    ctx.strokeStyle = '#a4a4a4';
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

    ctx.strokeStyle = theme === 'light' ? '#999' : '#666';
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

    ctx.fillStyle = '#a4a4a4';
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#757575';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Labels
    ctx.fillStyle = theme === 'light' ? '#666' : '#999';
    ctx.font = '12px sans-serif';
    ctx.fillText('Input (0-1)', rect.width / 2 - 30, rect.height - 20);
    ctx.save();
    ctx.translate(20, rect.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Output (0-1)', -40, 0);
    ctx.restore();

    ctx.fillStyle = '#a4a4a4';
    ctx.font = '14px monospace';
    ctx.fillText(`P1 (${cp1.x.toFixed(2)}, ${cp1.y.toFixed(2)})`, p1.x + 15, p1.y - 10);
    ctx.fillText(`P2 (${cp2.x.toFixed(2)}, ${cp2.y.toFixed(2)})`, p2.x + 15, p2.y - 10);
  }, [cp1, cp2, showVisualControls, theme]);

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

  // Drag-to-change number input handlers
  const handleNumberDragStart = (e, value, setValue, min, max, step = 1) => {
    e.preventDefault();
    setDragState({
      startX: e.clientX,
      startValue: value,
      setValue,
      min,
      max,
      step
    });
    document.body.style.cursor = 'ew-resize';
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e) => {
      const delta = (e.clientX - dragState.startX) * dragState.step;
      const newValue = Math.min(dragState.max, Math.max(dragState.min, dragState.startValue + delta));
      dragState.setValue(dragState.step < 1 ? parseFloat(newValue.toFixed(2)) : Math.round(newValue));
    };

    const handleMouseUp = () => {
      setDragState(null);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState]);

  const harmonizeWithColor = (targetScaleId, baseScaleId, method = 'direct') => {
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

    // Preserve the target's hue
    const harmonizedHue = targetHsl.h;

    // Apply different color theory methods
    let harmonizedSaturation, harmonizedLightness;

    switch (method) {
      case 'direct':
        // Direct Match - Exactly match base saturation and lightness
        harmonizedSaturation = baseHsl.s;
        harmonizedLightness = baseHsl.l;
        break;

      case 'complementary':
        // Complementary - Match saturation but invert lightness
        harmonizedSaturation = baseHsl.s;
        harmonizedLightness = 1 - baseHsl.l;
        break;

      case 'analogous':
        // Analogous - Match saturation, slightly lighter
        harmonizedSaturation = baseHsl.s * 0.9;
        harmonizedLightness = Math.min(0.95, baseHsl.l + 0.1);
        break;

      case 'triadic':
        // Triadic - Boost saturation for vibrancy
        harmonizedSaturation = Math.min(1, baseHsl.s * 1.2);
        harmonizedLightness = baseHsl.l;
        break;

      case 'monochromatic':
        // Monochromatic - Match saturation, darken for depth
        harmonizedSaturation = baseHsl.s;
        harmonizedLightness = Math.max(0.2, baseHsl.l - 0.2);
        break;

      default:
        // Fallback to direct match
        harmonizedSaturation = baseHsl.s;
        harmonizedLightness = baseHsl.l;
    }

    // Convert back to RGB and hex
    const harmonizedRgb = hslToRgb(harmonizedHue, harmonizedSaturation, harmonizedLightness);
    const harmonizedHex = rgbToHex(harmonizedRgb.r, harmonizedRgb.g, harmonizedRgb.b);

    console.log('Harmonized color:', harmonizedHex, 'HSL:', { h: harmonizedHue, s: harmonizedSaturation, l: harmonizedLightness });

    // Update both the hex color AND store original (if not already stored) in a single state update
    setColorScales(colorScales.map(cs => {
      if (cs.id === targetScaleId) {
        return {
          ...cs,
          hex: harmonizedHex,
          preHarmonizeHex: cs.preHarmonizeHex || cs.hex // Store original if not already stored
        };
      }
      return cs;
    }));

    setHarmonizingScale(null);
  };

  const revertHarmonize = (scaleId) => {
    const scale = colorScales.find(cs => cs.id === scaleId);
    if (!scale || !scale.preHarmonizeHex) return;

    // Restore original color and clear the stored value in a single state update
    setColorScales(colorScales.map(cs =>
      cs.id === scaleId
        ? { ...cs, hex: scale.preHarmonizeHex, preHarmonizeHex: null }
        : cs
    ));
    setHarmonizingScale(null);
  };

  // API-based generation (original implementation)
  const generateHarmoniousColorsAPI = async () => {
    // Get selected color families
    const selectedFamilies = Array.from(selectedHarmoniousFamilies);

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

  // Color theory-based generation (new implementation)
  const generateHarmoniousColorsTheory = () => {
    // Get selected color families
    const selectedFamilies = Array.from(selectedHarmoniousFamilies);

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

    // Use selected base color or default to first color scale
    const baseScale = baseColorScaleId
      ? colorScales.find(cs => cs.id === baseColorScaleId)
      : colorScales[0];

    if (!baseScale) {
      alert('Please create a color scale first');
      setIsGenerating(false);
      return;
    }

    const baseRgb = hexToRgb(baseScale.hex);
    const baseHsl = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);

    const colorsByFamily = {};

    // Color theory methods with metadata
    const colorTheoryMethods = [
      {
        name: 'Direct Match',
        description: 'Matches saturation and lightness of base color',
        apply: (targetHue, isGray) => {
          const saturation = isGray ? 0.03 : baseHsl.s;
          const lightness = baseHsl.l;
          return { h: targetHue, s: saturation, l: lightness };
        }
      },
      {
        name: 'Complementary',
        description: 'Inverts lightness for complementary contrast',
        apply: (targetHue, isGray) => {
          const saturation = isGray ? 0.03 : baseHsl.s;
          const lightness = 1 - baseHsl.l; // Invert lightness
          return { h: targetHue, s: saturation, l: lightness };
        }
      },
      {
        name: 'Analogous',
        description: 'Slightly lighter/darker for subtle harmony',
        apply: (targetHue, isGray) => {
          const saturation = isGray ? 0.03 : baseHsl.s * 0.9; // Slightly reduce saturation
          const lightness = Math.min(0.95, baseHsl.l + 0.1); // Slightly lighter
          return { h: targetHue, s: saturation, l: lightness };
        }
      },
      {
        name: 'Triadic',
        description: 'Boosts saturation for vibrant triadic balance',
        apply: (targetHue, isGray) => {
          const saturation = isGray ? 0.03 : Math.min(1, baseHsl.s * 1.2); // Boost saturation
          const lightness = baseHsl.l;
          return { h: targetHue, s: saturation, l: lightness };
        }
      },
      {
        name: 'Monochromatic',
        description: 'Darkens while keeping saturation for depth',
        apply: (targetHue, isGray) => {
          const saturation = isGray ? 0.03 : baseHsl.s;
          const lightness = Math.max(0.2, baseHsl.l - 0.2); // Darker
          return { h: targetHue, s: saturation, l: lightness };
        }
      }
    ];

    for (const family of selectedFamilies) {
      const targetHue = colorFamilyHues[family];
      const isGray = family === 'warm-gray' || family === 'cool-gray';
      const familyOptions = [];

      // Generate 5 options using different color theory methods
      colorTheoryMethods.forEach(method => {
        const hsl = method.apply(targetHue, isGray);
        const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

        // Store hex with metadata
        familyOptions.push({
          hex,
          method: method.name,
          description: method.description
        });
      });

      colorsByFamily[family] = familyOptions;
    }

    setPreviewColorsByFamily(colorsByFamily);
    setIsGenerating(false);
  };

  // Wrapper function that calls the appropriate implementation
  const generateHarmoniousColors = () => {
    if (useColorTheory) {
      generateHarmoniousColorsTheory();
    } else {
      generateHarmoniousColorsAPI();
    }
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
      const colorData = previewColorsByFamily[family][optionIndex];

      // Handle both formats: string (API) or object with hex property (color theory)
      const hex = typeof colorData === 'string' ? colorData : colorData.hex;

      // Check if a scale with this family name already exists
      const existingNames = [...colorScales, ...newScales].map(cs => cs.name);
      const nameExists = existingNames.some(name => name === family || name.startsWith(`${family}-`));
      const scaleName = nameExists ? `${family}-${nextColorId + scaleIndex + 1}` : family;

      const newScale = {
        id: nextColorId + scaleIndex,
        name: scaleName,
        hex: hex,
        isExpanded: false,
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
        cp2: { x: 0.50, y: 0.60 },
        isSingleColor: false,
        swatchCountOverride: null,
        includeAnchors: false
      };
      newScales.push(newScale);
      scaleIndex++;
    });

    setColorScales([...colorScales, ...newScales]);
    setNextColorId(nextColorId + newScales.length);
    setPreviewColorsByFamily(null);
    setSelectedPreviews(new Set());
    setSelectedHarmoniousFamilies(new Set()); // Clear selected families
    setShowColorFamilies(false); // Close the color families section
  };

  const cancelPreview = () => {
    setPreviewColorsByFamily(null);
    setSelectedPreviews(new Set());
    setShowColorFamilies(false);
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
      numSwatches,
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
      if (state.colorScales) {
        // Collapse all scales on load for cleaner initial view
        const collapsedScales = state.colorScales.map(cs => ({ ...cs, isExpanded: false }));
        setColorScales(collapsedScales);
      }
      if (state.nextColorId !== undefined) setNextColorId(state.nextColorId);
      if (state.numSwatches !== undefined) setNumSwatches(state.numSwatches);
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

  // Helper function to find nearest HTML color name
  const getNearestColorName = (hex) => {
    const colorNames = {
      red: '#ef4444',
      rose: '#f43f5e',
      pink: '#ec4899',
      fuchsia: '#d946ef',
      purple: '#a855f7',
      violet: '#8b5cf6',
      indigo: '#6366f1',
      blue: '#a4a4a4',
      sky: '#0ea5e9',
      cyan: '#06b6d4',
      teal: '#14b8a6',
      emerald: '#10b981',
      green: '#22c55e',
      lime: '#84cc16',
      yellow: '#eab308',
      amber: '#f59e0b',
      orange: '#f97316',
      'warm-gray': '#a8a29e',
      'cool-gray': '#9ca3af',
      gray: '#6b7280',
      slate: '#64748b',
      zinc: '#71717a',
      neutral: '#737373',
      stone: '#78716c'
    };

    // Convert hex to RGB
    const targetRgb = hexToRgb(hex);

    let nearestName = 'color';
    let minDistance = Infinity;

    Object.entries(colorNames).forEach(([name, colorHex]) => {
      const rgb = hexToRgb(colorHex);
      // Calculate Euclidean distance in RGB space
      const distance = Math.sqrt(
        Math.pow(rgb.r - targetRgb.r, 2) +
        Math.pow(rgb.g - targetRgb.g, 2) +
        Math.pow(rgb.b - targetRgb.b, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestName = name;
      }
    });

    return nearestName;
  };

  const addColorScale = () => {
    // Generate random color with good saturation and medium lightness
    const hue = Math.floor(Math.random() * 360);
    const saturation = 0.70 + Math.random() * 0.20; // 70-90%
    const lightness = 0.45 + Math.random() * 0.20; // 45-65%
    const rgb = hslToRgb(hue, saturation, lightness);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    const baseName = getNearestColorName(hex);

    // Check if a scale with this name already exists
    const existingNames = colorScales.map(cs => cs.name);
    const nameExists = existingNames.some(name => name === baseName || name.startsWith(`${baseName}-`));
    const scaleName = nameExists ? `${baseName}-${nextColorId + 1}` : baseName;

    const newScale = {
      id: nextColorId,
      name: scaleName,
      hex: hex,
      isExpanded: false,
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
      cp2: { x: 0.50, y: 0.60 },
      isSingleColor: false,
      swatchCountOverride: null,
      preHarmonizeHex: null, // Store original color before harmonizing
      includeAnchors: false
    };
    setColorScales([...colorScales, newScale]);
    setNextColorId(nextColorId + 1);

    // Scroll to show the Add color scale button
    setTimeout(() => {
      addColorScaleButtonRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 50);
  };

  const removeColorScale = (id) => {
    setColorScales(colorScales.filter(cs => cs.id !== id));
  };

  // Helper function to determine effective swatch count for a scale
  const getEffectiveSwatchCount = (cs) => {
    if (cs.isSingleColor) {
      return 1; // Force 1 swatch for single color mode
    }
    if (cs.swatchCountOverride !== null) {
      return cs.swatchCountOverride; // Use per-scale override
    }
    return numSwatches; // Use global setting
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

  // Toggle single color mode for a scale
  const toggleSingleColorMode = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, isSingleColor: !cs.isSingleColor } : cs
    ));
  };

  // Update per-scale swatch count override
  const updateSwatchCountOverride = (id, value) => {
    const count = parseInt(value) || null;
    setColorScales(colorScales.map(cs =>
      cs.id === id ? {
        ...cs,
        swatchCountOverride: (count >= 1 && count <= 20) ? count : null
      } : cs
    ));
  };

  // Clear swatch count override, revert to global
  const clearSwatchCountOverride = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, swatchCountOverride: null } : cs
    ));
  };

  const updateColorScaleHex = (id, hex) => {
    setColorScales(colorScales.map(cs => {
      if (cs.id !== id) return cs;

      // Get the nearest color name for the new hex
      const baseName = getNearestColorName(hex);

      // Check if a scale with this name already exists (excluding current scale)
      const existingNames = colorScales.filter(s => s.id !== id).map(s => s.name);
      const nameExists = existingNames.some(name => name === baseName || name.startsWith(`${baseName}-`));
      const newName = nameExists ? `${baseName}-${id + 1}` : baseName;

      return { ...cs, hex, name: newName };
    }));
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

  const toggleIncludeAnchors = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, includeAnchors: !cs.includeAnchors } : cs
    ));
  };

  const toggleScaleExpanded = (id) => {
    setColorScales(colorScales.map(cs =>
      cs.id === id ? { ...cs, isExpanded: !cs.isExpanded } : cs
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

  // Import Figma Tokens JSON
  const importFigmaTokens = (jsonContent) => {
    try {
      const parsed = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
      const colorData = parsed.color;

      if (!colorData) {
        console.error('No color data found in JSON');
        return;
      }

      const newScales = [];
      const nextId = colorScales.length > 0 ? Math.max(...colorScales.map(cs => cs.id)) + 1 : 0;

      Object.entries(colorData).forEach(([colorName, swatches], index) => {
        // Get all swatch entries and calculate their L* values
        const swatchEntries = Object.entries(swatches)
          .map(([step, data]) => {
            const rgb = hexToRgb(data.value);
            const lstar = rgbToLstar(rgb.r, rgb.g, rgb.b);
            return {
              step: parseInt(step),
              hex: data.value,
              lstar: lstar
            };
          })
          // Sort by L* value descending (lightest first)
          .sort((a, b) => b.lstar - a.lstar);

        // Use the middle swatch as the base color (or find 600/700 in original step numbers)
        const baseSwatchIndex = swatchEntries.findIndex(s => s.step === 600 || s.step === 700);
        const baseHex = baseSwatchIndex !== -1
          ? swatchEntries[baseSwatchIndex].hex
          : swatchEntries[Math.floor(swatchEntries.length / 2)].hex;

        // Create customSwatches object keyed by index (not step number)
        // Sorted by L* so lightest imported color goes to lightest position
        const customSwatches = {};
        swatchEntries.forEach(({ hex }, index) => {
          customSwatches[index] = hex;
        });

        // Determine swatch count (number of tokens)
        const swatchCount = swatchEntries.length;

        // Create new color scale
        const newScale = {
          id: nextId + index,
          name: colorName,
          hex: baseHex,
          isSingleColor: false,
          lockKeyColor: false,
          swatchCountOverride: swatchCount,
          useCustomLstarRange: false,
          lstarMin: 10,
          lstarMax: 98,
          desaturate: colorName.includes('gray') || colorName.includes('neutral'),
          saturationMultiplier: 1.0,
          hueShiftDark: 0,
          hueShiftLight: 0,
          customSwatches: customSwatches,
          cp1: { x: 0.33, y: 0.00 },
          cp2: { x: 0.50, y: 0.60 },
          preHarmonizeHex: null,
          includeAnchors: false
        };

        newScales.push(newScale);
      });

      // Add new scales to state
      setColorScales([...colorScales, ...newScales]);

    } catch (error) {
      console.error('Error importing Figma Tokens:', error);
    }
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
  const drawMiniCanvas = (canvasId, cp1, cp2, currentTheme = theme) => {
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
    ctx.strokeStyle = currentTheme === 'light' ? '#e5e5e5' : '#2a2a2a';
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
    ctx.strokeStyle = '#a4a4a4';
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

    ctx.strokeStyle = currentTheme === 'light' ? '#999' : '#666';
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

    ctx.fillStyle = '#a4a4a4';
    ctx.strokeStyle = '#757575';
    ctx.lineWidth = 2;

    [p1, p2].forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Start/end points
    ctx.fillStyle = currentTheme === 'light' ? '#999' : '#666';
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

  // Scroll color families panel into view when opened
  useEffect(() => {
    if (showColorFamilies && colorFamiliesPanelRef.current) {
      setTimeout(() => {
        colorFamiliesPanelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 350); // Wait for accordion animation to complete (320ms)
    }
  }, [showColorFamilies]);

  // Scroll preview panel into view when it appears
  useEffect(() => {
    if (previewColorsByFamily && !isGenerating && previewPanelRef.current) {
      setTimeout(() => {
        previewPanelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 100); // Small delay to allow animation to start
    }
  }, [previewColorsByFamily, isGenerating]);

  // Export to Figma Tokens format
  const exportToFigmaTokens = () => {
    const tokens = {
      color: {}
    };

    // Add all color scales (including gray scale)
    colorScales.forEach(cs => {
      const effectiveSwatchCount = getEffectiveSwatchCount(cs);

      // Handle single colors differently
      if (cs.isSingleColor) {
        // Single color: export as color.name without step number
        tokens.color[cs.name] = {
          value: cs.hex,
          type: "color"
        };
      } else {
        // Regular scale generation
        const tempSteps = effectiveSwatchCount + 2;
        const values = [];

        for (let i = 0; i < tempSteps; i++) {
          let hex, lstar;

          if (i === 0) {
            hex = '#ffffff';
            lstar = 100;
          } else if (i === tempSteps - 1) {
            hex = '#000000';
            lstar = 0;
          } else {
            const t = i / (tempSteps - 1);
            const easedT = cs.useCustomBezier
              ? getBezierYWithPoints(t, cs.cp1, cs.cp2)
              : getBezierY(t);
            const lstarMin = (cs.useCustomLstarRange === true) ? cs.lstarMin : globalLstarMin;
            const lstarMax = (cs.useCustomLstarRange === true) ? cs.lstarMax : globalLstarMax;
            lstar = lstarMax - easedT * (lstarMax - lstarMin);
            hex = getColorAtLightness(cs.hex, lstar, lstarMin, lstarMax, cs.saturationMin, cs.saturationMax, cs.hueShiftDark, cs.hueShiftLight);
          }

          const step = (i + 1) * 100;
          values.push({ step, hex, lstar: lstar.toFixed(1) });
        }
        let scale = values;

        const keyColorIndex = findKeyColorIndex(scale, cs.hex);

        // If key color is locked, replace the closest swatch with exact hex
        if (cs.lockKeyColor && keyColorIndex >= 0) {
          scale[keyColorIndex] = {
            ...scale[keyColorIndex],
            hex: cs.hex
          };
        }

        // Remove white and black anchors (unless includeAnchors is enabled) and apply numbering
        scale = (() => {
          const sliced = cs.includeAnchors ? scale : scale.slice(1, -1);
          const lstarValues = sliced.map(s => s.lstar);
          const lstarMin = (cs.useCustomLstarRange === true) ? cs.lstarMin : globalLstarMin;
          const lstarMax = (cs.useCustomLstarRange === true) ? cs.lstarMax : globalLstarMax;
          const increment = useCustomIncrement ? customIncrement : 100;
          const steps = calculateStepFromLstar(lstarValues, useLightnessNumbering, lstarMin, lstarMax, increment);
          return sliced.map((swatch, i) => ({ ...swatch, step: steps[i] }));
        })();

        // Apply custom swatches AFTER slicing (keyed by step)
        scale.forEach((swatch, i) => {
          if (cs.customSwatches[swatch.step]) {
            scale[i] = {
              ...swatch,
              hex: cs.customSwatches[swatch.step],
              isCustom: true
            };
          }
        });

        tokens.color[cs.name] = {};
        scale.forEach(swatch => {
          tokens.color[cs.name][swatch.step] = {
            value: swatch.hex,
            type: "color"
          };
        });
      }
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
    <Theme appearance={theme} accentColor="gray">
      <div className={`min-h-screen p-8 ${theme === 'light' ? 'bg-warm-gray-200 text-neutral-1100' : 'bg-warm-gray-1100 text-gray-200'}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header with Title and Social Links */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className={`text-7xl font-bold mb-2 font-fraunces ${theme === 'light' ? 'text-neutral-1100' : 'text-white'}`}>Primitive color builder</h1>
            <p className={theme === 'light' ? 'text-neutral-700' : 'text-gray-500'}>Design harmonious app color palettes grounded in color theory</p>
          </div>

          {/* Social Media Links */}
          <div className="flex items-center gap-3 pt-2">
            <a
              href="https://github.com/beeblezep/color-scale-editor"
              target="_blank"
              rel="noopener noreferrer"
              className={`transition-opacity hover:opacity-70 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}
              aria-label="GitHub Repository"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>

            <a
              href="https://www.linkedin.com/in/craigmertan/"
              target="_blank"
              rel="noopener noreferrer"
              className={`transition-opacity hover:opacity-70 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}
              aria-label="LinkedIn Profile"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Action Buttons - Icon Only */}
        <div className="flex justify-end items-center gap-3 mb-4">
          <input
            type="file"
            accept=".json"
            id="import-figma-tokens"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  const content = event.target?.result;
                  if (content) {
                    importFigmaTokens(content);
                  }
                };
                reader.readAsText(file);
              }
            }}
          />
          <Tooltip content="Import JSON file">
            <button
              onClick={() => document.getElementById('import-figma-tokens')?.click()}
              className={`cardboard-icon-button w-9 h-9 rounded-md flex items-center justify-center ${
                theme === 'light'
                  ? 'bg-gray-100 text-neutral-900 border border-gray-300'
                  : 'bg-gray-1300 text-gray-400 border border-gray-1100'
              }`}
              aria-label="Import JSON file"
            >
              <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
                upload
              </span>
            </button>
          </Tooltip>

          <Tooltip content="Export as Figma Tokens JSON">
            <button
              onClick={exportToFigmaTokens}
              className={`cardboard-icon-button w-9 h-9 rounded-md flex items-center justify-center ${
                theme === 'light'
                  ? 'bg-gray-100 text-neutral-900 border border-gray-300'
                  : 'bg-gray-1300 text-gray-400 border border-gray-1100'
              }`}
              aria-label="Export as Figma Tokens JSON"
            >
              <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
                download
              </span>
            </button>
          </Tooltip>

          <Tooltip content="Copy shareable URL to clipboard">
            <button
              onClick={generateShareUrl}
              className={`cardboard-icon-button w-9 h-9 rounded-md flex items-center justify-center ${
                theme === 'light'
                  ? 'bg-gray-100 text-neutral-900 border border-gray-300'
                  : 'bg-gray-1300 text-gray-400 border border-gray-1100'
              }`}
              aria-label="Copy shareable URL to clipboard"
            >
              <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
                share
              </span>
            </button>
          </Tooltip>

          {showCopiedMessage && (
            <span className="text-xs text-emerald-500 font-medium animate-pulse">
              Copied!
            </span>
          )}
        </div>

        {/* Global Settings - Compact Input Controls */}
        <div className={`cardboard-panel rounded-xl p-6 mb-3 ${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-black border border-zinc-800'}`}>
          {/* Compact Controls Row */}
          <div className="flex flex-wrap items-center gap-6">
            {/* Theme Toggle */}
            <div className="flex items-center gap-2">
              <label className={`font-jetbrains-mono text-xs font-medium uppercase tracking-wider ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                Theme
              </label>
              <SegmentedControl.Root value={theme} onValueChange={setTheme} size="1">
                <SegmentedControl.Item value="light">Light</SegmentedControl.Item>
                <SegmentedControl.Item value="dark">Dark</SegmentedControl.Item>
              </SegmentedControl.Root>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2">
              <label className={`font-jetbrains-mono text-xs font-medium uppercase tracking-wider ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                View
              </label>
              <SegmentedControl.Root value={viewMode} onValueChange={setViewMode} size="1">
                <SegmentedControl.Item value="default">Full</SegmentedControl.Item>
                <SegmentedControl.Item value="simple">Minimal</SegmentedControl.Item>
              </SegmentedControl.Root>
            </div>

            {/* Contrast Check Toggle */}
            <div className="flex items-center gap-2">
              <Tooltip content={
                <div className="p-2 max-w-xs text-xs">
                  <div className={`font-semibold mb-2 ${theme === 'light' ? 'text-white' : 'text-gray-900'}`}>Contrast Checker</div>
                  <div className="space-y-2">
                    <div>
                      <span className={`font-medium ${theme === 'light' ? 'text-gray-100' : 'text-gray-800'}`}>AA:</span>
                      <span className={theme === 'light' ? 'text-gray-300' : 'text-gray-700'}> WCAG 2.0 contrast ratios (4.5:1 for normal text)</span>
                    </div>
                    <div>
                      <span className={`font-medium ${theme === 'light' ? 'text-gray-100' : 'text-gray-800'}`}>APCA:</span>
                      <span className={theme === 'light' ? 'text-gray-300' : 'text-gray-700'}> Advanced Perceptual Contrast Algorithm (Lc 60+ for content text)</span>
                    </div>
                  </div>
                </div>
              }>
                <label className={`font-jetbrains-mono text-xs font-medium uppercase tracking-wider cursor-help ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                  Text contrast
                </label>
              </Tooltip>
              <SegmentedControl.Root value={contrastCheck} onValueChange={setContrastCheck} size="1">
                <SegmentedControl.Item value="off">Off</SegmentedControl.Item>
                <SegmentedControl.Item value="aa">AA</SegmentedControl.Item>
                <SegmentedControl.Item value="apca">APCA</SegmentedControl.Item>
              </SegmentedControl.Root>
            </div>

            {/* Contrast Test Colors - Only show when contrast checking is enabled */}
            <AnimatePresence>
            {contrastCheck !== 'off' && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                className="flex items-center gap-2 overflow-hidden"
              >
                <label className={`font-jetbrains-mono text-xs font-medium uppercase tracking-wider ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                  Text Colors
                </label>
                <div className="flex items-center gap-1.5">
                  <Tooltip content="First text color to test (default: white)">
                    <input
                      type="color"
                      value={contrastColor1}
                      onChange={(e) => setContrastColor1(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border border-gray-300"
                      title="Color 1"
                    />
                  </Tooltip>
                  <Tooltip content="Second text color to test (default: black)">
                    <input
                      type="color"
                      value={contrastColor2}
                      onChange={(e) => setContrastColor2(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border border-gray-300"
                      title="Color 2"
                    />
                  </Tooltip>
                </div>
              </motion.div>
            )}
            </AnimatePresence>

            {/* Display Mode Toggle */}
            <div className="flex items-center gap-2">
              <label className={`font-jetbrains-mono text-xs font-medium uppercase tracking-wider ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                Display
              </label>
              <SegmentedControl.Root
                value={displayMode}
                onValueChange={(value) => {
                  setDisplayMode(value);
                  // Update desaturatedScales based on display mode
                  if (value === 'luminance') {
                    setDesaturatedScales(new Set(colorScales.map(cs => cs.id)));
                  } else {
                    setDesaturatedScales(new Set());
                  }
                }}
                size="1"
              >
                <SegmentedControl.Item value="color">Color</SegmentedControl.Item>
                <SegmentedControl.Item value="luminance">Luminance</SegmentedControl.Item>
              </SegmentedControl.Root>
            </div>

            {/* Swatches Count */}
            <div className="flex items-center gap-2">
              <label
                className={`font-jetbrains-mono text-xs font-medium uppercase tracking-wider cursor-ew-resize select-none ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}
                onMouseDown={(e) => handleNumberDragStart(e, numSwatches, setNumSwatches, 4, 20, 1)}
                title="Drag to change"
              >
                Swatch count
              </label>
              <input
                type="number"
                value={numSwatches}
                onChange={(e) => setNumSwatches(Math.max(4, Math.min(20, parseInt(e.target.value) || 12)))}
                min="4"
                max="20"
                className={`font-jetbrains-mono w-14 px-2 py-1 rounded-md text-xs focus:outline-none ${
                  theme === 'light'
                    ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                    : 'bg-black border border-zinc-700 focus:border-zinc-600'
                }`}
              />
            </div>

            {/* Swatch Borders */}
            <button
              onClick={() => setShowSwatchBorders(!showSwatchBorders)}
              className={`font-jetbrains-mono px-2.5 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                theme === 'light'
                  ? 'bg-gray-200 text-gray-900 border border-gray-400 hover:bg-gray-300'
                  : 'bg-gray-1200 text-gray-400 border border-gray-1000 hover:bg-gray-1100'
              }`}
            >
              <span className={`material-symbols-rounded text-[16px] ${theme === 'light' ? 'text-gray-1200' : 'text-white'}`} style={{ fontVariationSettings: `'FILL' ${showSwatchBorders ? 1 : 0}` }}>
                border_all
              </span>
              Swatch borders
            </button>

            {/* Swatch Background Color */}
            <div className="flex items-center gap-2">
              <label className={`font-jetbrains-mono text-xs font-medium ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                Swatch BG
              </label>
              <input
                type="color"
                value={swatchBackground}
                onChange={(e) => setSwatchBackground(e.target.value)}
                className={`w-8 h-[26px] rounded cursor-pointer ${
                  theme === 'light'
                    ? 'border border-gray-300 bg-white'
                    : 'border border-zinc-700 bg-black'
                }`}
              />
              <input
                type="text"
                value={swatchBackground}
                onChange={(e) => {
                  const value = e.target.value.trim();
                  if (/^#[0-9A-Fa-f]{6}$/.test(value) || /^#[0-9A-Fa-f]{3}$/.test(value)) {
                    setSwatchBackground(value);
                  }
                }}
                className={`font-jetbrains-mono w-20 px-2 py-1 rounded text-xs focus:outline-none ${
                  theme === 'light'
                    ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                    : 'bg-black border border-zinc-700 text-gray-200 focus:border-zinc-600'
                }`}
              />
            </div>

            {/* Token Numbering */}
            <div className="flex items-center gap-3">
              <label className={`font-jetbrains-mono text-xs font-medium uppercase tracking-wider ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                Token numbering
              </label>
              <SegmentedControl.Root
                value={useLightnessNumbering ? 'lightness' : 'sequential'}
                onValueChange={(newValue) => {
                  setUseLightnessNumbering(newValue === 'lightness');
                }}
                size="1"
              >
                <SegmentedControl.Item value="lightness">
                  Lightness
                </SegmentedControl.Item>
                <SegmentedControl.Item value="sequential">
                  Sequential
                </SegmentedControl.Item>
              </SegmentedControl.Root>
              <div
                className="overflow-hidden"
                style={{
                  display: !useLightnessNumbering ? 'block' : 'none',
                  maxHeight: !useLightnessNumbering ? '200px' : '0',
                  opacity: !useLightnessNumbering ? 1 : 0,
                  marginTop: !useLightnessNumbering ? '0' : '0',
                  transition: `all ${!useLightnessNumbering ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${!useLightnessNumbering ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
                }}
              >
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer ml-2">
                    <Checkbox
                      checked={useCustomIncrement}
                      onCheckedChange={(checked) => setUseCustomIncrement(checked)}
                      size="1"
                      data-checkbox-type="regular"
                    />
                    <span className={`font-jetbrains-mono text-xs font-medium ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Custom:</span>
                  </label>
                  <input
                    type="number"
                    value={customIncrement}
                    onChange={(e) => setCustomIncrement(Math.max(1, parseInt(e.target.value) || 10))}
                    disabled={!useCustomIncrement}
                    min="1"
                    max="1000"
                    className={`font-jetbrains-mono w-16 px-2 py-1 rounded-md text-xs focus:outline-none ${
                      theme === 'light'
                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                        : 'bg-black border border-zinc-700 focus:border-zinc-600'
                    } ${!useCustomIncrement ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>
            </div>

            {/* Advanced */}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Switch
                checked={showVisualControls}
                onCheckedChange={() => setShowVisualControls(!showVisualControls)}
                className="scale-75"
              />
              <span className={`font-jetbrains-mono text-xs ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Advanced</span>
            </label>
          </div>

          {/* Visual Controls - Sliders and Canvas */}
          <div
            className="overflow-hidden"
            style={{
              maxHeight: showVisualControls ? '800px' : '0',
              opacity: showVisualControls ? 1 : 0,
              marginTop: showVisualControls ? '24px' : '0',
              transition: `all ${showVisualControls ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${showVisualControls ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
            }}
          >
            <div className="pt-6 space-y-6">
              {/* P1, P2, L* Range - Horizontal Layout */}
              <div className="flex items-center gap-4">
                {/* P1 */}
                <div className="flex items-center gap-2">
                  <label
                    className={`text-xs font-medium cursor-ew-resize select-none ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}
                    onMouseDown={(e) => handleNumberDragStart(e, cp1.x, (v) => setCp1({ ...cp1, x: v }), 0, 1, 0.01)}
                    title="Drag to change X"
                  >
                    P1
                  </label>
                  <input
                    type="number"
                    value={cp1.x}
                    onChange={(e) => setCp1({ ...cp1, x: parseFloat(e.target.value) })}
                    min="0"
                    max="1"
                    step="0.01"
                    className={`w-16 px-2 py-1 rounded-md text-xs font-mono focus:outline-none ${
                      theme === 'light'
                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                        : 'bg-black border border-zinc-700 focus:border-zinc-600'
                    }`}
                  />
                  <input
                    type="number"
                    value={cp1.y}
                    onChange={(e) => setCp1({ ...cp1, y: parseFloat(e.target.value) })}
                    min="0"
                    max="1"
                    step="0.01"
                    className={`w-16 px-2 py-1 rounded-md text-xs font-mono focus:outline-none ${
                      theme === 'light'
                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                        : 'bg-black border border-zinc-700 focus:border-zinc-600'
                    }`}
                  />
                </div>

                {/* P2 */}
                <div className="flex items-center gap-2">
                  <label
                    className={`text-xs font-medium cursor-ew-resize select-none ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}
                    onMouseDown={(e) => handleNumberDragStart(e, cp2.x, (v) => setCp2({ ...cp2, x: v }), 0, 1, 0.01)}
                    title="Drag to change X"
                  >
                    P2
                  </label>
                  <input
                    type="number"
                    value={cp2.x}
                    onChange={(e) => setCp2({ ...cp2, x: parseFloat(e.target.value) })}
                    min="0"
                    max="1"
                    step="0.01"
                    className={`w-16 px-2 py-1 rounded-md text-xs font-mono focus:outline-none ${
                      theme === 'light'
                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                        : 'bg-black border border-zinc-700 focus:border-zinc-600'
                    }`}
                  />
                  <input
                    type="number"
                    value={cp2.y}
                    onChange={(e) => setCp2({ ...cp2, y: parseFloat(e.target.value) })}
                    min="0"
                    max="1"
                    step="0.01"
                    className={`w-16 px-2 py-1 rounded-md text-xs font-mono focus:outline-none ${
                      theme === 'light'
                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                        : 'bg-black border border-zinc-700 focus:border-zinc-600'
                    }`}
                  />
                  <button
                    onClick={resetBezierPoints}
                    className={`ml-1 text-xs ${theme === 'light' ? 'text-neutral-700 hover:text-neutral-900' : 'text-gray-500 hover:text-gray-300'}`}
                    title="Reset bezier points"
                  >
                    ↺
                  </button>
                </div>

                {/* L* Range */}
                <div className="flex items-center gap-2">
                  <label
                    className={`text-xs font-medium cursor-ew-resize select-none ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}
                    onMouseDown={(e) => handleNumberDragStart(e, globalLstarMin, setGlobalLstarMin, 0, 95, 1)}
                    title="Drag to change Min"
                  >
                    L* Range
                  </label>
                  <input
                    type="number"
                    value={globalLstarMin}
                    onChange={(e) => setGlobalLstarMin(Math.max(0, Math.min(95, parseInt(e.target.value) || 10)))}
                    min="0"
                    max="95"
                    className={`w-14 px-2 py-1 rounded-md text-xs font-mono focus:outline-none ${
                      theme === 'light'
                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                        : 'bg-black border border-zinc-700 focus:border-zinc-600'
                    }`}
                    placeholder="Min"
                  />
                  <span className={theme === 'light' ? 'text-neutral-600' : 'text-gray-600'}>–</span>
                  <input
                    type="number"
                    value={globalLstarMax}
                    onChange={(e) => setGlobalLstarMax(Math.max(5, Math.min(100, parseInt(e.target.value) || 98)))}
                    min="5"
                    max="100"
                    className={`w-14 px-2 py-1 rounded-md text-xs font-mono focus:outline-none ${
                      theme === 'light'
                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                        : 'bg-black border border-zinc-700 focus:border-zinc-600'
                    }`}
                    placeholder="Max"
                  />
                  <button
                    onClick={() => {
                      setGlobalLstarMin(10);
                      setGlobalLstarMax(98);
                    }}
                    className={`ml-1 text-xs ${theme === 'light' ? 'text-neutral-700 hover:text-neutral-900' : 'text-gray-500 hover:text-gray-300'}`}
                    title="Reset L* range"
                  >
                    ↺
                  </button>
                </div>
              </div>

              {/* L* Range Sliders */}
              <div>
                <label className={`block text-xs font-medium uppercase tracking-wider mb-3 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                  Global L* Range (Visual Sliders)
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-600'}`}>Max (light)</label>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={globalLstarMax}
                      onChange={(e) => setGlobalLstarMax(parseInt(e.target.value))}
                      className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'}`}
                    />
                    <div className={`text-xs font-mono mt-1 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>L* {globalLstarMax}</div>
                  </div>
                  <div>
                    <label className={`block text-xs mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-600'}`}>Min (dark)</label>
                    <input
                      type="range"
                      min="0"
                      max="95"
                      value={globalLstarMin}
                      onChange={(e) => setGlobalLstarMin(parseInt(e.target.value))}
                      className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'}`}
                    />
                    <div className={`text-xs font-mono mt-1 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>L* {globalLstarMin}</div>
                  </div>
                </div>
              </div>

              {/* Bezier Curve Canvas */}
              <div>
                <label className={`block text-xs font-medium uppercase tracking-wider mb-3 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                  Bezier Curve (Visual Editor)
                </label>
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  className={`w-full h-80 rounded-lg cursor-crosshair ${
                    theme === 'light'
                      ? 'bg-white border-2 border-gray-300'
                      : 'bg-black border border-zinc-700'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
        {colorScales.map((cs, scaleIndex) => {
          // Determine effective swatch count
          const effectiveSwatchCount = getEffectiveSwatchCount(cs);

          // Generate scale based on mode
          let scale;
          let keyColorIndex = -1;

          if (cs.isSingleColor) {
            // Single color: just return the base color
            const rgb = hexToRgb(cs.hex);
            const lstar = rgbToLstar(rgb.r, rgb.g, rgb.b);
            scale = [{
              hex: cs.hex,
              lstar: lstar.toFixed(1),
              isCustom: false,
              step: 500 // Default step for single color
            }];
          } else {
            // Regular scale generation
            const tempSteps = effectiveSwatchCount + 2; // Override steps for this scale

            // Temporarily create a modified generateColorScale function with custom steps
            const values = [];
            for (let i = 0; i < tempSteps; i++) {
              let hex, lstar;

              if (i === 0) {
                hex = '#ffffff';
                lstar = 100;
              } else if (i === tempSteps - 1) {
                hex = '#000000';
                lstar = 0;
              } else {
                const t = i / (tempSteps - 1);
                const easedT = cs.useCustomBezier
                  ? getBezierYWithPoints(t, cs.cp1, cs.cp2)
                  : getBezierY(t);
                const lstarMin = (cs.useCustomLstarRange === true) ? cs.lstarMin : globalLstarMin;
                const lstarMax = (cs.useCustomLstarRange === true) ? cs.lstarMax : globalLstarMax;
                lstar = lstarMax - easedT * (lstarMax - lstarMin);
                hex = getColorAtLightness(cs.hex, lstar, lstarMin, lstarMax, cs.saturationMin, cs.saturationMax, cs.hueShiftDark, cs.hueShiftLight);
              }

              const step = (i + 1) * 100;
              values.push({ step, hex, lstar: lstar.toFixed(1) });
            }
            scale = values;

            keyColorIndex = findKeyColorIndex(scale, cs.hex);

            // If key color is locked, replace the closest swatch with exact hex
            if (cs.lockKeyColor && keyColorIndex >= 0) {
              const lockedRgb = hexToRgb(cs.hex);
              const lockedLstar = rgbToLstar(lockedRgb.r, lockedRgb.g, lockedRgb.b);
              scale[keyColorIndex] = {
                ...scale[keyColorIndex],
                hex: cs.hex,
                lstar: lockedLstar.toFixed(1)
              };
            }

            // Remove white and black anchors (unless includeAnchors is enabled) and apply numbering
            scale = (() => {
              const sliced = cs.includeAnchors ? scale : scale.slice(1, -1);
              const lstarValues = sliced.map(s => s.lstar);
              const lstarMin = (cs.useCustomLstarRange === true) ? cs.lstarMin : globalLstarMin;
              const lstarMax = (cs.useCustomLstarRange === true) ? cs.lstarMax : globalLstarMax;
              const increment = useCustomIncrement ? customIncrement : 100;
              const steps = calculateStepFromLstar(lstarValues, useLightnessNumbering, lstarMin, lstarMax, increment);
              return sliced.map((swatch, i) => ({ ...swatch, step: steps[i] }));
            })();

            // Apply custom swatches AFTER renumbering (keyed by step)
            scale.forEach((swatch, i) => {
              if (cs.customSwatches[swatch.step]) {
                scale[i] = {
                  ...swatch,
                  hex: cs.customSwatches[swatch.step],
                  isCustom: true
                };
              }
            });
          }

          return (
            <motion.div
              key={cs.id}
              layout
              initial={{ opacity: 0, y: -20 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: {
                  duration: motionPresets.accordionEnter.duration / 1000,
                  ease: [0, 0, 0.2, 1] // decelerate
                }
              }}
              exit={{
                opacity: 0,
                transition: {
                  duration: motionPresets.accordionExit.duration / 1000,
                  ease: [0.4, 0, 1, 1] // accelerate
                }
              }}
              transition={{
                layout: {
                  duration: 0.3,
                  ease: [0.4, 0, 0.2, 1]
                }
              }}
              className={`cardboard-panel rounded-xl mb-3 ${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-black border border-zinc-800'}`}
            >
              {/* Always visible compact header */}
              <div className="p-4">
                {/* Token Prefix and Key Color - Compact */}
                {viewMode === 'default' && (
                <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                  {/* Token/Key row - responsive layout */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    {/* Left controls - wrap on all screens */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="flex items-center gap-2">
                        <label className={`font-jetbrains-mono text-xs font-medium ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                          Token
                        </label>
                        <input
                          type="text"
                          value={cs.name}
                          onChange={(e) => updateColorScaleName(cs.id, e.target.value)}
                          placeholder="color"
                          className={`font-jetbrains-mono cardboard-input w-32 px-2 py-1 rounded text-xs focus:outline-none ${
                            theme === 'light'
                              ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                              : 'bg-black border border-zinc-700 focus:border-zinc-600'
                          }`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className={`font-jetbrains-mono text-xs font-medium ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                          Key
                        </label>
                        <input
                          type="color"
                          value={cs.hex}
                          onChange={(e) => updateColorScaleHex(cs.id, e.target.value)}
                          className={`w-8 h-[26px] rounded cursor-pointer ${
                            theme === 'light'
                              ? 'border border-gray-300 bg-white'
                              : 'border border-zinc-700 bg-black'
                          }`}
                        />
                        <input
                          type="text"
                          defaultValue={cs.hex}
                          key={cs.hex}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            if (/^#[0-9A-Fa-f]{6}$/.test(value) || /^#[0-9A-Fa-f]{3}$/.test(value)) {
                              updateColorScaleHex(cs.id, value);
                            } else {
                              e.target.value = cs.hex;
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.target.blur();
                            }
                          }}
                          className={`font-jetbrains-mono cardboard-input w-20 px-2 py-1 rounded text-xs focus:outline-none ${
                            theme === 'light'
                              ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                              : 'bg-black border border-zinc-700 text-gray-200 focus:border-zinc-600'
                          }`}
                        />
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={cs.lockKeyColor}
                          onCheckedChange={() => toggleLockKeyColor(cs.id)}
                          size="1"
                          data-checkbox-type="regular"
                        />
                        <span className={`font-jetbrains-mono text-xs font-medium ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Lock</span>
                      </label>
                      {!cs.isSingleColor && (
                        <Tooltip content="Include pure white and black swatches at the ends">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <Checkbox
                              checked={cs.includeAnchors}
                              onCheckedChange={() => toggleIncludeAnchors(cs.id)}
                              size="1"
                              data-checkbox-type="regular"
                            />
                            <span className={`font-jetbrains-mono text-xs font-medium ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>W/B</span>
                          </label>
                        </Tooltip>
                      )}
                      <label className="flex items-center gap-1.5 cursor-pointer" title="Single color mode (hides scale controls)">
                        <Checkbox
                          checked={cs.isSingleColor}
                          onCheckedChange={() => toggleSingleColorMode(cs.id)}
                          size="1"
                          data-checkbox-type="regular"
                        />
                        <span className={`font-jetbrains-mono text-xs font-medium ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Single</span>
                      </label>
                      {!cs.isSingleColor && (
                        <div className="flex items-center gap-1">
                          <label className={`font-jetbrains-mono text-xs ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Swatches</label>
                          <input
                            type="number"
                            value={cs.swatchCountOverride ?? numSwatches}
                            onChange={(e) => updateSwatchCountOverride(cs.id, e.target.value)}
                            min="1"
                            max="20"
                            className={`font-jetbrains-mono w-12 px-1 py-1 rounded text-xs ${
                              theme === 'light'
                                ? 'bg-white border border-gray-300 text-gray-900'
                                : 'bg-black border border-zinc-700 text-gray-200'
                            }`}
                          />
                          {cs.swatchCountOverride !== null && (
                            <button
                              onClick={() => clearSwatchCountOverride(cs.id)}
                              className={`text-[10px] ${theme === 'light' ? 'text-neutral-700 hover:text-neutral-900' : 'text-gray-500 hover:text-gray-300'}`}
                              title="Reset to global setting"
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      )}
                      {!cs.isSingleColor && (
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch
                            checked={cs.showAdvancedSettings}
                            onCheckedChange={() => toggleAdvancedSettings(cs.id)}
                            className="scale-75"
                          />
                          <span className={`font-jetbrains-mono text-xs ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Advanced</span>
                        </label>
                      )}
                      {colorScales.length > 1 && (
                        <div className="relative harmonize-dropdown-container">
                          <button
                            onClick={() => setHarmonizingScale(harmonizingScale === cs.id ? null : cs.id)}
                            className={`cardboard-small-button px-2 py-1 rounded text-xs font-medium ${
                              theme === 'light'
                                ? 'bg-gray-300 text-gray-1000 border border-gray-300'
                                : 'bg-gray-1100 text-white border border-gray-1000'
                            }`}
                          >
                            Harmonize...
                          </button>
                          <div
                            className={`overflow-hidden absolute left-0 z-50 ${
                              scaleIndex >= colorScales.length - 2 ? 'bottom-full' : 'top-full'
                            }`}
                            style={{
                              maxHeight: harmonizingScale === cs.id ? '280px' : '0',
                              opacity: harmonizingScale === cs.id ? 1 : 0,
                              [scaleIndex >= colorScales.length - 2 ? 'marginBottom' : 'marginTop']: harmonizingScale === cs.id ? '8px' : '0',
                              transition: `all ${harmonizingScale === cs.id ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${harmonizingScale === cs.id ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
                            }}
                          >
                            <div className={`rounded-lg p-3 shadow-xl min-w-[200px] ${
                              theme === 'light'
                                ? 'bg-white border border-gray-300'
                                : 'bg-gray-1100 border border-zinc-700'
                            }`}>
                              <div className={`text-xs font-medium mb-2 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Harmonize with:</div>
                              <div className="flex flex-col gap-3 max-h-[240px] overflow-y-auto">
                                {/* Revert button - show if color was harmonized */}
                                {cs.preHarmonizeHex && (
                                  <button
                                    onClick={() => revertHarmonize(cs.id)}
                                    className={`px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${
                                      theme === 'light'
                                        ? 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-300'
                                        : 'bg-orange-950 hover:bg-orange-900 text-orange-400 border border-orange-800'
                                    }`}
                                  >
                                    <span className="material-symbols-rounded text-[14px]">undo</span>
                                    <span>Revert to original</span>
                                    <div
                                      className="w-3 h-3 rounded ml-auto"
                                      style={{ background: cs.preHarmonizeHex }}
                                    />
                                  </button>
                                )}
                                {colorScales
                                  .filter(otherScale => otherScale.id !== cs.id)
                                  .map(otherScale => {
                                    const colorTheoryMethods = [
                                      { id: 'direct', name: 'Direct Match', desc: 'Match saturation & lightness' },
                                      { id: 'complementary', name: 'Complementary', desc: 'Invert lightness' },
                                      { id: 'analogous', name: 'Analogous', desc: 'Subtle harmony' },
                                      { id: 'triadic', name: 'Triadic', desc: 'Boost saturation' },
                                      { id: 'monochromatic', name: 'Monochromatic', desc: 'Darken for depth' }
                                    ];

                                    return (
                                      <div key={otherScale.id} className="flex flex-col gap-1">
                                        <div className={`flex items-center gap-2 px-2 py-1 ${theme === 'light' ? 'text-neutral-1000' : 'text-gray-300'}`}>
                                          <div
                                            className="w-3 h-3 rounded"
                                            style={{ background: otherScale.hex }}
                                          />
                                          <span className="text-xs font-medium font-mono">{otherScale.name}</span>
                                        </div>
                                        <div className="flex flex-col gap-0.5 ml-5">
                                          {colorTheoryMethods.map(method => (
                                            <Tooltip
                                              key={method.id}
                                              content={method.desc}
                                            >
                                              <button
                                                onClick={() => {
                                                  harmonizeWithColor(cs.id, otherScale.id, method.id);
                                                  setHarmonizingScale(null);
                                                }}
                                                className={`px-2 py-1 rounded text-[11px] text-left transition-colors ${
                                                  theme === 'light'
                                                    ? 'hover:bg-gray-100 text-gray-700'
                                                    : 'hover:bg-zinc-800 text-gray-400'
                                                }`}
                                              >
                                                {method.name}
                                              </button>
                                            </Tooltip>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons - right side on desktop, below on mobile */}
                    <div className="flex items-center gap-2 sm:ml-auto">
                      <div className={`cardboard-button-group flex gap-0.5 rounded-md overflow-hidden ${theme === 'light' ? 'border border-gray-300' : 'border border-gray-900'}`}>
                        <button
                          onClick={() => moveColorScale(cs.id, 'up')}
                          disabled={scaleIndex === 0}
                          className={`cardboard-arrow-button p-1.5 ${
                            scaleIndex === 0
                              ? theme === 'light'
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                              : theme === 'light'
                                ? 'bg-gray-200 text-gray-900'
                                : 'bg-gray-1000 text-white'
                          }`}
                          title="Move up"
                        >
                          <span className="material-symbols-rounded text-[16px]">arrow_upward</span>
                        </button>
                        <button
                          onClick={() => moveColorScale(cs.id, 'down')}
                          disabled={scaleIndex === colorScales.length - 1}
                          className={`cardboard-arrow-button p-1.5 ${
                            scaleIndex === colorScales.length - 1
                              ? theme === 'light'
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                              : theme === 'light'
                                ? 'bg-gray-200 text-gray-900'
                                : 'bg-gray-1000 text-white'
                          }`}
                          title="Move down"
                        >
                          <span className="material-symbols-rounded text-[16px]">arrow_downward</span>
                        </button>
                      </div>
                      <button
                        onClick={() => removeColorScale(cs.id)}
                        className="p-1.5 hover:bg-red-900 rounded transition-all duration-150 ease-in-out text-red-400 active:bg-red-950 active:scale-95"
                        title="Remove scale"
                      >
                        <span className="material-symbols-rounded text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {/* Advanced Controls - Below Token/Key row, Above swatch scale */}
                {viewMode === 'default' && !cs.isSingleColor && (
                  <div
                    className="overflow-hidden px-4"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      maxHeight: cs.showAdvancedSettings ? '3000px' : '0',
                      opacity: cs.showAdvancedSettings ? 1 : 0,
                      marginTop: cs.showAdvancedSettings ? '16px' : '0',
                      marginBottom: cs.showAdvancedSettings ? '16px' : '0',
                      transition: `all ${cs.showAdvancedSettings ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${cs.showAdvancedSettings ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
                    }}
                  >
                    <div className="mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Switch
                          checked={cs.useCustomLstarRange}
                          onCheckedChange={() => toggleCustomLstarRange(cs.id)}
                        />
                        <span className={`text-xs font-medium ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Use custom L* range</span>
                      </label>
                    </div>
                    <div
                      className="overflow-hidden"
                      style={{
                        maxHeight: cs.useCustomLstarRange ? '500px' : '0',
                        opacity: cs.useCustomLstarRange ? 1 : 0,
                        marginTop: cs.useCustomLstarRange ? '24px' : '0',
                        transition: `all ${cs.useCustomLstarRange ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${cs.useCustomLstarRange ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
                      }}
                    >
                      <div className={`mb-4 rounded-lg p-3 ${
                        theme === 'light'
                          ? 'bg-white border border-gray-200'
                          : 'bg-black border border-zinc-800'
                      }`}>
                        <div className="flex justify-between items-center mb-2">
                          <label className={`text-xs font-medium uppercase tracking-wider ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                            Custom L* range (lightness limits)
                          </label>
                          <button
                            onClick={() => resetLstarRange(cs.id)}
                            className={`px-2 py-1 text-xs transition-colors ${
                              theme === 'light'
                                ? 'text-gray-600 hover:text-gray-900'
                                : 'text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            Reset
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={`block text-xs mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-600'}`}>Max (light)</label>
                            <input
                              type="range"
                              min="5"
                              max="100"
                              value={cs.lstarMax}
                              onChange={(e) => updateLstarRange(cs.id, 'max', e.target.value)}
                              className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'}`}
                            />
                            <div className={`text-xs font-mono mt-1 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>L* {cs.lstarMax}</div>
                          </div>
                          <div>
                            <label className={`block text-xs mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-600'}`}>Min (dark)</label>
                            <input
                              type="range"
                              min="0"
                              max="95"
                              value={cs.lstarMin}
                              onChange={(e) => updateLstarRange(cs.id, 'min', e.target.value)}
                              className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'}`}
                            />
                            <div className={`text-xs font-mono mt-1 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>L* {cs.lstarMin}</div>
                          </div>
                        </div>
                        <div className={`text-xs mt-2 ${theme === 'light' ? 'text-neutral-700' : 'text-gray-500'}`}>
                          Override global L* range for this color scale (e.g., yellow works well at L* 20-90)
                        </div>
                      </div>
                    </div>
                    <div className={`mb-4 rounded-lg p-3 ${
                      theme === 'light'
                        ? 'bg-white border border-gray-200'
                        : 'bg-black border border-zinc-800'
                    }`}>
                      <div className="flex justify-between items-center mb-2">
                        <label className={`text-xs font-medium uppercase tracking-wider ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                          Saturation range
                        </label>
                        <button
                          onClick={() => resetSaturationRange(cs.id)}
                          className={`px-2 py-1 text-xs transition-colors ${
                            theme === 'light'
                              ? 'text-gray-600 hover:text-gray-900'
                              : 'text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          Reset
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`block text-xs mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-600'}`}>Max (light)</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={cs.saturationMax}
                            onChange={(e) => updateSaturationRange(cs.id, 'max', e.target.value)}
                            className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'}`}
                          />
                          <div className={`text-xs font-mono mt-1 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>{cs.saturationMax}%</div>
                        </div>
                        <div>
                          <label className={`block text-xs mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-600'}`}>Min (dark)</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={cs.saturationMin}
                            onChange={(e) => updateSaturationRange(cs.id, 'min', e.target.value)}
                            className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'}`}
                          />
                          <div className={`text-xs font-mono mt-1 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>{cs.saturationMin}%</div>
                        </div>
                      </div>
                      <div className={`text-xs mt-2 ${theme === 'light' ? 'text-neutral-700' : 'text-gray-500'}`}>
                        Percentage of base saturation to maintain (100% = full color, 0% = grayscale)
                      </div>
                    </div>
                    <div className={`mb-4 rounded-lg p-3 ${
                      theme === 'light'
                        ? 'bg-white border border-gray-200'
                        : 'bg-black border border-zinc-800'
                    }`}>
                      <div className="flex justify-between items-center mb-2">
                        <label className={`text-xs font-medium uppercase tracking-wider ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                          Hue shift
                        </label>
                        <button
                          onClick={() => resetHueShift(cs.id)}
                          className={`px-2 py-1 text-xs transition-colors ${
                            theme === 'light'
                              ? 'text-gray-600 hover:text-gray-900'
                              : 'text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          Reset
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`block text-xs mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-600'}`}>Light end</label>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={cs.hueShiftLight}
                            onChange={(e) => updateHueShift(cs.id, 'light', e.target.value)}
                            className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'}`}
                          />
                          <div className={`text-xs font-mono mt-1 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>{cs.hueShiftLight}°</div>
                        </div>
                        <div>
                          <label className={`block text-xs mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-gray-600'}`}>Dark end</label>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={cs.hueShiftDark}
                            onChange={(e) => updateHueShift(cs.id, 'dark', e.target.value)}
                            className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${theme === 'light' ? 'bg-gray-300' : 'bg-zinc-700'}`}
                          />
                          <div className={`text-xs font-mono mt-1 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>{cs.hueShiftDark}°</div>
                        </div>
                      </div>
                      <div className={`text-xs mt-2 ${theme === 'light' ? 'text-neutral-700' : 'text-gray-500'}`}>
                        Rotate hue at extremes (e.g., shift yellow toward orange in darks)
                      </div>
                    </div>
                    {/* Custom Bezier */}
                    <div className="mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Switch
                          checked={cs.useCustomBezier}
                          onCheckedChange={() => toggleCustomBezier(cs.id)}
                        />
                        <span className={`text-xs font-medium ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Use custom bezier curve</span>
                      </label>
                    </div>
                    <div
                      className="overflow-hidden"
                      style={{
                        maxHeight: cs.useCustomBezier ? '1000px' : '0',
                        opacity: cs.useCustomBezier ? 1 : 0,
                        marginTop: cs.useCustomBezier ? '24px' : '0',
                        transition: `all ${cs.useCustomBezier ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${cs.useCustomBezier ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
                      }}
                    >
                      <div className={`mb-4 rounded-lg p-3 ${
                        theme === 'light'
                          ? 'bg-white border border-gray-200'
                          : 'bg-black border border-zinc-800'
                      }`}>
                        <div className="flex justify-between items-center mb-3">
                          <label className={`text-xs font-medium uppercase tracking-wider ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                            Custom bezier curve
                          </label>
                          <button
                            onClick={() => resetCustomBezier(cs.id)}
                            className={`px-2 py-1 text-xs transition-colors ${
                              theme === 'light'
                                ? 'text-gray-600 hover:text-gray-900'
                                : 'text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            Reset to global
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
                              className={`rounded cursor-crosshair ${theme === 'light' ? 'bg-white border border-gray-300' : 'bg-zinc-900'}`}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={`block text-xs font-medium mb-1 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>P1</label>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    value={cs.cp1.x}
                                    onChange={(e) => updateColorScaleBezier(cs.id, 'cp1', 'x', e.target.value)}
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    className={`w-full px-2 py-1 rounded text-xs font-mono focus:outline-none ${
                                      theme === 'light'
                                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                                        : 'bg-zinc-900 border border-zinc-700 focus:border-zinc-600'
                                    }`}
                                  />
                                  <input
                                    type="number"
                                    value={cs.cp1.y}
                                    onChange={(e) => updateColorScaleBezier(cs.id, 'cp1', 'y', e.target.value)}
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    className={`w-full px-2 py-1 rounded text-xs font-mono focus:outline-none ${
                                      theme === 'light'
                                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                                        : 'bg-zinc-900 border border-zinc-700 focus:border-zinc-600'
                                    }`}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className={`block text-xs font-medium mb-1 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>P2</label>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    value={cs.cp2.x}
                                    onChange={(e) => updateColorScaleBezier(cs.id, 'cp2', 'x', e.target.value)}
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    className={`w-full px-2 py-1 rounded text-xs font-mono focus:outline-none ${
                                      theme === 'light'
                                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                                        : 'bg-zinc-900 border border-zinc-700 focus:border-zinc-600'
                                    }`}
                                  />
                                  <input
                                    type="number"
                                    value={cs.cp2.y}
                                    onChange={(e) => updateColorScaleBezier(cs.id, 'cp2', 'y', e.target.value)}
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    className={`w-full px-2 py-1 rounded text-xs font-mono focus:outline-none ${
                                      theme === 'light'
                                        ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                                        : 'bg-zinc-900 border border-zinc-700 focus:border-zinc-600'
                                    }`}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {/* Swatches row with text overlay */}
                  <div
                    className="flex gap-1.5 flex-1 p-2 rounded"
                    style={{ backgroundColor: swatchBackground }}
                  >
                    {cs.isSingleColor ? (
                      // Single color: show larger single swatch with hex
                      <div className="w-full flex flex-col gap-1">
                        <div
                          className="h-14 cardboard-swatch relative"
                          style={{
                            background: desaturatedScales.has(cs.id) ? hexToGrayscale(cs.hex) : cs.hex,
                            border: showSwatchBorders ? '0.5px solid rgba(128, 128, 128, 0.5)' : 'none'
                          }}
                        >
                          <AnimatePresence mode="wait">
                          {contrastCheck !== 'off' && (() => {
                            const swatchHex = desaturatedScales.has(cs.id) ? hexToGrayscale(cs.hex) : cs.hex;
                            const color1Contrast = contrastCheck === 'aa'
                              ? getContrastRatio(contrastColor1, swatchHex)
                              : getAPCAContrast(contrastColor1, swatchHex);
                            const color2Contrast = contrastCheck === 'aa'
                              ? getContrastRatio(contrastColor2, swatchHex)
                              : getAPCAContrast(contrastColor2, swatchHex);

                            const color1Passes = contrastCheck === 'aa' ? color1Contrast >= 4.5 : color1Contrast >= 60;
                            const color2Passes = contrastCheck === 'aa' ? color2Contrast >= 4.5 : color2Contrast >= 60;

                            // If neither passes, show the better one with "n/a"
                            const showBetter = !color1Passes && !color2Passes;
                            const color1IsBetter = color1Contrast > color2Contrast;

                            // Get color names for tooltips
                            const color1Name = contrastColor1.toLowerCase();
                            const color2Name = contrastColor2.toLowerCase();

                            return (
                              <motion.div
                                key={contrastCheck}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                className="absolute inset-0 flex flex-col items-center justify-center gap-1"
                              >
                                {(color1Passes || (showBetter && color1IsBetter)) && (
                                  <Tooltip content={color1Passes
                                    ? (contrastCheck === 'aa'
                                      ? getAATooltipContent(color1Contrast, color1Name, theme)
                                      : getAPCATooltipContent(color1Contrast, color1Name, theme))
                                    : getNATooltipContent(color1Contrast, color1Name, contrastCheck, theme)
                                  }>
                                    <div style={{ color: contrastColor1 }} className="text-xs font-mono font-medium leading-none cursor-help">
                                      {color1Passes
                                        ? (contrastCheck === 'aa' ? `${color1Contrast.toFixed(1)}:1` : `${color1Contrast.toFixed(0)}`)
                                        : 'n/a'}
                                    </div>
                                  </Tooltip>
                                )}
                                {(color2Passes || (showBetter && !color1IsBetter)) && (
                                  <Tooltip content={color2Passes
                                    ? (contrastCheck === 'aa'
                                      ? getAATooltipContent(color2Contrast, color2Name, theme)
                                      : getAPCATooltipContent(color2Contrast, color2Name, theme))
                                    : getNATooltipContent(color2Contrast, color2Name, contrastCheck, theme)
                                  }>
                                    <div style={{ color: contrastColor2 }} className="text-xs font-mono font-medium leading-none cursor-help">
                                      {color2Passes
                                        ? (contrastCheck === 'aa' ? `${color2Contrast.toFixed(1)}:1` : `${color2Contrast.toFixed(0)}`)
                                        : 'n/a'}
                                    </div>
                                  </Tooltip>
                                )}
                              </motion.div>
                            );
                          })()}
                          </AnimatePresence>
                        </div>
                        {viewMode === 'default' && (
                        <div className={`text-center text-xs font-dm-mono italic leading-tight ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>
                          <div>{cs.hex.slice(1)}</div>
                          <div className="font-mono not-italic">L* {parseFloat(cs.lstar).toFixed(1)}</div>
                        </div>
                        )}
                      </div>
                    ) : (
                      // Scale: show all swatches with hex on swatch, step and L* below
                      scale.map((v, i) => {
                        const isLight = parseFloat(v.lstar) > 50;
                        const textColor = isLight ? 'text-neutral-1100' : 'text-white';
                        const isKeyColor = cs.lockKeyColor
                          ? v.hex.toLowerCase() === cs.hex.toLowerCase()
                          : i === keyColorIndex;
                        const isAnchor = cs.includeAnchors && (i === 0 || i === scale.length - 1);
                        return (
                            <div key={i} className="flex-1 flex flex-col gap-1">
                              <div
                                className="h-14 cardboard-swatch relative"
                                style={{
                                  background: desaturatedScales.has(cs.id) ? hexToGrayscale(v.hex) : v.hex,
                                  border: showSwatchBorders ? '0.5px solid rgba(128, 128, 128, 0.5)' : 'none'
                                }}
                              >
                                {isKeyColor && viewMode === 'default' && (
                                  <span
                                    className={`material-symbols-rounded absolute bottom-1 left-1/2 -translate-x-1/2 text-[14px] ${textColor}`}
                                    style={{ opacity: 0.5, fontVariationSettings: "'FILL' 1" }}
                                  >
                                    {cs.lockKeyColor ? 'lock' : 'key'}
                                  </span>
                                )}
                                {isAnchor && viewMode === 'default' && (
                                  <span
                                    className={`material-symbols-rounded absolute bottom-1 left-1/2 -translate-x-1/2 text-[14px] ${textColor}`}
                                    style={{ opacity: 0.3 }}
                                    title="Anchor swatch (not affected by curves)"
                                  >
                                    anchor
                                  </span>
                                )}
                                <AnimatePresence mode="wait">
                                {contrastCheck !== 'off' && (() => {
                                  const swatchHex = desaturatedScales.has(cs.id) ? hexToGrayscale(v.hex) : v.hex;
                                  const color1Contrast = contrastCheck === 'aa'
                                    ? getContrastRatio(contrastColor1, swatchHex)
                                    : getAPCAContrast(contrastColor1, swatchHex);
                                  const color2Contrast = contrastCheck === 'aa'
                                    ? getContrastRatio(contrastColor2, swatchHex)
                                    : getAPCAContrast(contrastColor2, swatchHex);

                                  const color1Passes = contrastCheck === 'aa' ? color1Contrast >= 4.5 : color1Contrast >= 60;
                                  const color2Passes = contrastCheck === 'aa' ? color2Contrast >= 4.5 : color2Contrast >= 60;

                                  // If neither passes, show the better one with "n/a"
                                  const showBetter = !color1Passes && !color2Passes;
                                  const color1IsBetter = color1Contrast > color2Contrast;

                                  // Get color names for tooltips
                                  const color1Name = contrastColor1.toLowerCase();
                                  const color2Name = contrastColor2.toLowerCase();

                                  return (
                                    <motion.div
                                      key={contrastCheck}
                                      initial={{ opacity: 0, scale: 0.9 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.9 }}
                                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                      className="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
                                    >
                                      {(color1Passes || (showBetter && color1IsBetter)) && (
                                        <Tooltip content={color1Passes
                                          ? (contrastCheck === 'aa'
                                            ? getAATooltipContent(color1Contrast, color1Name, theme)
                                            : getAPCATooltipContent(color1Contrast, color1Name, theme))
                                          : getNATooltipContent(color1Contrast, color1Name, contrastCheck, theme)
                                        }>
                                          <div style={{ color: contrastColor1 }} className="text-[10px] font-mono font-medium leading-none cursor-help">
                                            {color1Passes
                                              ? (contrastCheck === 'aa' ? `${color1Contrast.toFixed(1)}:1` : `${color1Contrast.toFixed(0)}`)
                                              : 'n/a'}
                                          </div>
                                        </Tooltip>
                                      )}
                                      {(color2Passes || (showBetter && !color1IsBetter)) && (
                                        <Tooltip content={color2Passes
                                          ? (contrastCheck === 'aa'
                                            ? getAATooltipContent(color2Contrast, color2Name, theme)
                                            : getAPCATooltipContent(color2Contrast, color2Name, theme))
                                          : getNATooltipContent(color2Contrast, color2Name, contrastCheck, theme)
                                        }>
                                          <div style={{ color: contrastColor2 }} className="text-[10px] font-mono font-medium leading-none cursor-help">
                                            {color2Passes
                                              ? (contrastCheck === 'aa' ? `${color2Contrast.toFixed(1)}:1` : `${color2Contrast.toFixed(0)}`)
                                              : 'n/a'}
                                          </div>
                                        </Tooltip>
                                      )}
                                    </motion.div>
                                  );
                                })()}
                                </AnimatePresence>
                              </div>
                              {viewMode === 'default' && (
                              <div className={`text-center text-[10px] leading-tight ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'} relative`}>
                                <div className="relative">
                                  <input
                                    type="text"
                                    defaultValue={v.hex.slice(1)}
                                    key={v.hex}
                                    onBlur={(e) => {
                                      const value = e.target.value.trim();
                                      const hexValue = value.startsWith('#') ? value : `#${value}`;
                                      if (/^#[0-9A-Fa-f]{6}$/.test(hexValue) || /^#[0-9A-Fa-f]{3}$/.test(hexValue)) {
                                        // Only update if the value actually changed
                                        if (hexValue.toLowerCase() !== v.hex.toLowerCase()) {
                                          updateCustomSwatch(cs.id, v.step, hexValue);
                                        }
                                      } else {
                                        e.target.value = v.hex.slice(1);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.target.blur();
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-full px-1 py-0.5 rounded text-center font-dm-mono bg-transparent border border-transparent hover:border-current focus:outline-none focus:border-current ${
                                      theme === 'light' ? 'text-neutral-900' : 'text-gray-400'
                                    }`}
                                  />
                                  {v.isCustom && (
                                    <Tooltip content="Reset to generated value">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          resetCustomSwatch(cs.id, v.step);
                                        }}
                                        className={`absolute -right-2 top-1/2 -translate-y-1/2 text-[10px] ${theme === 'light' ? 'text-neutral-700 hover:text-neutral-900' : 'text-gray-500 hover:text-gray-300'}`}
                                        title="Reset to generated value"
                                      >
                                        ↺
                                      </button>
                                    </Tooltip>
                                  )}
                                </div>
                                <div className="font-dm-mono">{v.step}</div>
                                <div className="font-dm-mono">L* {(() => {
                                  const rgb = hexToRgb(v.hex);
                                  if (!rgb) return parseFloat(v.lstar).toFixed(1);
                                  const lstar = rgbToLstar(rgb.r, rgb.g, rgb.b);
                                  return lstar.toFixed(1);
                                })()}</div>
                              </div>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>

              {/* Expandable content */}
              <div
                className="overflow-hidden"
                style={{
                  maxHeight: cs.isExpanded ? '2000px' : '0',
                  opacity: cs.isExpanded ? 1 : 0,
                  marginTop: cs.isExpanded ? '24px' : '0',
                  transition: `all ${cs.isExpanded ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${cs.isExpanded ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
                }}
              >
                <div className="px-6 pb-6" onClick={(e) => e.stopPropagation()}>
                  {/* Divider */}
                  <div className={`border-t mb-4 ${theme === 'light' ? 'border-gray-200' : 'border-zinc-800'}`}></div>


                  {/* Token Prefix and Key Color */}
                  <div className="mb-4 flex gap-4 items-start hidden">
                    <div>
                      <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                        Token Prefix
                      </label>
                      <input
                        type="text"
                        value={cs.name}
                        onChange={(e) => updateColorScaleName(cs.id, e.target.value)}
                        placeholder="color"
                        className={`w-48 px-3 py-2 rounded-md text-sm font-mono focus:outline-none ${
                          theme === 'light'
                            ? 'bg-white border border-gray-300 text-neutral-1100 focus:border-cyan-600'
                            : 'bg-black border border-zinc-700 focus:border-zinc-600'
                        }`}
                      />
                      <div className={`text-xs mt-1 ${theme === 'light' ? 'text-neutral-700' : 'text-gray-500'}`}>
                        Preview: {cs.isSingleColor ? cs.name : `${cs.name}-100, ${cs.name}-200, ...`}
                      </div>
                    </div>
                    <div>
                      <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                        Key Color
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={cs.hex}
                          onChange={(e) => updateColorScaleHex(cs.id, e.target.value)}
                          className={`w-16 h-10 rounded-md cursor-pointer ${
                            theme === 'light'
                              ? 'border border-gray-300 bg-white'
                              : 'border border-zinc-700 bg-black'
                          }`}
                        />
                        <input
                          type="text"
                          defaultValue={cs.hex}
                          key={cs.hex} // Force re-render when hex changes externally
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            // Validate complete hex code (3 or 6 digits)
                            if (/^#[0-9A-Fa-f]{6}$/.test(value) || /^#[0-9A-Fa-f]{3}$/.test(value)) {
                              updateColorScaleHex(cs.id, value);
                            } else {
                              // Reset to original value if invalid
                              e.target.value = cs.hex;
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.target.blur(); // Trigger onBlur validation
                            }
                          }}
                          className={`w-20 px-2 py-1 rounded-md text-xs font-mono focus:outline-none focus:border-cyan-600 ${
                            theme === 'light'
                              ? 'bg-white border border-gray-300 text-gray-900'
                              : 'bg-black border border-zinc-700 text-gray-200'
                          }`}
                          placeholder="#000000"
                        />
                        {colorScales.length > 1 && (
                          <div className="relative harmonize-dropdown-container">
                            <button
                              onClick={() => setHarmonizingScale(harmonizingScale === cs.id ? null : cs.id)}
                              className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-800 rounded-md text-xs font-medium text-white transition-colors"
                            >
                              Harmonize
                            </button>
                            <div
                              className={`overflow-hidden absolute left-0 ${
                                scaleIndex >= colorScales.length - 2 ? 'bottom-full' : 'top-full'
                              }`}
                              style={{
                                maxHeight: harmonizingScale === cs.id ? '280px' : '0',
                                opacity: harmonizingScale === cs.id ? 1 : 0,
                                [scaleIndex >= colorScales.length - 2 ? 'marginBottom' : 'marginTop']: harmonizingScale === cs.id ? '8px' : '0',
                                transition: `all ${harmonizingScale === cs.id ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${harmonizingScale === cs.id ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
                              }}
                            >
                              <div className={`rounded-lg p-3 shadow-xl z-20 min-w-[200px] ${
                                theme === 'light'
                                  ? 'bg-white border border-gray-300'
                                  : 'bg-zinc-800 border border-zinc-700'
                              }`}>
                                <div className={`text-xs font-medium mb-2 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Harmonize with:</div>
                                <div className="space-y-1 max-h-[240px] overflow-y-auto">
                                  {colorScales
                                    .filter(otherCs => otherCs.id !== cs.id)
                                    .map(otherCs => (
                                      <button
                                        key={otherCs.id}
                                        onClick={() => harmonizeWithColor(cs.id, otherCs.id)}
                                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                                          theme === 'light'
                                            ? 'hover:bg-gray-100'
                                            : 'hover:bg-zinc-700'
                                        }`}
                                      >
                                        <div
                                          className={`w-4 h-4 rounded ${theme === 'light' ? 'border border-gray-400' : 'border border-zinc-600'}`}
                                          style={{ backgroundColor: otherCs.hex }}
                                        />
                                        <span className={`text-xs ${theme === 'light' ? 'text-neutral-1100' : 'text-gray-200'}`}>{otherCs.name}</span>
                                      </button>
                                    ))}
                                </div>
                                <div className={`mt-2 pt-2 ${theme === 'light' ? 'border-t border-gray-200' : 'border-t border-zinc-700'}`}>
                                  <button
                                    onClick={() => setHarmonizingScale(null)}
                                    className={`w-full px-2 py-1 text-xs transition-colors ${
                                      theme === 'light'
                                        ? 'text-gray-600 hover:text-gray-900'
                                        : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Scale Controls - Hidden in single color mode */}
                  <div
                    className="overflow-hidden"
                    style={{
                      maxHeight: !cs.isSingleColor ? '5000px' : '0',
                      opacity: !cs.isSingleColor ? 1 : 0,
                      marginTop: !cs.isSingleColor ? '24px' : '0',
                      transition: `all ${!cs.isSingleColor ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${!cs.isSingleColor ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
                    }}
                  >
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
        </AnimatePresence>

        {/* Add color scale and Add color families buttons */}
        <div
          ref={addColorScaleButtonRef}
          className="flex gap-3 items-center mb-6"
        >
          <Button
            onClick={addColorScale}
            variant="solid"
            size="3"
            className={`cardboard-primary ${
              theme === 'light'
                ? '!bg-gray-1100 !text-gray-100'
                : '!bg-gray-200 !text-gray-1200'
            }`}
          >
            + Add color scale
          </Button>
          {colorScales.length > 0 && (
            !hasAnySaturatedColors() ? (
              <Tooltip content="Add a color with at least some saturation to add a color family">
                <Button
                  disabled={true}
                  variant="soft"
                  size="3"
                  className={`cardboard-secondary flex items-center gap-2 ${
                    theme === 'light'
                      ? '!bg-gray-400 !text-gray-1100'
                      : '!bg-gray-1000 !text-white'
                  }`}
                >
                  <span className="material-symbols-rounded text-[16px]">expand_more</span>
                  Add color families
                </Button>
              </Tooltip>
            ) : (
              <Button
                onClick={() => setShowColorFamilies(!showColorFamilies)}
                variant="soft"
                size="3"
                className={`cardboard-secondary flex items-center gap-2 ${
                  theme === 'light'
                    ? '!bg-gray-400 !text-gray-1100'
                    : '!bg-gray-1000 !text-white'
                }`}
                aria-expanded={showColorFamilies}
                aria-controls="color-families-panel"
              >
                <span className={`material-symbols-rounded text-[16px] transition-transform ${
                  showColorFamilies ? 'rotate-180' : ''
                }`}>
                  expand_more
                </span>
                Add color families
              </Button>
            )
          )}
        </div>

        <AnimatePresence mode="wait">
          {colorScales.length > 0 && showColorFamilies && (
            <motion.div
              key="color-families"
              ref={colorFamiliesPanelRef}
              layout
              initial={{
                opacity: 0,
                height: 0,
                marginBottom: 0
              }}
              animate={{
                opacity: 1,
                height: 'auto',
                marginBottom: 24,
                transition: {
                  duration: motionPresets.accordionEnter.duration / 1000,
                  ease: motionPresets.accordionEnter.easing
                }
              }}
              exit={{
                opacity: 0,
                height: 0,
                marginBottom: 0,
                transition: {
                  duration: motionPresets.accordionExit.duration / 1000,
                  ease: motionPresets.accordionExit.easing
                }
              }}
              className={`cardboard-panel rounded-xl p-6 overflow-hidden ${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-gray-1300 border border-zinc-800'}`}
              id="color-families-panel"
              role="region"
              aria-labelledby="color-families-heading"
            >
            <div className="flex items-center justify-between mb-3">
              <h3 id="color-families-heading" className={`text-lg font-semibold ${theme === 'light' ? 'text-neutral-1100' : 'text-white'}`}>
                Add color families
              </h3>
              <button
                onClick={() => setShowColorFamilies(false)}
                className={`cardboard-icon-button w-9 h-9 rounded-md flex items-center justify-center ${
                  theme === 'light'
                    ? 'bg-gray-100 text-neutral-900 border border-gray-300'
                    : 'bg-gray-1300 text-gray-400 border border-gray-1100'
                }`}
                aria-label="Close color families panel"
              >
                <span className="material-symbols-rounded text-[20px]">close</span>
              </button>
            </div>
            <p className={`text-sm mb-4 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>
              Quickly add common color families to your palette
            </p>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[300px]">
                <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
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
                    { name: 'Blue', value: 'blue', color: '#a4a4a4' },
                    { name: 'Indigo', value: 'indigo', color: '#6366f1' },
                    { name: 'Violet', value: 'violet', color: '#8b5cf6' },
                    { name: 'Purple', value: 'purple', color: '#a855f7' },
                    { name: 'Warm Gray', value: 'warm-gray', color: '#a8a29e' },
                    { name: 'Cool Gray', value: 'cool-gray', color: '#9ca3af' },
                  ].map((family) => (
                    <label
                      key={family.value}
                      className={`cardboard-small-button flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                        theme === 'light'
                          ? 'bg-white border border-gray-300 hover:bg-neutral-100'
                          : 'bg-black border border-zinc-700 hover:bg-zinc-900'
                      }`}
                    >
                      <Checkbox
                        checked={selectedHarmoniousFamilies.has(family.value)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedHarmoniousFamilies);
                          if (checked) {
                            newSet.add(family.value);
                          } else {
                            newSet.delete(family.value);
                          }
                          setSelectedHarmoniousFamilies(newSet);
                        }}
                        size="1"
                        data-checkbox-type="swatch"
                      />
                      <div
                        className={`w-4 h-4 rounded ${theme === 'light' ? 'border border-gray-400' : 'border border-zinc-600'}`}
                        style={{ backgroundColor: family.color }}
                      />
                      <span className={`text-sm ${theme === 'light' ? 'text-neutral-1100' : 'text-gray-200'}`}>{family.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className={`block text-xs font-medium uppercase tracking-wider ${theme === 'light' ? 'text-neutral-900' : 'text-gray-500'}`}>
                  Base Color
                </label>
                <select
                  value={baseColorScaleId || ''}
                  onChange={(e) => setBaseColorScaleId(e.target.value ? parseInt(e.target.value) : null)}
                  className={`cardboard-input px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    theme === 'light'
                      ? 'bg-white border border-gray-300 text-gray-900'
                      : 'bg-black border border-zinc-700 text-gray-200'
                  }`}
                >
                  {colorScales.map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      {cs.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={useColorTheory}
                    onCheckedChange={setUseColorTheory}
                    size="1"
                  />
                  <span className={`text-xs ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>
                    {useColorTheory ? 'Color Theory' : 'AI-based'}
                  </span>
                </label>
                <Button
                  onClick={generateHarmoniousColors}
                  disabled={selectedHarmoniousFamilies.size === 0}
                  variant="solid"
                  size="3"
                  className={`cardboard-primary ${
                    theme === 'light'
                      ? '!bg-gray-1100 !text-gray-100'
                      : '!bg-gray-200 !text-gray-1200'
                  }`}
                >
                  Preview colors
                </Button>
              </div>
            </div>

            {/* Loading State */}
            <div
              className="overflow-hidden"
              style={{
                maxHeight: isGenerating ? '300px' : '0',
                opacity: isGenerating ? 1 : 0,
                marginTop: isGenerating ? '16px' : '0',
                transition: `all ${isGenerating ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${isGenerating ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
              }}
            >
              <div className={`p-8 rounded-lg ${theme === 'light' ? 'bg-white border border-gray-300' : 'bg-black border border-zinc-700'}`}>
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-12 h-12">
                    <div className={`absolute inset-0 border-4 rounded-full ${theme === 'light' ? 'border-gray-300' : 'border-zinc-700'}`}></div>
                    <div className="absolute inset-0 border-4 border-neutral-700 rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <div className={`text-sm ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>Generating harmonious colors...</div>
                </div>
              </div>
            </div>

            {/* Preview Area */}
            <div
              ref={previewPanelRef}
              className="overflow-hidden"
              style={{
                maxHeight: !isGenerating && previewColorsByFamily ? '2000px' : '0',
                opacity: !isGenerating && previewColorsByFamily ? 1 : 0,
                marginTop: !isGenerating && previewColorsByFamily ? '16px' : '0',
                transition: `all ${!isGenerating && previewColorsByFamily ? motionPresets.accordionEnter.duration : motionPresets.accordionExit.duration}ms ${!isGenerating && previewColorsByFamily ? motionPresets.accordionEnter.easing : motionPresets.accordionExit.easing}`
              }}
            >
              {!isGenerating && previewColorsByFamily && (
                <div className={`p-4 rounded-lg ${theme === 'light' ? 'bg-white border border-gray-300' : 'bg-black border border-zinc-700'}`}>
                  <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                  <div className={`text-sm font-medium ${theme === 'light' ? 'text-neutral-1000' : 'text-gray-300'}`}>
                    Preview Options - Select one or more from each family
                    {selectedPreviews.size > 0 && (
                      <span className="ml-2 text-neutral-600">({selectedPreviews.size} selected)</span>
                    )}
                  </div>
                  <div className="flex gap-3 flex-shrink-0 items-center">
                    <Button
                      onClick={cancelPreview}
                      variant="ghost"
                      size="3"
                      style={{ padding: '10px 16px', margin: '0 8px 0 0' }}
                      className={`!rounded-lg ${
                        theme === 'light'
                          ? '!text-gray-900 hover:!bg-gray-200 hover:!rounded-lg'
                          : '!text-gray-400 hover:!bg-white hover:!bg-opacity-10 hover:!rounded-lg'
                      }`}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={generateHarmoniousColors}
                      variant="soft"
                      size="3"
                      className={`cardboard-secondary ${
                        theme === 'light'
                          ? '!bg-gray-400 !text-gray-1100'
                          : '!bg-gray-1000 !text-white'
                      }`}
                    >
                      Regenerate All
                    </Button>
                    <Button
                      onClick={applyPreviewColors}
                      disabled={selectedPreviews.size === 0}
                      variant="solid"
                      size="3"
                      className={`cardboard-primary ${
                        theme === 'light'
                          ? '!bg-gray-1100 !text-gray-100'
                          : '!bg-gray-200 !text-gray-1200'
                      }`}
                    >
                      Add Selected ({selectedPreviews.size})
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-6">
                  {Object.entries(previewColorsByFamily).map(([family, options]) => (
                    <div key={family} className="flex flex-col gap-2">
                      <div className={`text-xs font-medium uppercase tracking-wider capitalize ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>
                        {family}
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        {options.map((colorData, optionIndex) => {
                          const selectionKey = `${family}-${optionIndex}`;
                          const isSelected = selectedPreviews.has(selectionKey);

                          // Handle both formats: string (API) or object (color theory)
                          const hex = typeof colorData === 'string' ? colorData : colorData.hex;
                          const method = typeof colorData === 'object' ? colorData.method : null;
                          const description = typeof colorData === 'object' ? colorData.description : null;

                          return (
                            <Tooltip
                              key={optionIndex}
                              content={method ? `${method}: ${description}` : hex}
                            >
                              <div
                                onClick={() => togglePreviewSelection(family, optionIndex)}
                                className={`cardboard-small-button w-40 flex flex-col items-center gap-2 p-3 rounded-lg cursor-pointer transition-all ${
                                  isSelected
                                    ? theme === 'light'
                                      ? 'bg-gray-200 border-2 border-gray-900'
                                      : 'bg-gray-1100 border-2 border-zinc-500'
                                    : theme === 'light'
                                      ? 'bg-white border-2 border-gray-300 hover:border-gray-400'
                                      : 'bg-gray-1300 border-2 border-gray-1000 hover:border-gray-900'
                                }`}
                              >
                                <div
                                  className={`w-16 h-16 rounded ${theme === 'light' ? 'border border-gray-400' : 'border border-gray-900'}`}
                                  style={{ backgroundColor: hex }}
                                />
                                {method && (
                                  <div className={`text-[10px] font-medium text-center ${theme === 'light' ? 'text-neutral-1000' : 'text-gray-300'}`}>
                                    {method}
                                  </div>
                                )}
                                <div className={`text-xs font-mono ${theme === 'light' ? 'text-neutral-900' : 'text-gray-400'}`}>{hex}</div>
                              </div>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>
          </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </Theme>
  );
}
