// People the businesses have relationships with who are not clients. A
// contact carries no pipeline and no money, and sends no email; its point
// is the note log, so the owner can see when they last talked to someone.
import { EMAIL } from './clients.mjs';
import { newId } from './ids.mjs';

export const CONTACT_TYPES = ['partner', 'referral', 'vendor', 'other'];
export const TYPE_LABELS = { __proto__: null, partner: 'Partner', referral: 'Referral source', vendor: 'Vendor', other: 'Other' };
const EDITABLE = ['business', 'owner', 'email', 'phone', 'website', 'type'];

const pick = (fields) => Object.fromEntries(EDITABLE.map((k) => [k, String(fields[k] ?? '').trim()]));

export const contactFields = (data) =>
  Object.fromEntries(EDITABLE.map((k) => [k, String(data.get(k) ?? '').trim()]));

export function validateContact(fields) {
  const errors = [];
  if (!fields.business) errors.push('business is required');
  if (fields.email && !EMAIL.test(fields.email)) errors.push('email does not look like an address');
  if (!CONTACT_TYPES.includes(fields.type)) errors.push(`type must be one of ${CONTACT_TYPES.join(', ')}`);
  return errors;
}

export function newContact(fields, now = new Date()) {
  const at = now.toISOString();
  return { id: newId(now), ...pick(fields), notes: [], clientSlug: null, createdAt: at, updatedAt: at };
}

export function applyContactEdit(contact, fields, now = new Date()) {
  return { ...contact, ...pick(fields), updatedAt: now.toISOString() };
}

export function addNote(contact, text, now = new Date()) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error('note is empty');
  const at = now.toISOString();
  return { ...contact, notes: [{ at, text: trimmed }, ...(contact.notes ?? [])], updatedAt: at };
}

export const lastNoteAt = (contact) => contact.notes?.[0]?.at ?? null;
