import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from './components/AppContext'
import { TopNavigation } from './components/TopNavigation'

export const metadata: Metadata = {
  title: "PDF Vote Tracking System",
  description: "City council meeting vote tracking and analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <AppProvider>
          <div className="min-h-screen flex flex-col bg-gray-50">
            <TopNavigation />
            <main className="flex-1">
              {children}
            </main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
