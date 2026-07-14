import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

// Open-file routing (warm + cold start) is wired inside App.svelte's onMount via
// src/lib/fileService.ts, which routes to whichever module owns the file.
const app = mount(App, { target: document.getElementById('app')! });
export default app;
