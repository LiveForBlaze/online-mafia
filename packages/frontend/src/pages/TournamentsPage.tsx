import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ui/ComingSoon.js';

export function TournamentsPage() {
  const { t } = useTranslation();
  return (
    <ComingSoon
      title={t('coming_soon.tournaments_title')}
      description={t('coming_soon.tournaments_body')}
    />
  );
}
