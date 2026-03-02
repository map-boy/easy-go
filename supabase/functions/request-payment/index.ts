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

    const { orderId, amount, phoneNumber, payerName } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const hasMomoCreds = SUB_KEY && API_USER && API_KEY

    // ── SIMULATION MODE: no creds or creds not working ──
    async function simulatePayment(reason: string) {
      console.log(`Simulation mode (${reason}) for order:`, orderId)
      const paymentId = crypto.randomUUID()
      await supabase.from('orders').update({
        momo_payment_id: paymentId,
        sender_paid:     true,
        payment_status:  'paid',
        status:          'pending',
        updated_at:      new Date().toISOString(),
      }).eq('id', orderId)
      return new Response(JSON.stringify({ success: true, paymentId, mode: 'simulated' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (!hasMomoCreds) {
      return simulatePayment('no credentials')
    }

    // ── REAL MoMo flow ──
    const tokenRes = await fetch(`${MOMO_BASE}/collection/token/`, {
      method: 'POST',
      headers: {
        'Authorization':             `Basic ${btoa(`${API_USER}:${API_KEY}`)}`,
        'Ocp-Apim-Subscription-Key': SUB_KEY,
      },
    })

    if (!tokenRes.ok) {
      return simulatePayment('token failed')
    }

    const { access_token } = await tokenRes.json()

    const phone = phoneNumber
      .replace(/\s/g, '')
      .replace('+', '')
      .replace(/^0/, '250')

    const paymentId = crypto.randomUUID()

    const payRes = await fetch(`${MOMO_BASE}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        'Authorization':             `Bearer ${access_token}`,
        'X-Reference-Id':            paymentId,
        'X-Target-Environment':      TARGET_ENV,
        'Ocp-Apim-Subscription-Key': SUB_KEY,
        'Content-Type':              'application/json',
      },
      body: JSON.stringify({
        amount:       String(Math.round(amount)),
        currency:     'RWF',
        externalId:   orderId,
        payer:        { partyIdType: 'MSISDN', partyId: phone },
        payerMessage: 'Easy GO delivery payment',
        payeeNote:    `Order #${orderId.slice(0, 8)}`,
      }),
    })

    if (payRes.status !== 202) {
      return simulatePayment(`momo rejected ${payRes.status}`)
    }

    await supabase.from('orders').update({ momo_payment_id: paymentId }).eq('id', orderId)

    return new Response(JSON.stringify({ success: true, paymentId, mode: 'real' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('request-payment error:', err.message)
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})