const fetch = require('node-fetch');
const Busboy = require('busboy'); // Assurez-vous que Busboy est importé correctement
const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');
const streamifier = require('streamifier');
const pdfParse = require('pdf-parse'); // Importez pdf-parse

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée. Utilisez POST.' })
    };
  }

  try {
    const busboy = new Busboy({ headers: event.headers }); // Utilisez 'new Busboy'
    const files = [];

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      const filepath = `/tmp/${filename}`;
      const writeStream = fs.createWriteStream(filepath);
      file.pipe(writeStream);
      files.push({ fieldname, filepath, mimetype });
    });

    busboy.on('error', (err) => {
      console.error('Busboy error:', err);
      throw err;
    });

    busboy.on('finish', async () => {
      try {
        const extractedText = await extractTextFromFiles(files);

        // Appel à l'API Claude avec le texte extrait
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'x-api-key': process.env.ANTHROPIC_API_KEY
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-latest',
            max_tokens: 7000,
            messages: [
              {
                role: 'user',
                content: `Analysez le texte suivant et fournissez un diagnostic concis. Répondez uniquement en points-clés avec des explications synthétiques et pertinentes. Ne proposez pas de solutions ni de traitements. Voici le texte : "${extractedText}".`
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

        // Vérification renforcée de la réponse
        console.log('Vérification de la réponse Claude :', claudeData.content);
        console.log('Premier élément de content :', claudeData.content?.[0]);
        console.log('Texte du diagnostic :', claudeData.content?.[0]?.text);

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
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            content: diagnosis
          })
        };
      } catch (error) {
        console.error('Erreur complète dans uploadFiles.js:', error);
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
    });

    return new Promise((resolve, reject) => {
      let buffer = event.body;
      if (event.isBase64Encoded) {
        buffer = Buffer.from(event.body, 'base64');
      }
      streamifier.createReadStream(buffer).pipe(busboy);
      busboy.on('finish', () => {
        // Busboy handling is completed in the 'finish' event
      });
      busboy.on('error', (err) => reject(err));
    });
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