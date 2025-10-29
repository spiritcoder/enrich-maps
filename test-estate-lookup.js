const MapsOnlyLookup = require('./scrapers/MapsOnlyLookup');

async function testEstateLookup() {
  console.log('🧪 Testing Estate Lookup: abraham adesanya estate lekki');
  console.log('=' .repeat(60));
  
  const lookup = new MapsOnlyLookup();
  
  try {
    await lookup.initialize();
    console.log('✅ Browser initialized');
    
    // Test the exact case that was failing
    const businessName = 'abraham adesanya estate lekki';
    const subdivision = 'Lagos';
    const country = 'Nigeria';
    
    console.log(`\n🔍 Testing lookup for: ${businessName}`);
    console.log(`📍 Location: ${subdivision}, ${country}`);
    
    // This should now work with the improved query building
    const result = await lookup.lookupBusiness(businessName, subdivision, country);
    
    if (result) {
      console.log('\n✅ SUCCESS! Estate found:');
      console.log('=' .repeat(40));
      console.log(`📍 Name: ${result.name}`);
      console.log(`🏠 Address: ${result.address}`);
      console.log(`📊 Confidence: ${result.confidence?.toFixed(2) || 'N/A'}`);
      console.log(`🎯 Result Type: ${result.result_type || 'unknown'}`);
      console.log(`🌍 Coordinates: ${result.lat}, ${result.lng}`);
      console.log(`🔗 Source: ${result.source_url}`);
      
      // Test the query building logic
      console.log('\n🔍 Query Analysis:');
      const queries = lookup.buildMultipleQueries(businessName, subdivision, country);
      queries.forEach((query, index) => {
        console.log(`  ${index + 1}. ${query}`);
      });
      
      // Check if it detected as location search
      const isLocation = lookup.isLocationSearch(businessName);
      console.log(`🏘️ Detected as location search: ${isLocation ? 'YES' : 'NO'}`);
      
    } else {
      console.log('\n❌ FAILED: No results found');
      console.log('This suggests the query improvements may not be working');
      
      // Show what queries were attempted
      console.log('\n🔍 Attempted Queries:');
      const queries = lookup.buildMultipleQueries(businessName, subdivision, country);
      queries.forEach((query, index) => {
        console.log(`  ${index + 1}. ${query}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
  } finally {
    await lookup.close();
    console.log('\n🔚 Browser closed');
  }
}

// Run the test
testEstateLookup().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});