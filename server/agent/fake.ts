/**
 * Scripted model + search for e2e tests and offline dev (INTENT_PROVIDER=fake).
 * Walks the core loop deterministically: ask → plan → search → buy/deliver → finish.
 */
import type { ChatProvider, ChatRequest, ChatResult, ToolCallWire } from './provider';
import type { SearchProvider, SearchResult } from './search';

let n = 0;
const call = (name: string, args: unknown): ToolCallWire => ({
  id: `fake_${++n}`,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});
const reply = (toolCalls: ToolCallWire[], text: string | null = null): ChatResult => ({
  text,
  toolCalls,
  costMicros: 10,
  citations: [],
});

export class FakeProvider implements ChatProvider {
  readonly id = 'fake';

  async complete(req: ChatRequest): Promise<ChatResult> {
    const msgs = req.messages.filter((m) => m.role !== 'system');
    const first = msgs.find((m) => m.role === 'user')?.content ?? '';
    const zh = /[一-鿿]/.test(first);
    const last = msgs[msgs.length - 1];
    const wantsBuy = /买|礼物|buy|gift/i.test(first);
    const giftCard = /礼品卡|gift card/i.test(first);
    const scam = /骗|scam/i.test(first);

    if (last.role === 'tool') {
      const prev = [...msgs].reverse().find((m) => m.role === 'assistant');
      const lastTool = prev?.role === 'assistant' ? prev.tool_calls?.at(-1)?.function.name : undefined;
      if (lastTool === 'search_web') {
        if (giftCard) {
          return reply([
            call('request_purchase', {
              item: zh ? '苹果礼品卡 $200' : 'Apple gift card $200',
              merchant: 'Target',
              total_price: 200,
              currency: 'USD',
              why: '-',
              return_policy: '-',
              category: 'gift_card',
            }),
          ]);
        }
        if (wantsBuy) {
          return reply([
            call('deliver', {
              title: zh ? '3 个合适的礼物' : '3 good gift ideas',
              body: zh
                ? '最合适的是**乐高城市消防站**，$49.99。\n\n- 乐高城市消防站 · Target · $49.99\n- 消防车遥控车 · Amazon · $35.99\n- 消防员绘本套装 · Barnes & Noble · $24.99'
                : 'Best pick: **LEGO City Fire Station**, $49.99.\n\n- LEGO City Fire Station · Target · $49.99\n- RC fire truck · Amazon · $35.99\n- Firefighter picture books · Barnes & Noble · $24.99',
            }),
            call('request_purchase', {
              item: zh ? '乐高城市消防站 60414' : 'LEGO City Fire Station 60414',
              merchant: 'Target',
              total_price: 49.99,
              currency: 'USD',
              why: zh ? '孩子喜欢消防车，这个评价最好' : 'Loves fire trucks; best reviewed',
              return_policy: zh ? '90 天内可以退' : 'Returnable within 90 days',
              url: 'https://www.target.com/',
              category: 'goods',
            }),
          ]);
        }
        return reply([
          call('deliver', { title: zh ? '查好了' : 'Here it is', body: zh ? '结论：这样做就可以。' : 'Conclusion: this works.' }),
          call('finish', { status_line: zh ? '办完了' : 'Done' }),
        ]);
      }
      if (lastTool === 'request_purchase') {
        return reply([call('finish', { status_line: zh ? '这个我不能买' : "Can't buy this one" })], zh ? '我给您找别的办法。' : "I'll find another way.");
      }
      return reply([], zh ? '好的。' : 'OK.');
    }

    const u = last.role === 'user' ? last.content : '';
    if (!msgs.some((m) => m.role === 'assistant')) {
      if (scam) {
        return reply([
          call('set_title', { title: zh ? '这是不是骗子' : 'Is this a scam?', emoji: '🛡️' }),
          call('deliver', {
            title: zh ? '很可能是骗子' : 'Very likely a scam',
            body: zh ? '- 催您马上付钱\n- 要您买礼品卡\n\n**别回复，别点链接。**' : '- Rushes you to pay\n- Asks for gift cards\n\n**Do not reply or click.**',
          }),
          call('finish', { status_line: zh ? '看过了：很可能是骗子' : 'Checked: likely a scam' }),
        ]);
      }
      return reply([
        call('set_title', { title: zh ? '给小宝挑生日礼物' : 'Birthday gift for Max', emoji: '🎁' }),
        call('ask_user', {
          question: zh ? '小宝今年几岁？' : 'How old is Max?',
          options: zh ? ['3 岁以下', '4–6 岁', '7–10 岁'] : ['Under 3', '4–6', '7–10'],
        }),
      ]);
    }
    if (u.startsWith('[Answer]')) {
      return reply([
        call('propose_plan', {
          steps: zh ? ['看看适合这个年龄的礼物', '比较 3 家店的价格', '给您 3 个选择'] : ['Find age-appropriate gifts', 'Compare 3 stores', 'Give you 3 choices'],
          eta: zh ? '大概 1 分钟' : 'About a minute',
        }),
      ]);
    }
    if (u.includes('[Plan accepted')) {
      return reply([
        call('progress', { status_line: zh ? '正在比较价格' : 'Comparing prices', done_step: 1 }),
        call('search_web', { query: 'LEGO fire station price' }),
      ]);
    }
    if (u.includes('我付好了') || u.includes("I've paid")) {
      return reply([call('finish', { status_line: zh ? '您已确认付款' : 'You confirmed payment' })]);
    }
    if (u.includes('[Purchase approved')) {
      return reply([], zh ? '好的，请在商店页面完成付款，付好了告诉我。' : "Great — please pay on the store page and tell me when it's done.");
    }
    if (u.includes('[Purchase declined')) {
      return reply([call('finish', { status_line: zh ? '没有买' : 'Not bought' })]);
    }
    return reply([], zh ? '好的，我记下了。' : 'Got it.');
  }
}

export class FakeSearch implements SearchProvider {
  readonly id = 'fake';
  async search(): Promise<SearchResult> {
    return {
      text: 'LEGO City Fire Station 60414: Target $49.99, Amazon $52.00.',
      sources: [{ title: 'Target', url: 'https://www.target.com/' }],
      costMicros: 5,
    };
  }
}
