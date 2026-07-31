import base64
import io
import json
import logging
import time
from urllib.parse import urlparse

import oci
import requests
from fdk import response

DEFAULT_MODEL = "gemini-3.6-flash"
MAX_BODY_CHARS = 40_000
UPSTREAM_TIMEOUT_SECONDS = 12
SECRET_CACHE_SECONDS = 300
ACTIONS = {"fold", "check", "call", "raise", "all_in"}
EMOTIONS = {"calm", "confident", "cautious", "tilted"}

_secret_cache = {"secret_id": "", "value": "", "expires_at": 0.0}


class HttpError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def clean_text(value, max_length):
    return " ".join(str(value or "").split())[:max_length]


def config_value(config, key, default=""):
    return str(config.get(key, default) or default).strip()


def allowed_origins(config):
    raw = config_value(config, "ALLOWED_ORIGINS", "https://qookey109-pixel.github.io")
    return {value.strip() for value in raw.split(",") if value.strip()}


def get_header(headers, name):
    target = name.lower()
    for key, value in (headers or {}).items():
        if str(key).lower() == target:
            return str(value)
    return ""


def cors_headers(origin, config):
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Vary": "Origin",
    }
    if origin and origin in allowed_origins(config):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
        headers["Access-Control-Allow-Headers"] = "content-type,accept"
        headers["Access-Control-Max-Age"] = "86400"
    return headers


def json_response(ctx, payload, status=200, origin="", config=None):
    return response.Response(
        ctx,
        response_data=json.dumps(payload, ensure_ascii=False),
        headers=cors_headers(origin, config or {}),
        status_code=status,
    )


def assert_allowed_origin(origin, config):
    if origin and origin not in allowed_origins(config):
        raise HttpError("Origin is not allowed.", 403)


def finite_integer(value, name, minimum=0, maximum=1_000_000):
    if isinstance(value, bool) or not isinstance(value, int):
        raise HttpError(f"{name} is invalid.", 400)
    if value < minimum or value > maximum:
        raise HttpError(f"{name} is invalid.", 400)
    return value


def validate_card(card, name):
    if not isinstance(card, dict):
        raise HttpError(f"{name} contains an invalid card.", 400)
    rank = clean_text(card.get("rank"), 2)
    suit = clean_text(card.get("suit"), 12)
    if not rank or not suit:
        raise HttpError(f"{name} contains an invalid card.", 400)
    return {"rank": rank, "suit": suit}


def validate_request(payload):
    if not isinstance(payload, dict):
        raise HttpError("JSON body must be an object.", 400)

    legal_actions = []
    for value in payload.get("legalActions", []):
        action = str(value)
        if action not in legal_actions:
            legal_actions.append(action)
    if not legal_actions or any(action not in ACTIONS for action in legal_actions):
        raise HttpError("legalActions is invalid.", 400)

    hole_cards = [
        validate_card(card, f"holeCards[{index}]")
        for index, card in enumerate(payload.get("holeCards", []))
    ]
    if len(hole_cards) != 2:
        raise HttpError("Exactly two private cards are required.", 400)

    board = [
        validate_card(card, f"board[{index}]")
        for index, card in enumerate(payload.get("board", []))
    ]
    if len(board) > 5:
        raise HttpError("Board contains too many cards.", 400)

    min_raise_to = finite_integer(payload.get("minRaiseTo", 0), "minRaiseTo")
    max_raise_to = finite_integer(payload.get("maxRaiseTo", 0), "maxRaiseTo")
    if "raise" in legal_actions and (min_raise_to <= 0 or max_raise_to < min_raise_to):
        raise HttpError("Raise bounds are invalid.", 400)

    raw_players = payload.get("players", [])
    if not isinstance(raw_players, list):
        raise HttpError("players is invalid.", 400)
    players = []
    for index, player in enumerate(raw_players[:9]):
        if not isinstance(player, dict):
            raise HttpError(f"players[{index}] is invalid.", 400)
        players.append({
            "name": clean_text(player.get("name"), 32) or f"Player {index + 1}",
            "position": clean_text(player.get("position"), 8),
            "stack": finite_integer(player.get("stack", 0), f"players[{index}].stack"),
            "bet": finite_integer(player.get("bet", 0), f"players[{index}].bet"),
            "folded": bool(player.get("folded")),
            "allIn": bool(player.get("allIn")),
            "lastAction": clean_text(player.get("lastAction"), 24),
            "isHuman": bool(player.get("isHuman")),
        })

    return {
        "version": 1,
        "requestId": clean_text(payload.get("requestId"), 80),
        "handNumber": finite_integer(payload.get("handNumber", 0), "handNumber"),
        "street": clean_text(payload.get("street"), 16),
        "position": clean_text(payload.get("position"), 8),
        "holeCards": hole_cards,
        "board": board,
        "pot": finite_integer(payload.get("pot", 0), "pot"),
        "currentBet": finite_integer(payload.get("currentBet", 0), "currentBet"),
        "callAmount": finite_integer(payload.get("callAmount", 0), "callAmount"),
        "minRaiseTo": min_raise_to,
        "maxRaiseTo": max_raise_to,
        "stack": finite_integer(payload.get("stack", 0), "stack"),
        "playerBet": finite_integer(payload.get("playerBet", 0), "playerBet"),
        "legalActions": legal_actions,
        "players": players,
    }


def decision_schema(game):
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "action": {"type": "string", "enum": game["legalActions"]},
            "raiseTo": {
                "type": "integer",
                "minimum": 0,
                "maximum": max(0, game["maxRaiseTo"]),
            },
            "dialogue": {"type": "string", "maxLength": 96},
            "emotion": {"type": "string", "enum": sorted(EMOTIONS)},
            "reason": {"type": "string", "maxLength": 180},
        },
        "required": ["action", "raiseTo", "dialogue", "emotion", "reason"],
    }


def system_instruction():
    return " ".join([
        "You are Gemini, the final boss in a no-limit Texas Hold'em game.",
        "Choose exactly one action from legalActions and obey every numeric bound.",
        "You only know your own two private cards and public table information.",
        "Never claim knowledge of hidden opponent cards or undealt cards.",
        "Use a patient, balanced, high-pressure strategy rather than always choosing the strongest-looking action.",
        "For action=raise, raiseTo is the total bet after raising and must be between minRaiseTo and maxRaiseTo.",
        "For every other action, set raiseTo to 0.",
        "Keep dialogue in Traditional Chinese and under 40 Chinese characters.",
        "Keep reason concise and based only on observable poker factors. Do not provide hidden chain-of-thought.",
    ])


def extract_output_text(interaction):
    if isinstance(interaction.get("output_text"), str):
        return interaction["output_text"]

    for step in interaction.get("steps", []) or []:
        if step.get("type") != "model_output":
            continue
        text = "".join(
            part.get("text", "")
            for part in step.get("content", []) or []
            if part.get("type") == "text" and isinstance(part.get("text"), str)
        )
        if text:
            return text

    for output in interaction.get("outputs", []) or []:
        text = "".join(
            part.get("text", "")
            for part in output.get("content", []) or []
            if isinstance(part.get("text"), str)
        )
        if text:
            return text
    return ""


def validate_decision(raw, game):
    if not isinstance(raw, dict):
        raise HttpError("Gemini returned an invalid decision object.", 502)

    action = str(raw.get("action") or "")
    if action not in game["legalActions"]:
        raise HttpError("Gemini returned an illegal action.", 502)

    raise_to = raw.get("raiseTo", 0)
    if isinstance(raise_to, bool) or not isinstance(raise_to, int):
        raise HttpError("Gemini returned an invalid raise size.", 502)
    if action == "raise":
        if raise_to < game["minRaiseTo"] or raise_to > game["maxRaiseTo"]:
            raise HttpError("Gemini returned an out-of-range raise size.", 502)
    else:
        raise_to = 0

    emotion = str(raw.get("emotion") or "calm")
    if emotion not in EMOTIONS:
        emotion = "calm"

    return {
        "action": action,
        "raiseTo": raise_to,
        "dialogue": clean_text(raw.get("dialogue"), 96),
        "emotion": emotion,
        "reason": clean_text(raw.get("reason"), 180),
    }


def get_api_key(config):
    secret_id = config_value(config, "GEMINI_SECRET_OCID")
    if not secret_id:
        raise HttpError("GEMINI_SECRET_OCID is not configured.", 503)

    now = time.time()
    if (
        _secret_cache["secret_id"] == secret_id
        and _secret_cache["value"]
        and _secret_cache["expires_at"] > now
    ):
        return _secret_cache["value"]

    signer = oci.auth.signers.get_resource_principals_signer()
    client = oci.secrets.SecretsClient(config={}, signer=signer)
    bundle = client.get_secret_bundle(secret_id=secret_id, stage="CURRENT").data
    encoded = bundle.secret_bundle_content.content
    api_key = base64.b64decode(encoded).decode("utf-8").strip()
    if not api_key:
        raise HttpError("The OCI Vault secret is empty.", 503)

    _secret_cache.update({
        "secret_id": secret_id,
        "value": api_key,
        "expires_at": now + SECRET_CACHE_SECONDS,
    })
    return api_key


def call_gemini(game, config):
    api_key = get_api_key(config)
    model = config_value(config, "GEMINI_MODEL", DEFAULT_MODEL)

    try:
        upstream = requests.post(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            json={
                "model": model,
                "system_instruction": system_instruction(),
                "input": f"Public poker state:\n{json.dumps(game, ensure_ascii=False)}",
                "response_format": {
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": decision_schema(game),
                },
                "generation_config": {
                    "max_output_tokens": 256,
                    "thinking_level": "low",
                    "thinking_summaries": "none",
                },
                "store": False,
            },
            timeout=(3, UPSTREAM_TIMEOUT_SECONDS),
        )
    except requests.Timeout as exc:
        raise HttpError("Gemini request timed out.", 504) from exc
    except requests.RequestException as exc:
        raise HttpError("Gemini request failed.", 502) from exc

    try:
        payload = upstream.json()
    except ValueError as exc:
        raise HttpError("Gemini returned a non-JSON response.", 502) from exc

    if not upstream.ok:
        message = clean_text((payload.get("error") or {}).get("message"), 240)
        raise HttpError(message or f"Gemini upstream returned HTTP {upstream.status_code}.", 502)

    output_text = extract_output_text(payload)
    if not output_text:
        raise HttpError("Gemini returned no decision text.", 502)

    try:
        parsed = json.loads(output_text)
    except ValueError as exc:
        raise HttpError("Gemini returned malformed JSON.", 502) from exc

    return {
        "decision": validate_decision(parsed, game),
        "model": payload.get("model") or model,
        "interactionId": payload.get("id") or "",
        "usage": payload.get("usage"),
    }


def handler(ctx, data: io.BytesIO = None):
    config = dict(ctx.Config())
    headers = dict(ctx.Headers() or {})
    origin = get_header(headers, "origin")
    method = (ctx.Method() or get_header(headers, "fn-http-method") or "").upper()
    path = urlparse(ctx.RequestURL() or "/").path.rstrip("/") or "/"

    try:
        assert_allowed_origin(origin, config)

        if method == "OPTIONS":
            return response.Response(
                ctx,
                response_data="",
                headers=cors_headers(origin, config),
                status_code=204,
            )

        if method == "GET" and path.endswith("/health"):
            return json_response(ctx, {
                "ok": True,
                "service": "texas-holdem-gemini",
                "provider": "oci-functions",
                "configured": bool(config_value(config, "GEMINI_SECRET_OCID")),
                "model": config_value(config, "GEMINI_MODEL", DEFAULT_MODEL),
            }, origin=origin, config=config)

        if method != "POST" or not path.endswith("/v1/decision"):
            return json_response(
                ctx,
                {"ok": False, "error": "Not found."},
                status=404,
                origin=origin,
                config=config,
            )

        raw_body = data.getvalue() if data else b""
        if len(raw_body) > MAX_BODY_CHARS:
            raise HttpError("Request body is too large.", 413)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise HttpError("Request body is not valid JSON.", 400) from exc

        game = validate_request(payload)
        result = call_gemini(game, config)
        return json_response(
            ctx,
            {"ok": True, **result},
            origin=origin,
            config=config,
        )
    except HttpError as exc:
        return json_response(
            ctx,
            {"ok": False, "error": clean_text(str(exc), 280)},
            status=exc.status,
            origin=origin,
            config=config,
        )
    except Exception:
        logging.exception("OCI Gemini function failed")
        return json_response(
            ctx,
            {"ok": False, "error": "Gemini decision service failed."},
            status=500,
            origin=origin,
            config=config,
        )
