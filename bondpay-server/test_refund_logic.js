const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const userId = '0cb6dfb3-d69e-4c49-aad5-3e0c1198a30d';

async function run() {
  try {
    const now = new Date().toISOString();
    console.log('Current time (ISO):', now);
    
    console.log('1. Checking active expired bonds...');
    const { data: expiredBonds, error: selectErr } = await supabase
      .from('issued_bonds')
      .select('*')
      .eq('owner_id', userId)
      .eq('status', 'active')
      .lte('expires_at', now);

    if (selectErr) {
      console.error('Error selecting expired bonds:', selectErr);
      return;
    }

    console.log('Expired bonds count:', expiredBonds.length);
    console.log('Expired bonds:', expiredBonds);
    
    const totalExpired = expiredBonds.reduce((sum, b) => sum + parseInt(b.value, 10), 0);
    console.log('Total expired amount to refund:', totalExpired);
    
  } catch (err) {
    console.error('Caught error:', err);
  }
}

run();
