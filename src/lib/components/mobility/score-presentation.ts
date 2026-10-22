import { themeColor } from '$lib/config/theme/theme-tokens';

export type ScoreMood = {
  min: number;
  label: string;
  src: string;
  stillSrc: string;
  color: string;
};

export type ScorePresentation = {
  percent: string;
  color: string;
  emojiSrc: string;
  emojiStillSrc: string;
  emojiLabel: string;
};

export type ScoreCardMetric = {
  key: string;
  label: string;
  value: number | null | undefined;
};

export type ScoreColorOptions = {
  higherIsWorse?: boolean;
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
    src: '/images/score-emojis/crying.webp',
    stillSrc: '/images/score-emojis/crying.png',
    color: themeColor('--mobility-map-score-0')
  },
  {
    min: 30,
    label: 'Worried face',
    src: '/images/score-emojis/worried.webp',
    stillSrc: '/images/score-emojis/worried.png',
    color: themeColor('--mobility-map-score-0')
  },
  {
    min: 50,
    label: 'Neutral face',
    src: '/images/score-emojis/neutral.webp',
    stillSrc: '/images/score-emojis/neutral.png',
    color: themeColor('--mobility-map-score-1')
  },
  {
    min: 65,
    label: 'Slightly smiling face',
    src: '/images/score-emojis/slight-smile.webp',
    stillSrc: '/images/score-emojis/slight-smile.png',
    color: themeColor('--mobility-map-score-2')
  },
  {
    min: 80,
    label: 'Smiling face',
    src: '/images/score-emojis/smiling.webp',
    stillSrc: '/images/score-emojis/smiling.png',
    color: themeColor('--mobility-map-score-3')
  },
  {
    min: 90,
    label: 'Beaming face with smiling eyes',
    src: '/images/score-emojis/beaming.webp',
    stillSrc: '/images/score-emojis/beaming.png',
    color: themeColor('--mobility-map-score-4')
  }
] as const satisfies readonly ScoreMood[];

export function isUnavailableScore(value: number | null | undefined): boolean {
  return typeof value !== 'number' || !Number.isFinite(value);
}

export function scorePercentage(value: number | null | undefined): string {
  return isUnavailableScore(value) ? 'N/A' : `${Math.round(value as number)}%`;
}

export function averagePercentage(values: readonly (number | null | undefined)[]): number | null {
  const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numericValues.length === 0) return null;
  return Math.max(0, Math.min(100, numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length));
}

export function scoreColor(value: number | null | undefined, options: ScoreColorOptions = {}): string {
  if (isUnavailableScore(value)) return themeColor('--mobility-chart-reference');

  const score = Math.max(0, Math.min(100, value ?? 0));
  const moodScore = options.higherIsWorse ? 100 - score : score;
  return [...SCORE_MOODS].reverse().find((candidate) => moodScore >= candidate.min)?.color ?? SCORE_MOODS[0].color;
}

export function scorePresentation(value: number | null | undefined, unavailableLabel: string): ScorePresentation {
  if (isUnavailableScore(value)) {
    return {
      percent: 'N/A',
      color: themeColor('--mobility-ink'),
      emojiSrc: '',
      emojiStillSrc: '',
      emojiLabel: unavailableLabel
    };
  }

  const score = Math.max(0, Math.min(100, value ?? 0));
  const mood = [...SCORE_MOODS].reverse().find((candidate) => score >= candidate.min) ?? SCORE_MOODS[0];
  return {
    percent: `${Math.round(score)}%`,
    color: mood.color,
    emojiSrc: mood.src,
    emojiStillSrc: mood.stillSrc,
    emojiLabel: mood.label
  };
}
