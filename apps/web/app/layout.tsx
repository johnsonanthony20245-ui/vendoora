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

// Inline pre-hydration script: sets data-theme on <html> before React paints,
// so users who chose dark last visit (or whose OS is dark) never see a
// flash-of-light. The script is intentionally minimal and self-contained.
const themeBootstrap = `try{var t=localStorage.getItem('vdr-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
