'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import LanguageToggle from './LanguageToggle';
import ThemeSwitch from './ThemeSwitch';
import { useLanguage } from '../context/LanguageContext';
import { useUser } from '../context/UserContext';

export default function Navbar() {
  const { t } = useLanguage();
  const { user } = useUser();

  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-[#0B0C10]/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0 flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">R</div>
            <span className="font-bold text-xl text-gray-900 dark:text-white tracking-tight">Referandium</span>
          </Link>

          {/* Center Links */}
          <div className="hidden md:flex space-x-8 items-center">
            <Link href="/markets" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition">
              {t('markets')}
            </Link>
            <Link href="/gookies" className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 font-medium transition">
              <span>🍪</span> Gookies
            </Link>
            <Link href="/docs" className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition">
              <span>📖</span> Docs
            </Link>
            <Link href="/admin" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition">
              {t('admin')}
            </Link>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            <ThemeSwitch />
            <LanguageToggle />
            <Link 
              href="/profile" 
              className="bg-transparent text-gray-700 dark:text-gray-300 px-4 py-1.5 rounded-full font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition flex items-center gap-2 text-sm"
            >
              {user ? (
                <>
                  <img
                    src={user.avatar_url || ''}
                    alt={user.username}
                    className="w-6 h-6 rounded-full bg-gray-200"
                  />
                  <span className="hidden sm:inline">{user.username}</span>
                </>
              ) : (
                <>
                  <Users size={16} />
                  {t('myProfile')}
                </>
              )}
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
