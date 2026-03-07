"""
Test suite for Vector SaaS Integrations API
Tests GET /api/integrations, POST connect/disconnect functionality
"""
import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sales-engine-18.preview.emergentagent.com').rstrip('/')

# Test session token created via mongosh
SESSION_TOKEN = "test_session_integ_1772621703579"

class TestIntegrationsAPI:
    """Integrations API endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.headers = {
            "Authorization": f"Bearer {SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
    
    def test_integrations_requires_auth(self):
        """Test that /api/integrations requires authentication"""
        response = requests.get(f"{BASE_URL}/api/integrations")
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        print("PASS: Integrations API properly requires authentication")
    
    def test_get_integrations_list(self):
        """Test GET /api/integrations returns list of integrations"""
        response = requests.get(f"{BASE_URL}/api/integrations", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 9  # At least 9 predefined integrations
        
        # Verify integration structure
        integration_ids = []
        for integration in data:
            assert "integration_id" in integration
            assert "name" in integration
            assert "description" in integration
            assert "category" in integration
            assert "icon" in integration
            assert "color" in integration
            assert "connected" in integration
            integration_ids.append(integration["integration_id"])
        
        # Verify expected integrations exist
        expected_ids = ["slack", "hubspot", "salesforce", "google_sheets", "zapier", "stripe", "gmail", "microsoft_teams", "jira"]
        for exp_id in expected_ids:
            assert exp_id in integration_ids, f"Missing expected integration: {exp_id}"
        
        print(f"PASS: GET /api/integrations returned {len(data)} integrations with correct structure")
    
    def test_connect_integration(self):
        """Test POST /api/integrations/{id}/connect"""
        # First ensure disconnected
        requests.post(f"{BASE_URL}/api/integrations/slack/disconnect", headers=self.headers)
        
        # Connect
        response = requests.post(f"{BASE_URL}/api/integrations/slack/connect", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "connected"
        assert data["integration_id"] == "slack"
        
        # Verify connection persisted
        list_response = requests.get(f"{BASE_URL}/api/integrations", headers=self.headers)
        integrations = list_response.json()
        slack = next(i for i in integrations if i["integration_id"] == "slack")
        assert slack["connected"] == True
        assert "connected_at" in slack
        
        print("PASS: Connect integration works and persists")
    
    def test_disconnect_integration(self):
        """Test POST /api/integrations/{id}/disconnect"""
        # Ensure connected first
        requests.post(f"{BASE_URL}/api/integrations/slack/connect", headers=self.headers)
        
        # Disconnect
        response = requests.post(f"{BASE_URL}/api/integrations/slack/disconnect", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "disconnected"
        assert data["integration_id"] == "slack"
        
        # Verify disconnection persisted
        list_response = requests.get(f"{BASE_URL}/api/integrations", headers=self.headers)
        integrations = list_response.json()
        slack = next(i for i in integrations if i["integration_id"] == "slack")
        assert slack["connected"] == False
        
        print("PASS: Disconnect integration works and persists")
    
    def test_connect_already_connected_returns_400(self):
        """Test that connecting an already connected integration returns 400"""
        # Ensure connected
        requests.post(f"{BASE_URL}/api/integrations/hubspot/connect", headers=self.headers)
        
        # Try to connect again
        response = requests.post(f"{BASE_URL}/api/integrations/hubspot/connect", headers=self.headers)
        assert response.status_code == 400
        
        data = response.json()
        assert "already connected" in data["detail"].lower()
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/integrations/hubspot/disconnect", headers=self.headers)
        print("PASS: Double connect properly returns 400")
    
    def test_disconnect_not_connected_returns_404(self):
        """Test that disconnecting a not-connected integration returns 404"""
        # Ensure disconnected
        requests.post(f"{BASE_URL}/api/integrations/salesforce/disconnect", headers=self.headers)
        
        # Try to disconnect again
        response = requests.post(f"{BASE_URL}/api/integrations/salesforce/disconnect", headers=self.headers)
        assert response.status_code == 404
        
        print("PASS: Disconnect not-connected properly returns 404")
    
    def test_connect_invalid_integration_returns_404(self):
        """Test that connecting an invalid integration ID returns 404"""
        response = requests.post(f"{BASE_URL}/api/integrations/invalid_integration_id/connect", headers=self.headers)
        assert response.status_code == 404
        
        data = response.json()
        assert "not found" in data["detail"].lower()
        
        print("PASS: Invalid integration ID properly returns 404")
    
    def test_integrations_without_auth_token(self):
        """Test all integration endpoints require auth"""
        endpoints = [
            ("GET", "/api/integrations"),
            ("POST", "/api/integrations/slack/connect"),
            ("POST", "/api/integrations/slack/disconnect"),
        ]
        
        for method, endpoint in endpoints:
            if method == "GET":
                response = requests.get(f"{BASE_URL}{endpoint}")
            else:
                response = requests.post(f"{BASE_URL}{endpoint}")
            
            assert response.status_code == 401, f"Expected 401 for {method} {endpoint}, got {response.status_code}"
        
        print("PASS: All integration endpoints require authentication")


class TestExistingAPIs:
    """Verify existing APIs still work after integration changes"""
    
    def test_health_check(self):
        """Test /api/health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
        print("PASS: Health check working")
    
    def test_root_endpoint(self):
        """Test /api/ root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Vector API"
        assert "version" in data
        print("PASS: Root API endpoint working")
    
    def test_subscription_plans_endpoint(self):
        """Test /api/subscription/plans endpoint"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200
        data = response.json()
        
        # Verify plan structure
        expected_plans = ["basic_monthly", "basic_yearly", "pro_monthly", "pro_yearly", "enterprise_monthly", "enterprise_yearly"]
        for plan_id in expected_plans:
            assert plan_id in data, f"Missing plan: {plan_id}"
        
        print("PASS: Subscription plans endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
