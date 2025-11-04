// Location/Estate Data Enrichment Configuration
const LOCATION_ENRICHMENT_FIELDS = {
  // Location Intelligence (5 fields)
  'ai_description': {
    name: 'Detailed Description',
    category: 'Location Intelligence',
    description: 'Comprehensive 2-3 paragraph overview of the location/estate',
    prompt: 'Provide a detailed, engaging description of this location including its character, significance, and what makes it notable.'
  },
  'ai_location_type': {
    name: 'Location Type',
    category: 'Location Intelligence', 
    description: 'Classification of the location type',
    prompt: 'Classify this location type (e.g., Residential Estate, Commercial Area, Mixed Development, Industrial Zone, etc.)'
  },
  'ai_key_features': {
    name: 'Key Features',
    category: 'Location Intelligence',
    description: 'Notable amenities, facilities, and unique characteristics',
    prompt: 'List the key features, amenities, and unique characteristics that define this location.'
  },
  'ai_historical_background': {
    name: 'Historical Background',
    category: 'Location Intelligence',
    description: 'Development history and establishment timeline',
    prompt: 'Provide the historical background, when it was established, development timeline, and key milestones.'
  },
  'ai_accessibility_info': {
    name: 'Accessibility Info',
    category: 'Location Intelligence',
    description: 'Transportation links and access information',
    prompt: 'Describe transportation links, road access, public transport options, and proximity to main areas.'
  },

  // Real Estate & Development (4 fields)
  'ai_property_types': {
    name: 'Property Types',
    category: 'Real Estate & Development',
    description: 'Available property types and housing options',
    prompt: 'Detail the types of properties available (houses, apartments, plots, commercial spaces, etc.)'
  },
  'ai_price_range': {
    name: 'Price Range',
    category: 'Real Estate & Development',
    description: 'Estimated property values and market positioning',
    prompt: 'Provide estimated price ranges for properties, rent levels, and market positioning (budget/mid-range/luxury).'
  },
  'ai_developer_info': {
    name: 'Developer Information',
    category: 'Real Estate & Development',
    description: 'Developer/management details and reputation',
    prompt: 'Identify the developer or management company, their reputation, and other notable projects.'
  },
  'ai_development_status': {
    name: 'Development Status',
    category: 'Real Estate & Development',
    description: 'Current development phase and future plans',
    prompt: 'Describe the current development status, completion phase, and any future expansion plans.'
  },

  // Area Context (4 fields)
  'ai_neighborhood_profile': {
    name: 'Neighborhood Profile',
    category: 'Area Context',
    description: 'Area character, vibe, and social dynamics',
    prompt: 'Describe the neighborhood character, social vibe, reputation, and what type of community it attracts.'
  },
  'ai_nearby_landmarks': {
    name: 'Nearby Landmarks',
    category: 'Area Context',
    description: 'Surrounding facilities and points of interest',
    prompt: 'List nearby landmarks, schools, hospitals, shopping centers, offices, and recreational facilities.'
  },
  'ai_infrastructure_quality': {
    name: 'Infrastructure Quality',
    category: 'Area Context',
    description: 'Quality of roads, utilities, and services',
    prompt: 'Assess the infrastructure quality including roads, utilities, internet connectivity, security, and maintenance standards.'
  },
  'ai_growth_potential': {
    name: 'Growth Potential',
    category: 'Area Context',
    description: 'Future development and investment prospects',
    prompt: 'Analyze the growth potential, future development plans, property appreciation prospects, and investment outlook.'
  },

  // Demographics & Lifestyle (3 fields)
  'ai_target_residents': {
    name: 'Target Residents',
    category: 'Demographics & Lifestyle',
    description: 'Typical resident profile and demographics',
    prompt: 'Describe the typical residents, their income level, profession types, and lifestyle preferences.'
  },
  'ai_lifestyle_benefits': {
    name: 'Lifestyle Benefits',
    category: 'Demographics & Lifestyle',
    description: 'Quality of life factors and living advantages',
    prompt: 'Explain the lifestyle benefits, quality of life factors, and reasons why people choose this location.'
  },
  'ai_community_features': {
    name: 'Community Features',
    category: 'Demographics & Lifestyle',
    description: 'Social amenities and community facilities',
    prompt: 'Detail community features, social amenities, clubs, recreational facilities, and community events.'
  }
};

// AI Provider configuration for location enrichment
const LOCATION_AI_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    costPerLocation: 0.10, // $0.10 per location (regardless of fields)
    model: 'deepseek-chat',
    maxTokens: 1000,
    temperature: 0.7
  }
};

// Tone variants to diversify AI outputs
const TONE_VARIANTS = [
  'in a conversational tone',
  'like a friendly Nigerian property consultant',
  'with a warm, locally grounded vibe',
  'as if writing for a real estate blog',
  'like a Lagos-based neighborhood guide',
  'as if describing it to a relocating family',
  'with subtle storytelling and cultural flair'
];

// Dynamic prompt templates for natural responses
const PROMPT_STYLES = {
  conversational: `
You are writing about {name} in {subdivision}, Nigeria. {field_prompt}
Write {tone}, sounding like a friendly Nigerian real estate expert chatting with a potential buyer.
Use simple, human phrasing and natural sentence flow (mix short and long sentences). 
Keep it informative yet relaxed (about 120 words). 
Reference only Nigerian context and use Nigerian Naira (₦) for any pricing.`,
  
  local_guide: `
Imagine you are a local Nigerian real estate guide familiar with {subdivision}. Tell me about {name}.
{field_prompt}
Write {tone}, offering insider details, landmarks, and navigation hints that locals would recognize.
Sound natural and helpful, not formal. Use phrases Nigerians commonly use ("around the area", "easy access", etc.).
Keep it engaging and practical (about 120 words).`,

  storytelling: `
Picture {name} in {subdivision}, Nigeria — {field_prompt}
Write {tone}, painting a vivid scene that feels authentic and grounded in Nigerian life.
Start with an image or feeling (e.g., "Nestled in...", "Known for its..."). 
Mix descriptive and conversational lines naturally. 
Keep the flow natural and human, not robotic or list-like (about 130 words).`,

  direct: `
Describe {name} in {subdivision}, Nigeria. {field_prompt}
Write {tone}, giving clear, factual information that's useful for investors or potential residents.
Use short, direct sentences and plain language. 
Stay concise, objective, and realistic — no exaggerations or AI tone.
Keep it under 120 words and use only Nigerian examples and currency (₦).`
};

// Temperature map for more human variety
const STYLE_TEMPERATURES = {
  storytelling: 0.9,
  conversational: 0.8,
  local_guide: 0.7,
  direct: 0.6
};

// Reinforced Nigerian context and anti-AI rules
const NIGERIAN_CONTEXT_RULES = `
IMPORTANT CONTEXT RULES:
- You are describing a location in Nigeria only
- Always use Nigerian Naira (₦) for any prices — no foreign currency
- Mention only Nigerian states, landmarks, and real estate terms
- Use authentic Nigerian English expressions naturally (e.g., "area", "gated estate", "Naija feel", "bustling", "wahala-free") but avoid overuse
- Reference Nigerian lifestyle realities (boreholes, generators, power supply, security, road access)
- Keep responses grounded in realism — no imaginary prices, names, or places
- Vary sentence length for natural rhythm; avoid robotic repetition
- Write as if by a real Nigerian content writer, not a chatbot
- Avoid cliches like "This location is known for..." — rephrase naturally
`;

// Field-specific prompt styles
const FIELD_STYLES = {
  'ai_description': 'storytelling',
  'ai_location_type': 'direct', 
  'ai_key_features': 'conversational',
  'ai_historical_background': 'storytelling',
  'ai_accessibility_info': 'local_guide',
  'ai_property_types': 'direct',
  'ai_price_range': 'direct',
  'ai_developer_info': 'conversational',
  'ai_development_status': 'local_guide',
  'ai_neighborhood_profile': 'conversational',
  'ai_nearby_landmarks': 'local_guide',
  'ai_infrastructure_quality': 'direct',
  'ai_growth_potential': 'conversational',
  'ai_target_residents': 'conversational',
  'ai_lifestyle_benefits': 'storytelling',
  'ai_community_features': 'local_guide'
};

module.exports = {
  LOCATION_ENRICHMENT_FIELDS,
  LOCATION_AI_PROVIDERS,
  PROMPT_STYLES,
  TONE_VARIANTS,
  STYLE_TEMPERATURES,
  NIGERIAN_CONTEXT_RULES,
  FIELD_STYLES
};