// netlify/functions/diagnosis.js

const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée. Utilisez POST.' }),
    };
  }

  try {
    const requestData = JSON.parse(event.body);

    // Extraction des données d'entrée
    const { profile, symptoms, ocrText } = requestData;

    // Validation des données d'entrée
    if (!profile || !symptoms) { // ocrText est maintenant optionnel
      throw new Error(
        'Données d’entrée invalides. Assurez-vous de fournir un profil et des symptômes.'
      );
    }

    // Construction du prompt complet
    let prompt = `
      Basé sur les informations suivantes :
      - Profil du patient : "${profile}"
      - Symptômes : "${symptoms}"
    `;

    if (ocrText && ocrText.trim() !== '') {
      prompt += `
      - Résultats de l’analyse OCR : "${ocrText}"
      `;
    }

    prompt += `
    Fournissez un diagnostic concis en points-clés avec des explications synthétiques et pertinentes. Ne proposez pas de solutions ni de traitements.
    `;

    // Clés API en dur
    const anthropicApiKey = 'YOUR_ANTHROPIC_API_KEY'; // Remplacez par votre clé API Anthropic

    // Appel à l'API Claude
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': anthropicApiKey, // Clé API en dur
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 7000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error(`Erreur Claude API: ${errorText}`);
      throw new Error(`Claude API error: ${claudeResponse.statusText}`);
    }

    const claudeData = await claudeResponse.json();
    console.log('Claude API Réponse complète :', claudeData);

    // Vérification renforcée de la réponse
    const diagnosis =
      claudeData.content &&
      Array.isArray(claudeData.content) &&
      claudeData.content[0]?.text?.trim();

    if (!diagnosis) {
      console.error('La réponse Claude est mal formée ou vide.', claudeData);
      throw new Error('Pas de diagnostic disponible.');
    }

    // Retour du diagnostic
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        content: diagnosis,
      }),
    };
  } catch (error) {
    console.error('Erreur complète:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: error.message || 'Erreur serveur interne.',
        content: [
          {
            text: "Une erreur est survenue lors du traitement de la requête.",
          },
        ],
      }),
    };
  }
};