import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://les3ddeadrianne.vercel.app', // ← remplace par la vraie URL Vercel une fois déployé
  output: 'static',
  integrations: [sitemap()],
});
