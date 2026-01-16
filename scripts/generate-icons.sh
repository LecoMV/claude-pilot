#!/bin/bash
set -euo pipefail

# Icon generation script for Claude Pilot
# Requires: ImageMagick (convert), librsvg2-bin (rsvg-convert)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/build"
ICONS_DIR="$BUILD_DIR/icons"
SOURCE_SVG="$ICONS_DIR/icon.svg"
SOURCE_PNG="$ICONS_DIR/icon.png"

# Create icons directory if it doesn't exist
mkdir -p "$ICONS_DIR"

echo "Generating icons for Claude Pilot..."

# Check for required tools
if ! command -v convert &> /dev/null; then
    echo "Warning: ImageMagick not found. Install with: sudo apt install imagemagick"
fi

if ! command -v rsvg-convert &> /dev/null; then
    echo "Warning: rsvg-convert not found. Install with: sudo apt install librsvg2-bin"
fi

# Generate PNG icons from SVG at various sizes (if rsvg-convert available)
if command -v rsvg-convert &> /dev/null && [ -f "$SOURCE_SVG" ]; then
    echo "Generating PNGs from SVG..."
    for size in 16 24 32 48 64 128 256 512 1024; do
        rsvg-convert -w $size -h $size "$SOURCE_SVG" -o "$ICONS_DIR/${size}x${size}.png"
        echo "  Created ${size}x${size}.png"
    done
fi

# Generate ICO file for Windows (if ImageMagick available)
if command -v convert &> /dev/null; then
    echo "Generating Windows ICO..."
    if [ -f "$ICONS_DIR/256x256.png" ]; then
        convert "$ICONS_DIR/16x16.png" "$ICONS_DIR/24x24.png" "$ICONS_DIR/32x32.png" \
                "$ICONS_DIR/48x48.png" "$ICONS_DIR/64x64.png" "$ICONS_DIR/128x128.png" \
                "$ICONS_DIR/256x256.png" "$ICONS_DIR/icon.ico"
        echo "  Created icon.ico"
    elif [ -f "$SOURCE_PNG" ]; then
        convert "$SOURCE_PNG" -resize 256x256 "$ICONS_DIR/icon.ico"
        echo "  Created icon.ico from source PNG"
    fi
fi

# Generate ICNS file for macOS (requires iconutil on macOS)
# For Linux, we'll create a .iconset that can be converted on macOS
if [ -f "$ICONS_DIR/1024x1024.png" ]; then
    echo "Preparing macOS iconset..."
    ICONSET_DIR="$ICONS_DIR/icon.iconset"
    mkdir -p "$ICONSET_DIR"

    cp "$ICONS_DIR/16x16.png" "$ICONSET_DIR/icon_16x16.png"
    cp "$ICONS_DIR/32x32.png" "$ICONSET_DIR/icon_16x16@2x.png"
    cp "$ICONS_DIR/32x32.png" "$ICONSET_DIR/icon_32x32.png"
    cp "$ICONS_DIR/64x64.png" "$ICONSET_DIR/icon_32x32@2x.png"
    cp "$ICONS_DIR/128x128.png" "$ICONSET_DIR/icon_128x128.png"
    cp "$ICONS_DIR/256x256.png" "$ICONSET_DIR/icon_128x128@2x.png"
    cp "$ICONS_DIR/256x256.png" "$ICONSET_DIR/icon_256x256.png"
    cp "$ICONS_DIR/512x512.png" "$ICONSET_DIR/icon_256x256@2x.png"
    cp "$ICONS_DIR/512x512.png" "$ICONSET_DIR/icon_512x512.png"
    cp "$ICONS_DIR/1024x1024.png" "$ICONSET_DIR/icon_512x512@2x.png"

    echo "  Created icon.iconset directory"
    echo "  Note: Run 'iconutil -c icns icon.iconset' on macOS to create icon.icns"

    # On macOS, convert to icns
    if command -v iconutil &> /dev/null; then
        iconutil -c icns "$ICONSET_DIR" -o "$ICONS_DIR/icon.icns"
        echo "  Created icon.icns"
        rm -rf "$ICONSET_DIR"
    fi
fi

echo ""
echo "Icon generation complete!"
echo "Generated files in: $ICONS_DIR"
ls -la "$ICONS_DIR"
