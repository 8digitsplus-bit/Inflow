"""
Test Suite for Pricing Updates and New Features
- Updated pricing: Essential $59/$599, Pro $149/$1490, Enterprise $249/$2490
- New endpoints: /analytics/sales-performance, /analytics/sales-revenue, /analytics/revenue-intelligence
- Pro tier should NOT have 'AI pricing insights'
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


class TestSubscriptionPlans:
    """Test updated subscription plan pricing"""

    def test_get_subscription_plans_endpoint(self):
        """Test /api/subscription/plans returns all plans"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 6  # 3 plans * 2 periods
        print("PASS: /api/subscription/plans returns 6 plans")

    # Monthly pricing tests
    def test_essential_monthly_price(self):
        """Essential monthly should be $59"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("essential_monthly")
        assert plan is not None, "essential_monthly plan not found"
        assert plan["price"] == 59.0, f"Expected $59, got ${plan['price']}"
        print(f"PASS: Essential monthly price is ${plan['price']}")

    def test_pro_monthly_price(self):
        """Pro monthly should be $149"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("pro_monthly")
        assert plan is not None, "pro_monthly plan not found"
        assert plan["price"] == 149.0, f"Expected $149, got ${plan['price']}"
        print(f"PASS: Pro monthly price is ${plan['price']}")

    def test_enterprise_monthly_price(self):
        """Enterprise monthly should be $249"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("enterprise_monthly")
        assert plan is not None, "enterprise_monthly plan not found"
        assert plan["price"] == 249.0, f"Expected $249, got ${plan['price']}"
        print(f"PASS: Enterprise monthly price is ${plan['price']}")

    # Yearly pricing tests
    def test_essential_yearly_price(self):
        """Essential yearly should be $599"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("essential_yearly")
        assert plan is not None, "essential_yearly plan not found"
        assert plan["price"] == 599.0, f"Expected $599, got ${plan['price']}"
        print(f"PASS: Essential yearly price is ${plan['price']}")

    def test_pro_yearly_price(self):
        """Pro yearly should be $1490"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("pro_yearly")
        assert plan is not None, "pro_yearly plan not found"
        assert plan["price"] == 1490.0, f"Expected $1490, got ${plan['price']}"
        print(f"PASS: Pro yearly price is ${plan['price']}")

    def test_enterprise_yearly_price(self):
        """Enterprise yearly should be $2490"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("enterprise_yearly")
        assert plan is not None, "enterprise_yearly plan not found"
        assert plan["price"] == 2490.0, f"Expected $2490, got ${plan['price']}"
        print(f"PASS: Enterprise yearly price is ${plan['price']}")

    # Usage limits tests
    def test_essential_monthly_usages(self):
        """Essential monthly should have 1500 usages"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("essential_monthly")
        assert plan["deal_limit"] == 1500, f"Expected 1500, got {plan['deal_limit']}"
        print(f"PASS: Essential monthly has {plan['deal_limit']} usages")

    def test_pro_monthly_usages(self):
        """Pro monthly should have 7500 usages"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("pro_monthly")
        assert plan["deal_limit"] == 7500, f"Expected 7500, got {plan['deal_limit']}"
        print(f"PASS: Pro monthly has {plan['deal_limit']} usages")

    def test_enterprise_monthly_usages(self):
        """Enterprise monthly should have 20000 usages"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("enterprise_monthly")
        assert plan["deal_limit"] == 20000, f"Expected 20000, got {plan['deal_limit']}"
        print(f"PASS: Enterprise monthly has {plan['deal_limit']} usages")

    # Feature tests
    def test_essential_has_sales_pipeline(self):
        """Essential should include Sales Pipeline feature"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("essential_monthly")
        assert "Sales Pipeline" in plan["features"], "Sales Pipeline not in Essential features"
        print("PASS: Essential includes Sales Pipeline")

    def test_pro_has_sales_performance(self):
        """Pro should include Sales Performance feature"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("pro_monthly")
        assert "Sales Performance" in plan["features"], "Sales Performance not in Pro features"
        print("PASS: Pro includes Sales Performance")

    def test_enterprise_has_sales_revenue(self):
        """Enterprise should include Sales Revenue feature"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("enterprise_monthly")
        assert "Sales Revenue" in plan["features"], "Sales Revenue not in Enterprise features"
        print("PASS: Enterprise includes Sales Revenue")

    def test_enterprise_has_revenue_intelligence(self):
        """Enterprise should include Revenue Intelligence feature"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("enterprise_monthly")
        assert "Revenue Intelligence" in plan["features"], "Revenue Intelligence not in Enterprise features"
        print("PASS: Enterprise includes Revenue Intelligence")

    def test_pro_does_not_have_ai_pricing_insights(self):
        """Pro should NOT have 'AI pricing insights' feature"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plan = data.get("pro_monthly")
        features_lower = [f.lower() for f in plan["features"]]
        assert not any("ai pricing" in f for f in features_lower), "Pro should not have AI pricing insights"
        print("PASS: Pro does NOT have AI pricing insights")


class TestNewAnalyticsEndpoints:
    """Test new analytics endpoints"""

    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Register and login a test user"""
        import time
        timestamp = int(time.time())
        self.test_email = f"TEST_pricing_{timestamp}@test.com"
        self.test_password = "TestPassword123!"
        
        # Register
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": self.test_email,
            "password": self.test_password,
            "name": "Test User"
        })
        
        if reg_response.status_code not in [200, 201, 400]:  # 400 means already exists
            pytest.skip(f"Registration failed: {reg_response.status_code}")
        
        # Login
        self.session = requests.Session()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.test_email,
            "password": self.test_password
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        yield
        
        # Cleanup not required as test data has TEST_ prefix

    def test_sales_performance_endpoint(self):
        """Test /api/analytics/sales-performance returns valid data"""
        response = self.session.get(f"{BASE_URL}/api/analytics/sales-performance")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check required fields
        assert "win_rate" in data, "Missing win_rate"
        assert "avg_deal_value" in data, "Missing avg_deal_value"
        assert "avg_cycle_days" in data, "Missing avg_cycle_days"
        assert "deal_velocity" in data, "Missing deal_velocity"
        assert "monthly_performance" in data, "Missing monthly_performance"
        assert "stage_velocity" in data, "Missing stage_velocity"
        assert "top_deals" in data, "Missing top_deals"
        print(f"PASS: /api/analytics/sales-performance returns data with win_rate={data['win_rate']}%")

    def test_sales_revenue_endpoint(self):
        """Test /api/analytics/sales-revenue returns valid data"""
        response = self.session.get(f"{BASE_URL}/api/analytics/sales-revenue")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check required fields
        assert "total_revenue" in data, "Missing total_revenue"
        assert "mrr" in data, "Missing mrr"
        assert "arr" in data, "Missing arr"
        assert "pipeline_value" in data, "Missing pipeline_value"
        assert "avg_deal_size" in data, "Missing avg_deal_size"
        assert "monthly_revenue" in data, "Missing monthly_revenue"
        assert "revenue_by_stage" in data, "Missing revenue_by_stage"
        assert "top_accounts" in data, "Missing top_accounts"
        print(f"PASS: /api/analytics/sales-revenue returns data with MRR={data['mrr']}")

    def test_revenue_intelligence_endpoint(self):
        """Test /api/analytics/revenue-intelligence returns valid data with recommendations"""
        response = self.session.get(f"{BASE_URL}/api/analytics/revenue-intelligence")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check required fields for unified overview
        assert "total_revenue" in data, "Missing total_revenue"
        assert "pipeline_value" in data, "Missing pipeline_value"
        assert "weighted_pipeline" in data, "Missing weighted_pipeline"
        assert "win_rate" in data, "Missing win_rate"
        assert "pipeline_health" in data, "Missing pipeline_health"
        assert "performance_trend" in data, "Missing performance_trend"
        assert "monthly_overview" in data, "Missing monthly_overview"
        assert "stage_health" in data, "Missing stage_health"
        assert "recommendations" in data, "Missing recommendations"
        
        # Recommendations should have specific structure
        if len(data["recommendations"]) > 0:
            rec = data["recommendations"][0]
            assert "type" in rec, "Recommendation missing type"
            assert "priority" in rec, "Recommendation missing priority"
            assert "title" in rec, "Recommendation missing title"
            assert "description" in rec, "Recommendation missing description"
            assert "action" in rec, "Recommendation missing action"
        
        print(f"PASS: /api/analytics/revenue-intelligence returns data with {len(data['recommendations'])} recommendations")

    def test_revenue_intelligence_pipeline_health_values(self):
        """Test pipeline_health returns valid values"""
        response = self.session.get(f"{BASE_URL}/api/analytics/revenue-intelligence")
        data = response.json()
        assert data["pipeline_health"] in ["strong", "moderate", "weak"], f"Invalid pipeline_health: {data['pipeline_health']}"
        print(f"PASS: pipeline_health={data['pipeline_health']} (valid)")

    def test_revenue_intelligence_performance_trend_values(self):
        """Test performance_trend returns valid values"""
        response = self.session.get(f"{BASE_URL}/api/analytics/revenue-intelligence")
        data = response.json()
        assert data["performance_trend"] in ["improving", "stable", "declining"], f"Invalid performance_trend: {data['performance_trend']}"
        print(f"PASS: performance_trend={data['performance_trend']} (valid)")


class TestUnauthenticatedEndpoints:
    """Test endpoints require authentication"""

    def test_sales_performance_requires_auth(self):
        """Sales performance should require authentication"""
        response = requests.get(f"{BASE_URL}/api/analytics/sales-performance")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: /api/analytics/sales-performance requires auth")

    def test_sales_revenue_requires_auth(self):
        """Sales revenue should require authentication"""
        response = requests.get(f"{BASE_URL}/api/analytics/sales-revenue")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: /api/analytics/sales-revenue requires auth")

    def test_revenue_intelligence_requires_auth(self):
        """Revenue intelligence should require authentication"""
        response = requests.get(f"{BASE_URL}/api/analytics/revenue-intelligence")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: /api/analytics/revenue-intelligence requires auth")
