/**
 * Vercel function entry. Same API handler as the standalone server; the
 * model turn keeps running after the response via waitUntil, and its
 * progress is written to Supabase where the polling client reads it.
 */
import { waitUntil } from '@vercel/functions';
import { handle } from './api';
import { getDeps } from './deps';

const MAX_BODY = 32768;

async function serve(req: Request): Promise<Response> {
  // vercel.json rewrites /api/<path> to /api?__p=<path>; restore the real path.
  const url = new URL(req.url);
  const p = url.searchParams.get('__p');
  if (p !== null) {
    url.searchParams.delete('__p');
    url.pathname = '/api/' + p;
  }
  if (url.pathname === '/api/healthz' && req.method === 'GET') {
    return Response.json({ status: 'ok', product: 'intent', storage: process.env.SUPABASE_URL ? 'supabase' : 'tinybase' });
  }
  let body: ArrayBuffer | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_BODY) return new Response(null, { status: 413 });
  }
  const res = await handle(new Request(url, { method: req.method, headers: req.headers, body: body?.byteLength ? body : undefined }), getDeps(), (job) => {
    waitUntil(job.catch((e) => console.error('[intent] background task failed', e)));
  });
  res.headers.set('X-Content-Type-Options', 'nosniff');
  return res;
}

export const GET = serve;
export const POST = serve;
export const PATCH = serve;
export const DELETE = serve;
