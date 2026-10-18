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
  },
  {
    "slug": "delhi",
    "name": "Delhi",
    "nameHi": "दिल्ली",
    "state": "Delhi",
    "stateHi": "दिल्ली",
    "lang": "Hindi, Punjabi and English",
    "nearby": [
      "noida",
      "gurugram",
      "ghaziabad"
    ],
    "noteEn": "Delhi has builder floors, resale flats and redevelopment projects, and many Delhi buyers also look at projects in Noida, Gurugram and Ghaziabad.",
    "noteHi": "दिल्ली में builder floor, resale flat और redevelopment projects मिलते हैं, और बहुत से दिल्ली के खरीदार नोएडा, गुरुग्राम और गाज़ियाबाद के projects भी देखते हैं।",
    "tipEn": "Ask which localities the buyer will consider outside Delhi, and save it in the lead note before you pitch.",
    "tipHi": "पूछें कि खरीदार दिल्ली के बाहर कौन से इलाके देखेगा, और pitch करने से पहले lead note में लिख लें।"
  },
  {
    "slug": "ghaziabad",
    "name": "Ghaziabad",
    "nameHi": "गाज़ियाबाद",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi",
    "nearby": [
      "delhi",
      "noida",
      "greater-noida"
    ],
    "noteEn": "Ghaziabad buyers often compare flats in areas like Indirapuram, Raj Nagar Extension and Crossings Republik, and many work in Delhi or Noida.",
    "noteHi": "गाज़ियाबाद में खरीदार अक्सर इंदिरापुरम, राज नगर एक्सटेंशन और क्रॉसिंग्स रिपब्लिक जैसे इलाकों के flats की तुलना करते हैं, और बहुत से दिल्ली या नोएडा में काम करते हैं।",
    "tipEn": "Ask about the daily commute early. It decides which locality the buyer will actually visit.",
    "tipHi": "रोज़ के आने-जाने के बारे में जल्दी पूछें। इसी से तय होता है कि खरीदार असल में कौन सा इलाका देखने आएगा।"
  },
  {
    "slug": "faridabad",
    "name": "Faridabad",
    "nameHi": "फ़रीदाबाद",
    "state": "Haryana",
    "stateHi": "हरियाणा",
    "lang": "Hindi",
    "nearby": [
      "delhi",
      "gurugram",
      "noida"
    ],
    "noteEn": "Faridabad has both older sectors and newer projects in Greater Faridabad, and buyers often compare it with Delhi and Gurugram.",
    "noteHi": "फ़रीदाबाद में पुराने sectors भी हैं और ग्रेटर फ़रीदाबाद में नए projects भी, और खरीदार अक्सर इसकी तुलना दिल्ली और गुरुग्राम से करते हैं।",
    "tipEn": "Note whether the buyer wants a ready home or an under-construction project. The follow-up plan is different for each.",
    "tipHi": "note करें कि खरीदार को तैयार घर चाहिए या under-construction project। दोनों का follow-up plan अलग होता है।"
  },
  {
    "slug": "aligarh",
    "name": "Aligarh",
    "nameHi": "अलीगढ़",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi and Urdu",
    "nearby": [
      "agra",
      "mathura",
      "greater-noida"
    ],
    "noteEn": "Aligarh is largely a plots and independent houses market, and family members usually join the decision.",
    "noteHi": "अलीगढ़ में ज़्यादातर प्लॉट और independent house बिकते हैं, और फ़ैसले में अक्सर परिवार के लोग शामिल होते हैं।",
    "tipEn": "Invite the whole family for the site visit, and confirm by phone the day before.",
    "tipHi": "site visit पर पूरे परिवार को बुलाएँ, और एक दिन पहले फ़ोन पर confirm करें।"
  },
  {
    "slug": "kanpur",
    "name": "Kanpur",
    "nameHi": "कानपुर",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi",
    "nearby": [
      "lucknow",
      "prayagraj",
      "agra"
    ],
    "noteEn": "Kanpur buyers look at flats, plots and independent houses, and many prefer to talk in Hindi on the phone.",
    "noteHi": "कानपुर में खरीदार flats, प्लॉट और independent house देखते हैं, और बहुत से लोग फ़ोन पर हिंदी में बात करना पसंद करते हैं।",
    "tipEn": "Open the call in Hindi. Switch to English only if the buyer does.",
    "tipHi": "call हिंदी में शुरू करें। English में तभी जाएँ जब खरीदार जाए।"
  },
  {
    "slug": "varanasi",
    "name": "Varanasi",
    "nameHi": "वाराणसी",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi and Bhojpuri",
    "nearby": [
      "prayagraj",
      "lucknow",
      "kanpur"
    ],
    "noteEn": "Varanasi gets enquiries from local families and from people living elsewhere who want a home in the city.",
    "noteHi": "वाराणसी में enquiry स्थानीय परिवारों से भी आती है और बाहर रहने वाले उन लोगों से भी जो शहर में घर चाहते हैं।",
    "tipEn": "For buyers living outside, offer a video walkthrough on WhatsApp first, then fix the visit for their next trip.",
    "tipHi": "बाहर रहने वाले खरीदारों को पहले WhatsApp पर video walkthrough दें, फिर उनकी अगली यात्रा पर visit तय करें।"
  },
  {
    "slug": "prayagraj",
    "name": "Prayagraj",
    "nameHi": "प्रयागराज",
    "state": "Uttar Pradesh",
    "stateHi": "उत्तर प्रदेश",
    "lang": "Hindi",
    "nearby": [
      "varanasi",
      "kanpur",
      "lucknow"
    ],
    "noteEn": "Prayagraj is mostly plots and independent houses, and buyers usually want to see the land in person before deciding.",
    "noteHi": "प्रयागराज में ज़्यादातर प्लॉट और independent house बिकते हैं, और खरीदार फ़ैसले से पहले ज़मीन ख़ुद देखना चाहते हैं।",
    "tipEn": "Every good call should end with a fixed site visit day and time, not just 'we'll see'.",
    "tipHi": "हर अच्छी call एक तय site visit दिन और समय पर ख़त्म होनी चाहिए, सिर्फ़ 'देखते हैं' पर नहीं।"
  },
  {
    "slug": "dehradun",
    "name": "Dehradun",
    "nameHi": "देहरादून",
    "state": "Uttarakhand",
    "stateHi": "उत्तराखंड",
    "lang": "Hindi and Garhwali",
    "nearby": [
      "chandigarh",
      "delhi",
      "mohali"
    ],
    "noteEn": "Dehradun attracts local buyers and people from other cities looking for a second or retirement home in the hills.",
    "noteHi": "देहरादून में स्थानीय खरीदारों के साथ दूसरे शहरों के लोग भी आते हैं जो पहाड़ों में दूसरा घर या retirement home चाहते हैं।",
    "tipEn": "Ask early whether it is a primary or second home. The questions you ask next depend on it.",
    "tipHi": "जल्दी पूछें कि यह मुख्य घर है या दूसरा घर। आगे के सवाल इसी पर निर्भर करते हैं।"
  },
  {
    "slug": "chandigarh",
    "name": "Chandigarh",
    "nameHi": "चंडीगढ़",
    "state": "Chandigarh",
    "stateHi": "चंडीगढ़",
    "lang": "Hindi, Punjabi and English",
    "nearby": [
      "mohali",
      "ludhiana",
      "dehradun"
    ],
    "noteEn": "Buyers in the Chandigarh tricity often compare Chandigarh, Mohali and Zirakpur projects in the same search.",
    "noteHi": "चंडीगढ़ ट्राइसिटी में खरीदार अक्सर एक ही खोज में चंडीगढ़, मोहाली और ज़ीरकपुर के projects की तुलना करते हैं।",
    "tipEn": "Save the buyer's preferred side of the tricity in the lead note, so every caller pitches the same area.",
    "tipHi": "खरीदार को ट्राइसिटी का कौन सा हिस्सा पसंद है, lead note में लिखें ताकि हर caller वही इलाका बताए।"
  },
  {
    "slug": "mohali",
    "name": "Mohali",
    "nameHi": "मोहाली",
    "state": "Punjab",
    "stateHi": "पंजाब",
    "lang": "Punjabi, Hindi and English",
    "nearby": [
      "chandigarh",
      "ludhiana",
      "delhi"
    ],
    "noteEn": "Mohali has many newer sectors and projects, and some enquiries come from NRI families who call from abroad.",
    "noteHi": "मोहाली में कई नए sectors और projects हैं, और कुछ enquiry विदेश से call करने वाले NRI परिवारों से भी आती है।",
    "tipEn": "For buyers abroad, note their time zone and schedule the callback in their evening.",
    "tipHi": "विदेश के खरीदारों का time zone note करें और callback उनकी शाम में रखें।"
  },
  {
    "slug": "ludhiana",
    "name": "Ludhiana",
    "nameHi": "लुधियाना",
    "state": "Punjab",
    "stateHi": "पंजाब",
    "lang": "Punjabi and Hindi",
    "nearby": [
      "chandigarh",
      "mohali",
      "delhi"
    ],
    "noteEn": "Ludhiana buyers look at plots, kothis and flats, and many prefer to talk in Punjabi.",
    "noteHi": "लुधियाना में खरीदार प्लॉट, कोठी और flats देखते हैं, और बहुत से लोग पंजाबी में बात करना पसंद करते हैं।",
    "tipEn": "If a telecaller on your team speaks Punjabi, route Ludhiana leads to them first.",
    "tipHi": "अगर आपकी team में कोई telecaller पंजाबी बोलता है, तो लुधियाना की leads पहले उसे दें।"
  },
  {
    "slug": "bhopal",
    "name": "Bhopal",
    "nameHi": "भोपाल",
    "state": "Madhya Pradesh",
    "stateHi": "मध्य प्रदेश",
    "lang": "Hindi",
    "nearby": [
      "indore",
      "nagpur",
      "jaipur"
    ],
    "noteEn": "Bhopal buyers look at flats, plots and row houses, and many are first-time buyers asking about home loans.",
    "noteHi": "भोपाल में खरीदार flats, प्लॉट और row house देखते हैं, और बहुत से पहली बार घर लेने वाले होम लोन के बारे में पूछते हैं।",
    "tipEn": "Keep the EMI ready on the call and send it on WhatsApp right after.",
    "tipHi": "call पर EMI तैयार रखें और तुरंत बाद WhatsApp पर भेज दें।"
  },
  {
    "slug": "ahmedabad",
    "name": "Ahmedabad",
    "nameHi": "अहमदाबाद",
    "state": "Gujarat",
    "stateHi": "गुजरात",
    "lang": "Gujarati and Hindi",
    "nearby": [
      "vadodara",
      "surat",
      "indore"
    ],
    "noteEn": "Ahmedabad buyers often compare projects area by area across the city, and many prefer to talk in Gujarati.",
    "noteHi": "अहमदाबाद में खरीदार अक्सर शहर के अलग-अलग इलाकों के projects की तुलना करते हैं, और बहुत से लोग गुजराती में बात करना पसंद करते हैं।",
    "tipEn": "Greet in Gujarati if you can, and note the buyer's preferred area in the first call.",
    "tipHi": "हो सके तो गुजराती में नमस्ते करें, और पहली call में खरीदार का पसंदीदा इलाका note करें।"
  },
  {
    "slug": "surat",
    "name": "Surat",
    "nameHi": "सूरत",
    "state": "Gujarat",
    "stateHi": "गुजरात",
    "lang": "Gujarati and Hindi",
    "nearby": [
      "vadodara",
      "ahmedabad",
      "mumbai"
    ],
    "noteEn": "Surat has many business-owner buyers who are busy during the day and call back at odd hours.",
    "noteHi": "सूरत में बहुत से खरीदार business चलाते हैं, जो दिन में व्यस्त रहते हैं और अलग-अलग समय पर call back करते हैं।",
    "tipEn": "Ask for the best time to call and save it as the follow-up time, not a random slot.",
    "tipHi": "call करने का सबसे अच्छा समय पूछें और उसी को follow-up time रखें, कोई भी समय नहीं।"
  },
  {
    "slug": "vadodara",
    "name": "Vadodara",
    "nameHi": "वडोदरा",
    "state": "Gujarat",
    "stateHi": "गुजरात",
    "lang": "Gujarati and Hindi",
    "nearby": [
      "ahmedabad",
      "surat",
      "indore"
    ],
    "noteEn": "Vadodara buyers look at flats, bungalows and plots, and family members are usually part of the decision.",
    "noteHi": "वडोदरा में खरीदार flats, bungalow और प्लॉट देखते हैं, और फ़ैसले में अक्सर परिवार शामिल होता है।",
    "tipEn": "Plan the site visit for a time when the whole family can come.",
    "tipHi": "site visit ऐसे समय रखें जब पूरा परिवार आ सके।"
  },
  {
    "slug": "nagpur",
    "name": "Nagpur",
    "nameHi": "नागपुर",
    "state": "Maharashtra",
    "stateHi": "महाराष्ट्र",
    "lang": "Marathi and Hindi",
    "nearby": [
      "bhopal",
      "nashik",
      "pune"
    ],
    "noteEn": "Nagpur buyers look at plots, flats and row houses, and calls happen in both Marathi and Hindi.",
    "noteHi": "नागपुर में खरीदार प्लॉट, flats और row house देखते हैं, और calls मराठी और हिंदी दोनों में होती हैं।",
    "tipEn": "Note the buyer's language in the lead, so the next caller starts in the same language.",
    "tipHi": "lead में खरीदार की भाषा note करें, ताकि अगला caller उसी भाषा में बात शुरू करे।"
  },
  {
    "slug": "nashik",
    "name": "Nashik",
    "nameHi": "नासिक",
    "state": "Maharashtra",
    "stateHi": "महाराष्ट्र",
    "lang": "Marathi and Hindi",
    "nearby": [
      "pune",
      "mumbai",
      "nagpur"
    ],
    "noteEn": "Nashik gets enquiries from local buyers and from families in Mumbai and Pune looking for a calmer city.",
    "noteHi": "नासिक में enquiry स्थानीय खरीदारों से भी आती है और मुंबई-पुणे के उन परिवारों से भी जो शांत शहर चाहते हैं।",
    "tipEn": "For buyers from other cities, fix the visit on a weekend and send the location pin a day before.",
    "tipHi": "दूसरे शहरों के खरीदारों के लिए visit weekend पर रखें और एक दिन पहले location pin भेजें।"
  },
  {
    "slug": "mumbai",
    "name": "Mumbai",
    "nameHi": "मुंबई",
    "state": "Maharashtra",
    "stateHi": "महाराष्ट्र",
    "lang": "Marathi, Hindi and English",
    "nearby": [
      "pune",
      "nashik",
      "surat"
    ],
    "noteEn": "Mumbai buyers compare projects by suburb, carpet area and possession date, and many have very little time for calls.",
    "noteHi": "मुंबई में खरीदार suburb, carpet area और possession date के हिसाब से projects की तुलना करते हैं, और बहुत से लोगों के पास call के लिए कम समय होता है।",
    "tipEn": "Keep the first call short: confirm the suburb, budget and a visit slot, then send the rest on WhatsApp.",
    "tipHi": "पहली call छोटी रखें: suburb, budget और visit का समय पक्का करें, बाकी WhatsApp पर भेजें।"
  },
  {
    "slug": "hyderabad",
    "name": "Hyderabad",
    "nameHi": "हैदराबाद",
    "state": "Telangana",
    "stateHi": "तेलंगाना",
    "lang": "Telugu, Hindi/Urdu and English",
    "nearby": [
      "bengaluru",
      "pune",
      "nagpur"
    ],
    "noteEn": "Hyderabad has a large flats and gated-community market, and many buyers are working professionals.",
    "noteHi": "हैदराबाद में flats और gated community का बड़ा बाज़ार है, और बहुत से खरीदार working professionals हैं।",
    "tipEn": "Professionals often pick up in the evening or at lunch. Set callbacks for those times.",
    "tipHi": "professionals अक्सर शाम को या lunch के समय फ़ोन उठाते हैं। callbacks उसी समय रखें।"
  },
  {
    "slug": "bengaluru",
    "name": "Bengaluru",
    "nameHi": "बेंगलुरु",
    "state": "Karnataka",
    "stateHi": "कर्नाटक",
    "lang": "Kannada, English and Hindi",
    "nearby": [
      "hyderabad",
      "pune",
      "mumbai"
    ],
    "noteEn": "Bengaluru buyers are often professionals from many states, so calls happen in English, Kannada, Hindi and other languages.",
    "noteHi": "बेंगलुरु में खरीदार अक्सर कई राज्यों से आए professionals होते हैं, इसलिए calls English, कन्नड़, हिंदी और दूसरी भाषाओं में होती हैं।",
    "tipEn": "Ask which language the buyer prefers in the first minute, and save it on the lead.",
    "tipHi": "पहले मिनट में पूछें कि खरीदार कौन सी भाषा पसंद करता है, और lead पर लिख लें।"
  }
];

export const citySlugs = () => CITIES.map((c) => c.slug);
export const getCity = (slug: string) => CITIES.find((c) => c.slug === slug);
