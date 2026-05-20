// Placeholder rendered by pages that are scaffolded but not implemented yet.
// Keeps the navigation honest — links go somewhere instead of 404'ing — while
// signalling that the section is under construction.

interface ComingSoonProps {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted">Скоро</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-fg">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
    </div>
  );
}
