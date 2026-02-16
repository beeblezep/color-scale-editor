# Color Scale Editor

An interactive bezier curve editor for creating perceptually uniform color scales using LAB color space.

## Features

- **Interactive Bezier Curve Editor**: Drag control points to adjust color distribution
- **LAB Color Space**: Perceptually accurate colors matching Figma's approach
- **Gray Scale & Color Scales**: Generate gray scales and custom color scales
- **12 Swatches**: Each scale includes 12 steps from light to dark
- **Custom Bezier per Scale**: Fine-tune individual color scales with custom curves
- **Key Color Lock**: Lock brand colors to exact hex values while adjusting the rest
- **Light/Dark Surface Preview**: Toggle backgrounds to preview scales on different surfaces
- **Comparison View**: See all scales side-by-side

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview

```bash
npm run preview
```

## Usage

1. **Adjust Global Curve**: Drag control points on the main bezier canvas to affect all scales
2. **Add Color Scales**: Click "+ Add Color Scale" to create new color scales
3. **Pick Key Color**: Use the color picker to choose your base color
4. **Custom Bezier**: Enable "Use Custom Bezier Curve" for per-scale fine-tuning
5. **Lock Key Color**: Enable "Lock Key Color Hex" to preserve exact brand color hex codes
6. **Toggle Surfaces**: Switch between light and dark backgrounds to preview contrast
7. **Compare Scales**: View all scales together in the comparison section

## Technical Details

- Built with React + Vite
- Tailwind CSS for styling
- LAB color space conversion for perceptual uniformity
- Cubic bezier curves for precise control over color distribution
- 12-step scales ranging from L* 100 (white) to L* 0 (black)

## License

MIT
