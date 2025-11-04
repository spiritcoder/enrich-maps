const DataEnricherService = require('./services/DataEnricherService');
const path = require('path');

async function testDataEnricher() {
  console.log('🧪 Testing Data Enricher Service...');
  
  const service = new DataEnricherService();
  
  // Test Excel validation
  console.log('\n📋 Testing Excel validation...');
  const testFilePath = path.join(__dirname, 'test-locations.xlsx');
  
  // Create a simple test Excel file
  const XLSX = require('xlsx');
  const testData = [
    { Name: 'Victoria Island', Address: 'Lagos, Nigeria', Country: 'Nigeria' },
    { Name: 'Banana Island', Address: 'Ikoyi, Lagos', Country: 'Nigeria' },
    { Name: 'Lekki Phase 1', Address: 'Lekki, Lagos', Country: 'Nigeria' }
  ];
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(testData);
  XLSX.utils.book_append_sheet(wb, ws, 'Locations');
  XLSX.writeFile(wb, testFilePath);
  
  console.log(`📁 Created test file: ${testFilePath}`);
  
  // Validate the file
  const validation = service.validateExcelFile(testFilePath);
  console.log('✅ Validation result:', validation);
  
  if (validation.valid) {
    console.log(`📊 Found ${validation.rowCount} locations`);
    console.log(`📋 Columns: ${validation.columns.join(', ')}`);
    console.log('🔍 Sample data:', validation.sampleData);
  }
  
  // Test location name extraction
  console.log('\n🏷️ Testing location name extraction...');
  testData.forEach((row, index) => {
    const locationName = service.extractLocationName(row);
    console.log(`Row ${index + 1}: "${locationName}"`);
  });
  
  console.log('\n✅ Data Enricher Service test completed!');
}

// Run test
testDataEnricher().catch(console.error);