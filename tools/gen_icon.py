import math, sys

def pin(tx, ty, r, d):
    cx, cy = tx, ty - d
    phi = math.acos(r / d)
    rx, ry = cx + r * math.sin(phi), cy + r * math.cos(phi)
    lx = cx - r * math.sin(phi)
    return cx, cy, f'M{tx:.1f} {ty:.1f} L{rx:.1f} {ry:.1f} A{r:.1f} {r:.1f} 0 1 0 {lx:.1f} {ry:.1f} Z'

NAVY = '#0b1020'
AUTO, RED = '#9dd8ff', '#ff4d5e'
K = 1.22
PX, PY, PR = 256, 262, 232          # planet centre and radius
# The route follows a tilted latitude on the planet's near side.
EX_RX, EX_RY, TILT = 168 * K, 118 * K, -10

def on_route(t_deg):
    t, a = math.radians(t_deg), math.radians(TILT)
    x, y = EX_RX * math.cos(t), EX_RY * math.sin(t)
    return PX + x * math.cos(a) - y * math.sin(a), PY + x * math.sin(a) + y * math.cos(a)

def route_path(t0, t1, steps=48):
    pts = [on_route(t0 + (t1 - t0) * i / steps) for i in range(steps + 1)]
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts)

TS = (178, 134, 90, 46, 2)
start, grill, plan, ship, end = (on_route(t) for t in TS)
out = []
w = out.append
w(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="grill-plan-ship icon: a small planet on a transparent background where a route curves from a red start pin through three checkpoint pins, grill, plan and ship, to a red end pin, while a dashed shortcut for /gps auto goes straight from grill to the end">
  <defs>
    <radialGradient id="globe" cx="0.36" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#34508f"/><stop offset="0.55" stop-color="#1d3263"/><stop offset="1" stop-color="#0f1b3a"/>
    </radialGradient>
    <clipPath id="planet"><circle cx="{PX}" cy="{PY}" r="{PR}"/></clipPath>
    <marker id="head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3" markerHeight="3" orient="auto">
      <path d="M0 0 L10 5 L0 10 z" fill="{AUTO}"/>
    </marker>
  </defs>
''')
# Planet: glow, body, a few meridians and parallels, a soft night side.
w(f'  <circle cx="{PX}" cy="{PY}" r="{PR}" fill="url(#globe)"/>\n')
w('  <g clip-path="url(#planet)" fill="none" stroke="#3d5a9a" stroke-width="3" opacity="0.45">\n')
for ry in (60, 130):
    w(f'    <ellipse cx="{PX}" cy="{PY}" rx="{PR}" ry="{ry}" transform="rotate({TILT} {PX} {PY})"/>\n')
for rx in (70, 140):
    w(f'    <ellipse cx="{PX}" cy="{PY}" rx="{rx:.1f}" ry="{PR}" transform="rotate({TILT} {PX} {PY})"/>\n')
w('  </g>\n')
w(f'  <circle cx="{PX}" cy="{PY}" r="{PR - 2}" fill="none" stroke="#6ea8ff" stroke-width="4" opacity="0.5"/>\n')
# The route along the planet, then the /gps auto shortcut across it.
rp = route_path(TS[0], TS[-1])
w(f'  <path d="{rp}" fill="none" stroke="#22386c" stroke-width="{24 * K:.0f}" stroke-linecap="round" stroke-linejoin="round"/>\n')
w(f'  <path d="{rp}" fill="none" stroke="#9fb0d9" stroke-width="6" stroke-linecap="round" stroke-dasharray="3 16"/>\n')
(gx, gy), (ex, ey) = grill, end
w(f'  <path d="M{gx + 30 * K:.1f} {gy - 64 * K:.1f} Q {PX + 10 * K:.1f} {PY - 120 * K:.1f} {ex - 22 * K:.1f} {ey - 52 * K:.1f}" fill="none" stroke="{AUTO}" stroke-width="13" stroke-linecap="round" stroke-dasharray="20 13" marker-end="url(#head)"/>\n')

def shadow(x, y, rx):
    w(f'  <ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{rx:.1f}" ry="{rx / 3:.1f}" fill="#000" opacity="0.35"/>\n')

glyphs = {
    'flame': '<path d="M0 -34 c18 22 26 36 20 52 a22 22 0 0 1 -40 0 c-5 -12 2 -22 10 -30 c0 10 4 16 10 18 c2 -14 -2 -26 0 -40 z" fill="#0b1020"/>',
    'list': '<g stroke="#0b1020" stroke-width="12" stroke-linecap="round"><line x1="-26" y1="-22" x2="28" y2="-22"/><line x1="-26" y1="0" x2="28" y2="0"/><line x1="-26" y1="22" x2="12" y2="22"/></g>',
    'check': '<path d="M-28 2 l20 20 l36 -42" fill="none" stroke="#0b1020" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>',
}
for tx, ty in (start, end):
    shadow(tx, ty, 14 * K)
    cx, cy, d = pin(tx, ty, 20 * K, 36 * K)
    w(f'  <path d="{d}" fill="{RED}" stroke="{NAVY}" stroke-width="5" stroke-linejoin="round"/>\n')
    w(f'  <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{8 * K:.1f}" fill="#f8fbff"/>\n')
for color, (tx, ty), g in (('#ff7a59', grill, 'flame'), ('#6ea8ff', plan, 'list'), ('#56c596', ship, 'check')):
    shadow(tx, ty, 18 * K)
    cx, cy, d = pin(tx, ty, 33 * K, 56 * K)
    w(f'  <path d="{d}" fill="{color}" stroke="{NAVY}" stroke-width="6" stroke-linejoin="round"/>\n')
    w(f'  <g transform="translate({cx:.1f} {cy:.1f}) scale({0.56 * K:.3f})">{glyphs[g]}</g>\n')
w('</svg>\n')
open(sys.argv[1], 'w').write(''.join(out))
print('start', start, 'grill', grill, 'plan', plan, 'ship', ship, 'end', end)
