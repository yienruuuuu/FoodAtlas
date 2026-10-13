from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / 'public'
ORANGE = (237, 112, 68, 255)
WHITE = (255, 252, 247, 255)

def rounded_rect(x, y, left, top, right, bottom, radius):
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2

def inside(x, y):
    if not rounded_rect(x, y, 0, 0, 512, 512, 82):
        return None
    # Dinner plate and its fine inner rim.
    dx, dy = x - 256, y - 283
    radius = (dx * dx + dy * dy) ** 0.5
    if 139 <= radius <= 159 or 128 <= radius <= 134:
        color = WHITE
    else:
        color = ORANGE
    # Fork at left and spoon at right, drawn above the plate.
    fork = rounded_rect(x, y, 187, 211, 205, 363, 8)
    fork = fork or rounded_rect(x, y, 176, 193, 216, 213, 5)
    fork = fork or any(rounded_rect(x, y, left, 145, left + 8, 205, 4) for left in (178, 190, 202, 214))
    spoon = rounded_rect(x, y, 309, 201, 327, 363, 8)
    spoon = spoon or ((x - 318) ** 2 / 24 ** 2 + (y - 179) ** 2 / 34 ** 2 <= 1)
    return WHITE if fork or spoon else color

def chunk(kind, data):
    body = kind + data
    crc = zlib.crc32(body) & 0xffffffff
    return struct.pack('!I', len(data)) + body + struct.pack('!I', crc)

def make_png(size):
    scale = 512 / size
    pixels = bytearray()
    samples = 4
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            counts = [0, 0, 0, 0]
            for sy in range(samples):
                for sx in range(samples):
                    color = inside((x + (sx + .5) / samples) * scale, (y + (sy + .5) / samples) * scale)
                    if color:
                        counts[0] += color[0]; counts[1] += color[1]; counts[2] += color[2]; counts[3] += color[3]
            pixels.extend(round(value / (samples * samples)) for value in counts)
    header = struct.pack('!2I5B', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(pixels, 9)) + chunk(b'IEND', b'')

ROOT.mkdir(exist_ok=True)
for dimension in (192, 512):
    (ROOT / f'icon-{dimension}.png').write_bytes(make_png(dimension))
