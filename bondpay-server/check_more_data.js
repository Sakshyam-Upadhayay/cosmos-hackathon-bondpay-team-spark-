const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const userId = '0cb6dfb3-d69e-4c49-aad5-3e0c1198a30d';

async function run() {
  console.log(`Checking advanced records for User: ${userId}`);

  const { data: fraud, error: fraudErr } = await supabase
    .from('fraud_flags')
    .select('*')
    .eq('user_id', userId);

  if (fraudErr) {
    console.error('Fraud flags error:', fraudErr);
  } else {
    console.log(`\nFraud Flags count: ${fraud.length}`);
    console.log(JSON.stringify(fraud, null, 2));
  }

  const { data: pickups, error: pickupsErr } = await supabase
    .from('pending_pickups')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

  if (pickupsErr) {
    console.error('Pending pickups error:', pickupsErr);
  } else {
    console.log(`\nPending Pickups count: ${pickups.length}`);
    console.log(JSON.stringify(pickups, null, 2));
  }

  const { data: batches, error: batchesErr } = await supabase
    .from('sync_batches')
    .select('*')
    .eq('user_id', userId);

  if (batchesErr) {
    console.error('Sync batches error:', batchesErr);
  } else {
    console.log(`\nSync Batches count: ${batches.length}`);
    console.log(JSON.stringify(batches, null, 2));
  }
}

run();
