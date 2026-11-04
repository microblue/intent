import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';
import { useDictation } from './voice';

interface Props {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Big centered microphone (welcome / new thing) vs a compact bar (thing page). */
  variant?: 'hero' | 'bar';
  autoFocus?: boolean;
  sendLabel?: string;
  /** Changing this value focuses the text box (e.g. after "change the plan"). */
  focusKey?: unknown;
}

/** Voice first, typing second (spec §5.2). */
export function Composer({ onSend, placeholder, disabled, variant = 'bar', autoFocus, sendLabel, focusKey }: Props) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const [value, setValue] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const dict = useDictation(lang, (said) => setValue((v) => (v ? `${v} ${said}` : said)));

  useEffect(() => {
    if (focusKey) box.current?.focus();
  }, [focusKey]);

  const shown = dict.listening ? dict.text : value;
  // Grow with the text so nothing is hidden behind a scrollbar.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [shown]);
  const send = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
  };

  const mic = dict.supported ? (
    <button
      type="button"
      onClick={dict.listening ? dict.stop : dict.start}
      disabled={disabled}
      aria-pressed={dict.listening}
      className={
        variant === 'hero'
          ? `btn-big min-h-[3.6rem] text-lg ${dict.listening ? 'bg-danger text-white' : 'bg-signature text-white shadow-md hover:brightness-110'}`
          : `btn-small shrink-0 min-h-[2.8rem] min-w-[2.8rem] ${dict.listening ? 'bg-danger text-white' : 'bg-brand-soft text-brand'}`
      }
    >
      <span aria-hidden className="text-[1.2em]">
        {dict.listening ? '⏹' : '🎤'}
      </span>
      {variant === 'hero' ? <span>{dict.listening ? t.mic.stop : t.mic.start}</span> : <span className="sr-only">{dict.listening ? t.mic.stop : t.mic.start}</span>}
    </button>
  ) : null;

  const textarea = (
    <>
      <label className="sr-only" htmlFor="intent-composer">
        {placeholder ?? t.thing.inputPlaceholder}
      </label>
      <textarea
        id="intent-composer"
        ref={box}
        rows={variant === 'hero' ? 3 : 1}
        value={shown}
        autoFocus={autoFocus}
        readOnly={dict.listening}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={placeholder ?? t.thing.inputPlaceholder}
        className={
          variant === 'hero'
            ? 'min-h-[5.5rem] w-full resize-none bg-transparent px-5 pt-4 text-lg leading-relaxed text-ink placeholder:text-ink-soft focus:outline-none'
            : 'min-h-[2.6rem] w-full resize-none rounded-2xl bg-white px-4 py-2 text-lg leading-snug text-ink shadow-sm ring-1 ring-line placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-sand'
        }
      />
    </>
  );
  const sendButton = (
    <button
      type="button"
      onClick={send}
      disabled={disabled || !value.trim() || dict.listening}
      className="btn-small min-h-[2.8rem] shrink-0 bg-brand px-5 font-semibold text-white shadow-sm hover:bg-brand-dark disabled:bg-sand disabled:text-ink-soft disabled:shadow-none"
    >
      {sendLabel ?? t.say.send} <span aria-hidden>→</span>
    </button>
  );
  const status = (
    <>
      {dict.listening && <p className="text-lg font-semibold text-brand" role="status">{t.mic.listening}</p>}
      {dict.error === 'denied' && <p className="text-base text-danger">{t.mic.denied}</p>}
    </>
  );

  if (variant === 'hero') {
    // The original input card: big rounded box, voice and send along the bottom.
    return (
      <div className="space-y-3">
        <div className="rounded-3xl bg-white shadow-[0_2px_6px_rgba(20,20,40,0.04),0_12px_32px_-12px_oklch(55%_0.2_292/0.25)] ring-2 ring-brand/30 transition focus-within:ring-brand/70">
          {textarea}
          <div className="flex flex-wrap items-center justify-end gap-3 px-4 pb-4 pt-1">
            {mic}
            <span className="flex-1" />
            {sendButton}
          </div>
        </div>
        {status}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {status}
      <div className="flex items-end gap-2">
        {mic}
        {textarea}
        {sendButton}
      </div>
    </div>
  );
}
