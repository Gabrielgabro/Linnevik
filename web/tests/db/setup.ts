import { inject } from 'vitest';

// getDb() läser DATABASE_URL första gången den anropas, så variabeln måste
// vara satt innan någon testfil importerar appens moduler.
process.env.DATABASE_URL = inject('databaseUrl');
