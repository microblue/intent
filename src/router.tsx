import { Outlet, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { Layout } from '@/components/Layout';
import { TodayPage } from '@/pages/Today';
import { NewThingPage } from '@/pages/NewThing';
import { ThingPage } from '@/pages/ThingPage';
import { MePage } from '@/pages/Me';

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
  notFoundComponent: () => {
    throw redirect({ to: '/' });
  },
});

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: TodayPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/new', component: NewThingPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/t/$id', component: ThingPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/me', component: MePage }),
];

export const router = createRouter({ routeTree: rootRoute.addChildren(routes) });
