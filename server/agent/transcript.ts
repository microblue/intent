/**
 * Rebuild the model conversation from OUR timeline. The platform keeps no
 * state between turns, which is what makes it swappable mid-thing.
 */
import type { Entry } from '../../shared/types';
import type { ChatMessage } from './provider';
import { money } from './policy';

export function entriesToMessages(entries: Entry[]): ChatMessage[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  const push = (role: 'user' | 'assistant', content: string) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else out.push({ role, content });
  };

  for (const e of entries) {
    switch (e.kind) {
      case 'text':
        push(e.by === 'user' ? 'user' : 'assistant', e.payload.text);
        break;
      case 'question':
        push('assistant', `[I asked] ${e.payload.question} (options: ${e.payload.options.join(' / ')})`);
        if (e.payload.answer) push('user', `[Answer] ${e.payload.answer}`);
        break;
      case 'plan': {
        const steps = e.payload.steps.map((s, i) => `${i + 1}. ${s.text}${s.state === 'done' ? ' (done)' : ''}`).join('\n');
        push('assistant', `[I proposed a plan, time: ${e.payload.eta}]\n${steps}`);
        if (e.payload.decision === 'accepted') push('user', '[Plan accepted — go ahead]');
        if (e.payload.decision === 'change') push('user', '[I want to change the plan — see my next message]');
        break;
      }
      case 'approval': {
        const p = e.payload;
        push('assistant', `[I asked approval to buy] ${p.item} from ${p.merchant}, ${money(p.amountCents, p.currency)}${p.url ? `, link ${p.url}` : ''}`);
        if (p.decision === 'approved') push('user', '[Purchase approved — I will pay on the store page]');
        if (p.decision === 'declined') push('user', "[Purchase declined — don't buy it]");
        break;
      }
      case 'result':
        push('assistant', `[I delivered: ${e.payload.title}]\n${e.payload.body}`);
        break;
      case 'refusal':
        push('assistant', e.payload.text);
        break;
      case 'activity':
        break;
    }
  }
  // Conversations must start with the user.
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '(continue)' });
  return out;
}
