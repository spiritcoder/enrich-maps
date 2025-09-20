require('dotenv').config();

module.exports = {
  // Scraping configuration
  concurrent_scrapers: 5,
  delay_between_requests: { min: 5000, max: 15000 },
  max_retries: 3,
  timeout: 30000,
  
  // Google Maps selectors
  selectors: {
    results: '[role="article"], .Nv2PK, [data-result-index]',
    name: '.qBF1Pd, .fontHeadlineSmall, h3',
    address: '.W4Efsd:nth-child(2), .W4Efsd .fontBodyMedium, [data-value="Address"]',
    phone: '[data-value="Phone"], .UsdlK',
    website: '[data-value="Website"] a, .CsEnBe a',
    hours: '[data-value="Hours"], .t39EBf',
    rating: '.MW4etd, .fontDisplayLarge',
    reviews: '.UY7F9, .fontBodyMedium span',
    images: 'img[src*="googleusercontent"], img[data-src*="googleusercontent"]'
  },

  // Search queries by priority
  queries: {
    primary: [
      'museums in {subdivision}, {country}',
      'art galleries {subdivision} {country}',
      'history museums {subdivision}',
      'science museums {subdivision}'
    ],
    secondary: [
      'cultural centers {subdivision}',
      'exhibition halls {subdivision}',
      'heritage sites {subdivision}'
    ]
  },

  // Country processing priority
  priority_countries: [
    'United States', 'United Kingdom', 'Germany', 'France', 'Canada',
    'Italy', 'Spain', 'Netherlands', 'Australia', 'Japan'
  ],

  // Proxy settings
  proxy: {
    enabled: process.env.PROXY_STRING ? true : false,
    // Format: username:password:host:port
    proxyString: process.env.PROXY_STRING || ''
  }
};