// What the dashboard and a client's overview say about where things stand.
// A pipeline task either waits on the admin or on something the client does;
// the split is what turns a flat task list into "on you" and "waiting on
// clients", and the glance is the same reading for one client.
import { addDays, formatYmd, todayIn } from './dates.mjs';

export const waitsOnClient = (t) => Boolean(t.questionnaire || t.payment || t.agreement === 'completed');

const byDue = (a, b) => a.due.localeCompare(b.due) || (a.time ?? '').localeCompare(b.time ?? '');

export function daysBetween(fromYmd, toYmd) {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86400000);
}

// Open tasks in due order. The admin's own list stops at the horizon so the
// dashboard shows a day's work, not a quarter's; waiting tasks have no
// horizon because a client who is late is exactly what the list is for.
export function splitOpen(tasks, today, horizon = 3) {
  const open = tasks.filter((t) => !t.done).sort(byDue);
  const cutoff = addDays(today, horizon);
  const mine = open.filter((t) => !waitsOnClient(t));
  return {
    onYou: mine.filter((t) => t.due <= cutoff),
    later: mine.filter((t) => t.due > cutoff).length,
    waiting: open.filter(waitsOnClient),
  };
}

export function nudge(t) {
  if (t.questionnaire) return { href: `/office/send/${t.slug}/questionnaire-reminder/?form=${t.questionnaire}`, label: 'Remind' };
  if (t.agreement === 'completed') return { href: `/office/send/${t.slug}/agreement/`, label: 'Resend link' };
  if (t.payment) return { href: `/office/clients/${t.slug}/?tab=payments`, label: 'Payments' };
  return null;
}

// "3 days late", "today", "tomorrow", "in 4 days": the words a person uses,
// with the date itself left to the column beside it.
export function relative(due, today) {
  const d = daysBetween(today, due);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} late`;
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  return `in ${d} days`;
}

const ymdOf = (iso) => todayIn(undefined, new Date(iso));
const CLOSED = new Set(['voided', 'declined']);

export function glance({ today, tasks, agreements, payments, forms, submitted, plan }) {
  const facts = [];

  const a = agreements.find((x) => !CLOSED.has(x.status));
  if (!a) facts.push({ label: 'Agreement', state: 'none', text: 'None yet' });
  else if (a.status === 'completed') facts.push({ label: 'Agreement', state: 'done', text: `Signed ${formatYmd(ymdOf(a.completedAt))}` });
  else if (a.status === 'draft') facts.push({ label: 'Agreement', state: 'none', text: 'Draft, not sent' });
  else {
    const expires = a.signers?.client?.expiresAt;
    const expired = expires && ymdOf(expires) < today;
    facts.push(expired
      ? { label: 'Agreement', state: 'late', text: `Signing link expired ${formatYmd(ymdOf(expires))}` }
      : { label: 'Agreement', state: 'waiting', text: `Out for signature${expires ? `, expires ${formatYmd(ymdOf(expires))}` : ''}` });
  }

  if (plan) {
    for (const kind of ['deposit', 'balance']) {
      const label = kind === 'deposit' ? 'Deposit' : 'Balance';
      const ps = payments.filter((p) => p.kind === kind);
      const paid = ps.find((p) => p.status === 'paid');
      const latest = ps[0];
      if (paid) facts.push({ label, state: 'done', text: `Paid ${formatYmd(ymdOf(paid.paidAt ?? paid.createdAt))}` });
      else if (!latest) { if (kind === 'deposit') facts.push({ label, state: 'none', text: 'No link yet' }); }
      else if (latest.status === 'pending') facts.push({ label, state: 'waiting', text: `Link sent ${formatYmd(ymdOf(latest.createdAt))}` });
      else facts.push({ label, state: 'late', text: latest.status === 'expired' ? 'Link expired' : 'Payment failed' });
    }
    const sub = payments.find((p) => p.kind === 'subscription' || p.kind === 'monthly');
    if (sub) facts.push({ label: 'Monthly', state: sub.status === 'failed' ? 'late' : sub.status === 'active' || sub.status === 'paid' ? 'done' : 'waiting', text: sub.status === 'failed' ? 'Last charge failed' : sub.status });
  }

  if (forms.length) {
    const back = forms.filter((f) => submitted.includes(f)).length;
    const outstanding = forms.filter((f) => !submitted.includes(f));
    const sent = tasks.some((t) => t.questionnaire && !t.done);
    facts.push({
      label: 'Questionnaires',
      state: back === forms.length ? 'done' : sent ? 'waiting' : 'none',
      text: back === forms.length ? 'All back' : `${back} of ${forms.length} back`,
      detail: outstanding.length && back < forms.length ? `${outstanding.join(' and ')} outstanding` : '',
    });
  }

  const next = tasks.filter((t) => !t.done && !waitsOnClient(t)).sort(byDue)[0];
  facts.push(next
    ? { label: 'Next on you', state: next.due < today ? 'late' : 'waiting', text: `${next.title}, ${relative(next.due, today)}`, href: `/office/clients/${next.slug}/?tab=tasks` }
    : { label: 'Next on you', state: 'none', text: 'Nothing open' });

  return facts;
}
