const fetch = require('node-fetch');
const fs = require('fs');
const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');
const parser = require('lambda-multipart-parser');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée. Utilisez POST.' }),
    };
  }

  try {
    // Log des en-têtes pour débogage
    console.log('Headers:', event.headers);

    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
      throw new Error('Content-Type doit être multipart/form-data');
    }

    const isBase64 = event.isBase64Encoded;
    const bodyBuffer = isBase64 ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf8');

    // Log de la taille du body
    console.log('Body Length:', bodyBuffer.length);

    // Parser les données multipart/form-data
    const result = await parser.parse(event);

    const files = result.files; // Liste des fichiers téléchargés
    const fields = result.fields; // Liste des champs non-fichiers

    console.log('Champs:', fields);
    console.log('Fichiers:', files);

    if (!files || files.length === 0) {
      throw new Error('Aucun fichier téléchargé.');
    }

    // Traiter les fichiers pour extraire le texte
    const extractedText = await extractTextFromFiles(files);
    console.log('Texte extrait:', extractedText);

    // Appel à l'API Claude avec le texte extrait
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 7000,
        messages: [
          {
            role: 'user',
            content: `Analysez le texte suivant et fournissez un diagnostic concis. Répondez uniquement en points-clés avec des explications synthétiques et pertinentes. Ne proposez pas de solutions ni de traitements. Voici le texte : "${extractedText}".`,
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

async function extractTextFromFiles(files) {
  let extractedText = '';

  for (let file of files) {
    const filePath = `/tmp/${file.filename}`;

    // Écrire le fichier temporaire
    fs.writeFileSync(filePath, file.content);
    console.log(`Fichier écrit temporairement à ${filePath}`);

    if (file.contentType === 'application/pdf') {
      try {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        extractedText += pdfData.text + ' ';
        console.log(`Texte extrait du PDF ${file.filename}`);
      } catch (err) {
        console.error(`Erreur lors de l'extraction du PDF ${file.filename}:`, err);
      }
    } else if (file.contentType.startsWith('image/')) {
      try {
        const worker = await createWorker();
        await worker.load();
        await worker.loadLanguage('eng'); // Assurez-vous que la langue est correcte
        await worker.initialize('eng');
        const { data: { text } } = await worker.recognize(filePath);
        extractedText += text + ' ';
        await worker.terminate();
        console.log(`Texte extrait de l'image ${file.filename}`);
      } catch (err) {
        console.error(`Erreur lors de l'extraction de l'image ${file.filename}:`, err);
      }
    }

    // Supprimer le fichier temporaire après traitement
    fs.unlinkSync(filePath);
    console.log(`Fichier temporaire supprimé: ${filePath}`);
  }

  return extractedText.trim();
}