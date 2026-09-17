<#
  Opens one Google search in a private window for the office research tool.

  A web page cannot open a private window in any browser, so the Research tab
  links to ks-private:<url> and this handler, registered on the machine, does
  it. Install with `npm run handler` and the .reg file it writes.
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
    [System.Windows.Forms.MessageBox]::Show($message, 'Keepsite private search') | Out-Null
  }
  exit 1
}

# Mirrors isSearchUrl in netlify/functions/lib/office/research.mjs. This string
# reaches a browser command line, so anything but a Google search is refused:
# a wider rule would let a stray ks-private: link pass flags or a local path.
$prefix = 'https://www.google.com/search?q='

$target = $Url -replace '^ks-private:', ''
# Some browsers hand the scheme's payload back percent-encoded whole.
if ($target.StartsWith('https%3A', [System.StringComparison]::OrdinalIgnoreCase)) {
  $target = [uri]::UnescapeDataString($target)
}
if (-not $target.StartsWith($prefix, [System.StringComparison]::Ordinal)) {
  Stop-With "Refused: a ks-private link may only open $prefix`n`nIt asked for:`n$target"
}

# Firefox first, then Chrome; the first one installed wins.
$browsers = @(
  @{ Path = "$env:ProgramFiles\Mozilla Firefox\firefox.exe";                   Flag = '-private-window' },
  @{ Path = "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe";            Flag = '-private-window' },
  @{ Path = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe";          Flag = '--incognito' },
  @{ Path = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe";   Flag = '--incognito' },
  @{ Path = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe";          Flag = '--incognito' }
)
$browser = $browsers | Where-Object { Test-Path -LiteralPath $_.Path } | Select-Object -First 1
if (-not $browser) { Stop-With 'Neither Firefox nor Chrome was found in the usual places.' }

Start-Process -FilePath $browser.Path -ArgumentList @($browser.Flag, $target)
