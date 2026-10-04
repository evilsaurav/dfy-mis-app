import pytest
import sys
from pathlib import Path
from starlette.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app

client = TestClient(app)

def test_cors_allowed_localhost():
    """Verify http://localhost:5173 receives Access-Control-Allow-Origin header."""
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET"
    }
    # Pre-flight OPTIONS request
    res = client.options("/health", headers=headers)
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert res.headers.get("access-control-allow-credentials") == "true"

    # Actual GET request
    res = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"

def test_cors_allowed_production_domain():
    """Verify https://dfy-frontend.vercel.app receives Access-Control-Allow-Origin header."""
    headers = {
        "Origin": "https://dfy-frontend.vercel.app",
        "Access-Control-Request-Method": "GET"
    }
    res = client.options("/health", headers=headers)
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "https://dfy-frontend.vercel.app"
    assert res.headers.get("access-control-allow-credentials") == "true"

    res = client.get("/health", headers={"Origin": "https://dfy-frontend.vercel.app"})
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "https://dfy-frontend.vercel.app"

def test_cors_allowed_vercel_preview():
    """Verify Vercel preview deployment matching regex receives Access-Control-Allow-Origin header."""
    preview_origin = "https://dfy-frontend-1jae16ww9-saurav-kumars-projects-37a71c6c.vercel.app"
    headers = {
        "Origin": preview_origin,
        "Access-Control-Request-Method": "GET"
    }
    res = client.options("/health", headers=headers)
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == preview_origin
    assert res.headers.get("access-control-allow-credentials") == "true"

    res = client.get("/health", headers={"Origin": preview_origin})
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == preview_origin

def test_cors_blocked_unauthorized_domain():
    """Verify unauthorized domain does NOT receive Access-Control-Allow-Origin header."""
    headers = {
        "Origin": "https://evil-random-site.com",
        "Access-Control-Request-Method": "GET"
    }
    # Pre-flight OPTIONS request should NOT return access-control-allow-origin
    res = client.options("/health", headers=headers)
    assert res.headers.get("access-control-allow-origin") is None

    # Actual GET request should NOT have access-control-allow-origin
    res = client.get("/health", headers={"Origin": "https://evil-random-site.com"})
    assert res.headers.get("access-control-allow-origin") is None
