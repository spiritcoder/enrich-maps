const GenericDatabase = require('../config/database-generic');
const NicheLoader = require('../config/niche-loader');
const XLSX = require('xlsx');
const path = require('path');

class GenericExporter {
  constructor(niche = null) {
    this.niche = niche || NicheLoader.getCurrentNiche();
    this.database = new GenericDatabase(this.niche);
    this.db = null;
  }

  async init() {
    await this.database.init();
    this.db = this.database.db;
  }

  async exportToExcel() {
    console.log(`📊 Starting Excel export for ${this.niche.name}...`);
    await this.init();

    const collections = this.niche.database.collections;
    const businesses = await this.db.collection(collections.processed).find({}).toArray();
    console.log(`Found ${businesses.length} ${this.niche.name} to export`);

    const exportData = businesses.map(business => ({
      Name: business.name,
      Address: business.address,
      Phone: business.phone,
      Website: business.website,
      Hours: business.hours,
      Rating: business.rating,
      Reviews: business.review_count,
      Type: business.type,
      Country: business.country,
      Subdivision: business.subdivision,
      Latitude: business.lat,
      Longitude: business.lng,
      Images: business.images ? business.images.join(', ') : '',
      About: business.about,
      Created: business.created_at
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, this.niche.name);

    const filename = `${this.niche.name}_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filepath = path.join(__dirname, '..', filename);
    
    XLSX.writeFile(workbook, filepath);
    
    console.log(`✅ Export completed: ${filename}`);
    console.log(`📁 File saved to: ${filepath}`);
    
    await this.database.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const nicheName = args[0];
  
  if (!nicheName) {
    console.log('Usage: node scripts/export-niche.js <niche-name>');
    console.log('Available niches:', NicheLoader.listAvailableNiches().join(', '));
    process.exit(1);
  }
  
  try {
    const niche = NicheLoader.loadNiche(nicheName);
    const exporter = new GenericExporter(niche);
    await exporter.exportToExcel();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = GenericExporter;