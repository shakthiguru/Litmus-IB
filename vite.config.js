import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages (/<repo-name>/) and anywhere else.
export default defineConfig({
  plugins: [react()],
  base: './',
});
