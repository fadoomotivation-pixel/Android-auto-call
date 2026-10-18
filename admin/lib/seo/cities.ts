// City pages for /real-estate-crm/<city> and /hi/real-estate-crm/<city>.
// Every line here must stay true and qualitative: no prices, no market sizes,
// no numbers we have not measured, and never a competitor name.
export type City = {
  slug: string; name: string; nameHi: string; state: string; stateHi: string;
  lang: string; nearby: string[]; noteEn: string; noteHi: string; tipEn: string; tipHi: string;
};

export const CITIES: City[] = [
  {
    "slug": "mathura",
    "name": "Mathura",
    "nameHi": "मथुरा",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi and Braj",
    "nearby": [
      "vrindavan",
      "agra",
      "noida"
    ],
    "noteEn": "Mathura teams mostly sell plots and colonies, and many enquiries come from families who live in Delhi NCR or other states and plan to buy near the temples.",
    "noteHi": "मथुरा में ज़्यादातर प्लॉट और कॉलोनी बिकती हैं, और बहुत सी enquiry दिल्ली NCR या दूसरे राज्यों में रहने वाले परिवारों से आती है जो मंदिरों के पास घर लेना चाहते हैं।",
    "tipEn": "Out-of-town buyers decide over weeks, so book the site visit for a weekend or festival trip and set the follow-up for that date.",
    "tipHi": "बाहर के खरीदार हफ़्तों में फ़ैसला करते हैं, इसलिए site visit किसी weekend या त्योहार की यात्रा पर रखें और उसी दिन का follow-up लगाएँ।"
  },
  {
    "slug": "vrindavan",
    "name": "Vrindavan",
    "nameHi": "वृंदावन",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi and Braj",
    "nearby": [
      "mathura",
      "agra",
      "noida"
    ],
    "noteEn": "Vrindavan buyers often look for a second home, a retirement home or a flat close to the temples, and many call from other cities.",
    "noteHi": "वृंदावन में खरीदार अक्सर दूसरा घर, retirement home या मंदिरों के पास flat ढूँढते हैं, और बहुत से लोग दूसरे शहरों से call करते हैं।",
    "tipEn": "Ask early whether the buyer will stay or rent it out. The answer changes which project you pitch.",
    "tipHi": "शुरुआत में ही पूछें कि खरीदार ख़ुद रहेगा या किराए पर देगा। जवाब से तय होता है कि कौन सा project बताना है।"
  },
  {
    "slug": "agra",
    "name": "Agra",
    "nameHi": "आगरा",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi",
    "nearby": [
      "mathura",
      "vrindavan",
      "greater-noida"
    ],
    "noteEn": "Agra has a mix of plotted colonies, independent houses and flats, and the Yamuna Expressway links it to Greater Noida and Mathura.",
    "noteHi": "आगरा में प्लॉट वाली कॉलोनी, independent house और flat तीनों मिलते हैं, और Yamuna Expressway इसे Greater Noida और मथुरा से जोड़ता है।",
    "tipEn": "Many buyers compare a plot with a ready house. Keep both options in your script and note which one they lean to.",
    "tipHi": "बहुत से खरीदार प्लॉट और तैयार मकान की तुलना करते हैं। script में दोनों रखें और note करें कि वे किस तरफ़ झुक रहे हैं।"
  },
  {
    "slug": "noida",
    "name": "Noida",
    "nameHi": "नोएडा",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi and English",
    "nearby": [
      "greater-noida",
      "gurugram",
      "mathura"
    ],
    "noteEn": "Noida is mostly a flats market, and buyers compare projects sector by sector, by builder and by possession date.",
    "noteHi": "नोएडा में ज़्यादातर flats बिकते हैं, और खरीदार sector, builder और possession date के हिसाब से projects की तुलना करते हैं।",
    "tipEn": "Write the sector and possession date the buyer wants into the lead note, so the next caller does not ask again.",
    "tipHi": "खरीदार को कौन सा sector और possession date चाहिए, यह lead note में लिखें ताकि अगला caller दोबारा न पूछे।"
  },
  {
    "slug": "greater-noida",
    "name": "Greater Noida",
    "nameHi": "ग्रेटर नोएडा",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi and English",
    "nearby": [
      "noida",
      "agra",
      "mathura"
    ],
    "noteEn": "Greater Noida has large townships, flats and plots along the Yamuna Expressway, and many buyers are first-time owners from Delhi NCR.",
    "noteHi": "ग्रेटर नोएडा में Yamuna Expressway के साथ बड़ी townships, flats और plots हैं, और बहुत से खरीदार दिल्ली NCR से पहली बार घर ले रहे होते हैं।",
    "tipEn": "First-time buyers ask about loans early. Share the EMI on the call and send it on WhatsApp right after.",
    "tipHi": "पहली बार घर लेने वाले loan के बारे में जल्दी पूछते हैं। call पर EMI बताएँ और तुरंत WhatsApp पर भेज दें।"
  },
  {
    "slug": "gurugram",
    "name": "Gurugram",
    "nameHi": "गुरुग्राम",
    "state": "Haryana",
    "stateHi": "हरियाणा",
    "lang": "Hindi and English",
    "nearby": [
      "noida",
      "jaipur",
      "greater-noida"
    ],
    "noteEn": "Gurugram buyers are often working professionals who compare many projects online and call back in the evening.",
    "noteHi": "गुरुग्राम में खरीदार अक्सर working professionals होते हैं जो online कई projects देखते हैं और शाम को call back करते हैं।",
    "tipEn": "Schedule callbacks after office hours and keep the first call short: confirm budget, location and the best time to talk.",
    "tipHi": "callback office time के बाद रखें और पहली call छोटी रखें: budget, location और बात करने का सही समय पक्का करें।"
  },
  {
    "slug": "jaipur",
    "name": "Jaipur",
    "nameHi": "जयपुर",
    "state": "Rajasthan",
    "stateHi": "राजस्थान",
    "lang": "Hindi and Rajasthani",
    "nearby": [
      "gurugram",
      "agra",
      "indore"
    ],
    "noteEn": "Jaipur has a big market for JDA-approved plots, villas and flats, and buyers often ask about approvals first.",
    "noteHi": "जयपुर में JDA-approved plots, villas और flats का बड़ा बाज़ार है, और खरीदार अक्सर सबसे पहले approval के बारे में पूछते हैं।",
    "tipEn": "Keep the approval details of each project in the knowledge base so every telecaller gives the same answer.",
    "tipHi": "हर project की approval details knowledge base में रखें ताकि हर telecaller एक ही जवाब दे।"
  },
  {
    "slug": "lucknow",
    "name": "Lucknow",
    "nameHi": "लखनऊ",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi",
    "nearby": [
      "agra",
      "noida",
      "indore"
    ],
    "noteEn": "Lucknow buyers ask about plots, independent houses and flats in growing areas of the city, and families usually decide together.",
    "noteHi": "लखनऊ में खरीदार शहर के बढ़ते इलाक़ों में plots, independent house और flats के बारे में पूछते हैं, और परिवार अक्सर मिलकर फ़ैसला करता है।",
    "tipEn": "When the buyer says the family will decide, book a site visit for the whole family instead of another call.",
    "tipHi": "जब खरीदार कहे कि परिवार तय करेगा, तो एक और call के बजाय पूरे परिवार के लिए site visit बुक करें।"
  },
  {
    "slug": "indore",
    "name": "Indore",
    "nameHi": "इंदौर",
    "state": "Madhya Pradesh",
    "stateHi": "मध्य प्रदेश",
    "lang": "Hindi",
    "nearby": [
      "jaipur",
      "pune",
      "lucknow"
    ],
    "noteEn": "Indore has an active market for plotted colonies, row houses and flats, and many enquiries come from Facebook and Instagram ads.",
    "noteHi": "इंदौर में plotted colonies, row houses और flats का अच्छा बाज़ार है, और बहुत सी enquiries Facebook और Instagram ads से आती हैं।",
    "tipEn": "Ad leads go cold fast. Let new Meta leads land in Call now and call them the same day.",
    "tipHi": "Ad वाली leads जल्दी ठंडी हो जाती हैं। नई Meta leads को Call now में आने दें और उसी दिन call करें।"
  },
  {
    "slug": "pune",
    "name": "Pune",
    "nameHi": "पुणे",
    "state": "Maharashtra",
    "stateHi": "महाराष्ट्र",
    "lang": "Marathi, Hindi and English",
    "nearby": [
      "indore",
      "gurugram",
      "noida"
    ],
    "noteEn": "Pune is a large flats market with many IT professionals, and buyers often compare projects by area and commute.",
    "noteHi": "पुणे में flats का बड़ा बाज़ार है जहाँ बहुत से IT professionals खरीदार हैं, और वे area और office की दूरी के हिसाब से projects की तुलना करते हैं।",
    "tipEn": "Start with a Marathi or Hindi greeting, whichever the buyer uses, and ask where they work before pitching an area.",
    "tipHi": "खरीदार जो भाषा बोले, Marathi या Hindi में greeting से शुरू करें, और area बताने से पहले पूछें कि वे कहाँ काम करते हैं।"
  }
];

export const citySlugs = () => CITIES.map((c) => c.slug);
export const getCity = (slug: string) => CITIES.find((c) => c.slug === slug);
