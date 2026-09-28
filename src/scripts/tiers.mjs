// Everything the package pages derive from data rather than type by hand:
// the page path for a tier, the schema.org Service node built from the
// display prices (so structured data can never drift from the visible
// price), and the lookups that turn ids and topics in packages.json into
// links, stage lines and FAQ items. Each lookup throws on a name it cannot
// find, so a typo fails the build instead of shipping a gap.

export const tierHref = (id) => `/packages/${id}/`;

export function priceAmount(display) {
  const digits = String(display).replace(/[^0-9.]/g, '');
  const n = Number(digits);
  if (!digits || !Number.isFinite(n) || n <= 0) {
    throw new Error(`packages.json price is not a single parseable amount: ${JSON.stringify(display)}`);
  }
  return n.toFixed(2);
}

export function serviceNode(tier, { packagesUrl, pageUrl, businessId }) {
  return {
    '@type': 'Service',
    '@id': `${packagesUrl}#${tier.id}`,
    name: `${tier.name} website package`,
    description: tier.sub,
    serviceType: 'Website design and maintenance',
    url: pageUrl,
    provider: { '@id': businessId },
    offers: [
      {
        '@type': 'Offer',
        name: `${tier.name} build`,
        category: 'One-time build',
        price: priceAmount(tier.buildPrice),
        priceCurrency: 'USD',
        url: pageUrl,
      },
      {
        '@type': 'Offer',
        name: `${tier.name} subscription`,
        category: 'Subscription',
        priceCurrency: 'USD',
        url: pageUrl,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: priceAmount(tier.monthlyPrice),
          priceCurrency: 'USD',
          billingDuration: 'P1M',
          billingIncrement: 1,
        },
      },
    ],
  };
}

// "Growth or Range" -> link, " or ", link. "Keep going" -> plain.
export function linkPackages(text, tiers) {
  const hrefs = new Map(tiers.map((t) => [t.name, tierHref(t.id)]));
  return String(text)
    .split(/(\s+or\s+)/)
    .filter(Boolean)
    .map((part) => (hrefs.has(part) ? { text: part, href: hrefs.get(part) } : { text: part }));
}

export function stageLines(process, tierName) {
  return process.stages.items.map((stage) => {
    const hit = stage.tiers.find((t) => t.name === tierName);
    if (!hit) throw new Error(`process.json: ${stage.title} has no line for ${tierName}`);
    return { title: stage.title, body: hit.body };
  });
}

export function faqItems(faq, topics) {
  const all = faq.groups.flatMap((g) => g.items);
  return topics.map((topic) => {
    const item = all.find((i) => i.topic === topic);
    if (!item) throw new Error(`unknown FAQ topic: ${topic}`);
    return item;
  });
}

export function notIfLinks(tier, tiers) {
  return (tier.page?.notIf ?? []).map((n) => {
    const target = tiers.find((t) => t.id === n.tier);
    if (!target) throw new Error(`${tier.id}: notIf points at unknown tier ${n.tier}`);
    return { text: n.text, name: target.name, href: tierHref(target.id) };
  });
}
