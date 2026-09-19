# Research validation

The engine in `netlify/functions/lib/office/research.mjs` is checked against
the Makeup by Brinley study (22 keywords, captured 2026-09-17 to 2026-09-18).
Each section is written by hand from the script it names. A section that
still reads "not run" has not been run.

## Page list against an independent clustering

Script: `node scripts/validate-clusters.mjs <export.json> <external.csv>`
External tool: (Keyword Insights on its $1 trial, or the free fallback used)
Date: not run

Pair agreement at the shipped cut:
Adjusted Rand index at the shipped cut:
Sweep result (best cut, and whether the peak was sharp or a plateau):
Cut chosen, and why:

Note: this study's service areas were empty, so the Location-page rule was
off; Park City, Moab and Salt Lake City were typed as service pages.

## Captures against a SERP API

Script: `SERPAPI_KEY=... node scripts/validate-captures.mjs <export.json>`
Location used:
Date: not run

Median agreement:
Keywords well below the median, and what differed:
Verdict on the research profile:

## Volume

Source: Keyword Planner CSV, imported through the Research tab.
Date: not run

Keywords the file did not match:
Pages set aside as not worth building, with their volumes:
Whether the floor of 10 looks right for this study:

## The owner's read

With the new page list beside the one settled by hand on 2026-09-17: would
you build the new one? What would you change first?
