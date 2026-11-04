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
          ? `btn-big w-full min-h-[4rem] text-xl ${dict.listening ? 'bg-danger text-white' : 'bg-brand text-white hover:bg-[#174a3a]'}`
          : `btn-small shrink-0 min-h-[2.6rem] min-w-[2.6rem] ${dict.listening ? 'bg-danger text-white' : 'bg-brand-soft text-brand'}`
      }
    >
      <span aria-hidden className="text-[1.2em]">
        {dict.listening ? '⏹' : '🎤'}
      </span>
      {variant === 'hero' ? <span>{dict.listening ? t.mic.stop : t.mic.start}</span> : <span className="sr-only">{dict.listening ? t.mic.stop : t.mic.start}</span>}
    </button>
  ) : null;

  return (
    <div className={variant === 'hero' ? 'flex flex-col gap-4' : 'flex flex-col gap-2'}>
      {variant === 'hero' && mic}
      {dict.listening && <p className="text-lg font-semibold text-brand" role="status">{t.mic.listening}</p>}
      {dict.error === 'denied' && <p className="text-base text-danger">{t.mic.denied}</p>}
      <div className="flex items-end gap-2">
        {variant === 'bar' && mic}
        <label className="sr-only" htmlFor="intent-composer">
          {placeholder ?? t.thing.inputPlaceholder}
        </label>
        <textarea
          id="intent-composer"
          ref={box}
          rows={variant === 'hero' ? 2 : 1}
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
          className="min-h-[2.6rem] w-full resize-none rounded-2xl border-2 border-line bg-white px-4 py-2 text-lg leading-snug text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none disabled:bg-sand"
        />
        <button
          type="button"
          onClick={send}
          disabled={disabled || !value.trim() || dict.listening}
          className="btn-small min-h-[2.6rem] shrink-0 bg-brand px-5 font-semibold text-white disabled:bg-line disabled:text-ink-soft"
        >
          {sendLabel ?? t.say.send}
        </button>
      </div>
    </div>
  );
}
