import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';

/** Mounts the Intent API at /api on the Vite dev and preview servers. */
export function intentApi(): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    try {
      const [{ handle }, { getDeps }] = await Promise.all([import('./api'), import('./deps')]);
      const request = await toRequest(req);
      const pending: Promise<unknown>[] = [];
      const response = await handle(request, getDeps(), (p) => {
        pending.push(p.catch((e) => console.error('[intent] background', e)));
      });
      await send(res, response);
    } catch (err) {
      console.error('[intent] dev api', err);
      res.statusCode = 500;
      res.end('{"error":"server error"}');
    }
  };
  return {
    name: 'intent-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
    method: req.method,
    headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  });
}

async function send(res: ServerResponse, r: Response) {
  res.statusCode = r.status;
  r.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await r.arrayBuffer()));
}
