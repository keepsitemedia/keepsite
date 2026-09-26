// The Lockii offer is stored as numbers in src/data/lockii.json and the tier
// prices as display strings in packages.json. Deriving the discounted price
// here, rather than typing it into the page, keeps the offer right when a
// tier price changes.

export function discountedPrice(display, percent) {
  const digits = String(display).replace(/[^0-9.]/g, '');
  const amount = Number(digits);
  if (!digits || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(`not a single price: ${JSON.stringify(display)}`);
  }
  if (!(percent > 0 && percent < 100)) throw new Error(`discount percent out of range: ${percent}`);
  const discounted = Math.round((amount * (100 - percent)) / 100);
  return '$' + discounted.toLocaleString('en-US');
}

export function freeMonths(n) {
  return n === 1 ? 'first month free' : `first ${n} months free`;
}

export function offerSummary(offer) {
  return `${offer.discountPercent}% off the build, ${freeMonths(offer.freeMonths)}`;
}
