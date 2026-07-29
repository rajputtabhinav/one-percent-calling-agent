import { migrate } from '../src/db/migrate';
import { pool } from '../src/db/pool';

migrate()
  .then(async () => {
    await pool.end();
    console.log('migrations up to date');
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
