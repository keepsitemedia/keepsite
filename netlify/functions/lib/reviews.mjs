// The Stage Three site review, one definition per client. Unlike intro,
// brand and build, which ask every client the same questions, a review walks
// one client through their own pages, so the definition is looked up by slug
// under the single form name `review`. A new client's review is a file in
// src/data/questionnaires/reviews/ and a line here.
//
// Static imports for the reason questionnaire.mjs gives: esbuild inlines them
// into the function bundle, and raw Node needs the attribute.
import makeupByBrynlie from '../../../src/data/questionnaires/reviews/makeup-by-brynlie.json' with { type: 'json' };

export const REVIEW = 'review';
export const REVIEWS = { __proto__: null, 'makeup-by-brynlie': makeupByBrynlie };

export const reviewPath = (slug) => `/questionnaire/${REVIEW}/${slug}/`;
