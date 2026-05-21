import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { useArchivedIntents } from '@/data/useIntents';
import { useUpdateIntent } from '@/data/useUpdateIntent';
import type { Intent } from '@/mocks/types';
import { friendlyError } from '@/lib/friendlyError';

/**
 * Archive view — where 封存'd intents go to be remembered, not deleted.
 *
 * Phase 7 keeps it deliberately minimal: a flat list with one action per
 * row ("取出来"). No bulk operations, no search, no "permanently delete"
 * button. Lay users who archive by accident need exactly one path back;
 * everything else is power-user territory and stays out of scope.
 */
export function ArchivePage() {
  const { intents, isLoading, error, isMock } = useArchivedIntents();
  const { update: updateIntent } = useUpdateIntent();

  const handleRestore = async (intent: Intent) => {
    try {
      await updateIntent({ id: intent.id, archived: false });
      toast('已取出来', { description: `「${intent.title}」回到了想做的事` });
    } catch (err) {
      toast(friendlyError(err, '取出来失败,稍后再试'));
    }
  };

  return (
    <div className="w-full px-4 pb-24 pt-10 sm:px-8">
      <PageHeader
        emoji="📦"
        title="封存的"
        subtitle="收起来不显示在主列表里。想要的话可以一键取出来。"
      />

      {isMock && (
        <p className="mb-6 text-[11px] text-base-content/40">
          演示数据 · 真实数据接通后会显示你自己封存的
        </p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-base-200/60 ring-1 ring-base-300/40"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-error/30 bg-error/5 p-6 text-sm text-error">
          <div className="font-medium">读取封存列表时出错了</div>
          <p className="mt-1 text-error/80">{friendlyError(error, '稍等一下,再刷新一次试试。')}</p>
        </div>
      ) : intents.length === 0 ? (
        <div
          data-testid="archive-empty"
          className="rounded-2xl border-2 border-dashed border-base-300/60 bg-base-100/40 p-8 text-center"
        >
          <div className="text-4xl">📭</div>
          <div className="mt-3 text-base font-medium">这里还是空的</div>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-base-content/55">
            没有封存过的项目。
          </p>
          <Link to="/" className="btn btn-ghost btn-sm mt-4">
            ← 回到想做的事
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {intents.map((it) => (
            <li
              key={it.id}
              data-testid="archive-row"
              className="flex items-center gap-3 rounded-2xl bg-base-200/50 p-3 ring-1 ring-base-300/40"
            >
              <span
                aria-hidden
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl shadow-sm ring-1 ring-black/5"
                style={{ background: it.cover }}
              >
                {it.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{it.title}</div>
                <div className="truncate text-xs text-base-content/55">
                  {it.preview}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(it)}
                data-testid="archive-restore"
                className="btn btn-ghost btn-sm gap-1.5"
                aria-label={`取出来:${it.title}`}
              >
                <span aria-hidden>↩</span>
                取出来
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
