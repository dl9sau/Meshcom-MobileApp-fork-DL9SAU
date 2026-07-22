// Distance in km between two lat/lon points.
// Same formula that was previously inlined in MessageHandler.calcDistance,
// extracted so map overlay and message handler share one implementation.
// Returns 0 if either point is unset (a lat or lon of exactly 0).
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {

    if (lat1 === 0 || lon1 === 0 || lat2 === 0 || lon2 === 0) return 0;

    const radlat1 = Math.PI * lat1 / 180;
    const radlat2 = Math.PI * lat2 / 180;
    const theta = lon1 - lon2;
    const radtheta = Math.PI * theta / 180;

    let distance = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
    if (distance > 1) {
        distance = 1;
    }
    distance = Math.acos(distance);
    distance = distance * 180 / Math.PI;
    distance = distance * 60 * 1.1515;
    distance = distance * 1.609344;

    return Math.round(distance * 100) / 100;
}
