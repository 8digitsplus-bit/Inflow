"""
Test suite for Churn & Retention Analytics endpoint
Tests the enhanced /api/analytics/churn endpoint with all new fields:
- NRR, CLV, ARPA, revenue_at_risk, lost_revenue, recovery_rate
- health_distribution (array with status/count/color)
- risk_by_segment (3 segments: High/Mid/Low Value)
- churn_reasons (reason/count/pct)
- cohorts (extended with month_4, month_5, size)
- at_risk_deals (with engagement_score, days_inactive)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestChurnEndpointAuth:
    """Authentication tests for churn endpoint"""
    
    def test_churn_endpoint_requires_auth(self):
        """Test that /api/analytics/churn requires authentication"""
        response = requests.get(f"{BASE_URL}/api/analytics/churn")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: Churn endpoint requires authentication")


class TestChurnAnalytics:
    """Tests for churn analytics data structure and fields"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session with test user"""
        session = requests.Session()
        # Register/login test user
        register_data = {
            "name": "Churn Test",
            "email": "churntest99@zelta.com",
            "password": "test1234"
        }
        # Try login first
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": register_data["email"],
            "password": register_data["password"]
        })
        if login_response.status_code != 200:
            # Register if login fails
            reg_response = session.post(f"{BASE_URL}/api/auth/register", json=register_data)
            if reg_response.status_code not in [200, 201]:
                pytest.skip(f"Could not authenticate: {reg_response.text}")
        return session
    
    def test_churn_endpoint_returns_200(self, auth_session):
        """Test that authenticated request returns 200"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Churn endpoint returns 200 for authenticated user")
    
    def test_churn_returns_base_metrics(self, auth_session):
        """Test that response contains base churn metrics"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        data = response.json()
        
        # Base metrics
        required_fields = ['churn_rate', 'retention_rate', 'total_customers', 'active_customers', 
                          'at_risk_count', 'churned_count']
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
            print(f"  Found {field}: {data[field]}")
        
        # Validate types
        assert isinstance(data['churn_rate'], (int, float))
        assert isinstance(data['retention_rate'], (int, float))
        print("PASS: Base churn metrics present and valid")
    
    def test_churn_returns_new_kpis(self, auth_session):
        """Test that response contains new KPI fields: nrr, clv, arpa, revenue_at_risk"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        data = response.json()
        
        new_kpis = ['nrr', 'clv', 'arpa', 'revenue_at_risk', 'lost_revenue', 'recovery_rate', 'health_score']
        for kpi in new_kpis:
            assert kpi in data, f"Missing new KPI: {kpi}"
            assert isinstance(data[kpi], (int, float)), f"{kpi} should be numeric"
            print(f"  Found {kpi}: {data[kpi]}")
        
        print("PASS: All new KPIs present (nrr, clv, arpa, revenue_at_risk, etc.)")
    
    def test_health_distribution_structure(self, auth_session):
        """Test health_distribution is array with status/count/color objects"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        data = response.json()
        
        assert 'health_distribution' in data, "Missing health_distribution"
        hd = data['health_distribution']
        assert isinstance(hd, list), "health_distribution should be a list"
        assert len(hd) == 4, f"Expected 4 health categories, got {len(hd)}"
        
        expected_statuses = ['Healthy', 'Moderate', 'At Risk', 'Critical']
        for item in hd:
            assert 'status' in item, "Missing status in health_distribution item"
            assert 'count' in item, "Missing count in health_distribution item"
            assert 'color' in item, "Missing color in health_distribution item"
            assert item['status'] in expected_statuses, f"Unexpected status: {item['status']}"
            assert isinstance(item['count'], int), "count should be int"
            assert item['color'].startswith('#'), "color should be hex"
            print(f"  Health: {item['status']} - count: {item['count']}, color: {item['color']}")
        
        print("PASS: health_distribution has correct structure")
    
    def test_churn_reasons_structure(self, auth_session):
        """Test churn_reasons has reason/count/pct fields"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        data = response.json()
        
        assert 'churn_reasons' in data, "Missing churn_reasons"
        cr = data['churn_reasons']
        assert isinstance(cr, list), "churn_reasons should be a list"
        assert len(cr) >= 3, f"Expected at least 3 churn reasons, got {len(cr)}"
        
        for item in cr:
            assert 'reason' in item, "Missing reason in churn_reasons item"
            assert 'count' in item, "Missing count in churn_reasons item"
            assert 'pct' in item, "Missing pct in churn_reasons item"
            assert isinstance(item['pct'], (int, float)), "pct should be numeric"
            print(f"  Reason: {item['reason']} - {item['pct']}%")
        
        print("PASS: churn_reasons has correct structure")
    
    def test_risk_by_segment_structure(self, auth_session):
        """Test risk_by_segment has 3 segments with segment/total/at_risk"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        data = response.json()
        
        assert 'risk_by_segment' in data, "Missing risk_by_segment"
        rbs = data['risk_by_segment']
        assert isinstance(rbs, list), "risk_by_segment should be a list"
        assert len(rbs) == 3, f"Expected 3 segments, got {len(rbs)}"
        
        expected_segments = ['High Value', 'Mid Value', 'Low Value']
        for item in rbs:
            assert 'segment' in item, "Missing segment"
            assert 'total' in item, "Missing total"
            assert 'at_risk' in item, "Missing at_risk"
            assert item['segment'] in expected_segments, f"Unexpected segment: {item['segment']}"
            print(f"  Segment: {item['segment']} - total: {item['total']}, at_risk: {item['at_risk']}")
        
        print("PASS: risk_by_segment has 3 segments with correct structure")
    
    def test_cohorts_extended_structure(self, auth_session):
        """Test cohorts have extended months (month_4, month_5) and size field"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        data = response.json()
        
        assert 'cohorts' in data, "Missing cohorts"
        cohorts = data['cohorts']
        assert isinstance(cohorts, list), "cohorts should be a list"
        assert len(cohorts) >= 1, "Expected at least 1 cohort"
        
        for cohort in cohorts:
            assert 'cohort' in cohort, "Missing cohort name"
            assert 'size' in cohort, "Missing size field"
            assert 'month_0' in cohort, "Missing month_0"
            assert 'month_1' in cohort, "Missing month_1"
            assert 'month_2' in cohort, "Missing month_2"
            assert 'month_3' in cohort, "Missing month_3"
            # month_4 and month_5 can be null for recent cohorts
            assert 'month_4' in cohort, "Missing month_4 field"
            assert 'month_5' in cohort, "Missing month_5 field"
            print(f"  Cohort: {cohort['cohort']} - size: {cohort['size']}, month_4: {cohort['month_4']}, month_5: {cohort['month_5']}")
        
        print("PASS: cohorts have extended structure with month_4, month_5, size")
    
    def test_at_risk_deals_enhanced(self, auth_session):
        """Test at_risk_deals have engagement_score and days_inactive"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        data = response.json()
        
        assert 'at_risk_deals' in data, "Missing at_risk_deals"
        ard = data['at_risk_deals']
        assert isinstance(ard, list), "at_risk_deals should be a list"
        
        # If there are at-risk deals, check their structure
        if len(ard) > 0:
            for deal in ard:
                assert 'name' in deal, "Missing name"
                assert 'company' in deal, "Missing company"
                assert 'value' in deal, "Missing value"
                assert 'risk_level' in deal, "Missing risk_level"
                assert 'engagement_score' in deal, "Missing engagement_score"
                assert 'days_inactive' in deal, "Missing days_inactive"
                assert deal['risk_level'] in ['critical', 'high', 'medium'], f"Unexpected risk_level: {deal['risk_level']}"
                print(f"  At-risk: {deal['name']} - risk: {deal['risk_level']}, engagement: {deal['engagement_score']}, days_inactive: {deal['days_inactive']}")
        else:
            print("  No at-risk deals found (expected for user with 0 deals)")
        
        print("PASS: at_risk_deals structure verified")
    
    def test_monthly_data_has_nrr_and_revenue_lost(self, auth_session):
        """Test monthly_data includes nrr and revenue_lost fields"""
        response = auth_session.get(f"{BASE_URL}/api/analytics/churn")
        data = response.json()
        
        assert 'monthly_data' in data, "Missing monthly_data"
        md = data['monthly_data']
        assert isinstance(md, list), "monthly_data should be a list"
        assert len(md) >= 1, "Expected at least 1 month of data"
        
        for month in md:
            assert 'month' in month, "Missing month"
            assert 'churn_rate' in month, "Missing churn_rate"
            assert 'retention_rate' in month, "Missing retention_rate"
            assert 'nrr' in month, "Missing nrr in monthly_data"
            assert 'revenue_lost' in month, "Missing revenue_lost in monthly_data"
            print(f"  Month: {month['month']} - nrr: {month['nrr']}, revenue_lost: {month['revenue_lost']}")
        
        print("PASS: monthly_data includes nrr and revenue_lost")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
