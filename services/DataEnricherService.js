const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

class DataEnricherService {
  constructor() {
    // Service ready for enrichment
  }

  async processExcelFile(filePath, selectedFields, aiProvider, progressCallback, projectId = null, db = null, isRetry = false) {
    try {
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      console.log(`📊 Processing ${data.length} locations for AI enrichment`);
      console.log(`🤖 Selected fields: ${selectedFields.join(', ')}`);

      // Phase 1: Check for existing checkpoint
      const Project = require('../api/models/Project');
      const projectModel = new Project();
      await projectModel.init();
      
      const checkpoint = await projectModel.getCheckpoint(projectId);
      const startIndex = checkpoint?.last_processed_row + 1 || 0;
      
      if (checkpoint && !isRetry) {
        console.log(`🔄 Resuming from checkpoint: row ${startIndex}`);
      }
      
      await projectModel.close();

      const results = [];
      let processedCount = checkpoint?.processed_count || 0;
      let enrichedCount = checkpoint?.enriched_count || 0;
      let failedLocations = checkpoint?.failed_locations || [];

      // Initialize AI service
      const AIEnrichmentService = require('./AIEnrichmentService');
      const aiService = new AIEnrichmentService('deepseek', process.env.DEEPSEEK_API_KEY);

      // Process in batches for parallel processing
      const BATCH_SIZE = 5;
      const remainingData = data.slice(startIndex);
      
      for (let batchStart = 0; batchStart < remainingData.length; batchStart += BATCH_SIZE) {
        const batch = remainingData.slice(batchStart, batchStart + BATCH_SIZE);
        const batchIndex = startIndex + batchStart;
        
        console.log(`\n🚀 Processing batch ${Math.floor(batchStart/BATCH_SIZE) + 1}/${Math.ceil(remainingData.length/BATCH_SIZE)} (${batch.length} locations)`);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (row, index) => {
          const actualIndex = batchIndex + index;
          const locationName = this.extractLocationName(row);
          
          if (!locationName) {
            console.log(`⚠️ Skipping row ${actualIndex + 1}: No location name found`);
            return { skipped: true, index: actualIndex };
          }

          console.log(`🔍 Processing ${actualIndex + 1}/${data.length}: ${locationName}`);
          
          // Prepare location data for AI enrichment
          const locationData = {
            name: locationName,
            address: this.extractAddress(row),
            coordinates: this.extractCoordinates(row),
            country: this.extractCountry(row),
            subdivision: this.extractSubdivision(row),
            additional_info: this.extractAdditionalInfo(row)
          };

          // Phase 2: Enrich with parallel field processing
          const enrichmentResult = await this.enrichLocationDataWithParallelFields(aiService, locationData, selectedFields, aiProvider, actualIndex);
          
          // Combine original data with enriched data
          const enrichedRow = {
            ...row,
            ...enrichmentResult.data,
            original_name: locationName,
            enrichment_success: enrichmentResult.success,
            enrichment_status: enrichmentResult.fieldStatus,
            processed_at: new Date().toISOString(),
            project_id: projectId,
            created_at: new Date(),
            row_index: actualIndex
          };

          return { enrichedRow, enrichmentResult, locationName, index: actualIndex };
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Process batch results
        for (const result of batchResults) {
          if (result.skipped) {
            processedCount++;
            await this.saveCheckpoint(projectId, result.index, processedCount, enrichedCount, failedLocations);
            continue;
          }

          const { enrichedRow, enrichmentResult, locationName, index } = result;
          
          results.push(enrichedRow);
          processedCount++;
          
          if (enrichmentResult.success) {
            enrichedCount++;
          } else {
            failedLocations.push({ row_index: index, location_name: locationName, failed_fields: enrichmentResult.failedFields });
          }

          // Progressive saving to database
          if (db && projectId) {
            try {
              const locationCollection = db.collection('locations');
              await locationCollection.insertOne(enrichedRow);
              console.log(`💾 Saved location: ${locationName} (${enrichmentResult.success ? 'enriched' : 'partial'})`);
            } catch (saveError) {
              console.error(`❌ Save failed for ${locationName}: ${saveError.message}`);
            }
          }

          // Phase 1: Save checkpoint after each location
          await this.saveCheckpoint(projectId, index, processedCount, enrichedCount, failedLocations);
        }

        // Progress callback for batch
        if (progressCallback) {
          await progressCallback(processedCount, data.length, enrichedCount);
        }

        // Rate limiting between batches (reduced since we're processing in parallel)
        if (batchStart + BATCH_SIZE < remainingData.length) {
          const delay = 3000 + Math.random() * 2000; // 3-5 seconds between batches
          console.log(`⏳ Batch completed. Waiting ${Math.round(delay/1000)}s before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // Clear checkpoint on successful completion
      await this.clearCheckpoint(projectId);

      console.log(`\n📊 Data enrichment completed: ${enrichedCount}/${processedCount} locations enriched, ${failedLocations.length} failed`);
      return results;
      
    } catch (error) {
      console.error('Data enrichment error:', error);
      throw error;
    }
  }

  // Phase 3: Network resilient AI call with retry
  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
        console.log(`🔄 Retry ${i + 1}/${maxRetries} in ${Math.round(delay/1000)}s: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Phase 2: Parallel field processing for faster enrichment
  async enrichLocationDataWithParallelFields(aiService, locationData, selectedFields, aiProvider, rowIndex) {
    const { LOCATION_ENRICHMENT_FIELDS, PROMPT_STYLES, FIELD_STYLES, TONE_VARIANTS, STYLE_TEMPERATURES, NIGERIAN_CONTEXT_RULES } = require('../config/location-enrichment-config');
    const enrichedData = {};
    const fieldStatus = {};
    const failedFields = [];
    let successCount = 0;

    // Process all fields in parallel
    const fieldPromises = selectedFields.map(async (fieldKey) => {
      const fieldConfig = LOCATION_ENRICHMENT_FIELDS[fieldKey];
      if (!fieldConfig) return { fieldKey, success: false, data: 'Field not found' };

      try {
        // Get field-specific style or random style
        const styleKey = FIELD_STYLES[fieldKey] || Object.keys(PROMPT_STYLES)[Math.floor(Math.random() * Object.keys(PROMPT_STYLES).length)];
        const tone = TONE_VARIANTS[Math.floor(Math.random() * TONE_VARIANTS.length)];
        const temp = STYLE_TEMPERATURES[styleKey] || 0.75;
        const promptTemplate = PROMPT_STYLES[styleKey];
        
        // Build location context with coordinates for precise geographic reference
        const locationContext = this.buildLocationContext(locationData);
        
        // Build dynamic prompt with coordinates and Nigerian context
        const prompt = NIGERIAN_CONTEXT_RULES + '\n\n' + promptTemplate
          .replace('{name}', locationContext)
          .replace('{subdivision}', locationData.subdivision || 'Nigeria')
          .replace('{field_prompt}', fieldConfig.prompt)
          .replace('{tone}', tone);

        // Phase 3: Network resilient AI call
        const response = await this.retryWithBackoff(async () => {
          return await aiService.callAI(aiProvider, prompt, {
            maxTokens: 650,
            temperature: temp
          });
        });

        return {
          fieldKey,
          success: true,
          data: response || 'Not available'
        };
        
      } catch (error) {
        console.error(`❌ Failed to enrich ${fieldConfig.name} for row ${rowIndex}: ${error.message}`);
        return {
          fieldKey,
          success: false,
          data: 'Enrichment failed',
          error: error.message
        };
      }
    });

    // Wait for all fields to complete
    const fieldResults = await Promise.all(fieldPromises);
    
    // Process results
    for (const result of fieldResults) {
      enrichedData[result.fieldKey] = result.data;
      fieldStatus[result.fieldKey] = result.success ? 'success' : 'failed';
      
      if (result.success) {
        successCount++;
      } else {
        failedFields.push(result.fieldKey);
      }
    }

    return {
      data: enrichedData,
      fieldStatus,
      failedFields,
      success: failedFields.length === 0,
      partialSuccess: successCount > 0 && failedFields.length > 0
    };
  }

  // Phase 2: Field-level recovery enrichment (kept for retry functionality)
  async enrichLocationDataWithRecovery(aiService, locationData, selectedFields, aiProvider, rowIndex) {
    const { LOCATION_ENRICHMENT_FIELDS, PROMPT_STYLES, FIELD_STYLES, TONE_VARIANTS, STYLE_TEMPERATURES, NIGERIAN_CONTEXT_RULES } = require('../config/location-enrichment-config');
    const enrichedData = {};
    const fieldStatus = {};
    const failedFields = [];
    let successCount = 0;

    for (const fieldKey of selectedFields) {
      const fieldConfig = LOCATION_ENRICHMENT_FIELDS[fieldKey];
      if (!fieldConfig) continue;

      try {
        // Get field-specific style or random style
        const styleKey = FIELD_STYLES[fieldKey] || Object.keys(PROMPT_STYLES)[Math.floor(Math.random() * Object.keys(PROMPT_STYLES).length)];
        const tone = TONE_VARIANTS[Math.floor(Math.random() * TONE_VARIANTS.length)];
        const temp = STYLE_TEMPERATURES[styleKey] || 0.75;
        const promptTemplate = PROMPT_STYLES[styleKey];
        
        // Build location context with coordinates for precise geographic reference
        const locationContext = this.buildLocationContext(locationData);
        
        // Build dynamic prompt with coordinates and Nigerian context
        const prompt = NIGERIAN_CONTEXT_RULES + '\n\n' + promptTemplate
          .replace('{name}', locationContext)
          .replace('{subdivision}', locationData.subdivision || 'Nigeria')
          .replace('{field_prompt}', fieldConfig.prompt)
          .replace('{tone}', tone);

        // Phase 3: Network resilient AI call
        const response = await this.retryWithBackoff(async () => {
          return await aiService.callAI(aiProvider, prompt, {
            maxTokens: 650,
            temperature: temp
          });
        });

        enrichedData[fieldKey] = response || 'Not available';
        fieldStatus[fieldKey] = 'success';
        successCount++;
        
      } catch (error) {
        console.error(`❌ Failed to enrich ${fieldConfig.name} for row ${rowIndex}: ${error.message}`);
        enrichedData[fieldKey] = 'Enrichment failed';
        fieldStatus[fieldKey] = 'failed';
        failedFields.push(fieldKey);
      }
    }

    return {
      data: enrichedData,
      fieldStatus,
      failedFields,
      success: failedFields.length === 0,
      partialSuccess: successCount > 0 && failedFields.length > 0
    };
  }

  // Phase 1: Checkpoint management
  async saveCheckpoint(projectId, lastProcessedRow, processedCount, enrichedCount, failedLocations) {
    try {
      const Project = require('../api/models/Project');
      const projectModel = new Project();
      await projectModel.init();
      
      await projectModel.updateCheckpoint(projectId, {
        last_processed_row: lastProcessedRow,
        processed_count: processedCount,
        enriched_count: enrichedCount,
        failed_locations: failedLocations,
        last_updated: new Date()
      });
      
      await projectModel.close();
    } catch (error) {
      console.error('Failed to save checkpoint:', error.message);
    }
  }

  async clearCheckpoint(projectId) {
    try {
      const Project = require('../api/models/Project');
      const projectModel = new Project();
      await projectModel.init();
      
      await projectModel.clearCheckpoint(projectId);
      
      await projectModel.close();
    } catch (error) {
      console.error('Failed to clear checkpoint:', error.message);
    }
  }

  // Phase 4: Retry failed enrichments only
  async retryFailedEnrichments(projectId, db) {
    try {
      const Project = require('../api/models/Project');
      const projectModel = new Project();
      await projectModel.init();
      
      const project = await projectModel.findById(projectId);
      if (!project || !project.dataEnricher) {
        throw new Error('Project not found or not a data enricher project');
      }
      
      await projectModel.close();

      // Get failed locations from database
      const locationCollection = db.collection('locations');
      const failedLocations = await locationCollection.find({
        project_id: projectId,
        $or: [
          { enrichment_success: false },
          { 'enrichment_status': { $exists: true, $ne: null } }
        ]
      }).toArray();

      if (failedLocations.length === 0) {
        console.log('No failed enrichments found to retry');
        return { retriedCount: 0, successCount: 0 };
      }

      console.log(`🔄 Retrying ${failedLocations.length} failed enrichments`);

      const AIEnrichmentService = require('./AIEnrichmentService');
      const aiService = new AIEnrichmentService('deepseek', process.env.DEEPSEEK_API_KEY);
      
      let retriedCount = 0;
      let successCount = 0;

      for (const location of failedLocations) {
        const failedFields = [];
        
        // Identify failed fields
        if (location.enrichment_status) {
          for (const [field, status] of Object.entries(location.enrichment_status)) {
            if (status === 'failed') {
              failedFields.push(field);
            }
          }
        } else {
          // If no field status, retry all selected fields
          failedFields.push(...project.dataEnricher.selectedFields);
        }

        if (failedFields.length === 0) continue;

        console.log(`🔄 Retrying ${failedFields.length} fields for: ${location.original_name}`);

        const locationData = {
          name: location.original_name,
          address: location.Address || '',
          coordinates: location.Lat && location.Lng ? `${location.Lat}, ${location.Lng}` : '',
          country: location.Country || '',
          subdivision: location.Subdivision || '',
          additional_info: ''
        };



        const retryResult = await this.enrichLocationDataWithRecovery(
          aiService, 
          locationData, 
          failedFields, 
          project.dataEnricher.aiProvider,
          location.row_index
        );

        // Update location with new enrichment data
        const updateData = {
          ...retryResult.data,
          enrichment_success: retryResult.success,
          enrichment_status: { ...location.enrichment_status, ...retryResult.fieldStatus },
          retry_attempted_at: new Date().toISOString()
        };

        await locationCollection.updateOne(
          { _id: location._id },
          { $set: updateData }
        );

        retriedCount++;
        if (retryResult.success || retryResult.partialSuccess) {
          successCount++;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
      }

      console.log(`✅ Retry completed: ${successCount}/${retriedCount} locations improved`);
      return { retriedCount, successCount };
      
    } catch (error) {
      console.error('Retry failed enrichments error:', error);
      throw error;
    }
  }

  extractLocationName(row) {
    const nameFields = ['name', 'location_name', 'place_name', 'title', 'Name', 'Location Name', 'Place Name'];
    
    for (const field of nameFields) {
      if (row[field] && typeof row[field] === 'string' && row[field].trim()) {
        return row[field].trim();
      }
    }
    
    // Try first column
    const firstValue = Object.values(row)[0];
    if (typeof firstValue === 'string' && firstValue.trim()) {
      return firstValue.trim();
    }
    
    return null;
  }

  extractAddress(row) {
    const addressFields = ['address', 'location', 'Address', 'Location'];
    
    for (const field of addressFields) {
      if (row[field] && typeof row[field] === 'string' && row[field].trim()) {
        return row[field].trim();
      }
    }
    
    return '';
  }

  extractCoordinates(row) {
    const lat = row.lat || row.Lat || row.latitude || row.Latitude;
    const lng = row.lng || row.Lng || row.longitude || row.Longitude;
    
    if (lat && lng) {
      return `${lat}, ${lng}`;
    }
    
    return '';
  }

  extractCountry(row) {
    const countryFields = ['country', 'Country'];
    
    for (const field of countryFields) {
      if (row[field] && typeof row[field] === 'string' && row[field].trim()) {
        return row[field].trim();
      }
    }
    
    return '';
  }

  extractSubdivision(row) {
    const subdivisionFields = ['subdivision', 'state', 'city', 'Subdivision', 'State', 'City'];
    
    for (const field of subdivisionFields) {
      if (row[field] && typeof row[field] === 'string' && row[field].trim()) {
        return row[field].trim();
      }
    }
    
    return '';
  }

  extractAdditionalInfo(row) {
    // Combine other relevant fields
    const additionalFields = ['rating', 'review_count', 'website', 'description'];
    const info = [];
    
    for (const field of additionalFields) {
      if (row[field] && row[field].toString().trim()) {
        info.push(`${field}: ${row[field]}`);
      }
    }
    
    return info.join(', ');
  }

  buildLocationContext(locationData) {
    const { name, address, coordinates, subdivision } = locationData;
    
    // Build precise location context using coordinates when available
    if (coordinates && coordinates.trim()) {
      const addressPart = address && address.trim() ? ` at ${address}` : '';
      const stateContext = subdivision ? `, ${subdivision}` : '';
      return `${name || 'this location'}${addressPart} (Coordinates: ${coordinates}${stateContext})`;
    }
    
    // Use address if available
    if (address && address.trim()) {
      const stateContext = subdivision ? `, ${subdivision}` : '';
      return `${name || 'this location'} located at ${address}${stateContext}`;
    }
    
    // Use just name with subdivision if no address or coordinates
    const stateContext = subdivision ? ` in ${subdivision}` : '';
    return `${name || 'this location'}${stateContext}`;
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

      // Check if we can find location names
      let hasLocationNames = false;
      
      for (const row of data.slice(0, 5)) {
        if (this.extractLocationName(row)) {
          hasLocationNames = true;
          break;
        }
      }

      if (!hasLocationNames) {
        throw new Error('No location names detected in first column or common name fields');
      }

      return {
        valid: true,
        rowCount: data.length,
        columns: Object.keys(data[0] || {}),
        sampleData: data.slice(0, 3).map(row => ({
          locationName: this.extractLocationName(row),
          address: this.extractAddress(row) || 'Not specified',
          country: this.extractCountry(row) || 'Not specified'
        }))
      };

    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async exportResults(results, outputPath) {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(results);
      XLSX.utils.book_append_sheet(wb, ws, 'Enriched Locations');
      XLSX.writeFile(wb, outputPath);
      
      console.log(`📁 Results exported to: ${outputPath}`);
      return outputPath;
      
    } catch (error) {
      console.error('Export error:', error);
      throw error;
    }
  }

  // Get enrichment statistics
  async getEnrichmentStats(projectId, db) {
    try {
      const locationCollection = db.collection('locations');
      
      const totalCount = await locationCollection.countDocuments({ project_id: projectId });
      const successCount = await locationCollection.countDocuments({ 
        project_id: projectId, 
        enrichment_success: true 
      });
      const failedCount = await locationCollection.countDocuments({ 
        project_id: projectId, 
        enrichment_success: false 
      });
      const partialCount = await locationCollection.countDocuments({ 
        project_id: projectId, 
        enrichment_success: false,
        'enrichment_status': { $exists: true }
      });

      return {
        total: totalCount,
        success: successCount,
        failed: failedCount,
        partial: partialCount,
        canRetry: failedCount > 0 || partialCount > 0
      };
    } catch (error) {
      console.error('Get enrichment stats error:', error);
      return { total: 0, success: 0, failed: 0, partial: 0, canRetry: false };
    }
  }
}

module.exports = DataEnricherService;