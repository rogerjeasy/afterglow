/**
 * Message catalogues (product description 7.21 "localisation", consoles LO-01).
 * English is the source and the fallback: a key missing in a language shows the
 * English text, never a blank or a key name. The other languages are drafts awaiting
 * review by native speakers, and the app says so where the language is chosen.
 */

export const LANGS = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
} as const;
export type Lang = keyof typeof LANGS;

const en = {
  'tab.hearth': 'Hearth',
  'tab.lantern': 'Lantern',
  'tab.seance': 'Séance',
  'tab.cold': 'Cold',
  'tab.plan': 'Plan',
  'hearth.powerOut': 'Power just went out',
  'hearth.powerBack': 'Power is back',
  'hearth.light': 'Use this phone as a light',
  'hearth.gridDown': 'GRID DOWN',
  'hearth.powerOn': 'POWER ON',
  'hearth.listening': 'LISTENING…',
  'light.close': 'Close',
  'light.dim': 'Dim',
  'light.medium': 'Medium',
  'light.bright': 'Bright',
  'light.beacon': 'Beacon',
  'light.sos': 'SOS',
  'light.white': 'White light',
  'you.language': 'Language',
  'you.languageNote':
    'Translations other than English are drafts awaiting review by native speakers. Where a phrase is not translated yet, it shows in English.',
} as const;
export type Key = keyof typeof en;

const fr: Partial<Record<Key, string>> = {
  'tab.hearth': 'Foyer',
  'tab.lantern': 'Lanterne',
  'tab.seance': 'Séance',
  'tab.cold': 'Froid',
  'tab.plan': 'Plan',
  'hearth.powerOut': 'Le courant vient de couper',
  'hearth.powerBack': 'Le courant est revenu',
  'hearth.light': 'Utiliser ce téléphone comme lampe',
  'hearth.gridDown': 'RÉSEAU COUPÉ',
  'hearth.powerOn': 'COURANT OK',
  'hearth.listening': 'À L’ÉCOUTE…',
  'light.close': 'Fermer',
  'light.dim': 'Faible',
  'light.medium': 'Moyen',
  'light.bright': 'Fort',
  'light.beacon': 'Balise',
  'light.sos': 'SOS',
  'light.white': 'Lumière blanche',
  'you.language': 'Langue',
  'you.languageNote':
    'Les traductions sont des brouillons en attente de relecture par des locuteurs natifs. Une phrase pas encore traduite s’affiche en anglais.',
};

const es: Partial<Record<Key, string>> = {
  'tab.hearth': 'Hogar',
  'tab.lantern': 'Linterna',
  'tab.seance': 'Sesión',
  'tab.cold': 'Frío',
  'tab.plan': 'Plan',
  'hearth.powerOut': 'Se acaba de ir la luz',
  'hearth.powerBack': 'Volvió la luz',
  'hearth.light': 'Usar este teléfono como linterna',
  'hearth.gridDown': 'SIN LUZ',
  'hearth.powerOn': 'CON LUZ',
  'hearth.listening': 'ESCUCHANDO…',
  'light.close': 'Cerrar',
  'light.dim': 'Tenue',
  'light.medium': 'Media',
  'light.bright': 'Fuerte',
  'light.beacon': 'Baliza',
  'light.sos': 'SOS',
  'light.white': 'Luz blanca',
  'you.language': 'Idioma',
  'you.languageNote':
    'Las traducciones son borradores pendientes de revisión por hablantes nativos. Lo que aún no está traducido aparece en inglés.',
};

const pt: Partial<Record<Key, string>> = {
  'tab.hearth': 'Lar',
  'tab.lantern': 'Lanterna',
  'tab.seance': 'Sessão',
  'tab.cold': 'Frio',
  'tab.plan': 'Plano',
  'hearth.powerOut': 'A luz acabou de cair',
  'hearth.powerBack': 'A luz voltou',
  'hearth.light': 'Usar este telefone como lanterna',
  'hearth.gridDown': 'SEM ENERGIA',
  'hearth.powerOn': 'COM ENERGIA',
  'hearth.listening': 'A OUVIR…',
  'light.close': 'Fechar',
  'light.dim': 'Fraca',
  'light.medium': 'Média',
  'light.bright': 'Forte',
  'light.beacon': 'Farol',
  'light.sos': 'SOS',
  'light.white': 'Luz branca',
  'you.language': 'Idioma',
  'you.languageNote':
    'As traduções são rascunhos à espera de revisão por falantes nativos. O que ainda não está traduzido aparece em inglês.',
};

export const CATALOGUES: Readonly<Record<Lang, Partial<Record<Key, string>>>> = { en, fr, es, pt };
export const ENGLISH = en;
