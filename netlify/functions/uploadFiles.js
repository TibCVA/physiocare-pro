const Busboy = require('busboy');
const streamifier = require('streamifier');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Méthode non autorisée. Utilisez POST.' }),
    };
  }

  return new Promise((resolve, reject) => {
    const busboy = new Busboy({ headers: event.headers });
    const fields = {};
    const files = [];

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      console.log(`File [${fieldname}]: filename: ${filename}, encoding: ${encoding}, mimetype: ${mimetype}`);
      let fileData = '';
      file.on('data', (data) => {
        fileData += data.toString();
      });
      file.on('end', () => {
        console.log(`File [${fieldname}] Finished`);
        files.push({ fieldname, filename, data: fileData });
      });
    });

    busboy.on('field', (fieldname, val) => {
      console.log(`Field [${fieldname}]: value: ${val}`);
      fields[fieldname] = val;
    });

    busboy.on('finish', () => {
      resolve({
        statusCode: 200,
        body: JSON.stringify({
          message: 'Files processed successfully',
          fields,
          files,
        }),
      });
    });

    busboy.on('error', (error) => {
      console.error('Busboy error:', error);
      reject({
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    // Convertir event.body en buffer et le passer à Busboy
    let buffer = event.body;
    if (event.isBase64Encoded) {
      buffer = Buffer.from(event.body, 'base64');
    }
    streamifier.createReadStream(buffer).pipe(busboy);
  });
};