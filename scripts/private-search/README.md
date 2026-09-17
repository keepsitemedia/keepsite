# Private-window search

The office Research tab wants each keyword searched in a private window, so
the results are not shaped by a signed-in account. No web page can open one:
every browser withholds that from script deliberately. So the Research tab
links to `ks-private:https://www.google.com/search?q=…` and this handler,
registered once per machine, opens the window.

## Install

```sh
npm run handler          # writes ks-private.reg with this machine's paths
```

Then double-click `scripts/private-search/ks-private.reg` in Explorer and
accept the prompt. It writes under `HKEY_CURRENT_USER`, so it needs no admin
rights. Finally, tick **Open searches in a private window** in the Capture
fold of any client's Research tab.

Firefox and Chrome both ask, the first time, whether to let the site open the
handler; tick their "remember" box.

## Uninstall

Double-click `ks-private-uninstall.reg`, and untick the box in the office.

## What it opens

`ks-private.ps1` refuses anything that is not exactly
`https://www.google.com/search?q=…` — the URL reaches a browser command line,
so a wider rule would let a stray link pass browser flags or a local path.
That rule is `isSearchUrl` in `netlify/functions/lib/office/research.mjs`;
the two must keep saying the same thing.

It opens Firefox if it is installed, otherwise Chrome. To check it without
touching the registry:

```sh
powershell.exe -NoProfile -ExecutionPolicy Bypass \
  -File 'C:\path\to\scripts\private-search\ks-private.ps1' \
  -NoBox -Url 'ks-private:https://www.google.com/search?q=wedding%20florist'
```

## Other machines

Windows only. macOS would need a URL-scheme app bundle instead, and Safari has
no private-window command line at all, so leave the box unticked there: the
links stay ordinary Google links and open a normal tab.
