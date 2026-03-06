"""
Test suite for upgraded Pricing Optimizer feature:
- /api/analytics/pricing endpoint (Dashboard data)
- /api/ai/pricing-analysis (Enhanced AI analysis with new fields)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPricingAnalytics:
    """Tests for /api/analytics/pricing endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with test user
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "pricer_test@vector.com",
            "password": "test1234"
        })
        if login_resp.status_code != 200:
            # Try to register
            reg_resp = self.session.post(f"{BASE_URL}/api/auth/register", json={
                "email": "pricer_test@vector.com",
                "password": "test1234",
                "name": "Pricer Test"
            })
            if reg_resp.status_code == 200:
                print("Registered test user")
            else:
                print(f"Registration failed: {reg_resp.text}")
        else:
            print("Logged in successfully")
        
        yield
    
    def test_pricing_analytics_endpoint_requires_auth(self):
        """Test that /api/analytics/pricing requires authentication"""
        # Use new session without auth
        resp = requests.get(f"{BASE_URL}/api/analytics/pricing")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("PASS: Pricing analytics requires authentication")
    
    def test_pricing_analytics_returns_expected_structure(self):
        """Test /api/analytics/pricing returns all expected fields"""
        resp = self.session.get(f"{BASE_URL}/api/analytics/pricing")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        
        # Verify KPI fields
        assert "total_analyses" in data, "Missing total_analyses"
        assert "price_gap" in data, "Missing price_gap (Avg Price Gap)"
        assert "avg_competitor_price" in data, "Missing avg_competitor_price"
        assert "potential_revenue_uplift" in data, "Missing potential_revenue_uplift"
        
        # Verify chart data fields
        assert "margin_data" in data, "Missing margin_data for Margin Analysis chart"
        assert "price_position_data" in data, "Missing price_position_data for Competitor Positioning chart"
        assert "elasticity_data" in data, "Missing elasticity_data for Price Elasticity Simulator"
        
        # Verify segment breakdown and recent analyses
        assert "segment_breakdown" in data, "Missing segment_breakdown"
        assert "recent_analyses" in data, "Missing recent_analyses"
        
        # Verify data types
        assert isinstance(data["total_analyses"], int), "total_analyses should be int"
        assert isinstance(data["margin_data"], list), "margin_data should be list"
        assert isinstance(data["price_position_data"], list), "price_position_data should be list"
        assert isinstance(data["elasticity_data"], list), "elasticity_data should be list"
        assert isinstance(data["segment_breakdown"], list), "segment_breakdown should be list"
        assert isinstance(data["recent_analyses"], list), "recent_analyses should be list"
        
        print(f"PASS: Pricing analytics returned valid structure with {data['total_analyses']} total analyses")
    
    def test_pricing_analytics_kpi_values(self):
        """Test KPI values are numeric"""
        resp = self.session.get(f"{BASE_URL}/api/analytics/pricing")
        assert resp.status_code == 200
        
        data = resp.json()
        
        # All numeric KPIs should be numbers
        assert isinstance(data.get("avg_competitor_price", 0), (int, float)), "avg_competitor_price should be numeric"
        assert isinstance(data.get("avg_optimal_price", 0), (int, float)), "avg_optimal_price should be numeric"
        assert isinstance(data.get("avg_current_price", 0), (int, float)), "avg_current_price should be numeric"
        assert isinstance(data.get("price_gap", 0), (int, float)), "price_gap should be numeric"
        assert isinstance(data.get("potential_revenue_uplift", 0), (int, float)), "potential_revenue_uplift should be numeric"
        
        print("PASS: All KPI values are numeric")


class TestEnhancedPricingAnalysis:
    """Tests for enhanced /api/ai/pricing-analysis endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with Pro user authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with test user
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "pricer_test@vector.com",
            "password": "test1234"
        })
        if login_resp.status_code != 200:
            pytest.skip("Could not authenticate test user")
        
        yield
    
    def test_pricing_analysis_accepts_enhanced_fields(self):
        """Test that /api/ai/pricing-analysis accepts new fields: cost_of_goods, monthly_volume, discount_percentage"""
        # This should work if user is Pro+ tier, or return 403 if free tier
        payload = {
            "product_name": "TEST_Enterprise Plan",
            "current_price": 199.0,
            "competitor_prices": [149.0, 179.0, 229.0],
            "target_margin": 40,
            "market_segment": "mid-market",
            "cost_of_goods": 80.0,
            "monthly_volume": 500,
            "discount_percentage": 10
        }
        
        resp = self.session.post(f"{BASE_URL}/api/ai/pricing-analysis", json=payload)
        
        # Expect either 200 (Pro+ user) or 403 (free user)
        assert resp.status_code in [200, 403], f"Expected 200 or 403, got {resp.status_code}: {resp.text}"
        
        if resp.status_code == 403:
            data = resp.json()
            assert "Upgrade to Pro" in data.get("detail", ""), "Should mention Pro upgrade for free users"
            print("PASS: Free user correctly blocked from AI pricing analysis (403)")
        else:
            # Pro+ user - verify enhanced response
            data = resp.json()
            assert "optimal_price" in data, "Missing optimal_price"
            assert "recommendation" in data, "Missing recommendation (AI strategy)"
            assert "current_margin" in data, "Missing current_margin"
            assert "optimal_margin" in data, "Missing optimal_margin"
            assert "revenue_impact_monthly" in data, "Missing revenue_impact_monthly"
            assert "price_change_pct" in data, "Missing price_change_pct"
            assert "competitor_range" in data, "Missing competitor_range"
            
            # Verify competitor_range structure
            comp_range = data["competitor_range"]
            assert "min" in comp_range, "competitor_range missing min"
            assert "max" in comp_range, "competitor_range missing max"
            assert "avg" in comp_range, "competitor_range missing avg"
            
            print(f"PASS: Enhanced pricing analysis returned optimal price ${data['optimal_price']}")
            print(f"  - Current margin: {data['current_margin']}%")
            print(f"  - Optimal margin: {data['optimal_margin']}%")
            print(f"  - Monthly revenue impact: ${data['revenue_impact_monthly']}")
    
    def test_pricing_analysis_basic_request(self):
        """Test basic pricing analysis without optional fields"""
        payload = {
            "product_name": "TEST_Basic Plan",
            "current_price": 99.0,
            "competitor_prices": [79.0, 109.0],
            "target_margin": 30,
            "market_segment": "startup"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/ai/pricing-analysis", json=payload)
        
        assert resp.status_code in [200, 403], f"Expected 200 or 403, got {resp.status_code}"
        
        if resp.status_code == 200:
            data = resp.json()
            assert "optimal_price" in data
            assert "competitor_average" in data
            print("PASS: Basic pricing analysis works without optional fields")
        else:
            print("PASS: Free user blocked as expected")
    
    def test_pricing_analysis_requires_auth(self):
        """Test that pricing analysis requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/ai/pricing-analysis", json={
            "product_name": "Test",
            "current_price": 100,
            "competitor_prices": [90, 110],
            "target_margin": 30,
            "market_segment": "mid-market"
        })
        
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("PASS: Pricing analysis requires authentication")


class TestPricingAnalysisModel:
    """Test the updated PricingAnalysisRequest model"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "pricer_test@vector.com",
            "password": "test1234"
        })
        yield
    
    def test_optional_fields_are_truly_optional(self):
        """Verify cost_of_goods, monthly_volume, discount_percentage, price_history are optional"""
        # Minimal payload - should not error on missing optional fields
        payload = {
            "product_name": "TEST_Minimal",
            "current_price": 50.0,
            "competitor_prices": [45.0],
            "target_margin": 20,
            "market_segment": "startup"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/ai/pricing-analysis", json=payload)
        
        # Should NOT return 422 (validation error)
        assert resp.status_code != 422, "Should not fail validation without optional fields"
        assert resp.status_code in [200, 403], f"Expected 200 or 403, got {resp.status_code}"
        print("PASS: Optional fields are truly optional (no validation error)")
    
    def test_price_history_field(self):
        """Test price_history field acceptance"""
        payload = {
            "product_name": "TEST_With History",
            "current_price": 150.0,
            "competitor_prices": [140.0, 160.0],
            "target_margin": 35,
            "market_segment": "enterprise",
            "price_history": [
                {"date": "2025-01-01", "price": 120.0, "note": "Launch price"},
                {"date": "2025-06-01", "price": 140.0, "note": "First increase"}
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/ai/pricing-analysis", json=payload)
        
        # Should accept price_history without error
        assert resp.status_code != 422, "Should accept price_history field"
        assert resp.status_code in [200, 403], f"Expected 200 or 403, got {resp.status_code}"
        print("PASS: price_history field accepted")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
