import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const runSchema = async () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString || connectionString.includes('your_password_here')) {
    console.error('Error: DATABASE_URL is missing or not updated in .env');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
  });

  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL database successfully.');

    const schemaPath = path.join(__dirname, '../src/database/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema...');
    await client.query(schemaSql);
    console.log('Schema executed successfully. Tables created.');
  } catch (error) {
    console.error('Error executing schema:', error);
  } finally {
    await client.end();
  }
};

runSchema();
