import { defineConfig } from 'vite';

// Project is deployed to GitHub Pages at https://lukesolgg.github.io/kansei/
// so assets must be served from the /kansei/ base. Local `npm run dev` works
// at http://localhost:5173/kansei/ with the same base.
export default defineConfig({
  base: '/kansei/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
    port: 5173,
  },
});
