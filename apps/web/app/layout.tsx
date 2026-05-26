import type { ReactNode } from 'react';
import { Inter_Tight, Fraunces, JetBrains_Mono } from 'next/font/google';
import { Header } from '../components/Header';
import './globals.css';

// Inter Tight — workhorse, 95% of the system (Build_Prompt §9 / brand spec).
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter-tight',
  display: 'swap',
});

// Fraunces — marketing storytelling surfaces only (display headlines).
// Loaded as a variable font so weight + optical-size axes both work.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

// JetBrains Mono — numbers, codes, monospaced UI.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Vendoora — verified Liberian marketplace',
  description:
    'Buy and send to Liberia with verified sellers, escrow protection, and code-verified delivery.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
