import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '@/components/Providers';
import { GNB } from '@/components/layout';

const pretendard = localFont({
  src: '../public/fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Quant Trade Dashboard',
  description: '퀀트 트레이딩 대시보드',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='ko' className={`${pretendard.variable} ${geistMono.variable}`}>
      <body className='font-sans antialiased'>
        <Providers>
          <div className='min-h-screen bg-[#0a0a0a] bg-pattern relative overflow-hidden'>
            {/* 배경 장식 */}
            <div className='absolute top-0 left-0 w-[500px] h-[500px] bg-gray-500/10 rounded-full blur-[120px] -translate-x-1/3 -translate-y-1/3'></div>
            <div className='absolute bottom-0 right-0 w-[400px] h-[400px] bg-gray-600/8 rounded-full blur-[100px] translate-x-1/4 translate-y-1/4'></div>
            <div className='absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-gray-400/5 rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2'></div>

            {/* GNB */}
            <GNB />

            {/* 메인 콘텐츠 */}
            <main className='relative z-10'>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
