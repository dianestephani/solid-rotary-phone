import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CRM Automation",
  description: "Automated outreach for email leads",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
