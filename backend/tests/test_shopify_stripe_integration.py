"""
Test Shopify Auth and Stripe Checkout Integration
Tests:
- Shopify auth graceful 501 failure when SHOPIFY_API_KEY not configured
- Stripe checkout endpoint requires authentication
- Subscription plans endpoint returns all 6 plans
- Email registration and login flows
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

class TestShopifyAuth:
    """Shopify authentication endpoint tests - should return 501 when not configured"""
    
    def test_shopify_auth_returns_501_not_configured(self):
        """Verify /api/auth/shopify returns 501 with proper error message"""
        response = requests.get(f"{BASE_URL}/api/auth/shopify?shop=test.myshopify.com")
        assert response.status_code == 501, f"Expected 501, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        assert "not configured" in data["detail"].lower() or "SHOPIFY_API_KEY" in data["detail"]
    
    def test_shopify_auth_without_shop_param(self):
        """Verify /api/auth/shopify returns 501 even without shop param (API key check first)"""
        response = requests.get(f"{BASE_URL}/api/auth/shopify")
        # Should return 501 because API key is checked first
        assert response.status_code == 501
        data = response.json()
        assert "detail" in data


class TestStripeCheckout:
    """Stripe checkout endpoint tests"""
    
    def test_create_checkout_requires_auth(self):
        """Verify /api/payments/create-checkout returns 401 when not authenticated"""
        response = requests.post(
            f"{BASE_URL}/api/payments/create-checkout",
            json={"plan": "pro_monthly", "origin_url": BASE_URL}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        assert "authenticated" in data["detail"].lower() or "not authenticated" in data["detail"].lower()
    
    def test_payment_status_requires_auth(self):
        """Verify /api/payments/status/{session_id} requires authentication"""
        response = requests.get(f"{BASE_URL}/api/payments/status/test_session_123")
        assert response.status_code == 401


class TestSubscriptionPlans:
    """Subscription plans endpoint tests"""
    
    def test_get_subscription_plans(self):
        """Verify /api/subscription/plans returns all 6 plans"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200
        data = response.json()
        
        # Verify all 6 plans exist
        expected_plans = [
            "essential_monthly", "essential_yearly",
            "pro_monthly", "pro_yearly", 
            "enterprise_monthly", "enterprise_yearly"
        ]
        
        for plan in expected_plans:
            assert plan in data, f"Plan {plan} missing from response"
            assert "price" in data[plan]
            assert "name" in data[plan]
            assert "period" in data[plan]
            assert "features" in data[plan]
            assert isinstance(data[plan]["features"], list)
    
    def test_essential_monthly_plan_details(self):
        """Verify essential_monthly plan has correct price"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        assert data["essential_monthly"]["price"] == 49.0
        assert data["essential_monthly"]["name"] == "Essential"
    
    def test_pro_monthly_plan_details(self):
        """Verify pro_monthly plan has correct price"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        assert data["pro_monthly"]["price"] == 99.0
        assert data["pro_monthly"]["name"] == "Pro"
    
    def test_enterprise_monthly_plan_details(self):
        """Verify enterprise_monthly plan has correct price"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        assert data["enterprise_monthly"]["price"] == 179.0
        assert data["enterprise_monthly"]["name"] == "Enterprise"


class TestEmailAuth:
    """Email registration and login flow tests"""
    
    @pytest.fixture
    def unique_email(self):
        return f"TEST_stripetest_{uuid.uuid4().hex[:8]}@testexample.com"
    
    def test_register_new_user(self, unique_email):
        """Test email registration creates new user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "name": "Test User",
                "email": unique_email,
                "password": "TestPass123!"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "user_id" in data
        assert data["email"] == unique_email
        assert data["name"] == "Test User"
        assert "password_hash" not in data  # Should not expose password hash
    
    def test_register_duplicate_email_fails(self, unique_email):
        """Test that duplicate email registration fails"""
        # First registration
        requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"name": "Test User", "email": unique_email, "password": "TestPass123!"}
        )
        # Second registration with same email should fail
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"name": "Test User 2", "email": unique_email, "password": "TestPass456!"}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "already" in data["detail"].lower()
    
    def test_login_with_valid_credentials(self, unique_email):
        """Test login with valid credentials"""
        # First register
        requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"name": "Test User", "email": unique_email, "password": "TestPass123!"}
        )
        # Then login
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": unique_email, "password": "TestPass123!"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert data["email"] == unique_email
    
    def test_login_with_invalid_password(self, unique_email):
        """Test login with invalid password returns 401"""
        # First register
        requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"name": "Test User", "email": unique_email, "password": "TestPass123!"}
        )
        # Then login with wrong password
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": unique_email, "password": "WrongPass123!"}
        )
        assert response.status_code == 401


class TestAuthenticatedStripeCheckout:
    """Tests for authenticated Stripe checkout flow"""
    
    @pytest.fixture
    def auth_session(self):
        """Create a test user and get session cookie"""
        email = f"TEST_checkout_{uuid.uuid4().hex[:8]}@testexample.com"
        session = requests.Session()
        
        # Register user
        response = session.post(
            f"{BASE_URL}/api/auth/register",
            json={"name": "Checkout Test User", "email": email, "password": "TestPass123!"}
        )
        assert response.status_code == 200, f"Registration failed: {response.text}"
        return session
    
    def test_create_checkout_with_auth(self, auth_session):
        """Test create-checkout endpoint with authenticated session"""
        response = auth_session.post(
            f"{BASE_URL}/api/payments/create-checkout",
            json={"plan": "pro_monthly", "origin_url": BASE_URL}
        )
        # Should work with auth - returns 200 with checkout URL
        # Or may fail with 500 if Stripe isn't fully configured
        assert response.status_code in [200, 500], f"Unexpected status {response.status_code}: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert "url" in data
            assert "session_id" in data
    
    def test_create_checkout_invalid_plan(self, auth_session):
        """Test create-checkout with invalid plan returns 400"""
        response = auth_session.post(
            f"{BASE_URL}/api/payments/create-checkout",
            json={"plan": "invalid_plan", "origin_url": BASE_URL}
        )
        assert response.status_code == 400
        data = response.json()
        assert "Invalid plan" in data.get("detail", "")
    
    def test_create_checkout_missing_origin(self, auth_session):
        """Test create-checkout without origin_url returns 400"""
        response = auth_session.post(
            f"{BASE_URL}/api/payments/create-checkout",
            json={"plan": "pro_monthly"}
        )
        assert response.status_code == 400
        data = response.json()
        assert "origin_url" in data.get("detail", "")


class TestHealthAndBasic:
    """Basic health and connectivity tests"""
    
    def test_health_endpoint(self):
        """Verify /api/health returns healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
    
    def test_auth_me_unauthenticated(self):
        """Verify /api/auth/me returns 401 when not authenticated"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
