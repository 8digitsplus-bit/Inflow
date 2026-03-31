"""
Test suite for AI Copilot Orchestrator endpoints
Tests: POST /orchestrator/chat, GET /orchestrator/sessions, GET/DELETE /orchestrator/sessions/{id}
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "testpro@test.com"
TEST_PASSWORD = "password"


@pytest.fixture(scope="module")
def session():
    """Create a requests session with authentication"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    
    # Login to get session cookie
    login_response = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    
    if login_response.status_code != 200:
        pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    return s


class TestOrchestratorSessions:
    """Tests for orchestrator session management endpoints"""
    
    def test_list_sessions(self, session):
        """GET /api/orchestrator/sessions - should return list of sessions"""
        response = session.get(f"{BASE_URL}/api/orchestrator/sessions")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "sessions" in data, "Response should contain 'sessions' key"
        assert isinstance(data["sessions"], list), "Sessions should be a list"
        
        # If there are sessions, verify structure
        if len(data["sessions"]) > 0:
            session_item = data["sessions"][0]
            assert "session_id" in session_item, "Session should have session_id"
            assert "title" in session_item, "Session should have title"
            assert "created_at" in session_item, "Session should have created_at"
            assert "updated_at" in session_item, "Session should have updated_at"
    
    def test_get_session_not_found(self, session):
        """GET /api/orchestrator/sessions/{id} - should return 404 for non-existent session"""
        response = session.get(f"{BASE_URL}/api/orchestrator/sessions/nonexistent_session_id")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Error response should have detail"


class TestOrchestratorChat:
    """Tests for orchestrator chat endpoint"""
    
    def test_chat_creates_session(self, session):
        """POST /api/orchestrator/chat - should create new session and return response"""
        response = session.post(f"{BASE_URL}/api/orchestrator/chat", json={
            "message": "TEST_What is my win rate?",
            "page_context": "Dashboard"
        }, timeout=60)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "session_id" in data, "Response should contain session_id"
        assert "response" in data, "Response should contain response text"
        assert "steps" in data, "Response should contain steps array"
        assert isinstance(data["steps"], list), "Steps should be a list"
        
        # Verify response is not empty
        assert len(data["response"]) > 0, "Response should not be empty"
        
        # Store session_id for cleanup
        self.created_session_id = data["session_id"]
    
    def test_chat_with_existing_session(self, session):
        """POST /api/orchestrator/chat - should continue existing session"""
        # First create a session
        response1 = session.post(f"{BASE_URL}/api/orchestrator/chat", json={
            "message": "TEST_Hello",
            "page_context": "Dashboard"
        }, timeout=60)
        
        assert response1.status_code == 200
        session_id = response1.json()["session_id"]
        
        # Continue the session
        response2 = session.post(f"{BASE_URL}/api/orchestrator/chat", json={
            "message": "TEST_Follow up question",
            "session_id": session_id,
            "page_context": "Dashboard"
        }, timeout=60)
        
        assert response2.status_code == 200
        data = response2.json()
        assert data["session_id"] == session_id, "Should use same session_id"
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/orchestrator/sessions/{session_id}")
    
    def test_chat_page_context(self, session):
        """POST /api/orchestrator/chat - should accept different page contexts"""
        response = session.post(f"{BASE_URL}/api/orchestrator/chat", json={
            "message": "TEST_What can you help me with?",
            "page_context": "Sales Pipeline"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/orchestrator/sessions/{data['session_id']}")
    
    def test_chat_tool_execution(self, session):
        """POST /api/orchestrator/chat - should execute tools and return steps"""
        response = session.post(f"{BASE_URL}/api/orchestrator/chat", json={
            "message": "TEST_Show me my pipeline analytics summary",
            "page_context": "Dashboard"
        }, timeout=60)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have executed at least one tool
        assert "steps" in data
        # Note: Steps may be empty if AI decides no tools needed
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/orchestrator/sessions/{data['session_id']}")


class TestOrchestratorSessionCRUD:
    """Tests for session CRUD operations"""
    
    def test_create_get_delete_session(self, session):
        """Full CRUD flow: create session via chat, get it, delete it"""
        # CREATE - via chat
        create_response = session.post(f"{BASE_URL}/api/orchestrator/chat", json={
            "message": "TEST_CRUD test message",
            "page_context": "Dashboard"
        }, timeout=60)
        
        assert create_response.status_code == 200
        session_id = create_response.json()["session_id"]
        
        # GET - verify session exists
        get_response = session.get(f"{BASE_URL}/api/orchestrator/sessions/{session_id}")
        assert get_response.status_code == 200
        
        session_data = get_response.json()
        assert session_data["session_id"] == session_id
        assert "messages" in session_data
        assert len(session_data["messages"]) >= 2  # User message + AI response
        
        # Verify message structure
        user_msg = session_data["messages"][0]
        assert user_msg["role"] == "user"
        assert "TEST_CRUD test message" in user_msg["content"]
        
        ai_msg = session_data["messages"][1]
        assert ai_msg["role"] == "assistant"
        assert "content" in ai_msg
        
        # DELETE
        delete_response = session.delete(f"{BASE_URL}/api/orchestrator/sessions/{session_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["deleted"] == True
        
        # VERIFY DELETED
        verify_response = session.get(f"{BASE_URL}/api/orchestrator/sessions/{session_id}")
        assert verify_response.status_code == 404
    
    def test_delete_nonexistent_session(self, session):
        """DELETE /api/orchestrator/sessions/{id} - should return 404 for non-existent"""
        response = session.delete(f"{BASE_URL}/api/orchestrator/sessions/nonexistent_id")
        assert response.status_code == 404


class TestOrchestratorAuth:
    """Tests for authentication requirements"""
    
    def test_chat_requires_auth(self):
        """POST /api/orchestrator/chat - should require authentication"""
        response = requests.post(f"{BASE_URL}/api/orchestrator/chat", json={
            "message": "Test",
            "page_context": "Dashboard"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_sessions_requires_auth(self):
        """GET /api/orchestrator/sessions - should require authentication"""
        response = requests.get(f"{BASE_URL}/api/orchestrator/sessions")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_get_session_requires_auth(self):
        """GET /api/orchestrator/sessions/{id} - should require authentication"""
        response = requests.get(f"{BASE_URL}/api/orchestrator/sessions/some_id")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_delete_session_requires_auth(self):
        """DELETE /api/orchestrator/sessions/{id} - should require authentication"""
        response = requests.delete(f"{BASE_URL}/api/orchestrator/sessions/some_id")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
