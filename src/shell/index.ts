// Multi-shell detection. Phase 1 stub — real `tauri` shell wiring lands in Phase 9.
//
// The contract: every shell-specific capability is named here. Code that wants
// to do "open the system file picker", "show a native notification", "stash a
// secret" calls a function on this object. The web shell returns no-ops or
// browser fallbacks; the tauri shell will plug in @tauri-apps/api invokes.

export type ShellKind = 'web' | 'tauri';

export function detectShell(): ShellKind {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return 'tauri';
  }
  return 'web';
}

export const shell = {
  kind: detectShell(),
  isWeb: detectShell() === 'web',
  isTauri: detectShell() === 'tauri',
};
