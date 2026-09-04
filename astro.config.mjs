import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://www.keepsitemedia.com',
  // Static stays the default. Only pages that export `prerender = false`
  // (the office) render per request; the adapter exists for those alone.
  output: 'static',
  adapter: netlify(),
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/start/thanks') &&
        !page.includes('/404') &&
        !page.includes('/questionnaire/') &&
        !page.includes('/office/'),
    }),
  ],
});
