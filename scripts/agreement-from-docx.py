#!/usr/bin/env python3
"""Turn a Keepsite agreement .docx into the JSON block template the office renders.

Usage: python3 scripts/agreement-from-docx.py ../legal/presence-agreement.docx presence > src/data/office/agreements/presence.json

The docx stays the legal source (see README). This script is re-run whenever
the docx changes; nothing in the output is hand-edited. Blanks in Schedule 1,
the signature block and Exhibit D become {{placeholders}} by matching their
row labels, so a reworded paragraph never breaks the mapping.
"""
import json, re, sys
import docx

SCHEDULE_CLIENT = {
    'Legal business name': '{{legalName}}',
    'Entity type (LLC, sole proprietorship, corporation, other)': '{{entityType}}',
    'Business address': '{{address}}',
    'Signer name': '{{signerName}}',
    'Signer title': '{{signerTitle}}',
    'Email for notices': '{{email}}',
    'Phone': '{{phone}}',
}
SCHEDULE_TERMS = {
    'Build Fee (Section 2.1)': '{{buildFee}}',
    'Monthly Fee (Section 2.2)': '{{monthlyFee}} per month',
    'Deposit due on signing': '{{deposit}} ({{depositPercent}}%)',
    'Balance due on Launch Date': '{{balance}} ({{balancePercent}}%)',
    'Pages included in the build (Exhibit A)': '{{pages}} pages',
    'Discount applied (Section 2.8)': '{{discountApplied}}',
}
EXHIBIT_D_BUILD = {
    'Discount or promotion name': '{{discount.name}}',
    'Type': '{{discount.type}}',
    'Amount': '{{discount.amount}}',
    'Adjusted Build Fee': '{{discount.adjustedBuildFee}}',
}
EXHIBIT_D_MONTHLY = {
    'Type': '{{discount.monthlyType}}',
    'Amount': '{{discount.monthlyAmount}}',
    'Discounted Monthly Fee': '{{discount.discountedMonthlyFee}}',
    'Applies to': 'the first {{discount.months}} months of the subscription',
}
STYLE = {'Heading 1': 'h1', 'Heading 2': 'h2', 'Heading 3': 'h3'}


def table_rows(tb):
    rows = []
    for r in tb.rows:
        cells, prev = [], None
        for c in r.cells:
            if c._tc is prev:
                continue
            prev = c._tc
            cells.append(' / '.join(p.text.strip() for p in c.paragraphs if p.text.strip()))
        rows.append(cells)
    return rows


def map_rows(rows, mapping):
    for row in rows:
        if row and row[0] in mapping and len(row) > 1:
            row[1] = mapping[row[0]]
    return rows


def main(path, template_id):
    d = docx.Document(path)
    raw = []
    for child in d.element.body.iterchildren():
        tag = child.tag.split('}')[1]
        if tag == 'p':
            p = docx.text.paragraph.Paragraph(child, d)
            if p.text.strip():
                raw.append(('p', p.style.name if p.style else 'Normal', p.text.strip()))
        elif tag == 'tbl':
            raw.append(('t', None, table_rows(docx.table.Table(child, d))))

    blocks, defaults = [], {}
    section = None
    i = 0
    schedule_tables = 0
    exhibit_d_tables = 0
    while i < len(raw):
        kind, style, content = raw[i]
        if kind == 't':
            rows = content
            if section is None and schedule_tables == 0 and rows and rows[0][:2] == ['Field', 'Entry'] and len(rows[0]) == 2:
                rows = map_rows(rows, SCHEDULE_CLIENT); schedule_tables += 1
            elif section is None and schedule_tables == 1 and rows and rows[0][:3] == ['Field', 'Entry', 'If left blank']:
                for row in rows[1:]:
                    label, entry, blank = row[0], row[1], row[2] if len(row) > 2 else ''
                    if label.startswith('Build Fee'): defaults['buildFee'] = entry
                    if label.startswith('Monthly Fee'): defaults['monthlyFee'] = entry.replace(' per month', '')
                    if label.startswith('Pages'):
                        m = re.search(r'(\d+)', blank); defaults['pages'] = int(m.group(1)) if m else None
                rows = map_rows(rows, SCHEDULE_TERMS); schedule_tables += 1
            elif section == 'discount':
                rows = map_rows(rows, EXHIBIT_D_BUILD if exhibit_d_tables == 0 else EXHIBIT_D_MONTHLY); exhibit_d_tables += 1
            blocks.append({'type': 'table', 'rows': rows, **({'section': section} if section else {})})
            i += 1
            continue

        text = content
        if i == 0:
            blocks.append({'type': 'title', 'text': text}); i += 1; continue
        if i in (1, 2):
            blocks.append({'type': 'subtitle', 'text': text}); i += 1; continue
        if style == 'Heading 2' and text == 'Signatures':
            j = i + 1
            lines = []
            while j < len(raw) and not (raw[j][0] == 'p' and raw[j][1] == 'Heading 1'):
                lines.append(raw[j][2]); j += 1
            note = lines.pop() if lines and lines[-1].startswith("Client's business name") else ''
            intro = lines.pop(0) if lines and lines[0].startswith('Both Parties') else ''
            def party(label_prefix, party_id):
                idx = next(k for k, l in enumerate(lines) if l.startswith(label_prefix))
                out = {'party': party_id, 'label': lines[idx]}
                for l in lines[idx + 1:idx + 6]:
                    if l.startswith('Name:'): out['name'] = l[5:].strip()
                    if l.startswith('Title:'): out['title'] = l[6:].strip()
                    if l.startswith('Email:'): out['email'] = l[6:].strip()
                return out
            keepsite = party('EAGLE MOUNTAIN HOUSE', 'keepsite')
            client = party('CLIENT', 'client')
            client['name'] = '{{signerName}}'; client['title'] = '{{signerTitle}}'; client['email'] = '{{email}}'
            blocks.append({'type': 'h2', 'text': text})
            blocks.append({'type': 'signatures', 'intro': intro, 'parties': [keepsite, client], 'note': note})
            i = j
            continue
        if style == 'Heading 1' and text.startswith('EXHIBIT D'):
            section = 'discount'
        if section == 'discount' and text.startswith('☐'):
            # The five condition checkboxes become one line the admin fills.
            if not blocks or blocks[-1].get('text') != '{{discount.conditions}}':
                blocks.append({'type': 'p', 'text': '{{discount.conditions}}', 'section': section})
            i += 1; continue
        block = {'type': STYLE.get(style, 'p'), 'text': text}
        if section: block['section'] = section
        blocks.append(block)
        i += 1

    out = {'id': template_id, 'name': raw[1][2], 'version': '2026-09-04', 'defaults': defaults, 'blocks': blocks}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
