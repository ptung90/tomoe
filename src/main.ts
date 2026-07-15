import { mount } from 'svelte';
import App from './App.svelte';
// Lexend — self-hosted (offline + print-safe), bundled by Vite. Weights match the
// style-controls weight picker (400/500/600/700).
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/500.css';
import '@fontsource/lexend/600.css';
import '@fontsource/lexend/700.css';
import './app.css';

// Open-file routing (warm + cold start) is wired inside App.svelte's onMount via
// src/lib/fileService.ts, which routes to whichever module owns the file.
const app = mount(App, { target: document.getElementById('app')! });
export default app;
