const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée. Utilisez POST.' })
    };
  }

  try {
    const requestData = JSON.parse(event.body);

    // Validation des données d'entrée
    if (
      !requestData.model ||
      !requestData.messages ||
      !Array.isArray(requestData.messages) ||
      !requestData.messages[0]?.content
    ) {
      throw new Error(
        'Données d’entrée invalides. Assurez-vous de fournir un modèle et un message valide.'
      );
    }

    // Appel à l'API Claude
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: `Donnez un diagnostic concis basé sur les symptômes suivants. Répondez uniquement en points-clés avec des explications synthétiques et pertinentes. Ne proposez pas de solutions ni de traitements. Voici les symptômes : "${requestData.messages[0].content}".`
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text(); // Log the full error response
      console.error(`Erreur Claude API: ${errorText}`);
      throw new Error(`Claude API error: ${claudeResponse.statusText}`);
    }

    const claudeData = await claudeResponse.json();
    console.log('Claude API Réponse:', claudeData);

    // Correct extraction of the diagnostic content
    const diagnosis = claudeData.content?.[0]?.text; // Extract the first text block
    if (!diagnosis || diagnosis.trim().length === 0) {
      throw new Error('Réponse de Claude invalide ou vide.');
    }

    // Return the diagnosis
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        content: diagnosis // Send the extracted text as the response
      })
    };
  } catch (error) {
    console.error('Erreur complète:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error.message || 'Erreur serveur interne.',
        content: [
          {
            text: "Une erreur est survenue lors du traitement de la requête."
          }
        ]
      })
    };
  }
};
