#!/usr/bin/env python3
"""
Writes the demo company migration (supabase/migrations/0222_...sql).

The demo is a made-up builder, "Sunrise Infra", with 30 days of Meta leads on
Call Pro AI. The numbers are kept modest on purpose: a founder believes a story
where the ad money comes back, not one where everybody gets rich.

    Meta spend   Rs 1,00,000 in 30 days, 3 lead-form campaigns
    Leads        600
    Site visits  45 happened, 9 more booked for the coming week
    Bookings     5 (3 won, 2 token paid)  ->  about Rs 20,000 per booking
    Saved        9 buyers who reached a visit only because Call Pro AI
                 put them back in front of the telecaller

Deterministic: the same seed always writes the same file. Every timestamp is
written as pg_temp.d(<day offset>, '<IST clock>') so the data is "today" on
whatever day the founder applies it, and public.demo_refresh() moves it forward
later.

Usage:
    python3 supabase/demo/generate_demo_seed.py --hash-file <bcrypt hash file> \
        --junk-hash-file <bcrypt hash of a thrown-away password> > out.sql
The plain demo password is never in this repo; only its bcrypt hash is.
"""
import argparse
import json
import random

R = random.Random(20261009)

DEMO = "de000000-0000-4000-8000-000000000001"
NEHA = "de000000-0000-4000-8000-0000000000a1"
RAHUL = "de000000-0000-4000-8000-0000000000a2"
POOJA = "de000000-0000-4000-8000-0000000000a3"
REPS = [NEHA, RAHUL, POOJA]
REP_WEIGHTS = [0.40, 0.34, 0.26]
REP_NAME = {NEHA: "Neha Sharma (Demo)", RAHUL: "Rahul Verma (Demo)", POOJA: "Pooja Singh (Demo)"}
DEMO_EMAIL = "demo.telecaller@callproai.in"

GREENS, HEIGHTS, FARMS = "Sunrise Greens", "Sunrise Heights", "Sunrise Farm Villas"
CAMPAIGNS = [
    # project, campaign name, share of Rs 1,00,000, leads
    (GREENS, "Sunrise Greens · Plots · Lead form", 55000, 330),
    (HEIGHTS, "Sunrise Heights · 2 & 3 BHK · Lead form", 33000, 210),
    (FARMS, "Sunrise Farm Villas · Lead form", 12000, 60),
]

MALE = """Amit Rajesh Sunil Vikas Deepak Manoj Sanjay Rakesh Anil Vinod Ashok Pankaj Rohit Gaurav Nitin
Saurabh Vivek Arun Harish Mukesh Naveen Pradeep Ravi Sachin Tarun Yogesh Ajay Kapil Lalit Mohit
Narendra Om Prakash Rahul Sumit Tushar Umesh Varun Abhishek Ankit Bharat Chetan Dinesh Gopal Hemant
Jitendra Kuldeep Mahesh Neeraj Parveen Rajiv Shyam Vijay Aakash Devendra Imran Salman Farhan Gurpreet
Harpreet Manpreet Jasbir Rohan Karan Arjun Aditya Siddharth Kunal Akshay""".split()
FEMALE = """Priya Sunita Anjali Neelam Pooja Kavita Rekha Seema Meena Nisha Shalini Anita Ritu Payal Swati
Pallavi Jyoti Komal Preeti Shweta Mamta Geeta Asha Rashmi Sapna Divya Monika Sarita Babita Nidhi
Heena Farah Simran Harleen Megha Ruchi Tanvi Ishita Aarti Vandana""".split()
SURNAMES = """Sharma Verma Gupta Singh Yadav Chauhan Agarwal Jain Bansal Goel Mittal Tyagi Saini Rawat Bhatia
Malhotra Kapoor Khanna Arora Chopra Sethi Tomar Rathi Garg Mehta Joshi Pandey Mishra Tiwari Dubey
Shukla Srivastava Saxena Nagar Bhati Gurjar Dagar Choudhary Kumar Rana Negi Bisht Thakur Ahmed
Khan Ansari Qureshi Siddiqui Gill Sandhu Dhillon Bedi Nair Menon Iyer Reddy Rao Das Bose
Banerjee Ghosh Patel Shah Desai""".split()

PLACES = ["Noida Sector 62", "Ghaziabad", "Greater Noida", "Delhi (Laxmi Nagar)", "Delhi (Dwarka)",
          "Faridabad", "Gurugram", "Mathura", "Aligarh", "Bulandshahr", "Hapur", "Meerut", "Agra",
          "Delhi (Rohini)", "Noida Extension"]

BUDGET = {
    GREENS: ["₹18-22 lakh", "₹20-25 lakh", "₹25-30 lakh", "₹28 lakh", "₹30-35 lakh", "Under ₹20 lakh"],
    HEIGHTS: ["₹55-60 lakh", "₹60-70 lakh", "₹65 lakh", "₹70-80 lakh", "₹80-90 lakh"],
    FARMS: ["₹40-50 lakh", "₹50-60 lakh", "₹60-75 lakh"],
}
UNIT = {
    GREENS: ["100 gaj plot", "120 gaj plot", "150 gaj plot", "200 gaj plot"],
    HEIGHTS: ["2 BHK", "2 BHK + study", "3 BHK"],
    FARMS: ["1,000 sq yd farm plot", "1,500 sq yd farm plot"],
}
PURPOSE = ["own house", "investment", "for parents", "own house, near airport", "investment, resale after 3 years"]


def q(s):
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"


def t(day, clock):
    return f"pg_temp.d({day},'{clock}')"


def clock(minutes):
    minutes = max(0, min(minutes, 23 * 60 + 59))
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


class Moment:
    __slots__ = ("day", "m")

    def __init__(self, day, m):
        self.day, self.m = day, m

    def key(self):
        return self.day * 1440 + self.m

    def plus(self, mins):
        k = self.key() + mins
        return Moment(k // 1440, k % 1440)

    def sql(self):
        return t(self.day, clock(self.m))

    def args(self):
        return f"{self.day},'{clock(self.m)}'"


NOW_TODAY_LIMIT = 11 * 60 + 40   # calls "today" stay before 11:40 IST


def work_slot(day, lo=9 * 60 + 35, hi=19 * 60 + 20):
    if day == 0:
        hi = min(hi, NOW_TODAY_LIMIT)
    return Moment(day, R.randint(lo, max(lo, hi)))


# ───────────────────────── leads ─────────────────────────
def build_names(n):
    seen, out = set(), []
    while len(out) < n:
        female = R.random() < 0.32
        first = R.choice(FEMALE if female else MALE)
        name = f"{first} {R.choice(SURNAMES)}"
        if name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hash-file", required=True)
    ap.add_argument("--junk-hash-file", required=True)
    a = ap.parse_args()
    pw_hash = open(a.hash_file).read().strip()
    junk_hash = open(a.junk_hash_file).read().strip()
    assert pw_hash.startswith("$2a$") and junk_hash.startswith("$2a$")

    names = build_names(600)
    leads = []
    i = 0
    # Daily lead counts per campaign, so ads spend and leads agree day by day.
    for project, camp, spend, n in CAMPAIGNS:
        for _ in range(n):
            leads.append({"project": project, "campaign": camp})
    R.shuffle(leads)
    for idx, L in enumerate(leads):
        L["n"] = idx + 1
        L["id"] = f"de000000-0000-4000-8001-{idx + 1:012d}"
        L["name"] = names[idx]
        L["phone"] = f"+91555{idx + 1:07d}"
        L["rep"] = R.choices(REPS, REP_WEIGHTS)[0]

    # ── final stage plan (600) ──
    plan = (["won"] * 3 + ["token_paid"] * 2 + ["negotiation"] * 10 + ["visited"] * 22 +
            ["visit_booked"] * 9 + ["lost_after_visit"] * 8 + ["interested"] * 111 +
            ["contacted"] * 282 + ["retry"] * 25 + ["lost"] * 102 + ["dnc"] * 6 +
            ["invalid"] * 14 + ["new"] * 6)
    assert len(plan) == 600, len(plan)

    # Creation day: older leads are the ones that can have gone all the way.
    def created_day(kind):
        if kind == "new":
            return 0
        if kind in ("won", "token_paid"):
            return None  # set by booking day
        if kind in ("negotiation", "visited", "lost_after_visit"):
            return R.randint(-29, -6)
        if kind == "visit_booked":
            return R.randint(-14, -2)
        if kind == "interested":
            return R.randint(-29, -1)
        if kind == "retry":
            return R.randint(-12, -2)
        return R.randint(-29, -1)

    for L, kind in zip(leads, plan):
        L["kind"] = kind

    # Bookings: token day, and the lead arrived 8-13 days earlier.
    book_days = [-21, -16, -12, -8, -3]
    booked = [L for L in leads if L["kind"] in ("won", "token_paid")]
    # The two token_paid are the most recent bookings.
    booked.sort(key=lambda L: 0 if L["kind"] == "won" else 1)
    for L, bd in zip(booked, book_days):
        L["book_day"] = bd
        L["created_day"] = max(-29, bd - R.randint(8, 12))
    for L in leads:
        if "created_day" not in L:
            L["created_day"] = created_day(L["kind"])
        if L["kind"] == "new":
            L["created"] = Moment(0, R.randint(7 * 60 + 5, 9 * 60 + 20))
        else:
            # Meta leads arrive all day, more in the evening.
            # Meta leads arrive all day; most inside calling hours.
            r = R.random()
            if r < 0.80:
                m = R.randint(9 * 60 + 30, 19 * 60 + 15)
            elif r < 0.92:
                m = R.randint(19 * 60 + 16, 22 * 60 + 30)
            else:
                m = R.randint(7 * 60, 9 * 60 + 29)
            L["created"] = Moment(L["created_day"], m)

    # The nine buyers Call Pro AI kept alive. Two of them booked.
    saved_pool_booked = [L for L in booked if L["kind"] == "won"][:1] + [L for L in booked if L["kind"] == "token_paid"][:1]
    saved_pool_rest = [L for L in leads if L["kind"] in ("visited", "negotiation", "visit_booked")]
    R.shuffle(saved_pool_rest)
    saved = saved_pool_booked + saved_pool_rest[:7]
    reasons = (["no_answer"] * 4 + ["overdue"] * 3 + ["whatsapp"] * 2)
    R.shuffle(reasons)
    for L, why in zip(saved, reasons):
        L["saved"] = why

    calls, follow_ups, activities, outcomes = [], [], [], []

    def add_call(L, when, outcome, secs, summary=None):
        calls.append({"L": L, "at": when, "outcome": outcome, "secs": secs, "summary": summary})

    unit_of = {}
    for L in leads:
        unit_of[L["id"]] = R.choice(UNIT[L["project"]])
        L["budget"] = R.choice(BUDGET[L["project"]])
        L["from"] = R.choice(PLACES)
        L["purpose"] = R.choice(PURPOSE)

    def first_call_time(L):
        c = L["created"]
        in_hours = 9 * 60 + 30 <= c.m <= 19 * 60 + 20
        if in_hours and R.random() < 0.92:
            fc = c.plus(R.randint(1, 6))
        elif in_hours:
            fc = c.plus(R.randint(18, 95))
        else:
            nd = c.day + 1 if c.m > 19 * 60 + 20 else c.day
            fc = Moment(nd, R.randint(9 * 60 + 35, 10 * 60 + 25))
        if fc.day == 0 and fc.m > NOW_TODAY_LIMIT:
            fc = Moment(0, R.randint(9 * 60 + 35, NOW_TODAY_LIMIT))
        if fc.key() <= c.key():
            fc = c.plus(3)
        return fc

    def later(prev, min_days=0, max_days=2):
        d = prev.day + R.randint(min_days, max_days)
        if d > 0:
            d = 0
        if d == prev.day:
            m = prev.m + R.randint(45, 300)
            hi = NOW_TODAY_LIMIT if d == 0 else 19 * 60 + 25
            if m > hi:
                if d < 0:
                    d += 1
                    m = R.randint(9 * 60 + 35, 12 * 60)
                    if d == 0:
                        m = min(m, NOW_TODAY_LIMIT)
                else:
                    m = min(prev.m + 10, NOW_TODAY_LIMIT)
            nm = Moment(d, m)
        else:
            nm = work_slot(d)
        if nm.key() <= prev.key():
            nm = prev.plus(15)
        return nm

    p_short = {GREENS: "plots", HEIGHTS: "flats", FARMS: "farm villas"}

    def s_first(L):
        return (f"Asked about {L['project']} {p_short[L['project']]}. Wants a {unit_of[L['id']]} for {L['purpose']}. "
                f"Budget {L['budget']}. Lives in {L['from']}. Price list sent on WhatsApp.")

    def s_interest(L):
        lines = [
            f"Liked the {unit_of[L['id']]} options. Asked about registry and loan. Said: 'Sunday ko family ke saath dekhne aa sakte hain.'",
            f"Compared with another project nearby. Explained road, airport distance and payment plan. Interested, wants to see the site.",
            f"Buyer said: 'Rate thoda zyada lag raha hai.' Shared the 3-part payment plan. Still interested.",
            f"Wife will also decide. Sent the 1-minute site video for the family WhatsApp group.",
        ]
        return R.choice(lines)

    def s_visit_fix(L, vd):
        return f"Site visit fixed with family. Pickup from {L['from']} arranged. Confirmed on WhatsApp."

    def s_after_visit(L):
        return R.choice([
            "Came to the site with family. Liked the corner plots and the park. Thinking about it this week.",
            "Visited the site. Wants a better rate on the 150 gaj plot. Asked for the final price in writing.",
            "Visited with his brother. Likes the location. Waiting for loan approval from his bank.",
            "Visited. Wife liked the sample flat. They will decide after talking to her father.",
        ])

    for L in leads:
        k = L["kind"]
        if k == "new":
            continue
        fc = first_call_time(L)
        last = fc
        why = L.get("saved")
        if k == "invalid":
            add_call(L, fc, "failed", 0, None)
            if R.random() < 0.5:
                add_call(L, later(fc, 0, 1), "failed", 0, "Number is not in service.")
            continue
        if k == "retry":
            n = R.randint(2, 4)
            for j in range(n):
                add_call(L, last if j == 0 else later(last, 1, 2), R.choice(["no_answer", "no_answer", "busy", "rejected"]), 0)
                last = calls[-1]["at"]
            continue
        # Saved by "no answer three times": three misses, then the fourth try connects.
        if why == "no_answer":
            for j in range(3):
                add_call(L, last if j == 0 else later(last, 1, 1), "no_answer", 0)
                last = calls[-1]["at"]
            last = later(last, 1, 1)
            add_call(L, last, "connected", R.randint(140, 260), s_first(L) + " Picked up on the 4th try.")
            activities.append((L, last.plus(-2), "reminder", "Call now: 3 calls with no answer. This lead was moved to the top of Call now for one more try."))
        else:
            # Most first calls connect; some need one more try.
            if R.random() < 0.28:
                add_call(L, fc, R.choice(["no_answer", "busy"]), 0)
                last = later(fc, 0, 1)
                fc = last
            if k in ("lost", "dnc"):
                if k == "dnc":
                    add_call(L, fc, "connected", R.randint(15, 40), "Buyer asked not to be called again. Marked Do not call.")
                    continue
                reason = R.choice([
                    "Looking for a flat on rent, not to buy.",
                    "Budget is under ₹10 lakh. Nothing fits.",
                    "Already bought a plot last month.",
                    "Filled the form by mistake.",
                    "Wants a project in Gurugram only.",
                    "Not interested now. Maybe next year.",
                ])
                add_call(L, fc, "connected", R.randint(25, 95), reason)
                L["lost_reason"] = reason
                continue
            add_call(L, fc, "connected", R.randint(70, 240), s_first(L))
            last = fc
        if k == "contacted":
            # Sometimes a second short check-in call.
            if R.random() < 0.35:
                last = later(last, 1, 4)
                add_call(L, last, R.choice(["connected", "no_answer"]), R.choice([0, R.randint(35, 90)]),
                         None)
                if calls[-1]["outcome"] == "connected" and calls[-1]["secs"] == 0:
                    calls[-1]["secs"] = 45
            continue
        # Interested and beyond: one longer talk.
        last = later(last, 0, 3)
        add_call(L, last, "connected", R.randint(180, 420), s_interest(L))
        if why == "overdue":
            last = later(last, 2, 3)
            activities.append((L, Moment(last.day, 10 * 60), "reminder",
                               "Follow-up was due yesterday and not done. Shown as Overdue at the top of Call now this morning."))
            add_call(L, last, "connected", R.randint(150, 300), "Called back after the overdue reminder. Buyer said: 'Accha hua aapne call kiya, hum bhool gaye the.' Visit discussed.")
        if why == "whatsapp":
            last = later(last, 1, 2)
            activities.append((L, last.plus(-40), "reminder",
                               "Buyer replied on WhatsApp and nobody answered for 40 minutes. Moved to the top of Call now."))
            add_call(L, last, "connected", R.randint(120, 260), "Buyer had replied on WhatsApp asking for the final rate. Called back at once. Visit agreed.")
        if k == "interested":
            continue
        # Visit fixed.
        if k == "visit_booked":
            # One visit later today, the rest this week.
            vday = 0 if not any(x.get("visit_at") and x["kind"] == "visit_booked" and x["visit_at"].day == 0 for x in leads) else R.choice([1, 1, 2, 3, 4, 5, 6])
            vclock = 18 * 60 if vday == 0 else R.choice([11 * 60, 12 * 60 + 30, 15 * 60, 16 * 60, 17 * 60 + 30])
            last = later(last, 0, 1)
            add_call(L, last, "connected", R.randint(120, 240), s_visit_fix(L, vday))
            L["visit_at"] = Moment(vday, vclock)
            activities.append((L, last.plus(2), "site_visit", f"Site visit fixed for {L['project']}."))
            continue
        # Visit happened.
        if k in ("won", "token_paid"):
            vday = L["book_day"] - R.randint(1, 4)
        else:
            vday = min(-1, last.day + R.randint(2, 6))
        fix_call = later(last, 0, 1)
        if fix_call.day >= vday:
            fix_call = Moment(vday - 1, R.randint(10 * 60, 18 * 60))
        if fix_call.key() <= last.key():
            fix_call = last.plus(20)
        add_call(L, fix_call, "connected", R.randint(120, 240), s_visit_fix(L, vday))
        visit = Moment(max(vday, fix_call.day + 1), R.choice([11 * 60, 12 * 60, 15 * 60, 16 * 60 + 30]))
        L["visit_at"] = visit
        L["arrived"] = visit.plus(R.randint(-10, 25))
        activities.append((L, fix_call.plus(2), "site_visit", f"Site visit fixed for {L['project']}."))
        activities.append((L, L["arrived"], "site_visit", "Arrived at the site. Location check matched the project."))
        last = Moment(visit.day, min(19 * 60 + 15, visit.m + R.randint(120, 200)))
        if last.day == 0 and last.m > NOW_TODAY_LIMIT:
            last = Moment(0, NOW_TODAY_LIMIT)
        add_call(L, last, "connected", R.randint(150, 330), s_after_visit(L))
        if k == "lost_after_visit":
            o = R.choice(["price", "price", "location", "location", "competitor", "family"])
            L["visit_outcome"] = o
            last = later(last, 2, 4)
            note = {"price": "Final answer: the rate is above his budget. Closed politely.",
                    "location": "Family felt the site is too far from their work. Closed.",
                    "competitor": "Booked in another project near his office.",
                    "family": "Father did not agree. Closed for now."}[o]
            add_call(L, last, "connected", R.randint(60, 140), note)
            continue
        if k == "visited":
            L["visit_outcome"] = R.choice(["thinking", "thinking", "follow_up", "family", "finance", None])
            continue
        # negotiation and bookings
        last = later(last, 1, 2)
        add_call(L, last, "connected", R.randint(200, 420),
                 "Talked about the final rate and the payment plan. Asked for ₹200/gaj less. Manager approved ₹100/gaj.")
        L["visit_outcome"] = "thinking" if k == "negotiation" else "booked"
        if k == "negotiation":
            continue
        bd = L["book_day"]
        tok = Moment(bd, R.randint(12 * 60, 17 * 60))
        if tok.key() <= last.key():
            tok = last.plus(90)
        add_call(L, tok.plus(-60), "connected", R.randint(180, 300),
                 "Buyer agreed. Coming to the office with the token cheque today.")
        L["token_at"] = tok
        L["token_amount"] = 51000 if L["project"] == GREENS else 100000
        activities.append((L, tok, "status", f"Token paid: ₹{L['token_amount']:,}. Stage → Token paid."))
        if k == "won":
            later_call = later(tok, 3, 5)
            add_call(L, later_call, "connected", R.randint(120, 200),
                     "Agreement signed. Registry date fixed. Buyer will refer his cousin.")
            activities.append((L, later_call.plus(5), "status", "Agreement signed. Stage → Won."))

    # ── ad spend by day (offset -29..0), consistent with leads per campaign per day ──
    ad_rows = []
    for project, camp, total, n in CAMPAIGNS:
        per_day = {d: 0 for d in range(-29, 1)}
        for L in leads:
            if L["campaign"] == camp:
                per_day[L["created_day"]] += 1
        weights = {d: (0.45 if d == 0 else 1.0) * R.uniform(0.85, 1.15) for d in per_day}
        s = sum(weights.values())
        spend = {d: round(total * w / s) for d, w in weights.items()}
        spend[-1] += total - sum(spend.values())
        for d in sorted(per_day):
            impressions = int(spend[d] * R.uniform(9.5, 12.5))
            clicks = int(impressions * R.uniform(0.011, 0.016))
            ad_rows.append((d, camp, spend[d], impressions, clicks, per_day[d]))

    # ── follow-ups ──
    def fu(L, day, m, note, created_day=None):
        cd = created_day if created_day is not None else min(day - 1, -1) if day > -30 else day
        follow_ups.append({"L": L, "due": Moment(day, m), "note": note,
                           "created": L.get("_last_call", L["created"])})

    for L in leads:
        Lc = [c for c in calls if c["L"] is L]
        L["_calls"] = Lc
        L["_last_call"] = max((c["at"] for c in Lc), key=lambda m: m.key()) if Lc else None
    contacted = [L for L in leads if L["kind"] == "contacted"]
    interested = [L for L in leads if L["kind"] == "interested"]
    R.shuffle(contacted)
    R.shuffle(interested)

    def due_today():
        return R.randint(10 * 60, 18 * 60 + 30)

    notes_contacted = ["Call back after 6 PM. Busy at work.", "Send price list again and ask for budget.",
                       "Asked to call on Sunday.", "Check if he saw the site video.", "Wife will be home. Call in the evening."]
    notes_interested = ["Fix the site visit for this weekend.", "Share loan details and the payment plan.",
                        "Ask if the family can come on Sunday.", "Send corner plot options.", "Confirm the budget and the plot size."]

    def place(L, kind_list, notes):
        last = L["_last_call"] or L["created"]
        L["_fu_kind"] = kind_list

    # contacted: 6 overdue, 18 due today, rest future (1-21 days)
    for j, L in enumerate(contacted):
        last = L["_last_call"]
        if j < 6:
            day = R.choice([-1, -1, -2])
        elif j < 24:
            day = 0
        else:
            day = R.randint(1, 21)
        if day <= last.day:
            day = last.day + 1 if last.day + 1 <= 0 else 0
            if day == 0 and j < 6:
                day = 0
        follow_ups.append({"L": L, "due": Moment(day, due_today()), "note": R.choice(notes_contacted), "created": last})
    for j, L in enumerate(interested):
        last = L["_last_call"]
        if j < 2:
            day = -1
        elif j < 12:
            day = 0
        else:
            day = R.randint(1, 10)
        if day < last.day or (day == last.day and day < 0):
            day = max(day, min(0, last.day + 1))
        follow_ups.append({"L": L, "due": Moment(day, due_today()), "note": R.choice(notes_interested), "created": last})
    for L in leads:
        k = L["kind"]
        last = L["_last_call"]
        if k == "visited":
            day = 0 if R.random() < 0.15 else R.randint(1, 5)
            follow_ups.append({"L": L, "due": Moment(day, due_today()), "note": "Ask what the family decided after the visit.", "created": last})
        elif k == "negotiation":
            day = 0 if R.random() < 0.2 else R.randint(1, 4)
            follow_ups.append({"L": L, "due": Moment(day, due_today()), "note": "Share the final rate sheet. Ask for the token date.", "created": last})
        elif k == "token_paid":
            follow_ups.append({"L": L, "due": Moment(R.randint(2, 6), 12 * 60), "note": "Remind about the 2nd payment and agreement date.", "created": last})
        elif k == "visit_booked":
            v = L["visit_at"]
            if v.day >= 1:
                follow_ups.append({"L": L, "due": Moment(v.day - 1, 18 * 60), "note": "Confirm tomorrow's site visit and pickup time.", "created": last})
            else:
                follow_ups.append({"L": L, "due": Moment(0, 10 * 60 + 30), "note": "Confirm today's 6 PM site visit. Send the location pin.", "created": last})
    # Fix follow-up created time to the last call.
    for f in follow_ups:
        if f["created"] is None:
            f["created"] = f["L"]["created"]
        if f["due"].key() <= f["created"].key() and f["due"].day >= 0:
            f["due"] = Moment(max(0, f["created"].day), min(19 * 60, f["created"].m + 120)) if f["created"].day == 0 else f["due"]

    # ── contacts rows ──
    status_of = {"won": "booked", "token_paid": "token_paid", "negotiation": "negotiation", "visited": "site_visit",
                 "visit_booked": "site_visit", "lost_after_visit": "not_interested", "interested": "interested",
                 "contacted": "callback", "retry": "no_answer", "lost": "not_interested", "dnc": "dnc",
                 "invalid": "invalid", "new": "new"}
    stage_of = {"won": "won", "token_paid": "token_paid", "negotiation": "negotiation", "visited": "site_visit",
                "visit_booked": "site_visit", "lost_after_visit": "lost", "interested": "interested",
                "contacted": "contacted", "retry": "contacted", "lost": "lost", "dnc": "dnc", "invalid": "invalid",
                "new": "new"}
    temp_of = {"won": "hot", "token_paid": "hot", "negotiation": "hot", "visited": "hot", "visit_booked": "hot",
               "lost_after_visit": "cold", "interested": "warm", "contacted": None, "retry": None, "lost": "cold",
               "dnc": "cold", "invalid": None, "new": None}
    next_action = {
        "negotiation": "Send the final rate in writing today and ask for the token date.",
        "visited": "Call the family this evening. Ask what stopped them, then offer a second visit.",
        "visit_booked": "Confirm the visit the evening before. Send the location pin on WhatsApp.",
        "interested": "Fix a site visit for this weekend. Offer free pickup.",
        "token_paid": "Book the agreement date. Ask for one referral.",
    }
    saved_text = {
        "no_answer": "No answer 3 times. Call now kept it on top, and the 4th call connected.",
        "overdue": "Follow-up was a day late. The Overdue reminder brought it back the next morning.",
        "whatsapp": "Buyer wrote on WhatsApp and waited 40 minutes. Call now put them first.",
    }

    out = []
    w = out.append
    w(HEADER)
    w("begin;\n")
    w(SCHEMA)
    w(WIPE)
    w(PEOPLE.replace("@PW_HASH@", pw_hash).replace("@JUNK_HASH@", junk_hash).replace("@EMAIL@", DEMO_EMAIL))

    w("-- ── Leads (staged, so the trigger that re-stamps created_at cannot erase the 30 days) ──\n")
    w("""create temp table _demo_c (
  id uuid primary key, salesperson_id uuid, name text, phone text, company_name text, notes text,
  status text, stage text, temperature text, budget text, ai_next_action text,
  site_visit_at timestamptz, site_visit_project text, lead_source_id text,
  token_amount numeric, token_paid_at timestamptz, site_visit_arrived_at timestamptz,
  attempts int, close_probability int, extra jsonb, created_at timestamptz,
  handled_at timestamptz, last_contacted_at timestamptz, last_inbound_at timestamptz,
  last_reply_at timestamptz
) on commit drop;\n""")
    rows = []
    for L in leads:
        k = L["kind"]
        lc = L["_last_call"]
        misses = sum(1 for c in L["_calls"] if c["outcome"] != "connected")
        extra = {"demo": True, "campaign": L["campaign"], "form": {"project": L["project"], "budget": L["budget"],
                                                                  "city": L["from"], "purpose": L["purpose"]}}
        if L.get("saved"):
            extra["demo_saved"] = saved_text[L["saved"]]
        notes = None
        if k not in ("new", "retry", "invalid", "contacted", "lost", "dnc"):
            notes = f"{unit_of[L['id']]} · {L['purpose']} · from {L['from']}"
        elif k in ("lost",):
            notes = L.get("lost_reason")
        cp = None
        if k in ("visited", "negotiation"):
            cp = R.choice([30, 40, 50, 60, 70]) if k == "visited" else R.choice([60, 70, 80])
        if k in ("won", "token_paid"):
            cp = 100
        inbound = reply = None
        if L.get("saved") == "whatsapp" and lc:
            # The WhatsApp wait already ended: they were called back.
            inbound = lc.plus(-45).sql()
            reply = lc.plus(-1).sql()
        rows.append("(" + ",".join([
            q(L["id"]), q(L["rep"]), q(L["name"]), q(L["phone"]), q(L["project"]), q(notes),
            q(status_of[k]), q(stage_of[k]), q(temp_of[k]),
            q(L["budget"] if k not in ("new", "invalid", "retry") else None),
            q(next_action.get(k)),
            L["visit_at"].sql() if L.get("visit_at") else "null",
            q(L["project"]) if L.get("visit_at") else "null",
            q("demo-" + L["id"][-6:]),
            str(L["token_amount"]) if L.get("token_amount") else "null",
            L["token_at"].sql() if L.get("token_at") else "null",
            L["arrived"].sql() if L.get("arrived") else "null",
            str(misses), "null" if cp is None else str(cp),
            q(json.dumps(extra, ensure_ascii=False)) + "::jsonb",
            L["created"].sql(),
            lc.sql() if lc else "null",
            lc.sql() if lc else "null",
            inbound or "null", reply or "null",
        ]) + ")")
    w("insert into _demo_c values\n" + ",\n".join(rows) + ";\n\n")
    w(LEADS_INSERT)

    w("-- ── Calls (lead number, outcome, day, IST clock, seconds, AI summary) ──\n")
    crow = []
    for c in sorted(calls, key=lambda c: c["at"].key()):
        crow.append(f"({c['L']['n']},{q(c['outcome'])},{c['at'].args()},{c['secs']},{q(c['summary'])})")
    w("insert into public.call_logs (company_id, salesperson_id, contact_id, phone, direction, outcome, started_at, ended_at, "
      "duration_seconds, created_at, summary, recording_status, off_crm)\n"
      "select '" + DEMO + "'::uuid, s.salesperson_id, s.id, s.phone, 'outgoing', v.o::public.call_outcome, pg_temp.d(v.dd, v.ck), "
      "pg_temp.d(v.dd, v.ck) + make_interval(secs => v.secs), v.secs, pg_temp.d(v.dd, v.ck), v.summary, 'none', false\n"
      "from (values\n" + ",\n".join(crow) + "\n) as v(n, o, dd, ck, secs, summary)\n"
      "join _demo_c s on s.id = pg_temp.lead(v.n);\n\n")

    w("-- ── Follow-ups (parked 100 years out while the lead clocks are restored, see the note at the top) ──\n")
    frow = []
    for f in follow_ups:
        frow.append(f"({f['L']['n']},{f['due'].args()},{q(f['note'])},{f['created'].args()})")
    w("insert into public.follow_ups (company_id, salesperson_id, contact_id, phone, name, due_at, note, status, created_at)\n"
      "select '" + DEMO + "'::uuid, s.salesperson_id, s.id, s.phone, s.name, pg_temp.d(v.dd, v.ck) + interval '100 years', v.note, 'pending', pg_temp.d(v.cd, v.cc)\n"
      "from (values\n" + ",\n".join(frow) + "\n) as v(n, dd, ck, note, cd, cc)\n"
      "join _demo_c s on s.id = pg_temp.lead(v.n);\n\n")
    w(RESTORE_CLOCKS)

    w("-- ── What happened at each visit ──\n")
    orow = []
    for L in leads:
        if L.get("arrived") and L.get("visit_outcome"):
            note = "Liked the site, deciding this week." if L["visit_outcome"] == "thinking" else None
            orow.append(f"({L['n']},{L['arrived'].args()},{q(L['visit_outcome'])},{q(note)})")
    w("insert into public.site_visit_outcomes (company_id, contact_id, salesperson_id, visited_at, outcome, note, handled_by, recorded_at)\n"
      "select '" + DEMO + "'::uuid, s.id, s.salesperson_id, pg_temp.d(v.dd, v.ck), v.o, v.n2, 'Site team (demo)', pg_temp.d(v.dd, v.ck) + interval '150 minutes'\n"
      "from (values\n" + ",\n".join(orow) + "\n) as v(n, dd, ck, o, n2)\n"
      "join _demo_c s on s.id = pg_temp.lead(v.n);\n\n")

    w("-- ── Lead history lines ──\n")
    arow = []
    for L, when, typ, detail in activities:
        arow.append(f"({L['n']},{when.args()},{q(typ)},{q(detail)})")
    w("insert into public.lead_activities (company_id, contact_id, actor_id, actor_name, type, detail, created_at)\n"
      "select '" + DEMO + "'::uuid, s.id, case when v.ty = 'reminder' then null else s.salesperson_id end,\n"
      "       case when v.ty = 'reminder' then 'Call Pro AI' else p.full_name end, v.ty, v.de, pg_temp.d(v.dd, v.ck)\n"
      "from (values\n" + ",\n".join(arow) + "\n) as v(n, dd, ck, ty, de)\n"
      "join _demo_c s on s.id = pg_temp.lead(v.n)\n"
      "join public.profiles p on p.id = s.salesperson_id;\n\n")

    w("-- ── Meta ad spend, one row per campaign per day (day_offset 0 = the demo's today) ──\n")
    adrow = [f"({d},{q(c)},{s},{im},{cl},{n})" for d, c, s, im, cl, n in ad_rows]
    w("insert into public.demo_ad_spend (company_id, day_offset, campaign, spend, impressions, clicks, leads)\n"
      "select '" + DEMO + "'::uuid, v.d, v.c, v.s, v.i, v.k, v.n from (values\n" + ",\n".join(adrow) +
      "\n) as v(d, c, s, i, k, n);\n\n")

    w(KNOWLEDGE)
    w(COACH)
    w(FINISH)
    w("commit;\n")
    print("".join(out))

    # Summary on stderr for the PR body.
    import sys
    tot_spend = sum(r[2] for r in ad_rows)
    visits = sum(1 for L in leads if L.get("arrived"))
    print(f"spend={tot_spend} leads={len(leads)} visits={visits} upcoming={sum(1 for L in leads if L['kind']=='visit_booked')} "
          f"bookings={len(booked)} cpb={tot_spend // len(booked)} calls={len(calls)} followups={len(follow_ups)} "
          f"saved={len(saved)} activities={len(activities)} today_fu={sum(1 for f in follow_ups if f['due'].day == 0)} "
          f"overdue_fu={sum(1 for f in follow_ups if f['due'].day < 0)} calls_today={sum(1 for c in calls if c['at'].day == 0)}",
          file=sys.stderr)


HEADER = open(__file__.replace("generate_demo_seed.py", "parts/header.sql")).read()
SCHEMA = open(__file__.replace("generate_demo_seed.py", "parts/schema.sql")).read()
WIPE = open(__file__.replace("generate_demo_seed.py", "parts/wipe.sql")).read()
PEOPLE = open(__file__.replace("generate_demo_seed.py", "parts/people.sql")).read()
LEADS_INSERT = open(__file__.replace("generate_demo_seed.py", "parts/leads_insert.sql")).read()
RESTORE_CLOCKS = open(__file__.replace("generate_demo_seed.py", "parts/restore_clocks.sql")).read()
KNOWLEDGE = open(__file__.replace("generate_demo_seed.py", "parts/knowledge.sql")).read()
COACH = open(__file__.replace("generate_demo_seed.py", "parts/coach.sql")).read()
FINISH = open(__file__.replace("generate_demo_seed.py", "parts/finish.sql")).read()

if __name__ == "__main__":
    main()
