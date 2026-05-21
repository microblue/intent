import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';

/**
 * Markdown — chat-message-friendly markdown renderer.
 *
 * Wraps react-markdown with remark-gfm (GitHub-flavored — tables,
 * strikethrough, task lists, autolinks) and Tailwind classNames tuned
 * for the assistant prose density we use in IntentHome. Used for both
 * streaming deltas and final turns; react-markdown handles partial
 * input gracefully (open `**` etc. just render literally until closed).
 *
 * Why not the `prose` plugin? @tailwindcss/typography is heavier than
 * we need and it's the only place we'd use it. The handful of class
 * overrides below give us the same shape (headings have margin-bottom,
 * lists have indent, code is monospace with subtle background) without
 * the extra dependency.
 */

export function Markdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'text-[15px] leading-relaxed text-base-content/90',
        // Block elements
        '[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold',
        '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold',
        '[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-[15px] [&_h3]:font-semibold',
        '[&_h4]:mt-3 [&_h4]:mb-1.5 [&_h4]:text-[14px] [&_h4]:font-semibold',
        '[&_h5]:mt-2 [&_h5]:mb-1 [&_h5]:text-[13px] [&_h5]:font-semibold',
        // Lists — soft bullets, indented
        '[&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc',
        '[&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal',
        '[&_li]:my-0.5',
        '[&_li_>_p]:my-0',
        // Inline
        '[&_strong]:font-semibold [&_strong]:text-base-content',
        '[&_em]:italic',
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-85',
        // Code — monospace, subtle background
        '[&_code]:rounded [&_code]:bg-base-200/70 [&_code]:px-1 [&_code]:py-[1px] [&_code]:text-[0.875em] [&_code]:font-mono',
        '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-base-200/70 [&_pre]:p-3 [&_pre]:text-[13px] [&_pre]:leading-relaxed',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
        // Blockquote — left bar
        '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-base-300 [&_blockquote]:pl-3 [&_blockquote]:text-base-content/70',
        // Tables — light grid, fits chat width
        '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[14px]',
        '[&_th]:border [&_th]:border-base-300/60 [&_th]:bg-base-200/40 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
        '[&_td]:border [&_td]:border-base-300/60 [&_td]:px-2 [&_td]:py-1',
        // Horizontal rule
        '[&_hr]:my-4 [&_hr]:border-base-300/60',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Force links to open in a new tab; nofollow for safety.
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
