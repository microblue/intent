import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { capabilities, type Capability, type CapabilityGrant } from '@/mocks';
import {
  usePermissionGrants,
  useSetPermissionMode,
} from '@/data/usePermissionGrants';
import { cn } from '@/lib/cn';

const groupOrder: { key: Capability['group']; label: string; emoji: string; hint: string }[] = [
  { key: 'read', label: '看你的资料', emoji: '👀', hint: '只看,不动' },
  { key: 'do', label: '帮你做事', emoji: '✋', hint: '会动你的东西' },
  { key: 'external', label: '联系外部服务', emoji: '🌐', hint: '帮你跟第三方平台对接' },
];

const modeLabels: Record<CapabilityGrant['mode'], { label: string; tone: string; hint: string }> = {
  allow: { label: '可以', tone: 'bg-success text-success-content', hint: '直接做,不打扰你' },
  ask: { label: '每次问', tone: 'bg-warning text-warning-content', hint: '动手前先问你一句' },
  deny: { label: '不行', tone: 'bg-base-300 text-base-content/55', hint: '完全不允许' },
};

export function PermissionsPage() {
  const { modeOf: grantOf } = usePermissionGrants();
  const { setMode: persistMode } = useSetPermissionMode();

  const setMode = async (capId: string, mode: CapabilityGrant['mode']) => {
    try {
      await persistMode(capId, mode);
      const cap = capabilities.find((c) => c.id === capId);
      toast(`已改成「${modeLabels[mode].label}」`, { description: cap?.label });
    } catch (err) {
      toast(err instanceof Error ? err.message : '改不动,稍后再试');
    }
  };

  return (
    <div className="w-full px-4 pb-24 pt-10 sm:px-8">
      <PageHeader
        emoji="🛡️"
        title="助手能做什么"
        term="capability"
        subtitle="敏感的事默认会先问你一下。觉得太啰嗦,可以改成「可以」;不放心的,改成「不行」。"
      />

      <div className="mb-6 rounded-2xl bg-warning/10 p-4 text-sm leading-relaxed text-warning-content/90 ring-1 ring-warning/30">
        <div className="mb-1 font-medium text-warning">关于权限</div>
        所有「花钱」和「替你说话给别人」的事 ——
        默认是「每次问」。你愿意全部信任(比如让我自动下单买菜),改成「可以」就行。
      </div>

      {groupOrder.map((g) => (
        <section key={g.key} className="mb-8">
          <header className="mb-3 flex items-baseline gap-3 px-1">
            <h2 className="text-base font-semibold">
              <span aria-hidden className="mr-1.5">
                {g.emoji}
              </span>
              {g.label}
            </h2>
            <span className="text-xs text-base-content/45">{g.hint}</span>
          </header>
          <ul className="flex flex-col gap-1.5">
            {capabilities
              .filter((c) => c.group === g.key)
              .map((c) => (
                <CapabilityRow key={c.id} cap={c} mode={grantOf(c.id)} onChange={(m) => setMode(c.id, m)} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CapabilityRow({
  cap,
  mode,
  onChange,
}: {
  cap: Capability;
  mode: CapabilityGrant['mode'];
  onChange: (m: CapabilityGrant['mode']) => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-base-200/60 p-3.5 ring-1 ring-base-300/40 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-base-100 text-lg shadow-sm"
        >
          {cap.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{cap.label}</span>
            {cap.sensitive && (
              <span className="inline-flex rounded-full bg-warning/15 px-1.5 py-0.5 text-[0.8125rem] font-medium text-warning">
                敏感
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-base-content/55">{cap.description}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-stretch rounded-full bg-base-100 p-1 ring-1 ring-base-300/60 sm:self-auto">
        {(['deny', 'ask', 'allow'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              'flex-1 rounded-full px-2.5 py-1 text-xs font-medium transition sm:flex-initial',
              m === mode ? modeLabels[m].tone : 'text-base-content/55 hover:text-base-content',
            )}
            title={modeLabels[m].hint}
          >
            {modeLabels[m].label}
          </button>
        ))}
      </div>
    </li>
  );
}
