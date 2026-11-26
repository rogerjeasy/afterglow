import { guidance } from '@afterglow/core';
import { type ReactNode, useState } from 'react';
import { canSpeak, speak } from '../eyesfree/eyesfree';
import { Button, Fold, Notice, Section, TextField } from '../night-shell/controls';
import { token } from '../night-shell/theme';

/**
 * What to do (product description 7.18): ask a question or read the library. Answers
 * are library passages only, each with its source; everything works offline.
 */

function SourcesList({ guide }: { guide: guidance.Guide }): ReactNode {
  return (
    <ul
      style={{
        margin: 0,
        paddingLeft: 18,
        fontSize: 'var(--type-caption)',
        color: token('text.secondary'),
      }}
    >
      {guide.sources.map((s) => (
        <li key={`${s.publisher}${s.title}`}>
          {s.publisher}, “{s.title}”{' '}
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: token('text.secondary') }}
          >
            {new URL(s.url).hostname}
          </a>
        </li>
      ))}
    </ul>
  );
}

function spoken(guide: guidance.Guide, lines: readonly string[]): string {
  return `${guide.title}. ${lines.join(' ')} From ${guide.sources.map((s) => s.publisher).join(' and ')}.`;
}

function GuideBody({ guide }: { guide: guidance.Guide }): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ol
        style={{
          margin: 0,
          paddingLeft: 20,
          display: 'grid',
          gap: 6,
          color: token('text.primary'),
        }}
      >
        {guide.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {guide.danger?.length ? (
        <div role="note">
          <Notice>
            <span style={{ color: token('text.emphasis') }}>Get help now if: </span>
            {guide.danger.join(' ')}
          </Notice>
        </div>
      ) : null}
      <SourcesList guide={guide} />
      {canSpeak() ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            speak(spoken(guide, [...guide.steps, ...(guide.danger ?? [])]), {
              interrupt: true,
              force: true,
            })
          }
        >
          Read it to me
        </Button>
      ) : null}
    </div>
  );
}

function AnswerView({ r }: { r: guidance.AskResult }): ReactNode {
  if (r.kind === 'outside') {
    return (
      <Notice>
        That is outside what Afterglow’s library covers, so I will not guess. The guides below are
        what I can answer from.
      </Notice>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 14,
        borderRadius: 'var(--radius-tile)',
        background: token('surface.2'),
      }}
    >
      <span style={{ fontSize: 'var(--type-body)', color: token('text.emphasis') }}>
        {r.guide.title}
      </span>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          display: 'grid',
          gap: 6,
          color: token('text.primary'),
        }}
      >
        {r.passages.map((p) => (
          <li
            key={p.text}
            style={p.kind === 'danger' ? { color: token('text.emphasis') } : undefined}
          >
            {p.kind === 'danger' ? 'Get help now if: ' : ''}
            {p.text}
          </li>
        ))}
      </ul>
      <SourcesList guide={r.guide} />
      {canSpeak() ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            speak(
              spoken(
                r.guide,
                r.passages.map((p) => p.text),
              ),
              { interrupt: true, force: true },
            )
          }
        >
          Read it to me
        </Button>
      ) : null}
    </div>
  );
}

export function LibrarySection(): ReactNode {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<guidance.AskResult | null>(null);
  return (
    <Section title="What to do">
      <Fold label="Ask a question or read the guidance">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) setAnswer(guidance.ask(q));
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <TextField
              label="Ask Afterglow"
              value={q}
              onChange={setQ}
              hint="For example: can I still eat the chicken? Is my insulin still good?"
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!q.trim()}
              onClick={() => q.trim() && setAnswer(guidance.ask(q))}
            >
              Ask
            </Button>
          </form>
          {answer ? <AnswerView r={answer} /> : null}
          <span style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
            Answers come only from this library and its sources, on this phone, with no connection
            needed. It is guidance, not medical advice.
          </span>
          {guidance.LIBRARY.map((g) => (
            <Fold key={g.id} label={g.title}>
              <GuideBody guide={g} />
            </Fold>
          ))}
        </div>
      </Fold>
    </Section>
  );
}
