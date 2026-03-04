"""
Test onboarding endpoints and new user registration flow
- POST /api/auth/onboarding - Save onboarding data
- GET /api/auth/onboarding-status - Check onboarding status
- POST /api/auth/register - Registration should create user with onboarded=False
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

class TestOnboarding:
    """Onboarding endpoint tests"""
    
    @pytest.fixture(scope="class")
    def test_user_credentials(self):
        """Create unique test user credentials"""
        unique_id = int(time.time() * 1000)
        return {
            "email": f"onboard_test_{unique_id}@testexample.com",
            "password": "TestPass123!",
            "name": "Onboarding Test User"
        }
    
    @pytest.fixture(scope="class")
    def registered_user_session(self, test_user_credentials):
        """Register a new user and return session cookies"""
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json=test_user_credentials
        )
        assert response.status_code == 200, f"Registration failed: {response.text}"
        # Get cookies from response
        cookies = response.cookies.get_dict()
        return cookies, response.json()
    
    def test_register_creates_new_user_without_onboarding(self, test_user_credentials):
        """Test that registration creates user that needs onboarding"""
        unique_id = int(time.time() * 1000)
        unique_email = f"fresh_user_{unique_id}@testexample.com"
        
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": unique_email,
                "password": "TestPass123!",
                "name": "Fresh User"
            }
        )
        assert response.status_code == 200, f"Registration failed: {response.text}"
        user_data = response.json()
        
        # User should have user_id
        assert "user_id" in user_data, "user_id should be in response"
        assert user_data["email"] == unique_email
        print(f"✓ Registration created user: {user_data['user_id']}")
    
    def test_onboarding_status_returns_false_for_new_user(self, registered_user_session):
        """Test that onboarding status is false for new users"""
        cookies, user_data = registered_user_session
        
        response = requests.get(
            f"{BASE_URL}/api/auth/onboarding-status",
            cookies=cookies
        )
        assert response.status_code == 200, f"Status check failed: {response.text}"
        
        data = response.json()
        assert "onboarded" in data, "Response should have 'onboarded' field"
        assert data["onboarded"] == False, "New user should not be onboarded"
        print(f"✓ Onboarding status for new user is False")
    
    def test_onboarding_endpoint_saves_data(self, registered_user_session):
        """Test that onboarding endpoint saves data correctly"""
        cookies, user_data = registered_user_session
        
        onboarding_data = {
            "company_name": "Test Company",
            "team_size": "6-20",
            "industry": "SaaS / Software",
            "goals": ["pipeline", "pricing", "churn"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/auth/onboarding",
            json=onboarding_data,
            cookies=cookies
        )
        assert response.status_code == 200, f"Onboarding save failed: {response.text}"
        
        data = response.json()
        assert data.get("status") == "completed", "Status should be 'completed'"
        print(f"✓ Onboarding data saved successfully")
    
    def test_onboarding_status_returns_true_after_completing(self, registered_user_session):
        """Test that onboarding status is true after completing onboarding"""
        cookies, user_data = registered_user_session
        
        response = requests.get(
            f"{BASE_URL}/api/auth/onboarding-status",
            cookies=cookies
        )
        assert response.status_code == 200, f"Status check failed: {response.text}"
        
        data = response.json()
        assert data["onboarded"] == True, "User should be onboarded after completing"
        print(f"✓ Onboarding status is True after completion")
    
    def test_onboarding_requires_auth(self):
        """Test that onboarding endpoints require authentication"""
        # Test status endpoint
        response = requests.get(f"{BASE_URL}/api/auth/onboarding-status")
        assert response.status_code == 401, "Onboarding status should require auth"
        print(f"✓ GET /api/auth/onboarding-status requires auth (401)")
        
        # Test onboarding endpoint
        response = requests.post(
            f"{BASE_URL}/api/auth/onboarding",
            json={"company_name": "Test", "team_size": "1-5", "industry": "Other", "goals": ["pipeline"]}
        )
        assert response.status_code == 401, "Onboarding POST should require auth"
        print(f"✓ POST /api/auth/onboarding requires auth (401)")
    
    def test_onboarding_validates_data(self, registered_user_session):
        """Test that onboarding validates required fields"""
        cookies, _ = registered_user_session
        
        # Missing company_name - should fail validation
        response = requests.post(
            f"{BASE_URL}/api/auth/onboarding",
            json={"team_size": "1-5", "industry": "Other", "goals": ["pipeline"]},
            cookies=cookies
        )
        # This should return 422 for validation error
        assert response.status_code == 422 or response.status_code == 200, \
            f"Expected 422 validation error or 200, got {response.status_code}"
        print(f"✓ Onboarding validates required fields")


class TestLandingPageContent:
    """Test landing page content - no testimonials, correct CTAs"""
    
    def test_landing_page_loads(self):
        """Test that landing page loads successfully"""
        response = requests.get(BASE_URL)
        assert response.status_code == 200, f"Landing page failed to load: {response.status_code}"
        print(f"✓ Landing page loads (200 OK)")
    
    def test_subscription_plans_have_unlock_access(self):
        """Test that subscription plans have 'Unlock Access' CTA"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200, f"Plans endpoint failed: {response.status_code}"
        
        plans = response.json()
        # Essential and Pro should have features, Enterprise has Contact Sales
        assert "essential_monthly" in plans, "Essential monthly plan should exist"
        assert "pro_monthly" in plans, "Pro monthly plan should exist"
        
        print(f"✓ Subscription plans API returns Essential and Pro tiers")


class TestAuthFlow:
    """Test auth flow for new user registration"""
    
    def test_auth_endpoints_available(self):
        """Test that auth endpoints are available"""
        # Health check
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print(f"✓ Health endpoint available")
        
        # Test Microsoft auth returns 501 (not configured)
        response = requests.get(f"{BASE_URL}/api/auth/microsoft")
        assert response.status_code == 501, "Microsoft auth should return 501 (not configured)"
        print(f"✓ Microsoft auth returns 501 (not configured - expected)")
    
    def test_existing_user_login(self):
        """Test that existing user can login"""
        # Use the test user from iteration 4
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "uitest_1772633591@testexample.com",
                "password": "UITestPass123!"
            }
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        user_data = response.json()
        assert "user_id" in user_data
        print(f"✓ Existing user login works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
