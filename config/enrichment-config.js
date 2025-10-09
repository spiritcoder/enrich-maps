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
    name: 'Claude 3 Haiku',
    description: 'Fast and cost-effective AI enrichment',
    costPerBusiness: 0.8,
    icon: '🔵',
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-haiku-20240307'
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
  // Marketing & Content
  business_description: {
    name: 'Business Description',
    description: 'Professional description for directory listings',
    category: 'Marketing & Content'
  },
  specialties_services: {
    name: 'Specialties & Services',
    description: 'Key services and specialties offered',
    category: 'Marketing & Content'
  },
  price_range: {
    name: 'Price Range',
    description: 'Pricing level (Budget, Mid-range, Premium)',
    category: 'Marketing & Content'
  },

  // Customer Intelligence
  target_audience: {
    name: 'Target Audience',
    description: 'Primary customer demographics and groups',
    category: 'Customer Intelligence'
  },
  customer_reviews_summary: {
    name: 'Customer Reviews Summary',
    description: 'Summary of common customer feedback themes',
    category: 'Customer Intelligence'
  },
  accessibility_features: {
    name: 'Accessibility Features',
    description: 'Wheelchair access, parking, and accessibility info',
    category: 'Customer Intelligence'
  },

  // Operational Insights
  best_times_to_visit: {
    name: 'Best Times to Visit',
    description: 'Recommended visiting times and busy periods',
    category: 'Operational Insights'
  },
  parking_availability: {
    name: 'Parking Availability',
    description: 'Parking options and availability information',
    category: 'Operational Insights'
  },
  payment_methods: {
    name: 'Payment Methods',
    description: 'Accepted payment types and methods',
    category: 'Operational Insights'
  }
};

const FIELD_CATEGORIES = {
  'Marketing & Content': {
    name: 'Marketing & Content',
    description: 'Professional descriptions and key business information'
  },
  'Customer Intelligence': {
    name: 'Customer Intelligence',
    description: 'Customer insights and accessibility information'
  },
  'Operational Insights': {
    name: 'Operational Insights',
    description: 'Practical information for visitors'
  }
};

module.exports = {
  AI_PROVIDERS,
  ENRICHMENT_FIELDS,
  FIELD_CATEGORIES
};