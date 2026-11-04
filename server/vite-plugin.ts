import type { IncomingMessage } from 'node:http';
import type { Connect, Plugin } from 'vite';

/** Mounts the Intent API (/api) and admin (/_/) on the Vite dev and preview servers. */
export function intentApi(): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const path = req.url?.split('?')[0] ?? '';
    const isApi = path.startsWith('/api/');
    if (!isApi && path !== '/_' && !path.startsWith('/_/')) return next();
    try {
      const [{ handle }, { handleAdmin }, { getDeps }, { send }] = await Promise.all([import('./api'), import('./admin'), import('./deps'), import('./http')]);
      const deps = await getDeps();
      const request = await toRequest(req);
      const response = isApi
        ? await handle(request, deps, (p) => { p.catch((e) => console.error('[intent] background', e)); })
        : await handleAdmin(request, deps);
      await send(res, response, req);
    } catch (err) {
      console.error('[intent] dev api', err);
      res.statusCode = 500;
      res.end('{"error":"server error"}');
    }
  };
  return {
    name: 'intent-api',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
}
