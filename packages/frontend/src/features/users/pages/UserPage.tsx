// Unified user page at /user?id=<publicCode>.
//
// One route serves both modes:
//   - id matches the viewer's publicCode (or is absent) → editable own profile
//   - id is someone else's → read-only public profile

import { useSearchParams } from 'react-router';

import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { OwnProfileEditor } from '@/features/users/components/OwnProfileEditor.js';
import { PublicProfileView } from '@/features/users/components/PublicProfileView.js';

export function UserPage() {
  const [searchParams] = useSearchParams();
  const idParam = searchParams.get('id')?.trim() ?? '';
  const viewer = useAuthStore((state) => state.user);
  const isOwn = !idParam || (viewer && idParam.toUpperCase() === viewer.publicCode.toUpperCase());

  return isOwn ? <OwnProfileEditor /> : <PublicProfileView code={idParam} />;
}
