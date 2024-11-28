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
    
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2024-02-15',
        'x-api-key': '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'
      },
      body: JSON.stringify({
        model: requestData.model,
        messages: [{
          role: "user",
          content: requestData.messages[0].content
        }]
      })
    });

    if (!claudeResponse.ok) {
      throw new Error(`Claude API error: ${claudeResponse.status}`);
    }

    const claudeData = await claudeResponse.json();
    console.log('Claude Response:', claudeData);

    // Vérification de la structure de la réponse
    if (!claudeData.content || !claudeData.content[0] || !claudeData.content[0].text) {
      throw new Error('Format de réponse Claude invalide');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        content: [{
          text: claudeData.content[0].text
        }]
      })
    };
  } catch (error) {
    console.error('Function Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: error.message,
        content: [{
          text: "Une erreur est survenue lors du traitement de la requête."
        }]
      })
    };
  }
};
