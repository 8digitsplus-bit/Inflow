"""
Test cases for Deals CRUD API (/api/deals) and Pipeline feature
Tests deal creation, retrieval, update, delete operations
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDealsAPI:
    """Deals CRUD endpoint tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        sess = requests.Session()
        sess.headers.update({"Content-Type": "application/json"})
        return sess
    
    @pytest.fixture(scope="class")
    def auth_cookies(self, session):
        """Login and get auth cookies"""
        # Login with test user
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test2@test.com",
            "password": "test123"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code} - {login_response.text}")
        
        return login_response.cookies
    
    @pytest.fixture(scope="class")
    def authenticated_session(self, session, auth_cookies):
        """Session with auth cookies"""
        session.cookies.update(auth_cookies)
        return session
    
    # ===================
    # GET /api/deals
    # ===================
    def test_get_deals_requires_auth(self, session):
        """GET /api/deals should require authentication"""
        # Fresh session without auth
        fresh_session = requests.Session()
        response = fresh_session.get(f"{BASE_URL}/api/deals")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ GET /api/deals requires authentication")
    
    def test_get_deals_success(self, authenticated_session):
        """GET /api/deals returns deals list"""
        response = authenticated_session.get(f"{BASE_URL}/api/deals")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/deals returns {len(data)} deals")
    
    # ===================
    # POST /api/deals
    # ===================
    def test_create_deal_requires_auth(self, session):
        """POST /api/deals should require authentication"""
        fresh_session = requests.Session()
        response = fresh_session.post(f"{BASE_URL}/api/deals", json={
            "name": "Test Deal",
            "company": "Test Corp",
            "value": 10000
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ POST /api/deals requires authentication")
    
    def test_create_deal_success(self, authenticated_session):
        """POST /api/deals creates a new deal"""
        deal_data = {
            "name": "TEST_Pipeline_Test_Deal",
            "company": "TEST_Acme Corp",
            "value": 50000,
            "stage": "lead",
            "probability": 25,
            "expected_close_date": "2026-03-01",
            "notes": "Test deal for Pipeline testing"
        }
        
        response = authenticated_session.post(f"{BASE_URL}/api/deals", json=deal_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "deal_id" in data, "Response should include deal_id"
        assert data["name"] == deal_data["name"], "Name should match"
        assert data["company"] == deal_data["company"], "Company should match"
        assert data["value"] == deal_data["value"], "Value should match"
        assert data["stage"] == deal_data["stage"], "Stage should match"
        assert data["probability"] == deal_data["probability"], "Probability should match"
        
        # Store deal_id for later tests
        TestDealsAPI.created_deal_id = data["deal_id"]
        print(f"✓ POST /api/deals created deal: {data['deal_id']}")
    
    def test_created_deal_appears_in_list(self, authenticated_session):
        """Verify created deal appears in GET /api/deals"""
        response = authenticated_session.get(f"{BASE_URL}/api/deals")
        assert response.status_code == 200
        
        deals = response.json()
        deal_ids = [d.get("deal_id") for d in deals]
        assert hasattr(TestDealsAPI, 'created_deal_id'), "No deal was created in previous test"
        assert TestDealsAPI.created_deal_id in deal_ids, "Created deal should appear in list"
        print(f"✓ Created deal {TestDealsAPI.created_deal_id} found in GET /api/deals")
    
    # ===================
    # PUT /api/deals/{deal_id}
    # ===================
    def test_update_deal_success(self, authenticated_session):
        """PUT /api/deals/{deal_id} updates a deal"""
        assert hasattr(TestDealsAPI, 'created_deal_id'), "No deal was created to update"
        
        update_data = {
            "name": "TEST_Updated_Pipeline_Deal",
            "value": 75000,
            "stage": "qualified",
            "probability": 50
        }
        
        response = authenticated_session.put(
            f"{BASE_URL}/api/deals/{TestDealsAPI.created_deal_id}",
            json=update_data
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["name"] == update_data["name"], "Name should be updated"
        assert data["value"] == update_data["value"], "Value should be updated"
        assert data["stage"] == update_data["stage"], "Stage should be updated"
        assert data["probability"] == update_data["probability"], "Probability should be updated"
        print(f"✓ PUT /api/deals/{TestDealsAPI.created_deal_id} updated successfully")
    
    def test_update_deal_persisted(self, authenticated_session):
        """Verify deal update is persisted in database"""
        response = authenticated_session.get(f"{BASE_URL}/api/deals")
        assert response.status_code == 200
        
        deals = response.json()
        updated_deal = next((d for d in deals if d.get("deal_id") == TestDealsAPI.created_deal_id), None)
        
        assert updated_deal is not None, "Updated deal should exist"
        assert updated_deal["name"] == "TEST_Updated_Pipeline_Deal", "Updated name should persist"
        assert updated_deal["value"] == 75000, "Updated value should persist"
        assert updated_deal["stage"] == "qualified", "Updated stage should persist"
        print("✓ Deal update persisted correctly")
    
    def test_update_nonexistent_deal(self, authenticated_session):
        """PUT /api/deals/{nonexistent_id} returns 404"""
        response = authenticated_session.put(
            f"{BASE_URL}/api/deals/nonexistent_deal_12345",
            json={"name": "Updated Name"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ PUT nonexistent deal returns 404")
    
    # ===================
    # DELETE /api/deals/{deal_id}
    # ===================
    def test_delete_deal_success(self, authenticated_session):
        """DELETE /api/deals/{deal_id} deletes a deal"""
        assert hasattr(TestDealsAPI, 'created_deal_id'), "No deal was created to delete"
        
        response = authenticated_session.delete(
            f"{BASE_URL}/api/deals/{TestDealsAPI.created_deal_id}"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ DELETE /api/deals/{TestDealsAPI.created_deal_id} successful")
    
    def test_deleted_deal_not_in_list(self, authenticated_session):
        """Verify deleted deal is removed from database"""
        response = authenticated_session.get(f"{BASE_URL}/api/deals")
        assert response.status_code == 200
        
        deals = response.json()
        deal_ids = [d.get("deal_id") for d in deals]
        assert TestDealsAPI.created_deal_id not in deal_ids, "Deleted deal should not appear in list"
        print(f"✓ Deleted deal {TestDealsAPI.created_deal_id} not in GET /api/deals")
    
    def test_delete_nonexistent_deal(self, authenticated_session):
        """DELETE /api/deals/{nonexistent_id} returns 404"""
        response = authenticated_session.delete(
            f"{BASE_URL}/api/deals/nonexistent_deal_12345"
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ DELETE nonexistent deal returns 404")


class TestDealStageTransitions:
    """Test deal stage transitions via drag-and-drop simulation"""
    
    @pytest.fixture(scope="class")
    def authenticated_session(self):
        """Create authenticated session"""
        sess = requests.Session()
        sess.headers.update({"Content-Type": "application/json"})
        
        login_response = sess.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test2@test.com",
            "password": "test123"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        return sess
    
    def test_stage_transition_lead_to_qualified(self, authenticated_session):
        """Test stage transition: lead -> qualified"""
        # Create a deal in lead stage
        create_response = authenticated_session.post(f"{BASE_URL}/api/deals", json={
            "name": "TEST_Stage_Transition_Deal",
            "company": "TEST_Transition Corp",
            "value": 30000,
            "stage": "lead",
            "probability": 20
        })
        assert create_response.status_code == 200
        deal_id = create_response.json()["deal_id"]
        
        # Update stage to qualified
        update_response = authenticated_session.put(f"{BASE_URL}/api/deals/{deal_id}", json={
            "stage": "qualified"
        })
        assert update_response.status_code == 200
        assert update_response.json()["stage"] == "qualified"
        
        # Clean up
        authenticated_session.delete(f"{BASE_URL}/api/deals/{deal_id}")
        print("✓ Stage transition lead -> qualified works")
    
    def test_all_stage_transitions(self, authenticated_session):
        """Test all valid stage transitions"""
        stages = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]
        
        # Create a test deal
        create_response = authenticated_session.post(f"{BASE_URL}/api/deals", json={
            "name": "TEST_All_Stages_Deal",
            "company": "TEST_All Stages Corp",
            "value": 25000,
            "stage": "lead",
            "probability": 20
        })
        assert create_response.status_code == 200
        deal_id = create_response.json()["deal_id"]
        
        # Test each stage transition
        for stage in stages[1:]:  # Skip lead since we start there
            update_response = authenticated_session.put(f"{BASE_URL}/api/deals/{deal_id}", json={
                "stage": stage
            })
            assert update_response.status_code == 200, f"Failed to transition to {stage}"
            assert update_response.json()["stage"] == stage, f"Stage should be {stage}"
        
        # Clean up
        authenticated_session.delete(f"{BASE_URL}/api/deals/{deal_id}")
        print("✓ All stage transitions work correctly")


class TestAnalyticsIntegration:
    """Test that deals data feeds into analytics endpoints"""
    
    @pytest.fixture(scope="class")
    def authenticated_session(self):
        """Create authenticated session"""
        sess = requests.Session()
        sess.headers.update({"Content-Type": "application/json"})
        
        login_response = sess.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test2@test.com",
            "password": "test123"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        return sess
    
    def test_sales_performance_endpoint(self, authenticated_session):
        """GET /api/analytics/sales-performance returns valid response"""
        response = authenticated_session.get(f"{BASE_URL}/api/analytics/sales-performance")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Check expected fields exist
        assert "win_rate" in data or "avg_deal_value" in data, "Should have analytics data"
        print("✓ GET /api/analytics/sales-performance works")
    
    def test_sales_revenue_endpoint(self, authenticated_session):
        """GET /api/analytics/sales-revenue returns valid response"""
        response = authenticated_session.get(f"{BASE_URL}/api/analytics/sales-revenue")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Check expected fields exist
        assert "total_revenue" in data or "pipeline_value" in data, "Should have revenue data"
        print("✓ GET /api/analytics/sales-revenue works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
