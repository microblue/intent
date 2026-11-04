import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Lang } from '@shared/types';
import { useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';
import { useAccount, useForget, useMemories, useProfile, useThings, useUpdateProfile } from '@/api/hooks';
import { api, ApiError, resetSession } from '@/api/client';

/** Me, ordered by how often people need it: text size first (spec §5.4). */
export function MePage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink">{t.me.title}</h1>
      <TextSize />
      <NameAndLanguage />
      <WhatItCanDo />
      <Remembers />
      <PutAway />
      <Account />
    </div>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="space-y-3 card p-5">
      <h2 id={id} className="text-xl font-bold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TextSize() {
  const t = useT();
  const { fontScale, set } = usePrefs();
  const update = useUpdateProfile();
  return (
    <Section title={t.me.size} id="me-size">
      <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={t.me.size}>
        {([1, 2, 3] as const).map((n, i) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={fontScale === n}
            onClick={() => {
              set({ fontScale: n });
              update.mutate({ fontScale: n });
            }}
            className={`btn-big px-2 ${fontScale === n ? 'bg-brand text-white' : 'bg-white shadow-sm ring-1 ring-line text-ink'}`}
          >
            <span style={{ fontSize: `${0.9 + i * 0.25}em` }}>{t.me.sizes[i]}</span>
          </button>
        ))}
      </div>
      <p className="text-lg text-ink-soft">{t.me.sizeSample}</p>
    </Section>
  );
}

function NameAndLanguage() {
  const t = useT();
  const { lang, set } = usePrefs();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [name, setName] = useState('');
  useEffect(() => setName(profile?.name ?? ''), [profile?.name]);

  const pickLang = (l: Lang) => {
    set({ lang: l });
    update.mutate({ lang: l });
  };
  return (
    <Section title={t.me.name} id="me-name">
      <div className="flex gap-2">
        <label htmlFor="me-name-input" className="sr-only">
          {t.me.name}
        </label>
        <input
          id="me-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.me.namePlaceholder}
          maxLength={40}
          className="min-h-[2.6rem] w-full rounded-2xl ring-1 ring-line px-4 text-lg focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={() => update.mutate({ name: name.trim() }, { onSuccess: () => toast.success(t.me.saved) })}
          className="btn-small shrink-0 bg-brand px-5 text-white"
        >
          {t.me.save}
        </button>
      </div>
      <h3 className="pt-2 text-lg font-bold text-ink">{t.me.lang}</h3>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t.me.lang}>
        {(
          [
            ['zh', '中文'],
            ['en', 'English'],
          ] as const
        ).map(([l, label]) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            lang={l === 'zh' ? 'zh-CN' : 'en'}
            onClick={() => pickLang(l)}
            className={`btn-big ${lang === l ? 'bg-brand text-white' : 'bg-white shadow-sm ring-1 ring-line text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function fmt(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function WhatItCanDo() {
  const t = useT();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const limitRow = (label: string, key: 'perPurchaseLimitCents' | 'monthlyLimitCents', options: number[]) => (
    <div className="space-y-2">
      <p className="text-lg text-ink">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={profile?.[key] === c}
            onClick={() => update.mutate({ [key]: c })}
            className={`btn-small min-w-[4.5rem] border-2 ${profile?.[key] === c ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'}`}
          >
            {c === 0 ? t.me.none : fmt(c)}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <Section title={t.me.can} id="me-can">
      <p className="text-lg text-ink">{t.me.canBody}</p>
      {limitRow(t.me.perLimit, 'perPurchaseLimitCents', [0, 5_000, 10_000, 30_000, 100_000])}
      {limitRow(t.me.monthLimit, 'monthlyLimitCents', [0, 10_000, 30_000, 100_000, 300_000])}
      {profile && (
        <p className="text-base text-ink-soft">
          {t.me.spent}: {fmt(profile.spentThisMonthCents)}
        </p>
      )}
      <div className="rounded-2xl border-2 border-danger/40 bg-danger-soft p-4">
        <h3 className="text-lg font-bold text-danger">{t.me.never}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-lg text-ink">
          {t.me.neverList.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="mt-2 text-base font-semibold text-ink">{t.me.neverNote}</p>
      </div>
    </Section>
  );
}

export function Remembers() {
  const t = useT();
  const { data: memories } = useMemories();
  const forget = useForget();
  return (
    <Section title={t.me.memory} id="me-memory">
      {!memories?.length ? (
        <p className="text-lg text-ink-soft">{t.me.memoryEmpty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {memories.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <span className="flex-1 text-lg">{m.text}</span>
              <button type="button" onClick={() => forget.mutate(m.id)} className="btn-small ring-1 ring-line text-ink">
                {t.me.forget}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PutAway() {
  const t = useT();
  const { data: things } = useThings();
  const archived = (things ?? []).filter((x) => x.status === 'archived');
  return (
    <Section title={t.me.archived} id="me-archived">
      {!archived.length ? (
        <p className="text-lg text-ink-soft">{t.me.archivedEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {archived.map((x) => (
            <li key={x.id}>
              <Link to="/t/$id" params={{ id: x.id }} className="btn-small w-full justify-start ring-1 ring-line text-lg">
                <span aria-hidden>{x.emoji}</span> {x.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Account() {
  const t = useT();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  return (
    <Section title={t.me.account} id="me-account">
      <SignIn />
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="btn-soft text-danger">
          {t.me.deleteAll}
        </button>
      ) : (
        <div className="space-y-3 rounded-2xl bg-danger-soft p-4">
          <p className="text-lg font-semibold">{t.me.deleteConfirm}</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirming(false)} className="btn-soft">
              {t.me.cancel}
            </button>
            <button
              type="button"
              onClick={async () => {
                await api.deleteAll();
                setConfirming(false);
                await qc.invalidateQueries();
              }}
              className="btn-big bg-danger text-white"
            >
              {t.me.deleteYes}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

/** Optional username + password, so the same things are reachable from another device. */
function SignIn() {
  const t = useT();
  const qc = useQueryClient();
  const { data: account } = useAccount();
  const [mode, setMode] = useState<'create' | 'login'>('create');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const after = async () => {
    resetSession();
    setPassword('');
    setError('');
    await qc.invalidateQueries();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'create') await api.register(username, password);
      else await api.login(username, password);
      await after();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 409 ? t.me.accountTaken : status === 401 ? t.me.accountWrong : status === 400 ? t.me.accountBad : t.errors.network);
    } finally {
      setBusy(false);
    }
  };

  if (account?.username) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-lg">
          {t.me.signedInAs}
          <b>{account.username}</b>
        </p>
        <button type="button" className="btn-soft" onClick={async () => { await api.logout(); await after(); }}>
          {t.me.signOut}
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-lg text-ink-soft">{t.me.accountNote}</p>
      <label className="block text-lg">
        {t.me.username}
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={2} maxLength={32}
          className="mt-1 w-full card px-4 py-3 text-lg" />
      </label>
      <label className="block text-lg">
        {t.me.password}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={128}
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          className="mt-1 w-full card px-4 py-3 text-lg" />
      </label>
      {error && <p role="alert" className="text-lg text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="btn-main">{mode === 'create' ? t.me.createAccount : t.me.signInNow}</button>
        <button type="button" className="btn-soft" onClick={() => { setMode(mode === 'create' ? 'login' : 'create'); setError(''); }}>
          {mode === 'create' ? t.me.haveAccount : t.me.newAccount}
        </button>
      </div>
    </form>
  );
}
