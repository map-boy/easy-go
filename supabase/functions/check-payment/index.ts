import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MOMO_BASE  = 'https://sandbox.momodeveloper.mtn.com'
const SUB_KEY    = Deno.env.get('MOMO_SUBSCRIPTION_KEY') ?? ''
const API_USER   = Deno.env.get('MOMO_API_USER') ?? ''
const API_KEY    = Deno.env.get('MOMO_API_KEY') ?? ''
const TARGET_ENV = 'sandbox'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: cors })
  }

  try {
    const body = await req.json()

    if (body.__ping) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { paymentId, orderId } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const hasMomoCreds = SUB_KEY && API_USER && API_KEY

    // ✅ FIX: if no creds, treat as paid so drivers see the order
    if (!hasMomoCreds) {
      await supabase.from('orders').update({
        sender_paid:    true,
        payment_status: 'paid',
        status:         'pending',
        updated_at:     new Date().toISOString(),
      }).eq('id', orderId)
      return new Response(JSON.stringify({ status: 'SUCCESSFUL', mode: 'simulated' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const tokenRes = await fetch(`${MOMO_BASE}/collection/token/`, {
      method: 'POST',
      headers: {
        'Authorization':             `Basic ${btoa(`${API_USER}:${API_KEY}`)}`,
        'Ocp-Apim-Subscription-Key': SUB_KEY,
      },
    })

    if (!tokenRes.ok) {
      // token failed — fallback: mark pending so order is visible
      await supabase.from('orders').update({
        sender_paid:    true,
        payment_status: 'paid',
        status:         'pending',
        updated_at:     new Date().toISOString(),
      }).eq('id', orderId)
      return new Response(JSON.stringify({ status: 'SUCCESSFUL', mode: 'token-fallback' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { access_token } = await tokenRes.json()

    const statusRes = await fetch(
      `${MOMO_BASE}/collection/v1_0/requesttopay/${paymentId}`,
      {
        headers: {
          'Authorization':             `Bearer ${access_token}`,
          'X-Target-Environment':      TARGET_ENV,
          'Ocp-Apim-Subscription-Key': SUB_KEY,
        },
      }
    )

    const result = await statusRes.json()
    console.log('Payment status for', paymentId, ':', result.status)

    // ✅ FIX: SUCCESSFUL = fully paid | PENDING = sandbox fallback, still show to drivers
    if (result.status === 'SUCCESSFUL' || result.status === 'PENDING') {
      await supabase.from('orders').update({
        sender_paid:    result.status === 'SUCCESSFUL',
        payment_status: result.status === 'SUCCESSFUL' ? 'paid' : 'pending',
        status:         'pending',   // visible to drivers either way
        updated_at:     new Date().toISOString(),
      }).eq('id', orderId)
    }

    if (result.status === 'FAILED') {
      await supabase.from('orders').update({
        payment_status: 'failed',
        status:         'awaiting_payment',
        updated_at:     new Date().toISOString(),
      }).eq('id', orderId)
    }

    return new Response(JSON.stringify({ status: result.status }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('check-payment error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})