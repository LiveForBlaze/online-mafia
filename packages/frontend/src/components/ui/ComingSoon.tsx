// Placeholder rendered by pages that are scaffolded but not implemented yet.
// Keeps the navigation honest — links go somewhere instead of 404'ing —
// while signalling that the section is under construction.

import { useTranslation } from 'react-i18next';

interface ComingSoonProps {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted">{t('common.soon')}</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-fg">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}
