// Agreements as PDF, drawn from the same blocks the signing page shows. The
// standard fonts need no font file and no browser, which is what a Netlify
// function can afford; the trade is WinAnsi text only, hence toPdfText.
import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TZ } from './dates.mjs';

const PAGE = { width: 612, height: 792 };
const MARGIN = 72;
const CONTENT = PAGE.width - 2 * MARGIN;
const SIZES = { title: 18, subtitle: 12, h1: 14, h2: 13, h3: 11.5, p: 11, table: 9.5, small: 8.5 };
const LEADING = 1.35;

const REPLACEMENTS = { '☐': '[ ]', '☑': '[x]', '☒': '[x]', '✓': 'x', ' ': ' ' };
const WINANSI = /^[\x20-\x7e\xa0-\xffŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]$/;

export function toPdfText(s) {
  return [...String(s ?? '')].map((c) => REPLACEMENTS[c] ?? (WINANSI.test(c) ? c : '?')).join('');
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];

export function signaturePng(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m) return null;
  const bytes = new Uint8Array(Buffer.from(m[1], 'base64'));
  // 45 bytes is the smallest a real PNG can be: signature + IHDR chunk (with
  // its 13-byte payload) + IEND chunk. Magic bytes alone let a corrupt body
  // through, and embedPng() throwing at seal time would wedge a completed
  // agreement, so check the IHDR and IEND chunk framing too.
  if (bytes.byteLength > 200_000 || bytes.byteLength < 45) return null;
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) return null;
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.readUInt32BE(8) !== 13) return null;
  if (view.toString('ascii', 12, 16) !== 'IHDR') return null;
  if (view.toString('ascii', bytes.byteLength - 8, bytes.byteLength - 4) !== 'IEND') return null;
  // A compressed 200 KB file can declare 7000x7000, and pdf-lib decodes the
  // whole bitmap — four times per seal, since the body and the certificate
  // render both signatures. The pad captures well under this.
  if (view.readUInt32BE(16) > 2000 || view.readUInt32BE(20) > 800) return null;
  return bytes;
}

function wrap(font, size, text, width) {
  const lines = [];
  for (const para of toPdfText(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

const fmtDate = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));

class Writer {
  constructor(doc, fonts) {
    this.doc = doc; this.fonts = fonts; this.page = null; this.y = 0; this.pageNo = 0;
  }
  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pageNo += 1;
    this.y = PAGE.height - MARGIN;
    this.page.drawText(toPdfText(`Page ${this.pageNo}`), { x: PAGE.width - MARGIN - 40, y: MARGIN / 2, size: SIZES.small, font: this.fonts.body, color: rgb(0.4, 0.4, 0.4) });
  }
  need(height) { if (!this.page || this.y - height < MARGIN) this.newPage(); }
  text(str, { font = this.fonts.body, size = SIZES.p, gapAfter = size * 0.6, x = MARGIN, width = CONTENT } = {}) {
    const lines = wrap(font, size, str, width);
    const lh = size * LEADING;
    for (const line of lines) {
      this.need(lh);
      this.page.drawText(line, { x, y: this.y - size, size, font });
      this.y -= lh;
    }
    this.y -= gapAfter;
  }
  table(rows) {
    if (!rows.length) return;
    const cols = Math.max(...rows.map((r) => r.length));
    const widths = cols === 2 ? [CONTENT * 0.38, CONTENT * 0.62] : cols === 3 ? [CONTENT * 0.34, CONTENT * 0.36, CONTENT * 0.30] : Array(cols).fill(CONTENT / cols);
    const size = SIZES.table; const lh = size * LEADING; const pad = 4;
    rows.forEach((row, ri) => {
      const font = ri === 0 ? this.fonts.bold : this.fonts.body;
      const cells = row.map((c, ci) => wrap(font, size, c, widths[ci] - 2 * pad));
      const height = Math.max(...cells.map((c) => c.length)) * lh + 2 * pad;
      this.need(height);
      let x = MARGIN;
      cells.forEach((lines, ci) => {
        this.page.drawRectangle({ x, y: this.y - height, width: widths[ci], height, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
        lines.forEach((line, li) => this.page.drawText(line, { x: x + pad, y: this.y - pad - size - li * lh, size, font }));
        x += widths[ci];
      });
      this.y -= height;
    });
    this.y -= SIZES.p;
  }
  async signatures(block, signatures = {}) {
    if (block.intro) this.text(block.intro);
    for (const party of block.parties) {
      const sig = signatures[party.party];
      this.need(150);
      this.text(party.label, { font: this.fonts.bold, gapAfter: 4 });
      if (sig?.png) {
        const img = await this.doc.embedPng(sig.png);
        // Cap at 1 so a small pad-captured signature is drawn at its own
        // size rather than blown up to fill the 180x60 box.
        const scale = Math.min(1, 180 / img.width, 60 / img.height);
        this.need(70);
        this.page.drawImage(img, { x: MARGIN + 70, y: this.y - 62, width: img.width * scale, height: img.height * scale });
        this.page.drawText(toPdfText('Signature:'), { x: MARGIN, y: this.y - 62, size: SIZES.p, font: this.fonts.body });
        this.y -= 70;
      } else {
        this.text('Signature: ______________________________________', { gapAfter: 2 });
      }
      this.text(`Name: ${party.name}`, { gapAfter: 2 });
      if (party.title) this.text(`Title: ${party.title}`, { gapAfter: 2 });
      if (party.email && party.party === 'keepsite') this.text(`Email: ${party.email}`, { gapAfter: 2 });
      this.text(`Date signed: ${sig?.signedAt ? fmtDate(sig.signedAt) : '______________________'}`, { gapAfter: SIZES.p });
    }
    if (block.note) this.text(block.note, { size: SIZES.small });
  }
  certificate(c) {
    this.newPage();
    this.text('Certificate of completion', { font: this.fonts.bold, size: SIZES.h1 });
    this.text(`Agreement ${c.agreementId} · template ${c.template} version ${c.version}`, { size: SIZES.small });
    this.text(`SHA-256 of the signed document, before this certificate was appended: ${c.hash}`, { size: SIZES.small });
    this.text('Signers', { font: this.fonts.bold, size: SIZES.h3 });
    for (const s of c.signers) {
      this.text(`${s.party}: ${s.name} <${s.email}> signed ${fmtDate(s.signedAt)} from ${s.ip ?? 'unknown IP'}`, { size: SIZES.small, gapAfter: 1 });
      if (s.userAgent) this.text(`  ${s.userAgent}`, { size: SIZES.small });
    }
    this.text('Audit trail', { font: this.fonts.bold, size: SIZES.h3 });
    for (const e of c.audit) {
      this.text(`${fmtDate(e.at)} · ${e.event} · ${e.party}${e.ip ? ` · ${e.ip}` : ''}${e.note ? ` · ${e.note}` : ''}`, { size: SIZES.small, gapAfter: 1 });
    }
    this.text('Both parties consented to do business electronically and to sign this agreement electronically. Times are Mountain.', { size: SIZES.small, gapAfter: 0 });
  }
}

export async function renderAgreement({ blocks, signatures = {}, certificate = null, renderedAt = new Date(0) }) {
  const doc = await PDFDocument.create();
  // The certificate prints the SHA-256 of this body render so it can be
  // re-verified later; pdf-lib defaults /CreationDate and /ModDate to the
  // wall clock, which would make identical inputs hash differently every run.
  doc.setCreationDate(renderedAt);
  doc.setModificationDate(renderedAt);
  const fonts = { body: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const w = new Writer(doc, fonts);
  w.newPage();
  for (const b of blocks) {
    if (b.type === 'title') w.text(b.text, { font: fonts.bold, size: SIZES.title, gapAfter: 6 });
    else if (b.type === 'subtitle') w.text(b.text, { size: SIZES.subtitle, gapAfter: 4 });
    else if (b.type === 'h1') { w.need(60); w.text(b.text, { font: fonts.bold, size: SIZES.h1, gapAfter: 8 }); }
    else if (b.type === 'h2') { w.need(48); w.text(b.text, { font: fonts.bold, size: SIZES.h2, gapAfter: 6 }); }
    else if (b.type === 'h3') { w.need(40); w.text(b.text, { font: fonts.bold, size: SIZES.h3, gapAfter: 4 }); }
    else if (b.type === 'p') w.text(b.text);
    else if (b.type === 'table') w.table(b.rows);
    else if (b.type === 'signatures') await w.signatures(b, signatures);
    else w.text(b.text ?? JSON.stringify(b)); // unknown block kind: print rather than throw.
  }
  if (certificate) w.certificate(certificate);
  // Object streams would compress the page dictionaries; the tests count
  // pages and images in the raw bytes, and uncompressed structure costs
  // little on a document this size.
  return doc.save({ useObjectStreams: false });
}
