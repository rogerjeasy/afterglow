import type { ReactNode } from 'react';
import { GhostGlyph } from '../../night-shell/costume';
import { useLocation } from '../../router';
import { CtaLink } from '../../ui/kit';

/** A page that does not exist (web-experience WX-13): a joke, then a clear next step. */
export function NotFoundPage(): ReactNode {
  const { path } = useLocation();
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="halo absolute top-[-20%] left-1/2 -z-10 h-[90%] w-[80%] -translate-x-1/2 opacity-80"
      />
      <div className="container-x flex min-h-[70dvh] flex-col items-center justify-center gap-7 py-20 text-center">
        <div className="animate-rise">
          <GhostGlyph opacity={0.35} size={104} />
        </div>
        <p className="clock m-0 animate-rise text-caption text-secondary [animation-delay:60ms] [overflow-wrap:anywhere]">
          404 · {path}
        </p>
        <h1 className="m-0 max-w-[16ch] animate-rise font-display text-h2 font-medium tracking-[-0.025em] text-emphasis [animation-delay:120ms]">
          This page lost power.
        </h1>
        <p className="m-0 max-w-[48ch] animate-rise text-lead text-secondary [animation-delay:180ms]">
          Wisp searched every room with a red light and found nothing but a very confused moth.
          Nothing here is coming back, so let’s go somewhere that is lit.
        </p>
        <div className="flex w-full animate-rise flex-col justify-center gap-3 [animation-delay:240ms] sm:w-auto sm:flex-row">
          <CtaLink to="/" icon="arrowRight">
            Back to the homepage
          </CtaLink>
          <CtaLink to="/app" variant="secondary">
            Open the app
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
