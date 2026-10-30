'use strict';
/**
 * INTEROPERABILITY.
 * Our Node server talks to someone else's system (the Banana API run by Marc Conrad,
 * University of Bedfordshire) over HTTPS using a REST-style GET request that returns JSON:
 *     { "question": "<url of puzzle image>", "solution": <digit 0-9> }
 * Only the HTTP protocol and the JSON format are shared; the two programs can be written in
 * different languages and run on different machines.
 *
 * Docs: https://marcconrad.com/uob/banana/doc.php
 * Note from the API author: free for study, not for commercial use.
 */
const { banana } = require('../config');
const { HttpError } = require('../utils/http');

async function fetchPuzzle() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), banana.timeoutMs);
  try {
    // Global fetch is built into Node 18+. A cache-busting query avoids repeated puzzles.
    const res = await fetch(`${banana.url}?out=json&base64=no&t=${Date.now()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Banana API answered ${res.status}`);
    const data = await res.json();

    // Never trust a third party blindly: validate the shape before using it.
    const solution = Number(data.solution);
    if (typeof data.question !== 'string' || !Number.isInteger(solution) || solution < 0 || solution > 9) {
      throw new Error('Unexpected response shape from Banana API');
    }
    // The page may be served over HTTPS; upgrade the image link to avoid mixed-content blocking.
    const imageUrl = data.question.replace(/^http:\/\//i, 'https://');
    return { imageUrl, solution };
  } catch (err) {
    console.error('[banana-api]', err.message);
    throw new HttpError(502, 'The Banana puzzle service is not answering. Try again in a moment.');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchPuzzle };
