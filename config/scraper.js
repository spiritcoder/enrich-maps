require('dotenv').config();

module.exports = {
  // Scraping configuration
  concurrent_scrapers: 5,
  delay_between_requests: { min: 12000, max: 25000 },
  max_retries: 3,
  timeout: 90000,
  
  // Google Maps selectors
  selectors: {
    // Search results page
    results: 'a.hfpxzc, a[data-cid], div[role="article"] a, .Nv2PK a',
    feed: 'div[role="feed"], div[role="main"] div[role="region"], .m6QErb[data-value="Search results"]',
    
    // Detail page selectors
    name: 'h1[data-attrid="title"], h1.DUwDvf, h1',
    category: 'button[jsaction*="category"], span.DkEaL, .YhemCb',
    rating: 'div.jANrlb > div.fontDisplayLarge, span.ceNzKf',
    reviews: 'div.jANrlb span[aria-label*="reviews"], .UY7F9, span.ceNzKf + span',
    phone: 'button[data-item-id^="phone"], a[href^="tel:"], button[aria-label*="phone"]',
    website: 'a[data-item-id^="authority"], button[data-item-id^="authority"]',
    address: 'button[data-item-id^="address"], button[aria-label*="address"]',
    images: 'button[data-photo-index] img, .ZKCDEc img, img[src*="googleusercontent"]'
  },

  // Primary search query
  primary_query: 'museums in {subdivision}, {country}',
  
  // Maximum museums to process per search
  max_museums_per_search: parseInt(process.env.MAX_MUSEUMS_PER_SEARCH) || 100,

  // Proxy settings
  proxy: {
    enabled: process.env.PROXY_STRING ? true : false,
    // Format: username:password:host:port
    proxyString: process.env.PROXY_STRING || ''
  }
};