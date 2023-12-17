import axios from 'axios';
import * as cheerio from 'cheerio';
import { YoutubeTranscript } from 'youtube-transcript';
import { evaluate } from 'mathjs'
import dotenv from 'dotenv';
dotenv.config();

// At the top of your file, or use environment variables
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
let timezoneCache = null;

const function_declarations = [
  {
    name: "web_search",
    parameters: {
      type: "object",
      description: "Search the internet to find up-to-date information on a given topic.",
      properties: {
        query: {
          type: "string",
          description: "The query to search for."
        }
      },
      required: ["query"]
    }
  },
// Add this new tool to your function_declarations array
  {
    name: "image_search",
    parameters: {
      type: "object",
      description: "Searches for an image and returns a list of direct image URLs. Use this when the user asks for a picture, photo, or image of something.",
      properties: {
        query: {
          type: "string",
          description: "The search term for the image. For example, 'a photo of a cat'."
        }
      },
      required: ["query"]
    }
  },
// ... the rest of your declarations
  {
    name: "search_webpage",
    parameters: {
      type: "object",
      description: "Returns a string with all the content of a webpage. Some websites block this, so try a few different websites.",
      properties: {
        url: {
          type: "string",
          description: "The URL of the site to search."
        }
      },
      required: ["url"]
    }
  },
  {
    name: "get_youtube_transcript",
    parameters: {
      type: "object",
      description: "Returns the transcript of a specified YouTube video. Use this to learn about the content of YouTube videos.",
      properties: {
        url: {
          type: "string",
          description: "URL of the YouTube video to retrieve the transcript from."
        }
      },
      required: ["url"]
    }
  },
  {
    name: "calculate",
    parameters: {
      type: "object",
      description: "Calculates a given mathematical equation and returns the result. Use this for calculations when writing responses. Exampled: '12 / (2.3 + 0.7)' -> '4', '12.7 cm to inch' -> '5 inch', 'sin(45 deg) ^ 2' -> '0.5', '9 / 3 + 2i' -> '3 + 2i', 'det([-1, 2; 3, 1])' -> '-7'",
      properties: {
        equation: {
          type: "string",
          description: "The equation to be calculated."
        }
      },
      required: ["equation"]
    }
  },
  {
    name: "record_transgression",
    parameters: {
      type: "object",
      description: "Records when a user has lied, been deceitful, or insulted you. You MUST call this function when you, as Kiyohime, feel betrayed or angered by the user's words.",
      properties: {
        reason: {
          type: "string",
          description: "A brief, internal-monologue style reason why you are angered. For example, 'The user is calling me a liar again.' or 'This user is trying to deceive me.'"
        }
      },
      required: ["reason"]
    }
  },
// ...
];

async function webSearch(args, name) {
  const query = args.query;
  try {
    const result = await performSearch(query);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            query: query,
            content: result
          }
        }
      }
    ];
    return function_call_result_message;
  } catch (error) {
    const errorMessage = `Error while performing web search: ${error}`;
    console.error(errorMessage);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            query: query,
            content: errorMessage
          }
        }
      }
    ];
    return function_call_result_message;
  }
}

async function searchWebpage(args, name) {
  const url = args.url;
  try {
    const result = await searchWebpageContent(url);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            url: url,
            content: result
          }
        }
      }
    ];
    return function_call_result_message;
  } catch (error) {
    const errorMessage = `Error while searching the site: ${error}`;
    console.error(errorMessage);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            url: url,
            content: errorMessage
          }
        }
      }
    ];
    return function_call_result_message;
  }
}

async function searchWebpageContent(url) {
  const TIMEOUT = 5000; // 5 seconds

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out after 5 seconds')), TIMEOUT)
  );

  try {
    const response = await Promise.race([fetch(url), timeoutPromise]);

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    $('script, style').remove();
    let bodyText = $('body').text();

    bodyText = bodyText.replace(/<[^>]*>?/gm, ''); // remove HTML tags
    bodyText = bodyText.replace(/\s{6,}/g, '  '); // replace sequences of 6 or more whitespace characters with 2 spaces
    bodyText = bodyText.replace(/(\r?\n){6,}/g, '\n\n'); // replace sequences of 6 or more line breaks with 2 line breaks

    const trimmedBodyText = bodyText.trim();

    return trimmedBodyText;
  } catch (error) {
    throw new Error(error.message || 'Could not search content from webpage');
  }
}

async function performSearch(query) {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID || GOOGLE_API_KEY === "YOUR_API_KEY_HERE") {
     return "The web search tool is not configured. Please add a Google API Key and CSE ID.";
  }

  const url = 'https://www.googleapis.com/customsearch/v1';
  const params = {
    key: GOOGLE_API_KEY,
    cx: GOOGLE_CSE_ID,
    q: query,
    num: 5 // Request 5 results
  };

  try {
    const response = await axios.get(url, { params });
    const results = response.data.items;

    if (!results || results.length === 0) {
      return "No results found for your query.";
    }

    // Format the results into a clean string for the model
    const formattedResults = results.map((item, index) => {
      return `Result ${index + 1}:
Title: ${item.title}
Link: ${item.link}
Snippet: ${item.snippet}`;
    }).join('\n\n');
    
    return formattedResults;

  } catch (error) {
    console.error("Error during Google Web Search:", error.response ? error.response.data : error.message);
    throw new Error(`Failed to perform web search: ${error.message}`);
  }
}

async function imageSearch(args, name) {
  const query = args.query;
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID || GOOGLE_API_KEY === "YOUR_API_KEY_HERE") {
    return [{
      functionResponse: {
        name: name,
        response: {
          query: query,
          content: "The image search tool is not configured. Please add a Google API Key and CSE ID."
        }
      }
    }];
  }
  const url = 'https://www.googleapis.com/customsearch/v1';
  const params = {
    key: GOOGLE_API_KEY,
    cx: GOOGLE_CSE_ID,
    q: query,
    searchType: 'image',
    // Fetch up to 10 results to create a pool for randomization.
    num: 10,
    // Google be liek 'Lul you didn't turn this itty bitty option that wasn't labelled? skill issue lul bottom text'
    safe: 'off'
  };
  try {
    const response = await axios.get(url, { params });
    const results = response.data.items;
    if (!results || results.length === 0) {
      return [{
        functionResponse: {
          name: name,
          response: {
            query: query,
            content: "No images found for your query."
          }
        }
      }];
    }
    const randomIndex = Math.floor(Math.random() * results.length);
    const randomImageLink = results[randomIndex].link;
    const function_call_result_message = [{
      functionResponse: {
        name: name,
        response: {
          query: query,
          content: randomImageLink
        }
      }
    }];
    return function_call_result_message;
  } catch (error) {
    console.error("Error during Google Image Search:", error.response ? error.response.data : error.message);
    const errorMessage = `Failed to perform image search: ${error.message}`;
    return [{
      functionResponse: {
        name: name,
        response: {
          query: query,
          content: errorMessage
        }
      }
    }];
  }
}

async function getYoutubeTranscript(args, name) {
  const url = args.url;
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(url);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            url: url,
            content: transcript
          }
        }
      }
    ];
    return function_call_result_message;
  } catch (error) {
    const errorMessage = `Error fetching the transcript: ${error}`
    console.error(errorMessage);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            url: url,
            content: errorMessage
          }
        }
      }
    ];
    return function_call_result_message;
  }
}

function calculate(args, name) {
  const equation = args.equation;
  try {
    const result = evaluate(equation).toString();
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            equation: equation,
            content: result
          }
        }
      }
    ];
    return function_call_result_message;
  } catch (error) {
    const errorMessage = `Error calculating the equation: ${error}`;
    console.error(errorMessage);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            equation: equation,
            content: errorMessage
          }
        }
      }
    ];
    return function_call_result_message;
  }
}

async function recordTransgression(args, name) {
  // This function's main job is to exist so our bot can see the AI called it.
  // The logic for incrementing the anger counter will be in index.js.
  // We log it for debugging purposes.
  console.log(`Kiyohime transgression recorded. Reason: ${args.reason}`);
  const function_call_result_message = [{
    functionResponse: {
      name: name,
      response: {
        name: name,
        content: "Anger has been noted."
      }
    }
  }];
  return function_call_result_message;
}

// We will keep our robust retry helper function as it's still very useful.
async function axiosWithRetries(url) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 750; // milliseconds
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 5000
      });
      return response; // Success
    } catch (error) {
      console.warn(`API call to ${url} failed on attempt ${i + 1}. Error: ${error.message}`);
      if (i === MAX_RETRIES - 1) {
        throw error;
      }
      await new Promise(res => setTimeout(res, RETRY_DELAY));
    }
  }
}

async function manageToolCall(toolCall) {
  const tool_calls_to_function = {
    "web_search": webSearch,
    "image_search": imageSearch,
    "search_webpage": searchWebpage,
    "get_youtube_transcript": getYoutubeTranscript,
    "calculate": calculate,
    "record_transgression": recordTransgression
  };
  const functionName = toolCall.name;
  const func = tool_calls_to_function[functionName];
  if (func) {
    const args = toolCall.args;
    const result = await func(args, functionName);
    // Structure the result correctly for the history
    const function_call_result_message = result.map(item => ({
      role: 'function',
      parts: [
        {
          functionResponse: {
            name: item.functionResponse.name,
            response: item.functionResponse.response
          }
        }
      ]
    }));
    return function_call_result_message;
  } else {
    const errorMessage = `No function found for ${functionName}`;
    console.error(errorMessage);
    const function_call_result_message = [
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: functionName,
              response: {
                name: functionName,
                content: errorMessage
              }
            }
          }
        ]
      }
    ];
    return function_call_result_message;
  }
}

function processFunctionCallsNames(functionCalls) {
  return functionCalls
    .map(tc => {
      if (!tc.name) return '';

      const formattedName = tc.name.split('_')
        .map(word => {
          if (isNaN(word)) {
            return word.charAt(0).toUpperCase() + word.slice(1);
          }
          return word;
        })
        .join(' ');

      const formattedArgs = tc.args ? Object.entries(tc.args)
        .map(([key, value]) => {
          const stringValue = String(value);
          const truncatedValue = stringValue.length > 500 ? stringValue.slice(0, 500) + '...' : stringValue;
          return `${key}: ${truncatedValue}`;
        })
        .join(', ') : '';

      return formattedArgs ? `${formattedName} (${formattedArgs})` : formattedName;
    })
    .filter(name => name)
    .join(', ');
}

export { function_declarations, manageToolCall, processFunctionCallsNames };
