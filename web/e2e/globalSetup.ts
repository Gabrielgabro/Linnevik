import { e2eSql } from './db';

/** Stoppar körningen innan något skrivs, om databasen inte är en testgren. */
export default async function globalSetup() {
  const sql = e2eSql();
  await sql`select 1`;
}
