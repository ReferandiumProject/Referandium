'use client';

import { Mail, Github } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '../context/LanguageContext';

function XIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-gray-900 text-white border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          
          {/* Bölüm 1: Logo ve Açıklama */}
          <div>
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 mb-4">
              Referandium
            </h2>
            <p className="text-gray-400 leading-relaxed text-sm">
              {t('footerDesc')}
            </p>
          </div>

          {/* Bölüm 2: Hızlı Linkler */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">{t('quickLinks')}</h3>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>
                <Link href="/" className="hover:text-blue-400 transition">{t('home')}</Link>
              </li>
              <li>
                <Link href="/markets" className="hover:text-blue-400 transition">{t('markets')}</Link>
              </li>
              <li>
                <Link href="/profile" className="hover:text-blue-400 transition">{t('myProfile')}</Link>
              </li>
              <li>
                <Link href="#" className="hover:text-blue-400 transition">{t('howItWorks')}</Link>
              </li>
            </ul>
          </div>

          {/* Bölüm 3: İletişim ve Sosyal Medya */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">{t('connect')}</h3>
            <div className="flex space-x-4 mb-6">
              <a href="https://x.com/referandium" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-blue-600 transition group">
                <XIcon size={18} className="text-gray-400 group-hover:text-white" />
              </a>
              <a href="https://github.com/ReferandiumProject/Referandium" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-purple-600 transition group">
                <Github size={20} className="text-gray-400 group-hover:text-white" />
              </a>
              <a href="mailto:hello@referandium.com" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-green-600 transition group">
                <Mail size={20} className="text-gray-400 group-hover:text-white" />
              </a>
            </div>
            <p className="text-gray-500 text-xs">
              {t('builtWith')}
            </p>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
          <p>&copy; {t('allRightsReserved')}</p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-white transition">{t('privacyPolicy')}</a>
            <a href="#" className="hover:text-white transition">{t('termsOfService')}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}