-- ── What the AI coach knows about this company ──
-- Objection → winning reply, written the way a good telecaller actually says
-- it, plus one fact sheet per project. These are company-scoped rows in the
-- one shared brain (match_knowledge). They have no embedding yet: the admin's
-- Demo account page sends each one through knowledge-ingest once, which adds it.
insert into public.knowledge_chunks (company_id, source_kind, source_id, title, content) values
('de000000-0000-4000-8000-000000000001', 'faq', 'demo:objection:too-expensive', 'Objection: "Too expensive"',
 'Buyer says: "Rate bahut zyada hai" / "It is too expensive."
Winning reply: Agree first, then make the number smaller. "Sir, I understand. That is why most families here start with the 100 gaj plot at ₹18.5 lakh, not the 150. And you do not pay it at once: ₹51,000 to book, then 3 parts over 90 days." Then ask: "Which number would feel comfortable for you every month?"
Why it works: it moves the talk from the total price to a plan they can say yes to. Never drop the rate on the first call.'),
('de000000-0000-4000-8000-000000000001', 'faq', 'demo:objection:discuss-with-family', 'Objection: "Will discuss with family"',
 'Buyer says: "Ghar pe baat karke batata hoon" / "I will discuss with my family."
Winning reply: "Of course, it is a family decision. Shall I send a 1-minute site video for your family WhatsApp group right now? And if they want to see it, our car can pick all of you up on Sunday at 11. Which is better for them, Saturday or Sunday?"
Why it works: the family is the real decision maker, so bring them in instead of waiting. Always end with a choice of two days, not "let me know".'),
('de000000-0000-4000-8000-000000000001', 'faq', 'demo:objection:location-far', 'Objection: "Location is far"',
 'Buyer says: "Location bahut door hai" / "It is too far."
Winning reply: "Sir, it is 25 minutes from Pari Chowk on the expressway, and the airport is 12 km away. Today it feels far; that is exactly why the rate is still ₹18,500 a gaj. Come once with the family. If you do not like it, I will not call you again."
Why it works: it turns distance into the reason for the price, and the promise not to call again lowers the risk of saying yes to a visit.'),
('de000000-0000-4000-8000-000000000001', 'faq', 'demo:objection:just-send-details', 'Objection: "Just send details on WhatsApp"',
 'Buyer says: "WhatsApp pe details bhej do."
Winning reply: "Sending it right now. One quick question so I send the right plot: is this for your own house or for investment?" Then: "Perfect, I am sending the 2 options that fit. I will call you at 7 tonight for 2 minutes to explain the payment plan, is that fine?"
Why it works: details alone go unread. One question keeps the call alive, and a fixed time is a promise the buyer agreed to.'),
('de000000-0000-4000-8000-000000000001', 'faq', 'demo:objection:loan', 'Objection: "Need a loan first"',
 'Buyer says: "Loan ho jayega to lenge."
Winning reply: "Good news, Sunrise Heights is approved by 3 banks, so the loan goes faster. Up to 80% of the price can be on loan. If you come for the visit, our loan desk can check your eligibility the same day, free."
Why it works: it removes the unknown. A buyer who knows the loan is possible stops using it as a reason to wait.'),
('de000000-0000-4000-8000-000000000001', 'faq', 'demo:objection:price-will-drop', 'Objection: "I will wait, price may drop"',
 'Buyer says: "Abhi ruk jaate hain, rate kam ho sakta hai."
Winning reply: "Sir, the rate has gone up twice this year, ₹500 a gaj each time, and the next revision is at the end of the quarter. If you book this month, today''s rate is locked even if you pay later in parts."
Why it works: it is a fact, not pressure, and "locked rate" gives a reason to act now without discounting.'),
('de000000-0000-4000-8000-000000000001', 'faq', 'demo:objection:trust', 'Objection: "How do I trust the builder?"',
 'Buyer says: "Bharosa kaise karein?"
Winning reply: "Very fair question. 112 families already have registry in Sunrise Greens Phase 1. I can share 2 of their numbers, and on the visit you can see the houses being built. All papers are with our legal desk; your lawyer can check them before you pay anything."
Why it works: proof from people like them beats any promise from the telecaller.'),
('de000000-0000-4000-8000-000000000001', 'price', 'demo:project:sunrise-greens', 'Sunrise Greens · plots · price and facts',
 'Sunrise Greens (demo project): residential plots of 100, 120, 150 and 200 gaj, 25 minutes from Pari Chowk, 12 km from the airport. Rate ₹18,500 a gaj (corner +5%). 100 gaj = ₹18.5 lakh. Booking amount ₹51,000, then 3 parts over 90 days. 112 families have registry in Phase 1. Free site pickup on Saturday and Sunday.'),
('de000000-0000-4000-8000-000000000001', 'price', 'demo:project:sunrise-heights', 'Sunrise Heights · flats · price and facts',
 'Sunrise Heights (demo project): 2 BHK (1,050 sq ft) from ₹58 lakh and 3 BHK (1,450 sq ft) from ₹79 lakh. Possession in 18 months. Approved by 3 banks, up to 80% loan. Sample flat open every day 10 AM to 6 PM. Booking amount ₹1,00,000.'),
('de000000-0000-4000-8000-000000000001', 'price', 'demo:project:sunrise-farm-villas', 'Sunrise Farm Villas · price and facts',
 'Sunrise Farm Villas (demo project): farm plots of 1,000 and 1,500 sq yd with boundary wall, gate and drip irrigation, 40 minutes from the city. From ₹42 lakh. Weekend buyers and NRIs. Booking amount ₹1,00,000.');

