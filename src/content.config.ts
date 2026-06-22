import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const portfolio = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/portfolio' }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(),
    url: z.string().url(),
    thumbnail: z.string().optional(),
    order: z.number().default(0),
  }),
});

export const collections = { portfolio };
