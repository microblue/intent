persona: 任何用户
goal: 屏幕上看起来能点的所有元素都能点, 弹出的菜单不会被其他元素盖住
spec_file: e2e/journey-05-overlay-and-interactivity.spec.ts

## Steps

For each of these surfaces, run a tight "stress click" pass:
- /, /intent/<seeded-id>, /schedule, /memory, /permissions, /now, /settings,
  /help, /archive, /new

On each:
1. Enumerate every visually-clickable element (button, a[href], [role="button"], cursor-pointer, [data-testid$="-action"])
2. For each, click it
3. Within 2 seconds, assert ONE of:
   - URL changed
   - A new visible element appeared (modal/dropdown/sheet/toast)
   - A network request fired (fetch/xhr started)
   - Visible DOM state mutated (button text/badge/checkbox)
4. If none of the above → fail with the element's outer HTML + selector

For each dropdown that opens (sidebar account / agent picker / intent
actions menu / Cmd+K launcher / claw picker):
5. Take a screenshot at the moment the menu is open
6. Assert no other interactive element's bounding-rect overlaps the
   menu's bounding-rect by more than 4 pixels (z-stacking sanity)
7. Each item in the menu is reachable by click (visible + not covered)

## Pass criteria

- Step 3 succeeds for every enumerated element on every surface
- Step 6 (overlap check) passes for every opened dropdown
- Step 7 (item reachability) passes for every menu item
- `[mock-in-real-mode]` console.error count for the whole pass = 0

## Known fail modes

- Sidebar collapsed account dropdown extends past the sidebar's right
  edge and gets covered by chat composer's stacking context
- TeamPanel agent rows look clickable but have no handler
- Various aria-label-only buttons that don't actually do anything

## Implementation hints

- Use `page.locator('button, a[href], [role="button"]')` then for each
  `locator.boundingBox()` + `page.evaluate(() => /* check style */)` to
  filter out hidden ones
- For overlap check: `Element.elementsFromPoint(centerX, centerY)` on
  4 corner sample points of the menu — the menu element should be the
  topmost (last) at each point
- This test is necessarily slow; run it once per cycle, not every loop
