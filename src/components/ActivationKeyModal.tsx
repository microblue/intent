import { useEffect, useRef, useState } from 'react';

/**
 * Reusable activation-key dialog.
 *
 * The actual redemption logic lives in `~/myclaw`'s `/aios/install`
 * surface (per aios-design.md §A.1 — "/aios/install: redeem flow:
 * paste key → name/region → start install"). The SPA's job is to
 * collect the code from the user and hand them off to that surface
 * with the key pre-filled in the URL, so they don't have to retype.
 *
 * Used by:
 *   - Settings → 订阅 → 激活码 (subscription renewal entry point)
 *   - IntentList sentinel banner → "已经有激活码?" (cold-start
 *     redemption for users who got a code from a friend / partner)
 */

const INSTALL_URL = 'https://myclaw.one/aios/install';

interface ActivationKeyModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Optional override for the install destination (tests inject a
   * navigation spy here so we don't hard-navigate out of Playwright).
   */
  redirectFn?: (url: string) => void;
}

export function ActivationKeyModal({
  open,
  onClose,
  redirectFn,
}: ActivationKeyModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [key, setKey] = useState('');

  // Drive the native <dialog> open/close imperatively because React's
  // declarative API doesn't cover its modal semantics.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const handleClose = () => {
    setKey('');
    onClose();
  };

  const handleSubmit = () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    const url = `${INSTALL_URL}?key=${encodeURIComponent(trimmed)}`;
    if (redirectFn) {
      redirectFn(url);
    } else {
      window.location.assign(url);
    }
    handleClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      data-testid="activation-key-modal"
      onClose={handleClose}
    >
      <div className="modal-box">
        <h3 className="text-base font-semibold">输入激活码</h3>
        <p className="mt-1 text-sm text-base-content/65">
          把购买或好友赠送的激活码粘贴在下面,我们带你去开通页面完成激活。
        </p>
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="MYCL-XXXX-XXXX-XXXX"
          autoFocus
          aria-label="激活码"
          data-testid="activation-key-input"
          className="input input-bordered mt-4 w-full font-mono tracking-widest"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && key.trim()) handleSubmit();
          }}
        />
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleClose}
            data-testid="activation-key-cancel"
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!key.trim()}
            onClick={handleSubmit}
            data-testid="activation-key-submit"
          >
            去激活 →
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={handleClose} aria-label="关闭">
          close
        </button>
      </form>
    </dialog>
  );
}
