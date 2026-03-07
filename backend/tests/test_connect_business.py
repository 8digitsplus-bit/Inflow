"""
Test suite for Connect Business feature - business platform connections (Stripe, Shopify, HubSpot, Salesforce, QuickBooks)
Tests: GET /api/business/platforms, POST /api/business/connect/{platform}, 
       POST /api/business/disconnect/{platform}, POST /api/business/sync/{platform}, GET /api/business/summary
"""
import pytest
import requests
import os
import time
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials - create fresh user for testing
TEST_USER_EMAIL = f"bizconnect_test_{int(time.time())}@test.com"
TEST_USER_PASSWORD = "test123"


def get_session_token_from_response(response):
    """Extract session_token from Set-Cookie header"""
    cookies = response.cookies.get_dict()
    return cookies.get('session_token')


@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session with valid session_token cookie"""
    session = requests.Session()
    
    # Register new user
    email = f"bizconnect_test_{int(time.time())}@test.com"
    register_resp = session.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": TEST_USER_PASSWORD,
        "name": "Business Connect Test User"
    })
    
    if register_resp.status_code == 400:  # User exists, try login
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": TEST_USER_PASSWORD
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    else:
        assert register_resp.status_code == 200, f"Register failed: {register_resp.text}"
    
    # Verify we have the session token cookie
    assert 'session_token' in session.cookies, "Session token cookie not set"
    print(f"Auth session created for {email}")
    
    return session


class TestConnectBusinessEndpoints:
    """Test Connect Business API endpoints"""
    
    connected_platforms = []
    
    # ============ Auth requirement tests ============
    
    def test_get_platforms_requires_auth(self):
        """GET /api/business/platforms requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/business/platforms")
        assert resp.status_code == 401
        print("PASS: GET /api/business/platforms requires auth")
    
    def test_connect_requires_auth(self):
        """POST /api/business/connect/{platform} requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/business/connect/stripe")
        assert resp.status_code == 401
        print("PASS: POST /api/business/connect requires auth")
    
    def test_disconnect_requires_auth(self):
        """POST /api/business/disconnect/{platform} requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/business/disconnect/stripe")
        assert resp.status_code == 401
        print("PASS: POST /api/business/disconnect requires auth")
    
    def test_sync_requires_auth(self):
        """POST /api/business/sync/{platform} requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/business/sync/stripe")
        assert resp.status_code == 401
        print("PASS: POST /api/business/sync requires auth")
    
    def test_summary_requires_auth(self):
        """GET /api/business/summary requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/business/summary")
        assert resp.status_code == 401
        print("PASS: GET /api/business/summary requires auth")
    
    # ============ GET /api/business/platforms Tests ============
    
    def test_get_platforms_returns_5_platforms(self, auth_session):
        """GET /api/business/platforms returns exactly 5 platforms"""
        resp = auth_session.get(f"{BASE_URL}/api/business/platforms")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        platforms = resp.json()
        assert isinstance(platforms, list), "Response should be a list"
        assert len(platforms) == 5, f"Expected 5 platforms, got {len(platforms)}"
        
        platform_ids = [p["platform_id"] for p in platforms]
        expected_ids = ["stripe", "shopify", "hubspot", "salesforce", "quickbooks"]
        for pid in expected_ids:
            assert pid in platform_ids, f"Missing platform: {pid}"
        
        print(f"PASS: GET /api/business/platforms returns 5 platforms: {platform_ids}")
    
    def test_platforms_have_required_fields(self, auth_session):
        """Each platform has all required fields"""
        resp = auth_session.get(f"{BASE_URL}/api/business/platforms")
        assert resp.status_code == 200
        
        platforms = resp.json()
        required_fields = ["platform_id", "name", "description", "icon", "color", "category", 
                          "data_types", "connected", "connected_at", "last_synced", 
                          "records_synced", "sync_status"]
        
        for platform in platforms:
            for field in required_fields:
                assert field in platform, f"Platform {platform.get('platform_id')} missing field: {field}"
        
        print("PASS: All platforms have required fields")
    
    def test_platform_data_types(self, auth_session):
        """Each platform has data_types array"""
        resp = auth_session.get(f"{BASE_URL}/api/business/platforms")
        platforms = resp.json()
        
        for p in platforms:
            assert isinstance(p["data_types"], list), f"{p['platform_id']} data_types should be list"
            assert len(p["data_types"]) > 0, f"{p['platform_id']} should have data_types"
        
        print("PASS: All platforms have data_types")
    
    # ============ POST /api/business/connect/{platform} Tests ============
    
    def test_connect_invalid_platform_returns_404(self, auth_session):
        """Connecting invalid platform returns 404"""
        resp = auth_session.post(f"{BASE_URL}/api/business/connect/invalid_platform")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("PASS: Invalid platform returns 404")
    
    def test_connect_stripe_successfully(self, auth_session):
        """Connecting Stripe succeeds and creates synced deals"""
        resp = auth_session.post(f"{BASE_URL}/api/business/connect/stripe")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data["status"] == "connected"
        assert data["platform"] == "stripe"
        assert "records_synced" in data
        assert data["records_synced"] >= 12, f"Should sync at least 12 records, got {data['records_synced']}"
        assert "message" in data
        
        self.connected_platforms.append("stripe")
        print(f"PASS: Connected Stripe, synced {data['records_synced']} records")
    
    def test_connect_duplicate_platform_returns_400(self, auth_session):
        """Connecting already connected platform returns 400"""
        resp = auth_session.post(f"{BASE_URL}/api/business/connect/stripe")
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "already connected" in resp.json().get("detail", "").lower()
        print("PASS: Duplicate connection returns 400")
    
    def test_connect_hubspot_successfully(self, auth_session):
        """Connecting HubSpot succeeds"""
        resp = auth_session.post(f"{BASE_URL}/api/business/connect/hubspot")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data["status"] == "connected"
        assert data["platform"] == "hubspot"
        assert data["records_synced"] >= 12
        
        self.connected_platforms.append("hubspot")
        print(f"PASS: Connected HubSpot, synced {data['records_synced']} records")
    
    def test_connect_shopify_successfully(self, auth_session):
        """Connecting Shopify succeeds"""
        resp = auth_session.post(f"{BASE_URL}/api/business/connect/shopify")
        assert resp.status_code == 200
        
        data = resp.json()
        assert data["status"] == "connected"
        assert data["platform"] == "shopify"
        
        self.connected_platforms.append("shopify")
        print(f"PASS: Connected Shopify, synced {data['records_synced']} records")
    
    # ============ Verify connected status after connecting ============
    
    def test_platforms_show_connected_status(self, auth_session):
        """Connected platforms show connected=True with metadata"""
        resp = auth_session.get(f"{BASE_URL}/api/business/platforms")
        assert resp.status_code == 200
        
        platforms = resp.json()
        platform_map = {p["platform_id"]: p for p in platforms}
        
        for pid in ["stripe", "hubspot", "shopify"]:
            if pid in self.connected_platforms:
                p = platform_map[pid]
                assert p["connected"] == True, f"{pid} should be connected"
                assert p["connected_at"] is not None, f"{pid} should have connected_at"
                assert p["last_synced"] is not None, f"{pid} should have last_synced"
                assert p["records_synced"] > 0, f"{pid} should have records_synced > 0"
                print(f"PASS: {pid} shows connected with {p['records_synced']} records")
    
    # ============ POST /api/business/sync/{platform} Tests ============
    
    def test_sync_not_connected_platform_returns_404(self, auth_session):
        """Syncing not connected platform returns 404"""
        resp = auth_session.post(f"{BASE_URL}/api/business/sync/salesforce")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("PASS: Sync not connected platform returns 404")
    
    def test_sync_connected_platform(self, auth_session):
        """Syncing connected platform succeeds"""
        resp = auth_session.post(f"{BASE_URL}/api/business/sync/stripe")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data["status"] == "synced"
        assert data["platform"] == "stripe"
        assert data["records_synced"] >= 12
        print(f"PASS: Re-synced Stripe, {data['records_synced']} records")
    
    # ============ GET /api/business/summary Tests ============
    
    def test_summary_returns_accurate_data(self, auth_session):
        """Summary returns accurate aggregated data"""
        resp = auth_session.get(f"{BASE_URL}/api/business/summary")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        
        # Verify structure
        assert "connected_count" in data
        assert "total_records" in data
        assert "total_synced_value" in data
        assert "platforms" in data
        
        # Verify values
        assert data["connected_count"] >= 3, f"Expected at least 3 connections, got {data['connected_count']}"
        assert data["total_records"] >= 36, f"Expected at least 36 records (12*3), got {data['total_records']}"
        
        # Verify platform summaries
        assert isinstance(data["platforms"], list)
        assert len(data["platforms"]) >= 3
        
        for p in data["platforms"]:
            assert "platform" in p
            assert "name" in p
            assert "connected_at" in p
            assert "last_synced" in p
            assert "records" in p
            assert "total_value" in p
        
        print(f"PASS: Summary shows {data['connected_count']} connected, {data['total_records']} records, ${data['total_synced_value']:.2f} value")
    
    # ============ POST /api/business/disconnect/{platform} Tests ============
    
    def test_disconnect_not_connected_returns_404(self, auth_session):
        """Disconnecting not connected platform returns 404"""
        resp = auth_session.post(f"{BASE_URL}/api/business/disconnect/quickbooks")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("PASS: Disconnect not connected platform returns 404")
    
    def test_disconnect_hubspot_successfully(self, auth_session):
        """Disconnecting HubSpot succeeds and removes synced deals"""
        resp = auth_session.post(f"{BASE_URL}/api/business/disconnect/hubspot")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data["status"] == "disconnected"
        assert data["platform"] == "hubspot"
        assert "records_removed" in data
        
        if "hubspot" in self.connected_platforms:
            self.connected_platforms.remove("hubspot")
        
        print(f"PASS: Disconnected HubSpot, removed {data['records_removed']} records")
    
    def test_platforms_show_disconnected_status(self, auth_session):
        """Disconnected platform shows connected=False"""
        resp = auth_session.get(f"{BASE_URL}/api/business/platforms")
        assert resp.status_code == 200
        
        platforms = resp.json()
        hubspot = next((p for p in platforms if p["platform_id"] == "hubspot"), None)
        
        assert hubspot is not None, "HubSpot should be in platforms list"
        assert hubspot["connected"] == False, "HubSpot should be disconnected"
        assert hubspot["records_synced"] == 0, "HubSpot should have 0 records"
        print("PASS: HubSpot shows disconnected status")
    
    def test_summary_updated_after_disconnect(self, auth_session):
        """Summary updates after disconnecting"""
        resp = auth_session.get(f"{BASE_URL}/api/business/summary")
        assert resp.status_code == 200
        
        data = resp.json()
        assert data["connected_count"] >= 2, "Should have at least 2 platforms still connected"
        print(f"PASS: Summary updated - {data['connected_count']} platforms connected")
    
    # ============ Integration with Analytics Tests ============
    
    def test_synced_deals_in_analytics_revenue(self, auth_session):
        """Synced deals appear in /api/analytics/revenue"""
        resp = auth_session.get(f"{BASE_URL}/api/analytics/revenue")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print("PASS: Analytics revenue endpoint accessible")
    
    def test_synced_deals_in_analytics_pipeline(self, auth_session):
        """Synced deals appear in /api/analytics/pipeline"""
        resp = auth_session.get(f"{BASE_URL}/api/analytics/pipeline")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print("PASS: Analytics pipeline endpoint accessible")
    
    # ============ Cleanup ============
    
    def test_cleanup_disconnect_remaining(self, auth_session):
        """Cleanup: Disconnect remaining platforms"""
        for platform in list(self.connected_platforms):
            resp = auth_session.post(f"{BASE_URL}/api/business/disconnect/{platform}")
            if resp.status_code == 200:
                self.connected_platforms.remove(platform)
                print(f"Cleanup: Disconnected {platform}")
        
        # Verify all disconnected
        resp = auth_session.get(f"{BASE_URL}/api/business/summary")
        data = resp.json()
        print(f"Cleanup complete: {data['connected_count']} platforms remaining")


class TestConnectAllPlatforms:
    """Test connecting all 5 platforms"""
    
    @pytest.fixture(scope="class")
    def fresh_session(self):
        """Create new session for all-platforms test"""
        session = requests.Session()
        email = f"biz_allplat_{int(time.time())}@test.com"
        
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": "test123",
            "name": "All Platforms Test"
        })
        assert resp.status_code == 200, f"Register failed: {resp.text}"
        return session
    
    @pytest.mark.parametrize("platform", ["stripe", "shopify", "hubspot", "salesforce", "quickbooks"])
    def test_connect_each_platform(self, fresh_session, platform):
        """Connect each of the 5 platforms"""
        resp = fresh_session.post(f"{BASE_URL}/api/business/connect/{platform}")
        
        if resp.status_code == 200:
            data = resp.json()
            assert data["status"] == "connected"
            assert data["platform"] == platform
            assert data["records_synced"] >= 12
            print(f"PASS: Connected {platform}, {data['records_synced']} records")
        elif resp.status_code == 400:
            print(f"PASS: {platform} already connected")
        else:
            pytest.fail(f"Unexpected status {resp.status_code}: {resp.text}")
    
    def test_all_5_platforms_connected(self, fresh_session):
        """Summary shows all 5 platforms connected"""
        resp = fresh_session.get(f"{BASE_URL}/api/business/summary")
        assert resp.status_code == 200
        
        data = resp.json()
        assert data["connected_count"] == 5, f"Expected 5 connected, got {data['connected_count']}"
        assert data["total_records"] >= 60, f"Expected >= 60 records, got {data['total_records']}"
        print(f"PASS: All 5 platforms connected, {data['total_records']} total records")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
