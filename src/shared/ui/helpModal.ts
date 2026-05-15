const styleElementId = 'engrove-help-modal-styles';

const helpModalCss = `
.ea-help-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: clamp(0.75rem, 3vw, 2rem);
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: ea-help-fade-in 0.15s ease;
}

@keyframes ea-help-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.ea-help-dialog {
  width: min(860px, 100%);
  max-height: min(88vh, 820px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid var(--ea-border-primary);
  border-radius: var(--ea-radius-lg);
  background: var(--ea-bg-panel);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.48);
  overflow: hidden;
}

.ea-help-header {
  display: flex;
  align-items: center;
  gap: var(--ea-space-3);
  padding: var(--ea-space-4) var(--ea-space-5);
  border-bottom: 1px solid var(--ea-border-primary);
  background: var(--ea-bg-panel-header);
}

.ea-help-header-title {
  flex: 1;
  margin: 0;
  color: var(--ea-text-high);
  font-family: var(--ea-font-data);
  font-size: var(--ea-font-size-body);
  font-weight: 700;
  letter-spacing: var(--ea-letter-label);
  text-transform: uppercase;
}

.ea-help-close {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid var(--ea-border-primary);
  border-radius: var(--ea-radius-sm);
  background: transparent;
  color: var(--ea-text-medium);
  font-family: var(--ea-font-data);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}

.ea-help-close:hover,
.ea-help-close:focus-visible {
  border-color: var(--ea-interactive-accent);
  color: var(--ea-interactive-accent);
  background: var(--ea-interactive-accent-soft);
  outline: none;
}

.ea-help-body {
  overflow-y: auto;
  padding: var(--ea-space-5) var(--ea-space-6);
  color: var(--ea-text-high);
  font-family: var(--ea-font-ui);
  font-size: 0.9375rem;
  line-height: 1.6;
}

.ea-help-toc {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ea-space-2);
  padding: var(--ea-space-3) 0 var(--ea-space-5);
  border-bottom: 1px solid var(--ea-border-primary);
  margin-bottom: var(--ea-space-5);
}

.ea-help-toc-link {
  padding: 0.2rem 0.65rem;
  border: 1px solid var(--ea-border-primary);
  border-radius: var(--ea-radius-pill, 999px);
  background: var(--ea-bg-panel-alt);
  color: var(--ea-text-medium);
  font-family: var(--ea-font-data);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-decoration: none;
  text-transform: uppercase;
  transition: border-color 0.12s, color 0.12s;
}

.ea-help-toc-link:hover,
.ea-help-toc-link:focus-visible {
  border-color: var(--ea-interactive-accent);
  color: var(--ea-interactive-accent);
  outline: none;
  text-decoration: none;
}

.ea-help-section {
  margin-bottom: var(--ea-space-8);
}

.ea-help-section + .ea-help-section {
  border-top: 1px solid var(--ea-border-soft);
  padding-top: var(--ea-space-6);
}

.ea-help-section h2 {
  margin: 0 0 var(--ea-space-3);
  color: var(--ea-interactive-accent);
  font-family: var(--ea-font-data);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.ea-help-section h3 {
  margin: var(--ea-space-5) 0 var(--ea-space-2);
  color: var(--ea-text-high);
  font-family: var(--ea-font-data);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.ea-help-section p {
  margin: 0 0 var(--ea-space-3);
  color: var(--ea-text-medium);
}

.ea-help-section ul,
.ea-help-section ol {
  margin: 0 0 var(--ea-space-3);
  padding-left: 1.4rem;
  color: var(--ea-text-medium);
}

.ea-help-section li {
  margin-bottom: var(--ea-space-1);
}

.ea-help-section strong {
  color: var(--ea-text-high);
  font-weight: 600;
}

.ea-help-callout {
  padding: var(--ea-space-3) var(--ea-space-4);
  border: 1px solid color-mix(in srgb, var(--ea-interactive-accent) 35%, var(--ea-border-primary));
  border-radius: var(--ea-radius-md);
  background: color-mix(in srgb, var(--ea-interactive-accent) 8%, var(--ea-bg-panel-alt));
  color: var(--ea-text-medium);
  margin: var(--ea-space-3) 0;
  font-size: 0.9rem;
}

.ea-help-callout--warn {
  border-color: color-mix(in srgb, var(--ea-status-warning) 40%, var(--ea-border-primary));
  background: color-mix(in srgb, var(--ea-status-warning) 8%, var(--ea-bg-panel-alt));
}

.ea-help-table {
  width: 100%;
  border-collapse: collapse;
  margin: var(--ea-space-3) 0;
  font-size: 0.875rem;
  border: 1px solid var(--ea-border-primary);
  border-radius: var(--ea-radius-md);
  overflow: hidden;
}

.ea-help-table th {
  padding: 0.55rem 0.75rem;
  background: var(--ea-bg-panel-header);
  color: var(--ea-text-medium);
  font-family: var(--ea-font-data);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: left;
  text-transform: uppercase;
  border-bottom: 1px solid var(--ea-border-primary);
}

.ea-help-table td {
  padding: 0.5rem 0.75rem;
  color: var(--ea-text-medium);
  border-bottom: 1px solid var(--ea-border-soft);
  vertical-align: top;
}

.ea-help-table tr:last-child td {
  border-bottom: none;
}

.ea-help-table td:first-child {
  color: var(--ea-text-high);
  font-weight: 500;
  white-space: nowrap;
}

.ea-help-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--ea-space-3);
  margin: var(--ea-space-3) 0;
}

.ea-help-card {
  padding: var(--ea-space-3) var(--ea-space-4);
  border: 1px solid var(--ea-border-primary);
  border-radius: var(--ea-radius-md);
  background: var(--ea-bg-panel-alt);
}

.ea-help-card h3 {
  margin: 0 0 var(--ea-space-2);
  font-size: 0.8rem;
}

.ea-help-card p {
  margin: 0;
  font-size: 0.875rem;
}

@media (max-width: 600px) {
  .ea-help-body { padding: var(--ea-space-4); }
  .ea-help-table { display: block; overflow-x: auto; }
  .ea-help-table td:first-child { white-space: normal; }
}
`;

function injectStyles(): void {
  if (document.getElementById(styleElementId)) return;
  const style = document.createElement('style');
  style.id = styleElementId;
  style.textContent = helpModalCss;
  document.head.appendChild(style);
}

function helpContent(): string {
  return `
    <div class="ea-help-toc" role="navigation" aria-label="Jump to section">
      <a class="ea-help-toc-link" href="#help-overview">Overview</a>
      <a class="ea-help-toc-link" href="#help-tonearm-match">Tonearm Match Lab</a>
      <a class="ea-help-toc-link" href="#help-compliance">Compliance Estimator</a>
      <a class="ea-help-toc-link" href="#help-geometry">Geometry Lab</a>
      <a class="ea-help-toc-link" href="#help-vta">VTA &amp; SRA Lab</a>
      <a class="ea-help-toc-link" href="#help-measurement">Measurement Lab</a>
      <a class="ea-help-toc-link" href="#help-troubleshooting">Troubleshooting</a>
      <a class="ea-help-toc-link" href="#help-glossary">Glossary</a>
    </div>

    <section class="ea-help-section" id="help-overview">
      <h2>Overview</h2>
      <p>Engrove Audio Tools is a browser-based workbench for analogue playback setup. The tools help you estimate cartridge–tonearm resonance, convert compliance figures, calculate tonearm alignment geometry, understand VTA/SRA changes, and inspect measurements from test records.</p>
      <p>All values are in metric units: grams (g), millimetres (mm), hertz (Hz), decibels (dB) and percent (%). Enter the values you know and use the results as practical setup aids.</p>
      <div class="ea-help-callout">
        <strong>Recommended order:</strong> start with the Compliance Estimator if you only have a 100&nbsp;Hz compliance figure, then use Tonearm Match Lab to check the resonance, then set geometry and arm height mechanically, and finally verify with Measurement Lab if you have a test record and audio interface.
      </div>
    </section>

    <section class="ea-help-section" id="help-tonearm-match">
      <h2>Tonearm Match Lab</h2>
      <p>Estimates the low-frequency resonance of your cartridge and tonearm combined. The result tells you whether the combination is likely to work well, based on the resonance falling within or outside the common 8–12&nbsp;Hz target zone.</p>

      <h3>Inputs</h3>
      <table class="ea-help-table">
        <thead>
          <tr><th>Input</th><th>Unit</th><th>How to find it</th><th>Common mistake</th></tr>
        </thead>
        <tbody>
          <tr><td>Tonearm effective mass</td><td>g</td><td>Use the figure from the tonearm manufacturer's specification for your arm and headshell combination.</td><td>Using the arm's physical weight instead of its effective mass.</td></tr>
          <tr><td>Cartridge mass</td><td>g</td><td>Body mass without mounting screws unless the datasheet explicitly includes them.</td><td>Adding the screws twice.</td></tr>
          <tr><td>Fastener mass</td><td>g</td><td>Screws, nuts, washers and any additional headshell weights that move with the cartridge.</td><td>Forgetting heavy screws or auxiliary weights.</td></tr>
          <tr><td>Compliance @ 10&nbsp;Hz</td><td>µm/mN</td><td>Use a 10&nbsp;Hz dynamic value, or use the Compliance Estimator first if only a 100&nbsp;Hz value is available.</td><td>Entering a 100&nbsp;Hz Japanese-spec value directly as 10&nbsp;Hz.</td></tr>
        </tbody>
      </table>

      <h3>Result bands</h3>
      <table class="ea-help-table">
        <thead><tr><th>Frequency</th><th>Result</th><th>What it means</th></tr></thead>
        <tbody>
          <tr><td>Below 6&nbsp;Hz</td><td>Poor — too low</td><td>Deep in the warp and footfall region. Usually unsuitable.</td></tr>
          <tr><td>6–7&nbsp;Hz</td><td>Marginal — low</td><td>Vulnerable to record warps and subsonic energy.</td></tr>
          <tr><td>7–8&nbsp;Hz</td><td>Acceptable — low</td><td>May work but has limited margin.</td></tr>
          <tr><td>8–9&nbsp;Hz</td><td>Good</td><td>Inside the common target zone.</td></tr>
          <tr><td>9–11&nbsp;Hz</td><td>Ideal</td><td>Preferred centre of the 8–12&nbsp;Hz target zone.</td></tr>
          <tr><td>11–12&nbsp;Hz</td><td>Good</td><td>Still inside the common target zone.</td></tr>
          <tr><td>12–13&nbsp;Hz</td><td>Acceptable — high</td><td>May be usable but worth checking.</td></tr>
          <tr><td>13–14&nbsp;Hz</td><td>Marginal — high</td><td>Risk of bass colouration and reduced tracking margin.</td></tr>
          <tr><td>Above 14&nbsp;Hz</td><td>Poor — too high</td><td>Often too high for best analogue playback.</td></tr>
        </tbody>
      </table>

      <div class="ea-help-callout ea-help-callout--warn">
        <strong>Note:</strong> the resonance formula gives a screening estimate, not a measurement. If the combination is borderline, verify with a test record or the Measurement Lab resonance sweep before making any expensive changes.
      </div>
    </section>

    <section class="ea-help-section" id="help-compliance">
      <h2>Compliance Estimator</h2>
      <p>Many cartridge manufacturers publish compliance measured at 100&nbsp;Hz, but tonearm resonance calculations require a 10&nbsp;Hz estimate. This tool converts the published figure using a multiplier that matches the cartridge type.</p>

      <h3>Conversion types</h3>
      <table class="ea-help-table">
        <thead><tr><th>Published value</th><th>Cartridge type</th><th>Multiplier</th></tr></thead>
        <tbody>
          <tr><td>Dynamic @ 10&nbsp;Hz</td><td>Any</td><td>×1.0 — use directly</td></tr>
          <tr><td>Dynamic @ 100&nbsp;Hz</td><td>MM or MI (moving magnet / moving iron)</td><td>×1.5</td></tr>
          <tr><td>Dynamic @ 100&nbsp;Hz</td><td>MC low output</td><td>×2.0</td></tr>
          <tr><td>Dynamic @ 100&nbsp;Hz</td><td>MC high output</td><td>×1.7</td></tr>
          <tr><td>Dynamic @ 100&nbsp;Hz</td><td>Unknown or custom</td><td>Enter your own multiplier</td></tr>
          <tr><td>Static compliance</td><td>Any</td><td>×0.5 (broad estimate only)</td></tr>
        </tbody>
      </table>
      <p>Example: an MC cartridge published at 9&nbsp;µm/mN @ 100&nbsp;Hz with the ×2.0 model gives approximately 18&nbsp;µm/mN @ 10&nbsp;Hz.</p>

      <div class="ea-help-callout ea-help-callout--warn">
        <strong>Note:</strong> converted values are estimates. Compliance varies with temperature, suspension age and measurement method. A borderline resonance result can shift by one band when the actual compliance differs from the published figure.
      </div>
    </section>

    <section class="ea-help-section" id="help-geometry">
      <h2>Tonearm Geometry Lab</h2>
      <p>Calculates ideal alignment geometry for a pivoted tonearm based on your chosen groove standard and alignment method. You can also enter your actual setup values to see how closely they match the reference.</p>

      <h3>Key inputs</h3>
      <table class="ea-help-table">
        <thead><tr><th>Input</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>Standard</td><td>IEC or DIN — the groove radius convention for your alignment target.</td></tr>
          <tr><td>Method</td><td>Baerwald/Loefgren&nbsp;A (common), Loefgren&nbsp;B (different distortion weighting), or Stevenson (prioritises inner groove).</td></tr>
          <tr><td>Pivot-to-spindle</td><td>The mounting distance in mm from the tonearm pivot to the platter spindle. Measure mechanically.</td></tr>
          <tr><td>Simulated values</td><td>Your actual pivot-to-spindle, overhang and offset angle for comparison with the reference geometry.</td></tr>
        </tbody>
      </table>

      <h3>Null-point reference values</h3>
      <table class="ea-help-table">
        <thead><tr><th>Standard</th><th>Method</th><th>Inner null (N1)</th><th>Outer null (N2)</th></tr></thead>
        <tbody>
          <tr><td>IEC</td><td>Baerwald / Loefgren&nbsp;A</td><td>66.0&nbsp;mm</td><td>120.9&nbsp;mm</td></tr>
          <tr><td>IEC</td><td>Loefgren&nbsp;B</td><td>70.3&nbsp;mm</td><td>116.6&nbsp;mm</td></tr>
          <tr><td>IEC</td><td>Stevenson</td><td>60.3&nbsp;mm</td><td>117.4&nbsp;mm</td></tr>
          <tr><td>DIN</td><td>Baerwald / Loefgren&nbsp;A</td><td>63.1&nbsp;mm</td><td>119.3&nbsp;mm</td></tr>
          <tr><td>DIN</td><td>Loefgren&nbsp;B</td><td>67.4&nbsp;mm</td><td>114.6&nbsp;mm</td></tr>
          <tr><td>DIN</td><td>Stevenson</td><td>57.5&nbsp;mm</td><td>115.6&nbsp;mm</td></tr>
        </tbody>
      </table>

      <div class="ea-help-callout ea-help-callout--warn">
        <strong>Printing the protractor:</strong> after printing, verify the millimetre scale with a ruler. Any browser scaling or printer "fit to page" setting will shift the scale and invalidate the protractor.
      </div>
    </section>

    <section class="ea-help-section" id="help-vta">
      <h2>VTA &amp; SRA Lab</h2>
      <p>Estimates how changes to tonearm pillar height and platter mat thickness affect the stylus rake angle (SRA). Also solves the inverse: how much pillar adjustment is needed to reach a target SRA change.</p>

      <h3>Formula</h3>
      <p>The tool calculates net vertical change (pillar height change minus mat thickness change) divided by effective tonearm length, converted to degrees.</p>
      <p>Example: with effective length 237&nbsp;mm and a +1.0&nbsp;mm pillar rise, the SRA changes by approximately +0.24°. To reach a +1.00° SRA change, the required pillar rise is approximately +4.14&nbsp;mm.</p>

      <h3>Workflow</h3>
      <ol>
        <li>Select a tonearm or type the effective length manually.</li>
        <li>Enter the reference SRA. The default baseline is 92.0°.</li>
        <li>Enter pillar height change and mat thickness change in mm. Positive values mean raising.</li>
        <li>Read the estimated SRA change and resulting SRA.</li>
        <li>Use the inverse field to find the pillar movement needed for a specific target change.</li>
      </ol>

      <div class="ea-help-callout ea-help-callout--warn">
        <strong>Note:</strong> real-world SRA depends on stylus shape, suspension compression, tracking force, record thickness and manufacturing tolerances. Use magnification or physical measurement when the target is critical.
      </div>
    </section>

    <section class="ea-help-section" id="help-measurement">
      <h2>Measurement Lab</h2>
      <p>Captures audio from a test record via your audio interface and analyses it in the browser. The lab is designed to be honest about browser and hardware limitations: it reports the actual sample rate it receives, and disables the voice-call processing (noise suppression, automatic gain control) that would distort measurements.</p>

      <h3>Getting started</h3>
      <ol>
        <li>Connect your audio interface before opening the tool.</li>
        <li>Grant browser permission to access audio input when prompted.</li>
        <li>Select your input device from the list.</li>
        <li>Click <strong>Connect</strong> and watch the level meter. Make sure the signal is not clipping (never reaching 0&nbsp;dBFS).</li>
        <li>Use Self-test mode to verify the meters and analysis work without external hardware.</li>
      </ol>

      <h3>Speed &amp; wow/flutter</h3>
      <p>Records 30 seconds of a speed reference tone (3150&nbsp;Hz or 3000&nbsp;Hz depending on your test record). Results are classified as:</p>
      <table class="ea-help-table">
        <thead><tr><th>Class</th><th>W&amp;F value</th></tr></thead>
        <tbody>
          <tr><td>Excellent</td><td>Below 0.03%</td></tr>
          <tr><td>Good</td><td>Below 0.10%</td></tr>
          <tr><td>Acceptable</td><td>Below 0.20%</td></tr>
          <tr><td>Marginal</td><td>Below 0.30%</td></tr>
          <tr><td>Poor</td><td>0.30% or above</td></tr>
        </tbody>
      </table>

      <h3>Channel balance &amp; crosstalk</h3>
      <p>A two-step process: capture the left-only reference band for 10 seconds, then the right-only band. The result shows channel balance (R − L) and how much signal from each channel leaks into the other. Well-set-up cartridges typically show crosstalk around −25 to −35&nbsp;dB.</p>

      <h3>Frequency response</h3>
      <p>Captures 10 seconds and shows a 20&nbsp;Hz to 20&nbsp;kHz response, normalised to 1&nbsp;kHz. Use the RIAA reference overlay to see how your cartridge and phono stage compare to the equalisation curve.</p>

      <h3>THD &amp; IMD</h3>
      <p>Captures 5 seconds for either total harmonic distortion (THD) or intermodulation distortion (IMD). Avoid clipping: any signal at or above 0&nbsp;dBFS invalidates distortion and level measurements.</p>

      <h3>Resonance sweep</h3>
      <p>Captures a 30-second low-frequency sweep and estimates where the cartridge/tonearm resonance peak falls. Use this to verify or challenge the Tonearm Match Lab estimate.</p>

      <h3>Exports</h3>
      <p>Use <strong>Export report</strong> for a human-readable summary, or <strong>Export JSON</strong> for a structured record of capture conditions and measurement results. Exports do not include raw audio.</p>
    </section>

    <section class="ea-help-section" id="help-troubleshooting">
      <h2>Troubleshooting</h2>
      <div class="ea-help-grid">
        <div class="ea-help-card">
          <h3>Resonance result looks wrong</h3>
          <p>The most common causes are entering a 100&nbsp;Hz compliance value as if it were 10&nbsp;Hz, using arm weight instead of effective mass, or forgetting fastener and headshell mass. Use the Compliance Estimator if you are unsure about your compliance figure.</p>
        </div>
        <div class="ea-help-card">
          <h3>No audio input appears</h3>
          <p>Grant browser permission to use audio input, connect your interface before opening the page, and close other applications that may be holding the device exclusively.</p>
        </div>
        <div class="ea-help-card">
          <h3>Sample rate warning</h3>
          <p>If the lab reports that the sample rate differs significantly from what was requested, speed and wow/flutter results can be inaccurate. Set your interface and operating-system audio settings to the intended sample rate, then reconnect.</p>
        </div>
        <div class="ea-help-card">
          <h3>Meter clips at 0&nbsp;dBFS</h3>
          <p>Reduce the input gain on your audio interface or lower the phono-stage output level. Clipped samples cannot be recovered by software and will give false distortion and frequency results.</p>
        </div>
        <div class="ea-help-card">
          <h3>Blank or rejected inputs</h3>
          <p>Fields that require a positive value will reject zero, negative or missing entries. Check that you are using a decimal point and that the value is in the correct unit (mm, g, Hz).</p>
        </div>
        <div class="ea-help-card">
          <h3>Printed protractor scale wrong</h3>
          <p>Disable "fit to page" in the print dialog and verify the printed scale with a physical ruler in millimetres before using the protractor.</p>
        </div>
      </div>
    </section>

    <section class="ea-help-section" id="help-glossary">
      <h2>Glossary</h2>
      <table class="ea-help-table">
        <thead><tr><th>Term</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>ADC</td><td>Analogue-to-digital converter — the audio interface used to capture the signal into the computer.</td></tr>
          <tr><td>Compliance</td><td>Stylus suspension flexibility, expressed in µm/mN. The more compliant, the more easily the stylus can move.</td></tr>
          <tr><td>Crosstalk</td><td>Signal leakage from one stereo channel into the other, shown as a negative dB value. More negative is better.</td></tr>
          <tr><td>dBFS</td><td>Decibels relative to digital full scale. 0&nbsp;dBFS is the maximum level before clipping.</td></tr>
          <tr><td>Effective length</td><td>Distance from the tonearm pivot to the stylus tip, in mm.</td></tr>
          <tr><td>Effective mass</td><td>The tonearm mass as "seen" by the cartridge suspension — not the physical weight of the arm.</td></tr>
          <tr><td>Null point</td><td>A groove radius where lateral tracking error is exactly zero. Pivoted tonearms are aligned to have two null points.</td></tr>
          <tr><td>Offset angle</td><td>The angle between the cartridge/headshell axis and the line from pivot to stylus.</td></tr>
          <tr><td>Overhang</td><td>Effective length minus pivot-to-spindle distance, in mm. Setting overhang correctly positions the stylus relative to the spindle.</td></tr>
          <tr><td>Pivot-to-spindle</td><td>The mounting distance from the tonearm pivot to the platter spindle, in mm.</td></tr>
          <tr><td>SRA</td><td>Stylus rake angle — the angle of the stylus contact point relative to the record surface.</td></tr>
          <tr><td>THD</td><td>Total harmonic distortion — a measure of how much harmonic energy appears alongside the fundamental tone.</td></tr>
          <tr><td>VTA</td><td>Vertical tracking angle — related to tonearm height and the angle of the cartridge/stylus assembly.</td></tr>
          <tr><td>W&amp;F</td><td>Wow and flutter — slow (wow) and faster (flutter) short-term speed variation in the turntable.</td></tr>
        </tbody>
      </table>
    </section>
  `;
}

function createBackdrop(): HTMLDivElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'ea-help-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Help');

  backdrop.innerHTML = `
    <div class="ea-help-dialog">
      <div class="ea-help-header">
        <h2 class="ea-help-header-title">Help</h2>
        <button class="ea-help-close" type="button" aria-label="Close help">&times;</button>
      </div>
      <div class="ea-help-body">
        ${helpContent()}
      </div>
    </div>
  `;

  return backdrop;
}

let activeBackdrop: HTMLDivElement | null = null;

function close(): void {
  if (activeBackdrop) {
    activeBackdrop.remove();
    activeBackdrop = null;
  }
  document.removeEventListener('keydown', onKeydown);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    close();
  }
}

const helpIndicatorStorageKey = 'engrove-help-indicator-dismissed';

export function openHelpModal(): void {
  if (activeBackdrop) return;
  try {
    localStorage.setItem(helpIndicatorStorageKey, '1');
  } catch {
    // Ignore storage access issues.
  }
  injectStyles();

  const backdrop = createBackdrop();
  activeBackdrop = backdrop;
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  backdrop.querySelector('.ea-help-close')?.addEventListener('click', close);

  backdrop.querySelectorAll('.ea-help-toc-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const href = (link as HTMLAnchorElement).getAttribute('href');
      if (!href) return;
      const target = backdrop.querySelector(href);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.addEventListener('keydown', onKeydown);
}

export function mountHelpModal(): void {
  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest('[data-help-toggle]');
    if (button) openHelpModal();
  });
}
