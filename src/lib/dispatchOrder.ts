// supabase/functions/dispatch-order/index.ts
//
// Triggered via Supabase Database Webhook on INSERT to "orders" table
// (status = 'pending') — OR called manually from your order-creation flow.
//
// Flow:
//  1. Find all on-duty, available drivers sorted by distance to sender
//  2. For each driver (one at a time):
//     a. Insert a row into order_dispatches (status = 'pending')
//     b. Wait up to 31 seconds for the driver to accept/decline/expire
//     c. If accepted → done. If declined/expired → try next driver.
//  3. If no driver accepts → mark order as 'no_driver'

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Haversine distance in km
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Poll order_dispatches row until status changes from 'pending' or timeout
async function waitForResponse(
  supabase: ReturnType<typeof createClient>,
  dispatchId: string,
  timeoutMs = 31_000
): Promise<'accepted' | 'declined' | 'expired' | 'timeout'> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from('order_dispatches')
      .select('status')
      .eq('id', dispatchId)
      .single();
    if (data?.status === 'accepted') return 'accepted';
    if (data?.status === 'declined') return 'declined';
    if (data?.status === 'expired')  return 'expired';
    await new Promise(r => setTimeout(r, 1_500)); // poll every 1.5s
  }
  // Timeout: mark it ourselves
  await supabase
    .from('order_dispatches')
    .update({ status: 'expired' })
    .eq('id', dispatchId);
  return 'timeout';
}

serve(async (req) => {
  try {
    const body = await req.json();
    // Support both webhook payload and direct call
    const order = body.record ?? body.order ?? body;

    if (!order?.id) {
      return new Response(JSON.stringify({ error: 'No order provided' }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET);

    // Re-fetch the order to make sure it's still pending
    const { data: freshOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order.id)
      .single();

    if (!freshOrder || freshOrder.status !== 'pending' || freshOrder.driver_id) {
      return new Response(JSON.stringify({ message: 'Order not eligible for dispatch' }), { status: 200 });
    }

    const senderLat = freshOrder.sender_latitude ?? null;
    const senderLon = freshOrder.sender_longitude ?? null;

    // Fetch all available, on-duty drivers
    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, user_id, latitude, longitude, plate_number')
      .eq('is_on_duty',   true)
      .eq('is_available', true)
      .not('latitude',  'is', null)
      .not('longitude', 'is', null);

    if (!drivers || drivers.length === 0) {
      console.log(`No drivers available for order ${order.id}`);
      return new Response(JSON.stringify({ message: 'No drivers available' }), { status: 200 });
    }

    // Sort by distance to sender (closest first)
    const sorted = (senderLat && senderLon)
      ? [...drivers].sort((a, b) =>
          distanceKm(senderLat, senderLon, a.latitude, a.longitude) -
          distanceKm(senderLat, senderLon, b.latitude, b.longitude)
        )
      : drivers;

    // Track which drivers already got a dispatch for this order (to avoid duplicates)
    const { data: existingDispatches } = await supabase
      .from('order_dispatches')
      .select('driver_user_id, status')
      .eq('order_id', order.id);

    const alreadyDispatched = new Set(
      (existingDispatches || []).map((d: any) => d.driver_user_id)
    );

    // Try each driver one at a time
    for (const driver of sorted) {
      // Skip if already dispatched to this driver
      if (alreadyDispatched.has(driver.user_id)) continue;

      // Check order is still unclaimed
      const { data: check } = await supabase
        .from('orders')
        .select('status, driver_id')
        .eq('id', order.id)
        .single();

      if (!check || check.status !== 'pending' || check.driver_id) {
        console.log(`Order ${order.id} already claimed — stopping dispatch`);
        break;
      }

      const expiresAt = new Date(Date.now() + 31_000).toISOString();

      const { data: dispatch, error: dispatchErr } = await supabase
        .from('order_dispatches')
        .insert({
          order_id:       order.id,
          driver_id:      driver.id,
          driver_user_id: driver.user_id,
          status:         'pending',
          expires_at:     expiresAt,
        })
        .select()
        .single();

      if (dispatchErr || !dispatch) {
        console.error('Failed to insert dispatch:', dispatchErr);
        continue;
      }

      console.log(`Dispatched order ${order.id} to driver ${driver.user_id}`);

      const result = await waitForResponse(supabase, dispatch.id, 31_000);
      console.log(`Driver ${driver.user_id} response: ${result}`);

      if (result === 'accepted') {
        return new Response(JSON.stringify({ success: true, driver_user_id: driver.user_id }), { status: 200 });
      }
      // declined / expired / timeout → try next driver
    }

    // All drivers tried — no one accepted
    console.log(`No driver accepted order ${order.id}`);
    // Optionally mark order as failed
    // await supabase.from('orders').update({ status: 'no_driver' }).eq('id', order.id);

    return new Response(JSON.stringify({ message: 'No driver accepted the order' }), { status: 200 });

  } catch (err) {
    console.error('dispatch-order error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});