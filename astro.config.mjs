import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  site: 'https://les3darianne.xyz',
  output: 'hybrid',
  adapter: vercel(),
});
