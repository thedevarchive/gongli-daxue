const emojis = [
    "🧧", "✨", "🥠", "🎉", "🥳", "🎊", "🎲", "🤯", "🎁"
]

const shortPhrases = [
    "Lucky!", 
    "Lucky you!", 
    "Fortune favours you!", 
    "Stuck?", 
    "Need a hint?", 
    "Behold!", 
    "What's this?", 
    "Surprise!", 
    "Plot twist!", 
    "What a twist!"
]

const longPhrases = [
    "Here are the answers you’re looking for.", 
    "Make sure you tried your best before looking there.", 
    "You got lucky this time.", 
    "Next time, you won’t be so lucky.", 
    "It’s the answer key only spoken of in legends.", 
    "I bestow you the mythical answer key.",
    "Don’t tell anyone about it.", 
    "Bet you didn't see this one coming.", 
    "Click the link and find out.", 
    "You got a thing!", 
    "<br /> <strong>学而时习之，不亦说乎？《论语·学而 第一》</strong> <br /> (“Isn’t it a joy to study and practice what you’ve learned?” — The Analects of Confucius, Book 1: “Learning”, Section 1)",
    "<br /> <strong>路遥知马力，日久见人心。《争报恩》</strong><br /> (“As distance tests a horse's strength, time reveals a person's character.” - Fight Gratitude)",
    "<br /> <strong>无规矩不成方圆。《孟子·离娄上》</strong><br /> (“Without standards, no boundaries are set.“ - The Book of Mencius, “Li Lou”, Upper Chapter)",
    "<br /> <strong>三思而后行。《论语》</strong><br /> ( Think thrice before you act. -The Analects of Confucius)",
    "<br /> <strong>十年树木，百年树人。《管子·权修 第三》 </strong><br />(Ten years to cultivate wood, a hundred years to cultivate a man. - The Book of Guanzi, Chapter 3: “Balancing and Cultivating“)",
    "<br /> <strong>塞翁失马，焉知非福。《淮南子·人间训》</strong><br /> (Blessings come in disguise - Huainanzi, “Lessons of the Human World”)",
    "<br /> <strong>欲速则不达。《论语》</strong><br /> (“Those who desire speed do not succeed.“ - The Analects of Confucius)",
    "<br /> <strong>全世界都在讲中国话，我们说的话让世界都认真听话。- S.H.E 《中国话》</strong><br />(“The whole world will speak Chinese, and they will seriously heed the words we say.” - S.H.E, “Spoken Chinese“)",
    "<br /> <strong>你是我 only one，我是你 lucky one - EXO《Lucky One (Chinese Ver.)》</strong><br /> (“You are my only one, I am your lucky one” -EXO, “Lucky One (Chinese Ver.)”)"
]

function getAnswerKeyPhrases() {
    const emojiPicker = Math.floor(Math.random() * emojis.length);
    const emoji = emojis[emojiPicker]; 

    const sPhrasePicker = Math.floor(Math.random() * shortPhrases.length);
    const shortPhrase = shortPhrases[sPhrasePicker]; 

    const lPhrasePicker = Math.floor(Math.random() * longPhrases.length);
    const longPhrase = longPhrases[lPhrasePicker]; 

    return {emoji: emoji, shortPhrase: shortPhrase, longPhrase: longPhrase}; 
}

module.exports = {
    getAnswerKeyPhrases
}