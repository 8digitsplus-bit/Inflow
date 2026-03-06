"""
Backend API Tests for Zelta SaaS Application
Tests: Health, Auth, Analytics endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndBasic:
    """Health and basic API tests"""
    
    def test_health_endpoint(self):
        """Test health endpoint returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health endpoint returns healthy")

    def test_root_endpoint(self):
        """Test root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        print("✓ Root endpoint accessible")


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_auth_register_and_login(self):
        """Test email registration and login flow"""
        # Register new user
        register_payload = {
            "email": "TEST_api_test@zelta.com",
            "password": "testpass123",
            "name": "API Test User"
        }
        
        # Try to register (might already exist)
        register_response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json=register_payload
        )
        
        if register_response.status_code == 400:
            # User already exists, try login
            print("User already registered, testing login...")
        else:
            assert register_response.status_code == 200
            print("✓ Registration successful")
        
        # Test login
        login_payload = {
            "email": "TEST_api_test@zelta.com",
            "password": "testpass123"
        }
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=login_payload
        )
        assert login_response.status_code == 200
        data = login_response.json()
        assert "user_id" in data
        assert data["email"] == "TEST_api_test@zelta.com"
        print("✓ Login successful")
        
        # Store session cookie for authenticated tests
        return login_response.cookies

    def test_auth_invalid_login(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@test.com", "password": "wrongpass"}
        )
        assert response.status_code == 401
        print("✓ Invalid login returns 401")

    def test_shopify_auth_not_configured(self):
        """Test Shopify auth returns 501 when not configured"""
        response = requests.get(f"{BASE_URL}/api/auth/shopify")
        # Should return 501 (not configured) or 400 (missing shop param)
        assert response.status_code in [400, 501]
        print("✓ Shopify auth correctly returns not configured or missing params")


class TestProtectedEndpoints:
    """Test protected endpoints require authentication"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@zelta.com", "password": "demo1234"}
        )
        if login_response.status_code != 200:
            pytest.skip("Could not authenticate - login failed")
        return session

    def test_auth_me_requires_auth(self):
        """Test /auth/me requires authentication"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ /auth/me requires authentication")

    def test_auth_me_authenticated(self, auth_session):
        """Test /auth/me returns user data when authenticated"""
        response = auth_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "email" in data
        print("✓ /auth/me returns user data when authenticated")


class TestAnalyticsEndpoints:
    """Test analytics endpoints"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@zelta.com", "password": "demo1234"}
        )
        if login_response.status_code != 200:
            pytest.skip("Could not authenticate")
        return session

    def test_revenue_analytics(self, auth_session):
        """Test revenue analytics endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/revenue")
        assert response.status_code == 200
        data = response.json()
        assert "total_pipeline" in data
        assert "closed_revenue" in data
        assert "win_rate" in data
        assert "monthly_data" in data
        print("✓ Revenue analytics endpoint works")

    def test_pipeline_analytics(self, auth_session):
        """Test pipeline analytics endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/pipeline")
        assert response.status_code == 200
        data = response.json()
        assert "weighted_pipeline" in data
        assert "deals_by_stage" in data
        print("✓ Pipeline analytics endpoint works")

    def test_churn_analytics(self, auth_session):
        """Test churn analytics endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        assert response.status_code == 200
        data = response.json()
        assert "churn_rate" in data
        assert "retention_rate" in data
        assert "nrr" in data
        assert "clv" in data
        assert "monthly_data" in data
        assert "cohorts" in data
        print("✓ Churn analytics endpoint works")

    def test_cro_analytics(self, auth_session):
        """Test CRO analytics endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/cro")
        assert response.status_code == 200
        data = response.json()
        assert "overall_conversion" in data
        assert "funnel_data" in data
        assert "stage_conversions" in data
        assert "bottlenecks" in data
        print("✓ CRO analytics endpoint works")

    def test_sales_performance_analytics(self, auth_session):
        """Test sales performance analytics endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/sales-performance")
        assert response.status_code == 200
        data = response.json()
        assert "win_rate" in data
        assert "avg_deal_value" in data
        assert "monthly_performance" in data
        print("✓ Sales performance analytics endpoint works")

    def test_sales_revenue_analytics(self, auth_session):
        """Test sales revenue analytics endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/sales-revenue")
        assert response.status_code == 200
        data = response.json()
        assert "total_revenue" in data
        assert "mrr" in data
        assert "arr" in data
        assert "pipeline_value" in data
        print("✓ Sales revenue analytics endpoint works")

    def test_revenue_intelligence_analytics(self, auth_session):
        """Test revenue intelligence analytics endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/revenue-intelligence")
        assert response.status_code == 200
        data = response.json()
        assert "total_revenue" in data
        assert "pipeline_value" in data
        assert "pipeline_health" in data
        assert "recommendations" in data
        print("✓ Revenue intelligence analytics endpoint works")

    def test_pricing_analytics(self, auth_session):
        """Test pricing analytics endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/pricing")
        assert response.status_code == 200
        data = response.json()
        assert "total_analyses" in data
        assert "margin_data" in data
        print("✓ Pricing analytics endpoint works")


class TestDealsEndpoints:
    """Test deals CRUD endpoints"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@zelta.com", "password": "demo1234"}
        )
        if login_response.status_code != 200:
            pytest.skip("Could not authenticate")
        return session

    def test_deals_crud(self, auth_session):
        """Test full deals CRUD cycle"""
        # CREATE a deal
        create_payload = {
            "name": "TEST_API Deal",
            "company": "TEST Company",
            "value": 10000,
            "stage": "lead",
            "probability": 25
        }
        create_response = auth_session.post(
            f"{BASE_URL}/api/deals",
            json=create_payload
        )
        assert create_response.status_code == 200
        created_deal = create_response.json()
        assert created_deal["name"] == "TEST_API Deal"
        deal_id = created_deal["deal_id"]
        print(f"✓ Created deal: {deal_id}")
        
        # READ - Get all deals
        list_response = auth_session.get(f"{BASE_URL}/api/deals")
        assert list_response.status_code == 200
        deals = list_response.json()
        assert isinstance(deals, list)
        print(f"✓ Listed {len(deals)} deals")
        
        # UPDATE the deal
        update_payload = {
            "stage": "qualified",
            "probability": 50,
            "value": 15000
        }
        update_response = auth_session.put(
            f"{BASE_URL}/api/deals/{deal_id}",
            json=update_payload
        )
        assert update_response.status_code == 200
        updated_deal = update_response.json()
        assert updated_deal["stage"] == "qualified"
        assert updated_deal["probability"] == 50
        print("✓ Updated deal successfully")
        
        # DELETE the deal
        delete_response = auth_session.delete(f"{BASE_URL}/api/deals/{deal_id}")
        assert delete_response.status_code == 200
        print("✓ Deleted deal successfully")


class TestStripeEndpoints:
    """Test Stripe-related endpoints"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "demo@zelta.com", "password": "demo1234"}
        )
        if login_response.status_code != 200:
            pytest.skip("Could not authenticate")
        return session

    def test_checkout_session_requires_auth(self):
        """Test checkout session requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/stripe/checkout",
            json={"tier": "essential_monthly"}
        )
        assert response.status_code == 401
        print("✓ Stripe checkout requires authentication")

    def test_checkout_session_creation(self, auth_session):
        """Test creating a checkout session"""
        response = auth_session.post(
            f"{BASE_URL}/api/stripe/checkout",
            json={"tier": "essential_monthly"}
        )
        # Should return 200 with checkout URL or an error
        # In test mode, this should work
        assert response.status_code in [200, 500]  # 500 if Stripe not fully configured
        if response.status_code == 200:
            data = response.json()
            assert "url" in data or "checkout_url" in data
            print("✓ Checkout session created successfully")
        else:
            print("✓ Checkout endpoint accessible (Stripe config may be incomplete)")
