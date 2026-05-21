# Launcher · cross-intent "最近的对话" + "文件" data

Status: **aios-side gated** — both groups are hidden in real-mode
signed-in (E10) because no data hooks back them. When the hooks land,
flip the `showMockShortcuts` gate in `src/components/Launcher.tsx`.

## What's needed

Two read-only hooks consumed by the Launcher only:

### 1. `useRecentUserMessages(limit = 5)`

Returns the current user's most recent `role='user'` messages across
**all** of their intents, newest first, with the intent id stitched
on so a launcher selection can navigate to `/intent/<id>`.

Shape:

```ts
interface RecentUserMessage {
  id: string;
  intentId: string;
  text: string;
  createdAt: string;
}

function useRecentUserMessages(limit?: number): {
  messages: RecentUserMessage[];
  isLoading: boolean;
};
```

Server: a Postgres view or RLS-gated query against `messages` joined
with `intents` (so `archived_at` filters apply). Live updates are
nice-to-have (Realtime channel on `messages` filtered to the user)
but not required for the first cut.

### 2. `useRecentUserFiles(limit = 5)`

Returns the current user's most recently touched `intent_files`
across all intents.

Shape:

```ts
interface RecentUserFile {
  id: string;
  intentId: string;
  name: string;
  kind: 'doc' | 'image' | 'link';
  preview: string;
  updatedAt: string;
}

function useRecentUserFiles(limit?: number): {
  files: RecentUserFile[];
  isLoading: boolean;
};
```

## Wiring

Once both hooks exist:

```diff
-  const { intents: launcherIntents, isMock } = useIntents();
-  const showMockShortcuts = isMock;
+  const { intents: launcherIntents, isMock } = useIntents();
+  const { messages: realMessages } = useRecentUserMessages(5);
+  const { files: realFiles } = useRecentUserFiles(5);
+  const showMessages = isMock ? mockMessages : realMessages;
+  const showFiles    = isMock ? mockFiles    : realFiles;
```

Then collapse the `showMockShortcuts &&` gates around each
`Command.Group` and render `showMessages` / `showFiles` instead.

## After the hooks land

Flip `E10` to `[x]` and delete this doc — the gate becomes a single
ternary at the data layer, and the launcher renders identically in
both modes.
