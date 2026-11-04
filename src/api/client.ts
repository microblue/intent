import type { Memory, Profile, Thing, ThingDetail, UserInput } from '@shared/types';

// Establish one server-signed, HttpOnly anonymous session before parallel requests.
let session: Promise<void> | undefined;
function ensureSession(): Promise<void> {
  return session ??= fetch('/api/session', { method: 'POST', credentials: 'same-origin' })
    .then(res => { if (!res.ok) throw new Error('Session unavailable'); })
    .catch(err => { session = undefined; throw err; });
}

export const ensureSessionReady = () => ensureSession();
/** After login/logout the cookie changed; forget the cached session promise. */
export const resetSession = () => { session = undefined; };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  await ensureSession();
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, err.error ?? res.statusText);
  }
  return (await res.json()) as T;
}

export const api = {
  runtime: () => call<{ provider: string; model: string; scripted: boolean; search: string }>('GET', '/runtime'),
  profile: () => call<Profile>('GET', '/me'),
  updateProfile: (patch: Partial<Omit<Profile, 'userId'>>) => call<Profile>('PATCH', '/me', patch),
  deleteAll: () => call<{ ok: true }>('DELETE', '/me/data'),
  things: () => call<Thing[]>('GET', '/things'),
  thing: (id: string) => call<ThingDetail>('GET', `/things/${id}`),
  createThing: (text: string) => call<Thing>('POST', '/things', { text }),
  input: (id: string, input: UserInput) => call<ThingDetail>('POST', `/things/${id}/input`, input),
  archive: (id: string, archived: boolean) => call<Thing>('POST', `/things/${id}/archive`, { archived }),
  memories: () => call<Memory[]>('GET', '/memories'),
  forget: (id: string) => call<{ ok: true }>('DELETE', `/memories/${id}`),
  account: () => call<{ username: string | null }>('GET', '/account'),
  register: (username: string, password: string) => call<{ username: string }>('POST', '/account/register', { username, password }),
  login: (username: string, password: string) => call<{ username: string }>('POST', '/account/login', { username, password }),
  logout: () => call<{ ok: true }>('POST', '/account/logout'),
};
