const XLSX = require('xlsx');
const MapsOnlyLookup = require('../scrapers/MapsOnlyLookup');
const path = require('path');
const fs = require('fs');

class ExcelLookupService {
  constructor() {
    this.lookup = new MapsOnlyLookup();
  }

  async processExcelFile(filePath, progressCallback, projectId = null, db = null) {
    try {
      await this.lookup.initialize();
      
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      console.log(`📊 Processing ${data.length} businesses from Excel`);

      const results = [];
      let processedCount = 0;
      let foundCount = 0;
      let startIndex = 0;
      
      // PHASE 2: Check for existing checkpoint to resume processing
      if (projectId) {
        const Project = require('../api/models/Project');
        const projectModel = new Project();
        await projectModel.init();
        
        const checkpoint = await projectModel.getCheckpoint(projectId);
        if (checkpoint) {
          startIndex = checkpoint.last_processed_row + 1;
          processedCount = checkpoint.processed_count || 0;
          foundCount = checkpoint.found_count || 0;
          console.log(`🔄 Resuming from checkpoint: row ${startIndex}, processed: ${processedCount}, found: ${foundCount}`);
        }
        
        await projectModel.close();
      }
      
      // Get existing businesses to avoid duplicates
      const existingBusinesses = new Set();
      if (db && projectId) {
        const businessCollection = db.collection('businesses');
        const existing = await businessCollection.find(
          { project_id: projectId }, 
          { projection: { original_name: 1 } }
        ).toArray();
        existing.forEach(b => existingBusinesses.add(b.original_name?.toLowerCase()));
        console.log(`📋 Found ${existing.length} existing businesses, will skip duplicates`);
      }
      
      for (let i = startIndex; i < data.length; i++) {
        const row = data[i];
        const businessName = this.extractBusinessName(row);
        const subdivision = this.extractSubdivision(row);
        const country = this.extractCountry(row);
        const location = subdivision; // Use subdivision as primary location
        
        if (!businessName) {
          console.log(`⚠️ Skipping row ${i + 1}: No business name found`);
          processedCount++;
          continue;
        }

        // Skip if already processed (duplicate prevention)
        if (existingBusinesses.has(businessName.toLowerCase())) {
          console.log(`↻ Skipping ${businessName}: Already processed`);
          processedCount++;
          continue;
        }

        const locationInfo = [subdivision, country].filter(Boolean).join(', ');
        console.log(`\n🔍 Processing ${i + 1}/${data.length}: ${businessName}${locationInfo ? ` in ${locationInfo}` : ''}`);
        
        // Single lookup attempt - MapsOnlyLookup handles its own retry strategy with 4 queries
        let result = null;
        try {
          result = await this.lookup.lookupBusiness(businessName, subdivision, country);
        } catch (lookupError) {
          console.log(`⚠️ Lookup failed for ${businessName}: ${lookupError.message}`);
          result = null;
        }
        
        let enrichedRow;
        // Fix success detection logic
        const hasValidData = result && (
          result.confidence > 0 || 
          result.phone || 
          result.website || 
          result.email || 
          result.address ||
          (result.categories && result.categories.length > 0)
        );
        
        if (hasValidData) {
          // Ensure location context is set
          if (!result.subdivision && subdivision) {
            result.subdivision = subdivision;
          }
          if (!result.country && country) {
            result.country = country;
          }
          
          enrichedRow = {
            ...row,
            ...result,
            original_name: businessName,
            lookup_success: true,
            processed_at: new Date().toISOString(),
            project_id: projectId,
            created_at: new Date(),
            row_index: i
          };
          
          foundCount++;
          const foundLocation = [result.subdivision || subdivision, result.country || country].filter(Boolean).join(', ');
          console.log(`✅ Found: ${result.name} in ${foundLocation || 'unknown location'} (confidence: ${result.confidence?.toFixed(2) || 0})`);
        } else {
          enrichedRow = {
            ...row,
            original_name: businessName,
            lookup_success: false,
            processed_at: new Date().toISOString(),
            project_id: projectId,
            created_at: new Date(),
            row_index: i,
            subdivision: subdivision,
            country: country
          };
          
          const searchLocation = [subdivision, country].filter(Boolean).join(', ');
          console.log(`❌ Not found: ${businessName} in ${searchLocation || 'unknown location'} - moving to next business`);
        }

        results.push(enrichedRow);
        processedCount++;

        // PHASE 1: Progressive saving - Save immediately to database
        if (db && projectId && hasValidData) {
          let saveRetries = 0;
          const maxSaveRetries = 3;
          let saved = false;
          
          while (saveRetries < maxSaveRetries && !saved) {
            try {
              const businessCollection = db.collection('businesses');
              await businessCollection.insertOne(enrichedRow);
              console.log(`💾 Saved to database: ${businessName}`);
              saved = true;
            } catch (saveError) {
              saveRetries++;
              console.error(`❌ Save failed for ${businessName} (attempt ${saveRetries}/${maxSaveRetries}): ${saveError.message}`);
              
              if (saveRetries < maxSaveRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * saveRetries));
              }
            }
          }
          
          if (!saved) {
            console.error(`❌ Failed to save ${businessName} after ${maxSaveRetries} attempts`);
            // Log failed save for manual recovery
            const errorLog = {
              projectId,
              businessName,
              error: 'Failed to save after retries',
              data: enrichedRow,
              timestamp: new Date()
            };
            
            try {
              const errorCollection = db.collection('save_errors');
              await errorCollection.insertOne(errorLog);
            } catch (logError) {
              console.error(`❌ Failed to log save error:`, logError.message);
            }
          }
        }

        // Progress callback with real counts
        if (progressCallback) {
          await progressCallback(processedCount, data.length, foundCount);
        }

        // Adaptive rate limiting based on success/failure
        let delay;
        if (hasValidData) {
          // Successful lookup - shorter delay since we found data
          delay = 3000 + Math.random() * 3000; // 3-6 seconds
        } else {
          // Failed lookup - slightly longer delay
          delay = 5000 + Math.random() * 3000; // 5-8 seconds
        }
        
        console.log(`⏳ Waiting ${Math.round(delay/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      console.log(`\n📊 Excel processing completed: ${foundCount}/${processedCount} businesses found`);
      return results;
      
    } catch (error) {
      console.error('Excel processing error:', error);
      throw error;
    } finally {
      await this.lookup.close();
    }
  }

  extractBusinessName(row) {
    // Try common column names for business name
    const nameFields = ['name', 'business_name', 'company', 'business', 'title', 'Name', 'Business Name', 'Company'];
    
    for (const field of nameFields) {
      if (row[field] && typeof row[field] === 'string' && row[field].trim()) {
        return row[field].trim();
      }
    }
    
    // If no named field, try first column
    const firstValue = Object.values(row)[0];
    if (typeof firstValue === 'string' && firstValue.trim()) {
      return firstValue.trim();
    }
    
    return null;
  }

  extractLocation(row) {
    // Enhanced location extraction with subdivision priority
    const subdivisionFields = ['subdivision', 'city', 'state', 'Subdivision', 'City', 'State'];
    const locationFields = ['location', 'address', 'Location', 'Address'];
    
    // First try subdivision-specific fields
    for (const field of subdivisionFields) {
      if (row[field] && typeof row[field] === 'string' && row[field].trim()) {
        return row[field].trim();
      }
    }
    
    // Then try general location fields
    for (const field of locationFields) {
      if (row[field] && typeof row[field] === 'string' && row[field].trim()) {
        return row[field].trim();
      }
    }
    
    return '';
  }

  extractSubdivision(row) {
    // Extract subdivision specifically
    const subdivisionFields = ['subdivision', 'city', 'state', 'Subdivision', 'City', 'State', 'Sub division'];
    
    for (const field of subdivisionFields) {
      if (row[field] && typeof row[field] === 'string' && row[field].trim()) {
        return row[field].trim();
      }
    }
    
    return '';
  }

  extractCountry(row) {
    // Extract country - no default to allow user control
    const countryFields = ['country', 'Country'];
    
    for (const field of countryFields) {
      if (row[field] && typeof row[field] === 'string' && row[field].trim()) {
        return row[field].trim();
      }
    }
    
    return ''; // No default - let user specify
  }

  async exportResults(results, outputPath) {
    try {
      // Create new workbook
      const wb = XLSX.utils.book_new();
      
      // Convert results to worksheet
      const ws = XLSX.utils.json_to_sheet(results);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Enriched Businesses');
      
      // Write file
      XLSX.writeFile(wb, outputPath);
      
      console.log(`📁 Results exported to: ${outputPath}`);
      return outputPath;
      
    } catch (error) {
      console.error('Export error:', error);
      throw error;
    }
  }

  validateExcelFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist');
      }

      const workbook = XLSX.readFile(filePath);
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('No worksheets found');
      }

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      if (data.length === 0) {
        throw new Error('No data rows found');
      }

      // Check if we can find business names
      let hasBusinessNames = false;
      let hasSubdivision = false;
      
      for (const row of data.slice(0, 5)) { // Check first 5 rows
        if (this.extractBusinessName(row)) {
          hasBusinessNames = true;
        }
        if (this.extractSubdivision(row)) {
          hasSubdivision = true;
        }
        if (hasBusinessNames) break;
      }

      if (!hasBusinessNames) {
        throw new Error('No business names detected in first column or common name fields');
      }

      // Prepare sample data with location info
      const sampleData = data.slice(0, 3).map(row => {
        const businessName = this.extractBusinessName(row);
        const subdivision = this.extractSubdivision(row);
        const country = this.extractCountry(row);
        return {
          businessName,
          subdivision: subdivision || 'Not specified',
          country: country || 'Not specified',
          locationComplete: !!(subdivision && country)
        };
      });

      return {
        valid: true,
        rowCount: data.length,
        columns: Object.keys(data[0] || {}),
        sampleData,
        hasSubdivision,
        recommendations: hasSubdivision ? [] : [
          'Consider adding a "Subdivision" or "City" column for better results',
          'Example: Abuja, Lagos, Port Harcourt, Kano, etc.'
        ]
      };

    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = ExcelLookupService;