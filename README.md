# PhotoQword

> **The world's first fully open-source, Photoshop-class web image editor.** Edit PSD layers in your browser — zero install, zero subscription, zero sign-up. Your pixels never leave your machine.

[![Launch Editor](https://img.shields.io/badge/Launch_Editor-Open_ps.qword.com-ff6f00)](https://ps.qword.com)
[![Official Site](https://img.shields.io/badge/Official_Site-www.qword.com-1a73e8)](https://www.qword.com)
[![License](https://img.shields.io/badge/license-Open_Source-blue)](#license)
[![Free](https://img.shields.io/badge/Free-No_Watermark_No_Subscription-success)]

🌐 **Main Site:** [https://www.qword.com](https://www.qword.com)  
🎨 **Online Editor:** [https://ps.qword.com](https://ps.qword.com)  
📧 **Email:** nbillgates@gmail.com

<p align="center">
  <img src="https://raw.githubusercontent.com/nbillgates-bot/PhotoQword/main/20261024084043.png" alt="PhotoQword Editor" width="1000"/>
</p>
<!-- Add a real 1280x640 screenshot of the editor UI in your repo's docs/ folder -->

---

## ✨ Why PhotoQword?

### 🔓 1. 100% Fully Open Source — Code Transparency You Can Trust
Unlike other web-based editors that hide behind closed doors, **PhotoQword** is completely open source. Every single line of code is public, auditable, and free to modify. Self-host it, contribute to it, or fork it — the power is in your hands.

### ⚡ 2. Engineered for Large Files — No More Lag, No More Waiting
Traditional browser editors choke and crash when opening heavy PSDs. **PhotoQword** was built from the ground up to solve this:
- **Fast loading**: Large, multi-layer PSD files open quickly without hanging the browser.
- **Butter-smooth zoom & pan**: Even on massive canvases, zooming in/out and panning remains fluid at 60fps. No stutter, no frozen UI.

### 🔤 3. Auto Font Detection & Download — Say Goodbye to Missing Fonts
We've all been there — open a PSD in Photoshop and get bombarded with "missing font" warnings, ruining the layout. **PhotoQword** eliminates this pain:
- **Automatic detection**: Scans PSD files to identify exactly which fonts are required.
- **Auto-download &补齐**: Seamlessly fetches and installs missing fonts on the fly, so your text renders perfectly every time — no manual searching, no broken typography.

---

## 🎨 Core Features

### Layers & Compositing
- Real layer structure: multi-layer, nested groups, lock options, opacity & fill controls.
- **27 Photoshop blending modes**: Normal, Darken, Multiply, Color Burn, Linear Burn, Lighten, Screen, Color Dodge, Linear Dodge (Add), Overlay, Soft Light, Hard Light, Vivid Light, Linear Light, Pin Light, Hard Mix, Difference, Exclusion, Hue, Saturation, Color, Luminosity.
- Raster masks, layer masking, and clipping masks.
- Smart Objects (preserved on import; complex structures rasterized as needed).

### PSD & Image Format Support
- Drag-and-drop **PSD / PSB** with layer structure, text, masks, and layer styles preserved.
- Import: PNG, JPEG, WebP, GIF, BMP.
- Export: PNG / JPG / WebP (flattened), or save as PSD with layers for continued editing in Photoshop.

### Non-Destructive Editing
- Adjustment Layers: Curves, Levels, Hue/Saturation, Brightness/Contrast, Black & White, Gradient Map.
- All adjustments toggleable, reorderable, and maskable at any time.

### Text & Vector
- Edit horizontal/vertical text directly on canvas (font size, tracking, leading, color).
- Vector shapes: Rectangle, Ellipse, Pen tool paths — scale without quality loss.

### Selections & Masking
- Rectangular/Elliptical Marquee, Lasso, Polygonal Lasso, Magic Wand.
- Convert selections to masks with edge refinement for hair-level cutouts.

### History & Projects
- Full history panel — step back to any operation.
- Save projects in native format for future editing.

### Performance & Shortcuts
- GPU-accelerated rendering pipeline.
- Familiar Photoshop shortcuts: `V` (Move), `M` (Marquee), `B` (Brush), `T` (Text), `Ctrl+J` (Duplicate Layer), `Ctrl+Z` (Undo).

---

## 🚀 Local Development (for Developers)
