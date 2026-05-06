import './shared/ui/styles/base.css';
import { enableHomePageInteractions, renderHomePage } from './app/home/renderHomePage';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = renderHomePage();
  enableHomePageInteractions();
}
