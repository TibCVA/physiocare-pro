const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
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
    // Vérifier le Content-Type
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
      throw new Error('Content-Type doit être multipart/form-data');
    }

    // Parser les données multipart/form-data
    const result = await parser.parse(event);
    const files = result.files;
    const fields = result.fields;

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

  // Configuration des chemins pour les workers et core
  const workerPath = path.join(__dirname, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
  const langPath = path.join(__dirname, 'node_modules', 'tesseract.js', 'lang-data');

  for (let file of files) {
    const filePath = `/tmp/${file.filename}`;

    try {
      // Écrire le fichier temporaire
      fs.writeFileSync(filePath, file.content);
      console.log(`Fichier écrit temporairement à ${filePath}`);

      if (file.contentType === 'application/pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        extractedText += pdfData.text + ' ';
        console.log(`Texte extrait du PDF ${file.filename}`);
      } else if (file.contentType.startsWith('image/')) {
        const worker = createWorker({
          logger: m => console.log(m),
          workerPath: workerPath,
          langPath: langPath,
        });

        await worker.load();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        const { data: { text } } = await worker.recognize(filePath);
        extractedText += text + ' ';
        await worker.terminate();
        console.log(`Texte extrait de l'image ${file.filename}`);
      }

      // Supprimer le fichier temporaire après traitement
      fs.unlinkSync(filePath);
      console.log(`Fichier temporaire supprimé: ${filePath}`);
    } catch (err) {
      console.error(`Erreur lors du traitement du fichier ${file.filename}:`, err);
      // Continue avec le prochain fichier sans interrompre le processus
    }
  }

  return extractedText.trim();
}