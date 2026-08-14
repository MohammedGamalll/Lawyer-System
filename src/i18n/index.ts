import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './ar'
import en from './en'

i18n.use(initReactI18next).init({
  lng: 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
  resources: { ar: { translation: ar }, en: { translation: en } }
})

export default i18n
