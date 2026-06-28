const { Client } = require('pg');
require('dotenv').config();

async function test() {
  console.log('Connecting using DATABASE_URL:', process.env.DATABASE_URL);
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected successfully!');
    const res = await client.query('SELECT 1 + 1 AS result');
    console.log('Query result:', res.rows);
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
}

test();
