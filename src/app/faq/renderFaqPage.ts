import { renderToolTopbar } from '../../shared/ui/renderToolTopbar';

export function renderFaqPage(): string {
  return `
    <div class="ea-site-shell">
      ${renderToolTopbar('tools')}

      <main class="ea-info-main" aria-labelledby="faq-title">
        <article class="ea-info-article">
          <header class="ea-info-header">
            <h1 id="faq-title">Frequently Asked Questions</h1>
            <p class="ea-info-lead">
              Common questions about tonearm–cartridge matching, compliance, resonance
              and how to use the Engrove Audio Tools calculators.
            </p>
          </header>

          <section aria-labelledby="faq-what-is">
            <h2 id="faq-what-is">What is Engrove Audio Tools?</h2>
            <p>
              Engrove Audio Tools is a free, browser-based toolkit for DIY vinyl and audio
              enthusiasts. It provides calculators and reference tools for evaluating
              tonearm–cartridge matching, resonance frequency, compliance, alignment geometry
              and VTA/SRA adjustments—before buying, mounting or designing a turntable setup.
              No account or installation is required.
            </p>
          </section>

          <section aria-labelledby="faq-match">
            <h2 id="faq-match">How do I know if a cartridge matches my tonearm?</h2>
            <p>
              Use the Tonearm Match Lab. Enter the tonearm effective mass, cartridge body mass,
              an estimate for fastener mass, and the cartridge compliance at 10 Hz. The tool
              calculates the expected resonance frequency of the combination and classifies
              it as well-matched, borderline or mismatched.
            </p>
            <p>
              A resonance frequency between roughly 8 Hz and 12 Hz is generally considered
              a good match for typical vinyl. Below ~6 Hz the arm–cartridge system may
              resonate with record warps or acoustic feedback; above ~14 Hz it approaches
              audible frequencies.
            </p>
          </section>

          <section aria-labelledby="faq-compliance-types">
            <h2 id="faq-compliance-types">Why are there different compliance values for the same cartridge?</h2>
            <p>
              Compliance is measured at different test frequencies by different manufacturers.
              Japanese manufacturers typically publish a 100 Hz dynamic compliance; European
              manufacturers more commonly publish a 10 Hz quasi-static figure. The same
              cartridge measured at 100 Hz will give a lower compliance number than at 10 Hz
              because the suspension behaves differently at different frequencies.
            </p>
            <p>
              The resonance formula requires the 10 Hz figure. If you only have the 100 Hz
              value, use the Compliance Estimator to convert it. The default multiplier is
              1.7×, which is a widely cited approximation; actual values vary by cartridge.
            </p>
          </section>

          <section aria-labelledby="faq-compliance-estimator">
            <h2 id="faq-compliance-estimator">What problem does the Compliance Estimator solve?</h2>
            <p>
              When a cartridge datasheet lists only 100 Hz dynamic compliance, you cannot
              directly use that figure in the resonance equation—doing so will give an
              incorrect (too low) resonance frequency. The Compliance Estimator converts the
              100 Hz figure to an approximate 10 Hz quasi-static value so you can use it in
              the Tonearm Match Lab.
            </p>
          </section>

          <section aria-labelledby="faq-geometry">
            <h2 id="faq-geometry">What is tonearm alignment and why does it matter?</h2>
            <p>
              A pivoted tonearm traces a curved path across the record, while the groove
              itself is a spiral. The cartridge stylus is angled relative to the headshell
              to minimise the resulting tracking error at key points on the record. Different
              alignment standards (Baerwald, Löfgren, Stevenson) define different null points
              and make different trade-offs across the playing surface.
            </p>
            <p>
              The Tonearm Geometry Lab calculates the correct overhang and offset angle for a
              chosen standard, given your tonearm's effective length and spindle-to-pivot distance.
              It also simulates the effect of mounting errors.
            </p>
          </section>

          <section aria-labelledby="faq-vta-sra">
            <h2 id="faq-vta-sra">What is the difference between VTA and SRA?</h2>
            <p>
              Vertical Tracking Angle (VTA) is the angle of the tonearm tube relative to
              the record surface. Stylus Rake Angle (SRA) is the angle of the stylus shank
              itself. They are related but not identical; the difference depends on the
              cartridge body angle and stylus geometry.
            </p>
            <p>
              The VTA &amp; SRA Lab calculates how changes in tonearm height (pillar height
              or mat thickness) translate into changes in SRA, using the tonearm effective
              length as the lever arm.
            </p>
          </section>

          <section aria-labelledby="faq-accuracy">
            <h2 id="faq-accuracy">How accurate are the calculations?</h2>
            <p>
              The resonance calculation is accurate given correct inputs, but the inputs
              themselves carry uncertainty: compliance varies with temperature, stylus
              condition and measurement method; effective mass figures from manufacturers
              sometimes exclude headshell mass. Treat the resonance result as a planning
              guide, not a precision measurement.
            </p>
            <p>
              The compliance conversion multiplier (1.7×) is an approximation. Some
              cartridges deviate from this factor. Where possible, use a published 10 Hz
              figure directly.
            </p>
            <p>
              See the <a href="/methodology">Methodology</a> page for a detailed description
              of formulas, assumptions and limitations.
            </p>
          </section>

          <section aria-labelledby="faq-free">
            <h2 id="faq-free">Is Engrove Audio Tools free to use?</h2>
            <p>
              Yes. All tools are free to use with no account, login or payment required.
              The site runs entirely in the browser; no data is sent to a server when you
              use the calculators.
            </p>
          </section>

          <section aria-labelledby="faq-data">
            <h2 id="faq-data">Where does the cartridge and tonearm data come from?</h2>
            <p>
              The reference dataset is compiled from manufacturer datasheets, historical
              catalogues and other documented sources. Each value carries a provenance flag
              indicating confidence level. See the <a href="/data-sources">Data Sources</a>
              page for details.
            </p>
          </section>

          <nav class="ea-info-back" aria-label="Return navigation">
            <a href="/">← Back to tools</a>
          </nav>
        </article>
      </main>
    </div>
  `;
}
