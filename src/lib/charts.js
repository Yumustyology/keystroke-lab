// Small SVG charts as strings, so the app and the downloaded HTML report draw the same thing.
// Colours for grid and labels come from the .ch-* classes in whichever page shows them.
import { fmtTime } from './replay.js';

const maxOf = (a) => a.reduce((m, x) => (x > m ? x : m), 0);
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}
const n1 = (x) => Math.round(x * 10) / 10;

// points: [{ x, y }], x in ms of session time. trend: optional [{ x, y }] drawn as a line.
export function scatterSvg(points, { width = 720, height = 210, color = '#7c9cff', trend = null, xMax, yMax, unit = 'ms' } = {}) {
  const padL = 48, padR = 12, padT = 10, padB = 26;
  const w = width - padL - padR, h = height - padT - padB;
  const xm = xMax || Math.max(1, maxOf(points.map((p) => p.x)));
  const ym = yMax || niceMax(maxOf(points.map((p) => p.y)));
  const X = (x) => n1(padL + (x / xm) * w);
  const Y = (y) => n1(padT + h - (Math.min(y, ym) / ym) * h);
  let s = `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i <= 4; i++) {
    const v = (ym / 4) * i;
    s += `<line class="ch-grid" x1="${padL}" x2="${width - padR}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    s += `<text class="ch-label" x="${padL - 6}" y="${Y(v) + 3}" text-anchor="end">${Math.round(v)}${i === 4 ? ' ' + unit : ''}</text>`;
  }
  for (let i = 0; i <= 5; i++) {
    const v = (xm / 5) * i;
    s += `<text class="ch-label" x="${X(v)}" y="${height - 8}" text-anchor="${i === 0 ? 'start' : i === 5 ? 'end' : 'middle'}">${fmtTime(v)}</text>`;
  }
  for (const p of points) s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="1.9" fill="${color}" fill-opacity="${p.y > ym ? 0.3 : 0.55}"/>`;
  if (trend && trend.length > 1) s += `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" points="${trend.map((p) => X(p.x) + ',' + Y(p.y)).join(' ')}"/>`;
  return s + '</svg>';
}

// Distribution of values in [0, max]; anything above max lands in the last bar.
export function histogramSvg(values, { max, bins = 30, width = 360, height = 180, color = '#7c9cff', unit = 'ms', median } = {}) {
  const padL = 34, padR = 10, padT = 10, padB = 26;
  const w = width - padL - padR, h = height - padT - padB;
  const mx = max || niceMax(maxOf(values));
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.max(0, Math.floor((v / mx) * bins)))]++;
  const cm = Math.max(1, maxOf(counts));
  const bw = w / bins;
  let s = `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">`;
  s += `<line class="ch-grid" x1="${padL}" x2="${width - padR}" y1="${padT + h}" y2="${padT + h}"/>`;
  s += `<text class="ch-label" x="${padL - 6}" y="${padT + 8}" text-anchor="end">${cm}</text>`;
  s += `<text class="ch-label" x="${padL - 6}" y="${padT + h}" text-anchor="end">0</text>`;
  counts.forEach((c, i) => {
    if (!c) return;
    const bh = (c / cm) * h;
    s += `<rect x="${n1(padL + i * bw + 0.5)}" y="${n1(padT + h - bh)}" width="${n1(Math.max(1, bw - 1))}" height="${n1(bh)}" rx="1.5" fill="${color}" fill-opacity="0.8"/>`;
  });
  for (const [v, anchor, label] of [[0, 'start', '0'], [mx / 2, 'middle', Math.round(mx / 2)], [mx, 'end', mx + '+ ' + unit]]) {
    s += `<text class="ch-label" x="${n1(padL + (v / mx) * w)}" y="${height - 8}" text-anchor="${anchor}">${label}</text>`;
  }
  if (median != null && values.length) {
    const x = n1(padL + (Math.min(median, mx) / mx) * w);
    s += `<line x1="${x}" x2="${x}" y1="${padT}" y2="${padT + h}" stroke="currentColor" stroke-opacity="0.6" stroke-dasharray="3 3"/>`;
    s += `<text class="ch-label" x="${x + 4}" y="${padT + 10}">median ${Math.round(median)}</text>`;
  }
  return s + '</svg>';
}

// Rolling median of y over a window of k points, for the trend line.
export function rollingMedian(points, k = 15) {
  if (points.length < k) return [];
  const out = [];
  for (let i = 0; i + k <= points.length; i += Math.max(1, Math.floor(k / 3))) {
    const win = points.slice(i, i + k).map((p) => p.y).sort((a, b) => a - b);
    out.push({ x: points[i + (k >> 1)].x, y: win[k >> 1] });
  }
  return out;
}

// The three charts every report shows, as SVG strings.
export function reportCharts(report) {
  const iki = report.series.iki.map((p) => ({ x: p.t, y: p.ms }));
  const holds = report.series.holds.map((p) => p.ms);
  const rhythm = report.series.iki.map((p) => p.ms).filter((ms) => ms < 2000);
  return {
    timeline: scatterSvg(iki, { yMax: 1500, trend: rollingMedian(iki), xMax: report.stats.durationMs || undefined }),
    ikiHist: histogramSvg(rhythm, { max: 800, color: '#7c9cff', median: report.stats.ikiMedian }),
    holdHist: histogramSvg(holds, { max: 300, color: '#2dd4bf', median: report.stats.holdMedian })
  };
}
