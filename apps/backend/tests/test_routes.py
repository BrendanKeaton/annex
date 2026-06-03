"""
Route smoke tests — verify endpoints exist and enforce auth.
These use FastAPI's TestClient with mocked Supabase so no real DB is needed.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    # Mock Supabase clients before importing app
    mock_client = MagicMock()
    with patch("app.third_party_clients.supabase.create_client", return_value=mock_client), \
         patch("app.third_party_clients.supabase.supabase_service_client", mock_client), \
         patch("app.third_party_clients.supabase.supabase_auth_client", mock_client), \
         patch("app.main.supabase_service_client", mock_client):
        from app.main import app
        with TestClient(app) as c:
            yield c


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestAuthRequiredEndpoints:
    """Endpoints behind JWT auth should return 401 without a token."""

    @pytest.mark.parametrize("method,path", [
        ("post", "/auth/user_state_increment"),
        ("post", "/auth/pin"),
        ("get", "/auth/onboarding/stage"),
        ("get", "/auth/refresh_user_session"),
        ("put", "/auth/pin"),
        ("get", "/auth/recovery_codes"),
        ("post", "/auth/recovery_codes/regenerate"),
        ("put", "/account/email"),
        ("put", "/account/password"),
        ("get", "/org/info"),
        ("get", "/org/members"),
        ("post", "/org/invite"),
    ])
    def test_requires_auth(self, client, method, path):
        resp = getattr(client, method)(path)
        assert resp.status_code in (401, 403), f"{method.upper()} {path} returned {resp.status_code}"


class TestAnonEndpointValidation:
    """Anon endpoints should return 422 for missing/invalid body."""

    def test_login_missing_body(self, client):
        resp = client.post("/auth_anon/login")
        assert resp.status_code == 422

    def test_refresh_session_missing_body(self, client):
        resp = client.post("/auth_anon/refresh_user_session")
        assert resp.status_code == 422

    def test_oauth_session_missing_body(self, client):
        resp = client.post("/auth_anon/oauth/session")
        assert resp.status_code == 422

    def test_accept_invite_missing_body(self, client):
        resp = client.post("/auth_anon/accept_invite")
        assert resp.status_code == 422

    def test_accept_invite_password_too_short(self, client):
        resp = client.post("/auth_anon/accept_invite", json={
            "access_token": "tok",
            "refresh_token": "ref",
            "new_password": "short",
        })
        assert resp.status_code == 422
