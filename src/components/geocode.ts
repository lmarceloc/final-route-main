/**
 * Geocodes an address using the free Nominatim API.
 * @param address The address string to geocode.
 * @returns A promise that resolves to an object with lat and lng, or null if not found.
 * 
 * IMPORTANT: Nominatim has a usage policy that must be respected.
 * - Max 1 request per second.
 * - Provide a valid HTTP Referer or User-Agent.
 * - For heavy usage, consider hosting your own instance.
 * See: https://operations.osmfoundation.org/policies/nominatim/
 */
export const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error('Nominatim API request failed:', response.statusText);
      return null;
    }

    const data = await response.json();

    if (data && data.length > 0) {
      const { lat, lon } = data[0];
      return { lat: parseFloat(lat), lng: parseFloat(lon) };
    }

    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
};