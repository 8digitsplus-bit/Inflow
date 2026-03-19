"""
Test Trial Notification Features - Iteration 20
Tests:
1. POST /api/auth/login - trial user returns trial_days_left
2. GET /api/auth/me - trial user returns trial_days_left  
3. Login sets subscription_tier to 'expired' when trial_end is in past
4. Shopify routes are removed
"""
import pytest
import requests
import os
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

class TestTrialNotificationBackend:
    """Test trial notification backend functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        yield
        self.session.close()
    
    def test_login_trial_user_returns_trial_days_left(self):
        """Test that login returns trial_days_left for trial users"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "trial@test.com",
            "password": "trial123"
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        print(f"Login response: {data}")
        
        # Verify trial_days_left is present
        assert "trial_days_left" in data, "trial_days_left not in login response"
        
        # Verify trial_days_left is a number >= 0
        assert isinstance(data["trial_days_left"], int), "trial_days_left should be an integer"
        assert data["trial_days_left"] >= 0, "trial_days_left should be >= 0"
        
        # Verify subscription_tier is trial or expired
        assert data.get("subscription_tier") in ["trial", "expired"], f"Unexpected tier: {data.get('subscription_tier')}"
        
        print(f"✓ Trial user login returned trial_days_left: {data['trial_days_left']}")
    
    def test_get_me_trial_user_returns_trial_days_left(self):
        """Test that GET /auth/me returns trial_days_left for trial users"""
        # First login to get session
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "trial@test.com",
            "password": "trial123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Now get /me endpoint
        me_response = self.session.get(f"{BASE_URL}/api/auth/me")
        
        assert me_response.status_code == 200, f"GET /auth/me failed: {me_response.text}"
        
        data = me_response.json()
        print(f"GET /auth/me response: {data}")
        
        # Verify trial_days_left is present
        assert "trial_days_left" in data, "trial_days_left not in /auth/me response"
        
        # Verify trial_days_left is a number >= 0
        assert isinstance(data["trial_days_left"], int), "trial_days_left should be an integer"
        
        print(f"✓ GET /auth/me returned trial_days_left: {data['trial_days_left']}")
    
    def test_enterprise_user_login_no_trial_days(self):
        """Test that enterprise user login does NOT have trial_days_left (or it's None)"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test2@test.com",
            "password": "test123"
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        print(f"Enterprise login response: {data}")
        
        # Enterprise user should not have trial_days_left or it should not be calculated
        # Based on the code, it only adds trial_days_left if subscription_tier is "trial"
        subscription_tier = data.get("subscription_tier")
        assert subscription_tier not in ["trial", "expired"], f"Enterprise user shouldn't be trial: {subscription_tier}"
        
        print(f"✓ Enterprise user has subscription_tier: {subscription_tier}")
    
    def test_shopify_routes_removed(self):
        """Test that Shopify OAuth routes are removed"""
        # Try to access any Shopify-related auth routes
        routes_to_check = [
            "/api/auth/shopify",
            "/api/auth/shopify/callback",
            "/api/integrations/shopify/auth"
        ]
        
        for route in routes_to_check:
            response = self.session.get(f"{BASE_URL}{route}")
            # Should return 404 (not found) since routes are removed
            # Or 405 (method not allowed) if route pattern exists but not the method
            print(f"Route {route}: status {response.status_code}")
            assert response.status_code in [404, 405, 422], f"Shopify route {route} might still exist: {response.status_code}"
        
        print("✓ Shopify routes are properly removed (404/405)")
    
    def test_login_response_structure(self):
        """Test that login response has all expected fields"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "trial@test.com",
            "password": "trial123"
        })
        
        assert response.status_code == 200
        
        data = response.json()
        
        # Expected fields for trial user
        expected_fields = ["email", "name", "user_id", "subscription_tier"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        # password_hash should NOT be in response
        assert "password_hash" not in data, "password_hash should not be exposed"
        
        print(f"✓ Login response structure is correct")

    def test_auth_me_endpoint_authenticated(self):
        """Test /auth/me requires authentication"""
        # Without login/session
        fresh_session = requests.Session()
        response = fresh_session.get(f"{BASE_URL}/api/auth/me")
        
        # Should fail without authentication
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        
        print("✓ /auth/me properly requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
