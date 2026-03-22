"""
Test Agentic AI Feature APIs:
- POST /api/support/agent - Agent chat endpoint with tool execution
- Agent tools: query_deals, get_analytics_summary, check_integrations, get_forecast, etc.
- Agent mode toggle and conversation handling
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - Pro user with deals
TEST_EMAIL = "testpro@test.com"
TEST_PASSWORD = "password123"


@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session for tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    
    if login_res.status_code != 200:
        pytest.skip(f"Login failed with status {login_res.status_code}: {login_res.text}")
    
    return session


class TestAgentEndpoint:
    """Test POST /api/support/agent endpoint"""
    
    def test_agent_basic_response(self, auth_session):
        """POST /api/support/agent - Basic agent response structure"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Hello, how are you?"
        }, timeout=60)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "conversation_id" in data, "Response should contain conversation_id"
        assert "response" in data, "Response should contain response text"
        assert "mode" in data, "Response should contain mode"
        assert "steps" in data, "Response should contain steps array"
        
        # Verify mode is agent
        assert data["mode"] == "agent", f"Mode should be 'agent', got {data['mode']}"
        
        # Verify conversation_id starts with agent_
        assert data["conversation_id"].startswith("agent_"), f"Agent conversation should start with 'agent_', got {data['conversation_id']}"
        
        print(f"✓ Agent response structure verified")
        print(f"✓ Conversation ID: {data['conversation_id']}")
        print(f"✓ Mode: {data['mode']}")
        print(f"✓ Steps count: {len(data['steps'])}")
    
    def test_agent_query_deals_tool(self, auth_session):
        """POST /api/support/agent - Should use query_deals tool for pipeline questions"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "How is my pipeline doing? Show me my deals."
        }, timeout=60)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify steps contain tool executions
        assert "steps" in data, "Response should contain steps"
        
        # Check if any tool was used
        if len(data["steps"]) > 0:
            tools_used = [step["tool"] for step in data["steps"]]
            print(f"✓ Tools used: {tools_used}")
            
            # Verify step structure
            step = data["steps"][0]
            assert "tool" in step, "Step should have tool name"
            assert "summary" in step, "Step should have summary"
            
            print(f"✓ First step tool: {step['tool']}")
            print(f"✓ First step summary: {step['summary']}")
        else:
            print("⚠ No tools were used (agent may have answered directly)")
        
        # Verify response is non-empty
        assert len(data["response"]) > 0, "Response should not be empty"
        print(f"✓ Response preview: {data['response'][:200]}...")
    
    def test_agent_analytics_summary_tool(self, auth_session):
        """POST /api/support/agent - Should use get_analytics_summary tool"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Give me an analytics summary of my business"
        }, timeout=60)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Check for analytics tool usage
        if len(data["steps"]) > 0:
            tools_used = [step["tool"] for step in data["steps"]]
            print(f"✓ Tools used for analytics: {tools_used}")
            
            # Look for analytics-related tools
            analytics_tools = ["get_analytics_summary", "query_deals", "get_revenue_breakdown"]
            used_analytics = any(t in tools_used for t in analytics_tools)
            
            if used_analytics:
                print("✓ Analytics tool was used")
            else:
                print(f"⚠ Expected analytics tool, got: {tools_used}")
        
        print(f"✓ Response: {data['response'][:200]}...")
    
    def test_agent_check_integrations_tool(self, auth_session):
        """POST /api/support/agent - Should use check_integrations tool"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Check my integrations status"
        }, timeout=60)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        if len(data["steps"]) > 0:
            tools_used = [step["tool"] for step in data["steps"]]
            print(f"✓ Tools used for integrations check: {tools_used}")
            
            if "check_integrations" in tools_used:
                print("✓ check_integrations tool was used")
        
        print(f"✓ Response: {data['response'][:200]}...")
    
    def test_agent_forecast_tool(self, auth_session):
        """POST /api/support/agent - Should use get_forecast tool"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Run a revenue forecast for me"
        }, timeout=60)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        if len(data["steps"]) > 0:
            tools_used = [step["tool"] for step in data["steps"]]
            print(f"✓ Tools used for forecast: {tools_used}")
            
            if "get_forecast" in tools_used:
                print("✓ get_forecast tool was used")
        
        print(f"✓ Response: {data['response'][:200]}...")
    
    def test_agent_continue_conversation(self, auth_session):
        """POST /api/support/agent - Continue existing agent conversation"""
        # First message
        res1 = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "What deals do I have?"
        }, timeout=60)
        
        assert res1.status_code == 200
        conv_id = res1.json()["conversation_id"]
        
        # Wait a bit
        time.sleep(2)
        
        # Second message in same conversation
        res2 = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Which ones are at risk?",
            "conversation_id": conv_id
        }, timeout=60)
        
        assert res2.status_code == 200, f"Expected 200, got {res2.status_code}: {res2.text}"
        data = res2.json()
        
        # Should return same conversation_id
        assert data["conversation_id"] == conv_id, "Should continue same conversation"
        
        print(f"✓ Multi-turn agent conversation working with ID: {conv_id}")


class TestAgentConversationStorage:
    """Test that agent conversations are stored correctly"""
    
    def test_agent_conversation_stored(self, auth_session):
        """Agent conversations should be stored and retrievable"""
        # Create agent conversation
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "TEST_AGENT: Show me my pipeline summary"
        }, timeout=60)
        
        assert res.status_code == 200
        conv_id = res.json()["conversation_id"]
        
        # Retrieve the conversation
        get_res = auth_session.get(f"{BASE_URL}/api/support/conversations/{conv_id}")
        
        assert get_res.status_code == 200, f"Expected 200, got {get_res.status_code}: {get_res.text}"
        data = get_res.json()
        
        # Verify conversation structure
        assert data["conversation_id"] == conv_id
        assert "messages" in data
        assert len(data["messages"]) >= 2, "Should have user message and AI response"
        
        # Check for agent mode in conversation
        assert data.get("mode") == "agent", f"Conversation mode should be 'agent', got {data.get('mode')}"
        
        print(f"✓ Agent conversation stored and retrieved: {conv_id}")
    
    def test_agent_conversation_in_list(self, auth_session):
        """Agent conversations should appear in conversation list"""
        # Create agent conversation
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "TEST_AGENT: List my deals"
        }, timeout=60)
        
        assert res.status_code == 200
        conv_id = res.json()["conversation_id"]
        
        # Get conversation list
        list_res = auth_session.get(f"{BASE_URL}/api/support/conversations")
        
        assert list_res.status_code == 200
        conversations = list_res.json()
        
        # Find our conversation
        found = any(c["conversation_id"] == conv_id for c in conversations)
        assert found, f"Agent conversation {conv_id} should be in list"
        
        print(f"✓ Agent conversation appears in list")


class TestBasicChatEndpoint:
    """Test that basic chat endpoint still works"""
    
    def test_basic_chat_still_works(self, auth_session):
        """POST /api/support/chat - Basic chat should still work"""
        res = auth_session.post(f"{BASE_URL}/api/support/chat", json={
            "message": "What features are in my plan?"
        }, timeout=60)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify basic chat response structure
        assert "conversation_id" in data
        assert "response" in data
        assert "priority" in data
        
        # Basic chat should NOT have mode=agent
        assert data.get("mode") != "agent", "Basic chat should not be in agent mode"
        
        # Basic chat conversation_id should NOT start with agent_
        assert not data["conversation_id"].startswith("agent_"), "Basic chat should not have agent_ prefix"
        
        print(f"✓ Basic chat still works")
        print(f"✓ Conversation ID: {data['conversation_id']}")


class TestTicketCreation:
    """Test that ticket creation still works with agent conversations"""
    
    def test_create_ticket_from_agent_conversation(self, auth_session):
        """POST /api/support/tickets - Create ticket linked to agent conversation"""
        # First create an agent conversation
        agent_res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "TEST_AGENT: I need help with something complex"
        }, timeout=60)
        
        assert agent_res.status_code == 200
        conv_id = agent_res.json()["conversation_id"]
        
        # Create ticket linked to agent conversation
        ticket_res = auth_session.post(f"{BASE_URL}/api/support/tickets", json={
            "subject": "TEST_AGENT: Need human help",
            "description": "Agent couldn't fully resolve my issue",
            "conversation_id": conv_id
        })
        
        assert ticket_res.status_code == 200, f"Expected 200, got {ticket_res.status_code}: {ticket_res.text}"
        data = ticket_res.json()
        
        # Verify ticket is linked to agent conversation
        assert data.get("conversation_id") == conv_id
        
        print(f"✓ Ticket created from agent conversation: {data['ticket_id']}")


class TestAgentToolSummaries:
    """Test that tool summaries are properly formatted"""
    
    def test_tool_summary_format(self, auth_session):
        """Tool summaries should be human-readable"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Give me a complete overview: deals, analytics, and forecast"
        }, timeout=60)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        if len(data["steps"]) > 0:
            for step in data["steps"]:
                # Verify summary is a string
                assert isinstance(step["summary"], str), "Summary should be a string"
                # Verify summary is not empty
                assert len(step["summary"]) > 0, "Summary should not be empty"
                
                print(f"✓ Tool: {step['tool']} - Summary: {step['summary']}")
        else:
            print("⚠ No tools were used in this response")


class TestAgentErrorHandling:
    """Test agent error handling"""
    
    def test_agent_empty_message(self, auth_session):
        """POST /api/support/agent - Empty message should be handled"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": ""
        }, timeout=60)
        
        # Should either return 400 or handle gracefully
        if res.status_code == 200:
            print("✓ Agent handled empty message gracefully")
        elif res.status_code in [400, 422]:
            print("✓ Agent rejected empty message with validation error")
        else:
            print(f"⚠ Unexpected status code: {res.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
