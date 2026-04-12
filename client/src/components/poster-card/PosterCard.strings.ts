import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    badge4K: "4K",
    badgeHD: "HD",
  },
});

const PLAY_QUOTES = [
  "Here's looking at you, kid",
  "I'll be back",
  "You can't handle the truth!",
  "May the Force be with you",
  "Why so serious?",
  "I see dead people",
  "You talking to me?",
  "Here's Johnny!",
  "Make my day",
  "I am your father",
  "We're gonna need a bigger boat",
  "Hasta la vista, baby",
  "Show me the money!",
  "Roads? Where we're going...",
  "There's no place like home",
  "Just keep swimming",
  "To infinity and beyond!",
  "Life is like a box of chocolates",
  "Say hello to my little friend",
  "You had me at hello",
];

export function playQuoteForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PLAY_QUOTES[hash % PLAY_QUOTES.length];
}
