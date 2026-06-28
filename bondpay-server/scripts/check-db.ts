import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const main = async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Successfully connected to Postgres!');

    // Get table structures
    const tables = ['users', 'issued_bonds', 'transactions', 'bond_redemptions'];
    for (const table of tables) {
      console.log(`\n--- Schema of table: ${table} ---`);
      const res = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = $1
      `, [table]);
      console.table(res.rows);
    }

    // Get count of rows
    for (const table of tables) {
      const countRes = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`Table ${table} has ${countRes.rows[0].count} rows.`);
    }

    // Print some issued bonds
    console.log('\n--- Sample issued bonds ---');
    const bondsRes = await client.query('SELECT * FROM issued_bonds LIMIT 5');
    console.log(JSON.stringify(bondsRes.rows, null, 2));

    // Print some transactions
    console.log('\n--- Sample transactions ---');
    const txRes = await client.query('SELECT * FROM transactions LIMIT 5');
    console.log(JSON.stringify(txRes.rows, null, 2));

  } catch (error) {
    console.error('Error querying DB:', error);
  } finally {
    await client.end();
  }
};

main();
