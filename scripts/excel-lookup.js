const ExcelLookupService = require('../services/ExcelLookupService');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: node scripts/excel-lookup.js <excel-file-path> [output-file-path]');
    console.log('Example: node scripts/excel-lookup.js ./businesses.xlsx ./enriched-businesses.xlsx');
    process.exit(1);
  }

  const inputFile = path.resolve(args[0]);
  const outputFile = args[1] ? path.resolve(args[1]) : 
    path.join(path.dirname(inputFile), `enriched-${path.basename(inputFile)}`);

  console.log('🚀 Excel Business Lookup Tool');
  console.log(`📂 Input: ${inputFile}`);
  console.log(`📁 Output: ${outputFile}`);

  const service = new ExcelLookupService();

  try {
    // Validate input file
    console.log('\n📋 Validating Excel file...');
    const validation = service.validateExcelFile(inputFile);
    
    if (!validation.valid) {
      console.error(`❌ Invalid Excel file: ${validation.error}`);
      process.exit(1);
    }

    console.log(`✅ Valid Excel file with ${validation.rowCount} rows`);
    console.log(`📊 Columns: ${validation.columns.join(', ')}`);
    
    if (validation.sampleData.length > 0) {
      console.log('\n📋 Sample data:');
      validation.sampleData.forEach((row, i) => {
        const businessName = service.extractBusinessName(row);
        const location = service.extractLocation(row);
        console.log(`  ${i + 1}. ${businessName}${location ? ` (${location})` : ''}`);
      });
    }

    // Confirm processing
    console.log(`\n⚠️  This will process ${validation.rowCount} businesses with rate limiting.`);
    console.log('⏱️  Estimated time: ~' + Math.ceil(validation.rowCount * 10 / 60) + ' minutes');
    
    // Process file
    console.log('\n🔍 Starting business lookup...');
    
    let processedCount = 0;
    const results = await service.processExcelFile(inputFile, async (current, total, found) => {
      processedCount = current;
      const progress = ((current / total) * 100).toFixed(1);
      console.log(`📊 Progress: ${current}/${total} (${progress}%) - Found: ${found}`);
    });

    // Export results
    console.log('\n📤 Exporting results...');
    await service.exportResults(results, outputFile);

    // Summary
    const successful = results.filter(r => r.lookup_success).length;
    const withPhone = results.filter(r => r.phone).length;
    const withWebsite = results.filter(r => r.website).length;
    const withEmail = results.filter(r => r.email).length;

    console.log('\n📊 SUMMARY:');
    console.log(`✅ Total processed: ${results.length}`);
    console.log(`🎯 Successful lookups: ${successful} (${((successful/results.length)*100).toFixed(1)}%)`);
    console.log(`📞 Found phone numbers: ${withPhone}`);
    console.log(`🌐 Found websites: ${withWebsite}`);
    console.log(`📧 Found emails: ${withEmail}`);
    console.log(`📁 Results saved to: ${outputFile}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };