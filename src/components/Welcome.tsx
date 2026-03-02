import { Bike, Zap, Shield, Clock } from 'lucide-react';

interface WelcomeProps {
  onGetStarted: () => void;
}

export function Welcome({ onGetStarted }: WelcomeProps) {
  const features = [
    { icon: Zap,    label: 'Fast Delivery',    desc: 'Same-day delivery across Kigali', color: '#f5c842' },
    { icon: Shield, label: 'Secure Payments',  desc: 'Pay only after motor accepts',    color: '#22c55e' },
    { icon: Clock,  label: '24/7 Service',     desc: 'Available day and night',         color: '#3b82f6' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080c14',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position:'absolute', top:'-80px', right:'-80px', width:'320px', height:'320px',
        background:'radial-gradient(circle, rgba(245,200,66,0.07) 0%, transparent 70%)', borderRadius:'50%' }} />
      <div style={{ position:'absolute', bottom:'-60px', left:'-60px', width:'260px', height:'260px',
        background:'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)', borderRadius:'50%' }} />

      <div style={{ maxWidth:'420px', width:'100%', position:'relative', zIndex:1 }} className="fade-in">
        <div style={{ textAlign:'center', marginBottom:'40px' }}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:'80px', height:'80px',
            background:'linear-gradient(135deg,#f5c842,#e8b820)',
            borderRadius:'24px', marginBottom:'20px',
            boxShadow:'0 8px 32px rgba(245,200,66,0.3)',
          }}>
            <Bike size={36} color="#080c14" />
          </div>
          <h1 style={{ fontFamily:'Space Grotesk, sans-serif', fontSize:'36px', fontWeight:'800',
            color:'#e8edf5', margin:'0 0 8px', letterSpacing:'-0.02em' }}>
            Easy GO
          </h1>
          <p style={{ color:'#5a6a80', fontSize:'15px', margin:0 }}>
            Your delivery is our duty
          </p>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'32px' }}>
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} style={{
                display:'flex', alignItems:'center', gap:'14px',
                background:'rgba(14,20,32,0.8)', border:'1px solid #1e2a3a',
                borderRadius:'14px', padding:'14px 16px',
              }}>
                <div style={{
                  width:'40px', height:'40px', borderRadius:'12px',
                  background:`${f.color}18`,
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                }}>
                  <Icon size={20} color={f.color} />
                </div>
                <div>
                  <p style={{ fontFamily:'Space Grotesk, sans-serif', fontWeight:'700', fontSize:'14px',
                    color:'#e8edf5', margin:'0 0 2px' }}>{f.label}</p>
                  <p style={{ color:'#5a6a80', fontSize:'12px', margin:0 }}>{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <button className="eg-btn-primary" onClick={onGetStarted}>
          Get Started →
        </button>
        <p style={{ textAlign:'center', color:'#5a6a80', fontSize:'12px', marginTop:'14px' }}>
          Trusted by riders across Rwanda 🇷🇼
        </p>
      </div>
    </div>
  );
}
