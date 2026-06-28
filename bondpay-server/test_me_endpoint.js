const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const userId = '0cb6dfb3-d69e-4c49-aad5-3e0c1198a30d'; // 98123456789

async function run() {
  console.log('Simulating /auth/me for user:', userId);

  try {
    // 1. Simulate refundExpiredBondsForUser
    console.log('Step 1: Simulating refundExpiredBondsForUser...');
    const now = new Date().toISOString();
    const { data: expiredBonds, error: selectErr } = await supabase
      .from('issued_bonds')
      .select('value')
      .eq('owner_id', userId)
      .eq('status', 'active')
      .lte('expires_at', now);

    if (selectErr) throw selectErr;

    const refundAmount = expiredBonds.reduce((sum, b) => sum + parseInt(b.value, 10), 0);
    console.log('Refund amount calculated:', refundAmount);

    if (refundAmount > 0) {
      console.log('Updating bonds to expired...');
      const { error: updateBondsErr } = await supabase
        .from('issued_bonds')
        .update({ status: 'expired' })
        .eq('owner_id', userId)
        .eq('status', 'active')
        .lte('expires_at', now);
      if (updateBondsErr) throw updateBondsErr;

      console.log('Updating user balance...');
      // We would update user balance here
    }

    // 2. Fetch user info
    console.log('Step 2: Fetching user info...');
    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('user_id, full_name, email, phone_number, online_balance, public_key')
      .eq('user_id', userId);

    if (userErr) throw userErr;

    if (users.length === 0) {
      console.log('User not found');
      return;
    }

    const user = users[0];
    console.log('User fetched successfully:', user);
    console.log('Parsed online balance:', parseInt(user.online_balance, 10));

  } catch (err) {
    console.error('Error during simulation:', err);
  }
}

run();
