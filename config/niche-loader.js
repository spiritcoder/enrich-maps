const fs = require('fs');
const path = require('path');

function loadNicheConfig(nicheName) {
  try {
    const configPath = path.join(__dirname, '..', 'niches', `${nicheName}.json`);
    
    if (!fs.existsSync(configPath)) {
      // Return default config if niche file doesn't exist
      return {
        name: nicheName,
        database: {
          name: `${nicheName}_scraper`,
          collections: {
            raw: 'raw_data',
            processed: 'businesses',
            jobs: 'scraping_jobs'
          }
        },
        search: {
          terms: [`${nicheName} in`],
          maxPerSearch: 100
        },
        validation: {
          includeKeywords: [nicheName],
          excludeKeywords: [],
          minRating: 4.0,
          minReviews: 5,
          requireContact: true
        },
        categories: {
          'General': [nicheName]
        }
      };
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config;
  } catch (error) {
    console.error(`Error loading niche config for ${nicheName}:`, error.message);
    throw error;
  }
}

module.exports = { loadNicheConfig };