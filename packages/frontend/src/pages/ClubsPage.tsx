import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ui/ComingSoon.js';

export function ClubsPage() {
  const { t } = useTranslation();
  return (
    <ComingSoon title={t('coming_soon.clubs_title')} description={t('coming_soon.clubs_body')} />
  );
}
