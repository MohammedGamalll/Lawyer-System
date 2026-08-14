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

const applyDir = (lng: string) => {
  document.documentElement.dir = lng === 'en' ? 'ltr' : 'rtl'
  document.documentElement.lang = lng === 'en' ? 'en' : 'ar'
}
applyDir(i18n.language)
i18n.on('languageChanged', applyDir)

export default i18n
