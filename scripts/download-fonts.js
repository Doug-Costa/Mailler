const fs = require('fs');
const path = require('path');
const https = require('https');

const fontsDir = path.join(process.cwd(), 'public', 'fonts');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

// Open-licensed Google Fonts TTF files from official repository
const fonts = {
  'Roboto-Regular.ttf': 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf',
  'Roboto-Medium.ttf': 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf',
  'Montserrat-Regular.ttf': 'https://cdn.jsdelivr.net/gh/JulietaUla/Montserrat@master/fonts/ttf/Montserrat-Regular.ttf',
  'Montserrat-Bold.ttf': 'https://cdn.jsdelivr.net/gh/JulietaUla/Montserrat@master/fonts/ttf/Montserrat-Bold.ttf',
  'AlexBrush-Regular.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/alexbrush/AlexBrush-Regular.ttf'
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      // Handle redirect if any
      if (response.statusCode === 302 || response.statusCode === 301) {
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('🏁 Iniciando download das fontes...');
  for (const [name, url] of Object.entries(fonts)) {
    const dest = path.join(fontsDir, name);
    console.log(`⏳ Baixando ${name}...`);
    try {
      await download(url, dest);
      console.log(`✅ Sucesso: ${name}`);
    } catch (err) {
      console.error(`❌ Erro ao baixar ${name}:`, err.message);
    }
  }
  console.log('🎉 Download das fontes concluído!');
}

main();
