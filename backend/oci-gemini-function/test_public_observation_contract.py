import importlib.util
import json
import pathlib
import sys
import types
import unittest


def load_function_module():
    oci = types.ModuleType("oci")
    requests = types.ModuleType("requests")
    requests.Timeout = type("Timeout", (Exception,), {})
    requests.RequestException = type("RequestException", (Exception,), {})
    fdk = types.ModuleType("fdk")
    fdk.response = types.SimpleNamespace(Response=object)

    sys.modules.setdefault("oci", oci)
    sys.modules.setdefault("requests", requests)
    sys.modules.setdefault("fdk", fdk)

    path = pathlib.Path(__file__).with_name("func.py")
    spec = importlib.util.spec_from_file_location("oci_gemini_func_contract", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


func = load_function_module()


def valid_request():
    return {
        "requestId": "contract-test",
        "handNumber": 42,
        "street": "turn",
        "position": "BTN",
        "holeCards": [
            {"rank": "A", "suit": "spades"},
            {"rank": "K", "suit": "hearts"},
        ],
        "board": [
            {"rank": "Q", "suit": "clubs"},
            {"rank": "7", "suit": "diamonds"},
            {"rank": "2", "suit": "hearts"},
            {"rank": "J", "suit": "clubs"},
        ],
        "pot": 240,
        "currentBet": 40,
        "callAmount": 40,
        "minRaiseTo": 80,
        "maxRaiseTo": 600,
        "stack": 920,
        "playerBet": 0,
        "legalActions": ["fold", "call", "raise"],
        "players": [
            {
                "name": "Gemini",
                "position": "BTN",
                "stack": 920,
                "bet": 0,
                "folded": False,
                "allIn": False,
                "lastAction": "",
                "isHuman": False,
            },
            {
                "name": "Hero",
                "position": "BB",
                "stack": 800,
                "bet": 40,
                "folded": False,
                "allIn": False,
                "lastAction": "raise",
                "isHuman": True,
            },
        ],
        "tournamentObservation": {
            "schemaVersion": 99,
            "scope": "malicious-client-value",
            "actor": "Gemini",
            "actorArrival": {
                "arrivalHand": 30,
                "observedHandsBeforeArrival": 29,
                "tier": "gemini",
                "hiddenCards": ["AA"],
            },
            "tournament": {
                "mode": "tournament",
                "handNumber": 42,
                "blindLevel": 5,
                "appeared": list(range(40)),
                "eliminated": list(range(30)),
                "queueRemaining": 200,
                "finished": False,
                "futureBoard": ["As"],
            },
            "playerModel": {
                "handsObserved": 500000,
                "actionsObserved": 500000,
                "byStreet": {
                    "preflop": {
                        "actions": 12,
                        "aggressionRate": 4.2,
                        "foldToPressure": -1,
                    },
                    "river": {
                        "actions": 9,
                        "checkRaiseRate": 0.25,
                    },
                },
                "byPosition": [
                    {"position": f"P{index}", "actions": index + 1, "openRate": 0.2}
                    for index in range(12)
                ],
                "recentPublicEvents": [
                    {
                        "handNumber": index,
                        "street": "flop",
                        "position": "BB",
                        "action": "call",
                        "sizeFraction": 20,
                        "facedAggression": True,
                        "checkedBefore": False,
                        "priorRaises": 50,
                        "opponentHoleCards": ["AA"],
                    }
                    for index in range(20)
                ],
                "hiddenCards": ["QQ"],
            },
            "heroSession": {
                "hands": 250000,
                "vpipRate": 2,
                "foldRate": -0.5,
                "callRate": 0.3,
                "raiseRate": 0.2,
                "checkRate": 0.1,
                "allInRate": 0.05,
                "showdownRate": 0.4,
                "winRate": 0.6,
                "currentCards": ["AK"],
            },
            "repeatedPreflopAllIn": {
                "windowHands": 500,
                "observedHands": 500,
                "jamHands": 500,
                "weightedJamRate": 3,
                "consecutiveJams": 500,
            },
            "revealedShowdowns": {
                "samples": 500000,
                "bucketCounts": {f"bucket-{index}": index for index in range(20)},
                "currentHiddenCards": ["72o"],
            },
            "futureBoard": ["As", "Ks"],
            "opponentHoleCards": ["AA"],
        },
    }


class PublicObservationContractTest(unittest.TestCase):
    def test_oci_preserves_only_bounded_public_observation(self):
        game = func.validate_request(valid_request())
        observation = game["tournamentObservation"]

        self.assertEqual(observation["scope"], "shared-public-tournament-observation")
        self.assertEqual(observation["schemaVersion"], 10)
        self.assertEqual(observation["actor"], "Gemini")
        self.assertEqual(observation["tournament"]["appearedCount"], 24)
        self.assertEqual(observation["tournament"]["eliminatedCount"], 24)
        self.assertEqual(observation["tournament"]["queueRemaining"], 24)
        self.assertEqual(observation["playerModel"]["byStreet"]["preflop"]["aggressionRate"], 1)
        self.assertEqual(observation["playerModel"]["byStreet"]["preflop"]["foldToPressure"], 0)
        self.assertEqual(len(observation["playerModel"]["byPosition"]), 8)
        self.assertEqual(len(observation["playerModel"]["recentPublicEvents"]), 16)
        self.assertEqual(observation["playerModel"]["recentPublicEvents"][-1]["sizeFraction"], 5)
        self.assertEqual(observation["playerModel"]["recentPublicEvents"][-1]["priorRaises"], 12)
        self.assertEqual(observation["heroSession"]["hands"], 100000)
        self.assertEqual(observation["heroSession"]["vpipRate"], 1)
        self.assertEqual(observation["heroSession"]["foldRate"], 0)
        self.assertEqual(observation["repeatedPreflopAllIn"]["windowHands"], 100)
        self.assertEqual(len(observation["revealedShowdowns"]["bucketCounts"]), 12)

        serialized = json.dumps(observation)
        for forbidden in (
            "hiddenCards",
            "futureBoard",
            "opponentHoleCards",
            "currentCards",
            "currentHiddenCards",
        ):
            self.assertNotIn(forbidden, serialized)

    def test_missing_or_invalid_observation_remains_optional(self):
        payload = valid_request()
        payload.pop("tournamentObservation")
        self.assertIsNone(func.validate_request(payload)["tournamentObservation"])

        payload["tournamentObservation"] = ["not-an-object"]
        self.assertIsNone(func.validate_request(payload)["tournamentObservation"])

    def test_prompt_declares_public_historical_boundary(self):
        instruction = func.system_instruction()
        self.assertIn("historical public tendencies", instruction)
        self.assertIn("hidden opponent cards", instruction)


if __name__ == "__main__":
    unittest.main()
