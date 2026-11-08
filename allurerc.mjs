export default {
  name: 'ParcelQuote',
  output: 'allure/report',
  resultsDir: ['allure/results'],
  historyPath: 'allure/history.jsonl',
  plugins: {
    awesome: {
      options: {
        reportLanguage: 'ru',
        groupBy: ['epic', 'feature', 'story'],
        appendTitlePath: false,
      },
    },
  },
};
