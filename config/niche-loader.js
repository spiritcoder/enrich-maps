const fs = require('fs');
const path = require('path');

class NicheLoader {
  static loadNiche(nicheName) {
    try {
      const nichePath = path.join(__dirname, '..', 'niches', `${nicheName}.json`);
      const nicheData = JSON.parse(fs.readFileSync(nichePath, 'utf8'));
      return nicheData;
    } catch (error) {
      throw new Error(`Failed to load niche configuration for "${nicheName}": ${error.message}`);
    }
  }

  static getCurrentNiche() {
    const nicheName = process.env.NICHE || 'museums';
    return this.loadNiche(nicheName);
  }

  static listAvailableNiches() {
    try {
      const nichesDir = path.join(__dirname, '..', 'niches');
      const files = fs.readdirSync(nichesDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      return [];
    }
  }
}

module.exports = NicheLoader;