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

    // Définir les champs requis sauf 'conditions'
    const requiredFields = ['model', 'gender', 'age', 'weight', 'height', 'sport', 'symptoms', 'diagnostic', 'messages'];

    // Identifier les champs manquants
    const missingFields = requiredFields.filter(field => !requestData[field] || (typeof requestData[field] === 'string' && requestData[field].trim() === ''));

    if (missingFields.length > 0) {
      console.error('Champs manquants dans la requête :', missingFields);
      throw new Error(
        `Données d’entrée invalides. Champs manquants : ${missingFields.join(', ')}.`
      );
    }

    // 'conditions' peut être vide, mais vérifier qu'il existe
    if (typeof requestData.conditions === 'undefined') {
      console.error('Le champ "conditions" est absent.');
      throw new Error(
        'Données d’entrée invalides. Le champ "conditions" est requis.'
      );
    }

    // Logs des données reçues
    console.log('Données reçues pour le plan de traitement :', requestData);

    // Construction du prompt pour le plan de traitement (Simplifié)
    const prompt = `
Patient:
- Genre : ${requestData.gender}
- Âge : ${requestData.age}
- Poids : ${requestData.weight} kg
- Taille : ${requestData.height} cm
- Sport : ${requestData.sport}
- Conditions médicales spécifiques : ${requestData.conditions}
- Symptômes : ${requestData.symptoms}

Diagnostic : ${requestData.diagnostic}

Tâche :
Générez un plan de traitement personnalisé incluant des exercices avec fréquence, intensité et positions correctes. Ne donnez pas de diagnostic. Assurez-vous que ce protocole soit validé par un professionnel de santé avant application.
    `;

    console.log('Prompt envoyé à Claude :', prompt);

    console.log('Avant l\'appel à l\'API Claude');

    // Appel à l'API Claude pour le plan de traitement avec `max_tokens` réduit
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 3000, // Réduction à 1000
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    console.log('Après l\'appel à l\'API Claude');

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error(`Erreur Claude API: ${errorText}`);
      throw new Error(`Erreur de l'API Claude: ${claudeResponse.statusText}`);
    }

    const claudeData = await claudeResponse.json();
    console.log('Réponse complète de Claude :', claudeData);

    // Traitement de la réponse de Claude
    let treatmentPlan = '';

    if (Array.isArray(claudeData.content)) {
      // Concatenation des segments de texte
      treatmentPlan = claudeData.content.map(part => part.text).join('\n');
    } else if (typeof claudeData.content === 'string') {
      treatmentPlan = claudeData.content.trim();
    }

    if (!treatmentPlan) {
      console.error('La réponse de Claude est mal formée ou vide.', claudeData);
      throw new Error('Pas de plan de traitement disponible.');
    }

    console.log('Plan de traitement généré :', treatmentPlan);

    // Retour du plan de traitement
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        content: treatmentPlan
      })
    };
  } catch (error) {
    console.error('Erreur complète dans treatmentPlan.js:', error);

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
