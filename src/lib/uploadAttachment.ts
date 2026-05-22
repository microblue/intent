import { supabase } from '@/lib/supabase';
import type { MessageContentPart } from '@/mocks/types';

/**
 * Uploads a chat attachment to the `chat-attachments` bucket and
 * returns a MessageContentPart ready to splice into a message body.
 *
 * Path: `<user_id>/<intent_id>/<timestamp>-<basename>`. RLS on the
 * bucket should allow read/write only when the leading path segment
 * matches `auth.uid()`.
 *
 * For images (image/*), the returned part is `{ type:'image', url,
 * name, size, mime }` so MessageBubble can inline-preview. For all
 * other MIME types it's `{ type:'file', url, name, size, mime }` so
 * MessageBubble renders a chip with a download link.
 *
 * Returns `null` and surfaces a friendly Error when the bucket is
 * missing or the user lacks RLS write access; callers should toast
 * the error and not insert anything.
 */
export async function uploadAttachment(
  file: File,
  userId: string,
  intentId: string,
): Promise<MessageContentPart> {
  if (!file) throw new Error('选个文件再传');
  if (file.size > 10 * 1024 * 1024) throw new Error('文件太大 —— 上限 10 MB');

  // Sanitize the basename so the path stays predictable and URL-safe.
  // Strip everything other than ASCII letters, digits, `.`, `-`, `_`,
  // and pad with a timestamp prefix so the same filename uploaded
  // twice doesn't collide.
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const path = `${userId}/${intentId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
  if (error) {
    // The most common failures we see at the bucket level are:
    //   - bucket missing (storage 404) → friendly install nudge
    //   - RLS denial (storage 401/403) → "your account can't upload"
    if (/bucket.*not.*found|not.*exist|404/i.test(error.message)) {
      throw new Error('附件功能还没开通,稍后再试。');
    }
    throw new Error(error.message);
  }

  const { data: signed, error: urlErr } = await supabase.storage
    .from('chat-attachments')
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
  if (urlErr || !signed?.signedUrl) {
    throw new Error('文件传上去了,但拿不到链接 —— 再试一次?');
  }

  const isImage = (file.type || '').startsWith('image/');
  return isImage
    ? {
        type: 'image',
        url: signed.signedUrl,
        alt: file.name,
        name: file.name,
        size: file.size,
        mime: file.type || undefined,
      }
    : {
        type: 'file',
        url: signed.signedUrl,
        name: file.name,
        size: file.size,
        mime: file.type || undefined,
      };
}
