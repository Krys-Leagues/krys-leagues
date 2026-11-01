import type { Metadata } from "next"
import "./globals.css"
import "../components/navigation/artwork-navigation.css"

export const metadata: Metadata = {
  title: "KWT · Krys Weekly Tournament",
  description: "The independent Krys Weekly Tournament League Hub.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
