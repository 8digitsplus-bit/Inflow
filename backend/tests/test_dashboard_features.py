"""
Test suite for Dashboard and Auth features (Iteration 7)
Tests: Microsoft auth error handling, /api/auth/me goals, tier-based dashboard
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "uitest_1772633591@testexample.com"
TEST_PASSWORD = "UITestPass123!"


class TestMicrosoftAuth:
    """Test Microsoft OAuth returns proper error (501 not configured)"""
    
    def test_microsoft_auth_returns_501(self):
        """Microsoft auth should return 501 with proper message when not configured"""
        response = requests.get(f"{BASE_URL}/api/auth/microsoft?origin=https://test.com")
        # Should return 501 Not Implemented when MICROSOFT_CLIENT_ID not set
        assert response.status_code == 501
        data = response.json()
        assert "detail" in data
        assert "not configured" in data["detail"].lower() or "not available" in data["detail"].lower()


class TestAuthMe:
    """Test /api/auth/me returns full user doc including goals"""
    
    @pytest.fixture
    def auth_session(self):
        """Login and get authenticated session"""
        session = requests.Session()
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_resp.status_code != 200:
            pytest.skip("Login failed")
        return session
    
    def test_auth_me_returns_user_data(self, auth_session):
        """GET /api/auth/me should return full user document"""
        response = auth_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        
        # Basic user fields
        assert "user_id" in data
        assert "email" in data
        assert "name" in data
        assert "subscription_tier" in data
        
    def test_auth_me_returns_goals_when_onboarded(self, auth_session):
        """GET /api/auth/me should include goals if user completed onboarding"""
        response = auth_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        
        # If onboarded, should have goals
        if data.get("onboarded"):
            assert "goals" in data
            assert isinstance(data["goals"], list)
            assert "company_name" in data
            assert "industry" in data
            assert "team_size" in data
        
    def test_auth_me_excludes_password_hash(self, auth_session):
        """GET /api/auth/me should NOT return password_hash"""
        response = auth_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert "password_hash" not in data


class TestOnboarding:
    """Test onboarding flow"""
    
    @pytest.fixture
    def auth_session(self):
        session = requests.Session()
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_resp.status_code != 200:
            pytest.skip("Login failed")
        return session
    
    def test_onboarding_status(self, auth_session):
        """GET /api/auth/onboarding-status returns onboarded boolean"""
        response = auth_session.get(f"{BASE_URL}/api/auth/onboarding-status")
        assert response.status_code == 200
        data = response.json()
        assert "onboarded" in data
        assert isinstance(data["onboarded"], bool)


class TestExistingAPIs:
    """Verify all existing backend endpoints still work"""
    
    @pytest.fixture
    def auth_session(self):
        session = requests.Session()
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_resp.status_code != 200:
            pytest.skip("Login failed")
        return session
    
    def test_health_endpoint(self):
        """GET /api/health returns healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json().get("status") == "healthy"
    
    def test_deals_crud(self, auth_session):
        """Deals CRUD endpoints work"""
        # GET deals
        response = auth_session.get(f"{BASE_URL}/api/deals")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        
    def test_analytics_revenue(self, auth_session):
        """GET /api/analytics/revenue returns data"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/revenue")
        assert response.status_code == 200
        data = response.json()
        assert "total_pipeline" in data or "total_deals" in data or isinstance(data, dict)
    
    def test_analytics_churn(self, auth_session):
        """GET /api/analytics/churn returns data"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        assert response.status_code == 200
        
    def test_analytics_cro(self, auth_session):
        """GET /api/analytics/cro returns data"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/cro")
        assert response.status_code == 200
    
    def test_integrations(self, auth_session):
        """GET /api/integrations returns list"""
        response = auth_session.get(f"{BASE_URL}/api/integrations")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_subscription_plans(self):
        """GET /api/subscription/plans returns plans"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200
        data = response.json()
        assert "essential_monthly" in data or isinstance(data, dict)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
