import { seedDatabaseIfEmpty } from './seed.ts';

const result = seedDatabaseIfEmpty(false);
console.log(`[SmartCred Seed] ${result.message}`);
