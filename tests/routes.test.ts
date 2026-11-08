import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cities, getRoute } from '../src/routes.ts';

test('таблица содержит 10 уникальных городов и все 90 междугородних направлений', () => {
  assert.equal(cities.length, 10);
  assert.equal(new Set(cities.map(city => city.id)).size, 10);
  for (const origin of cities) {
    assert.equal(getRoute(origin.id, origin.id), undefined);
    for (const destination of cities) {
      if (origin.id === destination.id) continue;
      const route = getRoute(origin.id, destination.id);
      assert.ok(route);
      assert.equal(route.originCityName, origin.name);
      assert.equal(route.destinationCityName, destination.name);
      assert.ok(Number.isInteger(route.distanceKm) && route.distanceKm > 0);
      assert.equal(route.distanceKm, getRoute(destination.id, origin.id)?.distanceKm);
    }
  }
});

test('фиксированный маршрут и неизвестные коды городов', () => {
  assert.equal(getRoute('moscow', 'saint-petersburg')?.distanceKm, 700);
  assert.equal(getRoute('moscow', 'kazan')?.distanceKm, 820);
  assert.equal(getRoute('unknown', 'moscow'), undefined);
  assert.equal(getRoute('moscow', 'unknown'), undefined);
});
