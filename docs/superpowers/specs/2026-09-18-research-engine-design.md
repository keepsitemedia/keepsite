# A research engine that decides

**Status:** approved in chat 2026-09-18
**Replaces:** the pair ladder in `2026-09-13-serp-research-design.md` §6 and all of `2026-09-18-sharper-pair-signal-design.md`
**Keeps:** capture, rounds, notes, documents and the report's furniture from those specs and `2026-09-17-research-rounds-design.md`

## 1. What is wrong today

The Makeup by Brinley study (22 keywords, all captured, exported 2026-09-18)
run through the current code:

| | |
|---|---|
| Pairs | 231: 31 strong, 200 low, 0 gray |
| Strong pairs decided by the page-type tiebreak | 23 of 31 |
| Pages recommended | 12: one group of 10, then 11 singletons |
| Singleton pages typed "Directory" | 4 |
| Reads with the cluster field still Undecided | 5 of 12 |
| Service areas set | none |

Five causes.

**The page list is not a site structure.** Eleven of twelve pages are one
keyword each and four tell the client to build a "Directory" page, because a
group's type is the leading type across all its results, directories
included.

**The tiebreak became the new constant.** Directories were stripped from the
signal because they rank for everything. "Both sides led by homepages" is
true for 15 of 22 keywords in this niche, so the type tiebreak promotes almost
any 2-of-5 pair to strong.

**The tool never decides what kind of page a search wants.** "soft glam vs
full glam" ranks six blog posts; "Bridal Party Hair and Makeup Cost" ranks
pricing content; Park City, Moab, Salt Lake City, La Caille and Sundance are
places and venues. None of that reaches the recommendation.

**It never asks whether a search is worth a page.** Without volume, a keyword
nobody searches and the head term weigh the same in the structure.

**The unit of decision is the pair.** 231 pairs from 22 keywords; a denominator
of 3 to 5 businesses; ratios that step by 0.2 or 0.25. The 2026-09-18
calibration found no natural break because there is none to find at that
resolution.

## 2. What changes, in one paragraph

One keyword-by-business matrix replaces 231 independent comparisons. Every
business is weighted by rank and by rarity across the study, directories
weigh nothing, and one clustering pass groups keywords into pages and orders
them so the page blocks sit on the matrix's diagonal. Each page gets a kind,
a confidence in words, and a one-line reason. Search volume, imported from a
Keyword Planner CSV, decides which pages are worth building. The owner reviews
pages, not pairs, and corrects by moving keywords between them. The report
prints the matrix and the reasons. Three scripts validate the method on the
Makeup by Brinley study against an independent clustering tool, a SERP API,
and Keyword Planner.

## 3. The engine

All of it is pure functions over a round in `research.mjs`. It replaces
`comparePair`'s ladder, `pairs`, `decisiveFor`, `group`, `READ_TEXT`,
`READS`, `SAME`, `STRONG_RATIO`, `GRAY_RATIO` and `MIN_BUSINESSES`.

### 3.1 Columns are businesses

A column is `businessOf(url)`. It already resolves Instagram, Facebook and
TikTok profile URLs to the account behind them. It widens to every platform
that hosts one page per business, each with its profile path spelled out:

| Platform | Profile when | Otherwise |
|---|---|---|
| instagram.com, facebook.com, tiktok.com | as today | platform |
| yelp.com | first segment `biz` | platform |
| weddingwire.com | first segment `biz` | platform |
| theknot.com | first segment `marketplace` and the last segment ends in a run of digits (a vendor id); `marketplace/beauty-services-salt-lake-city-ut` is a category list, not a vendor | platform |
| houzz.com, bark.com | first segment `pro` or `professionals` | platform |

A profile resolves to `host/handle` as today; anything else resolves to the
bare host, and `classify` calls the bare host of a listed platform a
Directory.

**Known gap, recorded not solved:** a business's own site and its profile on
a platform are two columns. The tool cannot know that
dianaelizabethbeauty.com and instagram.com/dianaelizabethbeauty are one
artist. This makes similarity conservative, never inflated.

### 3.2 The matrix

`matrix(round)` returns `{ keywords, businesses, cells, weight }`:

- `keywords`: the captured keywords in round order.
- `businesses`: every distinct business across the captures.
- `cells[k][b]`: the rank weight of business `b`'s best result for keyword
  `k`, `1 / log2(rank + 1)`, the DCG discount: rank 1 is 1.0, rank 4 about
  0.43, rank 8 about 0.32. Missing means the business does not rank. Beside
  the weight the cell keeps the normalized URL of that best result.
- `weight[b]`: the column weight. **Zero when any of the business's results
  is classified Directory**, whatever its rarity: a paid aggregator list says
  nothing about intent however rarely it ranks. Otherwise `ln(N / df)` where
  `N` is the number of captured keywords and `df` the number the business
  ranks for. A business in every SERP weighs zero; one in two of 22 weighs
  about 2.4. This is what retires the directory list from the signal; the
  list stays for the zero rule and for display.

### 3.3 Similarity

`similarity(matrix, a, b)` is a weighted Jaccard in 0 to 1:

```
for keywords a and b and each business x:
credit(x) = 1 if a's and b's best results for x are the same normalized URL, else 0.5
num = Σ_x weight[x] · min(cells[a][x], cells[b][x]) · credit(x)   over x ranking for both
den = Σ_x weight[x] · max(cells[a][x] ?? 0, cells[b][x] ?? 0)     over x ranking for either
similarity = den ? num / den : 0
```

Symmetric. 1.0 for identical result lists, 0 for disjoint lists, and the
half credit keeps "same business, different page" as weaker evidence than
the same page. `similarities(matrix)` returns the full square, computed once
per render and shared by everything below.

### 3.4 Grouping

`cluster(matrix, similarities, cut)` is average-linkage agglomerative
clustering:

1. Every keyword starts alone.
2. Find the two groups whose members have the highest mean pairwise
   similarity. If that mean is below `cut`, stop.
3. Merge them, record the merge and its score, repeat.

The merge tree gives `order`, the leaf order the matrix is drawn in, so
merged keywords sit next to each other and groups appear as blocks on the
diagonal. Average linkage is chosen over single linkage, which is what
union-find was, so a keyword joins a group when it resembles the group on
average and a chain A–B, B–C never drags A and C together.

`CUT` is the engine's one parameter. It is provisional until §9's
validation sets it, and the constant carries a comment with the date, the
external tool it was scored against and the agreement it reached, the way the
threshold comment does today.

### 3.5 Confidence and reason

For each group, two numbers said in words:

- `tightness`: mean similarity between members (1.0 for a singleton).
- `nearest`: the highest similarity between any member and any non-member,
  and which group that non-member sits in.

| nearest | words |
|---|---|
| under `cut / 2` | "clear", or "stands alone" for a singleton |
| `cut / 2` to `cut` | "close call with [page]", or "close to [page]" |

`reason` is one sentence from the shared businesses that drove the group,
heaviest contribution first: "Five businesses rank for all three, led by
mariahannifinmakeup.com and yuliawilcox.com." A singleton's reason names what
it does not share: "No business that ranks here ranks for anything else in
the study."

### 3.6 Owner edits

Unchanged model: a page with `auto: false` is kept and its keywords are
removed from the matrix before clustering. The `page` op now also takes
`keywords`, a comma-separated list, so moving a keyword, merging two pages
and splitting one are all "save this page with these keywords". A keyword
released from an edited page is reclustered on save. `reset` returns a page
to automatic as today.

`pageList(round)` = kept edited pages + `cluster()` over the rest, each row
`{ id, title, kind, keywords, confidence, reason, standing, note, auto }`.
`title` is the member keyword with the most volume, else the member whose
mean similarity to the others is highest, else the first.

### 3.7 What remains of the pair

`comparePair(a, b)` survives for the compare page and returns the similarity,
the shared businesses each with its contribution (`weight · min · credit`)
heaviest first, the shared directories, and the exact-URL and same-business
counts the two columns highlight. `describePair` says the same in a sentence.
There is no ladder, no `signal`, no `read`, no `action`.

## 4. Page kinds

Four the tool assigns: **Homepage**, **Service page**, **Location page**,
**Article**. **Other** is available to the owner only. The result
classifications (Directory, Portfolio/Gallery, About page, Blog/FAQ) stay on
results and never become a page kind. `kind` is decided per group after
clustering, first match wins:

1. **Location page** when any member keyword contains an area from the
   round's `areas`, except the home area. The home area is any area whose
   name appears in more than half the captured keywords: "Utah" does not turn
   the study into location pages; "Park City" and "Moab" do. Matching is
   case-insensitive on whole words.
2. **Article** when any member keyword matches a question or comparison
   pattern — a whole word among `vs`, `versus`, `or`, `how`, `what`, `why`,
   `when`, `should`, `cost`, `price`, `prices`, `tips`, `ideas`, or ends in
   `?` — or when at least half the group's non-directory results are
   Blog/FAQ.
3. **Homepage** for exactly one group: the one with the most total volume,
   or the largest group when no volume is loaded, or the first when tied.
4. **Service page** otherwise.

The owner's kind on an edited page is kept. When `areas` is empty and
keywords exist, the glance says so, because rule 1 is silently off.

## 5. Volume

### 5.1 Import

Op `volume` takes an uploaded CSV. Accepted shapes:

- Keyword Planner: a `Keyword` column and either `Avg. monthly searches` or
  both `Min search volume` and `Max search volume`, so accounts with and
  without Ads spend both work. Planner exports begin with two header lines
  above the column row and may be UTF-16; both are handled.
- Plain: two columns, keyword and a number, for any other source.

Rows match keywords on `normalizeQuery`. The op stores
`volume: { min, max, source: 'planner' | 'csv', at }` on each matched keyword
(`min === max` for a single number), and re-renders with two lists: rows in
the file that matched no keyword, and keywords the file did not mention.
Nothing is dropped silently. A second import replaces volumes for the
keywords it names and leaves the others.

### 5.2 Standing

Volume never changes grouping. It decides `standing`:

- `FLOOR = 10` searches a month. A page whose members' summed `max` is under
  the floor has `standing: 'low'`; everything else `'page'`.
- A keyword with no volume counts as unknown, and a page with any unknown
  member is `'page'`. Unknown is never zero.
- A `low` page leaves the page list and the site structure. The tab lists it
  under "Not worth a page" with its volume and its nearest page; the report
  lists it in one sentence. "Give it a page" pins it as an edited singleton,
  which is `'page'` by virtue of being edited.

## 6. The Research tab

Order: round line and glance, Capture, Keywords, Study, Pages, Results,
Notes, Report. Gone: the Pairs section, the pair queue, "show every pair",
the revisit notice.

**Glance.** Captured (as today); Pages ("12 pages, 2 close calls" or "None
yet"); Volume ("Loaded 2026-09-18", or "Not loaded", a warning once every
keyword is captured); Report (as today). One more line only when areas are
empty and keywords exist: "No service areas set, so location pages cannot be
spotted."

**Study.** An HTML table in the existing `table-scroll` wrapper, no script.
Keywords down the side and across the top in leaf order, column headers
written vertically (`writing-mode: vertical-rl`) so forty fit. Each cell is
one similarity in five shades of one office hue: none, faint, some, most,
and the diagonal blank. Cells whose two keywords sit on the same page get a
shared background, and a heavier border marks where a page ends, so blocks read
without a legend. Every cell links to the compare page for its pair. Under
the table: a legend line and "Dark blocks on the diagonal are pages. A dark
cell outside a block is a keyword that could go either way; open it to see
why."

**Pages.** One ledger row per page: a mark carrying the kind, the title, the
confidence words, the reason, the member keywords each with its volume range
when loaded, the page's total. The edit pop: title, kind (the four plus
Other), note, and a checkbox per keyword in the round; save posts `page` with
the checked ids. "Back to automatic" stays. Below the ledger, "Not worth a
page" as §5.2.

**Keywords.** As today, plus the volume range on each row once loaded, and a
Volume fold beside Service areas holding the upload form, the last import's
date, and its unmatched lists.

**Compare page.** Kept as the drill-down, form removed. The glance becomes:
similarity; shared businesses with each one's contribution, heaviest first;
shared directories; which page each keyword sits on, linked. The two columns
and the connector lines stay.

**Rounds page.** Drops the pairs ledger; shows the matrix and the frozen
pages (§8) with the same components.

## 7. The report

Page one, in order:

1. Title, client line, the standing intro paragraph, the owner's opening
   note.
2. Stats: searches studied, pages recommended, searches not worth a page (the
   third only when volume is loaded).
3. The study grid, a new `grid` kind in the PDF Writer: shaded squares in
   leaf order with page boundaries, keyword labels down the side only. Fits
   30 keywords on a portrait page; past that it moves to the appendix and
   page one says so in one line.
4. Your pages: each with kind, the searches it answers with their volume
   range, the reason in the tab's words, and the confidence only when it is a
   close call: "This one could also sit with Bridal Party Makeup; the
   businesses differ enough to keep it apart."
5. Where we used judgement: the owner-edited pages with their notes. Empty:
   "The businesses settled every page without a judgement call."
6. Not built for: one sentence listing the low-standing searches. Only when
   volume is loaded.
7. How we did it, the closing note, "You can stop here", then the appendices
   as today with `kind` in place of the old type line.

The method paragraph, replacing the directories paragraph:

> For each search we look at which businesses Google ranks and how high. A
> business that ranks for nearly every search in your field, a listing site
> or a big competitor, tells us little about any one search, so it counts
> for little. The businesses that show up for some searches and not others
> are what tell us two searches mean the same thing. When two searches are
> answered by mostly the same businesses, they are one question and one page
> answers both. When they are not, they need their own pages. Search volume
> tells us which pages are worth building at all.

## 8. Migration

**Documents.** Nothing is rewritten on disk. `reads` stays on every round as
stored. `keywords[].volume` is new and optional. Regenerated `pages[]` rows
carry `kind`, `confidence`, `reason` and `standing`; old rows without them
render with blanks until the next regeneration. The export carries it all.

**The open round.** Regenerated by the engine on every read through `touch()`
and `refresh()` as today. Its reads are ignored. On Makeup by Brinley this
loses nothing: the four Yes pairs sit in one group and the two No pairs are
apart under either engine. The `read` op is removed; a post naming it is
refused with a message, like a write to a closed round.

**Closed rounds.** Today the archive page and the report recompute the page
list at render, so an engine change would rewrite what an old report said.
That stops. Op `round` stamps the final `pageList` onto the round it closes,
and a closed round renders and reports from its stored `pages`. Its stored
reads show as "decisions recorded". Only the matrix is drawn fresh, from its
captures, with block boundaries taken from the stored pages. A closed round
whose stored pages predate this spec renders whatever it stored.

## 9. Validation on Makeup by Brinley

Three scripts under `scripts/`, run by hand from
`/office/api/export?type=research&format=json`, never from the office. Their
findings are written by hand into `docs/research-validation.md`, and the
`CUT` comment cites it.

**Page list.** `scripts/validate-clusters.mjs <export.json> <external.csv>`.
The external file is the same keywords clustered by an independent
SERP-overlap tool, two columns: keyword, cluster. Keyword Insights on its $1
seven-day trial first, since it clusters by the same method at scale;
Keyword Cupid or ContentGecko as free fallbacks. The script scores agreement
two ways — the share of keyword pairs both tools put together or apart, and
the adjusted Rand index, which corrects for chance — then sweeps `cut` from
0.05 to 0.60 in steps of 0.05 and prints both scores at each step. The cut
goes where agreement peaks; if the peak is flat, the middle of the plateau,
and the write-up says so.

**Captures.** `scripts/validate-captures.mjs <export.json>` with
`SERPAPI_KEY` in the environment. 22 searches from SerpApi's 250 free a
month, `location` Utah, `gl=us`, `hl=en`, desktop, ten results. Per keyword:
top-eight businesses shared with the capture out of eight, rank movement,
and the businesses each side has that the other lacks. The headline is the
median across the study; a keyword well below it is named. Low agreement
across the board points at the research profile or the location, not one
search, and the script says which.

**Volume.** The Keyword Planner CSV for the 22 keywords goes through the
real import. Its unmatched lists and the "Not worth a page" section it
produces are the finding.

The write-up also records what no script can: whether the owner, with the
new page list beside the one settled by hand on 2026-09-17, would build the
new one.

## 10. Files

| File | Change |
|---|---|
| `netlify/functions/lib/office/research.mjs` | `businessOf` platforms; `matrix`, `similarities`, `cluster`, `confidence`, `kindOf`, `standing`, `parseVolumeCsv`; `pageList` and `comparePair` reworked; ladder, `pairs`, `decisiveFor`, `group`, reads constants removed |
| `netlify/functions/lib/office/research.test.mjs` | reworked, §11 |
| `netlify/functions/lib/office/research-report.mjs` | grid, reasons, judgement, not-built-for, method paragraph |
| `netlify/functions/lib/office/research-report.test.mjs` | §11 |
| `netlify/functions/lib/office/pdf.mjs` | `grid` kind |
| `netlify/functions/lib/office/actions/research.mjs` | `volume` op; `page` with keywords; `read` refused; `round` freezes pages; `remove` drops volume |
| `netlify/functions/lib/office/actions/research.test.mjs` | §11 |
| `src/components/office/Research.astro` | new order, glance, Study, Pages, Volume fold |
| `src/components/office/StudyMatrix.astro` | new, shared by the tab and the rounds page |
| `src/pages/office/research/[slug]/compare.astro` | form removed, new glance |
| `src/pages/office/research/[slug]/rounds/[id].astro` | matrix and frozen pages |
| `src/styles/office.css` | matrix shades and borders |
| `scripts/validate-clusters.mjs`, `scripts/validate-captures.mjs` | new |
| `scripts/calibrate-pairs.mjs` | removed with the ladder |
| `docs/research-validation.md` | new, written by hand from the scripts |
| `netlify/functions/lib/office/fixtures/makeup-by-brinley.json` | the export as a fixture |
| `README.md` | the Search research section |

## 11. Testing

**`research.test.mjs`**

- businessOf: a Yelp, WeddingWire and The Knot profile resolve to the
  business; their list and category pages resolve to the platform; a Knot
  category slug with no trailing id is the platform.
- Matrix: DCG weights at ranks 1, 4 and 8; a business's cell is its best
  rank; rarity is zero for a business in every SERP and highest for one in a
  single SERP; a Directory column weighs zero however rare.
- Similarity: symmetric; 1.0 for identical lists; 0 for disjoint; half
  credit for the same business on different URLs; adding a shared directory
  to both lists changes nothing.
- Clustering: the closest two merge first; nothing merges below the cut; a
  chain A–B, B–C with A and C unlike does not join all three; leaf order
  keeps merged keywords adjacent; an edited page's keywords are absent from
  the pass; a released keyword is reclustered.
- Confidence and reason: the words at each boundary; the reason names the
  heaviest shared businesses first; a singleton's reason.
- Kinds: each rule; the home-area exception; exactly one Homepage; Directory
  and Tie / review never appear; the owner's kind on an edited page is kept.
- Volume: both Planner shapes and the plain shape parse; the two-line
  preamble and UTF-16 are handled; unmatched rows and keywords are both
  listed; unknown never counts as zero; the floor sets standing; a pinned
  keyword regains a page.
- Fixture: the Makeup by Brinley export, asserted on shape not exact output:
  the six head keywords share one page; the two Bridal Party keywords share
  one; "soft glam vs full glam" is an Article; no page kind is Directory.

**`research-report.test.mjs`**: the grid kind is emitted and moves to the
appendix past 30 keywords; the method paragraph is present and the
directories sentence is not; the judgement section lists an edited page's
note; the not-built-for line appears only when volume is loaded; a closed
round's report matches its stored pages after `CUT` is changed.

**`actions/research.test.mjs`**: `volume` stores ranges and reports both
unmatched lists; `page` with a keyword list moves a keyword and reclusters
the released one; `read` is refused; `remove` drops the keyword's volume;
`round` freezes the final page list on the round it closes.

`npm run gate` and `npm run check:office` pass.

## 12. Out of scope

A merge between a business's site and its platform profile; the
keyword-to-business network view (a second picture of the same matrix, for
later); scheduled recapture; any search or volume API in the office; a
round-over-round comparison in the report.
