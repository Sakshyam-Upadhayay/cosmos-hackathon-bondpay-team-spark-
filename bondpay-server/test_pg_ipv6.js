const { Client } = require('pg');

async function test() {
  const connectionString = 'postgresql://postgres:Zenith%40803899@[2406:da18:167b:f901:1d17:6b04:3aeb:9d05]:5432/postgres';
  console.log('Connecting to IPv6 literal:', connectionString);
  const client = new Client({
    connectionString,
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
