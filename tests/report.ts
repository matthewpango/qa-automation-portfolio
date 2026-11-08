import { test } from '@playwright/test';
import * as allure from 'allure-js-commons';

export async function reportScenario(feature: string, story: string) {
  await allure.epic('Междугородняя доставка');
  await allure.feature(feature);
  await allure.story(story);
  await allure.layer(test.info().project.name === 'api' ? 'API' : 'UI');
}
