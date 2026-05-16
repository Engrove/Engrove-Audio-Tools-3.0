const styleElementId = 'engrove-help-modal-styles';

const HELP_DOT_KEY = 'engrove.helpDot.seen';

function shouldShowHelpDot(): boolean {
  try {
    return localStorage.getItem(HELP_DOT_KEY) !== 'true';
  } catch {
    return false;
  }
}

function markHelpDotSeen(): void {
  try {
    localStorage.setItem(HELP_DOT_KEY, 'true');
  } catch {
    /* localStorage may be unavailable */
  }
  document.querySelectorAll<HTMLElement>('[data-help-dot]').forEach((dot) => dot.remove());
}

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
      <a class="ea-help-toc-link" href="#help-navigation">Navigation</a>
      <a class="ea-help-toc-link" href="#help-tonearm-match">Tonearm Match Lab</a>
      <a class="ea-help-toc-link" href="#help-compliance">Compliance Estimator</a>
      <a class="ea-help-toc-link" href="#help-geometry">Geometry Lab</a>
      <a class="ea-help-toc-link" href="#help-vta">VTA &amp; SRA Lab</a>
      <a class="ea-help-toc-link" href="#help-measurement">Measurement Lab</a>
      <a class="ea-help-toc-link" href="#help-privacy">Privacy &amp; storage</a>
      <a class="ea-help-toc-link" href="#help-troubleshooting">Troubleshooting</a>
      <a class="ea-help-toc-link" href="#help-glossary">Glossary</a>
    </div>

    <section class="ea-help-section" id="help-overview">
      <h2>Overview</h2>
      <p>Engrove Audio Tools is a browser-based workbench for analogue playback setup. It combines cartridge, tonearm, alignment, VTA/SRA and test-record measurement tools in one modular interface.</p>
      <p>The current app includes Tonearm Match Lab, Compliance Estimator, Tonearm Geometry Lab, VTA &amp; SRA Lab and Measurement Lab. Data Explorer is visible as a planned tool but is not active in this build.</p>
      <p>All tools use metric audio setup units: grams (g), millimetres (mm), hertz (Hz), decibels (dB), degrees (°), compliance units (µm/mN or cu), and percent (%).</p>

      <div class="ea-help-callout">
        <strong>Recommended workflow:</strong> estimate or confirm compliance first, check tonearm/cartridge resonance in Tonearm Match Lab, verify geometry in Geometry Lab, adjust arm height in VTA &amp; SRA Lab, then use Measurement Lab with a test record and audio interface when you need measured evidence.
      </div>

      <div class="ea-help-callout ea-help-callout--warn">
        <strong>Truth labels:</strong> FORMULA means deterministic geometry/math, MODEL means a transparent approximation, MEASURED means browser-captured audio, and VERIFIED means saved evidence or independently checked data. Do not treat MODEL output as a physical measurement.
      </div>
    </section>

    <section class="ea-help-section" id="help-navigation">
      <h2>Navigation</h2>
      <p>The top bar links to the currently implemented routes:</p>
      <table class="ea-help-table">
        <thead>
          <tr><th>Route</th><th>Tool</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr><td>/</td><td>Home</td><td>Active</td></tr>
          <tr><td>/tonearm-calculator</td><td>Tonearm Match Lab</td><td>Active</td></tr>
          <tr><td>/compliance</td><td>Compliance Estimator</td><td>Active</td></tr>
          <tr><td>/geometry-lab</td><td>Tonearm Geometry Lab</td><td>Active</td></tr>
          <tr><td>/vta-sra-lab</td><td>VTA &amp; SRA Lab</td><td>Active</td></tr>
          <tr><td>/measurement-lab</td><td>Measurement Lab</td><td>Active</td></tr>
          <tr><td>Data Explorer</td><td>Dataset exploration</td><td>Coming soon / disabled</td></tr>
        </tbody>
      </table>
      <p>The app also supports hash-based equivalents for the active tool routes. In-page help links remain normal anchor links inside this modal.</p>
      <p>The theme toggle is stored locally in your browser. The help dot and welcome banner dismissal are also stored locally so they do not reappear on every visit.</p>
    </section>

    <section class="ea-help-section" id="help-tonearm-match">
      <h2>Tonearm Match Lab</h2>
      <p>Tonearm Match Lab estimates the low-frequency resonance of a tonearm and cartridge combination. It is a screening tool for deciding whether a cartridge/arm pairing is likely to fall in the common target region before you verify it by measurement.</p>

      <h3>Workflow</h3>
      <ol>
        <li>Pick a tonearm from the dataset or enter the effective mass manually.</li>
        <li>Pick a cartridge from the dataset or enter mass and compliance manually.</li>
        <li>Set tracking force for setup documentation. In the current resonance calculation, tracking force is recorded but not added to moving mass.</li>
        <li>Read the resonance band, score and gauge.</li>
        <li>Use Tonearm Response Sweep when you want to inspect the modeled displacement and acceleration response around resonance.</li>
        <li>Optionally export a report, save a local browser snapshot, or load the last local snapshot.</li>
      </ol>

      <h3>Inputs</h3>
      <table class="ea-help-table">
        <thead>
          <tr><th>Input</th><th>Unit</th><th>How it is used</th><th>Common mistake</th></tr>
        </thead>
        <tbody>
          <tr><td>Tonearm effective mass</td><td>g</td><td>Added to moving mass. Dataset tonearms may fill this automatically when match-ready data exists.</td><td>Using the arm's physical weight instead of effective mass.</td></tr>
          <tr><td>Cartridge mass</td><td>g</td><td>Added to moving mass. Dataset cartridges may fill this automatically.</td><td>Including screw mass here and again under fasteners.</td></tr>
          <tr><td>Fasteners</td><td>g</td><td>Screws, nuts, washers and any extra moving mass. Include headshell mass only when the arm specification excludes it.</td><td>Forgetting heavy screws, spacer plates or auxiliary headshell weights.</td></tr>
          <tr><td>Compliance @ 10&nbsp;Hz</td><td>µm/mN</td><td>Used directly in the resonance formula. Dataset cartridges may fill this when a 10&nbsp;Hz value is available.</td><td>Entering a 100&nbsp;Hz Japanese-spec dynamic value directly as 10&nbsp;Hz.</td></tr>
          <tr><td>Applied VTF</td><td>g</td><td>Stored as setup context and report data. It does not currently change F₀.</td><td>Assuming the current formula adds VTF to moving mass.</td></tr>
        </tbody>
      </table>

      <h3>Formula</h3>
      <p>The visible report formula is:</p>
      <p><strong>F₀ = 159.15 / √(M · C)</strong></p>
      <p>where <strong>M</strong> is tonearm effective mass + cartridge mass + fastener mass in grams, and <strong>C</strong> is dynamic compliance at 10&nbsp;Hz in µm/mN.</p>
      <p>The calculation is a simplified setup model. It does not include damping, exact bearing behaviour, record warp energy, cartridge suspension ageing, headshell flex or measured resonance amplitude.</p>

      <h3>Result bands</h3>
      <table class="ea-help-table">
        <thead><tr><th>Frequency</th><th>Displayed class</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>Below 6&nbsp;Hz</td><td>Poor</td><td>Deep in warp and footfall territory.</td></tr>
          <tr><td>6–7&nbsp;Hz</td><td>Marginal</td><td>Vulnerable to warps and subsonic energy.</td></tr>
          <tr><td>7–8&nbsp;Hz</td><td>Acceptable but not optimal</td><td>Usable in some systems, but with limited margin.</td></tr>
          <tr><td>8–9&nbsp;Hz</td><td>Good</td><td>Inside the common target zone.</td></tr>
          <tr><td>9–11&nbsp;Hz</td><td>Ideal</td><td>Preferred centre of the common 8–12&nbsp;Hz target zone.</td></tr>
          <tr><td>11–12&nbsp;Hz</td><td>Good</td><td>Still inside the common target zone.</td></tr>
          <tr><td>12–13&nbsp;Hz</td><td>Acceptable but not optimal</td><td>Often usable, but worth checking.</td></tr>
          <tr><td>13–14&nbsp;Hz</td><td>Marginal</td><td>Higher risk of bass coloration and reduced tracking margin.</td></tr>
          <tr><td>Above 14&nbsp;Hz</td><td>Poor</td><td>Often too high for best analogue playback.</td></tr>
        </tbody>
      </table>

      <h3>Gauge, score and uncertainty</h3>
      <p>The gauge displays the result across a 5–16&nbsp;Hz range. The target zone is 8–12&nbsp;Hz and the ideal centre zone is 9–11&nbsp;Hz. The shaded uncertainty band is a visual reminder that compliance and effective mass figures are rarely exact.</p>
      <p>The match score is a UI summary derived from the classification band and distance from the 10&nbsp;Hz centre. It is not a separate physical measurement.</p>

      <h3>Tonearm Response Sweep</h3>
      <p>The response sweep is a MODEL layer. It shows how the selected mass/compliance combination behaves as a base-excited resonant system. It plots displacement at the headshell and acceleration at the headshell across the low-frequency region.</p>
      <table class="ea-help-table">
        <thead><tr><th>Assumption</th><th>Current value</th></tr></thead>
        <tbody>
          <tr><td>Model</td><td>Absolute base-excited response</td></tr>
          <tr><td>Q factor</td><td>3.33</td></tr>
          <tr><td>Stylus amplitude</td><td>0.1&nbsp;mm</td></tr>
          <tr><td>Acceleration threshold</td><td>0.05&nbsp;g</td></tr>
          <tr><td>Frequency range</td><td>0.016–31.5&nbsp;Hz</td></tr>
        </tbody>
      </table>
      <p>Use the response sweep to compare combinations and spot risk regions. Do not read it as a measured test-record result.</p>

      <h3>Reports and data feedback</h3>
      <p><strong>Export report</strong> downloads a text report. <strong>Save local</strong> stores the current setup in browser localStorage. <strong>Load local</strong> restores the latest local snapshot. Data feedback buttons open GitHub issue templates for incorrect or missing tonearm/cartridge data.</p>

      <div class="ea-help-callout ea-help-callout--warn">
        <strong>Borderline combinations:</strong> if the estimate lands near a band boundary, verify with a test record or Measurement Lab resonance capture before making expensive changes.
      </div>
    </section>

    <section class="ea-help-section" id="help-compliance">
      <h2>Compliance Estimator</h2>
      <p>Compliance Estimator converts published cartridge compliance figures into a 10&nbsp;Hz estimate suitable for Tonearm Match Lab. It can also use a cartridge dataset reference when a cartridge has match-ready runtime data.</p>

      <h3>Workflow</h3>
      <ol>
        <li>Optionally select a cartridge from the dataset. If the selected cartridge has 10&nbsp;Hz compliance, the tool fills the published value as a direct 10&nbsp;Hz reference.</li>
        <li>Enter the published compliance value if working manually.</li>
        <li>Select the source type: dynamic @ 10&nbsp;Hz, dynamic @ 100&nbsp;Hz, or static compliance.</li>
        <li>Select the generator model for 100&nbsp;Hz dynamic values.</li>
        <li>Read the estimated 10&nbsp;Hz compliance, confidence and provenance.</li>
      </ol>

      <h3>Conversion rules</h3>
      <table class="ea-help-table">
        <thead><tr><th>Published value</th><th>Generator model</th><th>Multiplier</th><th>Confidence</th></tr></thead>
        <tbody>
          <tr><td>Dynamic @ 10&nbsp;Hz</td><td>Any</td><td>×1.0</td><td>High / direct</td></tr>
          <tr><td>Dynamic @ 100&nbsp;Hz</td><td>MM or MI</td><td>×1.5</td><td>Medium / converted</td></tr>
          <tr><td>Dynamic @ 100&nbsp;Hz</td><td>MC low output</td><td>×2.0</td><td>Medium / converted</td></tr>
          <tr><td>Dynamic @ 100&nbsp;Hz</td><td>MC high output</td><td>×1.7</td><td>Medium / converted</td></tr>
          <tr><td>Dynamic @ 100&nbsp;Hz</td><td>Unknown or custom</td><td>User supplied, default 1.7</td><td>Wide / custom</td></tr>
          <tr><td>Static compliance</td><td>Any</td><td>×0.5</td><td>Wide / estimated</td></tr>
        </tbody>
      </table>

      <h3>Result details</h3>
      <p>The result panel reports the input value, input source, measurement basis, generator model, multiplier, confidence and provenance. Dataset-filled values are still shown as tool inputs so you can inspect or override them.</p>

      <div class="ea-help-callout ea-help-callout--warn">
        <strong>Compliance is not exact:</strong> suspension age, temperature, sample variation and measurement method can shift the real 10&nbsp;Hz value. Treat converted compliance as a practical estimate, not a certified laboratory value.
      </div>
    </section>

    <section class="ea-help-section" id="help-geometry">
      <h2>Tonearm Geometry Lab</h2>
      <p>Geometry Lab calculates reference alignment geometry for pivoted tonearms and compares it with simulated setup values. It includes tracking-error curves, printable protractors and a Behavior Context model layer.</p>

      <h3>Core workflow</h3>
      <ol>
        <li>Select the groove standard: IEC or DIN.</li>
        <li>Select the alignment method: Baerwald, Löfgren A, Löfgren B or Stevenson.</li>
        <li>Enter pivot-to-spindle distance manually, or select a tonearm with effective length data. When possible, the tool derives pivot-to-spindle from effective length and the selected null points.</li>
        <li>Inspect the reference geometry: pivot-to-spindle, effective length, overhang, offset angle and null points.</li>
        <li>Enter simulated pivot, overhang and offset values to compare a real-world setup against the reference.</li>
        <li>Use the tabs for tracking error, Behavior Context, ideal protractor and simulated protractor.</li>
      </ol>

      <h3>Alignment methods</h3>
      <table class="ea-help-table">
        <thead><tr><th>Method</th><th>Use</th></tr></thead>
        <tbody>
          <tr><td>Baerwald</td><td>Common two-null alignment target using balanced tracking-error distribution.</td></tr>
          <tr><td>Löfgren A</td><td>Equivalent family target represented separately in the UI when provided by runtime null-point data.</td></tr>
          <tr><td>Löfgren B</td><td>Lower weighted distortion through much of the record, often with higher inner-groove error than Stevenson.</td></tr>
          <tr><td>Stevenson</td><td>Prioritises the inner groove region by placing the inner null point close to the inner groove radius.</td></tr>
        </tbody>
      </table>

      <h3>Reference and simulated geometry</h3>
      <p>The reference geometry is FORMULA output derived from pivot-to-spindle distance and runtime null-point data. The simulated geometry is your what-if setup. If the simulated overhang/offset/pivot combination cannot reach valid null points, the tool marks the geometry invalid.</p>
      <p>Common invalid cases are impossible offset/pivot combinations, non-positive null points or a discriminant-negative geometry solution. When this happens, adjust the simulated values before using the simulated protractor.</p>

      <h3>Tracking error</h3>
      <p>The tracking-error tab plots angular error and weighted tracking-error estimate across the groove radius. It is deterministic geometry, not audio measurement.</p>

      <h3>Behavior Context</h3>
      <p>Behavior Context is a MODEL layer inspired by Korf-style interpretation. It does not predict measured THD, does not prove audible quality and does not rank one alignment as universally superior. It helps you see how geometry may interact with groove velocity, angular error, eccentricity, warp severity and stylus profile.</p>
      <table class="ea-help-table">
        <thead><tr><th>Input</th><th>Default</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>Eccentricity</td><td>0.25&nbsp;mm</td><td>Assumed record-centre error. Higher values increase modeled cyclic stress.</td></tr>
          <tr><td>Warp severity</td><td>Medium</td><td>Low, medium or high multiplier for modeled vertical disturbance risk.</td></tr>
          <tr><td>Stylus profile</td><td>Elliptical</td><td>Unknown, conical, elliptical, line-contact or microline model factor.</td></tr>
          <tr><td>Angular threshold</td><td>1.5°</td><td>Tracking-error threshold before angular-error penalty starts.</td></tr>
        </tbody>
      </table>
      <p>The model combines scrub proxy, groove velocity sensitivity, angular-error penalty and eccentricity/warp contribution into a 0–100 behavior risk index. The displayed classes are lower, medium and elevated.</p>
      <p>If simulated geometry differs from reference geometry, Behavior Context represents the simulated what-if setup and marks the result accordingly.</p>

      <h3>Protractors and export</h3>
      <p>Ideal and simulated protractors can be printed. Print at 100% scale and verify the printed 100&nbsp;mm scale with a ruler. Browser or printer "fit to page" scaling invalidates the protractor.</p>
      <p><strong>Export JSON</strong> downloads the current Geometry Lab session, including dataset version, selected standard, method, inputs, reference geometry and simulated geometry validity.</p>
    </section>

    <section class="ea-help-section" id="help-vta">
      <h2>VTA &amp; SRA Lab</h2>
      <p>VTA &amp; SRA Lab estimates how tonearm pillar height and mat thickness changes alter stylus rake angle. It also solves the inverse problem: how much pillar movement is required to reach a target SRA change.</p>

      <h3>Formula model</h3>
      <p>The tool uses effective length as the arm lever length and computes net vertical change as:</p>
      <p><strong>vertical change = pillar height change − mat thickness change</strong></p>
      <p>The SRA delta is then calculated from the arcsine of vertical change divided by effective length. The inverse solve uses the same geometry in reverse.</p>

      <h3>Defaults and inputs</h3>
      <table class="ea-help-table">
        <thead><tr><th>Input</th><th>Default</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>Effective length</td><td>237&nbsp;mm</td><td>Distance from tonearm pivot to stylus. Can be filled from tonearm dataset records with effective length.</td></tr>
          <tr><td>Reference SRA</td><td>92°</td><td>Baseline stylus rake angle when the arm is parallel to the record surface.</td></tr>
          <tr><td>Pillar height Δ</td><td>0&nbsp;mm</td><td>Positive means raising the tonearm pillar.</td></tr>
          <tr><td>Mat thickness Δ</td><td>0&nbsp;mm</td><td>Positive means a thicker mat or higher record surface.</td></tr>
          <tr><td>Target SRA Δ</td><td>+1°</td><td>Desired SRA change for inverse pillar calculation.</td></tr>
        </tbody>
      </table>

      <h3>Workflow</h3>
      <ol>
        <li>Select a tonearm or enter effective length manually.</li>
        <li>Set the reference SRA if you use a baseline other than 92°.</li>
        <li>Enter pillar and mat changes.</li>
        <li>Read SRA delta and actual SRA.</li>
        <li>Use the inverse target field to calculate required pillar movement.</li>
        <li>Export JSON or print the side-profile view when documenting a setup.</li>
      </ol>

      <h3>Visualization</h3>
      <p>The side-profile drawing shows the record, mat, platter, arm pillar and tonearm angle. When real motion is larger than the drawing can show clearly, the view may be visually clamped while the numeric calculation remains based on the entered values.</p>

      <div class="ea-help-callout ea-help-callout--warn">
        <strong>Physical caution:</strong> real SRA also depends on stylus shape, suspension compression, tracking force, record thickness and cartridge manufacturing tolerances. Use magnification or measurement when the target is critical.
      </div>
    </section>

    <section class="ea-help-section" id="help-measurement">
      <h2>Measurement Lab</h2>
      <p>Measurement Lab captures audio from a test record through the browser and analyses it locally. It supports live input from an ADC/audio interface and a self-test mode for checking the UI and analysis path without hardware.</p>

      <h3>Audio source setup</h3>
      <table class="ea-help-table">
        <thead><tr><th>Control</th><th>Current behaviour</th></tr></thead>
        <tbody>
          <tr><td>Source mode</td><td>Live capture uses the selected audio input. Self-test runs an internal 1&nbsp;kHz oscillator.</td></tr>
          <tr><td>Input device</td><td>Browser audio input device. The app requests 96&nbsp;kHz and 2 channels, then reports what the browser actually granted.</td></tr>
          <tr><td>Software iRIAA</td><td>Bypass or apply software RIAA playback de-emphasis. Keep Bypass when the signal has already passed through a normal phono preamp. Use Apply only when your measurement chain requires software RIAA correction.</td></tr>
          <tr><td>Test record</td><td>Optional runtime profile used to show which band to cue for speed, crosstalk, frequency response, THD, IMD or resonance.</td></tr>
          <tr><td>Actual format</td><td>Reported browser sample rate and channel format after the audio context starts.</td></tr>
        </tbody>
      </table>

      <h3>Sample-rate honesty</h3>
      <p>The lab asks for 96&nbsp;kHz stereo, but browsers and operating systems may silently resample. Measurement Lab reports the actual AudioContext rate and classifies the difference as match, minor or major.</p>
      <p>A major mismatch can make speed and wow/flutter measurements inaccurate because those depend directly on absolute sample timing.</p>

      <h3>Level meter and clipping</h3>
      <p>The level meter shows RMS, current peak and peak hold for left and right channels. The peak hold decays at 12&nbsp;dB per second. Any signal reaching 0&nbsp;dBFS is clipping and should be corrected before trusting measurements.</p>

      <h3>Speed &amp; Wow·Flutter</h3>
      <p>Speed capture records 30 seconds of a 3150&nbsp;Hz or 3000&nbsp;Hz reference tone. The engine detects upward zero crossings, estimates instantaneous frequency, calculates speed deviation and reports unweighted and IEC-weighted wow/flutter.</p>
      <table class="ea-help-table">
        <thead><tr><th>Class</th><th>Unweighted W&amp;F</th></tr></thead>
        <tbody>
          <tr><td>Excellent</td><td>Below 0.03%</td></tr>
          <tr><td>Good</td><td>Below 0.10%</td></tr>
          <tr><td>Acceptable</td><td>Below 0.20%</td></tr>
          <tr><td>Marginal</td><td>Below 0.30%</td></tr>
          <tr><td>Poor</td><td>0.30% or above</td></tr>
        </tbody>
      </table>
      <p>The IEC-weighted value is an approximation using a first-order flutter-weighting bandpass. It is useful for screening but is not a full quasi-peak IEC 386 instrument.</p>

      <h3>Channel balance &amp; crosstalk</h3>
      <p>This is a two-step capture. First cue the left-only band and record 10 seconds. Then cue the right-only band and record 10 seconds. The result reports channel balance as R − L and crosstalk as L → R and R → L.</p>
      <p>Negative crosstalk values are better. Well-set-up cartridges often land around −25 to −35&nbsp;dB across the audio band.</p>

      <h3>Frequency response</h3>
      <p>Frequency response captures 10 seconds of audio, averages 50%-overlap Hann-windowed FFT blocks, collapses them into 1/12-octave bins from 20&nbsp;Hz to 20&nbsp;kHz, and normalises the curve at 1&nbsp;kHz.</p>
      <p>When software iRIAA is bypassed, the chart overlays a RIAA reference curve for comparison. When iRIAA is applied, the software filter is part of the measured path.</p>

      <h3>THD &amp; SMPTE IMD</h3>
      <p>THD and IMD captures are 5 seconds long. THD supports 1000&nbsp;Hz, 315&nbsp;Hz and 10&nbsp;kHz fundamentals and reports THD plus the 2nd and 3rd harmonic levels. The engine analyses harmonics beyond those visible summary rows when they remain below Nyquist.</p>
      <p>SMPTE IMD uses fixed 60&nbsp;Hz and 7&nbsp;kHz tones and reports the summed sideband distortion as a percent.</p>

      <h3>Resonance</h3>
      <p>Resonance capture is a 30-second low-frequency sweep, defaulting to 5–25&nbsp;Hz. You can choose log or linear sweep mapping. The engine extracts the amplitude envelope, finds the resonance peak and estimates Q from the −3&nbsp;dB bandwidth when possible.</p>

      <h3>Activity log and exports</h3>
      <p>The activity log records session events and can be cleared or exported as text. <strong>Export Report</strong> downloads a readable text report. <strong>Export JSON</strong> downloads a structured session file containing capture metadata, selected test record and measurement results.</p>
      <p>The JSON export hashes the input device label instead of storing the raw label. It also records requested rate, actual rate, sample-rate honesty classification, iRIAA state and source mode.</p>

      <div class="ea-help-callout ea-help-callout--warn">
        <strong>Measurement limits:</strong> browser audio, OS mixers, ADC clocks, test-record quality, phono stage EQ, gain staging and room vibration can all affect results. Treat Measurement Lab as a practical browser measurement workbench, not as a calibrated laboratory instrument unless your whole measurement chain is calibrated.
      </div>
    </section>

    <section class="ea-help-section" id="help-privacy">
      <h2>Privacy &amp; browser storage</h2>
      <p>The audio tools run in the browser. Measurement Lab analyses captured audio locally in the page; the implemented measurement exports are user-triggered downloads.</p>

      <h3>Local browser storage</h3>
      <table class="ea-help-table">
        <thead><tr><th>Stored item</th><th>Purpose</th></tr></thead>
        <tbody>
          <tr><td>Theme</td><td>Remembers light/dark interface choice.</td></tr>
          <tr><td>Help dot</td><td>Remembers that the help hint has been seen.</td></tr>
          <tr><td>Welcome banner</td><td>Remembers that the home welcome banner was dismissed.</td></tr>
          <tr><td>Measurement Lab device</td><td>Remembers the selected browser audio device id when available.</td></tr>
          <tr><td>Tonearm Match local session</td><td>Stores the last saved local match setup for Load local.</td></tr>
          <tr><td>Analytics consent</td><td>Stores analytics preference state.</td></tr>
        </tbody>
      </table>

      <h3>Analytics</h3>
      <p>The current build includes Cloudflare Web Analytics and Microsoft Clarity. Microsoft Clarity uses project id <strong>wqtsdirx06</strong> and receives Consent V2 state from the stored analytics preference.</p>
      <p>No Measurement Lab audio sample content is intentionally uploaded by the measurement tools. Data feedback links open GitHub issue templates only when you choose to report missing or incorrect dataset data.</p>

      <div class="ea-help-callout ea-help-callout--warn">
        <strong>Resetting local state:</strong> clear this site's browser storage if you want to remove local tool preferences, saved local sessions, selected device ids or analytics consent state.
      </div>
    </section>

    <section class="ea-help-section" id="help-troubleshooting">
      <h2>Troubleshooting</h2>

      <h3>No audio input appears</h3>
      <ul>
        <li>Confirm the audio interface is connected before opening Measurement Lab.</li>
        <li>Grant microphone/audio input permission in the browser.</li>
        <li>Reload the page after changing OS audio permissions.</li>
        <li>Use Self-test to confirm that the UI and analysis path are working.</li>
      </ul>

      <h3>Actual sample rate differs from 96&nbsp;kHz</h3>
      <ul>
        <li>Check the operating system audio device format.</li>
        <li>Disable shared-mode resampling when your platform allows it.</li>
        <li>Use the reported sample-rate honesty classification when deciding whether a measurement is trustworthy.</li>
        <li>Be especially careful with speed and wow/flutter measurements when the mismatch is major.</li>
      </ul>

      <h3>The level meter clips</h3>
      <ul>
        <li>Lower ADC input gain or phono stage output level.</li>
        <li>Avoid any signal touching 0&nbsp;dBFS.</li>
        <li>Repeat the measurement after correcting gain staging.</li>
      </ul>

      <h3>Measurement Lab results look wrong</h3>
      <ul>
        <li>Confirm that the correct test-record band is cued.</li>
        <li>Check whether Software iRIAA should be Bypass or Apply for your signal chain.</li>
        <li>Confirm the selected test record profile matches the physical record.</li>
        <li>Repeat the capture after the stylus has settled into the band.</li>
      </ul>

      <h3>Tonearm Match gives a borderline result</h3>
      <ul>
        <li>Check whether the compliance value is really dynamic @ 10&nbsp;Hz.</li>
        <li>Use Compliance Estimator if the only published value is 100&nbsp;Hz or static compliance.</li>
        <li>Verify tonearm effective mass includes the relevant headshell configuration.</li>
        <li>Use Measurement Lab resonance capture or a test record when the pairing matters.</li>
      </ul>

      <h3>Geometry Lab says the simulated setup is invalid</h3>
      <ul>
        <li>Check pivot-to-spindle distance, overhang and offset angle.</li>
        <li>Make sure the values describe a physically possible pivoted tonearm setup.</li>
        <li>Reset simulation to the reference geometry, then adjust one value at a time.</li>
      </ul>

      <h3>Printed protractor scale is wrong</h3>
      <ul>
        <li>Print at 100% scale.</li>
        <li>Disable "fit to page" and other printer scaling options.</li>
        <li>Measure the printed 100&nbsp;mm reference scale before using the protractor.</li>
      </ul>
    </section>

    <section class="ea-help-section" id="help-glossary">
      <h2>Glossary</h2>
      <div class="ea-help-grid">
        <div class="ea-help-card">
          <h3>Effective mass</h3>
          <p>The moving mass seen by the cartridge suspension, not the physical weight of the tonearm.</p>
        </div>
        <div class="ea-help-card">
          <h3>Compliance</h3>
          <p>The springiness of the cartridge suspension, usually given in µm/mN or cu.</p>
        </div>
        <div class="ea-help-card">
          <h3>F₀</h3>
          <p>The estimated arm/cartridge resonance frequency.</p>
        </div>
        <div class="ea-help-card">
          <h3>VTF</h3>
          <p>Vertical tracking force. In the current Tonearm Match formula it is recorded as setup context but not added to moving mass.</p>
        </div>
        <div class="ea-help-card">
          <h3>Overhang</h3>
          <p>How far the stylus extends beyond the spindle when the arm is swung over the platter centre.</p>
        </div>
        <div class="ea-help-card">
          <h3>Offset angle</h3>
          <p>The angle between the headshell/cartridge axis and the tonearm tube/pivot line.</p>
        </div>
        <div class="ea-help-card">
          <h3>Null points</h3>
          <p>Groove radii where tracking-angle error is zero for a chosen alignment.</p>
        </div>
        <div class="ea-help-card">
          <h3>VTA</h3>
          <p>Vertical tracking angle, usually adjusted by changing tonearm height.</p>
        </div>
        <div class="ea-help-card">
          <h3>SRA</h3>
          <p>Stylus rake angle, the angle of the stylus contact geometry relative to the record surface.</p>
        </div>
        <div class="ea-help-card">
          <h3>iRIAA</h3>
          <p>Software RIAA playback de-emphasis applied in Measurement Lab when the captured signal path requires it.</p>
        </div>
        <div class="ea-help-card">
          <h3>Wow &amp; flutter</h3>
          <p>Slow and fast speed variation measured from a reference tone.</p>
        </div>
        <div class="ea-help-card">
          <h3>Crosstalk</h3>
          <p>Signal leakage from one stereo channel into the other, expressed in dB. More negative is better.</p>
        </div>
        <div class="ea-help-card">
          <h3>THD</h3>
          <p>Total harmonic distortion, derived from harmonic energy relative to the fundamental tone.</p>
        </div>
        <div class="ea-help-card">
          <h3>IMD</h3>
          <p>Intermodulation distortion, measured from sidebands around a high-frequency tone when a low-frequency tone is also present.</p>
        </div>
        <div class="ea-help-card">
          <h3>Q estimate</h3>
          <p>A resonance sharpness estimate based on the −3&nbsp;dB bandwidth around the measured resonance peak.</p>
        </div>
        <div class="ea-help-card">
          <h3>FORMULA</h3>
          <p>Deterministic mathematical output from explicit inputs.</p>
        </div>
        <div class="ea-help-card">
          <h3>MODEL</h3>
          <p>Approximation or scenario model. Useful for comparison, not a measured fact.</p>
        </div>
        <div class="ea-help-card">
          <h3>MEASURED</h3>
          <p>Output derived from captured audio in Measurement Lab.</p>
        </div>
        <div class="ea-help-card">
          <h3>VERIFIED</h3>
          <p>Saved or independently checked evidence, such as validated dataset records or exported reports.</p>
        </div>
      </div>
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

export function openHelpModal(): void {
  if (activeBackdrop) return;
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
  document.querySelectorAll<HTMLElement>('[data-help-dot]').forEach((dot) => {
    if (!shouldShowHelpDot()) dot.remove();
  });

  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest('[data-help-toggle]');
    if (button) {
      markHelpDotSeen();
      openHelpModal();
    }
  });
}
