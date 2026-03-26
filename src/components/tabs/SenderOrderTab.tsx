import { useAuth } from '../../contexts/AuthContext';
import { SenderOrderView } from './order/SenderOrderView';
import { predictPrice, isRushHour } from '../../lib/pricePredictor';

/**
 * SenderOrderTab Component
 *
 * Main container for the "New Delivery" flow for senders.
 * Handles high-level layout and provides price prediction logic
 * to the child SenderOrderView component.
 */
export function SenderOrderTab() {
  const { profile } = useAuth();

  // ✅ FIX: Guard against null profile (still loading from Supabase).
  // Previously this was missing — if profile was null when the tab mounted,
  // the motari check below would be skipped and SenderOrderView would render
  // with no profile context, causing a blank/black screen.
  if (!profile) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '200px',
        gap: '12px',
        padding: '40px 20px',
      }}>
        <div className="spinner" />
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Loading your profile…</p>
      </div>
    );
  }

  // Redirect or hide if the user is a driver/motari
  if (profile.user_category === 'motari' || profile.role === 'driver') {
    return null;
  }

  /**
   * getPriceFromAI
   * A wrapper function passed to SenderOrderView to calculate
   * delivery costs using the local price predictor library.
   */
  const getPriceFromAI = async (tripDetails: {
    dist_to_sender: number;
    dist_to_receiver: number;
    is_rush_hour: number;
    bad_weather: number;
    bad_roads?: number;
  }): Promise<number | null> => {
    try {
      const result = predictPrice({
        distDriverToSender: tripDetails.dist_to_sender,
        distSenderToReceiver: tripDetails.dist_to_receiver,
        isRushHour: tripDetails.is_rush_hour === 1,
        badWeather: tripDetails.bad_weather === 1,
        badRoads: (tripDetails.bad_roads ?? 0) === 1,
      });
      return result.totalFrw;
    } catch (error) {
      console.error("Price prediction failed:", error);
      return null;
    }
  };

  return (
    <div style={{
      padding: '20px',
      background: 'var(--bg)',
      minHeight: '100%',
      paddingBottom: '80px', // Extra space for mobile bottom navigation
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{
          fontWeight: 700,
          fontSize: '20px',
          color: 'var(--text)',
          marginBottom: '4px',
          fontFamily: 'Space Grotesk, sans-serif',
        }}>
          📦 New Delivery
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
          Send a package anywhere in Kigali
        </p>
      </div>

      {/* Main Order Form Component */}
      <SenderOrderView onPriceRequest={getPriceFromAI} />
    </div>
  );
}