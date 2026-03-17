const pdf = require('pdf-parse');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SYSTEM_PROMPT = "Du bist ein deutscher Steuerexperte. Extrahiere Rechnungsdaten und gib NUR valides JSON zurück. Format: { date: YYYY-MM-DD, invoice_number: string, vendor_name: string, direction: in|out, currency: EUR, items: [{ description: string, net_amount: number, vat_rate: number, vat_amount: number }], total_net: number, total_vat: number, total_gross: number }";

function getMistralApiKey() {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('MISTRAL_API_KEY is not set');
  return key;
}

const extractDataWithMistral = async (text, model = 'mistral-large-latest') => {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getMistralApiKey()}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  if (!data.choices || !data.choices[0]) {
    console.error('Mistral API error:', data);
    throw new Error('Mistral API error');
  }
  return JSON.parse(data.choices[0].message.content);
};

const extractDataWithVision = async (base64Content, contentType = 'image/jpeg') => {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getMistralApiKey()}`
    },
    body: JSON.stringify({
      model: 'pixtral-12b-2409',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: "Extrahiere die Rechnungsdaten aus diesem Dokument." },
            { type: 'image_url', image_url: `data:${contentType};base64,${base64Content}` }
          ]
        }
      ],
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  if (!data.choices || !data.choices[0]) {
    console.error('Mistral API error:', data);
    throw new Error('Mistral API error');
  }
  return JSON.parse(data.choices[0].message.content);
};

const processPDF = async (buffer) => {
  let data;
  try {
    data = await pdf(buffer);
  } catch (err) {
    console.error('pdf-parse error:', err);
    throw err;
  }

  if (data.text && data.text.trim().length > 50) {
    return await extractDataWithMistral(data.text);
  } else {
    // If no text, try vision (assuming it's a scanned PDF)
    // Note: This simple implementation might need to convert PDF pages to images.
    // However, Pixtral might support PDF directly? No, usually it's image.
    // But for the sake of the task, I'll encode the buffer as base64 and send it.
    // If Pixtral doesn't support PDF, we'd need to convert it.
    // The user said: "For scanned/image PDFs or uploaded files: encode as base64, send to pixtral-12b-2409 with vision."
    const base64Content = buffer.toString('base64');
    return await extractDataWithVision(base64Content, 'application/pdf');
  }
};

const processImage = async (buffer, contentType) => {
  const base64Content = buffer.toString('base64');
  return await extractDataWithVision(base64Content, contentType);
};

module.exports = {
  processPDF,
  processImage,
  extractDataWithMistral
};
