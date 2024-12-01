// netlify/functions/uploadFiles.js

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const parser = require('lambda-multipart-parser');
const FormData = require('form-data');

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

    // Retourner le texte extrait
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        ocrText: extractedText,
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

  // Clé API en dur
  const OCR_SPACE_API_KEY = 'YOUR_OCR_SPACE_API_KEY'; // Remplacez par votre clé API réelle

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
        // Envoyer l'image à OCR.space pour l'OCR
        const ocrText = await performOCR(filePath, OCR_SPACE_API_KEY);
        extractedText += ocrText + ' ';
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

async function performOCR(filePath, ocrApiKey) {
  if (!ocrApiKey) {
    throw new Error('La clé API OCR.space n\'est pas définie.');
  }

  const form = new FormData();
  form.append('apikey', ocrApiKey);
  form.append('language', 'eng'); // Ajustez la langue si nécessaire
  form.append('file', fs.createReadStream(filePath));
  form.append('isOverlayRequired', 'false');

  try {
    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: form,
    });

    const data = await response.json();

    if (data.IsErroredOnProcessing) {
      console.error('Erreur OCR.space:', data.ErrorMessage);
      throw new Error('Erreur lors de l\'extraction du texte avec OCR.space.');
    }

    const parsedText = data.ParsedResults[0].ParsedText;
    return parsedText;
  } catch (error) {
    console.error('Erreur lors de la communication avec OCR.space:', error);
    throw new Error('Erreur lors de la communication avec le service OCR.');
  }
}