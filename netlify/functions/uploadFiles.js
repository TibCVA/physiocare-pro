const fetch = require('node-fetch');
const formidable = require('formidable');
const fs = require('fs');
const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');
const stream = require('stream');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée. Utilisez POST.' }),
    };
  }

  try {
    // Log the headers to inspect them
    console.log('Headers:', event.headers);

    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    if (!contentType) {
      console.error('No content-type header found.');
      throw new Error('Missing content-type header.');
    }

    const isBase64 = event.isBase64Encoded;

    // Convert body to buffer
    const buffer = isBase64 ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf8');

    // Create a readable stream from the buffer
    const readable = new stream.PassThrough();
    readable.end(buffer);

    // Create a new instance of formidable.IncomingForm
    const form = new formidable.IncomingForm();

    // Manually set headers including 'content-length'
    const contentLength = buffer.length;
    const headers = {
      'content-type': contentType,
      'content-length': contentLength.toString(),
    };
    form.headers = headers;

    // Parse the form
    const parsed = await new Promise((resolve, reject) => {
      form.parse(readable, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve({ fields, files });
        }
      });
    });

    // Log parsed fields and files
    console.log('Parsed Fields:', parsed.fields);
    console.log('Parsed Files:', parsed.files);

    // Process the files to extract text
    const extractedText = await extractTextFromFiles(parsed.files);
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

  for (let key in files) {
    const file = files[key];
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
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        const { data: { text } } = await worker.recognize(filePath);
        extractedText += text + ' ';
        await worker.terminate();
      } catch (err) {
        console.error('Erreur lors de l\'extraction de l\'image:', err);
      }
    }

    fs.unlinkSync(filePath); // Supprimer le fichier temporaire après traitement
  }

  return extractedText.trim();
}