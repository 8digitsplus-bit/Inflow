"""
Test Revenue Forecasting API endpoint
Tests: GET /api/analytics/forecasting
Features: weighted pipeline, velocity, scenarios (best/expected/worst), monthly_forecast, stage_forecast, top_deals
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestForecastingAPI:
    """Test the forecasting analytics endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session for authenticated requests"""
        self.session = requests.Session()
        # Login with test user
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "csvdemo@test.com", "password": "Test123!"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
        yield
        self.session.close()
    
    def test_forecasting_endpoint_returns_200(self):
        """Test that forecasting endpoint returns 200 for authenticated user"""
        response = self.session.get(f"{BASE_URL}/api/analytics/forecasting")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Forecasting endpoint returns 200")
    
    def test_forecasting_returns_weighted_pipeline(self):
        """Test that response contains weighted_pipeline field"""
        response = self.session.get(f"{BASE_URL}/api/analytics/forecasting")
        assert response.status_code == 200
        data = response.json()
        
        assert "weighted_pipeline" in data, "Missing weighted_pipeline field"
        assert isinstance(data["weighted_pipeline"], (int, float)), "weighted_pipeline should be numeric"
        print(f"PASS: weighted_pipeline = {data['weighted_pipeline']}")
    
    def test_forecasting_returns_velocity(self):
        """Test that response contains velocity object with required fields"""
        response = self.session.get(f"{BASE_URL}/api/analytics/forecasting")
        assert response.status_code == 200
        data = response.json()
        
        assert "velocity" in data, "Missing velocity field"
        velocity = data["velocity"]
        
        required_velocity_fields = ["value_per_day", "avg_deal_size", "win_rate", "avg_cycle_days", "open_deals"]
        for field in required_velocity_fields:
            assert field in velocity, f"Missing velocity.{field}"
        
        assert isinstance(velocity["value_per_day"], (int, float)), "value_per_day should be numeric"
        assert isinstance(velocity["avg_deal_size"], (int, float)), "avg_deal_size should be numeric"
        assert isinstance(velocity["win_rate"], (int, float)), "win_rate should be numeric"
        assert isinstance(velocity["avg_cycle_days"], (int, float)), "avg_cycle_days should be numeric"
        assert isinstance(velocity["open_deals"], int), "open_deals should be integer"
        
        print(f"PASS: velocity = {velocity}")
    
    def test_forecasting_returns_scenarios(self):
        """Test that response contains scenarios with best/expected/worst"""
        response = self.session.get(f"{BASE_URL}/api/analytics/forecasting")
        assert response.status_code == 200
        data = response.json()
        
        assert "scenarios" in data, "Missing scenarios field"
        scenarios = data["scenarios"]
        
        # Check all 3 scenarios exist
        for scenario_name in ["best", "expected", "worst"]:
            assert scenario_name in scenarios, f"Missing scenario: {scenario_name}"
            scenario = scenarios[scenario_name]
            
            # Each scenario should have total, monthly_avg, confidence
            assert "total" in scenario, f"Missing {scenario_name}.total"
            assert "monthly_avg" in scenario, f"Missing {scenario_name}.monthly_avg"
            assert "confidence" in scenario, f"Missing {scenario_name}.confidence"
            
            assert isinstance(scenario["total"], (int, float)), f"{scenario_name}.total should be numeric"
            assert isinstance(scenario["monthly_avg"], (int, float)), f"{scenario_name}.monthly_avg should be numeric"
            assert isinstance(scenario["confidence"], (int, float)), f"{scenario_name}.confidence should be numeric"
        
        print(f"PASS: scenarios = {scenarios}")
    
    def test_forecasting_returns_monthly_forecast(self):
        """Test that response contains monthly_forecast with 6 months"""
        response = self.session.get(f"{BASE_URL}/api/analytics/forecasting")
        assert response.status_code == 200
        data = response.json()
        
        assert "monthly_forecast" in data, "Missing monthly_forecast field"
        monthly_forecast = data["monthly_forecast"]
        
        assert isinstance(monthly_forecast, list), "monthly_forecast should be a list"
        assert len(monthly_forecast) == 6, f"Expected 6 months, got {len(monthly_forecast)}"
        
        # Check each month has required fields
        for i, month in enumerate(monthly_forecast):
            assert "month" in month, f"Missing month field in entry {i}"
            assert "best" in month, f"Missing best field in entry {i}"
            assert "expected" in month, f"Missing expected field in entry {i}"
            assert "worst" in month, f"Missing worst field in entry {i}"
            
            assert isinstance(month["best"], (int, float)), f"best should be numeric in entry {i}"
            assert isinstance(month["expected"], (int, float)), f"expected should be numeric in entry {i}"
            assert isinstance(month["worst"], (int, float)), f"worst should be numeric in entry {i}"
        
        print(f"PASS: monthly_forecast has {len(monthly_forecast)} entries")
        for m in monthly_forecast:
            print(f"  - {m['month']}: best={m['best']}, expected={m['expected']}, worst={m['worst']}")
    
    def test_forecasting_returns_stage_forecast(self):
        """Test that response contains stage_forecast with 4 stages"""
        response = self.session.get(f"{BASE_URL}/api/analytics/forecasting")
        assert response.status_code == 200
        data = response.json()
        
        assert "stage_forecast" in data, "Missing stage_forecast field"
        stage_forecast = data["stage_forecast"]
        
        assert isinstance(stage_forecast, list), "stage_forecast should be a list"
        assert len(stage_forecast) == 4, f"Expected 4 stages, got {len(stage_forecast)}"
        
        expected_stages = ["Lead", "Qualified", "Proposal", "Negotiation"]
        actual_stages = [s["stage"] for s in stage_forecast]
        
        for expected in expected_stages:
            assert expected in actual_stages, f"Missing stage: {expected}"
        
        # Check each stage has required fields
        for stage in stage_forecast:
            assert "stage" in stage, "Missing stage field"
            assert "count" in stage, "Missing count field"
            assert "raw" in stage, "Missing raw field"
            assert "weighted" in stage, "Missing weighted field"
            assert "probability" in stage, "Missing probability field"
        
        print(f"PASS: stage_forecast has {len(stage_forecast)} stages")
        for s in stage_forecast:
            print(f"  - {s['stage']}: count={s['count']}, raw={s['raw']}, weighted={s['weighted']}, prob={s['probability']}%")
    
    def test_forecasting_returns_top_deals(self):
        """Test that response contains top_deals list"""
        response = self.session.get(f"{BASE_URL}/api/analytics/forecasting")
        assert response.status_code == 200
        data = response.json()
        
        assert "top_deals" in data, "Missing top_deals field"
        top_deals = data["top_deals"]
        
        assert isinstance(top_deals, list), "top_deals should be a list"
        
        # If there are deals, check structure
        if len(top_deals) > 0:
            deal = top_deals[0]
            required_fields = ["name", "company", "value", "weighted", "probability", "stage"]
            for field in required_fields:
                assert field in deal, f"Missing {field} in top_deals entry"
            
            print(f"PASS: top_deals has {len(top_deals)} deals")
            for d in top_deals[:5]:
                print(f"  - {d['name']} ({d['company']}): ${d['value']} -> weighted ${d['weighted']}")
        else:
            print("PASS: top_deals is empty (no open deals)")
    
    def test_forecasting_returns_pipeline_trend(self):
        """Test that response contains pipeline_trend field"""
        response = self.session.get(f"{BASE_URL}/api/analytics/forecasting")
        assert response.status_code == 200
        data = response.json()
        
        assert "pipeline_trend" in data, "Missing pipeline_trend field"
        assert isinstance(data["pipeline_trend"], (int, float)), "pipeline_trend should be numeric"
        print(f"PASS: pipeline_trend = {data['pipeline_trend']}%")
    
    def test_forecasting_unauthenticated_returns_401(self):
        """Test that unauthenticated request returns 401"""
        # Create new session without login
        new_session = requests.Session()
        response = new_session.get(f"{BASE_URL}/api/analytics/forecasting")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: Unauthenticated request returns 401")
        new_session.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
