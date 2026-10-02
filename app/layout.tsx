import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "../components/navigation/artwork-navigation.css";
import AdminPendingAlerts from "@/components/admin/AdminPendingAlerts";
import CupSignupAnnouncement from "@/components/announcements/CupSignupAnnouncement";
import MastersLiveAnnouncement from "@/components/announcements/MastersLiveAnnouncement";
import OptionalSignInWelcome from "@/components/auth/OptionalSignInWelcome";
import MastersRoomReminder from "@/components/home/MastersRoomReminder";
import { CUP_SIGNUP_ANNOUNCEMENT_ENABLED } from "@/lib/cupSignupAnnouncement";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://krysleagues.com"),
  title: "Krys Leagues",
  description: "Walkabout Mini Golf leagues, tournaments, standings, and player history.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <AdminPendingAlerts />
        <OptionalSignInWelcome />
        {CUP_SIGNUP_ANNOUNCEMENT_ENABLED ? <CupSignupAnnouncement /> : null}
        <MastersLiveAnnouncement />
        <MastersRoomReminder />
      </body>
    </html>
  );
}
