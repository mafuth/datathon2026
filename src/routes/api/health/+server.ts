import { json } from '@sveltejs/kit';

import { Island, Session, User } from '$lib/db/models';
import db from '$lib/server/database';

export async function GET() {
  try {
    // An empty SQLite file must not count as a working mobility installation.
    const islands = await db.select({ id: Island.id }).from(Island).limit(1);
    await db.select({ id: User.id }).from(User).limit(0);
    await db.select({ id: Session.id }).from(Session).limit(0);

    if (islands.length === 0) {
      throw new Error('The mobility dataset has not been installed');
    }

    return json(
      { status: 'ok', revision: process.env.DATATHON_REVISION ?? 'development' },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch {
    return json({ status: 'unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
