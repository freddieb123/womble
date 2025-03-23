import OpenAI from 'openai';

async function testOpenAI() {
  console.log("Testing OpenAI API key...");
  
  console.log("API Key (partial):", process.env.OPENAI_API_KEY?.substring(0, 10) + "...");
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: false
  });

  try {
    // A simple test to check if the API key is valid
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say 'API key is working!' if you can read this." }
      ],
      max_tokens: 20
    });

    console.log("OpenAI API response:", response.choices[0].message.content);
    console.log("API key is valid!");
    return true;
  } catch (error: any) {
    console.error("OpenAI API Error:", error.message);
    console.error("Check your API key and make sure it's correctly configured.");
    return false;
  }
}

testOpenAI();