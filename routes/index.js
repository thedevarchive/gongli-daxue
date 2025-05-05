var express = require('express');

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

var router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

//get title of lessons 
router.get("/lessons", async (req, res, next) => {
  const lessons = await req.db.from("lessons");
  res.json({ lessons });
});

//uses Fisher-Yates (Durstenfeld) shuffle
//algorithm suggested by ChatGPT 
function shuffleChoices(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // swap elements
  }
  return array;
}

//Templates for phrasing the Match Pinyin questions
const pinyinPhrasesMC = [
  "Which word is read as {pinyin}?",
  "Select the word that matches the pronunciation {pinyin}.",
  "Choose the correct word for {pinyin}.",
  "Identify the corresponding Chinese word for the following Pinyin: {pinyin}.",
  "Determine which word aligns with this Pinyin reading: {pinyin}.",
  "Encircle the letter next to the word with this Pinyin: {pinyin}.",
  "Which of the following is read as {pinyin}?"
]

const pinyinPhrasesWR = [
  "What word is pronounced {pinyin}?",
  "What word has this Pinyin: {pinyin}?",
  "How do you write {pinyin} in character(s)?",
  "Which word does this Pinyin represent: {pinyin}?",
  "Write the correct character(s) for the sound {pinyin}."
]

async function formulateMPQuestionFromVocab(req, isSimplified, isMC) {
  const lessonId = Number(req.params.lessonId);

  if (isMC) {
    const rightAns = await req.db.from("vocabulary")
      .select("pinyin", "s_hanzi")
      .whereNotNull("question_phrase") //eliminates character names in vocabulary 
      .andWhere("introduced_in_lesson", lessonId)
      .orderByRaw('RAND()')
      .limit(1);

    //take a question template and include the selected pinyin
    const phraseSelect = Math.floor(Math.random() * pinyinPhrasesMC.length);
    const question = pinyinPhrasesMC[phraseSelect].replace("{pinyin}", `<strong>${rightAns[0].pinyin}</strong>`);

    //select 3 more hanzi for the wrong choices 
    const choices = [];

    let choiceQuery = await req.db.from("vocabulary")
      .select("s_hanzi")
      .whereRaw('CHAR_LENGTH(s_hanzi) = ?', [rightAns[0].s_hanzi.length])
      .andWhere("introduced_in_lesson", lessonId)
      .andWhere("pinyin", "!=", rightAns[0].pinyin) //to avoid using characters or words that share same pinyin (e.g. 她 & 他)
      .andWhere("s_hanzi", "!=", rightAns[0].s_hanzi) //to avoid repeating the correct character or word
      .orderByRaw('RAND()')
      .limit(3);

    if (choiceQuery.length < 3)
      choiceQuery = await req.db.from("vocabulary")
        .select("s_hanzi")
        .whereRaw('CHAR_LENGTH(s_hanzi) = ?', [rightAns[0].s_hanzi.length])
        .andWhere("introduced_in_lesson", "<=", lessonId) //if current lesson does not have enough choices, pick words with the same length from previous lessons
        .andWhere("pinyin", "!=", rightAns[0].pinyin) //to avoid using characters or words that share same pinyin (e.g. 她 & 他)
        .andWhere("s_hanzi", "!=", rightAns[0].s_hanzi) //to avoid repeating the correct character or word
        .orderByRaw('RAND()')
        .limit(3);

    choiceQuery.map((cq) => choices.push(cq.s_hanzi));
    choices.push(rightAns[0].s_hanzi); // finally append the correct answer 
    const shuffled = shuffleChoices(choices); //shuffle choices 

    let choiceString = "";

    shuffled.map((sc, index) => (choiceString += "<strong>" + String.fromCharCode(65 + index) + `.</strong> ${sc}&ensp;&ensp;&ensp;`));

    return question + "<br /> &ensp;&ensp;&ensp;" + choiceString;
  }

  const rightAns = await req.db.from("vocabulary")
    .select("pinyin")
    .whereNotNull("question_phrase") //eliminates character names in vocabulary 
    .andWhere("introduced_in_lesson", lessonId)
    .andWhere("is_ambiguous", 0) //only pick words that do not share the same pinyin 
    .orderByRaw('RAND()')
    .limit(1);

  //take a question template and include the selected pinyin
  const phraseSelect = Math.floor(Math.random() * pinyinPhrasesWR.length);
  const question = pinyinPhrasesWR[phraseSelect].replace("{pinyin}", `<strong>${rightAns[0].pinyin}</strong>`);

  //otherwise, just return the question followed by a blank
  return question + " _____________";
}

async function formulateMPQuestionFromChars(req, isSimplified, isMC) {
  const lessonId = Number(req.params.lessonId);

  if (isMC) {
    const rightAns = await req.db.from("characters")
      .select("pinyin", "s_hanzi")
      .andWhere("introduced_in_lesson", lessonId)
      .orderByRaw('RAND()')
      .limit(1);

    //take a question template and include the selected pinyin
    const phraseSelect = Math.floor(Math.random() * pinyinPhrasesMC.length);
    const question = pinyinPhrasesMC[phraseSelect].replace("{pinyin}", `<strong>${rightAns[0].pinyin}</strong>`);

    //select 3 more hanzi for the wrong choices 
    const choices = [];

    let choiceQuery = await req.db.from("characters")
      .select("s_hanzi")
      .andWhere("pinyin", "!=", rightAns[0].pinyin) //to avoid using characters or words that share same pinyin (e.g. 她 & 他)
      .andWhere("s_hanzi", "!=", rightAns[0].s_hanzi) //to avoid repeating the correct character or word
      .orderByRaw('RAND()')
      .limit(3);

    choiceQuery.map((cq) => choices.push(cq.s_hanzi));
    choices.push(rightAns[0].s_hanzi); // finally append the correct answer 
    const shuffled = shuffleChoices(choices); //shuffle choices 

    let choiceString = "";

    shuffled.map((sc, index) => (choiceString += "<strong>" + String.fromCharCode(65 + index) + `.</strong> ${sc}&ensp;&ensp;&ensp;`));

    return question + "<br /> &ensp;&ensp;&ensp;" + choiceString;
  }

  const rightAns = await req.db.from("characters")
    .select("pinyin")
    .andWhere("introduced_in_lesson", lessonId)
    .andWhere("is_ambiguous", 0) //only pick words that do not share the same pinyin 
    .orderByRaw('RAND()')
    .limit(1);

  //take a question template and include the selected pinyin
  const phraseSelect = Math.floor(Math.random() * pinyinPhrasesWR.length);
  const question = pinyinPhrasesWR[phraseSelect].replace("{pinyin}", `<strong>${rightAns[0].pinyin}</strong>`);

  //otherwise, just return the question followed by a blank
  return question + " _____________";
}

async function formulateMMQuestion(req, isSimplified, isMC) {
  const meaningPhrasesMC = [
    "Which word means {meaning}?",
    "Select the word that means {meaning}.",
    "Choose the correct word that refers to \"{meaning}\".",
    "Which of these mean \"{meaning}\"?",
    "Identify the word that means \"{meaning}\" in English.",
  ]

  const meaningPhrasesWR = [
    "What word means {meaning}?",
    "Translate \"{meaning}\" to Chinese.",
    "Write the Chinese character(s) for \"{meaning}\"."
  ]

  const particlePhrasesMC = [
    "Select the Chinese term used as a(n) {meaning}.",
    "Identify the Chinese term for {meaning}.",
    "Which Chinese particle refers to the {meaning}?"
  ]

  const particlePhrasesWR = [
    "Translate the grammatical term “{meaning}” into Chinese.",
    "What is the Chinese equivalent of the {meaning}?",
    "What term is used as a(n) {meaning}?"
  ]

  const lessonId = Number(req.params.lessonId);

  let question = "";

  if (isMC) {
    const rightAns = await req.db.from("vocabulary")
      .select("meaning", "s_hanzi", "question_phrase")
      .whereNotNull("question_phrase") //eliminates character names in vocabulary 
      .andWhere("introduced_in_lesson", lessonId)
      .orderByRaw('RAND()')
      .limit(1);

    if (rightAns[0].meaning.startsWith("(")) {
      const phraseSelect = Math.floor(Math.random() * particlePhrasesMC.length);
      question = particlePhrasesMC[phraseSelect].replace("{meaning}", `<strong>${rightAns[0].question_phrase}</strong>`);
    }
    else {
      const phraseSelect = Math.floor(Math.random() * meaningPhrasesMC.length);
      question = meaningPhrasesMC[phraseSelect].replace("{meaning}", `<strong>${rightAns[0].question_phrase}</strong>`);
    } 

    //select 3 more hanzi for the wrong choices 
    const choices = [];

    let choiceQuery = await req.db.from("vocabulary")
      .select("s_hanzi")
      .andWhere("introduced_in_lesson", lessonId)
      .andWhere("pinyin", "!=", rightAns[0].meaning) //avoid using characters or words that share same pinyin (e.g. 她 & 他)
      .andWhere("s_hanzi", "!=", rightAns[0].s_hanzi) //avoid repeating the correct character or word
      .orderByRaw('RAND()')
      .limit(3);

    choiceQuery.map((cq) => choices.push(cq.s_hanzi));
    choices.push(rightAns[0].s_hanzi); // finally append the correct answer 
    const shuffled = shuffleChoices(choices); //shuffle choices 

    let choiceString = "";

    shuffled.map((sc, index) => (choiceString += "<strong>" + String.fromCharCode(65 + index) + `.</strong> ${sc}&ensp;&ensp;&ensp;`));

    return question + "<br /> &ensp;&ensp;&ensp;" + choiceString;
  }

  const rightAns = await req.db.from("vocabulary")
    .select("meaning", "question_phrase")
    .whereNotNull("question_phrase") //eliminates character names in vocabulary 
    .andWhere("introduced_in_lesson", lessonId)
    .orderByRaw('RAND()')
    .limit(1);

  if (rightAns[0].meaning.startsWith("(")) {
    const phraseSelect = Math.floor(Math.random() * particlePhrasesWR.length);
    question = particlePhrasesWR[phraseSelect].replace("{meaning}", `<strong>${rightAns[0].question_phrase}</strong>`);
  }
  else {
    const phraseSelect = Math.floor(Math.random() * meaningPhrasesWR.length);
    question = meaningPhrasesWR[phraseSelect].replace("{meaning}", `<strong>${rightAns[0].question_phrase}</strong>`);
  }

  //otherwise, just return the question followed by a blank
  return question + " _____________";
}

async function formulateFITBQuestion(req, isSimplified, isMC) {
  const lessonId = Number(req.params.lessonId);

  let rightAns = await req.db.from("fitb_questions")
    .select("s_question", "s_answer")
    .where("lesson_id", lessonId)
    .orderByRaw("RAND()")
    .limit(1);

  if (isMC) {
    const choices = [];

    rightAns = await req.db.from("vocabulary")
      .select("s_hanzi")
      .whereRaw('CHAR_LENGTH(s_hanzi) = ?', [rightAns[0].s_answer.length])
      .andWhere("introduced_in_lesson", lessonId)
      .andWhere("s_hanzi", "!=", rightAns[0].s_answer)
      .orderByRaw('RAND()')
      .limit(3);

    if (choiceQuery.length < 3) {
      rightAns = await req.db.from("vocabulary")
        .select("s_hanzi")
        .whereRaw('CHAR_LENGTH(s_hanzi) = ?', [rightAns[0].s_answer.length])
        .andWhere("s_hanzi", "!=", rightAns[0].s_answer)
        .orderByRaw('RAND()')
        .limit(3);
    }

    choiceQuery.map((cq) => choices.push(cq.s_hanzi));
    choices.push(rightAns[0].s_answer); // finally push the correct answer 
    const shuffled = shuffleChoices(choices); //shuffle choices 

    let choiceString = "";

    shuffled.map((sc, index) => (choiceString += "<strong>" + String.fromCharCode(65 + index) + `.</strong> ${sc} &ensp;&ensp;&ensp;`));

    return rightAns[0].s_question + "<br />&ensp;&ensp;&ensp;" + choiceString;
  }

  return rightAns[0].s_question;
}

async function getGeneratedQuestions(req) {
  //get selected lesson id and worksheet details from client side
  const lessonId = Number(req.params.lessonId);
  const { questions, match_pinyin, match_meaning, fill_blank, translate_chn, question_format } = req.headers;

  //get boolean values for each question type
  const isMP = match_pinyin === "true" ? 1 : 0;
  const isMM = match_meaning === "true" ? 1 : 0;
  const isFB = fill_blank === "true" ? 1 : 0;
  const isTC = translate_chn === "true" ? 1 : 0;

  let numberOfQuestionTypes = isMP + isMM + isFB + isTC;

  // ChatGPT provided this handy formula for calculating minimum per type
  // Minimum per type depends on the number of questions and number of question types selected
  const minPerType = Math.max(5, Math.floor(questions / (numberOfQuestionTypes * 2)));

  //add minimum number of questions for each type to allow learners to experience all question types
  const questionTypeCounts = Array(numberOfQuestionTypes).fill(minPerType);
  let remaining = questions - (minPerType * numberOfQuestionTypes);
  let r = remaining;

  //randomly distribute the remaining values
  while (r > 0) {
    const index = Math.floor(Math.random() * numberOfQuestionTypes);
    questionTypeCounts[index]++;
    r--;
  }

  let count = 0; //count the different question types 
  let questionsGenerated = 0; // keep track of questionsArr generated to ensure that it does not go over the prescribed limit
  const questionsArr = [];

  if (Boolean(isMP)) { //identify word via pinyin 
    try {
      questionsGenerated += questionTypeCounts[count];
      while (questionsArr.length < questionsGenerated) {
        const tableSelect = Math.floor(Math.random() * 2);

        let formatSelect = -1;

        //when learner selects both, randomly pick the format for each question
        if (question_format === "MW") formatSelect = Math.floor(Math.random() * 2);

        if (tableSelect === 1) 
          questionsArr.push(await formulateMPQuestionFromVocab(req, true, question_format === "MC" || formatSelect === 1));
        else
          questionsArr.push(await formulateMPQuestionFromChars(req, true, question_format === "MC" || formatSelect === 1));
      }
    } catch (error) {
      console.error('Error fetching query:', error);
    }
    count++;
  }
  if (Boolean(isMM)) { //identify word via meaning
    try {
      questionsGenerated += questionTypeCounts[count];
      while (questionsArr.length < questionsGenerated) {
        let formatSelect = -1;

        //when learner selects both, randomly pick the format for each question
        if (question_format === "MW") formatSelect = Math.floor(Math.random() * 2);

        questionsArr.push(await formulateMMQuestion(req, true, question_format === "MC" || formatSelect === 1));
      }
    } catch (error) {
      console.error('Error fetching query:', error);
    }
    count++;
  }
  if (Boolean(isFB)) { // fill the blank to complete the sentence 
    try {
      questionsGenerated += questionTypeCounts[count];
      while (questionsArr.length < questionsGenerated) {
        let formatSelect = -1;

        //when learner selects both, randomly pick the format for each question
        if (question_format === "MW") formatSelect = Math.floor(Math.random() * 2);
        questionsArr.push(await formulateFITBQuestion(req, true, question_format === "MC" || formatSelect === 1));
      }
    } catch (error) {
      console.error('Error fetching fitb:', error);
    }
    count++;
  }
  if (Boolean(isTC)) {
    try {
      questionsGenerated += questionTypeCounts[count];
      while (questionsArr.length < questionsGenerated) {
        const trcn = await req.db.from("translation_questions")
          .select("eng_s_sentence", "eng_t_sentence")
          .andWhere("lesson_id", lessonId)
          .orderByRaw('RAND()')
          .limit(1);

        questionsArr.push("Translate the bolded sentence(s) into Chinese.<h6>&ensp;&ensp;&ensp;&nbsp;When specified, the names of people will be provided in parentheses.</h6>&ensp;&ensp;&nbsp;<strong>" + trcn[0].eng_s_sentence + "</strong><br />&ensp;&ensp;&ensp;______________________________________________");
      }
    } catch (error) {
      console.error('Error fetching vocab:', error);
    }
    count++;
  }

  //finally, get lesson details 
  const lessonTitle = await req.db.from("lessons").select("title").where("id", lessonId);

  return { title: lessonTitle[0].title, questionsArr: questionsArr };
}

router.get("/worksheets/:lessonId", async (req, res, next) => {
  try {
    //generate questions to put on worksheet
    const { title, questionsArr } = await getGeneratedQuestions(req);

    const questionHtml = questionsArr.map((q, i) => {
      if (i < Number(req.headers.questions)) return `<div class="question"><strong>${i + 1}.</strong> ${q}</div>`;
    }).join("");

    // Step 1: Construct full font path
    const fontPath = path.resolve(__dirname, 'fonts', 'NotoSansSC-Regular.otf');
    const fontURL = `file://${fontPath}`;

    // get worksheet template
    let html = fs.readFileSync(path.join(__dirname, '../templates', 'worksheet.html'), 'utf-8');

    // Replace placeholders 
    html = html.replace("{{LESSON_ID}}", req.params.lessonId).replace("{{LESSON_TITLE}}", title).replace('{{FONT_PATH}}', fontURL).replace("<!-- QUESTIONS GO HERE -->", questionHtml);

    // Launch Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    // Create PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
      headerTemplate: `
        <div></div>
      `,
      footerTemplate: `
        <div style="font-size:14px; text-align:right; width:100%; margin-right:50px; margin-bottom: 10px;">
          <span class="pageNumber">
        </div>
      `,
      displayHeaderFooter: true,
    });
    await browser.close();

    // Send response
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="worksheet.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('PDF generation failed.');
  }
});

module.exports = router;
