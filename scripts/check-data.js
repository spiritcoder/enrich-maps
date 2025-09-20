const Database = require('../config/database');

async function checkData() {
  const db = new Database();
  await db.init();
  
  const rawCount = await db.collections.raw_museum_data.countDocuments();
  const processedCount = await db.collections.museums.countDocuments();
  
  console.log(`Raw museums: ${rawCount}`);
  console.log(`Processed museums: ${processedCount}`);
  
  if (rawCount > 0) {
    const sample = await db.collections.raw_museum_data.find().limit(3).toArray();
    console.log('\nSample raw data:');
    sample.forEach(museum => {
      console.log(`- ${museum.name} (${museum.country}, ${museum.subdivision})`);
    });
  }
  
  await db.close();
}

checkData().catch(console.error);