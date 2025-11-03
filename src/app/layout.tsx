import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Layout from "./layout_component"; // Import the custom layout
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Resume Analyzer Pro",
  description: "AI-Powered Resume Feedback",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-primary">Loading...</p></div>}>
          <AuthProvider>
            <Layout>{children}</Layout>
          </AuthProvider>
        </Suspense>
      </body>
    </html>
  );
}

