import { generateText } from "ai"
import { VERCEL_AI_MODELS } from "./utils/model"
import { MOCK_NEWS } from "./utils/data"


const SYSTEM_PROMPT = `
    You are a news summarizer, the user will give you several news article, and your job is to essentially summarize them into a headline + 3-5 bullet points. 
    ## Guardrails
    - Each bullet point should only be 1 sentence with a single focus
    ### Outputu
        1. <Headline></Headline>
        - Bullet point 1
        - Bullet ppoint 2
`

const PROMPT = MOCK_NEWS


void (async () =>{
    console.log(('Sending Prompt'))
    const result = await generateText({
        model: VERCEL_AI_MODELS.LING_3_1,
        prompt: PROMPT
    })
    console.log('Received Result')
    console.info('STEPS: \n',{
        finsihReason: result.steps[0].finishReason,
        response: result.steps[0].response
    })
    console.info('====RESPONSE START====')
    console.info('====RESPONSE END====')

})().catch((error)=>{
    console.log({
        error
    },'ERROR while running app exiting')
    process.exit(1)
})