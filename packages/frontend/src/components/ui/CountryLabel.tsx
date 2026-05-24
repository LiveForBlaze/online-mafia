// Локализованный лейбл страны: emoji-флаг + название. Для записей со
// «старым» произвольным значением (до миграции на ISO-коды) показываем
// сырое значение без флага.

import { useTranslation } from 'react-i18next';

import { getCountry } from '@mafia/shared';

interface CountryLabelProps {
  code: string | null | undefined;
  /** Скрыть флаг (например на узком списке игроков). */
  noFlag?: boolean;
  className?: string;
}

export function CountryLabel({ code, noFlag = false, className }: CountryLabelProps) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en';
  if (!code) return null;
  const country = getCountry(code);
  if (!country) return <span className={className}>{code}</span>;
  return (
    <span className={className}>
      {!noFlag && <span className="mr-1">{country.flag}</span>}
      {country[locale]}
    </span>
  );
}
