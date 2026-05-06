import './shared/ui/styles/base.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = `
    <section class="shell">
      <p class="eyebrow">Engrove Audio</p>
      <h1>Engrove Audio Tools 3.0</h1>
      <p class="lead">Public, modular audio tools. Bootstrap skeleton ready for productized modules.</p>
      <div class="module-grid">
        <article class="module-card"><h2>Data Explorer</h2><p>Public data exploration module placeholder.</p></article>
        <article class="module-card"><h2>Tonearm Designer</h2><p>Future productized module based on validated prototype functionality.</p></article>
      </div>
    </section>
  `;
}
