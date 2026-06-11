#!/usr/bin/env python3
"""Generate PWA icons (dark square with a warm circle) using only the stdlib."""
import zlib
import struct
import os


def make_png(path, size, bg, fg):
    cx = cy = size / 2
    r = size * 0.28
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # PNG filter type 0 (None) per scanline
        for x in range(size):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            inside = (dx * dx + dy * dy) <= r * r
            raw += bytes(fg if inside else bg)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    idat = zlib.compress(bytes(raw), 9)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", idat)
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    os.makedirs("icons", exist_ok=True)
    bg = (10, 8, 5)       # near-black warm
    fg = (200, 134, 46)   # CRT amber
    make_png("icons/icon-192.png", 192, bg, fg)
    make_png("icons/icon-512.png", 512, bg, fg)
    print("icons written")
