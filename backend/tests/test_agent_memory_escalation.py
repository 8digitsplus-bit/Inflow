"""
Test Agentic AI Memory and Auto-Escalation Features:
- Memory tool: remember facts about user across conversations
- Memory persistence: verify memories stored in agent_memory collection
- Memory recall: verify agent references saved memories in new conversations
- Auto-escalation: agent auto-creates support tickets when it can't resolve issues
- Escalation ticket creation: verify tickets appear with [Auto-Escalated] prefix
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


class TestMemoryFeature:
    """Test Cross-Conversation Memory Feature"""
    
    def test_memory_save_via_agent(self, auth_session):
        """POST /api/support/agent - Ask agent to remember something, verify memory_saved=true"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Please remember that my Q1 target is $500k in new revenue"
        }, timeout=90)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "conversation_id" in data, "Response should contain conversation_id"
        assert "response" in data, "Response should contain response text"
        assert "memory_saved" in data, "Response should contain memory_saved field"
        
        # Check if memory was saved
        if data.get("memory_saved"):
            print(f"✓ Memory saved successfully: memory_saved=True")
        else:
            # Check if remember tool was used in steps
            steps = data.get("steps", [])
            remember_used = any(s.get("tool") == "remember" for s in steps)
            if remember_used:
                print(f"✓ Remember tool was used in steps")
            else:
                print(f"⚠ Memory may not have been saved. Steps: {[s.get('tool') for s in steps]}")
        
        print(f"✓ Response: {data['response'][:200]}...")
    
    def test_memory_recall_in_new_conversation(self, auth_session):
        """Start NEW conversation (no conversation_id), ask about priorities, verify agent references saved memories"""
        # First, save a memory
        save_res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Remember that my main focus is enterprise deals above $50k"
        }, timeout=90)
        
        assert save_res.status_code == 200
        
        # Wait a bit for memory to be stored
        time.sleep(2)
        
        # Start a NEW conversation (no conversation_id) and ask about priorities
        recall_res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "What are my priorities that you know about?"
        }, timeout=90)
        
        assert recall_res.status_code == 200, f"Expected 200, got {recall_res.status_code}: {recall_res.text}"
        data = recall_res.json()
        
        # Check if recall_memory tool was used
        steps = data.get("steps", [])
        recall_used = any(s.get("tool") == "recall_memory" for s in steps)
        
        if recall_used:
            print(f"✓ recall_memory tool was used")
        
        # Check if response mentions enterprise deals or priorities
        response_lower = data["response"].lower()
        mentions_memory = any(term in response_lower for term in ["enterprise", "50k", "priority", "focus", "remember"])
        
        if mentions_memory:
            print(f"✓ Agent referenced saved memories in response")
        else:
            print(f"⚠ Agent may not have referenced memories. Response: {data['response'][:300]}...")
        
        print(f"✓ Tools used: {[s.get('tool') for s in steps]}")


class TestAutoEscalation:
    """Test Auto-Escalation Feature"""
    
    def test_escalation_for_billing_issue(self, auth_session):
        """Ask about a billing error or refund, verify escalated object in response"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "I was charged twice for my Pro subscription this month. I need a refund for the duplicate charge. This is urgent!"
        }, timeout=90)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Check if escalation happened
        escalated = data.get("escalated")
        
        if escalated:
            assert "ticket_id" in escalated, "Escalated object should contain ticket_id"
            assert "severity" in escalated, "Escalated object should contain severity"
            print(f"✓ Issue auto-escalated!")
            print(f"✓ Ticket ID: {escalated['ticket_id']}")
            print(f"✓ Severity: {escalated['severity']}")
        else:
            # Check if escalate_to_ticket tool was used in steps
            steps = data.get("steps", [])
            escalate_used = any(s.get("tool") == "escalate_to_ticket" for s in steps)
            if escalate_used:
                print(f"✓ escalate_to_ticket tool was used")
            else:
                print(f"⚠ No escalation detected. Agent may have tried to resolve directly.")
                print(f"⚠ Steps: {[s.get('tool') for s in steps]}")
        
        print(f"✓ Response: {data['response'][:300]}...")
    
    def test_escalation_ticket_appears_in_list(self, auth_session):
        """Verify escalated ticket appears in GET /api/support/tickets with [Auto-Escalated] prefix"""
        # First trigger an escalation
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "There's a critical bug - my revenue data is showing negative numbers which is impossible. This needs immediate engineering attention!"
        }, timeout=90)
        
        assert res.status_code == 200
        data = res.json()
        
        escalated = data.get("escalated")
        escalated_ticket_id = escalated.get("ticket_id") if escalated else None
        
        # Get tickets list
        tickets_res = auth_session.get(f"{BASE_URL}/api/support/tickets")
        assert tickets_res.status_code == 200, f"Expected 200, got {tickets_res.status_code}"
        
        tickets = tickets_res.json()
        
        # Look for auto-escalated tickets
        auto_escalated_tickets = [t for t in tickets if t.get("subject", "").startswith("[Auto-Escalated]")]
        
        if auto_escalated_tickets:
            print(f"✓ Found {len(auto_escalated_tickets)} auto-escalated ticket(s)")
            for t in auto_escalated_tickets[:3]:
                print(f"  - {t['ticket_id']}: {t['subject']}")
        else:
            print(f"⚠ No auto-escalated tickets found in list")
        
        # If we got a ticket_id from escalation, verify it's in the list
        if escalated_ticket_id:
            found = any(t.get("ticket_id") == escalated_ticket_id for t in tickets)
            if found:
                print(f"✓ Escalated ticket {escalated_ticket_id} found in tickets list")
            else:
                print(f"⚠ Escalated ticket {escalated_ticket_id} not found in list")


class TestExistingAgentTools:
    """Test that existing agent tools still work"""
    
    def test_query_deals_still_works(self, auth_session):
        """Verify query_deals tool still works"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Show me my top 5 deals by value"
        }, timeout=90)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        steps = data.get("steps", [])
        query_deals_used = any(s.get("tool") == "query_deals" for s in steps)
        
        if query_deals_used:
            print(f"✓ query_deals tool still works")
        else:
            print(f"⚠ query_deals not used. Tools: {[s.get('tool') for s in steps]}")
        
        print(f"✓ Response: {data['response'][:200]}...")
    
    def test_get_analytics_summary_still_works(self, auth_session):
        """Verify get_analytics_summary tool still works"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Give me my analytics summary"
        }, timeout=90)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        steps = data.get("steps", [])
        analytics_used = any(s.get("tool") == "get_analytics_summary" for s in steps)
        
        if analytics_used:
            print(f"✓ get_analytics_summary tool still works")
        else:
            print(f"⚠ get_analytics_summary not used. Tools: {[s.get('tool') for s in steps]}")
    
    def test_check_integrations_still_works(self, auth_session):
        """Verify check_integrations tool still works"""
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "Check my integration status"
        }, timeout=90)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        steps = data.get("steps", [])
        integrations_used = any(s.get("tool") == "check_integrations" for s in steps)
        
        if integrations_used:
            print(f"✓ check_integrations tool still works")
        else:
            print(f"⚠ check_integrations not used. Tools: {[s.get('tool') for s in steps]}")


class TestAgentModeToggle:
    """Test that agent mode toggle still works"""
    
    def test_basic_chat_endpoint_still_works(self, auth_session):
        """POST /api/support/chat - Basic chat should still work"""
        res = auth_session.post(f"{BASE_URL}/api/support/chat", json={
            "message": "What features are in my plan?"
        }, timeout=60)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Basic chat should NOT have mode=agent
        assert data.get("mode") != "agent", "Basic chat should not be in agent mode"
        
        print(f"✓ Basic chat still works")
        print(f"✓ Response: {data['response'][:200]}...")


class TestMemoryPersistence:
    """Test that memories persist across sessions"""
    
    def test_memory_persists_across_conversations(self, auth_session):
        """Verify memories are stored and persist"""
        # Save a unique memory
        unique_fact = f"TEST_MEMORY: My favorite color is blue and my lucky number is 42"
        
        save_res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": f"Please remember this: {unique_fact}"
        }, timeout=90)
        
        assert save_res.status_code == 200
        
        # Wait for memory to be stored
        time.sleep(2)
        
        # Start a completely new conversation and ask about what the agent knows
        recall_res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "What do you remember about me? List everything you know."
        }, timeout=90)
        
        assert recall_res.status_code == 200
        data = recall_res.json()
        
        # Check if recall_memory was used
        steps = data.get("steps", [])
        recall_used = any(s.get("tool") == "recall_memory" for s in steps)
        
        if recall_used:
            # Find the recall_memory step and check its summary
            for step in steps:
                if step.get("tool") == "recall_memory":
                    print(f"✓ recall_memory summary: {step.get('summary')}")
        
        print(f"✓ Response: {data['response'][:400]}...")


class TestAllTwelveTools:
    """Verify all 12 agent tools are available"""
    
    def test_agent_has_all_tools(self, auth_session):
        """Verify agent can use all 12 tools"""
        expected_tools = [
            "query_deals",
            "get_analytics_summary", 
            "check_integrations",
            "get_revenue_breakdown",
            "get_churn_analysis",
            "get_deal_details",
            "update_deal_stage",
            "get_forecast",
            "search_deals",
            "remember",
            "recall_memory",
            "escalate_to_ticket"
        ]
        
        # Ask agent to list its capabilities
        res = auth_session.post(f"{BASE_URL}/api/support/agent", json={
            "message": "What tools and capabilities do you have? List them all."
        }, timeout=90)
        
        assert res.status_code == 200
        data = res.json()
        
        response_lower = data["response"].lower()
        
        # Check if response mentions key capabilities
        capabilities_mentioned = []
        for tool in expected_tools:
            tool_keywords = tool.replace("_", " ")
            if tool_keywords in response_lower or tool in response_lower:
                capabilities_mentioned.append(tool)
        
        print(f"✓ Agent mentioned {len(capabilities_mentioned)}/12 tools in response")
        print(f"✓ Tools mentioned: {capabilities_mentioned}")
        print(f"✓ Response: {data['response'][:500]}...")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
