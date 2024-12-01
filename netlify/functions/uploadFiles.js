const fetch = require('node-fetch');
const formidable = require('formidable');
const fs = require('fs');
const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée. Utilisez POST.' }),
    };
  }

  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm();
    const files = [];
    const fields = {};

    form.parse(event, async (err, parsedFields, parsedFiles) => {
      if (err) {
        console.error('Formidable error:', err);
        return resolve({
          statusCode: 500,
          body: JSON.stringify({ error: 'Erreur lors de l\'analyse des fichiers.' }),
        });
      }

      // Collecter les fichiers
      for (const key in parsedFiles) {
        const file = parsedFiles[key];
        files.push({
          fieldname: key,
          filepath: file.filepath,
          mimetype: file.mimetype,
          filename: file.originalFilename,
        });
      }

      // Collecter les champs
      for (const key in parsedFields) {
        fields[key] = parsedFields[key];
      }

      try {
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
        resolve({
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            content: diagnosis,
          }),
        });
      } catch (error) {
        console.error('Erreur complète dans uploadFiles.js:', error);
        resolve({
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
        });
      }
    });
  });
};

async function extractTextFromFiles(files) {
  let extractedText = '';

  for (let file of files) {
    const filePath = file.filepath;

    if (file.mimetype === 'application/pdf') {
      try {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        extractedText += pdfData.text + ' ';
      } catch (err) {
        console.error('Erreur lors de l\'extraction du PDF:', err);
      }
    } else if (file.mimetype.startsWith('image/')) {
      try {
        const worker = await createWorker();
        await worker.load();
        await worker.loadLanguage('eng'); // Assurez-vous que la langue est correcte
        await worker.initialize('eng');
        const { data: { text } } = await worker.recognize(filePath);
        extractedText += text + ' ';
        await worker.terminate();
      } catch (err) {
        console.error('Erreur lors de l\'extraction de l\'image:', err);
      }
    }

    fs.unlinkSync(filePath); // Supprimez le fichier temporaire après traitement
  }

  return extractedText.trim();
}