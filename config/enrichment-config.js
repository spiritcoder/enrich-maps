// AI Enrichment Configuration
const AI_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    description: 'Budget-friendly AI for basic enrichment',
    costPerBusiness: 0.5,
    icon: '🟢',
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat'
  },
  gpt4: {
    name: 'GPT-4',
    description: 'Balanced quality and cost',
    costPerBusiness: 1.5,
    icon: '🟡',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4'
  },
  claude: {
    name: 'Claude AI',
    description: 'Premium quality for complex analysis',
    costPerBusiness: 2.0,
    icon: '🔵',
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-sonnet-20240229'
  },
  gpt5: {
    name: 'GPT-5',
    description: 'Ultra-premium latest AI model',
    costPerBusiness: 3.0,
    icon: '🟣',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-5'
  }
};

const ENRICHMENT_FIELDS = {
  // Core Business Details
  extendedDescription: {
    name: 'Extended Description',
    description: 'AI-generated detailed business description',
    category: 'Core Details'
  },
  highlights: {
    name: 'Business Highlights',
    description: 'Key features and unique selling points',
    category: 'Core Details'
  },
  services: {
    name: 'Services/Products',
    description: 'Detailed breakdown of offerings',
    category: 'Core Details'
  },
  amenities: {
    name: 'Amenities',
    description: 'Facilities like parking, WiFi, accessibility',
    category: 'Core Details'
  },
  paymentMethods: {
    name: 'Payment Methods',
    description: 'Accepted payment types',
    category: 'Core Details'
  },

  // Menu & Pricing (Food businesses)
  menuItems: {
    name: 'Menu Items',
    description: 'Popular dishes and signature items',
    category: 'Menu & Pricing'
  },
  priceRange: {
    name: 'Price Range',
    description: '$ to $$$$ classification',
    category: 'Menu & Pricing'
  },
  cuisineType: {
    name: 'Cuisine Type',
    description: 'Specific cuisine categories',
    category: 'Menu & Pricing'
  },
  dietaryOptions: {
    name: 'Dietary Options',
    description: 'Vegan, gluten-free, halal options',
    category: 'Menu & Pricing'
  },

  // Operational Details
  bookingInfo: {
    name: 'Booking Information',
    description: 'Reservation requirements and process',
    category: 'Operations'
  },
  dressCode: {
    name: 'Dress Code',
    description: 'Attire requirements',
    category: 'Operations'
  },
  ageRestrictions: {
    name: 'Age Restrictions',
    description: 'Family-friendly, 18+, 21+ policies',
    category: 'Operations'
  },
  groupLimits: {
    name: 'Group Size Limits',
    description: 'Maximum party size and private events',
    category: 'Operations'
  },

  // Quality Indicators
  awards: {
    name: 'Awards & Certifications',
    description: 'Industry recognition and certifications',
    category: 'Quality'
  },
  yearsInBusiness: {
    name: 'Years in Business',
    description: 'Establishment date and longevity',
    category: 'Quality'
  },
  ownershipType: {
    name: 'Ownership Type',
    description: 'Family-owned, chain, franchise',
    category: 'Quality'
  },

  // Customer Experience
  atmosphere: {
    name: 'Atmosphere',
    description: 'Vibe and ambiance description',
    category: 'Experience'
  },
  noiseLevel: {
    name: 'Noise Level',
    description: 'Quiet, moderate, or lively environment',
    category: 'Experience'
  },
  waitTimes: {
    name: 'Wait Times',
    description: 'Typical wait and busy periods',
    category: 'Experience'
  },
  customerDemographics: {
    name: 'Customer Demographics',
    description: 'Target audience and typical customers',
    category: 'Experience'
  }
};

const FIELD_CATEGORIES = {
  'Core Details': {
    name: 'Core Business Details',
    description: 'Essential business information and features'
  },
  'Menu & Pricing': {
    name: 'Menu & Pricing',
    description: 'Food, pricing, and dining options'
  },
  'Operations': {
    name: 'Operational Details',
    description: 'Booking, policies, and operational info'
  },
  'Quality': {
    name: 'Quality Indicators',
    description: 'Awards, experience, and credibility'
  },
  'Experience': {
    name: 'Customer Experience',
    description: 'Atmosphere, demographics, and experience'
  }
};

module.exports = {
  AI_PROVIDERS,
  ENRICHMENT_FIELDS,
  FIELD_CATEGORIES
};