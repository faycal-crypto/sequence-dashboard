import "./globals.css";

export const metadata = {
  title: "RevOps Bounce Rate Dashboard",
  description: "Live HubSpot sequence bounce monitoring for Landed",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
