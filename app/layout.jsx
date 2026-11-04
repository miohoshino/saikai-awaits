import { Dela_Gothic_One, Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

const zenMaru = Zen_Maru_Gothic({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-zen-maru"
});

const delaGothic = Dela_Gothic_One({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-dela"
});

export const metadata = {
  title: "SAIKAI AWAITS",
  description: "西海の人とコミュニティをつなぐ会員制ネットワーク"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja" className={`${zenMaru.variable} ${delaGothic.variable}`}>
      <body>{children}</body>
    </html>
  );
}
