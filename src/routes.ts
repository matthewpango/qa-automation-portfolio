import routes from './routes.json' with { type: 'json' };

export const cities = routes.cities;

export function getRoute(originCity: string, destinationCity: string) {
  const origin = cities.findIndex(city => city.id === originCity);
  const destination = cities.findIndex(city => city.id === destinationCity);
  if (origin < 0 || destination < 0 || origin === destination) return undefined;

  return {
    originCity, destinationCity,
    originCityName: cities[origin].name,
    destinationCityName: cities[destination].name,
    distanceKm: routes.distancesKm[origin][destination],
  };
}
