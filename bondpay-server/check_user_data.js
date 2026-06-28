const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const userId = '0cb6dfb3-d69e-4c49-aad5-3e0c1198a30d'; // 98123456789

async function check() {
  console.log(`Checking database records for User: ${userId}`);

  // Fetch bonds
  const { data: bonds, error: bondsErr } = await supabase
    .from('issued_bonds')
    .select('*')
    .eq('owner_id', userId);

  if (bondsErr) {
    console.error('Bonds fetch error:', bondsErr);
  } else {
    console.log(`\nIssued Bonds count: ${bonds.length}`);
    console.log(JSON.stringify(bonds, null, 2));
  }

  // Fetch transactions
  const { data: txs, error: txsErr } = await supabase
    .from('transactions')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

  if (txsErr) {
    console.error('Transactions fetch error:', txsErr);
  } else {
    console.log(`\nTransactions count: ${txs.length}`);
    console.log(JSON.stringify(txs, null, 2));
  }

  // Fetch redemptions
  const { data: redemptions, error: redErr } = await supabase
    .from('bond_redemptions')
    .select('*')
    .eq('redeemed_by', userId);

  if (redErr) {
    console.error('Redemptions fetch error:', redErr);
  } else {
    console.log(`\nRedemptions count: ${redemptions.length}`);
    console.log(JSON.stringify(redemptions, null, 2));
  }
}

check();
