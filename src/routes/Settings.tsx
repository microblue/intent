import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { signOut, useSession } from '@/lib/auth';
import { useUserPreferences } from '@/data/useUserPreferences';
import { useUI } from '@/state/ui';
import { cn } from '@/lib/cn';

/**
 * Supported UI languages. Names are written in the *target* language so the
 * dropdown reads as a native menu, not a translation — the standard pattern
 * across iOS / Android / macOS / web (Wikipedia, Notion, etc.).
 *
 * Real i18n wiring lands in Phase 6; this is the selectable surface now.
 */
const LANGUAGES = [
  { code: 'en', label: 'English', toast: 'Switched to English' },
  { code: 'zh-CN', label: '简体中文', toast: '已切换到 简体中文' },
  { code: 'zh-TW', label: '繁體中文', toast: '已切換到 繁體中文' },
  { code: 'ja', label: '日本語', toast: '日本語に切り替えました' },
  { code: 'ko', label: '한국어', toast: '한국어로 전환했습니다' },
  { code: 'es', label: 'Español', toast: 'Cambiado a Español' },
] as const;
type LangCode = (typeof LANGUAGES)[number]['code'];

export function SettingsPage() {
  const devMode = useUI((s) => s.devMode);
  const toggleDevMode = useUI((s) => s.toggleDevMode);
  const activationModal = useRef<HTMLDialogElement | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const { user, signedIn, loading } = useSession();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // user_preferences: lazy-upsert source of truth for cosmetic + locale
  // settings. In mock mode the hook returns a static stub; we still let
  // the user toggle these — the upsert no-ops without persisting, but
  // the in-memory React state still reflects their choice for the
  // session, which is what most demo viewers want.
  const { prefs, upsert: upsertPrefs, isMock: prefsAreMock } = useUserPreferences();
  const [lang, setLang] = useState<LangCode>('zh-CN');
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Sync persisted prefs into the form once the query lands. We use a
  // separate effect (not derived state) so the user can edit the draft
  // without it snapping back on every render.
  useEffect(() => {
    if (!prefs) return;
    if (
      prefs.preferred_lang &&
      LANGUAGES.some((l) => l.code === prefs.preferred_lang)
    ) {
      setLang(prefs.preferred_lang as LangCode);
    }
    setNameDraft(prefs.display_name ?? '');
  }, [prefs]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    toast('已登出');
    navigate({ to: '/auth/signin' });
  };

  return (
    <div className="w-full px-4 pb-24 pt-10 sm:px-8">
      <PageHeader emoji="⚙️" title="设置" subtitle="保持简单。多数选项有合理默认值,你可以不动。" />

      <Section title="账号">
        {loading ? (
          <li className="px-4 py-6 text-sm text-base-content/55">加载账号信息…</li>
        ) : !signedIn ? (
          <li className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <div className="text-sm">还没有登录</div>
              <div className="mt-0.5 text-xs text-base-content/55">
                登录后才能保存数据、跨设备同步
              </div>
            </div>
            <Link to="/auth/signin" className="btn btn-primary btn-sm" data-testid="settings-signin">
              登录
            </Link>
          </li>
        ) : (
          <>
            <li className="flex flex-col gap-2 border-b border-base-300/40 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm">姓名</div>
                <div className="mt-0.5 text-xs text-base-content/45">
                  助手怎么称呼你 · 留空就用邮箱前缀
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="input input-bordered input-sm w-48"
                  value={nameDraft}
                  placeholder={user?.email?.split('@')[0] ?? ''}
                  onChange={(e) => setNameDraft(e.target.value)}
                  data-testid="settings-display-name"
                  onBlur={async () => {
                    const next = nameDraft.trim();
                    if (next === (prefs?.display_name ?? '')) return;
                    setSavingName(true);
                    try {
                      await upsertPrefs({ display_name: next || null });
                      toast('已保存');
                    } catch (err) {
                      toast(err instanceof Error ? err.message : '保存失败');
                    } finally {
                      setSavingName(false);
                    }
                  }}
                />
                {savingName && (
                  <span className="loading loading-spinner loading-xs text-base-content/40" />
                )}
              </div>
            </li>
            <Row label="邮箱" value={user?.email ?? '—'} hint="登录用" />
            <li className="flex items-center justify-between gap-4 border-b border-base-300/40 px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="text-sm">登出当前账号</div>
                <div className="mt-0.5 text-xs text-base-content/45">
                  数据留在云端,下次登录还在
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                data-testid="settings-signout"
                className="btn btn-ghost btn-sm gap-1.5 text-error hover:bg-error/10"
              >
                <span aria-hidden>🚪</span>
                {signingOut ? '登出中…' : '登出'}
              </button>
            </li>
          </>
        )}
        <SubscriptionRow onEnterKey={() => activationModal.current?.showModal()} />
      </Section>

      <Section title="外观">
        <Row label="主题" value="跟随系统(深色优先)" />
        <Row label="字体大小" value="标准" />
        <li className="flex flex-col gap-1 border-b border-base-300/40 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm">语言</div>
            <div className="mt-0.5 text-xs text-base-content/45">界面显示语言</div>
          </div>
          <div className="flex items-center gap-3">
            <select
              className="select select-bordered select-sm w-44"
              value={lang}
              data-testid="settings-language"
              onChange={async (e) => {
                const next = e.target.value as LangCode;
                setLang(next);
                const meta = LANGUAGES.find((l) => l.code === next);
                if (meta) toast(meta.toast);
                if (!prefsAreMock) {
                  try {
                    await upsertPrefs({ preferred_lang: next });
                  } catch (err) {
                    toast(err instanceof Error ? err.message : '保存失败');
                  }
                }
              }}
              aria-label="界面语言"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </li>
      </Section>

      <Section title="提醒方式">
        <Row label="推送" value="开" hint="iOS / Android" />
        <Row label="邮件提醒" value="只发重要的" />
        <Row label="勿扰时间" value="22:30 – 08:00" />
      </Section>

      <Section title="数据与隐私">
        <Row
          label="助手记得的事"
          value="17 条"
          linkLabel="去看看"
          to="/memory"
        />
        <Row
          label="助手能做什么"
          value="17 项可调"
          linkLabel="去看看"
          to="/permissions"
        />
        <Row
          label="封存的"
          value="不显示在主列表"
          hint="想找回封存过的项目就从这儿"
          linkLabel="去看看"
          to="/archive"
        />
        <Row
          label="导出我的数据"
          value="JSON / Markdown"
          linkLabel="导出"
          onLink={() => toast('导出排队(Phase 6)')}
        />
      </Section>

      <Section title="读懂 MyClaw">
        <Row
          label="帮助"
          value="11 个核心概念"
          hint="想做的事 / 助手 / 提醒 / 记得 / 能做 ……都是什么、对应英文是啥"
          linkLabel="打开"
          to="/help"
        />
      </Section>

      {/* Activation key modal */}
      <dialog ref={activationModal} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box">
          <h3 className="text-base font-semibold">输入激活码</h3>
          <p className="mt-1 text-sm text-base-content/65">
            把购买或好友赠送的激活码粘贴在下面,Pro 会自动延期。
          </p>
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="MYCL-XXXX-XXXX-XXXX"
            autoFocus
            className="input input-bordered mt-4 w-full font-mono tracking-widest"
          />
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setKeyInput('');
                activationModal.current?.close();
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!keyInput.trim()}
              onClick={() => {
                toast('激活码已提交(Phase 6 接 Polar)');
                setKeyInput('');
                activationModal.current?.close();
              }}
            >
              激活
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="button" onClick={() => activationModal.current?.close()}>
            close
          </button>
        </form>
      </dialog>

      {/* Dev mode */}
      <section className="mt-10 rounded-2xl bg-base-200/50 p-5 ring-1 ring-base-300/40">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <span aria-hidden>🔧</span>
              开发者模式
            </h2>
            <p className="mt-1.5 max-w-md text-sm text-base-content/65">
              打开后,你能看到底层引擎(OpenClaw / Hermes),每个 Intent 用了哪些 agent、走的哪条
              provider。普通用户不需要打开。
            </p>
            {devMode && (
              <Link
                to="/settings/engines"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/25"
              >
                看底层引擎 →
              </Link>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={devMode}
            onClick={() => {
              toggleDevMode();
              toast(devMode ? '关闭开发者模式' : '开启开发者模式');
            }}
            className={cn(
              'mt-1 inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition',
              devMode ? 'bg-primary' : 'bg-base-300',
            )}
          >
            <span
              className={cn(
                'inline-block h-5 w-5 transform rounded-full bg-base-100 shadow transition',
                devMode ? 'translate-x-[1.625rem]' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-base-content/45">
        {title}
      </h2>
      <ul className="overflow-hidden rounded-2xl bg-base-200/60 ring-1 ring-base-300/40">
        {children}
      </ul>
    </section>
  );
}

function SubscriptionRow({ onEnterKey }: { onEnterKey: () => void }) {
  return (
    <li className="flex flex-col gap-2 border-b border-base-300/40 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          订阅
          <span className="badge badge-primary badge-sm">Pro</span>
        </div>
        <div className="mt-0.5 text-xs text-base-content/45">
          到期 <span className="font-medium text-base-content/70">2026-06-12</span> · ¥48 / 月
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onEnterKey}
          className="btn btn-ghost btn-sm gap-1.5"
          aria-label="输入激活码"
          title="输入激活码"
        >
          <span aria-hidden>🔑</span>
          <span className="text-xs">激活码</span>
        </button>
        <button
          type="button"
          onClick={() => toast('订阅管理 — Phase 6 接 Polar')}
          className="btn btn-primary btn-sm"
        >
          管理 →
        </button>
      </div>
    </li>
  );
}

function Row({
  label,
  value,
  hint,
  linkLabel,
  to,
  onLink,
}: {
  label: string;
  value: string;
  hint?: string;
  linkLabel?: string;
  to?: string;
  onLink?: () => void;
}) {
  const action =
    to ? (
      <Link to={to} className="text-xs font-medium text-primary hover:underline">
        {linkLabel} →
      </Link>
    ) : onLink ? (
      <button
        type="button"
        onClick={onLink}
        className="text-xs font-medium text-primary hover:underline"
      >
        {linkLabel} →
      </button>
    ) : null;

  return (
    <li className="flex flex-col gap-1 border-b border-base-300/40 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-base-content/45">{hint}</div>}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-sm text-base-content/65">{value}</div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </li>
  );
}
