import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from './components/AppContext'
import { Sidebar } from './components/Sidebar'
import { TopNavigation } from './components/TopNavigation'

export const metadata: Metadata = {
  title: "Vote Tracking System",
  description: "City council meeting vote tracking and analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-white">
        <AppProvider>
          <div className="min-h-screen flex bg-white">
            <Sidebar />
            <div className="flex-1 flex flex-col bg-white">
              <TopNavigation />
              <main className="flex-1 p-6 bg-white">
                {children}
              </main>
            </div>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
