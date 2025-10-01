class DataCleaner {
  static cleanMuseumData(rawData) {
    const cleanedName = this.cleanName(rawData.name);
    const cleanedAddress = this.cleanAddress(rawData.address);
    const correctedSubdivision = this.extractSubdivisionFromAddress(cleanedAddress, rawData.country, rawData.subdivision);
    
    return {
      name: cleanedName,
      slug: this.generateSlug(cleanedName, rawData._id),
      address: cleanedAddress,
      normalized_address: this.normalizeAddress(cleanedAddress),
      phone: this.cleanPhone(rawData.phone),
      website: this.cleanWebsite(rawData.website),
      hours: this.cleanHours(rawData.hours),
      rating: this.validateRating(rawData.rating),
      review_count: this.validateReviewCount(rawData.review_count),
      type: this.categorizeMuseum(cleanedName, rawData.categories),
      lat: this.validateCoordinate(rawData.lat, 'lat'),
      lng: this.validateCoordinate(rawData.lng, 'lng'),
      images: this.cleanImages(rawData.images),
      country: rawData.country,
      subdivision: correctedSubdivision,
      about: this.cleanUnicodeCharacters(rawData.about)
    };
  }

  static cleanUnicodeCharacters(text) {
    if (!text) return null;
    return text
      // Remove all control and formatting characters
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
      .replace(/[\u200B-\u200F]/g, '') // Zero-width spaces and formatting
      .replace(/[\u202A-\u202E]/g, '') // Directional markers
      .replace(/[\u2060-\u206F]/g, '') // Word joiner and invisible characters
      .replace(/\uFEFF/g, '') // Byte order mark
      .replace(/\uFFFD/g, '') // Replacement character
      // Remove specific problematic characters
      .replace(/\u2026/g, '') // Ellipsis (…)
      .replace(/[\u00AD]/g, '') // Soft hyphen
      .replace(/[\u034F]/g, '') // Combining grapheme joiner
      .replace(/[\u061C]/g, '') // Arabic letter mark
      .replace(/[\u180E]/g, '') // Mongolian vowel separator
      // Replace common characters with standard equivalents
      .replace(/[\u2010-\u2015]/g, '-') // Various dashes
      .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
      .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // Various spaces
      // Final cleanup
      .normalize('NFC') // Normalize Unicode
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .trim();
  }

  static cleanName(name) {
    if (!name) return null;
    const cleaned = this.cleanUnicodeCharacters(name);
    return cleaned ? cleaned.replace(/\s+/g, ' ').substring(0, 200) : null;
  }

  static generateSlug(name, fallbackId = null) {
    if (!name || name.trim() === '') {
      return fallbackId ? `museum-${fallbackId.toString().slice(-8)}` : `museum-${Date.now()}`;
    }
    
    let slug = name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80);
    
    if (!slug || slug === '' || slug === '-') {
      return fallbackId ? `museum-${fallbackId.toString().slice(-8)}` : `museum-${Date.now()}`;
    }
    
    return slug;
  }

  static cleanAddress(address) {
    if (!address) return null;
    const cleaned = this.cleanUnicodeCharacters(address);
    return cleaned ? cleaned.replace(/\s+/g, ' ').substring(0, 300) : null;
  }

  static normalizeAddress(address) {
    if (!address) return null;
    return address.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static cleanPhone(phone) {
    if (!phone) return null;
    
    // Clean Unicode characters first
    const unicodeCleaned = this.cleanUnicodeCharacters(phone);
    if (!unicodeCleaned) return null;
    
    // Check for invalid phone patterns (UI text)
    const invalidPatterns = [
      'send to phone',
      'call',
      'phone',
      'contact',
      'click to call',
      'tap to call'
    ];
    
    const phoneLower = unicodeCleaned.toLowerCase().trim();
    if (invalidPatterns.some(pattern => phoneLower.includes(pattern))) {
      return null;
    }
    
    // Remove all non-digit characters except + and spaces
    const cleaned = unicodeCleaned.replace(/[^\d+\s()-]/g, '');
    return cleaned.length >= 10 ? cleaned : null;
  }

  static cleanWebsite(website) {
    if (!website) return null;
    
    const cleaned = this.cleanUnicodeCharacters(website);
    if (!cleaned) return null;
    
    try {
      const url = new URL(cleaned);
      return url.href;
    } catch {
      return cleaned.startsWith('http') ? cleaned : `https://${cleaned}`;
    }
  }

  static cleanHours(hours) {
    if (!hours) return null;
    const cleaned = this.cleanUnicodeCharacters(hours);
    return cleaned ? cleaned.substring(0, 500) : null;
  }

  static validateRating(rating) {
    const num = parseFloat(rating);
    return (num >= 0 && num <= 5) ? num : null;
  }

  static validateReviewCount(count) {
    const num = parseInt(count);
    return (num >= 0) ? num : 0;
  }

  static categorizeMuseum(name, categories) {
    if (!name) return 'General';
    
    const nameLower = name.toLowerCase();
    const categoryTypes = {
      'Art': ['art', 'gallery', 'painting', 'sculpture'],
      'History': ['history', 'historical', 'heritage', 'memorial'],
      'Science': ['science', 'technology', 'planetarium', 'observatory'],
      'Natural History': ['natural', 'nature', 'dinosaur', 'fossil'],
      'Cultural': ['cultural', 'culture', 'ethnographic', 'folk'],
      'Military': ['military', 'war', 'army', 'navy', 'air force'],
      'Children': ['children', 'kids', 'family', 'interactive'],
      'Specialty': ['maritime', 'aviation', 'automotive', 'railway', 'sports']
    };

    for (const [type, keywords] of Object.entries(categoryTypes)) {
      if (keywords.some(keyword => nameLower.includes(keyword))) {
        return type;
      }
    }

    return 'General';
  }

  static validateCoordinate(coord, type) {
    const num = parseFloat(coord);
    if (isNaN(num)) return null;
    
    if (type === 'lat') {
      return (num >= -90 && num <= 90) ? num : null;
    } else if (type === 'lng') {
      return (num >= -180 && num <= 180) ? num : null;
    }
    
    return null;
  }

  static cleanImages(images) {
    if (!Array.isArray(images)) return [];
    
    return images
      .filter(img => img && typeof img === 'string')
      .filter(img => img.startsWith('http'))
      .slice(0, 5); // Keep max 5 images
  }

  static extractSubdivisionFromAddress(address, country, currentSubdivision) {
    if (!address || !country) return currentSubdivision;
    
    const subdivisions = this.getSubdivisionsForCountry(country);
    if (!subdivisions || subdivisions.length === 0) return currentSubdivision;
    
    const addressLower = address.toLowerCase();
    
    // Check if current subdivision appears in address
    if (currentSubdivision && addressLower.includes(currentSubdivision.toLowerCase())) {
      return currentSubdivision;
    }
    
    // Look for any subdivision name in the address
    for (const subdivision of subdivisions) {
      if (addressLower.includes(subdivision.toLowerCase())) {
        return subdivision;
      }
    }
    
    return currentSubdivision;
  }
  
  static getSubdivisionsForCountry(country) {
    try {
      const fs = require('fs');
      const path = require('path');
      const subdivisionData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'countries_subdivisions.json'), 'utf8')
      );
      
      return subdivisionData
        .filter(item => item.country_name === country)
        .map(item => item.subdivision_name);
    } catch (error) {
      console.error('Error loading subdivision data:', error);
      return [];
    }
  }

  static isValidMuseum(data) {
    // Basic validation rules
    if (!data.name || data.name.length < 2) return false;
    
    // Require at least phone or website
    if (!data.phone && !data.website) return false;
    
    // Check if it's actually a museum
    const excludeKeywords = [
      'restaurant', 'hotel', 'shop', 'store', 'mall', 'parking',
      'hospital', 'school', 'office', 'apartment', 'gas station', 'park'
    ];
    
    const nameLower = data.name.toLowerCase();
    if (excludeKeywords.some(keyword => nameLower.includes(keyword))) {
      return false;
    }

    return true;
  }
}

module.exports = DataCleaner;