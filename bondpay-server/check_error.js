const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    console.log("Connecting to Database...");
    const res = await pool.query('SELECT user_id, phone_number, email, full_name, public_key, online_balance, active_device_id FROM users');
    console.log("Users in DB:");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error("Database query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
