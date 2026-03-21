"""
Test CSV Import and Custom API Integration Features
Tests for:
- POST /api/business/import-csv - CSV import with column mapping
- POST /api/business/custom-api/test - Test external API connection
- POST /api/business/custom-api/connect - Connect and sync from custom API
- GET /api/business/custom-sources - List CSV and custom API connections
- POST /api/business/custom-sources/{id}/sync - Re-sync custom API data
- POST /api/business/custom-sources/{id}/disconnect - Remove custom source
- GET /api/business/detect-platforms - Get detected platforms from imported data
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials
TEST_USER_EMAIL = "csvdemo@test.com"
TEST_USER_PASSWORD = "Test123!"


@pytest.fixture(scope="module")
def session():
    """Create a requests session with cookies"""
    return requests.Session()


@pytest.fixture(scope="module")
def auth_cookies(session):
    """Login and get auth cookies"""
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Login failed: {response.status_code} - {response.text}")
    return session.cookies


class TestCsvImportEndpoint:
    """Tests for POST /api/business/import-csv"""
    
    def test_csv_import_success(self, session, auth_cookies):
        """Test successful CSV import with valid data and mapping"""
        csv_data = [
            {"deal_name": "Enterprise Deal", "company_name": "Acme Corp", "amount": "50000", "status": "qualified"},
            {"deal_name": "SMB Deal", "company_name": "Small Biz Inc", "amount": "5000", "status": "lead"},
            {"deal_name": "Startup Deal", "company_name": "Tech Startup", "amount": "15000", "status": "proposal"},
        ]
        
        payload = {
            "source_name": f"TEST_CSV_Import_{uuid.uuid4().hex[:8]}",
            "mapping": {
                "name": "deal_name",
                "company": "company_name",
                "value": "amount",
                "stage": "status"
            },
            "data": csv_data
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/import-csv",
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert data["status"] == "imported"
        assert data["records_imported"] == 3
        assert "source_name" in data
        assert "detected_platforms" in data
        assert isinstance(data["detected_platforms"], list)
        print(f"CSV Import Success: {data['records_imported']} records imported")
    
    def test_csv_import_with_stripe_patterns(self, session, auth_cookies):
        """Test CSV import with Stripe-like data patterns for platform detection"""
        csv_data = [
            {"deal_name": "Stripe Customer", "company_name": "cus_ABC123", "amount": "1000", "charge_id": "ch_xyz123"},
            {"deal_name": "Stripe Sub", "company_name": "sub_DEF456", "amount": "2000", "stripe_id": "pi_abc789"},
        ]
        
        payload = {
            "source_name": f"TEST_Stripe_Pattern_{uuid.uuid4().hex[:8]}",
            "mapping": {
                "name": "deal_name",
                "company": "company_name",
                "value": "amount"
            },
            "data": csv_data
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/import-csv",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check if Stripe was detected
        detected = data.get("detected_platforms", [])
        stripe_detected = any(d["platform_id"] == "stripe" for d in detected)
        print(f"Stripe pattern detection: {stripe_detected}, detected platforms: {[d['platform_id'] for d in detected]}")
    
    def test_csv_import_empty_data(self, session, auth_cookies):
        """Test CSV import with empty data returns 400"""
        payload = {
            "source_name": "Empty Import",
            "mapping": {"name": "deal_name", "company": "company_name", "value": "amount"},
            "data": []
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/import-csv",
            json=payload
        )
        
        assert response.status_code == 400
        assert "No data provided" in response.json().get("detail", "")
        print("Empty data validation: PASSED")
    
    def test_csv_import_exceeds_limit(self, session, auth_cookies):
        """Test CSV import with >5000 rows returns 400"""
        # Create 5001 rows
        csv_data = [{"deal_name": f"Deal {i}", "company_name": f"Company {i}", "amount": str(i * 100)} for i in range(5001)]
        
        payload = {
            "source_name": "Large Import",
            "mapping": {"name": "deal_name", "company": "company_name", "value": "amount"},
            "data": csv_data
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/import-csv",
            json=payload
        )
        
        assert response.status_code == 400
        assert "5000" in response.json().get("detail", "")
        print("Row limit validation: PASSED")
    
    def test_csv_import_with_stage_mapping(self, session, auth_cookies):
        """Test CSV import with custom stage mapping"""
        csv_data = [
            {"deal_name": "Deal A", "company_name": "Company A", "amount": "10000", "status": "new"},
            {"deal_name": "Deal B", "company_name": "Company B", "amount": "20000", "status": "won"},
        ]
        
        payload = {
            "source_name": f"TEST_Stage_Map_{uuid.uuid4().hex[:8]}",
            "mapping": {
                "name": "deal_name",
                "company": "company_name",
                "value": "amount",
                "stage": "status"
            },
            "stage_mapping": {
                "new": "lead",
                "won": "closed_won"
            },
            "data": csv_data
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/import-csv",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["records_imported"] == 2
        print("Stage mapping: PASSED")


class TestCustomApiTestEndpoint:
    """Tests for POST /api/business/custom-api/test"""
    
    def test_custom_api_test_success(self, session, auth_cookies):
        """Test successful API connection test with JSONPlaceholder"""
        payload = {
            "endpoint": "https://jsonplaceholder.typicode.com/users",
            "method": "GET",
            "auth_type": "none"
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/custom-api/test",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert "fields" in data
        assert len(data["fields"]) > 0
        assert "sample_data" in data
        print(f"API Test Success: Found {len(data['fields'])} fields")
    
    def test_custom_api_test_with_posts(self, session, auth_cookies):
        """Test API connection with posts endpoint"""
        payload = {
            "endpoint": "https://jsonplaceholder.typicode.com/posts",
            "method": "GET",
            "auth_type": "none"
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/custom-api/test",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["success"] == True
        assert "title" in data["fields"] or "userId" in data["fields"]
        print(f"Posts API Test: Fields found - {data['fields'][:5]}")
    
    def test_custom_api_test_invalid_endpoint(self, session, auth_cookies):
        """Test API connection with invalid endpoint"""
        payload = {
            "endpoint": "https://invalid-endpoint-that-does-not-exist.com/api",
            "method": "GET",
            "auth_type": "none"
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/custom-api/test",
            json=payload
        )
        
        assert response.status_code == 200  # Returns 200 with success=false
        data = response.json()
        
        assert data["success"] == False
        assert "error" in data
        print(f"Invalid endpoint test: {data['error']}")
    
    def test_custom_api_test_with_bearer_auth(self, session, auth_cookies):
        """Test API connection with bearer token auth type"""
        payload = {
            "endpoint": "https://jsonplaceholder.typicode.com/users",
            "method": "GET",
            "auth_type": "bearer",
            "api_key": "test_token_123"
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/custom-api/test",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        # JSONPlaceholder doesn't require auth, so it should still work
        assert data["success"] == True
        print("Bearer auth test: PASSED")


class TestCustomApiConnectEndpoint:
    """Tests for POST /api/business/custom-api/connect"""
    
    def test_custom_api_connect_success(self, session, auth_cookies):
        """Test successful custom API connection"""
        payload = {
            "name": f"TEST_JSONPlaceholder_{uuid.uuid4().hex[:8]}",
            "endpoint": "https://jsonplaceholder.typicode.com/users",
            "method": "GET",
            "auth_type": "none",
            "mapping": {
                "name": "name",
                "company": "company.name",
                "value": "id"  # Using id as value for testing
            }
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/custom-api/connect",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "connected"
        assert "connection_id" in data
        assert "records_synced" in data
        assert data["records_synced"] > 0
        print(f"Custom API Connect: {data['records_synced']} records synced, connection_id: {data['connection_id']}")
        
        # Store connection_id for later tests
        return data["connection_id"]
    
    def test_custom_api_connect_with_data_path(self, session, auth_cookies):
        """Test custom API connection with data path"""
        payload = {
            "name": f"TEST_Posts_API_{uuid.uuid4().hex[:8]}",
            "endpoint": "https://jsonplaceholder.typicode.com/posts",
            "method": "GET",
            "auth_type": "none",
            "data_path": None,  # Posts endpoint returns array directly
            "mapping": {
                "name": "title",
                "company": "userId",
                "value": "id"
            }
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/custom-api/connect",
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "connected"
        print(f"Posts API Connect: {data['records_synced']} records synced")
    
    def test_custom_api_connect_invalid_endpoint(self, session, auth_cookies):
        """Test custom API connection with invalid endpoint returns 400"""
        payload = {
            "name": "Invalid API",
            "endpoint": "https://invalid-endpoint-xyz.com/api",
            "method": "GET",
            "auth_type": "none",
            "mapping": {
                "name": "name",
                "company": "company",
                "value": "value"
            }
        }
        
        response = session.post(
            f"{BASE_URL}/api/business/custom-api/connect",
            json=payload
        )
        
        assert response.status_code == 400
        assert "Failed to fetch" in response.json().get("detail", "")
        print("Invalid endpoint connect: PASSED (returns 400)")


class TestCustomSourcesEndpoint:
    """Tests for GET /api/business/custom-sources"""
    
    def test_get_custom_sources(self, session, auth_cookies):
        """Test getting list of custom sources"""
        response = session.get(f"{BASE_URL}/api/business/custom-sources")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        
        # Check structure of each source
        for source in data:
            assert "connection_id" in source
            assert "platform" in source
            assert source["platform"] in ["csv_import", "custom_api"]
            assert "source_name" in source
            assert "records_synced" in source
            assert "can_sync" in source
        
        csv_count = len([s for s in data if s["platform"] == "csv_import"])
        api_count = len([s for s in data if s["platform"] == "custom_api"])
        print(f"Custom Sources: {len(data)} total ({csv_count} CSV, {api_count} API)")


class TestCustomSourceSyncEndpoint:
    """Tests for POST /api/business/custom-sources/{id}/sync"""
    
    def test_sync_custom_api_source(self, session, auth_cookies):
        """Test re-syncing a custom API source"""
        # First get custom sources
        sources_response = session.get(f"{BASE_URL}/api/business/custom-sources")
        sources = sources_response.json()
        
        # Find a custom_api source (can_sync=True)
        api_sources = [s for s in sources if s["platform"] == "custom_api" and s["can_sync"]]
        
        if not api_sources:
            pytest.skip("No custom API sources available to sync")
        
        source = api_sources[0]
        connection_id = source["connection_id"]
        
        response = session.post(f"{BASE_URL}/api/business/custom-sources/{connection_id}/sync")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "synced"
        assert "records_synced" in data
        print(f"Sync Success: {data['records_synced']} records synced")
    
    def test_sync_csv_source_not_allowed(self, session, auth_cookies):
        """Test that CSV sources cannot be synced (returns 404)"""
        # First get custom sources
        sources_response = session.get(f"{BASE_URL}/api/business/custom-sources")
        sources = sources_response.json()
        
        # Find a csv_import source
        csv_sources = [s for s in sources if s["platform"] == "csv_import"]
        
        if not csv_sources:
            pytest.skip("No CSV sources available to test")
        
        source = csv_sources[0]
        connection_id = source["connection_id"]
        
        response = session.post(f"{BASE_URL}/api/business/custom-sources/{connection_id}/sync")
        
        # CSV sources should return 404 since they're not custom_api
        assert response.status_code == 404
        print("CSV sync blocked: PASSED (returns 404)")
    
    def test_sync_nonexistent_source(self, session, auth_cookies):
        """Test syncing non-existent source returns 404"""
        response = session.post(f"{BASE_URL}/api/business/custom-sources/conn_nonexistent123/sync")
        
        assert response.status_code == 404
        print("Non-existent source sync: PASSED (returns 404)")


class TestCustomSourceDisconnectEndpoint:
    """Tests for POST /api/business/custom-sources/{id}/disconnect"""
    
    def test_disconnect_custom_source(self, session, auth_cookies):
        """Test disconnecting a custom source"""
        # First create a new source to disconnect
        csv_data = [
            {"deal_name": "Test Deal", "company_name": "Test Co", "amount": "1000"},
        ]
        
        source_name = f"TEST_Disconnect_{uuid.uuid4().hex[:8]}"
        import_response = session.post(
            f"{BASE_URL}/api/business/import-csv",
            json={
                "source_name": source_name,
                "mapping": {"name": "deal_name", "company": "company_name", "value": "amount"},
                "data": csv_data
            }
        )
        
        assert import_response.status_code == 200
        
        # Get the connection_id
        sources_response = session.get(f"{BASE_URL}/api/business/custom-sources")
        sources = sources_response.json()
        
        source = next((s for s in sources if s["source_name"] == source_name), None)
        assert source is not None, "Created source not found"
        
        connection_id = source["connection_id"]
        
        # Disconnect
        response = session.post(f"{BASE_URL}/api/business/custom-sources/{connection_id}/disconnect")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "disconnected"
        assert "records_removed" in data
        print(f"Disconnect Success: {data['records_removed']} records removed")
    
    def test_disconnect_nonexistent_source(self, session, auth_cookies):
        """Test disconnecting non-existent source returns 404"""
        response = session.post(f"{BASE_URL}/api/business/custom-sources/conn_nonexistent456/disconnect")
        
        assert response.status_code == 404
        print("Non-existent source disconnect: PASSED (returns 404)")


class TestDetectPlatformsEndpoint:
    """Tests for GET /api/business/detect-platforms"""
    
    def test_get_detected_platforms(self, session, auth_cookies):
        """Test getting detected platforms from imported data"""
        response = session.get(f"{BASE_URL}/api/business/detect-platforms")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "detected_platforms" in data
        assert isinstance(data["detected_platforms"], list)
        
        # Check structure of detected platforms
        for platform in data["detected_platforms"]:
            assert "platform_id" in platform
            assert "confidence" in platform
            assert "reasons" in platform
            assert 0 <= platform["confidence"] <= 1
        
        print(f"Detected Platforms: {[p['platform_id'] for p in data['detected_platforms']]}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_sources(self, session, auth_cookies):
        """Clean up TEST_ prefixed sources"""
        sources_response = session.get(f"{BASE_URL}/api/business/custom-sources")
        sources = sources_response.json()
        
        test_sources = [s for s in sources if s["source_name"].startswith("TEST_")]
        
        for source in test_sources:
            response = session.post(f"{BASE_URL}/api/business/custom-sources/{source['connection_id']}/disconnect")
            if response.status_code == 200:
                print(f"Cleaned up: {source['source_name']}")
        
        print(f"Cleanup complete: {len(test_sources)} test sources removed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
