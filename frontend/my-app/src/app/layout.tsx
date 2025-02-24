import './globals.css';
import DarkModeToggle from './DarkModeToggle';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <header className="p-4 flex justify-end">
          <DarkModeToggle />
        </header>
        {children}
      </body>
    </html>
  );
}
