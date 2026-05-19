import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { IntentListPage } from '@/routes/IntentList';
import { IntentHomePage } from '@/routes/IntentHome';
import { NewIntentPage } from '@/routes/NewIntent';
import { SchedulePage } from '@/routes/Schedule';
import { MemoryPage } from '@/routes/Memory';
import { PermissionsPage } from '@/routes/Permissions';
import { SettingsPage } from '@/routes/Settings';
import { EnginesPage } from '@/routes/Engines';
import { HelpPage } from '@/routes/Help';
import { NowPage } from '@/routes/Now';
import { SignInPage } from '@/routes/SignIn';
import { ResetPasswordPage } from '@/routes/ResetPassword';
import { ArchivePage } from '@/routes/Archive';

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IntentListPage,
});

const intentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/intent/$intentId',
  component: IntentHomePage,
});

const newIntentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/new',
  component: NewIntentPage,
  validateSearch: (search: Record<string, unknown>) => ({
    seed: typeof search.seed === 'string' ? search.seed : undefined,
  }),
});

const scheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schedule',
  component: SchedulePage,
});

const memoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/memory',
  component: MemoryPage,
});

const permissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/permissions',
  component: PermissionsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

const enginesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/engines',
  component: EnginesPage,
});

const helpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/help',
  component: HelpPage,
});

const nowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/now',
  component: NowPage,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/signin',
  component: SignInPage,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/reset-password',
  component: ResetPasswordPage,
});

const archiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/archive',
  component: ArchivePage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  intentRoute,
  newIntentRoute,
  scheduleRoute,
  memoryRoute,
  permissionsRoute,
  settingsRoute,
  enginesRoute,
  helpRoute,
  nowRoute,
  signInRoute,
  resetPasswordRoute,
  archiveRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });
