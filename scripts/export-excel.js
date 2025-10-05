const Database = require('../config/database');
const XLSX = require('xlsx');
const path = require('path');

class ExcelExporter {
  constructor() {
    this.database = new Database();
    this.db = null;
  }

  async init() {
    await this.database.init();
    this.db = this.database.db;
  }

  async exportToExcel() {
    console.log('📊 Starting Excel export...');
    await this.init();

    const museums = await this.db.collection('museums').find({}).toArray();
    console.log(`Found ${museums.length} museums to export`);

    const exportData = museums.map(museum => ({
      Name: museum.name,
      Address: museum.address,
      Phone: museum.phone,
      Website: museum.website,
      Hours: museum.hours,
      Rating: museum.rating,
      Reviews: museum.review_count,
      Type: museum.type,
      Country: museum.country,
      Subdivision: museum.subdivision,
      Latitude: museum.lat,
      Longitude: museum.lng,
      Images: museum.images ? museum.images.join(', ') : '',
      About: museum.about,
      Created: museum.created_at
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Museums');

    const filename = `museums_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filepath = path.join(__dirname, '..', filename);
    
    XLSX.writeFile(workbook, filepath);
    
    console.log(`✅ Export completed: ${filename}`);
    console.log(`📁 File saved to: ${filepath}`);
    
    await this.database.close();
  }
}

async function main() {
  const exporter = new ExcelExporter();
  await exporter.exportToExcel();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ExcelExporter;