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

const meaningPhrasesMC = [
  "Which word means {meaning}?",
  "Select the word that means {meaning}.",
  "Choose the correct word that refers to \"{meaning}\".",
  "Which of these mean \"{meaning}\"?",
  "Identify the word that means \"{meaning}\" in English.",
  "Encircle the letter next to the word that means {meaning}.",
  "Which of the following means {pinyin}?"
]

const meaningPhrasesWR = [
  "What word means {meaning}?",
  "Translate \"{meaning}\" to Chinese.",
  "Write the Chinese character(s) for \"{meaning}\"."
]

const particlePhrasesMC = [
  "Select the Chinese term used as a(n) {meaning}.",
  "Identify the Chinese term for {meaning}.",
  "Which Chinese particle refers to the {meaning}?",
  "Encircle the letter next to the particle for {meaning}."
]

const particlePhrasesWR = [
  "Translate the grammatical term “{meaning}” into Chinese.",
  "What is the Chinese equivalent of the {meaning}?",
  "What term is used as a(n) {meaning}?"
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
  console.log(questionTypeCounts);

  let count = 0; //count the different question types 
  let questionsGenerated = 0; // keep track of questions generated to ensure that it does not go over the prescribed limit
  const questions = [];

  if (Boolean(isMP)) { //identify word via pinyin 
    try {
      questionsGenerated += questionTypeCounts[count];
      while (questions.length < questionsGenerated) {
        const tableSelect = Math.floor(Math.random() * 2);

        if (tableSelect === 1) {
          const vocab = await req.db.from("vocabulary")
            .select("pinyin", "s_hanzi", "is_ambiguous")
            .whereNotNull("question_phrase") //eliminates character names in vocabulary 
            .andWhere("introduced_in_lesson", lessonId)
            .orderByRaw('RAND()')
            .limit(1);

          vocab.map(async (v) => {
            let formatSelect = -1;

            //when learner selects both, randomly pick the format for each question
            if (question_format === "MW") formatSelect = Math.floor(Math.random() * 2);

            if (question_format === "MC" || formatSelect == 0) {
              //take a question template and include the selected pinyin
              const phraseSelect = Math.floor(Math.random() * pinyinPhrasesMC.length);
              const question = pinyinPhrasesMC[phraseSelect].replace("{pinyin}", `<strong>${v.pinyin}</strong>`);
              //select 3 more hanzi for the wrong choices 
              const choices = [];

              const choiceQuery = await req.db.from("vocabulary")
                .select("s_hanzi")
                .where("introduced_in_lesson", lessonId)
                .andWhere("pinyin", "!=", v.pinyin) //to avoid using characters or words that share same pinyin (e.g. 她 & 他)
                .andWhere("s_hanzi", "!=", v.s_hanzi) //to avoid repeating the correct character or word
                .orderByRaw('RAND()')
                .limit(3);

              choiceQuery.map((cq) => choices.push(cq.s_hanzi));
              choices.push(v.s_hanzi); // finally append the correct answer 
              const shuffled = shuffleChoices(choices); //shuffle choices 

              let choiceString = "";

              shuffled.map((sc, index) => (choiceString += "<strong>" + String.fromCharCode(65 + index) + `.</strong> ${sc}&ensp;&ensp;&ensp;`));

              questions.push(question + "<br /> &ensp;&ensp;&ensp;" + choiceString);
            }
            else if (question_format === "WR" || formatSelect == 1) {
              if (v.is_ambiguous !== 1) {
                //take a question template and include the selected pinyin
                const phraseSelect = Math.floor(Math.random() * pinyinPhrasesWR.length);
                const question = pinyinPhrasesWR[phraseSelect].replace("{pinyin}", `<strong>${v.pinyin}</strong>`);

                questions.push(question + " _____________");
              }
            }
          });
        }
        else {
          const chars = await req.db.from("characters")
            .select("pinyin", "s_hanzi", "is_ambiguous")
            .where("introduced_in_lesson", lessonId)
            .orderByRaw('RAND()')
            .limit(1);

          chars.map(async (c) => {
            let formatSelect = -1;

            //when learner selects both, randomly pick the format for each question
            if (question_format === "MW") formatSelect = Math.floor(Math.random() * 2);

            if (question_format === "MC" || formatSelect == 0) {
              //take a question template and include the selected pinyin
              const phraseSelect = Math.floor(Math.random() * pinyinPhrasesMC.length);
              const question = pinyinPhrasesMC[phraseSelect].replace("{pinyin}", `<strong>${c.pinyin}</strong>`);
              //select 3 more hanzi for the wrong choices 
              const choices = [];

              const choiceQuery = await req.db.from("characters")
                .select("s_hanzi")
                .where("introduced_in_lesson", lessonId)
                .andWhere("pinyin", "!=", c.pinyin) //to avoid using characters that share same pinyin (e.g. 她 & 他)
                .andWhere("s_hanzi", "!=", c.s_hanzi) //to avoid repeating the correct character or word
                .orderByRaw('RAND()')
                .limit(3);

              choiceQuery.map((cq) => choices.push(cq.s_hanzi));
              choices.push(c.s_hanzi); // finally push the correct answer 
              const shuffled = shuffleChoices(choices); //shuffle choices 

              let choiceString = "";

              shuffled.map((sc, index) => (choiceString += "<strong>" + String.fromCharCode(65 + index) + `.</strong> ${sc} &ensp;&ensp;&ensp;`));

              questions.push(question + "<br />&ensp;&ensp;&ensp;" + choiceString);
            }
            else if (question_format === "WR" || formatSelect == 1) {
              if (c.is_ambiguous !== 1) {
                //take a question template and include the selected pinyin
                const phraseSelect = Math.floor(Math.random() * pinyinPhrasesWR.length);
                const question = pinyinPhrasesWR[phraseSelect].replace("{pinyin}", `<strong>${c.pinyin}</strong>`);

                questions.push(question + " _____________");
              }
            }
          });
        }
      }
    } catch (error) {
      console.error('Error fetching query:', error);
    }
    count++;
  }
  if (Boolean(isMM)) {
    try {
      questionsGenerated += questionTypeCounts[count];
      while (questions.length < questionsGenerated) {
        const vocab = await req.db.from("vocabulary")
          .select("meaning", "question_phrase", "s_hanzi")
          .whereNotNull("question_phrase")
          .andWhere("introduced_in_lesson", lessonId)
          .orderByRaw('RAND()')
          .limit(1);

        console.log("vocab length:", vocab.length);

        vocab.map(async (v) => {

          let formatSelect = -1;

          //when learner selects both, randomly pick the format for each question
          if (question_format === "MW") formatSelect = Math.floor(Math.random() * 2);

          if (question_format === "MC" || formatSelect == 0) {
            //take a question template and include the selected pinyin
            let question = "";

            if (v.meaning.startsWith("(")) {
              const phraseSelect = Math.floor(Math.random() * particlePhrasesMC.length);
              question = particlePhrasesMC[phraseSelect].replace("{meaning}", `<strong>${v.question_phrase}</strong>`);
            }
            else {
              const phraseSelect = Math.floor(Math.random() * meaningPhrasesMC.length);
              question = meaningPhrasesMC[phraseSelect].replace("{meaning}", `<strong>${v.question_phrase}</strong>`);
            }

            const choices = [];

            const choiceQuery = await req.db.from("vocabulary")
              .select("s_hanzi")
              .whereNotNull("question_phrase")
              .andWhere("introduced_in_lesson", lessonId)
              .andWhere("question_phrase", "!=", v.question_phrase)
              .orderByRaw('RAND()')
              .limit(3);

            choiceQuery.map((cq) => choices.push(cq.s_hanzi));
            choices.push(v.s_hanzi); // finally push the correct answer 
            const shuffled = shuffleChoices(choices); //shuffle choices 

            let choiceString = "";

            shuffled.map((sc, index) => (choiceString += "<strong>" + String.fromCharCode(65 + index) + `.</strong> ${sc} &ensp;&ensp;&ensp;`));

            questions.push(question + "<br />&ensp;&ensp;&ensp;" + choiceString);
          }
          else if (question_format === "WR" || formatSelect == 1) {
            //take a question template and include the selected pinyin
            const phraseSelect = Math.floor(Math.random() * meaningPhrasesWR.length);
            let question = "";
            if (v.meaning.startsWith("(")) {
              const phraseSelect = Math.floor(Math.random() * particlePhrasesWR.length);
              question = particlePhrasesWR[phraseSelect].replace("{meaning}", `<strong>${v.question_phrase}</strong>`);
            }
            else {
              const phraseSelect = Math.floor(Math.random() * meaningPhrasesWR.length);
              question = meaningPhrasesWR[phraseSelect].replace("{meaning}", `<strong>${v.question_phrase}</strong>`);
            }

            questions.push(question + " _____________");

          }
        });
      }
    } catch (error) {
      console.error('Error fetching vocab:', error);
    }
    count++;
  }
  if (Boolean(isFB)) {
    try {
      questionsGenerated += questionTypeCounts[count];
      while (questions.length < questionsGenerated) {
        const fitb = await req.db.from("fitb_questions")
          .select("s_question", "s_answer")
          .andWhere("lesson_id", lessonId)
          .orderByRaw("RAND()")
          .limit(1);

        fitb.map(async (f) => {
          let question = f.s_question;

          let formatSelect = -1;

          //when learner selects both, randomly pick the format for each question
          if (question_format === "MW") formatSelect = Math.floor(Math.random() * 2);

          if (question_format === "MC" || formatSelect == 0) {
            const choices = [];

            const choiceQuery = await req.db.from("vocabulary")
              .select("s_hanzi")
              .andWhere("introduced_in_lesson", lessonId)
              .andWhere("s_hanzi", "!=", f.s_answer)
              .orderByRaw('RAND()')
              .limit(3);

            choiceQuery.map((cq) => choices.push(cq.s_hanzi));
            choices.push(f.s_answer); // finally push the correct answer 
            const shuffled = shuffleChoices(choices); //shuffle choices 

            let choiceString = "";

            shuffled.map((sc, index) => (choiceString += "<strong>" + String.fromCharCode(65 + index) + `.</strong> ${sc} &ensp;&ensp;&ensp;`));

            questions.push(question + "<br />&ensp;&ensp;&ensp;" + choiceString);

          }
          else if (question_format === "WR" || formatSelect == 1)
            questions.push(question);
        });
      }
    } catch (error) {
      console.error('Error fetching vocab:', error);
    }
    count++;
  }
  if (Boolean(isTC)) {

  }

  //finally, get lesson details 
  const lessonTitle = await req.db.from("lessons").select("title").where("id", lessonId);
  //console.log(lessonTitle); 
  //console.log([lessonTitle[0].title, questions]); 

  return { title: lessonTitle[0].title, questions: questions };
}

router.get("/worksheets/:lessonId", async (req, res, next) => {
  try {
    //generate questions
    const { title, questions } = await generateQuestions(req);

    const questionHtml = questions.map((q, i) => {
      if(i < Number(req.headers.pages) * 10) return `<div class="question"><strong>${i + 1}.</strong> ${q}</div>`;
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
      margin: { top: '10mm', bottom: '15mm', left: '10mm', right: '10mm' }
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
