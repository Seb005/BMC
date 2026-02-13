import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// Rate limiting
const rateMap = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60000;

function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// BMC block descriptions for system prompt context
const BLOCK_INFO = {
  segments: 'Segments de clientèle — les groupes de personnes ou organisations que l\'entreprise sert',
  proposition: 'Proposition de valeur — la combinaison de produits/services qui crée de la valeur',
  canaux: 'Canaux — comment l\'entreprise communique et livre sa proposition de valeur',
  relations: 'Relations clients — les types de relations établies avec chaque segment',
  revenus: 'Flux de revenus — l\'argent généré auprès de chaque segment',
  ressources: 'Ressources clés — les actifs nécessaires au fonctionnement du modèle',
  activites: 'Activités clés — les actions les plus importantes pour faire fonctionner le modèle',
  partenaires: 'Partenaires clés — le réseau de fournisseurs et partenaires',
  couts: 'Structure de coûts — tous les coûts engendrés par le modèle'
};

function buildSystemPrompt(currentBlock, currentBlockTitle, currentText, allData, mode) {
  const otherBlocks = Object.entries(allData)
    .filter(([key, val]) => key !== currentBlock && val && val.trim())
    .map(([key, val]) => `- ${BLOCK_INFO[key] || key} : ${val.trim().substring(0, 300)}`)
    .join('\n');

  const contextSection = otherBlocks
    ? `\n\nVoici ce que l'utilisateur a déjà rempli dans les autres blocs :\n${otherBlocks}`
    : '\n\nL\'utilisateur n\'a pas encore rempli d\'autres blocs.';

  const currentSection = currentText && currentText.trim()
    ? `\n\nContenu actuel du bloc "${currentBlockTitle}" :\n${currentText.trim()}`
    : `\n\nLe bloc "${currentBlockTitle}" est vide pour l'instant.`;

  let modeInstruction = '';
  if (mode === 'suggest') {
    modeInstruction = `\n\nL'utilisateur demande une SUGGESTION DE CONTENU pour le bloc "${currentBlockTitle}".
Génère un texte concret et spécifique qu'il pourrait utiliser directement.
Le texte doit être pratique, avec des exemples réalistes.
Ne mets PAS de titre ni de structure markdown. Écris comme si tu remplissais le champ directement.
Limite-toi à 150-250 mots.`;
  } else if (mode === 'improve') {
    modeInstruction = `\n\nL'utilisateur demande d'AMÉLIORER son texte existant pour le bloc "${currentBlockTitle}".
Reformule et enrichis le texte pour le rendre plus clair, spécifique et complet.
Garde le sens original mais améliore la structure et ajoute des détails pertinents.
Ne mets PAS de titre ni de structure markdown. Écris comme si tu remplissais le champ directement.
Limite-toi à 150-250 mots.`;
  } else {
    modeInstruction = `\n\nL'utilisateur pose une question libre. Réponds de manière concise (2-4 phrases) et utile.
Si pertinent, donne des exemples concrets.`;
  }

  return `Tu es un expert en stratégie d'affaires et en Business Model Canvas (méthode Osterwalder).
Tu aides un entrepreneur francophone à construire son Business Model Canvas étape par étape.

Le bloc actuel est : "${currentBlockTitle}" (${BLOCK_INFO[currentBlock] || currentBlock}).
${contextSection}
${currentSection}
${modeInstruction}

Règles :
- Réponds toujours en français.
- Sois professionnel mais accessible.
- Utilise des exemples concrets et réalistes.
- Ne fabrique pas d'information. Si tu n'es pas sûr, dis-le.
- Ne mentionne jamais que tu es un modèle IA ou Claude.`;
}

// --- Supabase JWT verification ---
async function verifyUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// --- Track AI usage ---
async function trackUsage(userId, tokensIn, tokensOut) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) return;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const month = new Date().toISOString().slice(0, 7); // '2026-02'

  await supabase.from('ai_usage').insert({
    user_id: userId,
    tool: 'bmc',
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    month
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans une minute.' });
  }

  // Verify JWT — require authenticated user
  const user = await verifyUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Non authentifié. Veuillez vous connecter.' });
  }

  const { messages, currentBlock, currentBlockTitle, currentText, allData, mode } = req.body;

  if (!messages || !currentBlock || !mode) {
    return res.status(400).json({ error: 'Paramètres manquants.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Clé API non configurée.' });
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = buildSystemPrompt(currentBlock, currentBlockTitle, currentText, allData || {}, mode);

  const recentMessages = (messages || []).slice(-5).map(m => ({
    role: m.role || 'user',
    content: (m.content || '').substring(0, 1000)
  }));

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages: recentMessages
    });

    let inputTokens = 0;
    let outputTokens = 0;

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    stream.on('message', (message) => {
      // Capture token usage from the final message
      if (message.usage) {
        inputTokens = message.usage.input_tokens || 0;
        outputTokens = message.usage.output_tokens || 0;
      }
    });

    stream.on('end', async () => {
      res.write('data: [DONE]\n\n');
      res.end();

      // Track usage asynchronously (don't block the response)
      if (inputTokens || outputTokens) {
        trackUsage(user.id, inputTokens, outputTokens).catch(err => {
          console.error('Usage tracking error:', err);
        });
      }
    });

    stream.on('error', (err) => {
      console.error('Stream error:', err);
      res.write(`data: ${JSON.stringify({ text: '\n\n[Erreur de connexion]' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });

  } catch (err) {
    console.error('API error:', err);
    res.write(`data: ${JSON.stringify({ text: 'Désolé, une erreur est survenue.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
