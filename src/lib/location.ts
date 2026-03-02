import { supabase } from './supabase';

let watchId: number | null = null;
let isTracking = false;

export function startLocationTracking(userId: string, isDriver: boolean) {
  if (!navigator.geolocation) {
    console.warn('GPS: geolocation not supported');
    return;
  }
  if (isTracking) return;
  isTracking = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      console.log(`GPS initial: ${pos.coords.latitude}, ${pos.coords.longitude} (±${Math.round(pos.coords.accuracy)}m)`);
      saveLocation(pos, userId, isDriver);
    },
    (err) => console.warn('GPS initial error:', err.message),
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
  );

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      console.log(`GPS high-accuracy: ${pos.coords.latitude}, ${pos.coords.longitude} (±${Math.round(pos.coords.accuracy)}m)`);
      saveLocation(pos, userId, isDriver);
    },
    (err) => console.warn('GPS high-accuracy error:', err.message),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );

  watchId = navigator.geolocation.watchPosition(
    (pos) => { saveLocation(pos, userId, isDriver); },
    (err) => console.warn('GPS watch error:', err.message),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
}

async function saveLocation(
  position: GeolocationPosition,
  userId: string,
  isDriver: boolean
) {
  const { latitude, longitude, accuracy, speed, heading } = position.coords;

  const inRwanda =
    latitude  >= -3.0 && latitude  <= -1.0 &&
    longitude >= 28.8 && longitude <= 30.9;

  if (!inRwanda) {
    console.warn(`GPS rejected — coordinates outside Rwanda: ${latitude}, ${longitude}.`);
    return;
  }

  const table  = isDriver ? 'drivers' : 'profiles';
  const column = isDriver ? 'user_id'  : 'id';

  const { error } = await supabase.from(table).update({
    latitude,
    longitude,
    accuracy:            accuracy ? Math.round(accuracy) : null,
    speed:               speed    ? Math.round(speed * 3.6) : 0,
    heading:             heading  || 0,
    location_updated_at: new Date().toISOString(),
  }).eq(column, userId);

  if (error) console.warn('GPS save error:', error.message);
}

export function stopLocationTracking() {
  if (!isTracking) return;
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  isTracking = false;
}
