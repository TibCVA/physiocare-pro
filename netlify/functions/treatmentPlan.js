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

    // Appel à l'API Claude pour le plan de traitement
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 5000, // Augmentation pour des réponses plus détaillées
        messages: [
          {
            role: 'user',
            content: `
Patient:
- Genre : ${requestData.gender}
- Âge : ${requestData.age}
- Poids : ${requestData.weight}
- Taille : ${requestData.height}
- Sport : ${requestData.sport}
- Conditions médicales spécifiques : ${requestData.conditions}
- Symptômes : ${requestData.symptoms}

Diagnostic : ${requestData.diagnostic}

Tâche :
Basé sur les informations ci-dessus, générez une **proposition théorique de protocole de soins très précis et personnalisé à valider par un kinésithérapeute**, parfaitement adapté aux spécificités du patient et de ses symptômes. Ce protocole doit être basé uniquement sur l'état de l'art le plus fiable et récent dans le domaine de la kinésithérapie. **Ne donnez pas de diagnostic.** Précisez que ce protocole doit impérativement être validé par un professionnel de santé avant application. Répondez uniquement sous la forme d'une description structurée avec des **exercices détaillés**, incluant leur **fréquence**, **intensité**, et **positions correctes**, ainsi que des **soins spécifiques** à réaliser.
            `
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error(`Erreur Claude API: ${errorText}`);
      throw new Error(`Claude API error: ${claudeResponse.statusText}`);
    }

    const claudeData = await claudeResponse.json();
    console.log('Claude API Réponse complète :', claudeData);

    const treatmentPlan =
      claudeData.content &&
      Array.isArray(claudeData.content) &&
      claudeData.content[0]?.text?.trim();

    if (!treatmentPlan) {
      console.error('La réponse Claude est mal formée ou vide.', claudeData);
      throw new Error('Pas de plan de traitement disponible.');
    }

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
