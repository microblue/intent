# Hand-off: `chat-attachments` Supabase Storage bucket + RLS

## Why

The SPA G4 work in `myclaw-aios` (commit landing this hand-off) builds
the end-to-end chat-attachment feature:

- `📎` button on the chat composer opens the file picker.
- `src/lib/uploadAttachment.ts` uploads to
  `chat-attachments/<user_id>/<intent_id>/<timestamp>-<basename>`.
- `useSendMessage` persists a message whose `content` jsonb contains
  `{ type:'image', url, name, size, mime }` (or `{ type:'file', … }`).
- `MessageBubble` / `UserMessage` renders inline image previews + file
  chips with signed-URL download links.

Without the bucket + RLS, the upload call fails with `bucket not found`
and the SPA shows a friendly toast: "附件功能还没开通,稍后再试。" The
SPA gracefully handles the missing bucket; this hand-off unlocks the
real path.

## What to do in `~/myclaw`

Add a Supabase migration (preferred) or run the SQL by hand in the
Supabase Dashboard SQL editor against the production project (`SUPABASE_PROJECT_REF`
matches the value already in `~/.openclaw/credentials/myclaw-supabase.env`).

```sql
-- Create the private bucket. 10 MB ceiling matches the SPA-side check;
-- adjust if the product requires larger payloads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  10485760,
  array[
    'image/png','image/jpeg','image/webp','image/gif',
    'application/pdf','text/plain','application/zip','application/json'
  ]
)
on conflict (id) do nothing;

-- RLS: users can read + write only under their own user_id prefix.
-- Path layout: <user_id>/<intent_id>/<file>. We scope at the leading
-- segment; intent ownership is enforced by the intents RLS policy
-- (the SPA only passes intentIds the user already owns).

create policy "chat-attachments: users read their own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "chat-attachments: users insert under their own prefix"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "chat-attachments: users update their own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "chat-attachments: users delete their own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );
```

## Verification after applying

1. Sign in to `app.myclaw.one` as `microblue@gmail.com`.
2. Open any intent (e.g. the cool-brook welcome thread).
3. Click 📎 in the composer, pick a small image (< 1 MB).
4. The upload chip should appear above the textarea (image thumbnail).
5. Click 发送 — the message persists and renders an inline image preview.
6. Open the same intent in a second tab — Realtime should fan in the
   message + image renders.

If any of those fail, run:

```
select * from storage.buckets where id = 'chat-attachments';
select polname, polcmd from pg_policies
  where tablename = 'objects' and polname like 'chat-attachments:%';
```

…to confirm the bucket + 4 policies (select / insert / update / delete)
all exist.

## Vision pass-through (separate, optional)

A follow-up hand-off should add gateway / OpenClaw support so the agent
sees the image bytes (or signed URL) when it processes the user's turn.
That work lives in `~/myclaw-desk`'s gateway adapter and OpenClaw's
`agent.runtime` config; not blocking for the SPA-side feature to ship.

## Status

- SPA-side feature: **done** in `myclaw-aios` (G4).
- Bucket + RLS: **pending** human approval to apply.
