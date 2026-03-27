import { generateErrorImage } from '../processing/pipeline.js';

/**
 * Helper to send a PNG buffer or an error image fallback.
 */
export async function sendImage(res, buffer) {
  res.type('image/png').send(buffer);
}

export async function sendErrorImage(res, message) {
  const buf = await generateErrorImage(message);
  res.type('image/png').send(buf);
}
