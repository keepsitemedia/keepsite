import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.keepsitemedia.com',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/start/thanks') && !page.includes('/404'),
    }),
  ],
});
