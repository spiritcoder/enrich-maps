const fs = require('fs');
const path = require('path');

class CountriesLoader {
  constructor() {
    this.countries = null;
    this.loadCountries();
  }

  loadCountries() {
    try {
      const dataPath = path.join(__dirname, '..', 'countries_subdivisions.json');
      const rawData = fs.readFileSync(dataPath, 'utf8');
      const subdivisions = JSON.parse(rawData);
      
      // Group by country
      const countryMap = {};
      subdivisions.forEach(item => {
        if (!countryMap[item.country_name]) {
          countryMap[item.country_name] = {
            name: item.country_name,
            subdivisions: []
          };
        }
        countryMap[item.country_name].subdivisions.push(item.subdivision_name);
      });
      
      this.countries = Object.values(countryMap);
      console.log(`📍 Loaded ${this.countries.length} countries with subdivisions`);
      
    } catch (error) {
      console.error('Error loading countries data:', error);
      this.countries = [];
    }
  }

  getAllCountries() {
    return this.countries;
  }

  getCountryByName(name) {
    return this.countries.find(country => 
      country.name.toLowerCase() === name.toLowerCase()
    );
  }

  getCountriesForScraping(selectedCountries) {
    return selectedCountries.map(countryName => {
      const country = this.getCountryByName(countryName);
      if (!country) {
        console.warn(`⚠️ Country not found: ${countryName}`);
        return null;
      }
      return country;
    }).filter(Boolean);
  }

  // Get popular countries for UI
  getPopularCountries() {
    const popular = [
      'United States', 'Canada', 'United Kingdom', 'Australia', 
      'Germany', 'France', 'Italy', 'Spain', 'Japan', 'Brazil'
    ];
    
    return popular.map(name => this.getCountryByName(name)).filter(Boolean);
  }
}

const countriesLoader = new CountriesLoader();

module.exports = {
  getAllCountries: () => countriesLoader.getAllCountries(),
  getCountryByName: (name) => countriesLoader.getCountryByName(name),
  getCountriesForScraping: (selected) => countriesLoader.getCountriesForScraping(selected),
  getPopularCountries: () => countriesLoader.getPopularCountries()
};