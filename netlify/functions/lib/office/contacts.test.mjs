import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_TYPES, TYPE_LABELS, validateContact, newContact, applyContactEdit, addNote, contactFields, lastNoteAt } from './contacts.mjs';
import { ID } from './ids.mjs';

const NOW = new Date('2026-09-12T16:00:00Z');
const LATER = new Date('2026-09-13T16:00:00Z');
const good = { business: 'Peak Print Co', owner: 'Dana', email: 'dana@example.com', phone: '', website: 'https://peakprint.example', type: 'vendor' };

test('validateContact requires a business, a plausible email when given, and a known type', () => {
  assert.deepEqual(CONTACT_TYPES, ['partner', 'referral', 'vendor', 'other']);
  assert.deepEqual(Object.keys(TYPE_LABELS), CONTACT_TYPES);
  assert.deepEqual(validateContact(good), []);
  assert.match(validateContact({ ...good, business: '' }).join(), /business/);
  assert.match(validateContact({ ...good, email: 'nope' }).join(), /email/);
  assert.deepEqual(validateContact({ ...good, email: '' }), []);
  assert.match(validateContact({ ...good, type: 'friend' }).join(), /type/);
});

test('newContact fills every field and starts with no notes', () => {
  const c = newContact(good, NOW);
  assert.match(c.id, ID);
  assert.equal(c.business, 'Peak Print Co');
  assert.equal(c.phone, '');
  assert.deepEqual(c.notes, []);
  assert.equal(c.clientSlug, null);
  assert.equal(c.createdAt, NOW.toISOString());
  assert.equal(c.updatedAt, NOW.toISOString());
  assert.equal(lastNoteAt(c), null);
});

test('applyContactEdit replaces the fields and keeps the log and link', () => {
  const c = { ...newContact(good, NOW), clientSlug: 'peak', notes: [{ at: NOW.toISOString(), text: 'met' }] };
  const e = applyContactEdit(c, { ...good, owner: 'Dana K', type: 'partner' }, LATER);
  assert.equal(e.owner, 'Dana K');
  assert.equal(e.type, 'partner');
  assert.equal(e.clientSlug, 'peak');
  assert.equal(e.notes.length, 1);
  assert.equal(e.updatedAt, LATER.toISOString());
});

test('addNote prepends, and refuses an empty note', () => {
  let c = newContact(good, NOW);
  c = addNote(c, 'Coffee, agreed to swap referrals', NOW);
  c = addNote(c, 'Sent them two leads', LATER);
  assert.deepEqual(c.notes.map((n) => n.text), ['Sent them two leads', 'Coffee, agreed to swap referrals']);
  assert.equal(lastNoteAt(c), LATER.toISOString());
  assert.equal(c.updatedAt, LATER.toISOString());
  assert.throws(() => addNote(c, '   ', LATER), /note/);
});

test('contactFields trims and picks only the six fields', () => {
  const d = new FormData();
  d.append('business', '  Peak ');
  d.append('type', 'vendor');
  d.append('csrf', 'x');
  assert.deepEqual(contactFields(d), { business: 'Peak', owner: '', email: '', phone: '', website: '', type: 'vendor' });
});
