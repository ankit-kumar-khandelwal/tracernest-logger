#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { SqlStore } from '../security/sql-store';
import { UserStore } from '../security/user-store';

function generateSecurePassword(): string {
  // Generates high-entropy secure temporary password e.g. TNL-9B4A!xQ7d#3f
  const part1 = randomBytes(3).toString('hex').toUpperCase();
  const part2 = randomBytes(3).toString('base64url');
  const part3 = randomBytes(2).toString('hex');
  return `TNL-${part1}!${part2}#${part3}`;
}

async function runReset() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('\n================================================================================');
    console.log('🪺  TracerNest-Logger Administrator Security Reset Utility');
    console.log('================================================================================');
    console.log(`
Usage:
  npx tracernest-reset-admin [options]

Options:
  --dir, -d <folder>      Folder directory where database files are stored (default: ./.tracernest)
  --sqlite, -s <path>     Path to the SQLite database file (default: auto-detected in ./.tracernest)
  --sql <path>            Path to the export SQL file (default: auto-detected in ./.tracernest)
  --prefix, -p <prefix>   Database table prefix (e.g. tracernest_ or logg_vault_)
  --dialect <dialect>     Database dialect: sqlite or mysql
  --help, -h              Display this help manual

Environment Variables:
  DATA_DIR                Directory where database and SQL files are stored
  SQLITE_PATH             Path to SQLite database file
  SQL_PATH                Path to synchronized SQL file
  TABLE_PREFIX            Table prefix (e.g. tracernest_ or logg_vault_)
  DB_DIALECT              Database dialect ('sqlite' or 'mysql')

Examples:
  npx tracernest-reset-admin
  npx tracernest-reset-admin --dir ./.tracernest
  npx tracernest-reset-admin --sqlite ./data/app-logs.sqlite
  npx tracernest-reset-admin --prefix logg_vault_
`);
    process.exit(0);
  }

  function getArg(flag: string, shortFlag?: string): string | undefined {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === flag || (shortFlag && args[i] === shortFlag)) {
        return args[i + 1];
      }
      if (args[i].startsWith(flag + '=')) {
        return args[i].slice(flag.length + 1);
      }
    }
    return undefined;
  }

  console.log('\n================================================================================');
  console.log('🪺  TracerNest-Logger Administrator Security Reset Utility');
  console.log('================================================================================');

  let dataDir =
    getArg('--dir', '-d') ||
    getArg('--folder') ||
    getArg('--storage-dir') ||
    process.env.DATA_DIR ||
    process.env.STORAGE_DIR ||
    (existsSync('./.tracernest') ? './.tracernest' : (existsSync('./tracernest') ? './tracernest' : undefined));

  let sqlitePath =
    getArg('--sqlite', '-s') ||
    process.env.SQLITE_PATH ||
    (dataDir && existsSync(`${dataDir}/tracernest-logger.sqlite`)
      ? `${dataDir}/tracernest-logger.sqlite`
      : existsSync('./.tracernest/tracernest-logger.sqlite')
      ? './.tracernest/tracernest-logger.sqlite'
      : existsSync('./tracernest/tracernest-logger.sqlite')
      ? './tracernest/tracernest-logger.sqlite'
      : existsSync('./tracernest-logger.sqlite')
      ? './tracernest-logger.sqlite'
      : existsSync('./tracenest.sqlite')
      ? './tracenest.sqlite'
      : existsSync('./logvault.sqlite')
      ? './logvault.sqlite'
      : (dataDir ? `${dataDir}/tracernest-logger.sqlite` : './.tracernest/tracernest-logger.sqlite'));

  let sqlPath =
    getArg('--sql') ||
    process.env.SQL_PATH ||
    (dataDir && existsSync(`${dataDir}/tracernest-logger.sql`)
      ? `${dataDir}/tracernest-logger.sql`
      : existsSync('./.tracernest/tracernest-logger.sql')
      ? './.tracernest/tracernest-logger.sql'
      : existsSync('./tracernest/tracernest-logger.sql')
      ? './tracernest/tracernest-logger.sql'
      : existsSync('./tracernest-logger.sql')
      ? './tracernest-logger.sql'
      : existsSync('./tracenest.sql')
      ? './tracenest.sql'
      : existsSync('./logvault.sql')
      ? './logvault.sql'
      : (dataDir ? `${dataDir}/tracernest-logger.sql` : './.tracernest/tracernest-logger.sql'));

  let tablePrefix = getArg('--prefix', '-p') || process.env.TABLE_PREFIX || undefined;
  let dialect: 'sqlite' | 'mysql' = (getArg('--dialect') as any) || (process.env.DB_DIALECT === 'mysql' ? 'mysql' : 'sqlite');

  const sqlStore = new SqlStore({
    dataDir,
    sqliteFilePath: sqlitePath,
    sqlFilePath: sqlPath,
    dialect,
    tablePrefix
  });

  const userStore = new UserStore(sqlStore);
  const tempPassword = generateSecurePassword();

  try {
    const adminUser = userStore.resetAdminTemporaryPassword(tempPassword);

    console.log(`\n  Target Username            : ${adminUser.username}`);
    console.log(`  Temporary One-Time Password: ${tempPassword}\n`);
    console.log('--------------------------------------------------------------------------------');
    console.log('  ⚠️  SECURITY POLICY ENFORCED:');
    console.log('  1. Web reset has been permanently disabled in the dashboard.');
    console.log('  2. This temporary password allows FIRST-TIME LOGIN ONLY.');
    console.log('  3. You will be prompted to set a permanent password immediately upon login.');
    console.log('  4. Sessions are tied to browser tabs: closing the tab will log out immediately.');
    console.log('================================================================================\n');
  } catch (err: any) {
    console.error('❌ Failed to reset administrator password:', err.message);
    process.exit(1);
  } finally {
    sqlStore.close();
  }
}

runReset();

