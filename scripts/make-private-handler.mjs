// Writes the .reg files that register ks-private: on this machine, with the
// paths resolved here because a .reg cannot compute them. See
// scripts/private-search/README.md.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = join(dirname(fileURLToPath(import.meta.url)), 'private-search');

// The handler runs as a Windows process, so every path in the .reg must be a
// Windows path even though this script usually runs under WSL.
function windowsPath(path) {
  if (/^[a-zA-Z]:\\/.test(path)) return path;
  try {
    return execFileSync('wslpath', ['-w', path], { encoding: 'utf8' }).trim();
  } catch {
    const m = /^\/mnt\/([a-z])\/(.*)$/.exec(path);
    if (!m) throw new Error(`Cannot turn ${path} into a Windows path. Run this from WSL or Windows.`);
    return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`;
  }
}

const key = 'HKEY_CURRENT_USER\\Software\\Classes\\ks-private';
const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const script = windowsPath(join(here, 'ks-private.ps1'));
// Registry string values escape backslashes and quotes; the command is one
// such value, so every path inside it is doubled.
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const command = `"${powershell}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${script}" -Url "%1"`;

const install = `Windows Registry Editor Version 5.00

[${key}]
@="URL:Keepsite private search"
"URL Protocol"=""

[${key}\\shell\\open\\command]
@="${esc(command)}"
`;
const uninstall = `Windows Registry Editor Version 5.00

[-${key}]
`;

// regedit reads .reg as UTF-16LE.
const write = (name, text) => {
  const file = join(here, name);
  writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/\n/g, '\r\n'), 'utf16le')]));
  console.log(`wrote ${file}`);
};
write('ks-private.reg', install);
write('ks-private-uninstall.reg', uninstall);
console.log(`\nhandler: ${script}\nDouble-click ks-private.reg in Explorer, then tick the box in the office Capture fold.`);
