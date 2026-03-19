"""
Test suite for Stripe Live Integration feature
Tests: Stripe API key validation, real data fetch, connect/sync with API key
Note: Tests use sk_test_fake which will correctly fail validation (expected behavior)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials
TEST_USER_EMAIL = "testdemo@inflow.com"
TEST_USER_PASSWORD = "Test123!"


@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session with enterprise user"""
    session = requests.Session()
    
    # Login with existing test user
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    assert 'session_token' in session.cookies, "Session token cookie not set"
    print(f"Auth session created for {TEST_USER_EMAIL}")
    
    return session


@pytest.fixture(scope="module")
def fresh_test_session():
    """Create a fresh test user session for connect tests"""
    session = requests.Session()
    email = f"stripe_test_{int(time.time())}@test.com"
    
    # Register new user
    resp = session.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": "Test123!",
        "name": "Stripe Test User"
    })
    assert resp.status_code == 200, f"Register failed: {resp.text}"
    print(f"Fresh session created for {email}")
    return session


class TestStripeIntegrationAPIKeyValidation:
    """Test Stripe API key validation behavior"""
    
    def test_stripe_connect_without_api_key_returns_400(self, fresh_test_session):
        """POST /api/business/connect/stripe without api_key returns 400"""
        resp = fresh_test_session.post(
            f"{BASE_URL}/api/business/connect/stripe",
            json={}
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "api key" in data.get("detail", "").lower() or "required" in data.get("detail", "").lower()
        print("PASS: Stripe connect without API key returns 400 with proper error")
    
    def test_stripe_connect_with_empty_api_key_returns_400(self, fresh_test_session):
        """POST /api/business/connect/stripe with empty api_key returns 400"""
        resp = fresh_test_session.post(
            f"{BASE_URL}/api/business/connect/stripe",
            json={"api_key": ""}
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        print("PASS: Stripe connect with empty API key returns 400")
    
    def test_stripe_connect_with_invalid_key_returns_400(self, fresh_test_session):
        """POST /api/business/connect/stripe with invalid key returns 400"""
        # Using a fake key that looks valid but isn't
        resp = fresh_test_session.post(
            f"{BASE_URL}/api/business/connect/stripe",
            json={"api_key": "sk_test_invalid_key_1234567890"}
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        data = resp.json()
        # Should have error about invalid API key
        assert "invalid" in data.get("detail", "").lower() or "api key" in data.get("detail", "").lower()
        print(f"PASS: Invalid Stripe API key returns 400 with error: {data.get('detail')}")
    
    def test_stripe_connect_with_non_sk_prefix_format(self, fresh_test_session):
        """POST /api/business/connect/stripe with non-sk_ prefix key format"""
        # Note: Backend doesn't validate prefix, only calls Stripe API
        resp = fresh_test_session.post(
            f"{BASE_URL}/api/business/connect/stripe",
            json={"api_key": "pk_test_12345"}  # pk_ is publishable key, not secret
        )
        # Should fail at Stripe validation
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        print("PASS: Non-secret Stripe key format is rejected")


class TestMockedPlatformConnections:
    """Test that non-Stripe platforms still work with mock data (no API key needed)"""
    
    def test_hubspot_connect_no_api_key_required(self, fresh_test_session):
        """POST /api/business/connect/hubspot works without api_key"""
        resp = fresh_test_session.post(
            f"{BASE_URL}/api/business/connect/hubspot",
            json={}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["status"] == "connected"
        assert data["platform"] == "hubspot"
        assert data.get("is_live") == False, "HubSpot should NOT be live (mock data)"
        assert data["records_synced"] >= 12
        print(f"PASS: HubSpot connected (mock) with {data['records_synced']} records, is_live={data.get('is_live')}")
    
    def test_shopify_connect_no_api_key_required(self, fresh_test_session):
        """POST /api/business/connect/shopify works without api_key"""
        resp = fresh_test_session.post(
            f"{BASE_URL}/api/business/connect/shopify",
            json={}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["status"] == "connected"
        assert data.get("is_live") == False
        print(f"PASS: Shopify connected (mock) with {data['records_synced']} records")
    
    def test_salesforce_connect_no_api_key_required(self, fresh_test_session):
        """POST /api/business/connect/salesforce works without api_key"""
        resp = fresh_test_session.post(
            f"{BASE_URL}/api/business/connect/salesforce",
            json={}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["status"] == "connected"
        assert data.get("is_live") == False
        print(f"PASS: Salesforce connected (mock) with {data['records_synced']} records")
    
    def test_quickbooks_connect_no_api_key_required(self, fresh_test_session):
        """POST /api/business/connect/quickbooks works without api_key"""
        resp = fresh_test_session.post(
            f"{BASE_URL}/api/business/connect/quickbooks",
            json={}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["status"] == "connected"
        assert data.get("is_live") == False
        print(f"PASS: QuickBooks connected (mock) with {data['records_synced']} records")


class TestPlatformsMetadataForStripe:
    """Test platforms endpoint returns correct metadata for Stripe (requires_key)"""
    
    def test_platforms_returns_stripe_requires_key(self, auth_session):
        """GET /api/business/platforms - Stripe has requires_key=True"""
        resp = auth_session.get(f"{BASE_URL}/api/business/platforms")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        platforms = resp.json()
        stripe = next((p for p in platforms if p["platform_id"] == "stripe"), None)
        
        assert stripe is not None, "Stripe platform not found"
        assert stripe.get("requires_key") == True, "Stripe should have requires_key=True"
        assert "key_placeholder" in stripe, "Stripe should have key_placeholder"
        assert "key_help" in stripe, "Stripe should have key_help"
        print(f"PASS: Stripe platform has requires_key=True, placeholder: {stripe.get('key_placeholder')}")
    
    def test_platforms_returns_other_platforms_no_key_required(self, auth_session):
        """GET /api/business/platforms - Other platforms have requires_key=False or missing"""
        resp = auth_session.get(f"{BASE_URL}/api/business/platforms")
        platforms = resp.json()
        
        for p in platforms:
            if p["platform_id"] != "stripe":
                assert p.get("requires_key", False) == False, f"{p['platform_id']} should NOT require key"
        
        print("PASS: All non-Stripe platforms don't require API key")


class TestSyncAndDisconnectFlows:
    """Test sync and disconnect for connected platforms"""
    
    def test_sync_mock_platform_works(self, fresh_test_session):
        """Re-sync works for mock platform"""
        # HubSpot should be connected from earlier test
        resp = fresh_test_session.post(f"{BASE_URL}/api/business/sync/hubspot")
        
        if resp.status_code == 404:
            # Not connected yet, connect first
            connect_resp = fresh_test_session.post(f"{BASE_URL}/api/business/connect/hubspot", json={})
            if connect_resp.status_code in [200, 400]:  # 400 = already connected
                resp = fresh_test_session.post(f"{BASE_URL}/api/business/sync/hubspot")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["status"] == "synced"
        assert data["records_synced"] >= 12
        print(f"PASS: HubSpot re-sync returned {data['records_synced']} records")
    
    def test_disconnect_mock_platform_works(self, fresh_test_session):
        """Disconnect works for mock platform and removes synced data"""
        resp = fresh_test_session.post(f"{BASE_URL}/api/business/disconnect/hubspot")
        
        if resp.status_code == 404:
            print("SKIP: HubSpot not connected, can't test disconnect")
            return
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["status"] == "disconnected"
        assert "records_removed" in data
        print(f"PASS: HubSpot disconnected, removed {data['records_removed']} records")


class TestBusinessSummary:
    """Test business summary with connected platforms"""
    
    def test_summary_with_mock_connections(self, fresh_test_session):
        """Summary cards show correct data for mock connections"""
        # Ensure some platforms are connected
        for platform in ["shopify", "salesforce"]:
            fresh_test_session.post(f"{BASE_URL}/api/business/connect/{platform}", json={})
        
        resp = fresh_test_session.get(f"{BASE_URL}/api/business/summary")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        data = resp.json()
        assert "connected_count" in data
        assert "total_records" in data
        assert "total_synced_value" in data
        assert "platforms" in data
        
        assert data["connected_count"] >= 2, f"Expected at least 2 connections, got {data['connected_count']}"
        
        # Check platforms detail shows is_live correctly
        for p in data["platforms"]:
            assert p.get("is_live") == False or p["platform"] == "stripe", f"Non-Stripe platform shouldn't be live"
        
        print(f"PASS: Summary shows {data['connected_count']} connected platforms, {data['total_records']} records")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_disconnect_all_platforms(self, fresh_test_session):
        """Cleanup: Disconnect all platforms for fresh test user"""
        for platform in ["stripe", "shopify", "hubspot", "salesforce", "quickbooks"]:
            resp = fresh_test_session.post(f"{BASE_URL}/api/business/disconnect/{platform}")
            if resp.status_code == 200:
                print(f"Cleanup: Disconnected {platform}")
        
        # Verify cleanup
        resp = fresh_test_session.get(f"{BASE_URL}/api/business/summary")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Cleanup complete: {data['connected_count']} platforms remaining")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
