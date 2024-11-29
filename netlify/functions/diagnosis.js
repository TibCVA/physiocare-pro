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

    console.log('Appel à l\'API Claude...');

    // Appel à l'API Claude
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: requestData.model,
        messages: requestData.messages,
        max_tokens: requestData.max_tokens || 1000
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error(`Erreur Claude API: ${errorText}`);
      throw new Error(`Claude API error: ${claudeResponse.statusText}`);
    }

    const claudeData = await claudeResponse.json();
    console.log('Claude API Réponse complète :', claudeData);

    // Extraction du contenu de la réponse
    let content = '';

    if (Array.isArray(claudeData.content) && claudeData.content.length > 0) {
      content = claudeData.content.map(item => item.text).join('').trim();
    }

    if (!content) {
      console.error('La réponse Claude est mal formée ou vide.', claudeData);
      throw new Error('Pas de réponse disponible.');
    }

    // Retour de la réponse
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        content: content
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
        content: "Une erreur est survenue lors du traitement de la requête."
      })
    };
  }
};
