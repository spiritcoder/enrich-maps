const NicheLoader = require('../config/niche-loader');

class BusinessCleaner {
  constructor(niche = null) {
    this.niche = niche || NicheLoader.getCurrentNiche();
  }

  cleanBusinessData(rawData) {
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
      type: this.categorizeBusiness(cleanedName, rawData.categories),
      lat: this.validateCoordinate(rawData.lat, 'lat'),
      lng: this.validateCoordinate(rawData.lng, 'lng'),
      images: this.cleanImages(rawData.images),
      country: rawData.country,
      subdivision: correctedSubdivision,
      about: this.cleanUnicodeCharacters(rawData.about)
    };
  }

  cleanUnicodeCharacters(text) {
    if (!text) return null;
    return text
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/[\u200B-\u200F]/g, '')
      .replace(/[\u202A-\u202E]/g, '')
      .replace(/[\u2060-\u206F]/g, '')
      .replace(/\uFEFF/g, '')
      .replace(/\uFFFD/g, '')
      .replace(/\u2026/g, '')
      .replace(/[\u00AD]/g, '')
      .replace(/[\u034F]/g, '')
      .replace(/[\u061C]/g, '')
      .replace(/[\u180E]/g, '')
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trim();
  }

  cleanName(name) {
    if (!name) return null;
    const cleaned = this.cleanUnicodeCharacters(name);
    return cleaned ? cleaned.replace(/\s+/g, ' ').substring(0, 200) : null;
  }

  generateSlug(name, fallbackId = null) {
    const prefix = this.niche.name.slice(0, -1);
    if (!name || name.trim() === '') {
      return fallbackId ? `${prefix}-${fallbackId.toString().slice(-8)}` : `${prefix}-${Date.now()}`;
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
      return fallbackId ? `${prefix}-${fallbackId.toString().slice(-8)}` : `${prefix}-${Date.now()}`;
    }
    
    return slug;
  }

  cleanAddress(address) {
    if (!address) return null;
    const cleaned = this.cleanUnicodeCharacters(address);
    return cleaned ? cleaned.replace(/\s+/g, ' ').substring(0, 300) : null;
  }

  normalizeAddress(address) {
    if (!address) return null;
    return address.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  cleanPhone(phone) {
    if (!phone) return null;
    
    const unicodeCleaned = this.cleanUnicodeCharacters(phone);
    if (!unicodeCleaned) return null;
    
    const invalidPatterns = [
      'send to phone', 'call', 'phone', 'contact', 'click to call', 'tap to call'
    ];
    
    const phoneLower = unicodeCleaned.toLowerCase().trim();
    if (invalidPatterns.some(pattern => phoneLower.includes(pattern))) {
      return null;
    }
    
    const cleaned = unicodeCleaned.replace(/[^\d+\s()-]/g, '');
    return cleaned.length >= 10 ? cleaned : null;
  }

  cleanWebsite(website) {
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

  cleanHours(hours) {
    if (!hours) return null;
    const cleaned = this.cleanUnicodeCharacters(hours);
    return cleaned ? cleaned.substring(0, 500) : null;
  }

  validateRating(rating) {
    const num = parseFloat(rating);
    return (num >= 0 && num <= 5) ? num : null;
  }

  validateReviewCount(count) {
    const num = parseInt(count);
    return (num >= 0) ? num : 0;
  }

  categorizeBusiness(name, categories) {
    if (!name) return 'General';
    
    const nameLower = name.toLowerCase();
    const categoryTypes = this.niche.categories;

    for (const [type, keywords] of Object.entries(categoryTypes)) {
      if (keywords.some(keyword => nameLower.includes(keyword))) {
        return type;
      }
    }

    return 'General';
  }

  validateCoordinate(coord, type) {
    const num = parseFloat(coord);
    if (isNaN(num)) return null;
    
    if (type === 'lat') {
      return (num >= -90 && num <= 90) ? num : null;
    } else if (type === 'lng') {
      return (num >= -180 && num <= 180) ? num : null;
    }
    
    return null;
  }

  cleanImages(images) {
    if (!Array.isArray(images)) return [];
    
    return images
      .filter(img => img && typeof img === 'string')
      .filter(img => img.startsWith('http'))
      .slice(0, 5);
  }

  extractSubdivisionFromAddress(address, country, currentSubdivision) {
    if (!address || !country) return currentSubdivision;
    
    const subdivisions = this.getSubdivisionsForCountry(country);
    if (!subdivisions || subdivisions.length === 0) return currentSubdivision;
    
    const addressLower = address.toLowerCase();
    
    if (currentSubdivision && addressLower.includes(currentSubdivision.toLowerCase())) {
      return currentSubdivision;
    }
    
    for (const subdivision of subdivisions) {
      if (addressLower.includes(subdivision.toLowerCase())) {
        return subdivision;
      }
    }
    
    return currentSubdivision;
  }
  
  getSubdivisionsForCountry(country) {
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

  isValidBusiness(data) {
    if (!data.name || data.name.length < 2) return false;
    
    if (this.niche.validation.requireContact && !data.phone && !data.website) {
      return false;
    }
    
    const nameLower = data.name.toLowerCase();
    
    if (this.niche.validation.overrideKeyword && nameLower.includes(this.niche.validation.overrideKeyword)) {
      return this.checkQualityThresholds(data);
    }
    
    const excludedKeyword = this.niche.validation.excludeKeywords.find(keyword => nameLower.includes(keyword));
    if (excludedKeyword) {
      return false;
    }
    
    return this.checkQualityThresholds(data);
  }

  checkQualityThresholds(data) {
    if (data.rating !== null && data.rating < this.niche.validation.minRating) {
      return false;
    }
    
    if (data.review_count !== null && data.review_count < this.niche.validation.minReviews) {
      return false;
    }
    
    return true;
  }
}

module.exports = BusinessCleaner;