const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key is missing from .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Fetching users from Supabase API...');
  const { data, error } = await supabase
    .from('users')
    .select('user_id, phone_number, email, full_name, online_balance');

  if (error) {
    console.error('Supabase API Error:', error);
  } else {
    console.log('Users fetched successfully:', data);
  }
}

test();
