import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  gigMatchChips,
  gigMatchReasonLabel,
  topGigMatchReasons,
  type GigMatchChipOptions,
  type GigMatchInfo,
  type GigMatchPerspective,
} from './gig-model';

import { AppText } from '@/components/ui/app-text';
import { Tag } from '@/components/ui/tag';
import { shortProfileLevel } from '@/domain/profile';
import { useDispoTheme } from '@/theme/theme-context';
import { spacing } from '@/theme/tokens';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Adapte `t` de react-i18next à la signature simple des helpers purs. */
function translator(t: TFunction): GigMatchChipOptions['t'] {
  return (key, options) => (options ? t(key, options) : t(key));
}

export function formatGigMatchDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', weekday: 'short' })
    .format(date)
    .replace(/\.$/, '');
}

/**
 * Score de compatibilité numérique. `ink` fixe la couleur du chiffre sur un billet papier.
 */
export function GigMatchScore({ ink, score }: { ink?: string | undefined; score: number }) {
  const { palette } = useDispoTheme();
  const { t } = useTranslation();
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  return (
    <View style={styles.score}>
      <AppText
        color={ink ?? palette.text}
        accessibilityLabel={t('Match {{score}} %', { score: clamped })}
        style={styles.scoreValue}
        variant="mono"
        weight="semibold"
      >
        {clamped} %
      </AppText>
    </View>
  );
}

/**
 * Toutes les puces d'un match (instrument, niveau, date, créneau, absence,
 * école, styles, morceaux, distance, relation).
 */
export function GigMatchChips({
  gigDate,
  levelWanted,
  match,
  musicianLevel,
  perspective,
  schoolWanted,
}: {
  gigDate: string;
  levelWanted: boolean;
  match: GigMatchInfo;
  musicianLevel?: string | null | undefined;
  perspective: GigMatchPerspective;
  schoolWanted: boolean;
}) {
  const { palette } = useDispoTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'fr';
  const levelLabel = musicianLevel ? shortProfileLevel(musicianLevel) : null;
  const chips = gigMatchChips(match, {
    dateLabel: formatGigMatchDate(gigDate, locale),
    levelLabel,
    levelWanted,
    perspective,
    schoolWanted,
    t: translator(t),
  });
  const colors = { info: palette.bronze, ok: palette.jam, warn: palette.signal } as const;
  return (
    <View style={styles.chips}>
      {chips.map((chip) => (
        <Tag
          color={colors[chip.tone]}
          key={chip.key}
          label={chip.label}
          {...(chip.icon ? { icon: chip.icon as IoniconName } : {})}
        />
      ))}
    </View>
  );
}

/**
 * Sur une carte du fil : « 82 % », puis les raisons
 * (« Dispo ce jour-là · Ami·e »). `color` teinte les raisons, `ink` le chiffre.
 */
export function GigMatchSummaryLine({
  color,
  ink,
  match,
}: {
  color: string;
  ink?: string | undefined;
  match: GigMatchInfo;
}) {
  const { t } = useTranslation();
  const reasons = topGigMatchReasons(match).map((reason) =>
    gigMatchReasonLabel(reason, translator(t)),
  );
  return (
    <View style={styles.summary}>
      <View>
        <GigMatchScore ink={ink} score={match.score} />
      </View>
      {reasons.length > 0 ? (
        <AppText color={color} numberOfLines={1} style={styles.summaryText} variant="caption">
          {reasons.join(' · ')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  score: { alignItems: 'flex-end' },
  scoreValue: { textAlign: 'right' },
  summary: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryText: { flexShrink: 1 },
});
