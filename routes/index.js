var express = require('express');

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

var router = express.Router();

const { getGeneratedQuestions } = require('../controllers/questionsController');

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

//get title of lessons 
router.get("/lessons", async (req, res, next) => {
  const lessons = await req.db.from("lessons");
  res.json({ lessons });
});

router.get("/worksheets/:lessonId", async (req, res, next) => {
  try {
    //generate questions to put on worksheet
    const { title, questionsArr } = await getGeneratedQuestions(req);

    const numQuestions = Number(req.headers.questions); 

    const questionHtml = questionsArr.map((q, i) => {
      if (i < numQuestions) return `<div class="question"><strong>${i + 1}.</strong> ${q}</div>`;
    }).join("");

    // Step 1: Construct full font path
    const fontPath = path.resolve(__dirname, 'fonts', 'NotoSansSC-Regular.otf');
    const fontURL = `file://${fontPath}`;

    // get worksheet template
    let html = fs.readFileSync(path.join(__dirname, '../templates', 'worksheet.html'), 'utf-8');

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
