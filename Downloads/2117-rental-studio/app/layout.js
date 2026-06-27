export const metadata = { title: "2117 Rental — Content Studio" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#000" }}>{children}</body>
    </html>
  );
}
