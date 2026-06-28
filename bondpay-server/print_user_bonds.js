const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const userId = '0cb6dfb3-d69e-4c49-aad5-3e0c1198a30d';

async function run() {
  const { data: bonds, error } = await supabase
    .from('issued_bonds')
    .select('*')
    .eq('owner_id', userId);

  if (error) {
    console.error('Error fetching bonds:', error);
    return;
  }

  console.log(`Total bonds for user: ${bonds.length}`);
  bonds.forEach(b => {
    console.log(`Bond ID: ${b.bond_id}, Value: ${b.value}, Status: ${b.status}, Expires At: ${b.expires_at}`);
  });
}

run();
