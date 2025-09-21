class DataCleaner {
  static cleanMuseumData(rawData) {
    const cleanedName = this.cleanName(rawData.name);
    return {
      name: cleanedName,
      slug: this.generateSlug(cleanedName, rawData._id),
      address: this.cleanAddress(rawData.address),
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
      subdivision: rawData.subdivision
    };
  }

  static cleanName(name) {
    if (!name) return null;
    return name.trim().replace(/\s+/g, ' ').substring(0, 200);
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
    return address.trim().replace(/\s+/g, ' ').substring(0, 300);
  }

  static cleanPhone(phone) {
    if (!phone) return null;
    // Remove all non-digit characters except + and spaces
    const cleaned = phone.replace(/[^\d+\s()-]/g, '');
    return cleaned.length >= 10 ? cleaned : null;
  }

  static cleanWebsite(website) {
    if (!website) return null;
    try {
      const url = new URL(website);
      return url.href;
    } catch {
      return website.startsWith('http') ? website : `https://${website}`;
    }
  }

  static cleanHours(hours) {
    if (!hours) return null;
    return hours.trim().substring(0, 500);
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

  static isValidMuseum(data) {
    // Basic validation rules
    if (!data.name || data.name.length < 2) return false;
    
    // Check if it's actually a museum
    const excludeKeywords = [
      'restaurant', 'hotel', 'shop', 'store', 'mall', 'parking',
      'hospital', 'school', 'office', 'apartment', 'gas station'
    ];
    
    const nameLower = data.name.toLowerCase();
    if (excludeKeywords.some(keyword => nameLower.includes(keyword))) {
      return false;
    }

    return true;
  }
}

module.exports = DataCleaner;