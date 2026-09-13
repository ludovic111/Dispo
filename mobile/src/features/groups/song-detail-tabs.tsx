import { useTranslation } from 'react-i18next';

import { UnderlineTabs } from '@/components/ui/segmented-control';

export type SongDetailTab = 'info' | 'documents' | 'solos' | 'comments';

/** Onglets de la fiche morceau : le contrôle est le `UnderlineTabs` commun. */
export function SongDetailTabs({
  selected,
  onSelect,
}: {
  selected: SongDetailTab;
  onSelect: (tab: SongDetailTab) => void;
}) {
  const { t } = useTranslation();
  const options = [
    { label: t('Infos'), value: 'info' },
    { label: t('Partitions'), value: 'documents' },
    { label: t('Solos'), value: 'solos' },
    { label: t('Commentaires'), value: 'comments' },
  ] as const;
  return <UnderlineTabs onChange={onSelect} options={options} value={selected} />;
}
