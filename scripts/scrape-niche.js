const NicheLoader = require('../config/niche-loader');

async function main() {
  const args = process.argv.slice(2);
  const nicheName = args[0];
  
  if (!nicheName) {
    console.log('Usage: node scripts/scrape-niche.js <niche-name>');
    console.log('Available niches:', NicheLoader.listAvailableNiches().join(', '));
    process.exit(1);
  }
  
  try {
    const niche = NicheLoader.loadNiche(nicheName);
    console.log(`🎯 Starting scraper for: ${niche.name}`);
    console.log(`📊 Database: ${niche.database.name}`);
    console.log(`🔍 Search terms: ${niche.search.terms.join(', ')}`);
    
    // Set environment variable for other scripts to use
    process.env.NICHE = nicheName;
    
    // Import and run the generic master scraper
    const GenericMasterScraper = require('./generic-master-scraper');
    const scraper = new GenericMasterScraper(niche);
    await scraper.init();
    await scraper.start();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = main;