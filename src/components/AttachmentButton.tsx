import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { uploadAttachment } from '@/lib/uploadAttachment';
import { useSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { friendlyError } from '@/lib/friendlyError';
import { cn } from '@/lib/cn';
import type { MessageContentPart } from '@/mocks/types';

/**
 * 📎 Attachment picker. Opens the OS file dialog, uploads the chosen
 * file to `chat-attachments/<user_id>/<intent_id>/...` via the
 * Supabase Storage client, then hands the resulting MessageContentPart
 * back to the parent composer for inclusion in the next message.
 *
 * Hidden in mock-mode and when not signed-in (no user_id to scope the
 * RLS path with). Disabled while an upload is in flight.
 */

interface Props {
  intentId: string;
  onAttached: (part: MessageContentPart) => void;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
}

export function AttachmentButton({
  intentId,
  onAttached,
  size = 'md',
  className,
  disabled = false,
}: Props) {
  const { signedIn, user } = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  // Real-mode + signed-in only — uploads require a user_id for the
  // RLS path. Mock-mode users have no Supabase backing.
  if (!env.useRealData || !signedIn || !user?.id) return null;

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    try {
      const part = await uploadAttachment(file, user.id, intentId);
      onAttached(part);
    } catch (err) {
      toast(friendlyError(err, '附件传不上去,稍后再试'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="attachment-button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || disabled}
        aria-label="加附件"
        title={busy ? '上传中…' : '加图片或文件'}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full transition',
          size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
          busy
            ? 'animate-pulse bg-base-300 text-base-content/40'
            : 'bg-base-200 text-base-content/70 hover:bg-base-300 hover:text-base-content',
          (busy || disabled) && 'cursor-not-allowed opacity-60',
          className,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'}
          aria-hidden
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,text/plain,application/zip,application/json"
        onChange={onChange}
        className="hidden"
        aria-hidden
      />
    </>
  );
}
