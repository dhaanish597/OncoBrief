export const SUPPORTED_LOCALES = [
  { code: 'en-IN', label: 'English (India)', group: 'English' },
  { code: 'hi-IN', label: 'Hindi (हिंदी)', group: 'Indic Languages (10)' },
  { code: 'ta-IN', label: 'Tamil (தமிழ்)', group: 'Indic Languages (10)' },
  { code: 'te-IN', label: 'Telugu (తెలుగు)', group: 'Indic Languages (10)' },
  { code: 'bn-IN', label: 'Bengali (বাংলা)', group: 'Indic Languages (10)' },
  { code: 'mr-IN', label: 'Marathi (मराठी)', group: 'Indic Languages (10)' },
  { code: 'kn-IN', label: 'Kannada (ಕನ್ನಡ)', group: 'Indic Languages (10)' },
  { code: 'ml-IN', label: 'Malayalam (മലയാളം)', group: 'Indic Languages (10)' },
  { code: 'gu-IN', label: 'Gujarati (ગુજરાતી)', group: 'Indic Languages (10)' },
  { code: 'pa-IN', label: 'Punjabi (ਪੰਜਾਬੀ)', group: 'Indic Languages (10)' },
  { code: 'or-IN', label: 'Odia (ଓଡ଼ିଆ)', group: 'Indic Languages (10)' },
] as const;

export type SupportedLocaleCode = (typeof SUPPORTED_LOCALES)[number]['code'];
