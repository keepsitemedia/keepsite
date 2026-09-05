// Fixtures the agreement tests share. A signature has to survive
// signaturePng, storeSignature and pdf-lib's embedPng, so every test that
// signs needs a real PNG rather than a plausible-looking string.

// A 1x1 transparent PNG.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
export const DATA_URL = `data:image/png;base64,${PNG.toString('base64')}`;

// The same PNG with IHDR's width and height overwritten. The CRC is left
// stale on purpose: signaturePng reads the declared size and must refuse an
// oversized one before anything decodes the bitmap.
export function pngDeclaring(width, height) {
  const bytes = Buffer.from(PNG);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
