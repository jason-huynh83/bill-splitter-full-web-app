import { ReactNode } from 'react';
import './globals.css';  // Import global styles

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}