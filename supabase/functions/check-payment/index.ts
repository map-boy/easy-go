import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── This edge function now just proxies to Noor ───────────────────────────
// Noor handles MTN MoMo and updates the order in Supabase automatically
// Easy GO just needs to poll this for the status

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: cors })
  }

  try {
    const body = await req.json()

    // Ping check
    if (body.__ping) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { transactionId } = body

    if (!transactionId) {
      return new Response(JSON.stringify({ error: 'transactionId is required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const NOOR_URL = Deno.env.get('NOOR_URL') || 'http://localhost:3001'
    const NOOR_KEY = Deno.env.get('NOOR_API_KEY') || ''

    // Ask Noor for the payment status
    const res = await fetch(`${NOOR_URL}/payments/status/${transactionId}`, {
      headers: { 'x-api-key': NOOR_KEY },
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ status: 'PENDING' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()

    return new Response(JSON.stringify({ status: data.status }), {
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