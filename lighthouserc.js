module.exports = {
  ci: {
    collect: {
      url: ['https://lucasacchiricciardi.github.io/the-linux-formula/'],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        skipAudits: [
          'best-practices-axe',
          'accessibility',
          'seo',
          'pwa-full'
        ]
      }
    },
    upload: {
      target: 'temporary-public-storage'
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.9 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 2000, label: 'FCP' }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500, label: 'LCP' }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1, label: 'CLS' }],
        'total-blocking-time': ['warn', { maxNumericValue: 300, label: 'TBT' }],
        'speed-index': ['warn', { maxNumericValue: 3000, label: 'SI' }]
      }
    }
  }
};