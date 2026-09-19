# How the search research works

The design that implements this is `superpowers/specs/2026-09-18-research-engine-design.md`;
`research-validation.md` is where the measured checks go once they have been
run. This page is the idea, for anyone who has to run a study, read one, or
explain one to a client.

**Status, 2026-09-19.** This describes the tool as built on the
`research-engine` branch after the first client critique. The Makeup by
Brynlie preview printed the evening of 2026-09-19, from searches recaptured
from Utah with volumes loaded, is the first report that matches it. The
morning preview of the same day predates steps 2, 8 and 9 and should not be
read beside this document.

The whole thing rests on one idea: Google already knows which searches mean
the same thing, and it shows you by returning the same businesses for them.
We read that back out of Google and turn it into a page list.

## What we are trying to achieve

A client's website needs one page for every distinct thing people search for
when they need what the client does, and no more than that. Too few pages
and searches go unanswered. Too many and the pages compete with each other
for the same search, none of them ranks well, and the client pays to build
and maintain pages nobody needed. The research exists to make that call
before we build, from evidence rather than instinct, and to hand the client
a plan they can trust without having to understand how it was made.

What comes out is a map of the topic space with a page for each region, not
a forecast of which pages will rank. That distinction is in the last section
and it matters.

## The logic

Two searches belong on one page when Google treats them as one question.
The test for that is not whether the words look alike; it is whether the
same businesses come up for both. If "utah bridal makeup artist" and "utah
wedding makeup artist" both bring up the same artists, Google considers them
the same intent, and a single page will rank for both. If they bring up
different businesses, Google sees two questions, and they need two pages.

Not every business that appears is evidence. WeddingWire, The Knot, Yelp and
Facebook rank for almost every search in a field, so their presence on two
searches says nothing about whether those searches are alike. The same goes,
more softly, for a big competitor that ranks for everything. So we weight
each business by how rarely it appears across the whole study: a business
that shows up for two searches out of twenty-two tells us a great deal when
it appears on both, and one that shows up everywhere tells us nothing.
Listing sites count for zero outright. Position matters too, so a business
at the top of both results pages counts more than one at the bottom.

## How we get there

1. **The list.** We start from the searches the client named in their
   questionnaire, add the ones we know their customers make, and later add
   what Google itself suggests alongside those searches. This step decides
   more than any other, and the report says where the list came from.

2. **The captures.** Each search is run once, from the place the client
   serves, in a browser profile with no history so the results are not
   shaped by our own searching. We keep the first eight real results,
   skipping ads and the map. The location matters: a search without a place
   name in it takes its location from wherever Google thinks you are, which
   is how the first study quietly returned Denver businesses for Utah
   searches. The tool anchors every search to the study's location and
   flags any results page that names no local business, which also marks
   the searches people make from everywhere, like "soft glam vs full glam".

3. **The matrix.** From the captures we build one table: every search down
   the side, every business that appeared across the top, and in each cell
   how high that business ranked for that search. That table is the whole
   study in one object, and it is a constraint on every future change:
   nothing downstream of the matrix may require going back to Google. That
   is what makes a study auditable, cheap to re-analyse, and safe to
   recompute the day a threshold changes.

4. **Similarity.** For any two searches, we ask what share of their weighted
   businesses they have in common. The answer is a number between nothing
   and identical. This is the number the grid shows.

5. **Grouping.** Searches are gathered into pages by starting with every
   search alone and repeatedly joining the two groups whose members are most
   alike on average, until the next join would be below a cut. Joining on
   the average rather than on any one strong pair stops a chain of
   near-misses from becoming one page. The cut was set by running one real
   study at many values and choosing the one that reproduced what an
   experienced owner grouped by hand. That is a fit to one person on one
   study, and it is labelled provisional in the code. The validation step
   checks it against an independent clustering tool, which can corroborate
   it, not confirm it: another tool has its own threshold fitted to its own
   data. The ground truth is what ranks after the pages are built, which
   nobody has collected yet.

6. **What kind of page.** Each group is typed by what most of its searches
   are: a search naming a town or venue wants a location page, a question or
   comparison wants an article, everything else a service page. Exactly one
   group becomes the homepage: the service group with the most search
   volume, or the largest when no volume is loaded. That is a default the
   owner can override, not a rule about what a homepage is. A page is never
   dropped for low volume when it is a location page or a pricing search,
   because someone searching a venue name or a price is close to booking
   whatever the count says.

7. **Volume.** Google's own search numbers say which searches people
   actually make. They are coarse: Google reports a bucket such as "10 to
   100 a month" and leaves out anything it cannot count at all, so a search
   with eleven a month and one with ninety-nine read the same. We use them
   for one decision only: a page whose searches nobody makes is set aside,
   not built. That is the tool's job to decide, not the client's, and the
   report prints the bucket, never a single number.

8. **Fewer pages by default.** When a group is a close call against another
   of the same kind, it folds in. It stays separate only for a compelling
   reason: it wants a different kind of page, or it draws enough searches to
   earn its own. Every fold and every keep is listed in the report as a call
   we made, with the reason.

9. **The owner's review.** The Research tab shows the page list with a
   confidence and a plain reason for each, the grid with pages as numbered
   bands, and the searches set aside. The confidence today is how far the
   nearest outsider fell short of the cut; it is not yet a measure of
   whether the grouping would survive a different day's results. The owner
   corrects by moving a search between pages, giving a set-aside search its
   page back, or merging. The tool never asks the client to decide anything.

10. **The report.** Page one is the recommendation: the pages we will build,
    what each answers, why, the calls we made, and what we left out, in the
    voice of someone taking the problem off the client's plate. Everything
    that shows the working sits behind a line that says they can stop
    reading.

## What it cannot tell us

**It cannot say how hard a search is to win.** It shows what Google returns
today, not whether the client can displace it. "Utah wedding makeup artist"
is a page she may never reach page one for, against listing sites and
domains with years of links; "la caille utah bridal makeup artist" is one
she could own in a month. The report presents both with the same confidence
in her ability to get them. A difficulty read would need data the tool does
not gather.

**It can only recommend what the incumbents already have.** Pages come from
what currently ranks. A genuinely underserved search, real demand with
nobody answering it well, shows up as low overlap and thin volume, which is
exactly the profile the method sets aside. An underserved search and a dead
one look the same under this measurement. That is the right trade for a
client who needs a competent baseline site, and it is a ceiling, not a gap
in the data: this method will not find a client an edge nobody else has.

**Overlap is inflated in a thin field.** Where a field has fifteen
businesses with working websites, almost any search returns a permutation
of the same fifteen names, not because Google reads the searches as one
question but because there is nobody else to show. The method has no term
for field size.

**Rarity rewards the volatile as well as the specific.** The businesses that
appear least get the most weight, and those are also the weakest rankings:
a site on two searches out of twenty-two may be a strong niche match or a
thin site that would be gone on a re-run. Position weighting narrows this;
it does not close it.

**One capture is one sample.** Eight results a search, three or four of them
listing sites that count for zero, leaves four or five informative slots
from a single day. Two pairs scoring just either side of the cut are not
distinguishable at that sample size. Repeating captures across a few days
and averaging would show how much of the grid is signal; the tool does not
do that yet.

**It cannot judge a search that was never on the list.** Seed selection
determines the output more than the clustering does.

**Its two numbers are provisional.** The cut and the volume floor stay
provisional until post-build ranking data exists to check them against.
Collecting that, per page, in the months after launch is the only thing
that retires the word.

## What comes next

In priority order, from the reviews of 2026-09-19: a report that matches
this document; a leave-one-out stability measure behind the displayed
confidence; repeat captures to measure variance; the merge ladder shown per
study so the cut is reviewable; a test of complete against average linkage
on the hand grouping; the map pack kept as metadata and a SERP profile per
search as intent evidence and a coarse difficulty read; the algorithm's own
row stored beside every owner override so disagreements can be studied;
secondary intents kept on a page; and a post-launch comparison of each
page's Search Console queries against the study.
