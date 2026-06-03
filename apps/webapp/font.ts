import { DM_Sans, Roboto_Mono } from "next/font/google";

export const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["400", "500", "700"],
});

export const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
  display: "swap",
  weight: ["400", "500", "700"],
});

const Fonts = { dmSans, robotoMono };
export default Fonts;
