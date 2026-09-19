# Research-profile search

Captures have to be made signed in: signed out, Google replaces every result
link with `/goto?url=<opaque blob>` and the bookmarklet has no address to
record. But signed in as yourself, your own search history colours the very
results the study measures — and you search these keywords and click these
competitors more than anyone.

The way out is a **research profile**: a separate browser profile, signed into
a Google account with Web & App Activity paused and Personal results off, used
for searching and capturing and nothing else. Real URLs, near-neutral results.

**Never browse in it.** Clicking through to a result rebuilds exactly the
history the paused account exists to avoid. Search, capture, close.

A web page cannot choose which profile opens a link, so the Research tab links
to `ks-research:<url>` and this handler opens the profile.

## Set up the profile

**Firefox** — open `about:profiles`, Create a New Profile, name it `research`,
launch it, sign into the research Google account, then at
<https://myactivity.google.com/activity-controls> turn off Web & App Activity
and, in Search settings, turn off Personal results.

**Chrome** — add a new person, sign in, same two settings. Then check
`chrome://version` for its Profile Path; the last folder name (`Profile 2`,
`Profile 3`, …) is what the handler needs.

If your profile is not named `research` (Firefox) or `Profile 2` (Chrome), edit
`$FirefoxProfile` / `$ChromeProfile` at the top of `ks-research.ps1`.

## Install the handler

```sh
npm run handler          # writes ks-research.reg with this machine's paths
```

Double-click `scripts/research-search/ks-research.reg` in Explorer and accept
the prompt — it writes under `HKEY_CURRENT_USER`, so no admin rights. Then tick
**Open searches in the research profile** in any client's Capture fold.

## Uninstall

Double-click `ks-research-uninstall.reg`, and untick the box in the office.

## What it opens

`ks-research.ps1` refuses anything that is not exactly
`https://www.google.com/search?q=…`, optionally followed by `&uule=…`, the
parameter that tells Google which place to search from. The URL reaches a
browser command line, so a wider rule would let a stray link pass browser flags
or a local path. That rule is `isSearchUrl` in
`netlify/functions/lib/office/research.mjs`; the two must keep saying the same
thing.

To check it without touching the registry:

```sh
powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File 'C:\path\to\scripts\research-search\ks-research.ps1' \
  -NoBox -Url 'ks-research:https://www.google.com/search?q=wedding%20florist'
```

## Other machines

Windows only. On macOS, make the profile the same way and search in it by
hand — leave the office checkbox unticked there, and the links stay ordinary
Google links that open in whatever profile is frontmost.
