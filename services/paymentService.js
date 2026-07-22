const axios = require('axios');
const crypto = require('crypto');

/**
 * Payment service abstraction for Tanzanian mobile money providers.
 *
 * IMPORTANT: The exact request/response shape of each provider's live API
 * (field names, signing scheme, auth flow) is issued to registered merchants
 * by that provider and can change. The functions below implement the
 * commonly documented integration pattern for each provider. Before going
 * live you MUST:
 *   1. Register as a merchant with Vodacom (M-Pesa) and/or Yas/Tigo (Mixx by Yas).
 *   2. Get sandbox credentials and confirm the exact endpoint paths/payload
 *      fields from the provider's developer portal.
 *   3. Fill in the corresponding values in your .env file.
 *
 * Both provider functions return a normalized shape:
 *   { success, providerReference, raw, message }
 * so the rest of the app (paymentController) never needs to know which
 * provider was used.
 */

// ---------------------------------------------------------------------------
// Vodacom M-Pesa Tanzania (Open API - "Push USSD" / C2B single stage)
// ---------------------------------------------------------------------------
async function encryptMpesaApiKey() {
  // M-Pesa OpenAPI requires the API key to be RSA-encrypted with Vodacom's
  // public certificate and sent as the Authorization Bearer token when
  // requesting a session key.
  const publicKey = process.env.MPESA_PUBLIC_KEY;
  const apiKey = process.env.MPESA_API_KEY;
  if (!publicKey || !apiKey) {
    throw new Error('MPESA_PUBLIC_KEY / MPESA_API_KEY not configured');
  }
  const buffer = Buffer.from(apiKey);
  const encrypted = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    buffer
  );
  return encrypted.toString('base64');
}

async function getMpesaSessionKey() {
  const encryptedKey = await encryptMpesaApiKey();
  const { data } = await axios.get(`${process.env.MPESA_BASE_URL}/getSession/${encryptedKey}`, {
    headers: { Origin: '*' }
  });
  if (!data || !data.output_SessionID) {
    throw new Error('Could not obtain M-Pesa session key');
  }
  return data.output_SessionID;
}

async function initiateMpesaPayment({ phone, amount, orderNumber }) {
  try {
    const sessionKey = await getMpesaSessionKey();
    const payload = {
      input_Amount: String(amount),
      input_Country: 'TZN',
      input_Currency: 'TZS',
      input_CustomerMSISDN: phone.replace(/^\+/, ''),
      input_ServiceProviderCode: process.env.MPESA_SERVICE_PROVIDER_CODE,
      input_ThirdPartyConversationID: orderNumber,
      input_TransactionReference: orderNumber,
      input_PurchasedItemsDesc: `Order ${orderNumber}`
    };

    const { data } = await axios.post(
      `${process.env.MPESA_BASE_URL}/c2bPayment/singleStage/`,
      payload,
      { headers: { Authorization: `Bearer ${sessionKey}`, Origin: '*', 'Content-Type': 'application/json' } }
    );

    const success = data.output_ResponseCode === 'INS-0';
    return {
      success,
      providerReference: data.output_TransactionID || data.output_ConversationID || null,
      raw: data,
      message: data.output_ResponseDesc || (success ? 'Payment initiated' : 'Payment failed')
    };
  } catch (err) {
    return {
      success: false,
      providerReference: null,
      raw: err.response ? err.response.data : { error: err.message },
      message: 'Failed to reach M-Pesa. Please try again.'
    };
  }
}

// ---------------------------------------------------------------------------
// Mixx by Yas (Tigo Pesa) - OAuth2 client-credentials + collections push
// ---------------------------------------------------------------------------
let cachedMixToken = null;
let cachedMixTokenExpiry = 0;

async function getMixByYasToken() {
  if (cachedMixToken && Date.now() < cachedMixTokenExpiry) return cachedMixToken;

  const { data } = await axios.post(`${process.env.MIXBYYAS_BASE_URL}/oauth/token`, {
    grant_type: 'client_credentials',
    client_id: process.env.MIXBYYAS_CLIENT_ID,
    client_secret: process.env.MIXBYYAS_CLIENT_SECRET
  });

  cachedMixToken = data.access_token;
  cachedMixTokenExpiry = Date.now() + ((data.expires_in || 3500) * 1000);
  return cachedMixToken;
}

async function initiateMixByYasPayment({ phone, amount, orderNumber }) {
  try {
    const token = await getMixByYasToken();
    const payload = {
      msisdn: phone.replace(/^\+/, ''),
      amount: String(amount),
      currency: 'TZS',
      externalId: orderNumber,
      payerMessage: `Payment for order ${orderNumber}`,
      payeeNote: `Book/Exam store order ${orderNumber}`,
      callbackUrl: process.env.MIXBYYAS_CALLBACK_URL
    };

    const { data } = await axios.post(
      `${process.env.MIXBYYAS_BASE_URL}/collection/v1/requesttopay`,
      payload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    return {
      success: true, // requesttopay is async: 'success' here just means the push was sent
      providerReference: data.referenceId || data.transactionId || orderNumber,
      raw: data,
      message: 'Payment request sent. Approve it on your phone.'
    };
  } catch (err) {
    return {
      success: false,
      providerReference: null,
      raw: err.response ? err.response.data : { error: err.message },
      message: 'Failed to reach Mixx by Yas. Please try again.'
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
async function initiatePayment(provider, { phone, amount, orderNumber }) {
  if (provider === 'mpesa') return initiateMpesaPayment({ phone, amount, orderNumber });
  if (provider === 'mixbyyas') return initiateMixByYasPayment({ phone, amount, orderNumber });
  throw new Error(`Unsupported payment provider: ${provider}`);
}

module.exports = { initiatePayment };
