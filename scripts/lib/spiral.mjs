/**
 * Golden-spiral construction drawing, the site's signature visual. It is
 * derived from the Jarvees spiral mark: a golden rectangle is cut into
 * squares (each φ times smaller) and a quarter arc is drawn in every square.
 * Returns plain SVG markup; geometry is computed at build time.
 */
const PHI = (1 + Math.sqrt(5)) / 2;
const r = (n) => Math.round(n * 100) / 100;

/**
 * @param {object} o
 * @param {number} o.height  drawing height in SVG units (width is height × φ)
 * @param {number} o.steps   number of squares
 * @param {number} o.tags    number the first N squares (01, 02…) to pair with a legend
 */
export function spiralSvg({ height = 400, steps = 10, className = 'spiral', tags = 0 } = {}) {
  let x = 0;
  let y = 0;
  let w = height * PHI;
  let h = height;
  const squares = [];
  let path = `M${r(x)} ${r(y + h)}`;
  for (let i = 0; i < steps; i++) {
    const dir = i % 4;
    if (dir === 0) {
      const s = h; // square on the left
      squares.push([x, y, s]);
      path += ` A${r(s)} ${r(s)} 0 0 1 ${r(x + s)} ${r(y)}`;
      x += s;
      w -= s;
    } else if (dir === 1) {
      const s = w; // square on top
      squares.push([x, y, s]);
      path += ` A${r(s)} ${r(s)} 0 0 1 ${r(x + s)} ${r(y + s)}`;
      y += s;
      h -= s;
    } else if (dir === 2) {
      const s = h; // square on the right
      squares.push([x + w - s, y, s]);
      path += ` A${r(s)} ${r(s)} 0 0 1 ${r(x + w - s)} ${r(y + s)}`;
      w -= s;
    } else {
      const s = w; // square at the bottom
      squares.push([x, y + h - s, s]);
      path += ` A${r(s)} ${r(s)} 0 0 1 ${r(x)} ${r(y + h - s)}`;
      h -= s;
    }
  }
  const W = r(height * PHI);
  const eye = [r(x + w / 2), r(y + h / 2)];
  const grid = squares
    .map(([sx, sy, s], i) => `<rect class="spiral__sq" x="${r(sx)}" y="${r(sy)}" width="${r(s)}" height="${r(s)}" style="--i:${i}"/>`)
    .join('');
  // Number tags sit in the quiet corner of each square (beside the arc's centre).
  const fs = r(height * 0.045);
  const tagMarkup = squares
    .slice(0, tags)
    .map(([sx, sy, s], i) => {
      const pad = Math.max(s * 0.07, fs * 0.6);
      const right = i % 4 === 0 || i % 4 === 3;
      const bottom = i % 4 === 0 || i % 4 === 1;
      const tx = right ? sx + s - pad : sx + pad;
      const ty = bottom ? sy + s - pad : sy + pad + fs;
      return `<text class="spiral__tag" x="${r(tx)}" y="${r(ty)}" font-size="${fs}" text-anchor="${right ? 'end' : 'start'}">${String(i + 1).padStart(2, '0')}</text>`;
    })
    .join('');
  return `<svg class="${className}" viewBox="-1 -1 ${W + 2} ${height + 2}" aria-hidden="true" focusable="false">
  <g class="spiral__grid">${grid}</g>
  <path class="spiral__arc" d="${path}" pathLength="1"/>
  <circle class="spiral__eye" cx="${eye[0]}" cy="${eye[1]}" r="${r(height * 0.018)}"/>${tagMarkup ? `\n  <g>${tagMarkup}</g>` : ''}
</svg>`;
}
