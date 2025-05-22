var express = require('express');

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

var router = express.Router();

const { getGeneratedQuestions, getGeneratedAPQuestions } = require('../controllers/testGeneratorController');
const { getAnswerKeyPhrases } = require("../controllers/miscController");
const { get } = require('https');

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

//get title of lessons 
router.get("/lessons", async (req, res, next) => {
  const lessons = await req.db.from("lessons");
  res.json({ lessons });
});

router.get("/guides/:lessonId", async (req, res, next) => {
  const script = req.query.script || 'simplified'; // fallback to default if not provided

  const lessonQuery = await req.db.from("lessons")
    .select("eng_title", "s_chn_title")
    .where("id", req.params.lessonId);

  const objectives = await req.db.from("objectives")
    .select("description")
    .where("lesson_id", req.params.lessonId);

  const titles = lessonQuery[0]; 
  let vocab, vocabNotes, sampleStc;

  if (script === "simplified") {
    vocab = await req.db.from("vocabulary")
      .select("s_hanzi", "pinyin", "meaning")
      .where("introduced_in_lesson", req.params.lessonId);

    vocabNotes = await req.db.from("vocabulary")
      .select("s_hanzi", "pinyin", "meaning", "eng_s_notes")
      .whereNot(function () {
        this.where('eng_s_notes', "like", "Sentence character%");
      })
      .andWhere(function () {
        this.whereNot('eng_s_notes', "like", 'Name in%');
      })
      .andWhere("introduced_in_lesson", req.params.lessonId);

    sampleStc = await req.db.from("sample_sentences")
      .select("s_sentence", "eng_s_notes")
      .where("lesson_id", req.params.lessonId);
  }
  else {
    vocab = await req.db.from("vocabulary")
      .select("t_hanzi", "pinyin", "meaning", "eng_t_notes")
      .where("introduced_in_lesson", req.params.lessonId);

    vocabNotes = await req.db.from("vocabulary")
      .select("t_hanzi", "pinyin", "meaning", "eng_t_notes")
      .whereNot(function () {
        this.where('eng_t_notes', "like", "Sentence character%");
      })
      .andWhere(function () {
        this.whereNot('eng_t_notes', "like", 'Name in%');
      })
      .andWhere("introduced_in_lesson", req.params.lessonId);

    sampleStc = await req.db.from("sample_sentences")
      .select("t_sentence", "eng_t_notes")
      .where("lesson_id", req.params.lessonId);
  }

  return res.json({ titles, objectives, vocab, vocabNotes, sampleStc });
});

router.get("/key/:code", async (req, res, next) => {
  const script = req.query.script || 'simplified'; // fallback to default if not provided

  const lessonQuery = await req.db.from("lessons")
    .select("id", "eng_title", "s_chn_title")
    .where("hash", req.params.code);

  const lesson = lessonQuery[0];
  let chars, vocab, fitb_questions, tc_questions;

  if (script === "simplified") {
    chars = await req.db.from("characters")
      .select("s_hanzi", "pinyin")
      .where("introduced_in_lesson", lesson.id);

    vocab = await req.db.from("vocabulary")
      .select("s_hanzi", "pinyin", "meaning")
      .where("introduced_in_lesson", lesson.id);

    fitb_questions = await req.db.from("fitb_questions")
      .select("s_question", "s_answer")
      .where("lesson_id", lesson.id);

    tc_questions = await req.db.from("translation_questions")
      .select("eng_s_sentence", "chn_s_sentence")
      .where("lesson_id", lesson.id);
  }
  else {
    chars = await req.db.from("characters")
      .select("t_hanzi", "pinyin")
      .where("introduced_in_lesson", lesson.id);

    vocab = await req.db.from("vocabulary")
      .select("t_hanzi", "pinyin", "meaning")
      .where("introduced_in_lesson", lesson.id);

    fitb_questions = await req.db.from("fitb_questions")
      .select("t_question", "t_answer")
      .where("lesson_id", lesson.id);

    tc_questions = await req.db.from("translation_questions")
      .select("eng_t_sentence", "chn_t_sentence")
      .where("lesson_id", lesson.id);
  }
  return res.json({ lesson, chars, vocab, fitb_questions, tc_questions });
});

router.post("/worksheets/:lessonId", async (req, res, next) => {
  try {
    //generate questions to put on worksheet
    const { title, questionsArr } = await getGeneratedQuestions(req);

    const numQuestions = Number(req.body.questions);

    const questionHtml = questionsArr.map((q, i) => {
      if (i < numQuestions) {
        if (q.includes("{{NUMBER}}")) return `<div class="question">${q.replace("{{NUMBER}}", i + 1)}</div>`;
        else return `<div class="question"><strong>${i + 1}.</strong> ${q}</div>`;
      }
    }).join("");

    // Step 1: Construct full font path
    const fontPath = path.resolve(__dirname, 'fonts', 'NotoSansSC-Regular.otf');
    const fontURL = `file://${fontPath}`;

    // get worksheet template
    let html = (req.body.is_for_kids === "true") ?
      fs.readFileSync(path.join(__dirname, '../templates', 'worksheet_jr.html'), 'utf-8') :
      fs.readFileSync(path.join(__dirname, '../templates', 'worksheet_default.html'), 'utf-8');

    //calculate highest possible score for every grade except D (0 is lowest possible score in that letter grade)
    //matches the Chinese grading system
    //if lowest possible grade is a decimal value, round up values to encourage students to keep working towards the A grade (the Chinese way)
    const aLow = Math.ceil(numQuestions * 0.85);
    const bLow = Math.ceil(numQuestions * 0.75);
    const cLow = Math.ceil(numQuestions * 0.65);

    // Replace placeholders 
    html = html.replace("{{LESSON_ID}}", req.params.lessonId)
      .replace("{{LESSON_TITLE}}", title)
      .replace('{{FONT_PATH}}', fontURL)
      .replaceAll("{{SERVER_PORT}}", process.env.PORT)
      .replace('{{A_HIGH_GRADE}}', numQuestions)
      .replace('{{A_LOW_GRADE}}', aLow)
      .replace('{{B_HIGH_GRADE}}', (aLow - 1))
      .replace('{{B_LOW_GRADE}}', bLow)
      .replace('{{C_HIGH_GRADE}}', (bLow - 1))
      .replace('{{C_LOW_GRADE}}', cLow)
      .replace('{{D_HIGH_GRADE}}', (cLow - 1))
      .replace("<!-- QUESTIONS GO HERE -->", questionHtml);

    const luckyAnswerKey = Math.floor(Math.random() * 3);

    if (luckyAnswerKey >= 0) {
      const { emoji, shortPhrase, longPhrase } = getAnswerKeyPhrases();

      const answerKeyHtml = "<div class='answer-link'>{{EMOJI}}<a href='http://localhost:3000/answer-key/{{CODE}}'>{{SHORT_PHRASE}}</a> {{LONG_PHRASE}}</div>";

      const codeQuery = await req.db.from("lessons").select("hash").where("id", req.params.lessonId); 

      html = html.replace("<!-- ANSWER KEY MAY SHOW UP HERE -->", answerKeyHtml)
        .replace("{{CODE}}", codeQuery[0].hash)
        .replace("{{EMOJI}}", emoji)
        .replace("{{SHORT_PHRASE}}", shortPhrase)
        .replace("{{LONG_PHRASE}}", longPhrase);
    }

    // Launch Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    // Create PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '8mm', bottom: '12mm', left: '10mm', right: '10mm' },
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

router.post("/academic-performance/:lessonId", async (req, res, next) => {
  try {
    //generate questions to put on worksheet
    const questionsArr = await getGeneratedAPQuestions(req);

    const numQuestions = Number(req.body.questions);

    const questionHtml = questionsArr.map((q, i) => {
      if (i < numQuestions) {
        if (q.includes("{{NUMBER}}")) return `<div class="question">${q.replace("{{NUMBER}}", i + 1)}</div>`;
        else return `<div class="question"><strong>${i + 1}.</strong> ${q}</div>`;
      }
    }).join("");

    // Step 1: Construct full font path
    const fontPath = path.resolve(__dirname, 'fonts', 'NotoSansSC-Regular.otf');
    const fontURL = `file://${fontPath}`;

    // get worksheet template
    let html = (req.body.is_for_kids === "true") ?
      fs.readFileSync(path.join(__dirname, '../templates', 'worksheet_ap_jr.html'), 'utf-8') :
      fs.readFileSync(path.join(__dirname, '../templates', 'worksheet_ap.html'), 'utf-8');

    //calculate highest possible score for every grade except D (0 is lowest possible score in that letter grade)
    //matches the Chinese grading system
    //if lowest possible grade is a decimal value, round up values to encourage students to keep working towards the A grade (the Chinese way)
    const aLow = Math.ceil(numQuestions * 0.85);
    const bLow = Math.ceil(numQuestions * 0.75);
    const cLow = Math.ceil(numQuestions * 0.65);

    // Replace placeholders 
    html = html.replace("{{FIRST_LESSON_ID}}", req.params.lessonId)
      .replace('{{LAST_LESSON_ID}}', req.body.end_lesson)
      .replace('{{FONT_PATH}}', fontURL)
      .replaceAll("{{SERVER_PORT}}", process.env.PORT)
      .replace('{{A_HIGH_GRADE}}', numQuestions)
      .replace('{{A_LOW_GRADE}}', aLow)
      .replace('{{B_HIGH_GRADE}}', (aLow - 1))
      .replace('{{B_LOW_GRADE}}', bLow)
      .replace('{{C_HIGH_GRADE}}', (bLow - 1))
      .replace('{{C_LOW_GRADE}}', cLow)
      .replace('{{D_HIGH_GRADE}}', (cLow - 1))
      .replace("<!-- QUESTIONS GO HERE -->", questionHtml);

    // Launch Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    // Create PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '8mm', bottom: '12mm', left: '10mm', right: '10mm' },
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
