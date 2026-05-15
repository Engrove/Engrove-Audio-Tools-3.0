import {
  sampleBehaviorContext,
  calcOffsetBurden,
  type BehaviorContextInput,
  type BehaviorSample,
  type StylusProfile,
  type WarpSeverity,
} from '../engine/behaviorContext';
import {
  sampleTrackingGeometry,
  calcRmsTrackingError,
  calcMaxTrackingError,
  findNullPoints,
} from '../engine/geometry';
import {
  classifyRisk,
  buildBehaviorInterpretation,
} from '../engine/behaviorScoring';
import type { ReferenceGeometry } from '../engine/geometry';

export type BehaviorContextState = {
  eccentricityMm: number;
  warpSeverity: WarpSeverity;
  stylusProfile: StylusProfile;
  angularErrorThresholdDeg: number;
  innerGrooveMm: number;
  outerGrooveMm: number;
  rpm: number;
};

export const defaultBehaviorState = (): BehaviorContextState => ({
  eccentricityMm: 0.25,
  warpSeverity: 'medium',
  stylusProfile: 'elliptical',
  angularErrorThresholdDeg: 1.5,
  innerGrooveMm: 60.325,
  outerGrooveMm: 146.05,
  rpm: 33.333,
});

export function behaviorContextTabMarkup(): string {
  return `
    <div class="geo-bctx" data-geo-view="behavior" hidden>
      <div class="geo-bctx-disclaimer" role="note" aria-label="Model layer notice">
        <span class="geo-truth-badge geo-truth-badge--model">MODEL</span>
        <p>Behavior Context is a model layer. It does not predict measured THD. It explains which assumptions and risk factors sit around the geometry.</p>
      </div>

      <div class="geo-bctx-grid">
        <section class="geo-bctx-controls ea-panel" aria-labelledby="bctx-inputs-title">
          <div class="ea-panel-header">
            <span class="ea-panel-header-id">BC</span>
            <span id="bctx-inputs-title">Behavior Context inputs</span>
          </div>
          <div class="ea-panel-body--flush">
            <table class="ea-form-table" aria-label="Behavior context parameters">
              <tbody>
                <tr>
                  <td class="ea-col-status"><span class="ea-dot ea-dot--done" aria-hidden="true"></span></td>
                  <td class="ea-col-label">Eccentricity
                    <span class="ea-form-table-sublabel">Record center offset</span>
                  </td>
                  <td class="ea-col-value">
                    <input class="ea-input geo-input" type="number" inputmode="decimal" step="0.05" min="0" max="2"
                      value="0.25" data-bctx-eccentricity aria-label="Record eccentricity in millimetres" />
                  </td>
                  <td class="ea-col-meta">
                    <span class="ea-badge">mm</span>
                    <span class="geo-truth-badge geo-truth-badge--model" aria-label="Model">M</span>
                  </td>
                </tr>
                <tr>
                  <td class="ea-col-status"><span class="ea-dot ea-dot--done" aria-hidden="true"></span></td>
                  <td class="ea-col-label">Warp severity
                    <span class="ea-form-table-sublabel">Record flatness estimate</span>
                  </td>
                  <td class="ea-col-value">
                    <select class="ea-input" data-bctx-warp aria-label="Warp severity">
                      <option value="low">Low</option>
                      <option value="medium" selected>Medium</option>
                      <option value="high">High</option>
                    </select>
                  </td>
                  <td class="ea-col-meta">
                    <span class="geo-truth-badge geo-truth-badge--model" aria-label="Model">M</span>
                  </td>
                </tr>
                <tr>
                  <td class="ea-col-status"><span class="ea-dot ea-dot--done" aria-hidden="true"></span></td>
                  <td class="ea-col-label">Stylus profile
                    <span class="ea-form-table-sublabel">Contact geometry</span>
                  </td>
                  <td class="ea-col-value">
                    <select class="ea-input" data-bctx-stylus aria-label="Stylus profile">
                      <option value="unknown">Unknown</option>
                      <option value="conical">Conical</option>
                      <option value="elliptical" selected>Elliptical</option>
                      <option value="line-contact">Line-contact</option>
                      <option value="microline">Microline</option>
                    </select>
                  </td>
                  <td class="ea-col-meta">
                    <span class="geo-truth-badge geo-truth-badge--model" aria-label="Model">M</span>
                  </td>
                </tr>
                <tr>
                  <td class="ea-col-status"><span class="ea-dot ea-dot--done" aria-hidden="true"></span></td>
                  <td class="ea-col-label">Angular threshold
                    <span class="ea-form-table-sublabel">Error below this is not penalised</span>
                  </td>
                  <td class="ea-col-value">
                    <input class="ea-input geo-input" type="number" inputmode="decimal" step="0.1" min="0" max="5"
                      value="1.5" data-bctx-threshold aria-label="Angular error threshold in degrees" />
                  </td>
                  <td class="ea-col-meta">
                    <span class="ea-badge">deg</span>
                    <span class="geo-truth-badge geo-truth-badge--model" aria-label="Model">M</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="geo-bctx-score-panel ea-panel" aria-labelledby="bctx-score-title" aria-live="polite">
          <div class="ea-panel-header">
            <span class="ea-panel-header-id">RI</span>
            <span id="bctx-score-title">Risk index</span>
            <span class="ea-panel-header-spacer"></span>
            <span class="geo-truth-badge geo-truth-badge--model">MODEL</span>
          </div>
          <div class="ea-panel-body geo-bctx-score-body">
            <div class="geo-risk-score" data-bctx-score-display>
              <span class="geo-risk-score-value" data-bctx-score-value>—</span>
              <span class="geo-risk-score-label" data-bctx-score-label>—</span>
            </div>
            <div class="geo-risk-meters" data-bctx-meters>
              <div class="geo-risk-meter">
                <span class="geo-risk-meter-label">Scrub proxy</span>
                <div class="geo-risk-bar-wrap"><div class="geo-risk-bar" data-bctx-bar="scrub"></div></div>
                <span class="geo-risk-meter-val" data-bctx-val="scrub">—</span>
              </div>
              <div class="geo-risk-meter">
                <span class="geo-risk-meter-label">Velocity sensitivity</span>
                <div class="geo-risk-bar-wrap"><div class="geo-risk-bar" data-bctx-bar="velocity"></div></div>
                <span class="geo-risk-meter-val" data-bctx-val="velocity">—</span>
              </div>
              <div class="geo-risk-meter">
                <span class="geo-risk-meter-label">Angular error (above threshold)</span>
                <div class="geo-risk-bar-wrap"><div class="geo-risk-bar" data-bctx-bar="angular"></div></div>
                <span class="geo-risk-meter-val" data-bctx-val="angular">—</span>
              </div>
              <div class="geo-risk-meter">
                <span class="geo-risk-meter-label">Eccentricity / warp</span>
                <div class="geo-risk-bar-wrap"><div class="geo-risk-bar" data-bctx-bar="eccwarp"></div></div>
                <span class="geo-risk-meter-val" data-bctx-val="eccwarp">—</span>
              </div>
            </div>
            <div class="geo-bctx-interpretation" data-bctx-interpretation></div>
          </div>
        </section>
      </div>

      <section class="geo-bctx-graph-panel ea-panel" aria-labelledby="bctx-graph-title">
        <div class="ea-panel-header">
          <span class="ea-panel-header-id">G2</span>
          <span id="bctx-graph-title">Behavior Context overlay</span>
          <span class="ea-panel-header-spacer"></span>
          <span class="geo-truth-badge geo-truth-badge--formula">FORMULA</span>
          <span class="geo-truth-badge geo-truth-badge--model">MODEL</span>
        </div>
        <div class="ea-panel-body geo-bctx-graph-body">
          <p class="geo-bctx-graph-disclaimer ea-muted">
            Calculated angular tracking error. Not a measured distortion curve. Not an audible-quality prediction.
          </p>
          <canvas data-bctx-canvas="overlay" role="img"
            aria-label="Behavior context overlay: tracking error and modelled risk vs groove radius"></canvas>
        </div>
      </section>

      <section class="geo-bctx-stack-panel ea-panel" aria-labelledby="bctx-stack-title">
        <div class="ea-panel-header">
          <span class="ea-panel-header-id">G3</span>
          <span id="bctx-stack-title">Risk component contributions</span>
          <span class="ea-panel-header-spacer"></span>
          <span class="geo-truth-badge geo-truth-badge--model">MODEL</span>
        </div>
        <div class="ea-panel-body geo-bctx-graph-body">
          <canvas data-bctx-canvas="stack" role="img"
            aria-label="Stacked risk component contributions vs groove radius"></canvas>
        </div>
      </section>

      <section class="geo-bctx-inner-panel ea-panel" aria-labelledby="bctx-inner-title">
        <div class="ea-panel-header">
          <span class="ea-panel-header-id">G4</span>
          <span id="bctx-inner-title">Inner-groove microscope</span>
          <span class="ea-panel-header-spacer"></span>
          <span class="geo-truth-badge geo-truth-badge--model">MODEL</span>
        </div>
        <div class="ea-panel-body geo-bctx-graph-body">
          <p class="geo-bctx-graph-disclaimer ea-muted">
            Inner grooves combine lower linear velocity with proportionally larger eccentricity effect and any remaining angular error.
          </p>
          <canvas data-bctx-canvas="inner" role="img"
            aria-label="Inner-groove microscope: risk factors in the inner 75–55 mm zone"></canvas>
        </div>
      </section>

      <section class="geo-bctx-assumption ea-panel" aria-labelledby="bctx-assumption-title">
        <div class="ea-panel-header">
          <span class="ea-panel-header-id">AS</span>
          <span id="bctx-assumption-title">Assumption inspector</span>
        </div>
        <div class="ea-panel-body geo-bctx-assumption-body">
          <dl class="geo-assumption-dl">
            <div class="geo-assumption-group">
              <dt>Calculated (FORMULA)</dt>
              <dd>Tracking-angle error at each groove radius</dd>
              <dd>Groove linear velocity</dd>
              <dd>Null-point crossing radii</dd>
            </div>
            <div class="geo-assumption-group">
              <dt>Modelled (MODEL)</dt>
              <dd>Scrub proxy — offset × velocity × eccentricity × warp context</dd>
              <dd>Offset burden — offset angle relative to 25° reference</dd>
              <dd>Eccentricity / warp sensitivity — proxy, not measured</dd>
              <dd>Stylus profile factor — initial model values, not empirically verified</dd>
              <dd>Total behavior risk — weighted combination of the above</dd>
            </div>
            <div class="geo-assumption-group">
              <dt>Not claimed</dt>
              <dd>THD prediction</dd>
              <dd>Audible-quality ranking</dd>
              <dd>Proof that any alignment is superior</dd>
              <dd>Korf theory verification</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  `;
}

function setupBctxCanvas(
  canvas: HTMLCanvasElement | null,
): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  if (!canvas || !canvas.parentElement) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, canvas.parentElement.clientWidth);
  const h = Math.max(1, canvas.parentElement.clientHeight);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function isDark(): boolean {
  return document.documentElement.dataset.theme !== 'light';
}

function drawOverlayGraph(
  canvas: HTMLCanvasElement | null,
  samples: BehaviorSample[],
  innerMm: number,
  outerMm: number,
): void {
  const setup = setupBctxCanvas(canvas);
  if (!setup || samples.length === 0) return;
  const { ctx, w, h } = setup;
  const dark = isDark();
  const cGrid = dark ? '#2a2f37' : '#e6e8ec';
  const cText = dark ? '#9098a3' : '#5a606b';
  const cErr = '#f2b837';
  const cRisk = '#d05050';
  const cVel = '#5a98e0';
  const cScrub = '#9b59b6';

  const padX = 56, padY = 40;
  const gW = Math.max(0, w - padX * 2);
  const gH = Math.max(0, h - padY * 2);

  ctx.clearRect(0, 0, w, h);

  const mapX = (r: number) => padX + ((r - innerMm) / (outerMm - innerMm)) * gW;
  const mapY = (v: number, lo: number, hi: number) => padY + gH - ((v - lo) / (hi - lo)) * gH;

  const maxErr = Math.max(
    ...samples.map((s) => Math.abs(s.angularErrorDeg)),
    1,
  );

  ctx.strokeStyle = cGrid;
  ctx.lineWidth = 1;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillStyle = cText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let r = Math.ceil(innerMm / 10) * 10; r <= outerMm; r += 20) {
    const x = mapX(r);
    ctx.beginPath();
    ctx.moveTo(x, padY);
    ctx.lineTo(x, h - padY);
    ctx.stroke();
    ctx.fillText(`${r}`, x, h - padY + 4);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = (i / 4) * maxErr;
    const y = mapY(v, 0, maxErr);
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(w - padX, y);
    ctx.stroke();
    ctx.fillStyle = cErr;
    ctx.fillText(`${v.toFixed(1)}°`, padX - 4, y);
  }

  const drawLine = (
    pts: BehaviorSample[],
    pick: (s: BehaviorSample) => number,
    lo: number,
    hi: number,
    color: string,
    width: number,
    dashed: boolean,
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.beginPath();
    pts.forEach((s, i) => {
      const x = mapX(s.radiusMm);
      const y = mapY(pick(s), lo, hi);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };

  drawLine(samples, (s) => Math.abs(s.angularErrorDeg), 0, maxErr, cErr, 2, false);
  drawLine(samples, (s) => s.totalBehaviorRisk * maxErr, 0, maxErr, cRisk, 2, true);
  drawLine(samples, (s) => (s.velocityPenalty - 1) * maxErr * 0.5, 0, maxErr, cVel, 1.5, true);
  drawLine(samples, (s) => s.scrubProxy * maxErr * 0.3, 0, maxErr, cScrub, 1.5, true);

  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = cErr;   ctx.fillText('Angular error (FORMULA)', padX + 8, padY + 4);
  ctx.fillStyle = cRisk;  ctx.fillText('Total risk (MODEL)', padX + 8, padY + 18);
  ctx.fillStyle = cVel;   ctx.fillText('Velocity sensitivity (MODEL)', padX + 8, padY + 32);
  ctx.fillStyle = cScrub; ctx.fillText('Scrub proxy (MODEL)', padX + 8, padY + 46);
}

function drawStackGraph(
  canvas: HTMLCanvasElement | null,
  samples: BehaviorSample[],
  innerMm: number,
  outerMm: number,
): void {
  const setup = setupBctxCanvas(canvas);
  if (!setup || samples.length === 0) return;
  const { ctx, w, h } = setup;
  const dark = isDark();
  const cGrid = dark ? '#2a2f37' : '#e6e8ec';
  const cText = dark ? '#9098a3' : '#5a606b';
  const padX = 56, padY = 40;
  const gW = Math.max(0, w - padX * 2);
  const gH = Math.max(0, h - padY * 2);
  const colors = ['#9b59b6', '#5a98e0', '#f2b837', '#4ab86a'];
  const labels = ['Scrub (MODEL)', 'Velocity (MODEL)', 'Angular (MODEL)', 'Ecc/Warp (MODEL)'];

  ctx.clearRect(0, 0, w, h);

  const mapX = (r: number) => padX + ((r - innerMm) / (outerMm - innerMm)) * gW;

  ctx.strokeStyle = cGrid;
  ctx.lineWidth = 1;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillStyle = cText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let r = Math.ceil(innerMm / 10) * 10; r <= outerMm; r += 20) {
    const x = mapX(r);
    ctx.beginPath();
    ctx.moveTo(x, padY);
    ctx.lineTo(x, h - padY);
    ctx.stroke();
    ctx.fillText(`${r}`, x, h - padY + 4);
  }

  const picks: Array<(s: BehaviorSample) => number> = [
    (s) => Math.min(1, s.scrubProxy / 2.5) * 0.35,
    (s) => Math.min(1, Math.max(0, s.velocityPenalty - 1) / 1.5) * 0.25,
    (s) => Math.min(1, s.angularThresholdPenalty) * 0.25,
    (s) => Math.min(1, s.eccentricityPenalty * s.warpFactor) * 0.15,
  ];

  for (let ci = colors.length - 1; ci >= 0; ci--) {
    ctx.fillStyle = colors[ci] + '88';
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = mapX(s.radiusMm);
      let base = padY + gH;
      for (let k = 0; k < ci; k++) base -= picks[k](s) * gH;
      const top = base - picks[ci](s) * gH;
      if (i === 0) {
        ctx.moveTo(x, base);
        ctx.lineTo(x, top);
      } else {
        ctx.lineTo(x, top);
      }
    });
    for (let i = samples.length - 1; i >= 0; i--) {
      const s = samples[i];
      const x = mapX(s.radiusMm);
      let base = padY + gH;
      for (let k = 0; k < ci; k++) base -= picks[k](s) * gH;
      ctx.lineTo(x, base);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  labels.forEach((lbl, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillText(lbl, padX + 8, padY + 4 + i * 14);
  });
}

function drawInnerMicroscope(
  canvas: HTMLCanvasElement | null,
  samples: BehaviorSample[],
  innerGrooveMm: number,
): void {
  const setup = setupBctxCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const dark = isDark();
  const cGrid = dark ? '#2a2f37' : '#e6e8ec';
  const cText = dark ? '#9098a3' : '#5a606b';

  const zoneInner = innerGrooveMm;
  const zoneOuter = Math.min(innerGrooveMm + 20, samples[0]?.radiusMm ?? innerGrooveMm + 20);
  const zone = samples.filter((s) => s.radiusMm >= zoneInner && s.radiusMm <= zoneOuter);

  const padX = 56, padY = 40;
  const gW = Math.max(0, w - padX * 2);
  const gH = Math.max(0, h - padY * 2);

  ctx.clearRect(0, 0, w, h);

  if (zone.length === 0) {
    ctx.fillStyle = cText;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No inner-groove samples in range.', w / 2, h / 2);
    return;
  }

  const rMin = zoneInner;
  const rMax = zoneOuter;
  const mapX = (r: number) => padX + ((r - rMin) / Math.max(rMax - rMin, 1)) * gW;

  const maxErr = Math.max(...zone.map((s) => Math.abs(s.angularErrorDeg)), 0.5);
  const maxVel = Math.max(...zone.map((s) => s.velocityPenalty), 1.5);
  const maxScrub = Math.max(...zone.map((s) => s.scrubProxy), 0.5);

  const scale = Math.max(maxErr, maxVel, maxScrub, 1);
  const mapY = (v: number) => padY + gH - (v / scale) * gH;

  ctx.strokeStyle = cGrid;
  ctx.lineWidth = 1;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillStyle = cText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let r = Math.ceil(rMin / 5) * 5; r <= rMax + 0.5; r += 5) {
    const x = mapX(r);
    ctx.beginPath();
    ctx.moveTo(x, padY);
    ctx.lineTo(x, h - padY);
    ctx.stroke();
    ctx.fillStyle = cText;
    ctx.fillText(`${r.toFixed(0)}`, x, h - padY + 4);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = (i / 4) * scale;
    const y = mapY(v);
    ctx.strokeStyle = cGrid;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(w - padX, y);
    ctx.stroke();
    ctx.fillStyle = cText;
    ctx.fillText(v.toFixed(1), padX - 4, y);
  }

  const drawLine = (
    pts: BehaviorSample[],
    pick: (s: BehaviorSample) => number,
    color: string,
    width: number,
    dashed = false,
  ) => {
    if (pts.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dashed ? [4, 3] : []);
    ctx.beginPath();
    pts.forEach((s, i) => {
      const x = mapX(s.radiusMm);
      const y = mapY(pick(s));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };

  drawLine(zone, (s) => Math.abs(s.angularErrorDeg), '#f2b837', 2);
  drawLine(zone, (s) => s.velocityPenalty, '#5a98e0', 2, true);
  drawLine(zone, (s) => s.eccentricityPenalty / 100 * scale, '#4ab86a', 1.5, true);
  drawLine(zone, (s) => s.scrubProxy, '#9b59b6', 2);
  drawLine(zone, (s) => s.totalBehaviorRisk * scale, '#d05050', 2, true);

  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const legend = [
    ['Angular error (FORMULA)', '#f2b837'],
    ['Velocity penalty (MODEL)', '#5a98e0'],
    ['Eccentricity (MODEL)', '#4ab86a'],
    ['Scrub proxy (MODEL)', '#9b59b6'],
    ['Total risk (MODEL)', '#d05050'],
  ] as const;
  legend.forEach(([lbl, col], i) => {
    ctx.fillStyle = col;
    ctx.fillText(lbl, padX + 8, padY + 4 + i * 14);
  });
}

export type BctxElements = {
  canvasOverlay: HTMLCanvasElement | null;
  canvasStack: HTMLCanvasElement | null;
  canvasInner: HTMLCanvasElement | null;
  scoreValue: HTMLElement | null;
  scoreLabel: HTMLElement | null;
  barScrub: HTMLElement | null;
  barVelocity: HTMLElement | null;
  barAngular: HTMLElement | null;
  barEccwarp: HTMLElement | null;
  valScrub: HTMLElement | null;
  valVelocity: HTMLElement | null;
  valAngular: HTMLElement | null;
  valEccwarp: HTMLElement | null;
  interpretation: HTMLElement | null;
  eccentricity: HTMLInputElement | null;
  warp: HTMLSelectElement | null;
  stylus: HTMLSelectElement | null;
  threshold: HTMLInputElement | null;
};

export function bctxElements(root: ParentNode): BctxElements {
  return {
    canvasOverlay: root.querySelector<HTMLCanvasElement>('[data-bctx-canvas="overlay"]'),
    canvasStack: root.querySelector<HTMLCanvasElement>('[data-bctx-canvas="stack"]'),
    canvasInner: root.querySelector<HTMLCanvasElement>('[data-bctx-canvas="inner"]'),
    scoreValue: root.querySelector<HTMLElement>('[data-bctx-score-value]'),
    scoreLabel: root.querySelector<HTMLElement>('[data-bctx-score-label]'),
    barScrub: root.querySelector<HTMLElement>('[data-bctx-bar="scrub"]'),
    barVelocity: root.querySelector<HTMLElement>('[data-bctx-bar="velocity"]'),
    barAngular: root.querySelector<HTMLElement>('[data-bctx-bar="angular"]'),
    barEccwarp: root.querySelector<HTMLElement>('[data-bctx-bar="eccwarp"]'),
    valScrub: root.querySelector<HTMLElement>('[data-bctx-val="scrub"]'),
    valVelocity: root.querySelector<HTMLElement>('[data-bctx-val="velocity"]'),
    valAngular: root.querySelector<HTMLElement>('[data-bctx-val="angular"]'),
    valEccwarp: root.querySelector<HTMLElement>('[data-bctx-val="eccwarp"]'),
    interpretation: root.querySelector<HTMLElement>('[data-bctx-interpretation]'),
    eccentricity: root.querySelector<HTMLInputElement>('[data-bctx-eccentricity]'),
    warp: root.querySelector<HTMLSelectElement>('[data-bctx-warp]'),
    stylus: root.querySelector<HTMLSelectElement>('[data-bctx-stylus]'),
    threshold: root.querySelector<HTMLInputElement>('[data-bctx-threshold]'),
  };
}

function setBar(bar: HTMLElement | null, val: HTMLElement | null, fraction: number, label: string): void {
  if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  if (val) val.textContent = label;
}

const riskLevelClass: Record<string, string> = {
  lower: 'geo-risk-score--lower',
  medium: 'geo-risk-score--medium',
  elevated: 'geo-risk-score--elevated',
};

export function recomputeBehaviorContext(
  bctxEls: BctxElements,
  bctxState: BehaviorContextState,
  reference: ReferenceGeometry,
): void {
  const input: BehaviorContextInput = {
    pivotToSpindleMm: reference.pivotToSpindleMm,
    effectiveLengthMm: reference.effectiveLengthMm,
    overhangMm: reference.overhangMm,
    offsetAngleDeg: reference.offsetAngleDeg,
    innerGrooveMm: bctxState.innerGrooveMm,
    outerGrooveMm: bctxState.outerGrooveMm,
    eccentricityMm: bctxState.eccentricityMm,
    warpSeverity: bctxState.warpSeverity,
    stylusProfile: bctxState.stylusProfile,
    angularErrorThresholdDeg: bctxState.angularErrorThresholdDeg,
    rpm: bctxState.rpm,
  };

  const samples = sampleBehaviorContext(input);
  if (samples.length === 0) return;

  const innerSample = samples[samples.length - 1];
  const totalRisk = innerSample.totalBehaviorRisk;
  const level = classifyRisk(totalRisk);
  const score = Math.round(totalRisk * 100);

  const levelLabel =
    level === 'elevated'
      ? 'Elevated modelled context risk'
      : level === 'medium'
        ? 'Medium modelled context risk'
        : 'Lower modelled context risk';

  if (bctxEls.scoreValue) {
    bctxEls.scoreValue.textContent = String(score);
    const display = bctxEls.scoreValue.closest('.geo-risk-score');
    if (display) {
      display.className = `geo-risk-score ${riskLevelClass[level] ?? ''}`;
    }
  }
  if (bctxEls.scoreLabel) bctxEls.scoreLabel.textContent = levelLabel;

  const avgScrubProxy = samples.reduce((a, s) => a + s.scrubProxy, 0) / samples.length;
  const avgVelocityPenalty = samples.reduce((a, s) => a + s.velocityPenalty, 0) / samples.length;
  const avgAngular = samples.reduce((a, s) => a + s.angularThresholdPenalty, 0) / samples.length;
  const avgEccWarp = samples.reduce((a, s) => a + s.eccentricityPenalty * s.warpFactor, 0) / samples.length;

  setBar(bctxEls.barScrub, bctxEls.valScrub, avgScrubProxy / 2.5, avgScrubProxy.toFixed(2));
  setBar(bctxEls.barVelocity, bctxEls.valVelocity, Math.max(0, avgVelocityPenalty - 1) / 1.5, avgVelocityPenalty.toFixed(2));
  setBar(bctxEls.barAngular, bctxEls.valAngular, avgAngular, avgAngular.toFixed(3));
  setBar(bctxEls.barEccwarp, bctxEls.valEccwarp, avgEccWarp, avgEccWarp.toFixed(2));

  const geoSamples = sampleTrackingGeometry({
    pivotToSpindleMm: reference.pivotToSpindleMm,
    effectiveLengthMm: reference.effectiveLengthMm,
    offsetAngleDeg: reference.offsetAngleDeg,
    innerGrooveMm: bctxState.innerGrooveMm,
    outerGrooveMm: bctxState.outerGrooveMm,
  });
  const rms = calcRmsTrackingError(geoSamples);
  const maxErr = calcMaxTrackingError(geoSamples);
  const hasNulls = findNullPoints(geoSamples).length > 0;
  const offsetBurden = calcOffsetBurden(reference.offsetAngleDeg);

  const interp = buildBehaviorInterpretation({
    rmsTrackingErrorDeg: rms,
    maxTrackingErrorDeg: maxErr,
    offsetBurden,
    totalRisk,
    hasNulls,
    overhangMm: reference.overhangMm,
  });

  if (bctxEls.interpretation) {
    const warnings = interp.warnings.length > 0
      ? `<ul class="geo-bctx-warnings">${interp.warnings.map((w) => `<li>${w}</li>`).join('')}</ul>`
      : '';
    bctxEls.interpretation.innerHTML = `
      <p class="geo-bctx-interp-summary">${interp.summary}</p>
      ${warnings}
    `;
  }

  drawOverlayGraph(bctxEls.canvasOverlay, samples, bctxState.innerGrooveMm, bctxState.outerGrooveMm);
  drawStackGraph(bctxEls.canvasStack, samples, bctxState.innerGrooveMm, bctxState.outerGrooveMm);
  drawInnerMicroscope(bctxEls.canvasInner, samples, bctxState.innerGrooveMm);
}
