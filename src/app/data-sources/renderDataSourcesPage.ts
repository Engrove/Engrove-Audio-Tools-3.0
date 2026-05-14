import { renderToolTopbar } from '../../shared/ui/renderToolTopbar';

export function renderDataSourcesPage(): string {
  return `
    <div class="ea-site-shell">
      ${renderToolTopbar('tools')}

      <main class="ea-info-main" aria-labelledby="data-sources-title">
        <article class="ea-info-article">
          <header class="ea-info-header">
            <h1 id="data-sources-title">Data Sources</h1>
            <p class="ea-info-lead">
              This page describes the origin, provenance flags, dataset versioning and
              known limitations of the cartridge and tonearm reference data used by
              Engrove Audio Tools.
            </p>
          </header>

          <section aria-labelledby="ds-origin">
            <h2 id="ds-origin">Data Origin</h2>
            <p>
              The reference dataset covers cartridge and tonearm specifications collected
              from multiple source types. Each record carries a provenance tag indicating
              how confident we are in that value.
            </p>
            <ul>
              <li>
                <strong>Manufacturer datasheets and technical documents</strong> — the
                highest-confidence source. Values are taken directly from official
                documentation where available.
              </li>
              <li>
                <strong>Manufacturer product listings and historical catalogues</strong> —
                values from promotional or sales materials. Generally reliable for
                nominal specifications but may differ from measured values or vary
                between production runs.
              </li>
              <li>
                <strong>Derived or estimated values</strong> — values calculated from
                other known data. For example, a 100 Hz dynamic compliance figure
                converted to 10 Hz quasi-static using the standard multiplier. These
                are flagged as estimated and should be treated as approximations.
              </li>
            </ul>
          </section>

          <section aria-labelledby="ds-provenance">
            <h2 id="ds-provenance">Provenance Flags</h2>
            <p>
              Every specification value in the dataset is tagged with one of the following
              provenance levels, shown in tool interfaces where relevant:
            </p>
            <ul>
              <li>
                <strong>Direct</strong> — taken directly from a primary manufacturer
                document. Highest confidence. Suitable for precision calculations.
              </li>
              <li>
                <strong>Manufacturer</strong> — from manufacturer-published figures via
                secondary sources. High confidence for typical planning purposes.
              </li>
              <li>
                <strong>Estimated</strong> — derived, converted or inferred. Use with
                caution; treat results as indicative rather than definitive.
              </li>
            </ul>
            <p>
              Provenance information is surfaced in the tool results so users can judge
              whether a particular input warrants additional verification.
            </p>
          </section>

          <section aria-labelledby="ds-versioning">
            <h2 id="ds-versioning">Dataset Versioning</h2>
            <p>
              The dataset is versioned. Tools that depend on reference data pin their
              results to a specific dataset version, so results are reproducible and
              not silently changed by dataset updates.
            </p>
            <p>
              The current dataset is version 3 (v3). Version numbers are incremented
              when the schema or a significant portion of the data changes. Minor
              corrections within the same schema increment a revision suffix.
            </p>
          </section>

          <section aria-labelledby="ds-limitations">
            <h2 id="ds-limitations">Known Limitations</h2>
            <ul>
              <li>
                Coverage is not exhaustive. Many older, obscure or regional products
                are absent or have incomplete records.
              </li>
              <li>
                Specifications for cartridges and tonearms produced over long periods
                may not reflect production variation. A model made in 1975 may have
                different compliance than the same model name made in 1985.
              </li>
              <li>
                Re-tipped cartridges typically have different compliance characteristics
                than originals. The dataset reflects factory specifications, not retip
                outcomes.
              </li>
              <li>
                Tonearm effective mass figures in manufacturer documentation sometimes
                exclude headshell mass or include it; the dataset notes this where
                known, but ambiguities may remain.
              </li>
              <li>
                We do not republish copyrighted data tables. Where raw specifications
                are paraphrased or summarised, accuracy depends on the fidelity of
                the original source.
              </li>
            </ul>
          </section>

          <section aria-labelledby="ds-contributing">
            <h2 id="ds-contributing">Corrections and Contributions</h2>
            <p>
              If you find an error or omission in the dataset, the project is hosted
              on GitHub. Corrections with a verifiable source reference are welcome.
              Values without a traceable source cannot be accepted into the primary
              dataset but may be noted as community-observed.
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
