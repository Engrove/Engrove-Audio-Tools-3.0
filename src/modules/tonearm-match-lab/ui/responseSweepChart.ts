import { escapeAttribute, renderText } from '../../../shared/ui/renderSafe';
import {
  calculateResponseSweep,
  type ResponseSweepResult,
  type ResponseSweepPoint,
} from '../engine/responseSweep';
import type { ResonanceInput } from '../engine/resonance';

// ── SVG coordinate constants ─────────────────────────────────────────────────

const VB_W = 440;
const VB_H = 200;
const PX0 = 50;    // left margin — space for y-axis labels
const PX1 = 432;   // right margin
const PY0 = 10;    // top margin
const PY1 = 168;   // bottom margin — space for x-axis labels
const PW = PX1 - PX0;   // 382
const PH = PY1 - PY0;   // 158
const F_MIN = 0.016;
const F_MAX = 31.5;

// ── Module-level sweep cache (updated on every render, read by hover handler) ─

let _sweepCache: ResponseSweepResult | null = null;

export function getLastSweepResult(): ResponseSweepResult | null {
  return _sweepCache;
}

// ── Numeric helpers ──────────────────────────────────────────────────────────

function compact(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.?0+$/, '') || '0';
}

function formatTickLabel(value: number, step: number): string {
  if (value === 0) return '0';
  const decimals = step < 0.01 ? 3 : 2;
  return value.toFixed(decimals);
}

// ── SVG coordinate mapping ───────────────────────────────────────────────────

function xPos(freq: number): number {
  return PX0 + ((freq - F_MIN) / (F_MAX - F_MIN)) * PW;
}

function yPos(value: number, max: number): number {
  if (max <= 0) return PY1;
  return PY1 - (value / max) * PH;
}

// ── Nice axis scaling ────────────────────────────────────────────────────────

function niceScale(peakValue: number): { max: number; ticks: number[]; step: number } {
  const roughStep = peakValue / 3.5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const norm = roughStep / magnitude;
  let step: number;
  if (norm < 1.5) step = magnitude;
  else if (norm < 2.5) step = 2 * magnitude;
  else step = 5 * magnitude;

  // smallest multiple of step strictly above peakValue
  const max = step * Math.ceil(peakValue / step + 1e-9);
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 0.01; t = parseFloat((t + step).toFixed(10))) {
    ticks.push(t);
  }
  return { max, ticks, step };
}

// ── X-axis tick frequencies ──────────────────────────────────────────────────

const X_TICK_HZ = [1, 4, 8, 16] as const;

// ── SVG chart builder ────────────────────────────────────────────────────────

function sweepChartMarkup(options: {
  chartId: string;
  title: string;
  unit: string;
  classModifier: string;
  result: ResponseSweepResult;
  selector: (p: ResponseSweepPoint) => number;
  peakPoint: ResponseSweepPoint;
  safeLimit: number;
}): string {
  const { chartId, title, unit, classModifier, result, selector, peakPoint, safeLimit } = options;

  const peakValue = selector(peakPoint);
  const { max: chartMax, ticks, step } = niceScale(peakValue);

  // ── Polyline ────────────────────────────────────────────────────────────────
  const polylineStr = result.points
    .map((p) => `${xPos(p.frequencyHz).toFixed(2)},${yPos(selector(p), chartMax).toFixed(2)}`)
    .join(' ');

  // ── Peak ────────────────────────────────────────────────────────────────────
  const peakX = xPos(peakPoint.frequencyHz);
  const peakY = yPos(peakValue, chartMax);
  const peakFreqLabel = compact(peakPoint.frequencyHz, 1);
  const peakValLabel = compact(peakValue, 3);
  const peakText = `${peakValLabel} ${unit} @ ${peakFreqLabel} Hz`;

  // Label: left/right side, above/below dot
  const labelRight = peakX <= PX0 + PW / 2;
  const labelBelow = peakY < PY0 + 24;
  const labelX = labelRight ? peakX + 8 : peakX - 8;
  const labelY = labelBelow ? peakY + 13 : peakY - 6;
  const labelAnchor = labelRight ? 'start' : 'end';

  // ── Safe zone ───────────────────────────────────────────────────────────────
  const safeLimitY = yPos(safeLimit, chartMax);
  const safeZoneHeight = Math.max(0, PY1 - safeLimitY);

  // ── Y-axis ──────────────────────────────────────────────────────────────────
  const yAxisMarkup = ticks
    .map((tick) => {
      const y = yPos(tick, chartMax).toFixed(2);
      const label = formatTickLabel(tick, step);
      return `<line class="tm-chart-tick" x1="${PX0 - 3}" y1="${y}" x2="${PX0}" y2="${y}"/>
<text class="tm-chart-tick-label" x="${PX0 - 6}" y="${y}" dy="0.35em" text-anchor="end">${label}</text>`;
    })
    .join('\n');

  // ── Y grid lines (skip the 0-line since that's the axis) ────────────────────
  const yGridMarkup = ticks
    .filter((t) => t > 0)
    .map((tick) => {
      const y = yPos(tick, chartMax).toFixed(2);
      return `<line class="tm-chart-grid-line" x1="${PX0}" y1="${y}" x2="${PX1}" y2="${y}"/>`;
    })
    .join('\n');

  // ── X-axis ──────────────────────────────────────────────────────────────────
  const xAxisMarkup = X_TICK_HZ.map((hz) => {
    const x = xPos(hz).toFixed(2);
    return `<line class="tm-chart-tick" x1="${x}" y1="${PY1}" x2="${x}" y2="${PY1 + 4}"/>
<text class="tm-chart-tick-label" x="${x}" y="${PY1 + 13}" text-anchor="middle">${hz}</text>`;
  }).join('\n');

  const clipId = `${chartId}-clip`;

  return `
<figure class="tm-response-chart tm-response-chart--${escapeAttribute(classModifier)}" data-chart-id="${escapeAttribute(chartId)}">
  <figcaption class="tm-response-chart__caption">
    <strong>${renderText(title)}</strong>
  </figcaption>
  <svg
    viewBox="0 0 ${VB_W} ${VB_H}"
    preserveAspectRatio="none"
    role="img"
    aria-label="${escapeAttribute(`${title}, ${peakText}`)}"
    data-sweep-chart="${escapeAttribute(chartId)}"
    data-chart-max="${escapeAttribute(String(chartMax))}"
    class="tm-response-chart__svg"
  >
    <defs>
      <clipPath id="${escapeAttribute(clipId)}">
        <rect x="${PX0}" y="${PY0}" width="${PW}" height="${PH}"/>
      </clipPath>
    </defs>

    <!-- Safe zone band -->
    <rect
      class="tm-chart-safe-zone"
      x="${PX0}"
      y="${safeLimitY.toFixed(2)}"
      width="${PW}"
      height="${safeZoneHeight.toFixed(2)}"
      clip-path="url(#${escapeAttribute(clipId)})"
    />

    <!-- Safe-limit threshold line -->
    <line
      class="tm-chart-threshold-line"
      x1="${PX0}"
      y1="${safeLimitY.toFixed(2)}"
      x2="${PX1}"
      y2="${safeLimitY.toFixed(2)}"
    />

    <!-- Y grid lines -->
    <g class="tm-chart-grid">${yGridMarkup}</g>

    <!-- Axis border lines -->
    <line class="tm-chart-axis-line" x1="${PX0}" y1="${PY0}" x2="${PX0}" y2="${PY1}"/>
    <line class="tm-chart-axis-line" x1="${PX0}" y1="${PY1}" x2="${PX1}" y2="${PY1}"/>

    <!-- Y-axis unit label -->
    <text class="tm-chart-unit-label" x="6" y="${PY0}" dy="0.35em">${renderText(unit)}</text>

    <!-- Y-axis ticks and labels -->
    <g class="tm-chart-y-axis">${yAxisMarkup}</g>

    <!-- X-axis ticks and labels -->
    <g class="tm-chart-x-axis">
      ${xAxisMarkup}
      <text class="tm-chart-x-unit" x="${PX1}" y="${PY1 + 13}" text-anchor="end">Hz</text>
    </g>

    <!-- Response curve -->
    <polyline
      class="tm-response-chart__curve"
      points="${escapeAttribute(polylineStr)}"
      clip-path="url(#${escapeAttribute(clipId)})"
    />

    <!-- Peak marker -->
    <circle class="tm-chart-peak-dot" cx="${peakX.toFixed(2)}" cy="${peakY.toFixed(2)}" r="4"/>
    <text
      class="tm-chart-peak-label"
      x="${labelX.toFixed(2)}"
      y="${labelY.toFixed(2)}"
      text-anchor="${labelAnchor}"
    >${renderText(peakText)}</text>

    <!-- Crosshair and hover dot (controlled by JS) -->
    <line
      class="tm-chart-crosshair"
      data-chart-crosshair="${escapeAttribute(chartId)}"
      x1="${PX0}"
      y1="${PY0}"
      x2="${PX0}"
      y2="${PY1}"
      visibility="hidden"
    />
    <circle
      class="tm-chart-hover-dot"
      data-chart-hover-dot="${escapeAttribute(chartId)}"
      cx="${PX0}"
      cy="${PY0}"
      r="3.5"
      visibility="hidden"
    />
  </svg>
</figure>`;
}

// ── Panel markup (exported) ───────────────────────────────────────────────────

export function responseSweepPanelMarkup(input: ResonanceInput): string {
  const sweep = calculateResponseSweep({
    ...input,
    qFactor: 3.33,
    stylusAmplitudeMm: 0.1,
    accelerationLimitG: 0.05,
  });

  _sweepCache = sweep;

  const maxDispText =
    `Peak ${compact(sweep.maxDisplacement.displacementMm, 3)} mm` +
    ` @ ${compact(sweep.maxDisplacement.frequencyHz, 1)} Hz`;

  const maxAccelText =
    `Peak ${compact(sweep.maxAcceleration.accelerationG, 3)} g` +
    ` @ ${compact(sweep.maxAcceleration.frequencyHz, 1)} Hz`;

  const accelStatus = sweep.maxAcceleration.accelerationSafe
    ? 'Acceleration within threshold'
    : 'Acceleration exceeds threshold';

  const dispChart = sweepChartMarkup({
    chartId: 'displacement',
    title: 'Displacement at headshell',
    unit: 'mm',
    classModifier: 'displacement',
    result: sweep,
    selector: (p) => p.displacementMm,
    peakPoint: sweep.maxDisplacement,
    safeLimit: sweep.stylusAmplitudeMm,
  });

  const accelChart = sweepChartMarkup({
    chartId: 'acceleration',
    title: 'Acceleration at headshell',
    unit: 'g',
    classModifier: 'acceleration',
    result: sweep,
    selector: (p) => p.accelerationG,
    peakPoint: sweep.maxAcceleration,
    safeLimit: sweep.accelerationLimitG,
  });

  return `
<section class="tm-response-sweep" data-sweep-section aria-label="Tonearm response sweep">
  <div class="tm-response-sweep__header">
    <h3>${renderText('Tonearm Response Sweep')}</h3>
    <p>${renderText('Predicted low-frequency displacement and acceleration from total moving mass, compliance, stylus amplitude and damping assumptions.')}</p>
  </div>

  <div class="tm-response-sweep__metrics">
    <span>
      <strong>${renderText(maxDispText)}</strong>
      <small>${renderText('Predicted headshell displacement')}</small>
    </span>
    <span>
      <strong>${renderText(maxAccelText)}</strong>
      <small>${renderText(accelStatus)}</small>
    </span>
  </div>

  <div class="tm-response-sweep__charts">
    ${dispChart}
    ${accelChart}
  </div>

  <div class="tm-response-sweep__tooltip" data-sweep-tooltip aria-hidden="true"></div>

  <details class="tm-response-sweep__assumptions">
    <summary>${renderText('Advanced response assumptions')}</summary>
    <dl>
      <div><dt>Model</dt><dd>${renderText('Absolute base-excited response')}</dd></div>
      <div><dt>Q factor</dt><dd>${renderText(compact(sweep.qFactor, 2))}</dd></div>
      <div><dt>Stylus amplitude</dt><dd>${renderText(`${compact(sweep.stylusAmplitudeMm, 3)} mm`)}</dd></div>
      <div><dt>Acceleration threshold</dt><dd>${renderText(`${compact(sweep.accelerationLimitG, 3)} g`)}</dd></div>
    </dl>
  </details>
</section>`;
}

// ── Hover interaction ────────────────────────────────────────────────────────

function findNearestPointIndex(points: ResponseSweepPoint[], freq: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].frequencyHz < freq) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1].frequencyHz - freq) < Math.abs(points[lo].frequencyHz - freq)) {
    return lo - 1;
  }
  return lo;
}

function updateCrosshairs(section: HTMLElement, point: ResponseSweepPoint): void {
  const cx = xPos(point.frequencyHz).toFixed(2);

  const dispSvg = section.querySelector<SVGSVGElement>('[data-sweep-chart="displacement"]');
  if (dispSvg) {
    const dispMax = parseFloat(dispSvg.dataset.chartMax ?? '1');
    const cy = yPos(point.displacementMm, dispMax).toFixed(2);
    dispSvg.querySelector('[data-chart-crosshair="displacement"]')?.setAttribute('x1', cx);
    dispSvg.querySelector('[data-chart-crosshair="displacement"]')?.setAttribute('x2', cx);
    dispSvg.querySelector('[data-chart-crosshair="displacement"]')?.setAttribute('visibility', 'visible');
    const dot = dispSvg.querySelector('[data-chart-hover-dot="displacement"]');
    dot?.setAttribute('cx', cx);
    dot?.setAttribute('cy', cy);
    dot?.setAttribute('visibility', 'visible');
  }

  const accelSvg = section.querySelector<SVGSVGElement>('[data-sweep-chart="acceleration"]');
  if (accelSvg) {
    const accelMax = parseFloat(accelSvg.dataset.chartMax ?? '1');
    const cy = yPos(point.accelerationG, accelMax).toFixed(2);
    accelSvg.querySelector('[data-chart-crosshair="acceleration"]')?.setAttribute('x1', cx);
    accelSvg.querySelector('[data-chart-crosshair="acceleration"]')?.setAttribute('x2', cx);
    accelSvg.querySelector('[data-chart-crosshair="acceleration"]')?.setAttribute('visibility', 'visible');
    const dot = accelSvg.querySelector('[data-chart-hover-dot="acceleration"]');
    dot?.setAttribute('cx', cx);
    dot?.setAttribute('cy', cy);
    dot?.setAttribute('visibility', 'visible');
  }
}

function hideTooltipAndCrosshairs(section: HTMLElement): void {
  const tooltip = section.querySelector<HTMLElement>('[data-sweep-tooltip]');
  if (tooltip) tooltip.classList.remove('is-visible');
  for (const el of section.querySelectorAll('[data-chart-crosshair], [data-chart-hover-dot]')) {
    (el as Element).setAttribute('visibility', 'hidden');
  }
}

function showTooltip(
  section: HTMLElement,
  point: ResponseSweepPoint,
  event: MouseEvent,
): void {
  const tooltip = section.querySelector<HTMLElement>('[data-sweep-tooltip]');
  if (!tooltip) return;

  const statusLabel = point.accelerationSafe ? 'Within threshold' : 'Above threshold';
  const statusClass = point.accelerationSafe ? '' : ' tm-tooltip-status--warn';

  tooltip.innerHTML =
    `<div class="tm-tooltip-row"><span class="tm-tooltip-label">Frequency</span>` +
    `<span class="tm-tooltip-value">${point.frequencyHz.toFixed(1)} Hz</span></div>` +
    `<div class="tm-tooltip-row"><span class="tm-tooltip-label">Displacement</span>` +
    `<span class="tm-tooltip-value">${point.displacementMm.toFixed(3)} mm</span></div>` +
    `<div class="tm-tooltip-row"><span class="tm-tooltip-label">Acceleration</span>` +
    `<span class="tm-tooltip-value">${point.accelerationG.toFixed(3)} g</span></div>` +
    `<div class="tm-tooltip-row"><span class="tm-tooltip-label">Transmissibility</span>` +
    `<span class="tm-tooltip-value">${point.transmissibility.toFixed(2)}×</span></div>` +
    `<div class="tm-tooltip-status${statusClass}">${statusLabel}</div>`;

  tooltip.classList.add('is-visible');

  const sRect = section.getBoundingClientRect();
  let x = event.clientX - sRect.left + 16;
  const y = Math.max(8, event.clientY - sRect.top - 12);
  const approxWidth = 200;
  if (x + approxWidth > sRect.width - 8) {
    x = event.clientX - sRect.left - approxWidth - 16;
  }
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function handleSweepMouseMove(this: HTMLElement, event: MouseEvent): void {
  const target = event.target as Element;

  if (target.closest('[data-sweep-tooltip]')) return;

  const svgEl = target.closest<SVGSVGElement>('[data-sweep-chart]');
  const section = this.querySelector<HTMLElement>('[data-sweep-section]');

  if (!svgEl || !section) {
    if (section) hideTooltipAndCrosshairs(section);
    return;
  }

  const sweep = _sweepCache;
  if (!sweep || sweep.points.length === 0) return;

  const rect = svgEl.getBoundingClientRect();
  const relX = (event.clientX - rect.left) / rect.width;
  const svgX = relX * VB_W;

  if (svgX < PX0 - 8 || svgX > PX1 + 8) {
    hideTooltipAndCrosshairs(section);
    return;
  }

  const freq = F_MIN + ((Math.max(PX0, Math.min(PX1, svgX)) - PX0) / PW) * (F_MAX - F_MIN);
  const idx = findNearestPointIndex(sweep.points, freq);
  const point = sweep.points[idx];

  updateCrosshairs(section, point);
  showTooltip(section, point, event);
}

function handleSweepMouseLeave(this: HTMLElement): void {
  const section = this.querySelector<HTMLElement>('[data-sweep-section]');
  if (section) hideTooltipAndCrosshairs(section);
}

export function enableSweepChartHover(resultElement: HTMLElement): void {
  resultElement.addEventListener('mousemove', handleSweepMouseMove);
  resultElement.addEventListener('mouseleave', handleSweepMouseLeave);
}
