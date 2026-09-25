import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Bundled Inter (variable) so the UI keeps its typography fully offline.
import '@fontsource-variable/inter/wght.css';
import '@/styles/globals.css';
import { App } from '@/App';

const container = document.getElementById('root');

if (!container) {
  throw new Error('The application root element (#root) is missing from index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
