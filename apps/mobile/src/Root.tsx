import { type ReactNode, Suspense, lazy, useEffect } from 'react';
import { useLocation } from './router';
import { Home } from './site/Home';
import { SiteLayout } from './site/SiteLayout';
import { FeaturesPage } from './site/pages/Features';
import { HowItWorksPage } from './site/pages/HowItWorks';
import { NotFoundPage } from './site/pages/NotFound';
import { OrganisationsPage } from './site/pages/Organisations';
import { PricingPage } from './site/pages/Pricing';
import { SciencePage } from './site/pages/Science';
import { LogoMark } from './ui/kit';

/**
 * The route table (web-experience WX-01). The public site and the sign-in pages load
 * at once; the product (`/app/...`) is its own chunk, so the homepage stays light.
 * The service worker precaches every chunk, so all of it still opens offline.
 */
const App = lazy(() => import('./App').then((m) => ({ default: m.App })));
// The sign-in pages carry the account client (Cognito SRP); the homepage never needs it.
const SignIn = lazy(() => import('./auth/SignIn').then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import('./auth/SignUp').then((m) => ({ default: m.SignUp })));

const SITE: Record<string, { page: () => ReactNode; title: string }> = {
  '/': { page: Home, title: 'Afterglow: the only app you can read when the grid dies' },
  '/features': { page: FeaturesPage, title: 'Features · Afterglow' },
  '/how-it-works': { page: HowItWorksPage, title: 'How it works · Afterglow' },
  '/science': { page: SciencePage, title: 'Science and privacy · Afterglow' },
  '/organisations': { page: OrganisationsPage, title: 'For organisations · Afterglow' },
  '/pricing': { page: PricingPage, title: 'Pricing · Afterglow' },
};

/** A black screen with the mark while the product's chunk loads; never a light flash. */
function Boot(): ReactNode {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg" aria-busy="true">
      <span className="animate-fade">
        <LogoMark size={56} />
      </span>
      <span className="sr-only">Opening Afterglow</span>
    </div>
  );
}

function useTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export function Root(): ReactNode {
  const { path } = useLocation();
  const inApp = path === '/app' || path.startsWith('/app/');
  const site = SITE[path];
  useTitle(
    inApp
      ? 'Afterglow'
      : path === '/signin'
        ? 'Sign in · Afterglow'
        : path === '/signup'
          ? 'Create your account · Afterglow'
          : (site?.title ?? 'Lost in the dark · Afterglow'),
  );

  if (inApp)
    return (
      <Suspense fallback={<Boot />}>
        <App />
      </Suspense>
    );
  if (path === '/signin' || path === '/signup')
    return <Suspense fallback={<Boot />}>{path === '/signin' ? <SignIn /> : <SignUp />}</Suspense>;
  const Page = site?.page ?? NotFoundPage;
  return (
    <SiteLayout>
      <Page />
    </SiteLayout>
  );
}
