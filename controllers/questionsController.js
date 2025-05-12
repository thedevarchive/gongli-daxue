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

//uses Fisher-Yates (Durstenfeld) shuffle
//algorithm suggested by ChatGPT 
function shuffleChoices(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // swap elements
    }
    return array;
}

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

        if (choiceQuery.length < 3)
            //edge case for vocabulary with 4+ characters
            //pick any vocabulary from same lesson as the wrong choices 
            choiceQuery = await req.db.from("vocabulary")
                .select("s_hanzi")
                .whereRaw('CHAR_LENGTH(s_hanzi) < ?', [rightAns[0].s_hanzi.length])
                .andWhere("introduced_in_lesson", lessonId)
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

    const rightAns = await req.db.from("fitb_questions")
        .select("s_question", "s_answer")
        .where("lesson_id", lessonId)
        .orderByRaw("RAND()")
        .limit(1);

    const lines = rightAns[0].s_question.trim().split('\n');

    if (isMC) {
        const choices = [];

        let choiceQuery = await req.db.from("vocabulary")
            .select("s_hanzi")
            .whereRaw('CHAR_LENGTH(s_hanzi) = ?', [rightAns[0].s_answer.length])
            .andWhere("introduced_in_lesson", lessonId)
            .andWhere("s_hanzi", "!=", rightAns[0].s_answer)
            .orderByRaw('RAND()')
            .limit(3);

        if (choiceQuery.length < 3) {
            choiceQuery = await req.db.from("vocabulary")
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

        //if fill in the blank question is in dialogue form, format the question to display lines of dialogue in separate lines
        //and indent the lines after the first one 
        if (lines.length > 1) {
            return `<div style="display:flex; flex-direction: column; align-items: flex-start;"><div style="display:flex;"><strong>{{NUMBER}}.</strong><pre style="margin: 0 0 0 0.6em; font-family: inherit;">${rightAns[0].s_question}</pre></div><div style="padding-left: 2em; margin-top: 0.5em;">${choiceString}</div></div>`;
        }
        return rightAns[0].s_question + "<br />&ensp;&ensp;&ensp;" + choiceString;
    }

    if (lines.length > 1) {
        return `<div style="display:flex; align-items: flex-start;"><strong>{{NUMBER}}.</strong><pre style="margin: 0 0 0 0.6em; font-family: inherit;">${rightAns[0].s_question}</pre></div>`;
    }
    return rightAns[0].s_question;
}

async function formulateTCQuestions(req, isSimplified) {
    const lessonId = Number(req.params.lessonId);

    const question = await req.db.from("translation_questions")
        .select("eng_s_sentence", "eng_t_sentence")
        .where("lesson_id", lessonId)
        .orderByRaw("RAND()")
        .limit(1);

    return "Translate the bolded sentence(s) into Chinese.<h6>&ensp;&ensp;&ensp;&nbsp;When specified, the names of people will be provided in parentheses.</h6>&ensp;&ensp;&nbsp;<strong>" + question[0].eng_s_sentence + "</strong><br />&ensp;&ensp;&ensp;______________________________________________"
}

async function formulateICSQuestions(req, isSimplified) {
    const lessonId = Number(req.params.lessonId);

    const question = await req.db.from("identify_correct_sentence")
        .select("se_question", "sc_choice1", "sc_choice2", "sc_choice3", "sc_choice4")
        .where("lesson_id", lessonId)
        .orderByRaw("RAND()")
        .limit(1);

    const choices = [question[0].sc_choice1, question[0].sc_choice2, question[0].sc_choice3, question[0].sc_choice4];
    const shuffled = shuffleChoices(choices); 

    let choiceString = "";

    shuffled.map((sc, index) => (choiceString += "<br />&ensp;&ensp;&ensp;<strong>" + String.fromCharCode(65 + index) + `.</strong> ${sc}`));

    return question[0].se_question + choiceString;
}

async function getGeneratedQuestions(req) {
    //get selected lesson id and worksheet details from client side
    const lessonId = Number(req.params.lessonId);
    const { questions, match_pinyin, match_meaning, fill_blank, translate_chn, ics, question_format } = req.headers;

    //get boolean values for each question type
    const isMP = match_pinyin === "true" ? 1 : 0;
    const isMM = match_meaning === "true" ? 1 : 0;
    const isFB = fill_blank === "true" ? 1 : 0;
    const isTC = translate_chn === "true" ? 1 : 0;
    const isICS = ics === "true" ? 1 : 0; 

    console.log(req.headers); 

    let numberOfQuestionTypes = isMP + isMM + isFB + isTC + isICS;

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
                questionsArr.push(await formulateTCQuestions(req, true));
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
                questionsArr.push(await formulateICSQuestions(req, true));
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

module.exports = {
    getGeneratedQuestions
}