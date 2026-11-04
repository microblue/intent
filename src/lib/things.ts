import type { Thing } from '@shared/types';

/** Things that are waiting on the user: a question, a plan or an approval. */
export const needsYou = (t: Thing) => !t.busy && (t.status === 'needs_you' || t.status === 'plan' || t.status === 'asking');

export function greetingKey(d = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}
