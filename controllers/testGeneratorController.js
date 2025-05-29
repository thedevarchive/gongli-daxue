const { 
    formulateMPQuestionFromChars, 
    formulateMPQuestionFromVocab,
    formulateMMQuestion, 
    formulateFITBQuestion,
    formulateTCQuestion, 
    formulateICSQuestion, 
    formulateRSQuestion, 
    formulateSCQuestion
} = require('./questionsController');

async function getGeneratedQuestions(req) {
    //get selected lesson id and worksheet details from client side
    const lessonId = Number(req.params.lessonId);
    const { questions, match_pinyin, match_meaning, fill_blank, translate_chn, ics, recon_sentence, simple_comp, question_format } = req.body;

    //get boolean values for each question type
    const isMP = match_pinyin === "true" ? 1 : 0;
    const isMM = match_meaning === "true" ? 1 : 0;
    const isFB = fill_blank === "true" ? 1 : 0;
    const isTC = translate_chn === "true" ? 1 : 0;
    const isICS = ics === "true" ? 1 : 0; 
    const isRS = recon_sentence === "true" ? 1 : 0; 
    const isSC = simple_comp === "true" ? 1 : 0; 

    let numberOfQuestionTypes = isMP + isMM + isFB + isTC + isICS + isRS + isSC;

    // ChatGPT provided this handy formula for calculating minimum per type
    // Minimum per type depends on the number of questions and number of question types selected
    const minPerType = Math.max(3, Math.floor(questions / (numberOfQuestionTypes * 2)));

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
                questionsArr.push(await formulateTCQuestion(req, true));
            }
        } catch (error) {
            console.error('Error fetching vocab:', error);
        }
        count++;
    }
    if (Boolean(isICS)) {
        try {
            questionsGenerated += questionTypeCounts[count];
            while (questionsArr.length < questionsGenerated) {
                questionsArr.push(await formulateICSQuestion(req, true));
            }
        } catch (error) {
            console.error('Error fetching vocab:', error);
        }
        count++;
    }
    if (Boolean(isRS)) {
        try {
            questionsGenerated += questionTypeCounts[count];
            while (questionsArr.length < questionsGenerated) {
                questionsArr.push(await formulateRSQuestion(req, true));
            }
        } catch (error) {
            console.error('Error generating RS questions:', error);
        }
        count++;
    }

    if (Boolean(isSC)) {
        try {
            questionsGenerated += questionTypeCounts[count];
            while (questionsArr.length < questionsGenerated) {
                questionsArr.push(await formulateSCQuestion(req, true));
            }
        } catch (error) {
            console.error('Error generating SC questions:', error);
        }
        count++;
    }

    //finally, get lesson details 
    const lessonTitle = await req.db.from("lessons").select("eng_title").where("id", lessonId);

    return { title: lessonTitle[0].eng_title, questionsArr: questionsArr };
}

async function getGeneratedAPQuestions(req) {
    //get selected lesson id and worksheet details from client side
    const lessonId = Number(req.params.lessonId);
    const { end_lesson, questions } = req.body;

    const NUMBER_OF_QUESTION_TYPES = 7; 

    const questionsArr = [];

    while(questionsArr.length < questions) {
        const questionType = Math.floor(Math.random() * NUMBER_OF_QUESTION_TYPES);
        const formatSelect = Math.floor(Math.random() * 2);

        if(questionType === 0) { //match pinyin
            const tableSelect = Math.floor(Math.random() * 2);
            if(tableSelect === 0) questionsArr.push(await formulateMPQuestionFromChars(req, true, formatSelect === 0, end_lesson));
            else questionsArr.push(await formulateMPQuestionFromVocab(req, true, formatSelect === 0, end_lesson));
        }
        else if(questionType === 1) { //Match meaning
            questionsArr.push(await formulateMMQuestion(req, true, formatSelect === 0, end_lesson));
        }
        else if(questionType === 2) { //fill in the blank
            questionsArr.push(await formulateFITBQuestion(req, true, formatSelect === 0, end_lesson));
        }
        else if(questionType === 3) { //translate chinese
            questionsArr.push(await formulateTCQuestion(req, true, end_lesson));
        }
        else if(questionType === 4 && lessonId >= 4) { //identify correct sentence
            questionsArr.push(await formulateICSQuestion(req, true, end_lesson));
        }
        else if(questionType === 5 && lessonId >= 5) { //reconstruct sentences
            questionsArr.push(await formulateRSQuestion(req, true, end_lesson));
        }
        else if(questionType === 6 && lessonId >= 8) { //soon
            //questionsArr.push(await formulateSCQuestion(req, true, end_lesson));
        }
    }

    return questionsArr;
}

module.exports = {
    getGeneratedQuestions, getGeneratedAPQuestions
}