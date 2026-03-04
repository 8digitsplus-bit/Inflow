"""
Comprehensive test suite for Vector SaaS API refactoring verification.
Tests all backend API endpoints to ensure functionality is preserved after 
splitting server.py into modular routers.

Test Modules:
- Health check endpoints
- Authentication (register, login, me, onboarding)
- Deals CRUD
- Analytics (revenue, pipeline, churn, CRO)
- Integrations
- Notifications
- Subscription plans
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_USER_EMAIL = "uitest_1772633591@testexample.com"
TEST_USER_PASSWORD = "UITestPass123!"


class TestHealthEndpoints:
    """Health check endpoint tests - should work without authentication"""
    
    def test_health_endpoint(self):
        """GET /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data["status"] == "healthy", f"Unexpected status: {data}"
        print("✓ Health endpoint working")
    
    def test_root_endpoint(self):
        """GET /api/ returns API info"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Root endpoint failed: {response.text}"
        data = response.json()
        assert "message" in data
        assert "Vector API" in data["message"]
        print("✓ Root endpoint working")


class TestAuthentication:
    """Authentication flow tests"""
    
    @pytest.fixture(scope="class")
    def test_session(self):
        """Create a session for authenticated tests"""
        session = requests.Session()
        # Login with test user
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return session
    
    def test_login_with_valid_credentials(self):
        """POST /api/auth/login authenticates user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user_id" in data
        assert data["email"] == TEST_USER_EMAIL
        print(f"✓ Login successful for {TEST_USER_EMAIL}")
    
    def test_login_with_invalid_credentials(self):
        """POST /api/auth/login rejects invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid login correctly rejected")
    
    def test_get_me_authenticated(self, test_session):
        """GET /api/auth/me returns authenticated user"""
        response = test_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Get me failed: {response.text}"
        data = response.json()
        assert data["email"] == TEST_USER_EMAIL
        print(f"✓ Get me returned user: {data['email']}")
    
    def test_get_me_unauthenticated(self):
        """GET /api/auth/me rejects unauthenticated requests"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated /me correctly rejected")
    
    def test_onboarding_status(self, test_session):
        """GET /api/auth/onboarding-status returns status"""
        response = test_session.get(f"{BASE_URL}/api/auth/onboarding-status")
        assert response.status_code == 200, f"Onboarding status failed: {response.text}"
        data = response.json()
        assert "onboarded" in data
        print(f"✓ Onboarding status: {data['onboarded']}")
    
    def test_register_creates_new_user(self):
        """POST /api/auth/register creates a new user"""
        unique_email = f"test_reg_{uuid.uuid4().hex[:8]}@testexample.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123!",
            "name": "Test Registration User"
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert data["email"] == unique_email
        assert "user_id" in data
        print(f"✓ New user registered: {unique_email}")
    
    def test_register_rejects_duplicate_email(self):
        """POST /api/auth/register rejects duplicate email"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_USER_EMAIL,
            "password": "AnotherPass123!",
            "name": "Duplicate User"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Duplicate email correctly rejected")


class TestDeals:
    """Deals CRUD endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200
        return session
    
    def test_get_deals(self, auth_session):
        """GET /api/deals returns user's deals"""
        response = auth_session.get(f"{BASE_URL}/api/deals")
        assert response.status_code == 200, f"Get deals failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get deals returned {len(data)} deals")
    
    def test_create_deal(self, auth_session):
        """POST /api/deals creates a new deal"""
        deal_data = {
            "name": f"TEST_Deal_{uuid.uuid4().hex[:6]}",
            "company": "Test Company Inc",
            "value": 15000.00,
            "stage": "lead",
            "probability": 25
        }
        response = auth_session.post(f"{BASE_URL}/api/deals", json=deal_data)
        assert response.status_code == 200, f"Create deal failed: {response.text}"
        data = response.json()
        assert data["name"] == deal_data["name"]
        assert data["value"] == deal_data["value"]
        assert "deal_id" in data
        print(f"✓ Deal created: {data['deal_id']}")
        return data["deal_id"]
    
    def test_create_and_verify_deal(self, auth_session):
        """POST /api/deals and verify with GET"""
        deal_data = {
            "name": f"TEST_Verify_{uuid.uuid4().hex[:6]}",
            "company": "Verify Company",
            "value": 25000.00,
            "stage": "qualified",
            "probability": 40
        }
        
        # Create deal
        create_response = auth_session.post(f"{BASE_URL}/api/deals", json=deal_data)
        assert create_response.status_code == 200
        created_deal = create_response.json()
        deal_id = created_deal["deal_id"]
        
        # Verify deal exists in list
        get_response = auth_session.get(f"{BASE_URL}/api/deals")
        assert get_response.status_code == 200
        deals = get_response.json()
        found = any(d["deal_id"] == deal_id for d in deals)
        assert found, f"Created deal {deal_id} not found in deals list"
        print(f"✓ Deal creation verified: {deal_id}")


class TestAnalytics:
    """Analytics endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200
        return session
    
    def test_revenue_analytics(self, auth_session):
        """GET /api/analytics/revenue returns revenue data"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/revenue")
        assert response.status_code == 200, f"Revenue analytics failed: {response.text}"
        data = response.json()
        assert "total_pipeline" in data
        assert "closed_revenue" in data
        assert "win_rate" in data
        assert "stage_breakdown" in data
        print(f"✓ Revenue analytics: pipeline=${data['total_pipeline']}")
    
    def test_pipeline_analytics(self, auth_session):
        """GET /api/analytics/pipeline returns pipeline data"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/pipeline")
        assert response.status_code == 200, f"Pipeline analytics failed: {response.text}"
        data = response.json()
        assert "weighted_pipeline" in data
        assert "deals_by_stage" in data
        print(f"✓ Pipeline analytics: weighted=${data['weighted_pipeline']}")
    
    def test_churn_analytics(self, auth_session):
        """GET /api/analytics/churn returns churn data"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        assert response.status_code == 200, f"Churn analytics failed: {response.text}"
        data = response.json()
        assert "churn_rate" in data
        assert "retention_rate" in data
        assert "health_score" in data
        assert "monthly_data" in data
        print(f"✓ Churn analytics: rate={data['churn_rate']}%, retention={data['retention_rate']}%")
    
    def test_cro_analytics(self, auth_session):
        """GET /api/analytics/cro returns CRO data"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/cro")
        assert response.status_code == 200, f"CRO analytics failed: {response.text}"
        data = response.json()
        assert "overall_conversion" in data
        assert "funnel_data" in data
        assert "bottlenecks" in data
        print(f"✓ CRO analytics: conversion={data['overall_conversion']}%")


class TestIntegrations:
    """Integrations endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200
        return session
    
    def test_get_integrations(self, auth_session):
        """GET /api/integrations returns integration list"""
        response = auth_session.get(f"{BASE_URL}/api/integrations")
        assert response.status_code == 200, f"Get integrations failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Expected at least one integration"
        
        # Verify integration structure
        first_int = data[0]
        assert "integration_id" in first_int
        assert "name" in first_int
        assert "connected" in first_int
        
        # Check expected integrations exist
        integration_ids = [i["integration_id"] for i in data]
        expected = ["slack", "hubspot", "salesforce", "stripe", "zapier"]
        for exp_id in expected:
            assert exp_id in integration_ids, f"Missing integration: {exp_id}"
        
        print(f"✓ Get integrations returned {len(data)} integrations")


class TestNotifications:
    """Notifications endpoint tests"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200
        return session
    
    def test_get_notifications(self, auth_session):
        """GET /api/notifications returns notifications"""
        response = auth_session.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 200, f"Get notifications failed: {response.text}"
        data = response.json()
        assert "notifications" in data
        assert "unread_count" in data
        assert isinstance(data["notifications"], list)
        print(f"✓ Get notifications: {len(data['notifications'])} notifications, {data['unread_count']} unread")


class TestPayments:
    """Payments/Subscription endpoint tests"""
    
    def test_get_subscription_plans(self):
        """GET /api/subscription/plans returns available plans"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200, f"Get plans failed: {response.text}"
        data = response.json()
        
        # Verify all expected plans exist
        expected_plans = [
            "essential_monthly", "essential_yearly",
            "pro_monthly", "pro_yearly",
            "enterprise_monthly", "enterprise_yearly"
        ]
        for plan in expected_plans:
            assert plan in data, f"Missing plan: {plan}"
        
        # Verify plan structure
        pro_monthly = data["pro_monthly"]
        assert "price" in pro_monthly
        assert "name" in pro_monthly
        assert "features" in pro_monthly
        assert pro_monthly["price"] == 99.0
        
        print(f"✓ Subscription plans: {len(data)} plans available")


class TestMicrosoftAuth:
    """Microsoft OAuth tests (expected to return 501 - not configured)"""
    
    def test_microsoft_auth_not_configured(self):
        """GET /api/auth/microsoft returns 501 (not configured)"""
        response = requests.get(f"{BASE_URL}/api/auth/microsoft")
        assert response.status_code == 501, f"Expected 501, got {response.status_code}"
        print("✓ Microsoft auth correctly returns 501 (not configured)")


# Run all tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
