-- ── What the coach told each telecaller ──
insert into public.coach_briefs (salesperson_id, brief_date, slot, company_id, content)
select v.sp::uuid, (now() at time zone 'Asia/Kolkata')::date + v.dd, v.slot, 'de000000-0000-4000-8000-000000000001', v.content
from (values
  ('de000000-0000-4000-8000-0000000000a1', 0, 'morning',
   'Yesterday: 41 calls, 17 real talks, 2 visits fixed. 🎯
Best moment: you sent the site video to the Gupta family group before they asked.
Today: call the 3 visits from Sunday first, before 12.'),
  ('de000000-0000-4000-8000-0000000000a1', 0, 'tip',
   'When a buyer says "rate zyada hai", start with the 100 gaj plot at ₹18.5 lakh and the 3-part plan, not a discount.'),
  ('de000000-0000-4000-8000-0000000000a1', -1, 'evening',
   'Today: 38 calls, 15 real talks. 2 site visits fixed for the weekend. 👏
Tomorrow: 4 follow-ups are due before 11. Do them first.'),
  ('de000000-0000-4000-8000-0000000000a2', 0, 'morning',
   'Yesterday: 34 calls, 11 real talks, 1 visit fixed.
Best moment: you asked "own house or investment?" and the buyer opened up.
Today: 2 leads did not pick up 3 times. Try them after 6 PM.'),
  ('de000000-0000-4000-8000-0000000000a2', 0, 'tip',
   'End every call with two days to choose from: "Saturday or Sunday?" A buyer picks one far more often than they say yes to "let me know".'),
  ('de000000-0000-4000-8000-0000000000a3', 0, 'morning',
   'Yesterday: 29 calls, 12 real talks. 💪
Best moment: the loan answer for Sunrise Heights calmed a worried buyer.
Today: confirm tomorrow''s 2 visits on WhatsApp by 6 PM.'),
  ('de000000-0000-4000-8000-0000000000a3', 0, 'tip',
   'Before a visit, send the location pin and the driver''s number the evening before. No-shows drop when the family knows who is coming.')
) as v(sp, dd, slot, content);

insert into public.coach_qa (company_id, salesperson_id, question, answer, created_at)
select 'de000000-0000-4000-8000-000000000001', v.sp::uuid, v.qn, v.an, pg_temp.d(v.dd, v.clk)
from (values
  ('de000000-0000-4000-8000-0000000000a1', 'Buyer says the location is far. What do I say?',
   'Say it is 25 minutes from Pari Chowk and 12 km from the airport, and that the distance is why the rate is still ₹18,500 a gaj. Invite the family once: "If you do not like it, I will not call again."', -1, '15:12'),
  ('de000000-0000-4000-8000-0000000000a1', 'He wants to talk to his wife first. Should I wait?',
   'Do not wait. Offer to send the 1-minute site video to the family WhatsApp group now, and give two days for a family visit with free pickup.', 0, '10:05'),
  ('de000000-0000-4000-8000-0000000000a2', 'What is the booking amount for Sunrise Heights?',
   '₹1,00,000 to book. Up to 80% of the price can be on loan; 3 banks have approved the project.', -2, '12:40'),
  ('de000000-0000-4000-8000-0000000000a2', 'Buyer says he will wait for the price to drop.',
   'Tell him the rate went up twice this year by ₹500 a gaj, and booking this month locks today''s rate even if he pays in parts.', -1, '17:25'),
  ('de000000-0000-4000-8000-0000000000a3', 'How do I answer "how can I trust you"?',
   'Share that 112 families have registry in Phase 1, offer two of their numbers, and say their lawyer can check the papers before any payment.', -3, '11:30'),
  ('de000000-0000-4000-8000-0000000000a3', 'Loan buyer, salaried, 45k a month. Which flat?',
   'The 2 BHK at ₹58 lakh fits better. Ask if a co-applicant (spouse) earns too; it raises the loan amount. Invite them to the loan desk on the visit day.', 0, '09:50')
) as v(sp, qn, an, dd, clk);

