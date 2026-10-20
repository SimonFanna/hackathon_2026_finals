export const scenes = [
  { eyebrow: "NEW QUEST UNLOCKED", title: "His first home.\nWhat could go wrong?", body: "Meet Thomas. 30. A house in Gent, a garden, and a whole new chapter. All he wants is to move in before his lease ends.", action: "Start Thomas’s year", thought: "Found it. This is the one." },
  { eyebrow: "LEVEL 01 / THE HIDDEN LOAD", title: "The asking price\nis just the start.", body: "Buying, financing, renovating. One dream becomes a stack of costs he has to piece together himself.", action: "And then there’s the paperwork", thought: "Wait. What’s my actual budget?" },
  { eyebrow: "LEVEL 02 / NO TUTORIAL", title: "First home.\nFirst time doing\nany of this.", body: "Which works first? Which grants? Which expert? Thomas has to know what to ask before he can even ask for help.", action: "Meet the whole team", thought: "Am I missing something important?" },
  { eyebrow: "LEVEL 03 / YOU ARE THE COORDINATOR", title: "Everyone has a piece.\nHe needs the\nwhole picture.", body: "The bank. The notary. The contractors. Every conversation changes a different part of the same plan. Thomas is the connection between them.", action: "Fast-forward. Life happens.", thought: "Who’s checking this all still fits?" },
  { eyebrow: "UNEXPECTED EVENT / 01", title: "The rate changes.\nThe monthly\nbudget breaks.", body: "Between the simulation and the offer, repayments rise. The repayment changed. His monthly limit didn’t.", action: "Fast-forward to month 4", thought: "It was affordable last week." },
  { eyebrow: "UNEXPECTED EVENT / 02", title: "New quote.\nSame dream.\nBigger problem.", body: "The renovation quote comes in above the estimate. What should he change: the works, the financing, or the move-in date?", action: "Fast-forward to month 6", thought: "Can I still make this work?" },
  { eyebrow: "UNEXPECTED EVENT / 03", title: "The works slip.\nHis lease doesn’t.", body: "The contractor is three months late. One delay now affects the works, the move, and the money left in his account.", action: "Fast-forward to month 9", thought: "Where am I supposed to live?" },
  { eyebrow: "UNEXPECTED EVENT / 04", title: "His income changes.\nThe repayments\ndon’t.", body: "Thomas loses his job. His affordable monthly limit falls, while the existing plan keeps going.", action: "See where the plan ends up", thought: "Which decision do I make first?" },
  { eyebrow: "QUEST STATUS / OFF TRACK", title: "The plan broke.\nThe dream\nshouldn’t have to.", body: "Every decision made sense on its own. Together, the unchanged plan no longer fits his life.", action: "There’s another way to play", thought: "I needed a plan that could change." },
  { eyebrow: "SAME PLAYER. ANOTHER WAY FORWARD.", title: "Rewind the year.\nGive Thomas\na co-pilot.", body: "Same goal. Same four setbacks. This time, Kate helps connect the steps, compare the options, and adapt the plan. Thomas stays in control.", action: "Replay with Kate", thought: "Let’s figure this out. Together." },
] as const;

export const unknowns = ["EPC label?", "Renovation grants?", "Asbestos?", "Insulate first?", "Heat pump or boiler?", "Notary deed?", "Energy loan?", "Which insurance?"];
export const providers = [
  { name: "Notary", message: "Can you send the signed documents?", icon: "DOC" },
  { name: "Bank", message: "Your updated financing offer is ready.", icon: "EUR" },
  { name: "Contractor", message: "We need to revise the estimate.", icon: "FIX" },
  { name: "Grants office", message: "Have you checked your eligibility?", icon: "ASK" },
  { name: "Landlord", message: "Confirming your move-out date.", icon: "KEY" },
];

export const facts = {
  grants: "https://www.kbc.com/content/dam/kbccom/doc/newsroom/pressreleases/2026/20260129%20MyHome_EN.pdf",
};
