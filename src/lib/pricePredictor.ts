/**
 * Easy GO Price Predictor
 * Ported from price_predictor_model.pkl (RandomForest)
 * Model trained on 1000 trips, average error: 81.73 FRW
 *
 * Logic:
 *   harsh = is_rush_hour OR bad_weather OR bad_roads
 *   rate1 = 250 (harsh) or 150 (normal)  ← driver to sender per km
 *   rate2 = 350 (harsh) or 250 (normal)  ← sender to receiver per km
 *   total = (dist_driver_to_sender * rate1) + (dist_sender_to_receiver * rate2)
 */

export interface PredictInput {
  distDriverToSender:   number;
  distSenderToReceiver: number;
  isRushHour: boolean;
  badWeather: boolean;
  badRoads:   boolean;
}

export interface PredictResult {
  totalFrw: number;
  breakdown: {
    driverToSenderKm:   number;
    senderToReceiverKm: number;
    rate1PerKm: number;
    rate2PerKm: number;
    isHarsh:    boolean;
  };
}

export function predictPrice(input: PredictInput): PredictResult {
  const harsh = input.isRushHour || input.badWeather || input.badRoads;
  const rate1 = harsh ? 250 : 150;
  const rate2 = harsh ? 350 : 250;

  const totalFrw = Math.round(
    input.distDriverToSender   * rate1 +
    input.distSenderToReceiver * rate2
  );

  return {
    totalFrw,
    breakdown: {
      driverToSenderKm:   input.distDriverToSender,
      senderToReceiverKm: input.distSenderToReceiver,
      rate1PerKm: rate1,
      rate2PerKm: rate2,
      isHarsh:    harsh,
    },
  };
}

// Auto-detect Rwanda rush hours: 7–9 AM and 5–7 PM
export function isRushHour(): boolean {
  const h = new Date().getHours();
  return (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
}

// Straight-line distance between two GPS points (fallback when OSRM fails)
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
