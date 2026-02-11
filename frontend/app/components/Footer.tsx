import { Twitter, Send, Mail, Github } from 'lucide-react';
import Link from 'next/link';

export default function Footer() {
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
              The first Policy Prescription Market on Solana. 
              Empowering communities to move beyond prediction and actively prescribe the future.
            </p>
          </div>

          {/* Bölüm 2: Hızlı Linkler */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">Quick Links</h3>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>
                <Link href="/" className="hover:text-blue-400 transition">Home</Link>
              </li>
              <li>
                <Link href="/markets" className="hover:text-blue-400 transition">Markets</Link>
              </li>
              <li>
                <Link href="/profile" className="hover:text-blue-400 transition">My Profile</Link>
              </li>
              <li>
                <Link href="#" className="hover:text-blue-400 transition">How it Works</Link>
              </li>
            </ul>
          </div>

          {/* Bölüm 3: İletişim ve Sosyal Medya */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">Connect</h3>
            <div className="flex space-x-4 mb-6">
              <a href="#" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-blue-600 transition group">
                <Twitter size={20} className="text-gray-400 group-hover:text-white" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-blue-500 transition group">
                <Send size={20} className="text-gray-400 group-hover:text-white" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-purple-600 transition group">
                <Github size={20} className="text-gray-400 group-hover:text-white" />
              </a>
              <a href="mailto:contact@referandium.com" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-green-600 transition group">
                <Mail size={20} className="text-gray-400 group-hover:text-white" />
              </a>
            </div>
            <p className="text-gray-500 text-xs">
              Built with ❤️ on Solana Blockchain.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
          <p>&copy; 2026 Referandium. All rights reserved.</p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-white transition">Privacy Policy</a>
            <a href="#" className="hover:text-white transition">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}