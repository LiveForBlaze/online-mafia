import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ui/ComingSoon.js';

export function RulesPage() {
  const { t } = useTranslation();
  return (
    <ComingSoon title={t('coming_soon.rules_title')} description={t('coming_soon.rules_body')} />
  );
}
