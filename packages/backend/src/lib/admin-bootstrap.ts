// Sync the admin roster from ENV (ADMIN_EMAILS) on backend startup.
//
// Source of truth = the env var. Anyone listed → isAdmin=true. Anyone NOT
// listed but currently isAdmin=true gets demoted. This makes removing an
// admin a one-line ops change (edit env, restart pod) instead of a DB write,
// and prevents an admin from secretly re-granting themselves through a
// compromised SQL connection — they'd lose the role on next boot.
//
// The bootstrap is fire-and-forget on startup. If the DB is briefly
// unavailable, the warning is logged and the server keeps running; the next
// restart retries.

import { prisma } from '../db/prisma.client.js';
import { env } from '../config/env.js';

import { logger } from './logger.js';

export async function syncAdminRoster(): Promise<void> {
  const emails = env.ADMIN_EMAILS;
  try {
    // Promote: everyone in the list (whose row exists) gets isAdmin=true.
    // We don't fail if some emails are absent — admins may sign up later.
    if (emails.length > 0) {
      const promoted = await prisma.user.updateMany({
        where: { email: { in: emails }, isAdmin: false },
        data: { isAdmin: true },
      });
      if (promoted.count > 0) {
        logger.info({ count: promoted.count, emails }, 'admin bootstrap: promoted');
      }
    }
    // Demote: anyone currently isAdmin=true but not in the list loses it.
    // Empty ADMIN_EMAILS means: there are no admins. That's a valid config.
    const demoted = await prisma.user.updateMany({
      where: { isAdmin: true, email: { notIn: emails.length > 0 ? emails : ['__none__'] } },
      data: { isAdmin: false },
    });
    if (demoted.count > 0) {
      logger.warn({ count: demoted.count }, 'admin bootstrap: demoted (no longer in ADMIN_EMAILS)');
    }
  } catch (err) {
    logger.warn({ err }, 'admin bootstrap: failed (will retry on next restart)');
  }
}
