import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://les3darianne.xyz',
  output: 'server',
  adapter: vercel(),
});
