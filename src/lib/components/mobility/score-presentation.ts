export type ScoreMood = {
  min: number;
  label: string;
  src: string;
  color: string;
};

export type ScorePresentation = {
  percent: string;
  color: string;
  emojiSrc: string;
  emojiLabel: string;
};

export type ScoreCardMetric = {
  key: string;
  label: string;
  value: number | null | undefined;
};

export type NoDataCopy = {
  title: string;
  description: string;
  emojiSrc: string;
  emojiAlt: string;
};

export const ANIMATED_FLUENT_EMOJI_BASE_URL =
  'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/55e1dceff489121c3f7c7a7ec4f4d401d2cbd53e/Emojis/Smilies/';

export const SCORE_NO_DATA_MESSAGES: readonly NoDataCopy[] = [
  {
    title: 'The score is hiding under the sofa.',
    description: 'We asked the numbers to come out. They said they were busy being unavailable.',
    emojiSrc: `${ANIMATED_FLUENT_EMOJI_BASE_URL}Pleading%20Face.png`,
    emojiAlt: 'Pleading face'
  },
  {
    title: 'The spreadsheet has chosen silence.',
    description: 'No reliable score made it through the data door today.',
    emojiSrc: `${ANIMATED_FLUENT_EMOJI_BASE_URL}Zzz.png`,
    emojiAlt: 'Zzz face'
  },
  {
    title: 'Our score went on a tiny holiday.',
    description: 'We packed a calculator, but there was no number to calculate.',
    emojiSrc: `${ANIMATED_FLUENT_EMOJI_BASE_URL}Face%20with%20Monocle.png`,
    emojiAlt: 'Face with monocle'
  }
];

export const SCORE_MOODS = [
  {
    min: 0,
    label: 'Loudly crying face',
    src: `${ANIMATED_FLUENT_EMOJI_BASE_URL}Loudly%20Crying%20Face.png`,
    color: '#d73027'
  },
  {
    min: 20,
    label: 'Worried face',
    src: `${ANIMATED_FLUENT_EMOJI_BASE_URL}Worried%20Face.png`,
    color: '#fc8d59'
  },
  {
    min: 40,
    label: 'Slightly smiling face',
    src: `${ANIMATED_FLUENT_EMOJI_BASE_URL}Slightly%20Smiling%20Face.png`,
    color: '#d6b83f'
  },
  {
    min: 60,
    label: 'Smiling face',
    src: `${ANIMATED_FLUENT_EMOJI_BASE_URL}Smiling%20Face.png`,
    color: '#77a85d'
  },
  {
    min: 80,
    label: 'Beaming face with smiling eyes',
    src: `${ANIMATED_FLUENT_EMOJI_BASE_URL}Beaming%20Face%20with%20Smiling%20Eyes.png`,
    color: '#1a9850'
  }
] as const satisfies readonly ScoreMood[];

export function isUnavailableScore(value: number | null | undefined): boolean {
  return typeof value !== 'number' || !Number.isFinite(value);
}

export function scorePercentage(value: number | null | undefined): string {
  return isUnavailableScore(value) ? 'N/A' : `${Math.round(value as number)}%`;
}

export function scorePresentation(value: number | null | undefined, unavailableLabel: string): ScorePresentation {
  if (isUnavailableScore(value)) {
    return { percent: 'N/A', color: '#09090b', emojiSrc: '', emojiLabel: unavailableLabel };
  }

  const score = Math.max(0, Math.min(100, value ?? 0));
  const mood = [...SCORE_MOODS].reverse().find((candidate) => score >= candidate.min) ?? SCORE_MOODS[0];
  return { percent: `${Math.round(score)}%`, color: mood.color, emojiSrc: mood.src, emojiLabel: mood.label };
}
