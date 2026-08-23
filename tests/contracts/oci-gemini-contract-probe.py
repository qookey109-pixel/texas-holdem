import copy
import importlib.util
import json
import pathlib
import sys
import types


ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "gemini-backend-contract-v1.json"


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

    path = ROOT / "backend" / "oci-gemini-function" / "func.py"
    spec = importlib.util.spec_from_file_location("oci_gemini_shared_contract", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def with_overrides(base, overrides):
    payload = copy.deepcopy(base)
    payload.update(copy.deepcopy(overrides))
    return payload


def capture_request(func, payload):
    try:
        return {"ok": True, "value": func.validate_request(copy.deepcopy(payload))}
    except func.HttpError as exc:
        return {"ok": False, "status": exc.status, "error": str(exc)}


def capture_decision(func, raw, game):
    try:
        return {"ok": True, "value": func.validate_decision(copy.deepcopy(raw), game)}
    except func.HttpError as exc:
        return {"ok": False, "error": str(exc)}


def main():
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    func = load_function_module()
    canonical = fixture["canonicalRequest"]
    game = func.validate_request(copy.deepcopy(canonical))

    result = {
        "canonicalRequest": {"ok": True, "value": game},
        "invalidRequestCases": [
            capture_request(func, with_overrides(canonical, case["overrides"]))
            for case in fixture["invalidRequestCases"]
        ],
        "decisionCases": [
            capture_decision(func, case["input"], game)
            for case in fixture["decisionCases"]
        ],
        "invalidDecisionCases": [
            capture_decision(func, case["input"], game)
            for case in fixture["invalidDecisionCases"]
        ],
    }
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
