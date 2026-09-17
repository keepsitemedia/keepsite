<#
  Opens one Google search in the research browser profile.

  Signed out, Google hides result URLs, so captures must be made signed in —
  but signed in as you, your own search history colours the results. The
  research profile is the way out: a separate profile signed into an account
  with Web & App Activity paused, used for searching and nothing else. A web
  page cannot choose which profile opens a link, so the Research tab links to
  ks-research:<url> and this handler does it. Install with `npm run handler`.

  Never browse in the research profile. Clicking results there rebuilds the
  history the paused account exists to avoid.
#>
param(
  [Parameter(Mandatory = $true)][string] $Url,
  # The registry launches this with no console, so a refusal has to be a
  # dialog to be seen at all. -NoBox is for checking it from a terminal.
  [switch] $NoBox
)

function Stop-With($message) {
  [Console]::Error.WriteLine($message)
  if (-not $NoBox) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($message, 'Keepsite research search') | Out-Null
  }
  exit 1
}

# Mirrors isSearchUrl in netlify/functions/lib/office/research.mjs. This string
# reaches a browser command line, so anything but a Google search is refused:
# a wider rule would let a stray ks-private: link pass flags or a local path.
$prefix = 'https://www.google.com/search?q='

$target = $Url -replace '^ks-research:', ''
# Some browsers hand the scheme's payload back percent-encoded whole.
if ($target.StartsWith('https%3A', [System.StringComparison]::OrdinalIgnoreCase)) {
  $target = [uri]::UnescapeDataString($target)
}
if (-not $target.StartsWith($prefix, [System.StringComparison]::Ordinal)) {
  Stop-With "Refused: a ks-research link may only open $prefix`n`nIt asked for:`n$target"
}

# The profile to open. Firefox takes a profile name (about:profiles), Chrome
# takes a directory name under its User Data folder (chrome://version).
$FirefoxProfile = 'research'
$ChromeProfile = 'Profile 2'

# Firefox first, then Chrome; the first one installed wins.
$browsers = @(
  @{ Path = "$env:ProgramFiles\Mozilla Firefox\firefox.exe";                   Flag = @('-P', $FirefoxProfile) },
  @{ Path = "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe";            Flag = @('-P', $FirefoxProfile) },
  @{ Path = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe";          Flag = @("--profile-directory=$ChromeProfile") },
  @{ Path = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe";   Flag = @("--profile-directory=$ChromeProfile") },
  @{ Path = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe";          Flag = @("--profile-directory=$ChromeProfile") }
)
$browser = $browsers | Where-Object { Test-Path -LiteralPath $_.Path } | Select-Object -First 1
if (-not $browser) { Stop-With 'Neither Firefox nor Chrome was found in the usual places.' }

Start-Process -FilePath $browser.Path -ArgumentList ($browser.Flag + $target)
