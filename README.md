# 🚀 Easy GO - Delivery App

**Your Delivery is Our Duty** 🇷🇼

A full-stack delivery platform for Kigali, Rwanda — connecting senders, receivers, and motari drivers.

---

## ✨ Features

- 🏍️ **3 Roles**: Sender, Receiver, Motari (Driver)
- 🗺️ **Live GPS Tracking** with Leaflet maps & OSRM routing
- 💳 **MTN MoMo & Airtel Money** payments via Supabase Edge Functions
- 🤖 **AI Price Prediction** (RandomForest ML model)
- 📱 **Real-time notifications** via Supabase Realtime
- 🌙 **Dark/Light theme**

---

## ⚡ Quick Setup

### 1. Clone & install

```bash
git clone https://github.com/map-boy/easy-go.git
cd easy-go
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=https://oqlrpjoentqxlfotmyat.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Run locally

```bash
npm run dev
```

Open http://localhost:5173

---

## 🚀 Deploy to Vercel

```bash
npx vercel --prod
```

Or connect your GitHub repo to Vercel for auto-deploys on every push.

---

## 📁 Project Structure

```
src/
├── App.tsx                          # Root component
├── index.css                        # Global styles + CSS variables
├── main.tsx                         # Entry point
├── contexts/
│   ├── AuthContext.tsx              # Auth state (Supabase)
│   └── ThemeContext.tsx             # Dark/light theme
├── lib/
│   ├── supabase.ts                  # Supabase client
│   ├── notifications.ts             # Push notification helpers
│   ├── pricePredictor.ts            # ML price model (RandomForest)
│   └── location.ts                 # GPS tracking
└── components/
    ├── Welcome.tsx                  # Landing screen
    ├── Auth.tsx                     # Login / Register
    ├── Dashboard.tsx                # Main shell + bottom nav
    ├── NotificationBell.tsx         # Real-time notifications
    └── tabs/
        ├── HomeTab.tsx              # Live map + KPI cards
        ├── SenderOrderTab.tsx       # Send package flow
        ├── ReceiverTab.tsx          # Receiver parcel tracking + MoMo pay
        ├── DriverTab.tsx            # Driver orders + duty toggle
        ├── TrackTab.tsx             # Order tracking map
        ├── ProfileTab.tsx           # Profile + settings
        └── order/
            └── SenderOrderView.tsx  # Full order form with MoMo payment
```

---

## 🗄️ Database (Supabase)

Tables: `profiles`, `drivers`, `orders`, `notifications`

Key columns on `orders`:
- `status`: awaiting_payment → pending → accepted → in_transit → delivered
- `sender_paid`: boolean
- `payer_name`, `payer_number`: MoMo payer details
- `momo_payment_id`, `payment_status`: MoMo transaction tracking

---

## 🔧 Edge Functions

Deploy these Supabase Edge Functions:
- `request-payment` — initiates MTN MoMo collection
- `check-payment` — polls payment status

```bash
supabase functions deploy request-payment --no-verify-jwt
supabase functions deploy check-payment --no-verify-jwt
```

---

## 📞 Support

- Email: wandaatech@gmail.com
- Phone: +250 780 867 473
- Available 24/7
