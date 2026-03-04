"""
Test suite for Vector SaaS - Auth endpoints, subscription plans, and landing page features
Tests: Email auth (register/login), Microsoft auth (501), subscription plan names (Essential not Basic)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthCheck:
    """Basic health check tests"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health endpoint returns 200 with healthy status")

    def test_api_root(self):
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "Vector API" in data.get("message", "")
        print("✓ API root returns Vector API message")


class TestEmailAuthRegistration:
    """Test email registration flow"""
    
    def test_register_new_user(self):
        """Register a new user with email/password"""
        unique_email = f"test_user_{uuid.uuid4().hex[:8]}@testexample.com"
        payload = {
            "name": "Test User",
            "email": unique_email,
            "password": "TestPass123!"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "user_id" in data
        assert data.get("email") == unique_email
        assert data.get("name") == "Test User"
        assert data.get("subscription_tier") == "free"
        assert "password_hash" not in data  # Password hash should not be exposed
        
        print(f"✓ User registration successful: {unique_email}")
        return data, unique_email

    def test_register_duplicate_email(self):
        """Test that duplicate email registration fails"""
        unique_email = f"test_dup_{uuid.uuid4().hex[:8]}@testexample.com"
        payload = {
            "name": "Test User",
            "email": unique_email,
            "password": "TestPass123!"
        }
        
        # First registration should succeed
        response1 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response1.status_code == 200
        
        # Second registration with same email should fail
        response2 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response2.status_code == 400
        data = response2.json()
        assert "already registered" in data.get("detail", "").lower()
        
        print("✓ Duplicate email registration correctly rejected")


class TestEmailAuthLogin:
    """Test email login flow"""
    
    def test_login_with_registered_user(self):
        """Register a user then login"""
        unique_email = f"test_login_{uuid.uuid4().hex[:8]}@testexample.com"
        
        # Register first
        register_payload = {
            "name": "Login Test User",
            "email": unique_email,
            "password": "LoginPass123!"
        }
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json=register_payload)
        assert reg_response.status_code == 200
        
        # Now login
        login_payload = {
            "email": unique_email,
            "password": "LoginPass123!"
        }
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        
        assert login_response.status_code == 200
        data = login_response.json()
        
        assert data.get("email") == unique_email
        assert data.get("name") == "Login Test User"
        assert "password_hash" not in data
        
        print(f"✓ User login successful: {unique_email}")

    def test_login_invalid_credentials(self):
        """Test login with wrong password"""
        login_payload = {
            "email": "nonexistent@test.com",
            "password": "WrongPassword123!"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert response.status_code == 401
        data = response.json()
        assert "invalid" in data.get("detail", "").lower()
        
        print("✓ Invalid credentials correctly rejected")


class TestMicrosoftAuth:
    """Test Microsoft authentication endpoint"""
    
    def test_microsoft_auth_returns_501(self):
        """Microsoft auth should return 501 since not configured"""
        response = requests.get(f"{BASE_URL}/api/auth/microsoft?origin=https://example.com")
        
        assert response.status_code == 501
        data = response.json()
        assert "not configured" in data.get("detail", "").lower()
        
        print("✓ Microsoft auth correctly returns 501 (not configured)")


class TestSubscriptionPlans:
    """Test subscription plan names - should be Essential, not Basic"""
    
    def test_subscription_plans_endpoint(self):
        """Verify subscription plans use 'Essential' naming"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify Essential plans exist
        assert "essential_monthly" in data
        assert "essential_yearly" in data
        
        # Verify Essential plan properties
        assert data["essential_monthly"]["name"] == "Essential"
        assert data["essential_yearly"]["name"] == "Essential"
        
        # Verify no Basic plans exist
        assert "basic_monthly" not in data
        assert "basic_yearly" not in data
        
        # Verify Pro plans
        assert "pro_monthly" in data
        assert "pro_yearly" in data
        assert data["pro_monthly"]["name"] == "Pro"
        
        # Verify Enterprise plans
        assert "enterprise_monthly" in data
        assert "enterprise_yearly" in data
        
        print("✓ Subscription plans correctly use 'Essential' instead of 'Basic'")
        print(f"  Available plans: {list(data.keys())}")


class TestAuthEndpoints:
    """Test other auth-related endpoints"""
    
    def test_me_endpoint_requires_auth(self):
        """GET /api/auth/me should require authentication"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ /api/auth/me correctly requires authentication")
    
    def test_logout_endpoint(self):
        """POST /api/auth/logout should work"""
        response = requests.post(f"{BASE_URL}/api/auth/logout")
        # Should return success even without session
        assert response.status_code == 200
        print("✓ Logout endpoint returns 200")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
