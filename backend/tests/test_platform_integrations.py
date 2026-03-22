"""
Test Platform Integrations - All 5 platforms (Stripe, Shopify, HubSpot, Salesforce, QuickBooks)
Tests validation error paths since we don't have real API keys.
All platforms use REAL API calls to validate credentials.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPlatformIntegrations:
    """Test all 5 platform integrations - validation error paths"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "csvdemo@test.com",
            "password": "Test123!"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        yield
    
    # ==================== GET /api/business/platforms ====================
    
    def test_get_platforms_returns_all_5_platforms(self):
        """GET /api/business/platforms returns all 5 platforms with correct structure"""
        resp = self.session.get(f"{BASE_URL}/api/business/platforms")
        assert resp.status_code == 200
        
        platforms = resp.json()
        assert len(platforms) == 5, f"Expected 5 platforms, got {len(platforms)}"
        
        platform_ids = [p["platform_id"] for p in platforms]
        assert "stripe" in platform_ids
        assert "shopify" in platform_ids
        assert "hubspot" in platform_ids
        assert "salesforce" in platform_ids
        assert "quickbooks" in platform_ids
    
    def test_all_platforms_have_requires_key_true(self):
        """All platforms should have requires_key=true"""
        resp = self.session.get(f"{BASE_URL}/api/business/platforms")
        assert resp.status_code == 200
        
        for platform in resp.json():
            assert platform.get("requires_key") == True, f"{platform['platform_id']} should have requires_key=true"
    
    def test_stripe_has_correct_key_fields(self):
        """Stripe should have api_key field only"""
        resp = self.session.get(f"{BASE_URL}/api/business/platforms")
        stripe = next(p for p in resp.json() if p["platform_id"] == "stripe")
        
        key_fields = stripe.get("key_fields", [])
        field_names = [f["name"] for f in key_fields]
        assert "api_key" in field_names
        assert len(key_fields) == 1
    
    def test_shopify_has_correct_key_fields(self):
        """Shopify should have store_url and api_key fields"""
        resp = self.session.get(f"{BASE_URL}/api/business/platforms")
        shopify = next(p for p in resp.json() if p["platform_id"] == "shopify")
        
        key_fields = shopify.get("key_fields", [])
        field_names = [f["name"] for f in key_fields]
        assert "store_url" in field_names
        assert "api_key" in field_names
        assert len(key_fields) == 2
    
    def test_hubspot_has_correct_key_fields(self):
        """HubSpot should have api_key field only"""
        resp = self.session.get(f"{BASE_URL}/api/business/platforms")
        hubspot = next(p for p in resp.json() if p["platform_id"] == "hubspot")
        
        key_fields = hubspot.get("key_fields", [])
        field_names = [f["name"] for f in key_fields]
        assert "api_key" in field_names
        assert len(key_fields) == 1
    
    def test_salesforce_has_correct_key_fields(self):
        """Salesforce should have instance_url and api_key fields"""
        resp = self.session.get(f"{BASE_URL}/api/business/platforms")
        salesforce = next(p for p in resp.json() if p["platform_id"] == "salesforce")
        
        key_fields = salesforce.get("key_fields", [])
        field_names = [f["name"] for f in key_fields]
        assert "instance_url" in field_names
        assert "api_key" in field_names
        assert len(key_fields) == 2
        assert salesforce.get("token_expires") == True
    
    def test_quickbooks_has_correct_key_fields(self):
        """QuickBooks should have company_id and api_key fields"""
        resp = self.session.get(f"{BASE_URL}/api/business/platforms")
        quickbooks = next(p for p in resp.json() if p["platform_id"] == "quickbooks")
        
        key_fields = quickbooks.get("key_fields", [])
        field_names = [f["name"] for f in key_fields]
        assert "company_id" in field_names
        assert "api_key" in field_names
        assert len(key_fields) == 2
        assert quickbooks.get("token_expires") == True
    
    # ==================== Stripe Connect Validation ====================
    
    def test_stripe_connect_missing_api_key(self):
        """Stripe connect without api_key returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/stripe", json={})
        assert resp.status_code == 400
        assert "required" in resp.json().get("detail", "").lower()
    
    def test_stripe_connect_invalid_api_key(self):
        """Stripe connect with invalid api_key returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/stripe", json={
            "api_key": "sk_test_invalid_key_12345"
        })
        assert resp.status_code == 400
        assert "invalid" in resp.json().get("detail", "").lower()
    
    # ==================== Shopify Connect Validation ====================
    
    def test_shopify_connect_missing_store_url(self):
        """Shopify connect without store_url returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/shopify", json={
            "api_key": "shpat_test_token"
        })
        assert resp.status_code == 400
        assert "store url is required" in resp.json().get("detail", "").lower()
    
    def test_shopify_connect_missing_api_key(self):
        """Shopify connect without api_key returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/shopify", json={
            "store_url": "mystore.myshopify.com"
        })
        assert resp.status_code == 400
        assert "required" in resp.json().get("detail", "").lower()
    
    def test_shopify_connect_invalid_credentials(self):
        """Shopify connect with invalid credentials returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/shopify", json={
            "api_key": "shpat_invalid_token",
            "store_url": "invalid-store.myshopify.com"
        })
        assert resp.status_code == 400
        # Should return error about invalid token or store not found
        detail = resp.json().get("detail", "").lower()
        assert "invalid" in detail or "not found" in detail or "error" in detail
    
    # ==================== HubSpot Connect Validation ====================
    
    def test_hubspot_connect_missing_api_key(self):
        """HubSpot connect without api_key returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/hubspot", json={})
        assert resp.status_code == 400
        assert "required" in resp.json().get("detail", "").lower()
    
    def test_hubspot_connect_invalid_token(self):
        """HubSpot connect with invalid token returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/hubspot", json={
            "api_key": "pat-na1-invalid-token"
        })
        assert resp.status_code == 400
        assert "invalid" in resp.json().get("detail", "").lower()
    
    # ==================== Salesforce Connect Validation ====================
    
    def test_salesforce_connect_missing_instance_url(self):
        """Salesforce connect without instance_url returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/salesforce", json={
            "api_key": "test_token"
        })
        assert resp.status_code == 400
        assert "instance url is required" in resp.json().get("detail", "").lower()
    
    def test_salesforce_connect_missing_api_key(self):
        """Salesforce connect without api_key returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/salesforce", json={
            "instance_url": "mycompany.my.salesforce.com"
        })
        assert resp.status_code == 400
        assert "required" in resp.json().get("detail", "").lower()
    
    def test_salesforce_connect_invalid_credentials(self):
        """Salesforce connect with invalid credentials returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/salesforce", json={
            "api_key": "invalid_token",
            "instance_url": "mycompany.my.salesforce.com"
        })
        assert resp.status_code == 400
        # Should return error about connection or invalid token
        detail = resp.json().get("detail", "").lower()
        assert "connect" in detail or "invalid" in detail or "error" in detail
    
    # ==================== QuickBooks Connect Validation ====================
    
    def test_quickbooks_connect_missing_company_id(self):
        """QuickBooks connect without company_id returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/quickbooks", json={
            "api_key": "test_token"
        })
        assert resp.status_code == 400
        assert "company id is required" in resp.json().get("detail", "").lower()
    
    def test_quickbooks_connect_missing_api_key(self):
        """QuickBooks connect without api_key returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/quickbooks", json={
            "company_id": "1234567890"
        })
        assert resp.status_code == 400
        assert "required" in resp.json().get("detail", "").lower()
    
    def test_quickbooks_connect_invalid_credentials(self):
        """QuickBooks connect with invalid credentials returns 400"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/quickbooks", json={
            "api_key": "invalid_token",
            "company_id": "1234567890"
        })
        assert resp.status_code == 400
        # Should return error about invalid or expired token
        detail = resp.json().get("detail", "").lower()
        assert "invalid" in detail or "expired" in detail or "error" in detail
    
    # ==================== Invalid Platform ====================
    
    def test_connect_invalid_platform_returns_404(self):
        """Connect to non-existent platform returns 404"""
        resp = self.session.post(f"{BASE_URL}/api/business/connect/invalid_platform", json={
            "api_key": "test"
        })
        assert resp.status_code == 404
        assert "not found" in resp.json().get("detail", "").lower()
    
    # ==================== Disconnect/Sync without connection ====================
    
    def test_disconnect_not_connected_platform_returns_404(self):
        """Disconnect platform that's not connected returns 404"""
        resp = self.session.post(f"{BASE_URL}/api/business/disconnect/stripe")
        assert resp.status_code == 404
        assert "not connected" in resp.json().get("detail", "").lower()
    
    def test_sync_not_connected_platform_returns_404(self):
        """Sync platform that's not connected returns 404"""
        resp = self.session.post(f"{BASE_URL}/api/business/sync/stripe")
        assert resp.status_code == 404
        assert "not connected" in resp.json().get("detail", "").lower()
    
    # ==================== Business Summary ====================
    
    def test_business_summary_returns_correct_structure(self):
        """GET /api/business/summary returns correct structure"""
        resp = self.session.get(f"{BASE_URL}/api/business/summary")
        assert resp.status_code == 200
        
        data = resp.json()
        assert "connected_count" in data
        assert "total_records" in data
        assert "total_synced_value" in data
        assert "platforms" in data
        assert isinstance(data["platforms"], list)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
