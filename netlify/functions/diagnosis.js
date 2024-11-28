const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };
  }

  try {
    const requestData = JSON.parse(event.body);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2024-02-15',
        'x-api-key': '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'
      },
      body: JSON.stringify({
        model: requestData.model,
        max_tokens: requestData.max_tokens,
        messages: requestData.messages,
        system: requestData.system
      })
    });

    const data = await response.json();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal Server Error',
        details: error.message 
      })
    };
  }
};
