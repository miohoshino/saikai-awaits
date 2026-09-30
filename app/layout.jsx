import "./globals.css";

export const metadata = {
  title: "SAIKAI AWAITS",
  description: "西海の人・イベント・コミュニティ・仕事をつなぐ会員制ネットワーク"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
