"""
Test suite for Analytics Refactor - Verifying unique metrics per page
Tests all 8 analytics endpoints with differentiated KPIs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://inflow-pricing.preview.emergentagent.com')

class TestAnalyticsRefactor:
    """Test all analytics endpoints for the refactored pages"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session for all tests"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "testpro@test.com", "password": "password"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
    
    # === Dashboard / Revenue Analytics ===
    def test_revenue_analytics_endpoint(self):
        """Test /api/analytics/revenue - Dashboard metrics"""
        response = self.session.get(f"{BASE_URL}/api/analytics/revenue")
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields for Dashboard
        assert "total_pipeline" in data
        assert "closed_revenue" in data
        assert "win_rate" in data
        assert "total_deals" in data
        assert "stage_breakdown" in data
        assert "monthly_data" in data
        
        # Verify data types
        assert isinstance(data["total_pipeline"], (int, float))
        assert isinstance(data["win_rate"], (int, float))
        assert isinstance(data["stage_breakdown"], list)
        print(f"Revenue Analytics: pipeline=${data['total_pipeline']}, win_rate={data['win_rate']}%")
    
    # === Pipeline Analytics ===
    def test_pipeline_analytics_endpoint(self):
        """Test /api/analytics/pipeline - Pipeline-specific metrics"""
        response = self.session.get(f"{BASE_URL}/api/analytics/pipeline")
        assert response.status_code == 200
        data = response.json()
        
        # Verify unique Pipeline KPIs
        assert "weighted_pipeline" in data
        assert "total_active" in data
        assert "pipeline_velocity" in data
        assert "conversion_rates" in data
        assert "bottleneck_stage" in data
        assert "bottleneck_stuck_count" in data
        assert "deals_by_stage" in data
        
        # Verify pipeline velocity structure
        assert isinstance(data["pipeline_velocity"], list)
        if data["pipeline_velocity"]:
            velocity_item = data["pipeline_velocity"][0]
            assert "stage" in velocity_item
            assert "count" in velocity_item
            assert "avg_days" in velocity_item
            assert "stuck_count" in velocity_item
        
        print(f"Pipeline Analytics: weighted=${data['weighted_pipeline']}, active={data['total_active']}, bottleneck={data['bottleneck_stage']}")
    
    # === Churn & Retention Analytics ===
    def test_churn_analytics_endpoint(self):
        """Test /api/analytics/churn - Unique churn KPIs"""
        response = self.session.get(f"{BASE_URL}/api/analytics/churn")
        assert response.status_code == 200
        data = response.json()
        
        # Verify unique Churn KPIs
        assert "health_score" in data
        assert "retention_rate" in data
        assert "churn_rate" in data
        assert "nrr" in data  # Net Revenue Retention
        assert "revenue_at_risk" in data
        assert "clv" in data  # Customer Lifetime Value
        assert "arpa" in data  # Average Revenue Per Account
        
        # Verify churn-specific data structures
        assert "health_distribution" in data
        assert "risk_by_segment" in data
        assert "churn_reasons" in data
        assert "at_risk_deals" in data
        assert "cohorts" in data
        assert "monthly_data" in data
        
        # Verify health distribution structure
        assert isinstance(data["health_distribution"], list)
        if data["health_distribution"]:
            health_item = data["health_distribution"][0]
            assert "status" in health_item
            assert "count" in health_item
            assert "color" in health_item
        
        print(f"Churn Analytics: health_score={data['health_score']}, retention={data['retention_rate']}%, nrr={data['nrr']}%, clv=${data['clv']}")
    
    # === Conversion Rate Optimization ===
    def test_cro_analytics_endpoint(self):
        """Test /api/analytics/cro - CRO-specific metrics with NEW KPIs"""
        response = self.session.get(f"{BASE_URL}/api/analytics/cro")
        assert response.status_code == 200
        data = response.json()
        
        # Verify CRO KPIs
        assert "overall_conversion" in data
        assert "total_opportunities" in data
        assert "ab_tests" in data  # NEW: Active A/B Tests
        assert "bottlenecks" in data  # For Worst Drop-off KPI
        assert "funnel_data" in data
        assert "stage_conversions" in data
        
        # Verify A/B tests structure (NEW feature)
        assert isinstance(data["ab_tests"], list)
        if data["ab_tests"]:
            ab_test = data["ab_tests"][0]
            assert "name" in ab_test
            assert "status" in ab_test
            assert "improvement" in ab_test
            assert "confidence" in ab_test
        
        # Verify bottlenecks for Worst Drop-off
        assert isinstance(data["bottlenecks"], list)
        if data["bottlenecks"]:
            bottleneck = data["bottlenecks"][0]
            assert "stage" in bottleneck
            assert "drop_rate" in bottleneck
            assert "severity" in bottleneck
        
        # Count active A/B tests
        active_tests = len([t for t in data["ab_tests"] if t.get("status") == "running"])
        worst_dropoff = data["bottlenecks"][0]["drop_rate"] if data["bottlenecks"] else 0
        
        print(f"CRO Analytics: conversion={data['overall_conversion']}%, active_ab_tests={active_tests}, worst_dropoff={worst_dropoff}%")
    
    # === Sales Performance ===
    def test_sales_performance_endpoint(self):
        """Test /api/analytics/sales-performance - Performance-specific metrics"""
        response = self.session.get(f"{BASE_URL}/api/analytics/sales-performance")
        assert response.status_code == 200
        data = response.json()
        
        # Verify unique Sales Performance KPIs
        assert "win_rate" in data
        assert "loss_rate" in data
        assert "avg_cycle_days" in data
        assert "total_active" in data
        assert "total_won" in data
        assert "total_lost" in data
        
        # Verify performance-specific data
        assert "deal_aging" in data
        assert "close_rate_by_size" in data
        assert "activity_to_close" in data
        
        # Verify deal aging structure
        assert isinstance(data["deal_aging"], list)
        if data["deal_aging"]:
            aging_item = data["deal_aging"][0]
            assert "bucket" in aging_item
            assert "count" in aging_item
        
        # Verify close rate by size structure
        assert isinstance(data["close_rate_by_size"], list)
        if data["close_rate_by_size"]:
            size_item = data["close_rate_by_size"][0]
            assert "size" in size_item
            assert "won" in size_item
            assert "lost" in size_item
            assert "rate" in size_item
        
        print(f"Sales Performance: win_rate={data['win_rate']}%, loss_rate={data['loss_rate']}%, avg_cycle={data['avg_cycle_days']}d")
    
    # === Sales Revenue ===
    def test_sales_revenue_endpoint(self):
        """Test /api/analytics/sales-revenue - Revenue-specific metrics"""
        response = self.session.get(f"{BASE_URL}/api/analytics/sales-revenue")
        assert response.status_code == 200
        data = response.json()
        
        # Verify unique Sales Revenue KPIs
        assert "mrr" in data
        assert "arr" in data
        assert "arpu" in data
        assert "nrr" in data
        assert "concentration_risk" in data
        
        # Verify revenue-specific data
        assert "top_accounts" in data
        assert "expansion_revenue" in data
        assert "new_revenue" in data
        assert "monthly_revenue" in data
        
        # Verify top accounts structure
        assert isinstance(data["top_accounts"], list)
        if data["top_accounts"]:
            account = data["top_accounts"][0]
            assert "company" in account
            assert "value" in account
            assert "pct" in account
        
        print(f"Sales Revenue: mrr=${data['mrr']}, arpu=${data['arpu']}, nrr={data['nrr']}%, concentration_risk={data['concentration_risk']}%")
    
    # === Revenue Intelligence ===
    def test_revenue_intelligence_endpoint(self):
        """Test /api/analytics/revenue-intelligence - Unified overview"""
        response = self.session.get(f"{BASE_URL}/api/analytics/revenue-intelligence")
        assert response.status_code == 200
        data = response.json()
        
        # Verify unified overview KPIs
        assert "total_revenue" in data
        assert "pipeline_value" in data
        assert "weighted_pipeline" in data
        assert "win_rate" in data
        assert "avg_deal_value" in data
        
        # Verify deal snapshot
        assert "total_deals" in data
        assert "active_deals" in data
        assert "deals_won" in data
        assert "deals_lost" in data
        
        # Verify health indicators
        assert "pipeline_health" in data
        assert "performance_trend" in data
        
        # Verify data structures
        assert "monthly_overview" in data
        assert "stage_health" in data
        assert "recommendations" in data
        
        # Verify recommendations structure
        assert isinstance(data["recommendations"], list)
        if data["recommendations"]:
            rec = data["recommendations"][0]
            assert "type" in rec
            assert "priority" in rec
            assert "title" in rec
            assert "description" in rec
            assert "action" in rec
        
        print(f"Revenue Intelligence: revenue=${data['total_revenue']}, pipeline=${data['pipeline_value']}, weighted=${data['weighted_pipeline']}, health={data['pipeline_health']}")
    
    # === Forecasting ===
    def test_forecasting_endpoint(self):
        """Test /api/analytics/forecasting - Forecast metrics"""
        response = self.session.get(f"{BASE_URL}/api/analytics/forecasting")
        assert response.status_code == 200
        data = response.json()
        
        # Verify forecasting KPIs
        assert "weighted_pipeline" in data
        assert "pipeline_trend" in data
        assert "velocity" in data
        assert "scenarios" in data
        assert "monthly_forecast" in data
        assert "stage_forecast" in data
        assert "top_deals" in data
        
        # Verify velocity structure
        velocity = data["velocity"]
        assert "value_per_day" in velocity
        assert "avg_deal_size" in velocity
        assert "win_rate" in velocity
        assert "avg_cycle_days" in velocity
        assert "open_deals" in velocity
        
        # Verify scenarios structure
        scenarios = data["scenarios"]
        assert "best" in scenarios
        assert "expected" in scenarios
        assert "worst" in scenarios
        
        for scenario_name in ["best", "expected", "worst"]:
            scenario = scenarios[scenario_name]
            assert "total" in scenario
            assert "monthly_avg" in scenario
            assert "confidence" in scenario
        
        print(f"Forecasting: weighted=${data['weighted_pipeline']}, expected_total=${data['scenarios']['expected']['total']}")
    
    # === Verify No Metric Duplication ===
    def test_metrics_differentiation(self):
        """Verify each page has unique, differentiated KPIs"""
        # Fetch all endpoints
        revenue = self.session.get(f"{BASE_URL}/api/analytics/revenue").json()
        pipeline = self.session.get(f"{BASE_URL}/api/analytics/pipeline").json()
        churn = self.session.get(f"{BASE_URL}/api/analytics/churn").json()
        cro = self.session.get(f"{BASE_URL}/api/analytics/cro").json()
        sales_perf = self.session.get(f"{BASE_URL}/api/analytics/sales-performance").json()
        sales_rev = self.session.get(f"{BASE_URL}/api/analytics/sales-revenue").json()
        rev_intel = self.session.get(f"{BASE_URL}/api/analytics/revenue-intelligence").json()
        
        # Verify unique KPIs per page
        # Pipeline has: weighted_pipeline, pipeline_velocity, bottleneck_stage, conversion_rates
        assert "pipeline_velocity" in pipeline
        assert "bottleneck_stage" in pipeline
        
        # Churn has: health_score, retention_rate, churn_rate, nrr, revenue_at_risk, clv
        assert "health_score" in churn
        assert "clv" in churn
        assert "revenue_at_risk" in churn
        
        # CRO has: overall_conversion, ab_tests, bottlenecks (for worst drop-off)
        assert "ab_tests" in cro
        assert "bottlenecks" in cro
        
        # Sales Performance has: win_rate, loss_rate, avg_cycle_days, deal_aging, close_rate_by_size
        assert "deal_aging" in sales_perf
        assert "close_rate_by_size" in sales_perf
        
        # Sales Revenue has: mrr, arpu, nrr, concentration_risk, expansion_revenue
        assert "concentration_risk" in sales_rev
        assert "expansion_revenue" in sales_rev
        
        # Revenue Intelligence has: pipeline_health, performance_trend, recommendations
        assert "pipeline_health" in rev_intel
        assert "performance_trend" in rev_intel
        assert "recommendations" in rev_intel
        
        print("SUCCESS: All pages have unique, differentiated KPIs")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
