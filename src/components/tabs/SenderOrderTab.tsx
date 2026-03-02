import { useAuth } from '../../contexts/AuthContext';
import { SenderOrderView } from './order/SenderOrderView';
import { predictPrice, isRushHour } from '../../lib/pricePredictor';

export function SenderOrderTab() {
  const { profile } = useAuth();

  if (profile?.user_category === 'motari' || profile?.role === 'driver') {
    return null;
  }

  const getPriceFromAI = async (tripDetails: {
    dist_to_sender:   number;
    dist_to_receiver: number;
    is_rush_hour:     number;
    bad_weather:      number;
    bad_roads?:       number;
  }): Promise<number | null> => {
    try {
      const result = predictPrice({
        distDriverToSender:   tripDetails.dist_to_sender,
        distSenderToReceiver: tripDetails.dist_to_receiver,
        isRushHour:           tripDetails.is_rush_hour  === 1,
        badWeather:           tripDetails.bad_weather   === 1,
        badRoads:             (tripDetails.bad_roads ?? 0) === 1,
      });
      return result.totalFrw;
    } catch (error) {
      console.error('Price prediction failed:', error);
      return null;
    }
  };

  return (
    <div style={{
      padding: '20px',
      background: 'var(--bg)',
      minHeight: '100%',
      transition: 'background 0.25s',
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{
          fontWeight: 700, fontSize: '20px',
          color: 'var(--text)', letterSpacing: '-.02em', marginBottom: '4px',
        }}>
          📦 New Delivery
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
          Send a package anywhere in Kigali
        </p>
      </div>

      <SenderOrderView onPriceRequest={getPriceFromAI} />
    </div>
  );
}
