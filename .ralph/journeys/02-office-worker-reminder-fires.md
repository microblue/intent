persona: 30 岁白领, 用 myclaw 管 4 个项目和家事
goal: 在 /schedule 设一个提醒, 时间到了真的收到提醒
spec_file: e2e/journey-02-reminder-fires.spec.ts

## Steps

1. 登录 → 进 /schedule
2. 用 NL composer 输入 "30 秒后吃药" (intentionally near-future for testing)
3. 点提交 → 看到 toast 确认 + 列表里出现新行
4. 等 35 秒
5. 期望: 收到某种提醒 — toast / in-page notification / browser notification

## Pass criteria

- Step 5 在浏览器内出现 visible 提醒 element (selector: `[data-testid="reminder-fired"]` 或类似)
- 该提醒的标题包含 "吃药"
- schedule_events 行的 status 从 pending 变成 fired
- 用 page.clock 把时间往前推 25 小时, 验 daily-recurrence 提醒在第二个时段也会响

## Known fail modes

- 没有任何 firing 机制: 没 pg_cron, 没 Edge Function, 没 client polling
- schedule_events 行写进了 DB, 永远是 status='pending'
- UI 文案 "提醒" 是 aspirational

## Implementation hints

最轻量可行实现:
- 客户端 polling: 用户在线时, useScheduleEvents hook 起一个 `setInterval`,
  每 30 秒查 `WHERE user_id = me AND status = 'pending' AND fire_at <= NOW()`
  → 在 SPA 内 toast + 更新 status='fired'
- 离线/关掉浏览器的 case: 出 hand-off 给 ~/myclaw 加 pg_cron + Edge Function
  推送 push 通知 / 邮件 / Telegram (取决于用户的 notification preference)
- 必须保证: 即便用户没开浏览器, 时间到了也能收到 (otherwise 这不能叫提醒)
