const DEFAULT_MODEL = "gemini-3.6-flash";
const MAX_BODY_CHARS = 40_000;
const UPSTREAM_TIMEOUT_MS = 12_000;
const ACTIONS = new Set(["fold", "check", "call", "raise", "all_in"]);
const EMOTIONS = new Set(["calm", "confident", "cautious", "tilted"]);

function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "https://qookey109-pixel.github.io")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedOrigins(env);
  const matched = allowed.includes(origin) ? origin : "";
  return {
    ...(matched ? { "access-control-allow-origin": matched } : {}),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function assertAllowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (!allowedOrigins(env).includes(origin)) {
    throw Object.assign(new Error("Origin is not allowed."), { status: 403 });
  }
}

function finiteInteger(value, name, { min = 0, max = 1_000_000 } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw Object.assign(new Error(`${name} is invalid.`), { status: 400 });
  }
  return value;
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function validateCard(card, name) {
  const rank = cleanText(card?.rank, 2);
  const suit = cleanText(card?.suit, 12);
  if (!rank || !suit) {
    throw Object.assign(new Error(`${name} contains an invalid card.`), { status: 400 });
  }
  return { rank, suit };
}

function validateRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("JSON body must be an object."), { status: 400 });
  }

  const legalActions = Array.isArray(input.legalActions)
    ? [...new Set(input.legalActions.map(value => String(value)))]
    : [];
  if (!legalActions.length || legalActions.some(action => !ACTIONS.has(action))) {
    throw Object.assign(new Error("legalActions is invalid."), { status: 400 });
  }

  const holeCards = Array.isArray(input.holeCards)
    ? input.holeCards.map((card, index) => validateCard(card, `holeCards[${index}]`))
    : [];
  if (holeCards.length !== 2) {
    throw Object.assign(new Error("Exactly two private cards are required."), { status: 400 });
  }

  const board = Array.isArray(input.board)
    ? input.board.map((card, index) => validateCard(card, `board[${index}]`))
    : [];
  if (board.length > 5) {
    throw Object.assign(new Error("Board contains too many cards."), { status: 400 });
  }

  const minRaiseTo = finiteInteger(input.minRaiseTo ?? 0, "minRaiseTo");
  const maxRaiseTo = finiteInteger(input.maxRaiseTo ?? 0, "maxRaiseTo");
  if (legalActions.includes("raise") && (minRaiseTo <= 0 || maxRaiseTo < minRaiseTo)) {
    throw Object.assign(new Error("Raise bounds are invalid."), { status: 400 });
  }

  const players = Array.isArray(input.players)
    ? input.players.slice(0, 9).map((player, index) => ({
        name: cleanText(player?.name, 32) || `Player ${index + 1}`,
        position: cleanText(player?.position, 8),
        stack: finiteInteger(player?.stack ?? 0, `players[${index}].stack`),
        bet: finiteInteger(player?.bet ?? 0, `players[${index}].bet`),
        folded: Boolean(player?.folded),
        allIn: Boolean(player?.allIn),
        lastAction: cleanText(player?.lastAction, 24),
        isHuman: Boolean(player?.isHuman),
      }))
    : [];

  return {
    version: 1,
    requestId: cleanText(input.requestId, 80),
    handNumber: finiteInteger(input.handNumber ?? 0, "handNumber"),
    street: cleanText(input.street, 16),
    position: cleanText(input.position, 8),
    holeCards,
    board,
    pot: finiteInteger(input.pot ?? 0, "pot"),
    currentBet: finiteInteger(input.currentBet ?? 0, "currentBet"),
    callAmount: finiteInteger(input.callAmount ?? 0, "callAmount"),
    minRaiseTo,
    maxRaiseTo,
    stack: finiteInteger(input.stack ?? 0, "stack"),
    playerBet: finiteInteger(input.playerBet ?? 0, "playerBet"),
    legalActions,
    players,
  };
}

function decisionSchema(game) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: game.legalActions },
      raiseTo: {
        type: "integer",
        minimum: 0,
        maximum: Math.max(0, game.maxRaiseTo),
      },
      dialogue: { type: "string", maxLength: 96 },
      emotion: { type: "string", enum: [...EMOTIONS] },
      reason: { type: "string", maxLength: 180 },
    },
    required: ["action", "raiseTo", "dialogue", "emotion", "reason"],
  };
}

function systemInstruction() {
  return [
    "You are Gemini, the final boss in a no-limit Texas Hold'em game.",
    "Choose exactly one action from legalActions and obey all numeric bounds.",
    "You only know your two private cards and public table information in the request.",
    "Never claim knowledge of hidden opponent cards or undealt cards.",
    "Play a patient, balanced, high-pressure strategy rather than always choosing the strongest-looking action.",
    "For action=raise, raiseTo is the total bet after raising and must be between minRaiseTo and maxRaiseTo.",
    "For every other action, set raiseTo to 0.",
    "Keep dialogue in Traditional Chinese, in character, under 40 Chinese characters.",
    "Keep reason concise and describe observable poker factors only; do not provide hidden chain-of-thought.",
  ].join(" ");
}

function extractOutputText(interaction) {
  const steps = Array.isArray(interaction?.steps) ? interaction.steps : [];
  for (const step of steps) {
    if (step?.type !== "model_output" || !Array.isArray(step.content)) continue;
    const text = step.content
      .filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part.text)
      .join("");
    if (text) return text;
  }
  return "";
}

function validateDecision(raw, game) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Gemini returned an invalid decision object.");
  }

  const action = String(raw.action || "");
  if (!game.legalActions.includes(action)) {
    throw new Error("Gemini returned an illegal action.");
  }

  let raiseTo = Number(raw.raiseTo || 0);
  if (!Number.isInteger(raiseTo)) throw new Error("Gemini returned an invalid raise size.");
  if (action === "raise") {
    if (raiseTo < game.minRaiseTo || raiseTo > game.maxRaiseTo) {
      throw new Error("Gemini returned an out-of-range raise size.");
    }
  } else {
    raiseTo = 0;
  }

  const emotion = EMOTIONS.has(String(raw.emotion)) ? String(raw.emotion) : "calm";
  return {
    action,
    raiseTo,
    dialogue: cleanText(raw.dialogue, 96),
    emotion,
    reason: cleanText(raw.reason, 180),
  };
}

async function callGemini(game, env) {
  if (!env.GEMINI_API_KEY) {
    throw Object.assign(new Error("GEMINI_API_KEY is not configured."), { status: 503 });
  }

  const model = String(env.GEMINI_MODEL || DEFAULT_MODEL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model,
        system_instruction: systemInstruction(),
        input: `Public poker state:\n${JSON.stringify(game)}`,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: decisionSchema(game),
        },
        generation_config: {
          max_output_tokens: 256,
          thinking_level: "low",
          thinking_summaries: "none",
        },
        store: false,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = cleanText(payload?.error?.message, 240) || `Gemini upstream returned HTTP ${response.status}.`;
      throw Object.assign(new Error(message), { status: 502 });
    }

    const outputText = extractOutputText(payload);
    if (!outputText) throw Object.assign(new Error("Gemini returned no decision text."), { status: 502 });

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch (error) {
      throw Object.assign(new Error("Gemini returned malformed JSON."), { status: 502 });
    }

    return {
      decision: validateDecision(parsed, game),
      model: payload.model || model,
      interactionId: payload.id || "",
      usage: payload.usage || null,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("Gemini request timed out."), { status: 504 });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function enforceRateLimit(request, env) {
  if (!env.GEMINI_RATE_LIMITER?.limit) return;
  const client = request.headers.get("cf-connecting-ip") || "unknown";
  const { success } = await env.GEMINI_RATE_LIMITER.limit({ key: `decision:${client}` });
  if (!success) {
    throw Object.assign(new Error("Too many Gemini decisions. Please wait and try again."), { status: 429 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      try {
        assertAllowedOrigin(request, env);
        return new Response(null, { status: 204, headers: cors });
      } catch (error) {
        return json({ ok: false, error: error.message }, { status: error.status || 403, headers: cors });
      }
    }

    try {
      assertAllowedOrigin(request, env);

      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          ok: true,
          service: "texas-holdem-gemini",
          configured: Boolean(env.GEMINI_API_KEY),
          model: String(env.GEMINI_MODEL || DEFAULT_MODEL),
        }, { headers: cors });
      }

      if (request.method !== "POST" || url.pathname !== "/v1/decision") {
        return json({ ok: false, error: "Not found." }, { status: 404, headers: cors });
      }

      await enforceRateLimit(request, env);
      const rawBody = await request.text();
      if (rawBody.length > MAX_BODY_CHARS) {
        throw Object.assign(new Error("Request body is too large."), { status: 413 });
      }

      let input;
      try {
        input = JSON.parse(rawBody);
      } catch (error) {
        throw Object.assign(new Error("Request body is not valid JSON."), { status: 400 });
      }

      const game = validateRequest(input);
      const result = await callGemini(game, env);
      return json({ ok: true, ...result }, { headers: cors });
    } catch (error) {
      const status = Number(error?.status) || 500;
      const message = status >= 500 && !error?.message
        ? "Gemini decision service failed."
        : cleanText(error?.message, 280) || "Request failed.";
      return json({ ok: false, error: message }, { status, headers: cors });
    }
  },
};
