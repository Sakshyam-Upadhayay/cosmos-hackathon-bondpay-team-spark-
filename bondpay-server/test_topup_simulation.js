const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const userId = '0cb6dfb3-d69e-4c49-aad5-3e0c1198a30d'; // 98123456789
const amount = 1000; // 10 NPR (1000 paisa)

async function test() {
  console.log(`Simulating topup of ${amount} paisa for user ${userId}...`);

  // Step 1: Update user online_balance
  const { data: userUpdate, error: userErr } = await supabase
    .from('users')
    .update({ online_balance: 559955 + amount }) // Simulate setting it directly first
    .eq('user_id', userId)
    .select('online_balance');

  if (userErr) {
    console.error('User update failed:', userErr);
    return;
  }
  console.log('User balance updated successfully:', userUpdate);

  // Step 2: Insert transaction record
  const txId = 'TOPUP-SIM-' + Math.random().toString(36).substring(2);
  const { data: txInsert, error: txErr } = await supabase
    .from('transactions')
    .insert([
      {
        tx_id: txId,
        tx_type: 'TOPUP',
        receiver_id: userId,
        total_amount: amount,
        tx_timestamp: new Date().toISOString(),
        status: 'accepted',
        is_offline: false
      }
    ])
    .select('*');

  if (txErr) {
    console.error('Transaction insert failed:', txErr);
    return;
  }
  console.log('Transaction record inserted successfully:', txInsert);

  // Roll back the change to keep DB clean
  await supabase
    .from('users')
    .update({ online_balance: 559955 })
    .eq('user_id', userId);
    
  await supabase
    .from('transactions')
    .delete()
    .eq('tx_id', txId);

  console.log('Rollback clean up completed.');
}

test();
