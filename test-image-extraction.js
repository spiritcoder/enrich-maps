const MapsOnlyLookup = require('./scrapers/MapsOnlyLookup');

async function testImageExtraction() {
  console.log('📸 Testing Image Extraction for Abraham Adesanya Estate');
  console.log('=' .repeat(60));
  
  const lookup = new MapsOnlyLookup();
  
  try {
    await lookup.initialize();
    
    const result = await lookup.lookupBusiness('abraham adesanya estate lekki', 'Lagos', 'Nigeria');
    
    if (result && result.images && result.images.length > 0) {
      console.log(`\n✅ SUCCESS! Extracted ${result.images.length} images:`);
      console.log('=' .repeat(50));
      
      result.images.forEach((imageUrl, index) => {
        console.log(`📸 Image ${index + 1}:`);
        console.log(`   URL: ${imageUrl}`);
        console.log(`   Type: ${imageUrl.includes('streetview') ? 'Street View' : 'Satellite/Aerial'}`);
        console.log('');
      });
      
      console.log('🎯 Image extraction is working correctly!');
    } else {
      console.log('❌ No images extracted');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await lookup.close();
  }
}

testImageExtraction().then(() => {
  console.log('\n🏁 Image extraction test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});