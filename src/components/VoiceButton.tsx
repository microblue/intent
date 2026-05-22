import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Push-to-talk voice input. Backed by the Web Speech API
 * (window.SpeechRecognition / webkitSpeechRecognition). When the user
 * holds the button (or taps once to toggle on mobile), we open a
 * SpeechRecognition session, stream interim + final transcripts back
 * through `onTranscript`, then close on release.
 *
 * Locale: zh-CN. The lay-user audience is primarily Chinese-speaking;
 * Web Speech routes to the platform's STT (Mandarin on Chrome/Safari).
 *
 * If SpeechRecognition isn't available (Firefox desktop, older mobile
 * browsers, embedded WebViews), the component renders nothing so the
 * surrounding composer stays clean.
 *
 * Test hook: tests can install a mock SpeechRecognition on `window`
 * (key `SpeechRecognition` or `webkitSpeechRecognition`) before the
 * component mounts; the hook picks the global up.
 */

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceInputSupported(): boolean {
  return getSpeechRecognition() !== null;
}

export interface VoiceButtonProps {
  /** Receives final transcripts. The composer typically appends. */
  onTranscript: (text: string) => void;
  /** Optional: receives interim transcripts so the composer can show
   * what the user is saying live before they release the button. */
  onInterim?: (text: string) => void;
  className?: string;
  size?: 'sm' | 'md';
  /** Pre-empt the button (e.g. while the parent is sending). */
  disabled?: boolean;
}

export function VoiceButton({
  onTranscript,
  onInterim,
  className,
  size = 'md',
  disabled = false,
}: VoiceButtonProps) {
  const Ctor = getSpeechRecognition();
  const [supported] = useState(() => Ctor !== null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognizerRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalsRef = useRef<string>('');

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const r = recognizerRef.current;
      if (r) {
        try { r.abort(); } catch { /* ignore */ }
      }
    };
  }, []);

  if (!supported || !Ctor) return null;

  const start = () => {
    if (listening || disabled) return;
    setError(null);
    finalsRef.current = '';
    const r = new Ctor();
    r.lang = 'zh-CN';
    r.continuous = true;
    r.interimResults = true;
    r.onstart = () => setListening(true);
    r.onresult = (e) => {
      let interim = '';
      // Iterate from resultIndex — anything earlier was already final.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalsRef.current += transcript;
        } else {
          interim += transcript;
        }
      }
      if (onInterim && interim) onInterim(interim);
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech') {
        // Quiet failure — the user just didn't say anything.
        setError(null);
      } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('麦克风没开');
      } else {
        setError(e.message || e.error);
      }
      setListening(false);
    };
    r.onend = () => {
      setListening(false);
      const text = finalsRef.current.trim();
      if (text) onTranscript(text);
      finalsRef.current = '';
      recognizerRef.current = null;
    };
    recognizerRef.current = r;
    try {
      r.start();
    } catch (err) {
      setError((err as Error).message);
      setListening(false);
      recognizerRef.current = null;
    }
  };

  const stop = () => {
    const r = recognizerRef.current;
    if (!r) return;
    try { r.stop(); } catch { /* ignore */ }
  };

  const toggle = () => {
    if (listening) stop();
    else start();
  };

  return (
    <button
      type="button"
      data-testid="voice-button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? '停止录音' : '语音输入'}
      title={error ?? (listening ? '点一下停止' : '点一下说话')}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        listening
          ? 'animate-pulse bg-error text-error-content ring-2 ring-error/40'
          : 'bg-base-200 text-base-content/70 hover:bg-base-300 hover:text-base-content',
        disabled && 'cursor-not-allowed opacity-40',
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
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
      </svg>
    </button>
  );
}
