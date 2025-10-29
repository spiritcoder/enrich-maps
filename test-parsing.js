const MapsOnlyLookup = require('./scrapers/MapsOnlyLookup');

function testParsing() {
  const lookup = new MapsOnlyLookup();
  
  // Test with the problematic text from Gaduwa Housing Estate
  const rawText = "See photosGaduwa Housing Estate4.3(88)Housing development·OverviewReviewsAboutDirectionsSaveNearbySend to phoneShare  gaduwa estate, 52 Constitution Ave, Abuja 900110, Federal Capital TerritoryOpen 24 hours WednesdayOpen 24 hoursThursdayOpen 24 hoursFridayOpen 24 hoursSaturdayOpen 24 hoursSundayOpen 24 hoursMondayOpen 24 hoursTuesdayOpen 24 hoursSuggest new hoursXFX9+73 AbujaClaim this business";
  
  console.log('🧪 Testing improved text parsing');
  console.log('=' .repeat(50));
  console.log('Raw text:', rawText.substring(0, 100) + '...');
  console.log('');
  
  const parsed = lookup.parseSearchResultText(rawText);
  
  console.log('✅ Parsed results:');
  console.log('📍 Name:', parsed.name);
  console.log('🏠 Address:', parsed.address);
  console.log('🌍 Subdivision:', parsed.subdivision);
  console.log('🇳🇬 Country:', parsed.country);
  
  // Test with Abraham Adesanya Estate format
  console.log('\n' + '=' .repeat(50));
  const abrahamText = "Abraham Adesanya EstateEti-OsaLekki 106104LagosDirectionsSaveNearbySend to phoneShare";
  console.log('Raw text:', abrahamText);
  
  const parsed2 = lookup.parseSearchResultText(abrahamText);
  console.log('✅ Parsed results:');
  console.log('📍 Name:', parsed2.name);
  console.log('🏠 Address:', parsed2.address);
  console.log('🌍 Subdivision:', parsed2.subdivision);
  console.log('🇳🇬 Country:', parsed2.country);
}

testParsing();