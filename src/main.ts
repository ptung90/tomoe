import { mount } from 'svelte';
import App from './App.svelte';
import { listenForOpenFile, loadStartupFile } from './lib/fileService';
import './app.css';

const app = mount(App, { target: document.getElementById('app')! });
listenForOpenFile();      // warm start: app already running
loadStartupFile();        // cold start: pull the launch file
export default app;
