import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@shared/types';

/* Minimal Web Speech API types (not in lib.dom for all TS versions). */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type Ctor = new () => SpeechRecognitionLike;

function recognitionCtor(): Ctor | undefined {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const speechLang = (lang: Lang) => (lang === 'zh' ? 'zh-CN' : 'en-US');

/**
 * Tap to start, tap to stop (spec §9: taps only, no press-and-hold).
 * `text` holds what was heard so far, so it can be shown while speaking.
 */
export function useDictation(lang: Lang, onFinal: (text: string) => void) {
  const supported = typeof window !== 'undefined' && !!recognitionCtor();
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<'denied' | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef('');
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const C = recognitionCtor();
    if (!C) return;
    const r = new C();
    r.lang = speechLang(lang);
    r.continuous = true;
    r.interimResults = true;
    finalText.current = '';
    setText('');
    setError(null);
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      setText(finalText.current + interim);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('denied');
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
      const said = finalText.current.trim();
      if (said) onFinalRef.current(said);
    };
    rec.current = r;
    r.start();
    setListening(true);
  }, [lang]);

  useEffect(() => () => rec.current?.stop(), []);

  return { supported, listening, text, error, start, stop };
}

/** Read text aloud with the browser's voice. */
export function useSpeaker(lang: Lang) {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const speak = useCallback(
    (id: string, text: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      if (speakingId === id) {
        setSpeakingId(null);
        return;
      }
      const u = new SpeechSynthesisUtterance(stripMarkdown(text));
      u.lang = speechLang(lang);
      u.rate = 0.9;
      u.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
      setSpeakingId(id);
      window.speechSynthesis.speak(u);
    },
    [lang, speakingId, supported],
  );

  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  return { supported, speakingId, speak };
}

function stripMarkdown(s: string) {
  return s.replace(/[*_#>`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}
