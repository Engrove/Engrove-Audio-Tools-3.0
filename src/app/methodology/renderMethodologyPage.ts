import { renderToolTopbar } from '../../shared/ui/renderToolTopbar';

export function renderMethodologyPage(): string {
  return `
    <div class="ea-site-shell">
      ${renderToolTopbar('tools')}

      <main class="ea-info-main" aria-labelledby="methodology-title">
        <article class="ea-info-article">
          <header class="ea-info-header">
            <h1 id="methodology-title">Methodology</h1>
            <p class="ea-info-lead">
              This page explains the formulas, assumptions, measurement standards and known
              limitations behind the Engrove Audio Tools calculators.
            </p>
          </header>

          <section aria-labelledby="method-resonance">
            <h2 id="method-resonance">Resonance Frequency</h2>
            <p>
              A tonearm and cartridge form a spring–mass system. The cantilever suspension acts
              as the spring; the combined mass of the tonearm effective mass, cartridge body,
              stylus assembly and mounting hardware acts as the moving mass. This system has a
              natural resonance frequency.
            </p>
            <p>
              The Tonearm Match Lab calculates this frequency using the standard formula:
            </p>
            <pre class="ea-info-formula">f = 1000 / (2π × √(m × c))</pre>
            <p>
              Where <code>f</code> is resonance frequency in Hz, <code>m</code> is total effective
              mass in grams (tonearm effective mass + cartridge body mass + fastener mass),
              and <code>c</code> is cartridge compliance in 10<sup>−6</sup> cm/dyne (µm/mN).
            </p>
            <p>
              A resonance frequency between approximately 8 Hz and 12 Hz is generally considered
              well-matched for typical vinyl playback. Below ~6 Hz the system may be susceptible
              to warps and acoustic feedback; above ~14 Hz the resonance approaches the audible
              range and can affect low-frequency tracking.
            </p>
          </section>

          <section aria-labelledby="method-compliance">
            <h2 id="method-compliance">Compliance Measurement Standards</h2>
            <p>
              Cartridge compliance describes how easily the cantilever deflects under lateral
              force. It is measured in µm/mN (or equivalently 10<sup>−6</sup> cm/dyne).
              Higher compliance means the cantilever deflects more easily; lower compliance
              means a stiffer suspension.
            </p>
            <p>
              Manufacturers measure and publish compliance using different test frequencies,
              which produce different numbers for the same cartridge:
            </p>
            <ul>
              <li>
                <strong>100 Hz dynamic compliance</strong> — the value most commonly published
                by Japanese manufacturers. Measured with a sinusoidal signal at 100 Hz.
                This value is lower than quasi-static compliance.
              </li>
              <li>
                <strong>10 Hz quasi-static compliance</strong> — the value used in the resonance
                equation, and more representative of the low-frequency behaviour relevant to
                tonearm matching. Most commonly published by European manufacturers.
              </li>
              <li>
                <strong>Static compliance</strong> — measured under a constant applied force.
                Rarely used for tonearm matching calculations.
              </li>
            </ul>
            <p>
              Because the resonance equation requires 10 Hz compliance, users with only a
              100 Hz figure must convert it. The Compliance Estimator uses a published
              multiplier (default 1.7×) to approximate the 10 Hz value from a 100 Hz figure.
              This multiplier is a commonly cited approximation; actual values vary between
              cartridge types and suspension materials.
            </p>
          </section>

          <section aria-labelledby="method-alignment">
            <h2 id="method-alignment">Alignment Geometry</h2>
            <p>
              The Tonearm Geometry Lab implements standard alignment methods including
              Baerwald, Löfgren A, Löfgren B and Stevenson. Each defines a pair of null
              points (radii on the record where tracking error is zero) and minimises a
              different error metric across the playing surface.
            </p>
            <p>
              Inputs are effective tonearm length and, for some methods, inner and outer
              groove radii. Outputs are overhang, offset angle, null point radii and a
              simulated tracking error curve. Mounting error simulation applies an offset
              to overhang or angle and recalculates the error to show sensitivity.
            </p>
          </section>

          <section aria-labelledby="method-vta">
            <h2 id="method-vta">VTA and SRA</h2>
            <p>
              Vertical Tracking Angle (VTA) is the angle of the tonearm from horizontal.
              Stylus Rake Angle (SRA) is the angle of the stylus shank relative to the
              record surface. These are related but not identical; the relationship depends
              on stylus geometry and cartridge body angle.
            </p>
            <p>
              The VTA &amp; SRA Lab calculates changes in SRA from changes in tonearm pillar
              height or mat thickness, using the effective tonearm length as the lever arm.
              Inverse solving finds the height change needed to achieve a target SRA delta.
              Results are approximate: actual SRA depends on stylus profile and mounting
              details not captured by this model.
            </p>
          </section>

          <section aria-labelledby="method-confidence">
            <h2 id="method-confidence">Data Confidence Levels</h2>
            <p>
              Reference data for cartridges and tonearms is tagged with a provenance level
              indicating how the value was obtained:
            </p>
            <ul>
              <li>
                <strong>Direct</strong> — sourced directly from manufacturer documentation
                or a verified datasheet. Highest confidence.
              </li>
              <li>
                <strong>Manufacturer</strong> — from manufacturer-published figures via
                secondary sources such as product listings or historical records. High
                confidence but may reflect nominal or promotional values.
              </li>
              <li>
                <strong>Estimated</strong> — calculated or inferred from related data
                (for example, compliance converted from 100 Hz to 10 Hz). Lower confidence;
                treat as an approximation.
              </li>
            </ul>
          </section>

          <section aria-labelledby="method-limitations">
            <h2 id="method-limitations">Known Limitations</h2>
            <ul>
              <li>
                The resonance model is simplified: it does not account for cantilever damping,
                tonearm bearing friction, anti-skate mechanisms or compliance non-linearity.
              </li>
              <li>
                Compliance varies with temperature and stylus condition. Published figures
                are typically measured at room temperature with a new stylus.
              </li>
              <li>
                The 1.7× compliance conversion multiplier is an approximation. Some cartridges
                deviate significantly; the tool accepts a custom multiplier for this reason.
              </li>
              <li>
                Cartridge body mass and fastener mass estimates introduce uncertainty. Weigh
                components directly where possible for best results.
              </li>
              <li>
                Historical specifications may not reflect production variation across
                manufacturing runs or years.
              </li>
            </ul>
          </section>

          <nav class="ea-info-back" aria-label="Return navigation">
            <a href="/">← Back to tools</a>
          </nav>
        </article>
      </main>
    </div>
  `;
}
