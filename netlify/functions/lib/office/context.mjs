// Everything a template may auto-fill about one client, built in one place so
// the send screen, the meeting emails and the digest all say the same thing.
import site from '../../../../src/data/site.json' with { type: 'json' };
import { mint } from '../token.mjs';
import { toInstant, formatWhen, formatHours } from './dates.mjs';

// Labels for prose, not the questionnaire pages' own titles: the reminder
// template puts an article in front of this ("the {{questionnaire.title}}
// is still open"), and a page title like "Your designs" doesn't read as a
// noun phrase there the way "brand and demo questionnaire" does.
const TITLES = {
  __proto__: null,
  intro: 'intro questionnaire',
  brand: 'brand and demo questionnaire',
  build: 'site build questionnaire',
  review: 'site review',
};

export const siteUrl = () => process.env.URL || 'https://www.keepsitemedia.com';

// The token binds the client's slug. When the demo lives under another
// folder, the brand form learns which one from ?d= (src/scripts/questionnaire.js).
const questionnaireLink = (secret, slug, form, demo = slug) =>
  secret ? `${siteUrl()}/questionnaire/${form}/?c=${slug}&t=${mint(secret, slug, form)}${form === 'brand' && demo !== slug ? `&d=${demo}` : ''}` : '';

export function buildContext({ client, admin, secret, form, meeting, agreement, now = new Date() }) {
  const url = siteUrl();
  const demo = client.demo || client.slug;
  const ctx = {
    client: {
      name: client.name,
      firstName: String(client.name ?? '').trim().split(/\s+/)[0] || client.business,
      business: client.business,
      email: client.email,
    },
    links: {
      intro: questionnaireLink(secret, client.slug, 'intro'),
      brand: questionnaireLink(secret, client.slug, 'brand', demo),
      build: questionnaireLink(secret, client.slug, 'build'),
      demo: `${url}/demo/${demo}/`,
    },
    site: { brand: site.brand, url, email: site.email, phone: site.phone },
    admin: { email: admin?.email ?? site.email },
  };
  if (form) ctx.questionnaire = { title: TITLES[form] ?? `${form} questionnaire`, link: questionnaireLink(secret, client.slug, form, demo) };
  if (meeting) {
    ctx.meeting = {
      title: meeting.title,
      when: formatWhen(meeting.ymd, meeting.time),
      link: meeting.link || '(no link yet)',
      minutes: meeting.minutes,
      hours: formatHours(toInstant(meeting.ymd, meeting.time) - now),
    };
  }
  if (agreement) {
    ctx.links.sign = `${url}/sign/?t=${agreement.signers.client.token}`;
    ctx.agreement = {
      name: agreement.templateName ?? agreement.template,
      sentAt: agreement.sentAt ?? '', completedAt: agreement.completedAt ?? '',
      hash: agreement.hash ?? '', declineReason: agreement.signers?.client?.declineReason ?? '',
    };
  }
  return ctx;
}
