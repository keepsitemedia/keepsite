# Search research in the office

**Status:** approved in chat 2026-09-13
**Branch:** `office-additions`
**Replaces:** the hand process in `docs/Keepsite_SERP_Overlap_Tracker_FINAL.xlsx`, whose rules this keeps verbatim.

## 1. What it is for

Growth, Agile and Range include search research before Stage 2. The question the research answers is which searches belong on the same page and which need their own, so the layout stage builds the right page list. Today that is a spreadsheet: type two keywords, paste the top eight organic results for each, read the overlap counts, decide on the call. This puts the same process in the office, gathers the results with one click per keyword from the owner's own browser, does every count and read automatically, and prints a client-facing PDF that justifies the page list.

No search API. Google results are captured from the owner's incognito browser through a bookmarklet, so the office server makes no external calls. A captured snapshot has the same shape an API snapshot would, so a source can be added later without touching the analysis or the report.

## 2. Where it lives

- A **Research** tab on the client page, shown when the client's tier is Growth, Agile or Range, or when a study already exists.
- The pipeline seed's Demo stage gains the task `Run search research`, due 5, `tiers: ["Growth", "Agile", "Range"]`, `tab: "research"`, so advancing a client there puts it on Today. `tab` is a new optional task key, validated against the client page's tab ids; `nudge()` turns it into the row's action link, "Research", the way a payment task links to Payments.
- Two new server pages: `/office/research/capture/`, which the bookmarklet opens, and `/office/research/[slug]/report/`, which streams the current PDF.
- One new action, `research`, dispatched at `/office/api/research`.
- One new store type, `research`, one document per client at `research/{slug}.json`. The export action includes it.
- One new email template seeded in `src/data/office/templates.json`: id `research-report`, name "Search research report", sent by hand from the Emails tab.

## 3. The study document

```json
{
  "slug": "sapphire-stem",
  "createdAt": "2026-09-13T20:00:00.000Z",
  "updatedAt": "2026-09-13T20:41:00.000Z",
  "areas": ["Provo", "Orem", "Utah County"],
  "keywords": [
    { "id": "k1", "text": "wedding florist provo", "cluster": "Wedding flowers", "arm": "", "source": "questionnaire" }
  ],
  "serps": {
    "k1": {
      "capturedAt": "2026-09-13T20:10:00.000Z",
      "query": "wedding florist provo",
      "results": [
        { "rank": 1, "url": "https://www.example.com/weddings/", "title": "Wedding Flowers | Example", "domain": "example.com", "pageType": "Service page", "typeSource": "auto" }
      ],
      "related": ["wedding florist orem", "cheap wedding flowers utah"]
    }
  },
  "reads": {
    "k1|k2": { "human": "Gray zone / discuss", "sameCluster": "Undecided", "notes": "" }
  },
  "pages": [
    { "id": "p1", "title": "Wedding flowers", "type": "Service page", "keywords": ["k1", "k2"], "note": "", "auto": true }
  ],
  "reportedAt": null
}
```

- `areas` seeds from the build questionnaire's `serviceArea` and `targetAreas` and is editable; location-page classification uses it.
- `keywords[].source` is `questionnaire`, `related` or `manual`. `cluster` is the owner's grouping, free text. `arm` is free text for Range and blank otherwise.
- `serps` is keyed by keyword id. Recapturing replaces the entry. Up to 8 results; fewer is allowed, and the analysis works on what is there.
- `reads` is keyed by the two keyword ids sorted and joined with `|`. `human` is one of `Same intent`, `Probably same`, `Gray zone / discuss`, `Probably different`, `Different intent`; `sameCluster` is `Yes`, `No` or `Undecided`.
- `pages` is the recommended page list. `auto: true` rows are regenerated whenever a snapshot or a read changes; a row the owner has edited flips to `auto: false` and is left alone. Keywords not in any edited row are regrouped.

## 4. Keywords

**Draft from questionnaire.** A button on an empty study. From the build questionnaire's answers: `searchTerms`, `findabilityWishes` and `ownPageCandidates` split on newlines, commas and semicolons into keywords; `services` split the same way become clusters, and a keyword joins the cluster whose name shares a word with it, else the cluster "General"; `serviceArea` and `targetAreas` become `areas`. Nothing is fetched. With no build questionnaire on file the button says so and the owner types keywords by hand.

**Editing.** One form per keyword row: text, cluster, arm (Range only), remove. An add row at the bottom. Cluster names are edited by renaming any keyword's cluster; the tab groups rows by cluster.

**Related searches.** Every snapshot's `related` list shows under its keyword with an Add button per suggestion; adding creates a keyword with `source: related` in the same cluster. Suggestions already in the list are hidden.

## 5. Capture

**Bookmarklet.** The tab prints a link the owner drags to the bookmarks bar. Its address is `javascript:` followed by the extractor, generated server-side by `bookmarklet(origin)` with the site origin baked in. The extractor has two halves. The DOM walk, a few lines that only the browser can run, gathers candidates: for every `h3` in document order, the closest ancestor `a[href]`, with its `href`, the `h3` text, whether it sits inside an element matching `#tads, #bottomads, [data-text-ad], [aria-label="Ads"], .related-question-pair, [data-attrid], #rhs`, and an id for its result container (the closest `[data-hveid]`, else the link's grandparent). It also gathers the text of every link under `#botstuff` whose `href` contains `/search?`, and the page's `q` parameter. The second half, `pickResults({ q, candidates, related })`, is a pure function shared with the server module and tested there: it drops candidates whose host ends in `google.com` or that are flagged as ads, drops a second candidate from a container that already contributed one (sitelinks), dedupes by URL, keeps the first 8 with `rank`, `url`, `title`, and dedupes related searches to at most 10. The bookmarklet then opens `{origin}/office/research/capture/#` followed by the URL-encoded JSON `{ q, results, related, at }` in a new tab.

If the page yields no results, it alerts "No results found on this page" instead of opening anything.

**Capture page.** Server-rendered behind the office guard. An inline script reads the hash, fills a hidden `payload` field and shows the query and the results found. The form posts to the action with `op: capture`. The action:

- Parses and validates the payload (query non-empty; results each with an `http` URL and a title, at most 8; related at most 10 strings).
- Finds every client whose study has a keyword whose text equals the query, case-insensitive, whitespace-collapsed. Exactly one: saves the snapshot under that keyword and redirects to that client's Research tab with `captured=<keywordId>`. None or several: re-renders the capture page with a select of client and keyword, the payload preserved, and the owner picks.
- Saving runs classification on each result and stores `pageType` with `typeSource: auto`, then regenerates the auto page rows.

**Progress.** The tab shows "12 of 40 captured", the next uncaptured keyword first with a Search link (`https://www.google.com/search?q=<query>`) and a copy-to-clipboard button, and a Search and Recapture link on every other row.

## 6. Analysis

All of it lives in `netlify/functions/lib/office/research.mjs`, pure functions over the study document, tested.

**normalizeUrl(url):** lowercase host, strip `www.`, strip the fragment, strip `utm_*`, `gclid` and `fbclid` parameters, strip a trailing slash. Two results are the same URL when their normalized forms match.

**domainOf(url):** the host without `www.`. Two results are the same business when their domains match.

**classify(result, areas):** the first rule that matches, in this order:

| Type | Rule |
|---|---|
| Directory | domain is, or ends with, one of: yelp.com, angi.com, angieslist.com, thumbtack.com, yellowpages.com, bbb.org, facebook.com, instagram.com, nextdoor.com, houzz.com, weddingwire.com, theknot.com, tripadvisor.com, mapquest.com, google.com, reddit.com, quora.com, wikipedia.org, linkedin.com, pinterest.com, zola.com, bark.com, homeadvisor.com, expertise.com, threebestrated.com |
| Homepage | path is empty or `/` (after dropping `index.html`) |
| Location page | path or title contains one of `areas`, case-insensitive, or the path contains `/locations/`, `/service-area`, `/areas-we-serve` |
| Blog/FAQ | path contains `/blog`, `/faq`, `/news`, `/article`, `/post`, `/guide`, `/resources`, `/tips`, or a `/20dd/` year segment, or the title starts with How, What, Why, When, Which, or contains `?` |
| Portfolio/Gallery | path contains `/gallery`, `/portfolio`, `/projects`, `/our-work`, `/photos`, `/case-stud` |
| About page | path contains `/about`, `/team`, `/our-story`, `/staff`, `/meet-` |
| Service page | anything else |

`Other` is never assigned automatically; it stays available for the owner's override.

**comparePair(serpA, serpB):** returns

- `exactUrl`: results in A whose normalized URL appears in B.
- `sameDomain`: results in A whose domain appears in B.
- `sameDomainDifferentPage`: `max(0, sameDomain - exactUrl)`.
- `samePageType`: results in A whose page type appears among B's page types (the spreadsheet's COUNTIF semantics: one per A row).
- `read`: `exactUrl >= 7` gives "Strong overlap: very likely the same search intent."; `>= 3` gives "GRAY ZONE: 3–6 shared URLs. Review page types, domains, and client priorities."; else `sameDomain >= 4` gives "Low exact overlap, but many of the same businesses rank with different pages."; else "Low overlap: likely a meaningfully different intent."
- `action`: the same branches give "Keep these keywords in the same cluster/page.", "Discuss on the client call before deciding whether to split.", "Inspect which pages each business uses before splitting.", "Consider separate clusters/pages if page types also differ."
- `signal`: `strong`, `gray` or `low` on the same thresholds.
- `primaryPage`: the page type with the highest count across both result lists; "Tie / review" when two or more tie for the top; empty when both lists are empty.

**pairs(study):** every unordered pair of keywords that both have a snapshot, each with `comparePair` and the stored read.

**group(study):** union-find over keywords with snapshots. An edge joins two keywords when the pair is `strong`, or when its read has `sameCluster: Yes`. A pair with `sameCluster: No` never joins, even if strong. Keywords without a snapshot form no group. Each component becomes a page row: `title` is the keyword text with the most exact-URL overlap with the others in the group (the first keyword on a tie), `type` is `primaryPage` over all the group's results, `keywords` is the component. Rows are ordered by size, then by first keyword.

**pageList(study):** merges `group(study)` into `study.pages`: rows with `auto: false` are kept as they are; every keyword not in one of those rows is regrouped and the resulting rows replace the old `auto: true` rows.

## 7. The Research tab

Sections, top to bottom:

1. **Capture.** The bookmarklet link with its one-line instruction, the progress line, the next keyword with Search and Copy.
2. **Keywords.** Grouped by cluster; each row has the edit form, its capture state (date or "not captured"), and its related-search suggestions when captured. The add row, the areas field, and the Draft from questionnaire button when the list is empty.
3. **Gray zone.** Every `gray` pair as a row: the two keywords, the counts, the auto read, and the Human read and Same cluster selects with a notes field, one form per row. Strong and low pairs are counted in a line above ("18 pairs agree, 4 to discuss, 30 clearly different") with a link that expands the full pair table.
4. **Pages.** The recommended page list: title, type (select), keywords in the group, note, Save. A row edited here becomes `auto: false`; a Reset button on it returns it to auto.
5. **Results.** Each captured keyword's eight results with rank, title, domain, and a page-type select per result for overrides. A pair link on any two keywords opens the side-by-side that the Quick Compare sheet showed.
6. **Report.** The Report button, the date of the last report if any, and links to the PDF and to the Emails tab.

Everything is forms and full-page posts, like the rest of the office. The one script is the capture page's hash reader.

## 8. The report

`renderResearchReport({ client, study, renderedAt })` in `research-report.mjs` uses the writer in `pdf.mjs`, which is exported for it. Times New Roman body, Helvetica bold headings, the same page furniture as the agreements. Sections:

1. **Cover.** "Search research" over the client's business name, the date, the tier, and one paragraph: what the research is for.
2. **What we did.** Plain English: how many searches, drawn from their questionnaire; each searched under the same conditions; the top eight results compared for every pair; searches that Google answers with the same pages grouped onto one page; the rest given their own.
3. **The pages we recommend.** One entry per page row: title, page type, the searches it targets, and two sentences of evidence generated from the numbers: how many of the searches share results, and which businesses appear most across the group.
4. **Decisions from our call.** Every gray pair with a read other than Undecided: the two searches, the shared-result count, the read, and the note.
5. **What we saw.** Per page row, the domains that appear most across its searches, with counts, so the client sees who they are up against.
6. **Appendix.** Every search with its capture date and its results: rank, title, domain, page type.

The Report button writes `search-research-YYYY-MM-DD.pdf` into the client's Documents with `source: research`, replacing a same-day file, and sets `reportedAt`. Documents with `source: research` are removable. `/office/research/[slug]/report/` renders the current study on the fly for a preview without saving.

**Attachment.** The send screen shows an "Attach the latest research report (date)" checkbox when the client has a `source: research` document. When checked, the send action loads the newest one and passes it to `sendMail` as a Resend attachment (`filename`, base64 `content`). The seeded `research-report` template body introduces the attached report; its subject is "Your search research, and the pages it points to".

## 9. Files

| File | Role |
|---|---|
| `netlify/functions/lib/office/research.mjs` | normalizeUrl, domainOf, classify, comparePair, pairs, group, pageList, draftFromQuestionnaire, validateCapture, findCaptureTargets, pickResults, bookmarklet(origin) |
| `netlify/functions/lib/office/research.test.mjs` | rules against workbook cases |
| `netlify/functions/lib/office/research-report.mjs` | renderResearchReport |
| `netlify/functions/lib/office/research-report.test.mjs` | renders a PDF with the expected text |
| `netlify/functions/lib/office/actions/research.mjs` | ops: draft, keyword (add, edit, remove), area, capture, read, page (save, reset), type (override), report |
| `netlify/functions/lib/office/actions/research.test.mjs` | capture matching, draft, report write |
| `netlify/functions/lib/office/store.mjs` | `research` type, added to TYPES and the export |
| `netlify/functions/lib/office/pdf.mjs` | export the writer and its fonts |
| `netlify/functions/lib/office/actions/send.mjs` | the attach option |
| `netlify/functions/lib/office/actions.mjs` | register `research` |
| `src/pages/office/clients/[slug].astro` | the Research tab |
| `src/components/office/Research.astro` | the tab's markup |
| `src/pages/office/research/capture.astro` | the capture page |
| `src/pages/office/research/[slug]/report.ts` | the PDF preview route |
| `src/pages/office/send/[slug]/[template].astro` | the attach checkbox |
| `netlify/functions/lib/office/pipeline.mjs`, `attention.mjs` | the optional task `tab` key and its nudge link |
| `src/data/office/pipelines.json` | the Demo-stage task |
| `src/data/office/templates.json` | the `research-report` template |
| `scripts/check-office.mjs` | already validates both seeds |
| `README.md` | a "Search research" section under the office |

## 10. Testing

- `research.test.mjs`: normalizeUrl and domainOf cases; every classify rule; comparePair against three hand-built pairs reproducing the workbook's strong, gray and low branches, including the `sameDomain >= 4` branch and the primary-page tie; group with a strong edge, a `No` override on a strong pair, and a `Yes` on a gray pair; pageList keeping an edited row; draftFromQuestionnaire on a sample envelope.
- `research.test.mjs` also covers `pickResults` with a candidate list shaped like a real results page: an ad, a People Also Ask entry, a Google-hosted link, a sitelink under an earlier result, a duplicate URL and ten organic results, and asserts the eight organic results come back in order. `bookmarklet(origin)` is asserted to start with `javascript:` and to contain the origin and the same `pickResults` source, so the browser half and the tested half cannot drift.
- Action tests: capture with one match saves and redirects; with two matches re-renders with the picker; report writes a document and sets `reportedAt`.
- `npm run check:office` keeps validating the two seeds; the new template and task are covered by it.
- `npm run gate` passes.

## 11. Out of scope

Scheduled re-capture for monthly search monitoring, keyword volumes, and any external search API. The data model leaves room for all three.
