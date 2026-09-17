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

# Mirrors isSearchUrl in netlify/functions/lib/office/research.mjs — but this
# side must be stricter, because $target below reaches a browser command
# line: a whole-string match is the only thing that can't be defeated by
# appending a flag after the prefix. The two must change together.
$prefix = 'https://www.google.com/search?q='
$pattern = '^https://www\.google\.com/search\?q=[A-Za-z0-9%._~!$&''()*+,;=:@/-]*$'

$target = $Url -replace '^ks-research:', ''
# Some browsers hand the scheme's payload back percent-encoded whole.
if ($target.StartsWith('https%3A', [System.StringComparison]::OrdinalIgnoreCase)) {
  $target = [uri]::UnescapeDataString($target)
}
# Spelled out on its own, even though the pattern below already excludes
# whitespace: a command-line argument split is exactly how this class of bug
# hides, so the next reader should not have to prove it from the regex alone.
if ($target -match '\s') {
  Stop-With "Refused: a ks-research link may not contain whitespace`n`nIt asked for:`n$target"
}
if ($target -cnotmatch $pattern) {
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

# Windows PowerShell 5.1 joins -ArgumentList elements with a bare space and
# quotes none of them, so an element containing one (Chrome's
# "--profile-directory=Profile 2") would otherwise split into two arguments
# on the far side and the browser would open a different, empty profile.
# Quoting whatever needs it here keeps each element the one argument it is.
function Format-Argument([string] $value) {
  if ($value -match '[\s"]') { return '"' + ($value -replace '"', '\"') + '"' }
  return $value
}
$argumentLine = (($browser.Flag + $target) | ForEach-Object { Format-Argument $_ }) -join ' '

Start-Process -FilePath $browser.Path -ArgumentList $argumentLine
