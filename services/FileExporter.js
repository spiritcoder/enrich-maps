const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const { MongoClient } = require('mongodb');

class FileExporter {
  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    this.ensureUploadDir();
  }

  async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error('Error creating upload directory:', error);
    }
  }

  async generateExportFile(projectId, fields, keyword) {
    try {
      // Connect to project database
      const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
      await client.connect();
      const db = client.db(`saas_${projectId}`);
      const collection = db.collection('businesses'); // Default collection name

      // Get all processed businesses
      const businesses = await collection.find({}).toArray();
      
      if (businesses.length === 0) {
        await client.close();
        return null;
      }

      // Filter fields based on user selection
      const exportData = businesses.map(business => {
        const filtered = {};
        
        fields.forEach(field => {
          switch (field) {
            case 'name':
              filtered['Business Name'] = business.name;
              break;
            case 'phone':
              filtered['Phone'] = business.phone;
              break;
            case 'website':
              filtered['Website'] = business.website;
              break;
            case 'address':
              filtered['Address'] = business.address;
              break;
            case 'rating':
              filtered['Rating'] = business.rating;
              break;
            case 'reviews':
              filtered['Review Count'] = business.review_count;
              break;
            case 'hours':
              filtered['Hours'] = business.hours;
              break;
            case 'category':
              filtered['Category'] = business.categories ? business.categories.join(', ') : '';
              break;
            case 'coordinates':
              filtered['Latitude'] = business.lat;
              filtered['Longitude'] = business.lng;
              break;
            case 'country':
              filtered['Country'] = business.country;
              break;
            case 'subdivision':
              filtered['State/Province'] = business.subdivision;
              break;
            case 'images':
              filtered['Images'] = business.images ? business.images.join(', ') : '';
              break;
            case 'about':
              filtered['About'] = business.about;
              break;
          }
        });

        // Always include scraped date
        filtered['Scraped Date'] = business.created_at || business.scraped_at;
        
        return filtered;
      });

      await client.close();

      // Generate Excel file
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Businesses');

      // Auto-size columns
      const colWidths = [];
      const headers = Object.keys(exportData[0] || {});
      headers.forEach((header, i) => {
        const maxLength = Math.max(
          header.length,
          ...exportData.map(row => String(row[header] || '').length)
        );
        colWidths[i] = { width: Math.min(maxLength + 2, 50) };
      });
      worksheet['!cols'] = colWidths;

      // Save file
      const filename = `${keyword.replace(/\s+/g, '_')}_${projectId}_${Date.now()}.xlsx`;
      const filepath = path.join(this.uploadDir, filename);
      
      XLSX.writeFile(workbook, filepath);

      // Generate download URL (in production, use cloud storage URL)
      const downloadUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/downloads/${filename}`;
      
      console.log(`📁 Export file generated: ${filename} (${businesses.length} records)`);
      
      return downloadUrl;

    } catch (error) {
      console.error('Error generating export file:', error);
      throw error;
    }
  }

  async cleanupOldFiles() {
    try {
      const files = await fs.readdir(this.uploadDir);
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

      for (const file of files) {
        const filepath = path.join(this.uploadDir, file);
        const stats = await fs.stat(filepath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filepath);
          console.log(`🗑️ Cleaned up old file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old files:', error);
    }
  }
}

const fileExporter = new FileExporter();

// Clean up old files daily
setInterval(() => {
  fileExporter.cleanupOldFiles();
}, 24 * 60 * 60 * 1000);

module.exports = {
  generateExportFile: (projectId, fields, keyword) => 
    fileExporter.generateExportFile(projectId, fields, keyword)
};