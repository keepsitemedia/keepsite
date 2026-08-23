import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    url: z.string().url(),
    tier: z.enum(['Presence', 'Search', 'Search Plus']),
    job: z.string(),
    scope: z.array(z.string()).min(2).max(4),
    // A public path such as "/images/acme-salon.png". Not Astro's
    // image() helper: DecapCMS writes public URLs, and image() needs
    // a path relative to the markdown file.
    screenshot: z.string(),
    launched: z.coerce.date(),
    featured: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

export const collections = { work };
