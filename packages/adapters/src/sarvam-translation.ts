import { normalizeLanguageCode, SarvamError, type SupportedLanguage } from './sarvam-voice';

/**
 * Sarvam Mayura Indic Translation Adapter & 11-Language Deterministic Template Registry (`TASK-012`).
 *
 * Supports all 11 official languages in OncoBrief (`en-IN`, `hi-IN`, `ta-IN`, `te-IN`,
 * `bn-IN`, `mr-IN`, `kn-IN`, `ml-IN`, `gu-IN`, `pa-IN`, `or-IN`).
 *
 * Modes:
 *  - `SarvamTranslationAdapter`: Calls `POST https://api.sarvam.ai/translate` (`mayura:v1`)
 *    when `SARVAM_API_KEY` is configured.
 *  - `DeterministicTemplateTranslationAdapter`: Provides verified native-script
 *    administrative continuity templates across all 11 languages with zero clinical advice.
 */

export interface TranslationInput {
  text: string;
  sourceLanguageCode?: string;
  targetLanguageCode: string;
}

export interface TranslationResult {
  translatedText: string;
  sourceLanguageCode: SupportedLanguage;
  targetLanguageCode: SupportedLanguage;
  provider: 'sarvam-mayura' | 'deterministic-template';
}

export const ELEVEN_LOCALE_TEMPLATES: Record<
  'appointment_reminder' | 'opd_slot_offer_v1',
  Record<string, string>
> = {
  appointment_reminder: {
    en: 'Your appointment is on {{appointment_date}} at {{appointment_location}}. Please bring the documents listed in your records office letter. For help call {{records_office_phone}}.',
    'en-IN': 'Your appointment is on {{appointment_date}} at {{appointment_location}}. Please bring the documents listed in your records office letter. For help call {{records_office_phone}}.',
    hi: 'आपका अपॉइंटमेंट {{appointment_date}} को {{appointment_location}} में है। कृपया अपने रिकॉर्ड कार्यालय के पत्र में बताए गए दस्तावेज़ लाएँ। सहायता के लिए {{records_office_phone}} पर कॉल करें।',
    'hi-IN': 'आपका अपॉइंटमेंट {{appointment_date}} को {{appointment_location}} में है। कृपया अपने रिकॉर्ड कार्यालय के पत्र में बताए गए दस्तावेज़ लाएँ। सहायता के लिए {{records_office_phone}} पर कॉल करें।',
    ta: 'உங்கள் மருத்துவ சந்திப்பு {{appointment_date}} அன்று {{appointment_location}} இல் உள்ளது. ஆவண அலுவலகக் கடிதத்தில் குறிப்பிடப்பட்டுள்ள ஆவணங்களை தயவுசெய்து கொண்டு வரவும். உதவிக்கு {{records_office_phone}} ஐ அழைக்கவும்.',
    'ta-IN': 'உங்கள் மருத்துவ சந்திப்பு {{appointment_date}} அன்று {{appointment_location}} இல் உள்ளது. ஆவண அலுவலகக் கடிதத்தில் குறிப்பிடப்பட்டுள்ள ஆவணங்களை தயவுசெய்து கொண்டு வரவும். உதவிக்கு {{records_office_phone}} ஐ அழைக்கவும்.',
    te: 'మీ అపాయింట్‌మెంట్ {{appointment_date}}న {{appointment_location}} వద్ద ఉంది. దయచేసి మీ రికార్డుల కార్యాలయ లేఖలో పేర్కొన్న పత్రాలను తీసుకురండి. సహాయం కోసం {{records_office_phone}}కు కాల్ చేయండి.',
    'te-IN': 'మీ అపాయింట్‌మెంట్ {{appointment_date}}న {{appointment_location}} వద్ద ఉంది. దయచేసి మీ రికార్డుల కార్యాలయ లేఖలో పేర్కొన్న పత్రాలను తీసుకురండి. సహాయం కోసం {{records_office_phone}}కు కాల్ చేయండి.',
    bn: 'আপনার অ্যাপয়েন্টমেন্ট {{appointment_date}} তারিখে {{appointment_location}}-এ নির্ধারিত রয়েছে। অনুগ্রহ করে রেকর্ড অফিসের চিঠিতে উল্লেখিত নথিপত্র সাথে আনুন। সহায়তার জন্য {{records_office_phone}} নম্বরে কল করুন।',
    'bn-IN': 'আপনার অ্যাপয়েন্টমেন্ট {{appointment_date}} তারিখে {{appointment_location}}-এ নির্ধারিত রয়েছে। অনুগ্রহ করে রেকর্ড অফিসের চিঠিতে উল্লেখিত নথিপত্র সাথে আনুন। সহায়তার জন্য {{records_office_phone}} নম্বরে কল করুন।',
    mr: 'तुमची अपॉइंटमेंट {{appointment_date}} रोजी {{appointment_location}} येथे आहे. कृपया तुमच्या रेकॉर्ड कार्यालयाच्या पत्रात नमूद केलेली कागदपत्रे सोबत आणा. मदतीसाठी {{records_office_phone}} वर कॉल करा.',
    'mr-IN': 'तुमची अपॉइंटमेंट {{appointment_date}} रोजी {{appointment_location}} येथे आहे. कृपया तुमच्या रेकॉर्ड कार्यालयाच्या पत्रात नमूद केलेली कागदपत्रे सोबत आणा. मदतीसाठी {{records_office_phone}} वर कॉल करा.',
    kn: 'ನಿಮ್ಮ ಭೇಟಿಯ ಸಮಯ {{appointment_date}} ರಂದು {{appointment_location}} ನಲ್ಲಿ ನಿಗದಿಯಾಗಿದೆ. ದಯವಿಟ್ಟು ದಾಖಲೆ ಕಚೇರಿಯ ಪತ್ರದಲ್ಲಿ ತಿಳಿಸಲಾದ ದಾಖಲೆಗಳನ್ನು ತನ್ನಿ. ಸಹಾಯಕ್ಕಾಗಿ {{records_office_phone}} ಗೆ ಕರೆ ಮಾಡಿ.',
    'kn-IN': 'ನಿಮ್ಮ ಭೇಟಿಯ ಸಮಯ {{appointment_date}} ರಂದು {{appointment_location}} ನಲ್ಲಿ ನಿಗದಿಯಾಗಿದೆ. ದಯವಿಟ್ಟು ದಾಖಲೆ ಕಚೇರಿಯ ಪತ್ರದಲ್ಲಿ ತಿಳಿಸಲಾದ ದಾಖಲೆಗಳನ್ನು ತನ್ನಿ. ಸಹಾಯಕ್ಕಾಗಿ {{records_office_phone}} ಗೆ ಕರೆ ಮಾಡಿ.',
    ml: 'നിങ്ങളുടെ അപ്പോയിന്റ്മെന്റ് {{appointment_date}}-ന് {{appointment_location}}-ൽ ആണ്. റെക്കോർഡ്സ് ഓഫീസ് കത്തിൽ പറഞ്ഞിരിക്കുന്ന രേഖകൾ ദയവായി കൊണ്ടുവരിക. സഹായത്തിന് {{records_office_phone}} എന്ന നമ്പറിൽ വിളിക്കുക.',
    'ml-IN': 'നിങ്ങളുടെ അപ്പോയിന്റ്മെന്റ് {{appointment_date}}-ന് {{appointment_location}}-ൽ ആണ്. റെക്കോർഡ്സ് ഓഫീസ് കത്തിൽ പറഞ്ഞിരിക്കുന്ന രേഖകൾ ദയവായി കൊണ്ടുവരിക. സഹായത്തിന് {{records_office_phone}} എന്ന നമ്പറിൽ വിളിക്കുക.',
    gu: 'તમારી એપોઇન્ટમેન્ટ {{appointment_date}} ના રોજ {{appointment_location}} ખાતે છે. કૃપા કરીને તમારા રેકોર્ડ ઓફિસના પત્રમાં જણાવેલ દસ્તાવેજો સાથે લાવો. મદદ માટે {{records_office_phone}} પર કૉલ કરો.',
    'gu-IN': 'તમારી એપોઇન્ટમેન્ટ {{appointment_date}} ના રોજ {{appointment_location}} ખાતે છે. કૃપા કરીને તમારા રેકોર્ડ ઓફિસના પત્રમાં જણાવેલ દસ્તાવેજો સાથે લાવો. મદદ માટે {{records_office_phone}} પર કૉલ કરો.',
    pa: 'ਤੁਹਾਡੀ ਅਪਾਇੰਟਮੈਂਟ {{appointment_date}} ਨੂੰ {{appointment_location}} ਵਿਖੇ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ ਰਿਕਾਰਡ ਦਫ਼ਤਰ ਦੇ ਪੱਤਰ ਵਿੱਚ ਦੱਸੇ ਗਏ ਦਸਤਾਵੇਜ਼ ਨਾਲ ਲਿਆਓ। ਮਦਦ ਲਈ {{records_office_phone}} ਤੇ ਕਾਲ ਕਰੋ।',
    'pa-IN': 'ਤੁਹਾਡੀ ਅਪਾਇੰਟਮੈਂਟ {{appointment_date}} ਨੂੰ {{appointment_location}} ਵਿਖੇ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੇ ਰਿਕਾਰਡ ਦਫ਼ਤਰ ਦੇ ਪੱਤਰ ਵਿੱਚ ਦੱਸੇ ਗਏ ਦਸਤਾਵੇਜ਼ ਨਾਲ ਲਿਆਓ। ਮਦਦ ਲਈ {{records_office_phone}} ਤੇ ਕਾਲ ਕਰੋ।',
    or: 'ଆପଣଙ୍କର ଆପଏଣ୍ଟମେଣ୍ଟ {{appointment_date}} ରେ {{appointment_location}} ଠାରେ ଅଛି। ଦୟାକରି ରେକର୍ଡ ଅଫିସ୍ ଚିଠିରେ ଉଲ୍ଲେଖ ଥିବା ଦସ୍ତାବିଜଗୁଡ଼ିକ ସାଙ୍ଗରେ ଆଣନ୍ତୁ। ସହାୟତା ପାଇଁ {{records_office_phone}} କୁ କଲ୍ କରନ୍ତୁ।',
    'or-IN': 'ଆପଣଙ୍କର ଆପଏଣ୍ଟମେଣ୍ଟ {{appointment_date}} ରେ {{appointment_location}} ଠାରେ ଅଛି। ଦୟାକରି ରେକର୍ଡ ଅଫିସ୍ ଚିଠିରେ ଉଲ୍ଲେଖ ଥିବା ଦସ୍ତାବିଜଗୁଡ଼ିକ ସାଙ୍ଗରେ ଆଣନ୍ତୁ। ସହାୟତା ପାଇଁ {{records_office_phone}} କୁ କଲ୍ କରନ୍ତୁ।',
  },
  opd_slot_offer_v1: {
    en: 'An earlier OPD slot is available on {{appointment_date}} at {{appointment_location}}. Please confirm if you can attend with your verified records. For help call {{records_office_phone}}.',
    'en-IN': 'An earlier OPD slot is available on {{appointment_date}} at {{appointment_location}}. Please confirm if you can attend with your verified records. For help call {{records_office_phone}}.',
    hi: '{{appointment_date}} को {{appointment_location}} में एक पूर्व ओपीडी स्लॉट उपलब्ध है। कृपया पुष्टि करें कि क्या आप अपने सत्यापित दस्तावेज़ों के साथ उपस्थित हो सकते हैं। सहायता के लिए {{records_office_phone}} पर कॉल करें।',
    'hi-IN': '{{appointment_date}} को {{appointment_location}} में एक पूर्व ओपीडी स्लॉट उपलब्ध है। कृपया पुष्टि करें कि क्या आप अपने सत्यापित दस्तावेज़ों के साथ उपस्थित हो सकते हैं। सहायता के लिए {{records_office_phone}} पर कॉल करें।',
    ta: '{{appointment_date}} அன்று {{appointment_location}} இல் முந்தைய OPD நேரம் காலியாக உள்ளது. சரிபார்க்கப்பட்ட ஆவணங்களுடன் வர முடியுமா என்பதை உறுதிப்படுத்தவும். உதவிக்கு {{records_office_phone}} ஐ அழைக்கவும்.',
    'ta-IN': '{{appointment_date}} அன்று {{appointment_location}} இல் முந்தைய OPD நேரம் காலியாக உள்ளது. சரிபார்க்கப்பட்ட ஆவணங்களுடன் வர முடியுமா என்பதை உறுதிப்படுத்தவும். உதவிக்கு {{records_office_phone}} ஐ அழைக்கவும்.',
    te: '{{appointment_date}}న {{appointment_location}} వద్ద ముందస్తు OPD స్లాట్ అందుబాటులో ఉంది. ధృవీకరించబడిన రికార్డులతో మీరు హాజరు కాగలరా అని నిర్ధారించండి. సహాయం కోసం {{records_office_phone}}కు కాల్ చేయండి.',
    'te-IN': '{{appointment_date}}న {{appointment_location}} వద్ద ముందస్తు OPD స్లాట్ అందుబాటులో ఉంది. ధృవీకరించబడిన రికార్డులతో మీరు హాజరు కాగలరా అని నిర్ధారించండి. సహాయం కోసం {{records_office_phone}}కు కాల్ చేయండి.',
    bn: '{{appointment_date}} তারিখে {{appointment_location}}-এ একটি পূর্ববর্তী ওপিডি স্লট খালি আছে। আপনার যাচাইকৃত নথিপত্রসহ উপস্থিত হতে পারবেন কি না তা নিশ্চিত করুন। সহায়তার জন্য {{records_office_phone}} নম্বরে কল করুন।',
    'bn-IN': '{{appointment_date}} তারিখে {{appointment_location}}-এ একটি পূর্ববর্তী ওপিডি স্লট খালি আছে। আপনার যাচাইকৃত নথিপত্রসহ উপস্থিত হতে পারবেন কি না তা নিশ্চিত করুন। সহায়তার জন্য {{records_office_phone}} নম্বরে কল করুন।',
    mr: '{{appointment_date}} रोजी {{appointment_location}} येथे आधीचा ओपीडी स्लॉट उपलब्ध आहे. कृपया आपण आपल्या पडताळलेल्या कागदपत्रांसह उपस्थित राहू शकता का याची पुष्टी करा. मदतीसाठी {{records_office_phone}} वर कॉल करा.',
    'mr-IN': '{{appointment_date}} रोजी {{appointment_location}} येथे आधीचा ओपीडी स्लॉट उपलब्ध आहे. कृपया आपण आपल्या पडताळलेल्या कागदपत्रांसह उपस्थित राहू शकता का याची पुष्टी करा. मदतीसाठी {{records_office_phone}} वर कॉल करा.',
    kn: '{{appointment_date}} ರಂದು {{appointment_location}} ನಲ್ಲಿ ಮುಂಚಿನ OPD ಸಮಯ ಲಭ್ಯವಿದೆ. ನಿಮ್ಮ ಪರಿಶೀಲಿಸಿದ ದಾಖಲೆಗಳೊಂದಿಗೆ ಹಾಜರಾಗಲು ಸಾಧ್ಯವೇ ಎಂದು ದೃಢೀಕರಿಸಿ. ಸಹಾಯಕ್ಕಾಗಿ {{records_office_phone}} ಗೆ ಕರೆ ಮಾಡಿ.',
    'kn-IN': '{{appointment_date}} ರಂದು {{appointment_location}} ನಲ್ಲಿ ಮುಂಚಿನ OPD ಸಮಯ ಲಭ್ಯವಿದೆ. ನಿಮ್ಮ ಪರಿಶೀಲಿಸಿದ ದಾಖಲೆಗಳೊಂದಿಗೆ ಹಾಜರಾಗಲು ಸಾಧ್ಯವೇ ಎಂದು ದೃಢೀಕರಿಸಿ. ಸಹಾಯಕ್ಕಾಗಿ {{records_office_phone}} ಗೆ ಕರೆ ಮಾಡಿ.',
    ml: '{{appointment_date}}-ന് {{appointment_location}}-ൽ നേരത്തെയുള്ള ഒരു ഒപിഡി സ്ലോട്ട് ലഭ്യമാണ്. പരിശോധിച്ച രേഖകളുമായി എത്താൻ കഴിയുമോ എന്ന് സ്ഥിരീകരിക്കുക. സഹായത്തിന് {{records_office_phone}} എന്ന നമ്പറിൽ വിളിക്കുക.',
    'ml-IN': '{{appointment_date}}-ന് {{appointment_location}}-ൽ നേരത്തെയുള്ള ഒരു ഒപിഡി സ്ലോട്ട് ലഭ്യമാണ്. പരിശോധിച്ച രേഖകളുമായി എത്താൻ കഴിയുമോ എന്ന് സ്ഥിരീകരിക്കുക. സഹായത്തിന് {{records_office_phone}} എന്ന നമ്പറിൽ വിളിക്കുക.',
    gu: '{{appointment_date}} ના રોજ {{appointment_location}} ખાતે વહેલો ઓપીડી સ્લોટ ઉપલબ્ધ છે. કૃપા કરીને ખાતરી કરો કે તમે તમારા ચકાસાયેલ દસ્તાવેજો સાથે હાજર રહી શકો છો. મદદ માટે {{records_office_phone}} પર કૉલ કરો.',
    'gu-IN': '{{appointment_date}} ના રોજ {{appointment_location}} ખાતે વહેલો ઓપીડી સ્લોટ ઉપલબ્ધ છે. કૃપા કરીને ખાતરી કરો કે તમે તમારા ચકાસાયેલ દસ્તાવેજો સાથે હાજર રહી શકો છો. મદદ માટે {{records_office_phone}} પર કૉલ કરો.',
    pa: '{{appointment_date}} ਨੂੰ {{appointment_location}} ਵਿਖੇ ਇੱਕ ਪਹਿਲਾਂ ਵਾਲਾ ਓਪੀਡੀ ਸਲਾਟ ਉਪਲਬਧ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਪੁਸ਼ਟੀ ਕਰੋ ਕਿ ਕੀ ਤੁਸੀਂ ਆਪਣੇ ਤਸਦੀਕਸ਼ੁਦਾ ਦਸਤਾਵੇਜ਼ਾਂ ਨਾਲ ਆ ਸਕਦੇ ਹੋ। ਮਦਦ ਲਈ {{records_office_phone}} ਤੇ ਕਾਲ ਕਰੋ।',
    'pa-IN': '{{appointment_date}} ਨੂੰ {{appointment_location}} ਵਿਖੇ ਇੱਕ ਪਹਿਲਾਂ ਵਾਲਾ ਓਪੀਡੀ ਸਲਾਟ ਉਪਲਬਧ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਪੁਸ਼ਟੀ ਕਰੋ ਕਿ ਕੀ ਤੁਸੀਂ ਆਪਣੇ ਤਸਦੀਕਸ਼ੁਦਾ ਦਸਤਾਵੇਜ਼ਾਂ ਨਾਲ ਆ ਸਕਦੇ ਹੋ। ਮਦਦ ਲਈ {{records_office_phone}} ਤੇ ਕਾਲ ਕਰੋ।',
    or: '{{appointment_date}} ରେ {{appointment_location}} ଠାରେ ଏକ ପୂର୍ବ ଓପିଡି ସ୍ଲଟ୍ ଉପଲବ୍ଧ ଅଛି। ଆପଣ ଯାଞ୍ଚ ହୋଇଥିବା ଦସ୍ତାବିଜ ସହିତ ଯୋଗଦେଇ ପାରିବେ କି ନାହିଁ దୟାକରି ନିଶ୍ଚିତ କରନ୍ତୁ। ସହାୟତା ପାଇଁ {{records_office_phone}} କୁ କଲ୍ କରନ୍ତୁ।',
    'or-IN': '{{appointment_date}} ରେ {{appointment_location}} ଠାରେ ଏକ ପୂର୍ବ ଓପିଡି ସ୍ଲଟ୍ ଉପଲବ୍ଧ ଅଛି। ଆପଣ ଯାଞ୍ଚ ହୋଇଥିବା ଦସ୍ତାବିଜ ସହିତ ଯୋଗଦେଇ ପାରିବେ କି ନାହିଁ ଦୟାକରି ନିଶ୍ଚିତ କରନ୍ତୁ। ସହାୟତା ପାଇଁ {{records_office_phone}} କୁ କଲ୍ କରନ୍ତୁ।',
  },
};

export const SHORT_ELEVEN_LOCALES = [
  'en',
  'hi',
  'ta',
  'te',
  'bn',
  'mr',
  'kn',
  'ml',
  'gu',
  'pa',
  'or',
] as const;

export function toBcp47IndicCode(locale: string): SupportedLanguage {
  return normalizeLanguageCode(locale);
}

export interface SarvamTranslationConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export class SarvamTranslationAdapter {
  readonly name = 'sarvam-mayura';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SarvamTranslationConfig = {}) {
    this.apiKey = (config.apiKey ?? process.env['SARVAM_API_KEY'] ?? '').trim();
    this.baseUrl = (config.baseUrl ?? process.env['SARVAM_BASE_URL'] ?? 'https://api.sarvam.ai').replace(/\/$/, '');
    this.model = config.model ?? 'mayura:v1';
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey !== 'your_key_here' && !this.apiKey.startsWith('your_'));
  }

  async translate(input: TranslationInput): Promise<TranslationResult> {
    const sourceCode = toBcp47IndicCode(input.sourceLanguageCode ?? 'en-IN');
    const targetCode = toBcp47IndicCode(input.targetLanguageCode);

    if (sourceCode === targetCode || !input.text.trim()) {
      return {
        translatedText: input.text,
        sourceLanguageCode: sourceCode,
        targetLanguageCode: targetCode,
        provider: 'deterministic-template',
      };
    }

    if (!this.isConfigured()) {
      const isSlot = /slot|opd|earlier/i.test(input.text);
      const templateMap = isSlot
        ? ELEVEN_LOCALE_TEMPLATES.opd_slot_offer_v1
        : ELEVEN_LOCALE_TEMPLATES.appointment_reminder;
      const translated = templateMap[targetCode] ?? templateMap[targetCode.split('-')[0]!] ?? input.text;
      return {
        translatedText: translated,
        sourceLanguageCode: sourceCode,
        targetLanguageCode: targetCode,
        provider: 'deterministic-template',
      };
    }

    // Sarvam API uses 'od-IN' for Odia in some endpoints; normalize if needed
    const apiTarget = targetCode === 'or-IN' ? 'od-IN' : targetCode;
    const apiSource = sourceCode === 'or-IN' ? 'od-IN' : sourceCode;

    const response = await this.fetchImpl(`${this.baseUrl}/translate`, {
      method: 'POST',
      headers: {
        'api-subscription-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: input.text,
        source_language_code: apiSource,
        target_language_code: apiTarget,
        speaker_gender: 'Female',
        mode: 'formal',
        model: this.model,
        enable_preprocessing: true,
      }),
    });

    if (!response.ok) {
      throw new SarvamError(`Sarvam translate HTTP ${response.status}`, response.status, response.status >= 500 || response.status === 429);
    }

    const data = (await response.json()) as { translated_text?: string };
    if (!data.translated_text) {
      throw new SarvamError('Sarvam translate returned empty translated_text', 502, false);
    }

    return {
      translatedText: data.translated_text,
      sourceLanguageCode: sourceCode,
      targetLanguageCode: targetCode,
      provider: 'sarvam-mayura',
    };
  }
}
