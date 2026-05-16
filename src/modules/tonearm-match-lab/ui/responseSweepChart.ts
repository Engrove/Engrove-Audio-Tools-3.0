import { escapeAttribute, renderText } from '../../../shared/ui/renderSafe';
import {
  calculateResponseSweep,
  type ResponseSweepResult,
  type ResponseSweepPoint,
} from '../engine/responseSweep';
import type { ResonanceInput } from '../engine/resonance';

type SweepSelector = (point: ResponseSweepPoint) => number;

function formatNumber(value: number, decimals = 3): string {
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

function xForFrequency(frequencyHz: number, result: ResponseSweepResult): number {
  const first = result.points[0];
  const last = result.points[result.points.length - 1];

  return ((frequencyHz - first.frequencyHz) / (last.frequencyHz - first.frequencyHz)) * 100;
}

function yForValue(value: number, max: number): number {
  if (max <= 0) {
    return 100;
  }

  return 100 - (value / max) * 100;
}

function polylinePoints(result: ResponseSweepResult, selector: SweepSelector): string {
  const max = Math.max(...result.points.map(selector));

  return result.points
    .map((point) => {
      const x = xForFrequency(point.frequencyHz, result);
      const y = yForValue(selector(point), max);
      return `${x.toFixed(3)},${y.toFixed(3)}`;
    })
    .join(' ');
}

function sweepChartMarkup(options: {
  title: string;
  unit: string;
  result: ResponseSweepResult;
  selector: SweepSelector;
  maxText: string;
  classModifier: string;
}): string {
  const points = polylinePoints(options.result, options.selector);

  return `
    <figure class="tm-response-chart tm-response-chart--${escapeAttribute(options.classModifier)}">
      <figcaption>
        <strong>${renderText(options.title)}</strong>
        <span>${renderText(options.maxText)}</span>
      </figcaption>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="${escapeAttribute(`${options.title}, ${options.maxText}`)}"
      >
        <polyline
          class="tm-response-chart__curve"
          points="${escapeAttribute(points)}"
        ></polyline>
      </svg>
      <div class="tm-response-chart__axis" aria-hidden="true">
        <span>0.016 Hz</span>
        <span>31.5 Hz</span>
      </div>
    </figure>
  `;
}

export function responseSweepPanelMarkup(input: ResonanceInput): string {
  const sweep = calculateResponseSweep({
    ...input,
    qFactor: 3.33,
    stylusAmplitudeMm: 0.1,
    accelerationLimitG: 0.05,
  });

  const maxDisplacementText =
    `Peak ${formatNumber(sweep.maxDisplacement.displacementMm)} mm @ ${formatNumber(sweep.maxDisplacement.frequencyHz, 1)} Hz`;

  const maxAccelerationText =
    `Peak ${formatNumber(sweep.maxAcceleration.accelerationG)} g @ ${formatNumber(sweep.maxAcceleration.frequencyHz, 1)} Hz`;

  const accelerationStatus = sweep.maxAcceleration.accelerationSafe
    ? 'Acceleration below selected threshold'
    : 'Acceleration exceeds selected threshold';

  return `
    <section class="tm-response-sweep" aria-label="Tonearm response sweep">
      <div class="tm-response-sweep__header">
        <h3>${renderText('Tonearm Response Sweep')}</h3>
        <p>${renderText('Predicted low-frequency displacement and acceleration from total moving mass, compliance, stylus amplitude and damping assumptions.')}</p>
      </div>

      <div class="tm-response-sweep__metrics">
        <span>
          <strong>${renderText(maxDisplacementText)}</strong>
          <small>${renderText('Predicted headshell displacement')}</small>
        </span>
        <span>
          <strong>${renderText(maxAccelerationText)}</strong>
          <small>${renderText(accelerationStatus)}</small>
        </span>
      </div>

      <div class="tm-response-sweep__charts">
        ${sweepChartMarkup({
          title: 'Displacement',
          unit: 'mm',
          result: sweep,
          selector: (point) => point.displacementMm,
          maxText: maxDisplacementText,
          classModifier: 'displacement',
        })}
        ${sweepChartMarkup({
          title: 'Acceleration',
          unit: 'g',
          result: sweep,
          selector: (point) => point.accelerationG,
          maxText: maxAccelerationText,
          classModifier: 'acceleration',
        })}
      </div>

      <details class="tm-response-sweep__assumptions">
        <summary>${renderText('Advanced response assumptions')}</summary>
        <dl>
          <div>
            <dt>Model</dt>
            <dd>${renderText('Absolute base-excited response')}</dd>
          </div>
          <div>
            <dt>Q factor</dt>
            <dd>${renderText(formatNumber(sweep.qFactor, 2))}</dd>
          </div>
          <div>
            <dt>Stylus amplitude</dt>
            <dd>${renderText(`${formatNumber(sweep.stylusAmplitudeMm, 3)} mm`)}</dd>
          </div>
          <div>
            <dt>Acceleration threshold</dt>
            <dd>${renderText(`${formatNumber(sweep.accelerationLimitG, 3)} g`)}</dd>
          </div>
        </dl>
      </details>
    </section>
  `;
}
