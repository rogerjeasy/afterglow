import type { ReactNode } from 'react';
import { ChoiceChip, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import { LANGS, type Lang } from './catalogue';
import { getLang, setLang, useT } from './i18n';

export function LanguagePicker(): ReactNode {
  const t = useT();
  const current = getLang();
  return (
    <Section title={t('you.language')}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(Object.keys(LANGS) as Lang[]).map((l) => (
          <ChoiceChip
            key={l}
            label={LANGS[l]}
            selected={current === l}
            onClick={() => setLang(l)}
          />
        ))}
      </div>
      <span style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
        {t('you.languageNote')}
      </span>
    </Section>
  );
}
