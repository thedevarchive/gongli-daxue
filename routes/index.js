var express = require('express');

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

var router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get("/lessons", async (req, res, next) => {
  const lessons = await req.db.from("lessons").orderBy("id");
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

const pinyinPhrases = [
  "What word is pronounced {pinyin}?",
  "What word has this Pinyin: {pinyin}?",
  "Which word is read as {pinyin}?",
  "Select the word that matches the pronunciation {pinyin}.",
  "Choose the correct word for {pinyin}.",
  "Identify the corresponding Chinese word for the following pinyin: {pinyin}.",
  "Determine which word aligns with this pinyin reading: {pinyin}."
]

async function generateQuestions(req) {
  const lessonId = Number(req.params.lessonId);

  const { pages, match_pinyin, match_meaning, fill_blank, translate_chn, question_format } = req.headers;

  const isMP = match_pinyin === "true" ? 1 : 0;
  const isMM = match_meaning === "true" ? 1 : 0;
  const isFB = fill_blank === "true" ? 1 : 0;
  const isTC = translate_chn === "true" ? 1 : 0;

  let numberOfQuestions = pages * 10; //each page will have 10 questions
  let numberOfQuestionTypes = isMP + isMM + isFB + isTC;

  // ChatGPT provided this handy formula for calculating minimum per type
  // Minimum per type depends on the number of pages (questions) and number of question types selected
  const minPerType = Math.max(5, Math.floor(numberOfQuestions / (numberOfQuestionTypes * 2)));

  //add minimum questions for each type to allow learners to have at least a few questions for each type specified by learner
  const questionTypeCounts = Array(numberOfQuestionTypes).fill(minPerType);
  let remaining = numberOfQuestions - (minPerType * numberOfQuestionTypes);
  let r = remaining;

  //randomly distribute the remaining values until total number of questions is equal to numberOfQuestions
  while (r > 0) {
    const index = Math.floor(Math.random() * numberOfQuestionTypes);
    questionTypeCounts[index]++;
    r--;
  }

  let count = 0;
  const questions = [];

  if (Boolean(isMP)) {
    try {
      while (questions.length < questionTypeCounts[count]) {
        const tableSelect = Math.floor(Math.random() * 2);

        if (tableSelect === 1) {
          const vocab = await req.db.from("vocabulary")
            .select("pinyin", "s_hanzi")
            .where("introduced_in_lesson", lessonId)
            .andWhere("meaning", "not like", "%(name)")
            .orderByRaw('RAND()')
            .limit(questionTypeCounts[count]);

          vocab.map(async (v) => {
            let formatSelect = -1;

            //when learner selects both, randomly pick the format for each question
            if (question_format === "MW") formatSelect = Math.floor(Math.random() * 2);

            if (question_format === "MC" || formatSelect == 0) {
              //take a question template and include the selected pinyin
              const phraseSelect = Math.floor(Math.random() * pinyinPhrases.length);
              const question = pinyinPhrases[phraseSelect].replace("{pinyin}", v.pinyin);
              //select 3 more hanzi for the wrong choices 
              const choices = [];

              const choiceQuery = await req.db.from("vocabulary")
                .select("s_hanzi")
                .where("introduced_in_lesson", lessonId)
                .andWhere("pinyin", "!=", v.s_hanzi) //to avoid using characters that share same pinyin (e.g. 她 & 他)
                .orderByRaw('RAND()')
                .limit(3);

              choiceQuery.map((cq) => choices.push(cq.s_hanzi));
              choices.push(v.s_hanzi); // finally append the correct answer 
              const shuffled = shuffleChoices(choices); //shuffle choices 

              let choiceString = "";

              shuffled.map((sc, index) => (choiceString += String.fromCharCode(65 + index) + `. ${sc}     `));

              questions.push(question + "<br />" + choiceString);
            }
            else if (question_format === "WR" || formatSelect == 1) {
              //take a question template and include the selected pinyin
              const phraseSelect = Math.floor(Math.random() * pinyinPhrases.length);
              const question = pinyinPhrases[phraseSelect].replace("{pinyin}", v.pinyin);

              questions.push(question + " _____________");
            }
          });
        }
        else {
          const chars = await req.db.from("characters")
            .where("introduced_in_lesson", lessonId)
            .orderByRaw('RAND()')
            .limit(questionTypeCounts[count]);

          chars.map(async (c) => {
            let formatSelect = -1;

            //when learner selects both, randomly pick the format for each question
            if (question_format === "MW") formatSelect = Math.floor(Math.random() * 2);

            if (question_format === "MC" || formatSelect == 0) {
              //take a question template and include the selected pinyin
              const phraseSelect = Math.floor(Math.random() * pinyinPhrases.length);
              const question = pinyinPhrases[phraseSelect].replace("{pinyin}", c.pinyin);
              //select 3 more hanzi for the wrong choices 
              const choices = [];

              const choiceQuery = await req.db.from("characters")
                .select("s_hanzi")
                .where("introduced_in_lesson", lessonId)
                .andWhere("pinyin", "!=", c.s_hanzi) //to avoid using characters that share same pinyin (e.g. 她 & 他)
                .orderByRaw('RAND()')
                .limit(3);

              choiceQuery.map((cq) => choices.push(cq.s_hanzi));
              choices.push(c.s_hanzi); // finally append the correct answer 
              const shuffled = shuffleChoices(choices); //shuffle choices 

              let choiceString = "";

              shuffled.map((sc, index) => (choiceString += String.fromCharCode(65 + index) + `. ${sc}    `));

              questions.push(question + "<br />" + choiceString);
            }
            else if (question_format === "WR" || formatSelect == 1) {
              //take a question template and include the selected pinyin
              const phraseSelect = Math.floor(Math.random() * pinyinPhrases.length);
              const question = pinyinPhrases[phraseSelect].replace("{pinyin}", c.pinyin);

              questions.push(question + " _____________");
            }
          });
        }
      }
    } catch (error) {
      console.error('Error fetching vocab:', error);
    }
  }
  if (Boolean(isMM)) {

  }
  if (Boolean(isFB)) {

  }
  if (Boolean(isTC)) {

  }

  return questions;
}

router.get("/worksheets/:lessonId", async (req, res, next) => {
  try {
    const questions = await generateQuestions(req);

    const questionHtml = questions.map((q, i) => {
      return `<div class="question"><strong>${i + 1}.</strong>${q}</div>`;
    }).join("");

    // Step 1: Construct full font path
    const fontPath = path.resolve(__dirname, 'fonts', 'NotoSansSC-Regular.otf');
    const fontURL = `file://${fontPath}`;

    // get worksheet template
    let html = fs.readFileSync(path.join(__dirname, '../templates', 'worksheet.html'), 'utf-8');

    // Replace placeholders (naive templating)
    //const name = req.query.name || '世界';
    //html = html.replace('{{FONT_PATH}}', fontURL).replace('{{name}}', name);
    html = html.replace('{{FONT_PATH}}', fontURL).replace("<!-- QUESTIONS GO HERE -->", questionHtml);

    // Launch Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    // Create PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
    });
    await browser.close();

    // Send response
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="worksheet.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    res.send(Buffer.from(pdfBuffer));

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('PDF generation failed.');
  }
});

module.exports = router;
