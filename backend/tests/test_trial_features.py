"""
Test 14-Day Free Trial Features
- User registration creates trial tier with trial_start/trial_end
- GET /api/auth/me returns trial_days_left for trial users
- Trial tier gating works correctly
"""
import pytest
import requests
import os
import time
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if BASE_URL:
    BASE_URL = BASE_URL.rstrip('/')


class TestTrialUserRegistration:
    """Test that new users are created with trial subscription tier"""
    
    def test_register_creates_trial_user(self):
        """POST /api/auth/register should create user with subscription_tier='trial'"""
        timestamp = int(time.time())
        test_email = f"trial_test_{timestamp}@test.com"
        
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "test123",
            "name": "Trial Test User"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        # Verify subscription tier is 'trial'
        assert data.get("subscription_tier") == "trial", f"Expected 'trial' tier, got '{data.get('subscription_tier')}'"
        # Verify trial_start is set
        assert data.get("trial_start") is not None, "trial_start should be set"
        # Verify trial_end is set
        assert data.get("trial_end") is not None, "trial_end should be set"
        # Verify user_id is set
        assert data.get("user_id") is not None, "user_id should be set"
        
        print(f"✅ User registered with trial tier: {test_email}")
        print(f"   - subscription_tier: {data.get('subscription_tier')}")
        print(f"   - trial_start: {data.get('trial_start')}")
        print(f"   - trial_end: {data.get('trial_end')}")
    
    def test_register_trial_period_is_14_days(self):
        """POST /api/auth/register should set trial_end 14 days from now"""
        timestamp = int(time.time())
        test_email = f"trial_14day_{timestamp}@test.com"
        
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "test123",
            "name": "Trial 14 Day Test"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        trial_start = data.get("trial_start")
        trial_end = data.get("trial_end")
        
        assert trial_start is not None
        assert trial_end is not None
        
        # Parse dates and check difference
        start_dt = datetime.fromisoformat(trial_start.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(trial_end.replace("Z", "+00:00"))
        
        diff_days = (end_dt - start_dt).days
        assert diff_days == 14, f"Trial period should be 14 days, got {diff_days}"
        
        print(f"✅ Trial period is 14 days")


class TestAuthMeTrialDaysLeft:
    """Test GET /api/auth/me returns trial_days_left for trial users"""
    
    @pytest.fixture
    def trial_user_session(self):
        """Create a new trial user and return session"""
        import random
        timestamp = int(time.time())
        rand = random.randint(1000, 9999)
        test_email = f"trial_me_test_{timestamp}_{rand}@test.com"
        
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "test123",
            "name": "Trial Me Test"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        return session
    
    def test_auth_me_returns_trial_days_left(self, trial_user_session):
        """GET /api/auth/me should return trial_days_left field for trial users"""
        response = trial_user_session.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200, f"GET /api/auth/me failed: {response.text}"
        
        data = response.json()
        
        # Verify trial_days_left is present
        assert "trial_days_left" in data, "trial_days_left field should be present for trial users"
        
        # Verify trial_days_left is reasonable (should be around 14 for fresh users)
        days_left = data.get("trial_days_left")
        assert isinstance(days_left, int), f"trial_days_left should be int, got {type(days_left)}"
        assert 13 <= days_left <= 14, f"New user should have 13-14 trial days left, got {days_left}"
        
        print(f"✅ GET /api/auth/me returns trial_days_left: {days_left}")
    
    def test_auth_me_returns_subscription_tier_trial(self, trial_user_session):
        """GET /api/auth/me should return subscription_tier='trial' for trial users"""
        response = trial_user_session.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("subscription_tier") == "trial", f"Expected 'trial', got '{data.get('subscription_tier')}'"
        print(f"✅ subscription_tier is 'trial'")


class TestExistingTestUser:
    """Test existing test user (biztest@test.com) has trial tier"""
    
    def test_login_existing_test_user(self):
        """Login with biztest@test.com should work and show trial tier"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "biztest@test.com",
            "password": "test123"
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        tier = data.get("subscription_tier")
        print(f"biztest@test.com subscription_tier: {tier}")
        
        # This user should have been migrated to trial
        assert tier == "trial", f"Expected 'trial' tier for migrated user, got '{tier}'"
    
    def test_auth_me_existing_test_user(self):
        """GET /api/auth/me for biztest@test.com should return trial_days_left"""
        session = requests.Session()
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "biztest@test.com",
            "password": "test123"
        })
        
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        me_response = session.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200, f"GET /api/auth/me failed: {me_response.text}"
        
        data = me_response.json()
        
        # Verify fields exist
        assert "trial_days_left" in data, "trial_days_left should be present"
        assert data.get("subscription_tier") == "trial", f"Expected 'trial', got '{data.get('subscription_tier')}'"
        
        print(f"✅ biztest@test.com trial_days_left: {data.get('trial_days_left')}")


class TestGoogleAuthTrialUser:
    """Test that Google auth creates trial users with proper fields"""
    
    def test_google_session_creates_trial_user(self):
        """New Google auth user should get trial tier (indirect test via session endpoint)"""
        # Note: We can't fully test Google auth without a valid session_id
        # But we can verify the endpoint exists
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/session", json={
            "session_id": "invalid_test_session"
        })
        
        # Should return 401 for invalid session (not 500)
        assert response.status_code == 401, f"Expected 401 for invalid session, got {response.status_code}"
        print("✅ /api/auth/session endpoint exists and validates session_id")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
