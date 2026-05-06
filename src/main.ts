
import './shared/ui/styles/base.css';
import { renderHomePage } from './app/home/renderHomePage';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Engrove app mount point #app was not found.');
}

renderHomePage(app);
