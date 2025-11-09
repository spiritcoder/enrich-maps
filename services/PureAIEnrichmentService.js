const XLSX = require('xlsx');
const AIEnrichmentService = require('./AIEnrichmentService');

class PureAIEnrichmentService {
  constructor() {
    this.checkpointCollection = null;
  }

  async processExcelFileWithAI(filePath, selectedFields, aiProvider, progressCallback, projectId, db, isRetry = false) {
    this.checkpointCollection = db.collection('ai_enrichment_checkpoints');
    
    // Read Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Processing ${data.length} rows for AI enrichment`);
    
    // Initialize or resume checkpoint
    let checkpoint = await this.getCheckpoint(projectId);
    if (!checkpoint) {
      checkpoint = await this.createCheckpoint(projectId, data.length, selectedFields, aiProvider, filePath);
    }
    
    const startRow = isRetry ? 0 : checkpoint.last_processed_row + 1;
    console.log(`🔄 ${isRetry ? 'Retrying failed rows' : `Resuming from row ${startRow}`}`);
    
    // Initialize AI service
    const apiKey = process.env[`${aiProvider.toUpperCase()}_API_KEY`];
    if (!apiKey) {
      throw new Error(`No API key found for ${aiProvider}`);
    }
    
    const aiService = new AIEnrichmentService(aiProvider, apiKey);
    const businessCollection = db.collection('businesses');
    
    let processedCount = checkpoint.processed_rows;
    let enrichedCount = checkpoint.enriched_count;
    let failedCount = checkpoint.failed_count;
    
    // Process rows
    for (let i = startRow; i < data.length; i++) {
      try {
        const row = data[i];
        
        // Skip if retrying and this row was successful
        if (isRetry) {
          const existing = await businessCollection.findOne({
            project_id: projectId,
            name: row.Name,
            enriched: true
          });
          if (existing) continue;
        }
        
        // Convert Excel row to business object
        const business = this.excelRowToBusiness(row, projectId);
        
        // Enrich with AI
        const enrichedData = await aiService.enrichBusiness(business, selectedFields);
        
        // Save to database
        await businessCollection.updateOne(
          { 
            project_id: projectId,
            name: business.name,
            address: business.address
          },
          {
            $set: {
              ...business,
              ...enrichedData,
              enriched: true,
              enriched_at: new Date(),
              enrichment_provider: aiProvider,
              enrichment_fields: selectedFields,
              source: 'excel_ai_enrichment'
            }
          },
          { upsert: true }
        );
        
        enrichedCount++;
        console.log(`✅ Enriched ${enrichedCount}/${data.length}: ${business.name}`);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed to enrich row ${i + 1}:`, error.message);
        failedCount++;
        
        // Save failed row for retry
        await businessCollection.updateOne(
          {
            project_id: projectId,
            name: data[i].Name || `Row_${i + 1}`,
            address: data[i].Address || ''
          },
          {
            $set: {
              ...this.excelRowToBusiness(data[i], projectId),
              enriched: false,
              enrichment_error: error.message,
              enriched_at: new Date(),
              source: 'excel_ai_enrichment'
            }
          },
          { upsert: true }
        );
      }
      
      processedCount++;
      
      // Update checkpoint every 10 rows
      if (processedCount % 10 === 0) {
        await this.updateCheckpoint(projectId, i, processedCount, enrichedCount, failedCount);
      }
      
      // Progress callback
      if (progressCallback) {
        await progressCallback(processedCount, data.length, enrichedCount);
      }
    }
    
    // Final checkpoint update
    await this.updateCheckpoint(projectId, data.length - 1, processedCount, enrichedCount, failedCount, 'completed');
    
    console.log(`🎉 AI enrichment completed: ${enrichedCount} enriched, ${failedCount} failed`);
    return { enrichedCount, failedCount, totalProcessed: processedCount };
  }

  excelRowToBusiness(row, projectId) {
    return {
      project_id: projectId,
      name: row.Name || '',
      address: row.Address || '',
      subdivision: row.Subdivision || '',
      phone: row.Phone || '',
      website: row.Website || '',
      rating: parseFloat(row.Rating) || 0,
      review_count: parseInt(row['Review count']) || 0,
      country: row.Country || '',
      categories: row.Categories ? [row.Categories] : [],
      reviews: row.Reviews ? row.Reviews.split('|').slice(0, 5) : [],
      reviews_text: row['Reviews text'] || '',
      lat: parseFloat(row.Lat) || null,
      lng: parseFloat(row.Lng) || null,
      images: row.Images ? row.Images.split('|') : [],
      business_attributes: row['Business attributes'] ? JSON.parse(row['Business attributes'] || '{}') : {},
      source_url: row['Source url'] || '',
      scraped_at: row['Scraped at'] ? new Date(row['Scraped at']) : new Date(),
      normalized_address: row['Normalized address'] || '',
      hours_detailed: row['Hours detailed'] ? JSON.parse(row['Hours detailed'] || '{}') : {},
      closed_days: row['Closed days'] ? row['Closed days'].split(',') : [],
      is_open_sunday: row['Is open sunday'] === 'true',
      hours: row.Hours || ''
    };
  }

  async createCheckpoint(projectId, totalRows, selectedFields, aiProvider, filename) {
    const checkpoint = {
      project_id: projectId,
      job_type: 'ai_enrichment_only',
      total_rows: totalRows,
      processed_rows: 0,
      last_processed_row: -1,
      enriched_count: 0,
      failed_count: 0,
      current_status: 'processing',
      checkpoint_data: {
        filename: filename.split('\\').pop(),
        selected_fields: selectedFields,
        ai_provider: aiProvider,
        created_at: new Date(),
        last_updated: new Date()
      }
    };
    
    await this.checkpointCollection.insertOne(checkpoint);
    return checkpoint;
  }

  async getCheckpoint(projectId) {
    return await this.checkpointCollection.findOne({ 
      project_id: projectId,
      job_type: 'ai_enrichment_only'
    });
  }

  async updateCheckpoint(projectId, lastProcessedRow, processedRows, enrichedCount, failedCount, status = 'processing') {
    await this.checkpointCollection.updateOne(
      { 
        project_id: projectId,
        job_type: 'ai_enrichment_only'
      },
      {
        $set: {
          last_processed_row: lastProcessedRow,
          processed_rows: processedRows,
          enriched_count: enrichedCount,
          failed_count: failedCount,
          current_status: status,
          'checkpoint_data.last_updated': new Date()
        }
      }
    );
  }

  async clearCheckpoint(projectId) {
    await this.checkpointCollection.deleteOne({ 
      project_id: projectId,
      job_type: 'ai_enrichment_only'
    });
  }

  async getProgress(projectId) {
    const checkpoint = await this.getCheckpoint(projectId);
    if (!checkpoint) {
      return { exists: false };
    }
    
    const percentage = checkpoint.total_rows > 0 
      ? Math.round((checkpoint.processed_rows / checkpoint.total_rows) * 100)
      : 0;
    
    return {
      exists: true,
      total_rows: checkpoint.total_rows,
      processed_rows: checkpoint.processed_rows,
      enriched_count: checkpoint.enriched_count,
      failed_count: checkpoint.failed_count,
      percentage: percentage,
      status: checkpoint.current_status,
      can_resume: checkpoint.current_status === 'processing' && checkpoint.processed_rows < checkpoint.total_rows,
      checkpoint_data: checkpoint.checkpoint_data
    };
  }
}

module.exports = PureAIEnrichmentService;